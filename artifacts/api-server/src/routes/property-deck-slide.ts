/**
 * property-deck-slide.ts
 *
 * Per-slide endpoints for the LB investor deck. Lets the admin "LB Slides"
 * detail page treat each of the six slides independently:
 *
 *   GET  /api/admin/properties/:id/deck-token            — mint an HMAC token
 *                                                          so the admin page
 *                                                          can fetch the
 *                                                          deck-payload and
 *                                                          live-render mini
 *                                                          slides in-page.
 *
 *   GET  /api/properties/:id/deck/slide/:n.pdf           — render ONLY slide N
 *                                                          as a 1-page PDF via
 *                                                          Playwright. No cache
 *                                                          (cheap enough; we
 *                                                          can add per-slide
 *                                                          caching later).
 *
 *   POST /api/properties/:id/deck/slide/:n/regenerate    — invalidate the
 *                                                          property's cached
 *                                                          full-deck PDF row
 *                                                          so the next download
 *                                                          re-renders. Future
 *                                                          hook: trigger the
 *                                                          Analyst specialist
 *                                                          for the data fields
 *                                                          backing slide N.
 *
 * The single-slide PDF endpoint relies on InternalDeck.tsx honoring the
 * `?slide=N` query param to render only that slide's `.deck-page`, so
 * `page.pdf({ preferCSSPageSize: true })` produces exactly one page.
 */

import { Router, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import { requireAdmin, getAuthUser } from "../auth";
import { logger } from "../logger";
import { storage } from "../storage";
import { db } from "../db";
import { parseRouteId } from "./helpers";
import { getBrowser } from "../slides/playwright-browser";
import { signDeckToken } from "../slides/internal-token";
import {
  HTTP_400_BAD_REQUEST,
  HTTP_404_NOT_FOUND,
  HTTP_500_INTERNAL_SERVER_ERROR,
} from "../constants";

import {
  TOTAL_SLIDES,
  PDF_RENDER_TIMEOUT_MS,
  DECK_READY_POLL_TIMEOUT_MS,
  DECK_VIEWPORT_WIDTH,
  DECK_VIEWPORT_HEIGHT,
  PDF_CONTENT_TYPE,
} from "../slides/deck-render-constants";

const router = Router();

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z\d]+/g, "-").replace(/^-|-$/g, "");
}

function parseSlideNumber(raw: string | string[] | undefined): number | null {
  if (typeof raw !== "string") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > TOTAL_SLIDES) return null;
  return n;
}

function deckUrl(propertyId: number, token: string, slide: number): string {
  return `http://localhost:80/internal/deck/${propertyId}?token=${encodeURIComponent(token)}&slide=${slide}`;
}

async function renderSingleSlidePdfOnce(propertyId: number, slide: number): Promise<Buffer> {
  const { token } = signDeckToken(propertyId);
  const url = deckUrl(propertyId, token, slide);

  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: DECK_VIEWPORT_WIDTH, height: DECK_VIEWPORT_HEIGHT },
    deviceScaleFactor: 1,
  });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(PDF_RENDER_TIMEOUT_MS);
    await page.goto(url, { waitUntil: "load", timeout: PDF_RENDER_TIMEOUT_MS });
    await page.waitForFunction(
      "window.__deckReady === true || typeof window.__deckError === 'string'",
      undefined,
      { timeout: DECK_READY_POLL_TIMEOUT_MS },
    );
    const deckError = await page.evaluate("window.__deckError || null") as string | null;
    if (deckError) throw new Error(`Deck route reported error: ${deckError}`);
    return await page.pdf({ printBackground: true, preferCSSPageSize: true });
  } finally {
    await context.close().catch(() => {});
  }
}

function isDisconnectError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /Target.*closed|Browser.*closed|Connection closed|browserContext\.newContext/i.test(msg);
}

async function renderSingleSlidePdf(propertyId: number, slide: number): Promise<Buffer> {
  try {
    return await renderSingleSlidePdfOnce(propertyId, slide);
  } catch (err) {
    if (!isDisconnectError(err)) throw err;
    logger.warn(
      `[property-deck-slide] Browser disconnect for ${propertyId}/slide-${slide}; retrying once`,
      "property-deck-slide",
    );
    return await renderSingleSlidePdfOnce(propertyId, slide);
  }
}

// ── Routes ────────────────────────────────────────────────────────────────

/**
 * Mint a short-TTL HMAC token bound to a property so the admin LB-Slides
 * detail page can fetch the deck-payload and live-render the six mini
 * slides client-side. Admin session required.
 */
router.get(
  "/api/admin/properties/:id/deck-token",
  requireAdmin,
  async (req: Request, res: Response) => {
    const propertyId = parseRouteId(req.params.id);
    if (!propertyId) {
      return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID" });
    }
    const property = await storage.getProperty(propertyId);
    if (!property) {
      return res.status(HTTP_404_NOT_FOUND).json({ error: "Property not found" });
    }
    const { token, expiresAtMs } = signDeckToken(propertyId);
    res.setHeader("Cache-Control", "no-store");
    return res.json({ token, expiresAtMs });
  },
);

/**
 * Render a single slide of a property's deck as a 1-page PDF.
 * No cache — every request triggers a fresh Playwright render. The full-deck
 * endpoint (`/api/properties/:id/deck.pdf`) keeps its R2 cache; per-slide
 * caching can be added later if traffic justifies it.
 */
router.get(
  "/api/properties/:id/deck/slide/:n.pdf",
  requireAdmin,
  async (req: Request, res: Response) => {
    const propertyId = parseRouteId(req.params.id);
    const slide = parseSlideNumber(req.params.n);
    if (!propertyId || !slide) {
      return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID or slide number" });
    }
    const property = await storage.getProperty(propertyId);
    if (!property) {
      return res.status(HTTP_404_NOT_FOUND).json({ error: "Property not found" });
    }

    const filename = `${slugify(property.name)}-slide-${slide}.pdf`;
    try {
      const pdf = await renderSingleSlidePdf(propertyId, slide);
      logger.info(
        `[property-deck-slide] Rendered ${pdf.length}B for property ${propertyId} slide ${slide}`,
        "property-deck-slide",
      );
      res.setHeader("Content-Type", PDF_CONTENT_TYPE);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", String(pdf.length));
      res.setHeader("Cache-Control", "no-store");
      return res.end(pdf);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Single-slide PDF render failed";
      logger.error(
        `[property-deck-slide] Render failed for property ${propertyId} slide ${slide}: ${message}`,
        "property-deck-slide",
      );
      if (!res.headersSent) {
        return res.status(HTTP_500_INTERNAL_SERVER_ERROR).json({ error: message });
      }
      return res;
    }
  },
);

/**
 * Mark this property's cached full-deck PDF stale so the next download
 * regenerates from scratch. We delete the variant row entirely (R2 object
 * orphans cheaply). Per-slide cache rows do not exist yet.
 *
 * Future hook: this is where the Analyst specialist would be invoked to
 * refresh the LLM-generated text fields backing slide N (vision text,
 * market rationale, transformation copy, etc.). For now the endpoint is
 * a deterministic cache-buster so the next render picks up any code, data,
 * or canonical-photo changes for slide N.
 */
router.post(
  "/api/properties/:id/deck/slide/:n/regenerate",
  requireAdmin,
  async (req: Request, res: Response) => {
    const propertyId = parseRouteId(req.params.id);
    const slide = parseSlideNumber(req.params.n);
    if (!propertyId || !slide) {
      return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID or slide number" });
    }
    const property = await storage.getProperty(propertyId);
    if (!property) {
      return res.status(HTTP_404_NOT_FOUND).json({ error: "Property not found" });
    }
    const user = getAuthUser(req);
    const triggeredBy = user?.email ?? user?.id?.toString() ?? "deck-slide-regenerate";

    try {
      await db.execute(sql`
        DELETE FROM property_slide_deck_variants
        WHERE property_id = ${propertyId} AND format = 'pdf'
      `);
      logger.info(
        `[property-deck-slide] Invalidated full-deck cache for property ${propertyId} via slide ${slide} regenerate (by ${triggeredBy})`,
        "property-deck-slide",
      );
      return res.json({ ok: true, propertyId, slide, invalidated: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Regenerate failed";
      logger.error(
        `[property-deck-slide] Regenerate failed for property ${propertyId} slide ${slide}: ${message}`,
        "property-deck-slide",
      );
      return res.status(HTTP_500_INTERNAL_SERVER_ERROR).json({ error: message });
    }
  },
);

export { router as propertyDeckSlideRouter };
