/**
 * property-deck-pdf.ts
 *
 * GET /api/properties/:id/deck.pdf
 *
 * Renders the per-property investor deck as a PDF by booting headless
 * Chromium (Playwright), navigating to the portal-served React route
 * `/internal/deck/:propertyId?token=…`, waiting for `window.__deckReady`,
 * and capturing `page.pdf({ printBackground: true, preferCSSPageSize: true })`.
 *
 * Cache contract:
 *   - Cached binary lives in object storage (R2 in prod) at
 *     `slides/pdf/property-${id}.pdf`.
 *   - Bookkeeping row in `property_slide_deck_variants` (format='pdf')
 *     records `generated_at`, `file_size_bytes`, `r2_key`.
 *   - On request, the cached PDF is served when its `generated_at` is
 *     newer than both the property's `updated_at` and `financials_computed_at`.
 *     Otherwise the deck is regenerated, re-uploaded, and the row is upserted.
 *   - This is on-demand only; nothing is pre-generated at boot.
 */

import { Router, type Request, type Response } from "express";
import { sql } from "drizzle-orm";
import { requireAdmin, getAuthUser } from "../auth";
import { logger } from "../logger";
import { storage } from "../storage";
import { db } from "../db";
import { parseRouteId } from "./helpers";
import { getBrowser } from "../slides/playwright-browser";
import { getStorageProviderAsync } from "../providers/storage";
import { signDeckToken } from "../slides/internal-token";
import { DECK_LOGIC_VERSION } from "../slides/deck-logic-version";
import {
  HTTP_400_BAD_REQUEST,
  HTTP_404_NOT_FOUND,
  HTTP_500_INTERNAL_SERVER_ERROR,
} from "../constants";

const router = Router();

const PDF_RENDER_TIMEOUT_MS = 90 * 1000;
const DECK_READY_POLL_TIMEOUT_MS = 60 * 1000;
const DECK_VIEWPORT_WIDTH = 1920;
const DECK_VIEWPORT_HEIGHT = 1080;
const PDF_CONTENT_TYPE = "application/pdf";
const PDF_FORMAT = "pdf" as const;
const SLIDE_ERROR_MSG_MAX_LENGTH = 500;

interface PdfVariantRow {
  property_id: number;
  format: string;
  status: string;
  r2_key: string | null;
  file_size_bytes: number | null;
  generated_at: Date | null;
}

/**
 * R2 cache key. Includes DECK_LOGIC_VERSION so that bumping the version
 * (LLM model swap, prompt change, layout change, schema change) targets a
 * different key — the existing variant row's r2_key no longer matches what
 * the current code expects, isCacheFresh treats the entry as stale, and the
 * deck regenerates against the new pipeline. Old keys orphan in R2 (cheap).
 */
function pdfR2Key(propertyId: number): string {
  return `slides/pdf/${DECK_LOGIC_VERSION}/property-${propertyId}.pdf`;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z\d]+/g, "-").replace(/^-|-$/g, "");
}

async function getPdfVariantRow(propertyId: number): Promise<PdfVariantRow | null> {
  const result = await db.execute(sql`
    SELECT property_id, format, status, r2_key, file_size_bytes, generated_at
    FROM property_slide_deck_variants
    WHERE property_id = ${propertyId} AND format = ${PDF_FORMAT}
  `);
  return (result.rows[0] as unknown as PdfVariantRow | undefined) ?? null;
}

async function upsertPdfVariantRow(args: {
  propertyId: number;
  status: "generating" | "ready" | "error";
  r2Key?: string | null;
  fileSizeBytes?: number | null;
  generatedAt?: Date | null;
  triggeredBy?: string | null;
  errorMessage?: string | null;
}): Promise<void> {
  await db.execute(sql`
    INSERT INTO property_slide_deck_variants
      (property_id, format, status, r2_key, file_size_bytes, generated_at, triggered_by, error_message, updated_at)
    VALUES (
      ${args.propertyId}, ${PDF_FORMAT},
      ${args.status},
      ${args.r2Key ?? null},
      ${args.fileSizeBytes ?? null},
      ${args.generatedAt ?? null},
      ${args.triggeredBy ?? null},
      ${args.errorMessage ?? null},
      NOW()
    )
    ON CONFLICT (property_id, format) DO UPDATE SET
      status          = EXCLUDED.status,
      r2_key          = COALESCE(EXCLUDED.r2_key, property_slide_deck_variants.r2_key),
      file_size_bytes = COALESCE(EXCLUDED.file_size_bytes, property_slide_deck_variants.file_size_bytes),
      generated_at    = COALESCE(EXCLUDED.generated_at, property_slide_deck_variants.generated_at),
      triggered_by    = COALESCE(EXCLUDED.triggered_by, property_slide_deck_variants.triggered_by),
      error_message   = EXCLUDED.error_message,
      updated_at      = NOW()
  `);
}

/**
 * Cache is fresh iff:
 *   1. A ready row exists with an r2 key and a generated_at timestamp.
 *   2. The row's r2_key matches the key the current code would write to —
 *      a mismatch means DECK_LOGIC_VERSION has bumped since the row was
 *      written, so the cached PDF was produced by stale pipeline logic
 *      (LLM model, prompt, layout, or schema change). See deck-logic-version.ts.
 *   3. generated_at is newer than every property timestamp that invalidates
 *      it (property.updatedAt, property.financialsComputedAt).
 */
function isCacheFresh(
  row: PdfVariantRow | null,
  propertyId: number,
  property: { updatedAt?: Date | string | null; financialsComputedAt?: Date | string | null },
): boolean {
  if (!row) return false;
  if (row.status !== "ready") return false;
  if (!row.r2_key || !row.generated_at) return false;
  if (row.r2_key !== pdfR2Key(propertyId)) return false;

  const cachedAt = new Date(row.generated_at).getTime();
  const stamps: number[] = [];
  if (property.updatedAt) stamps.push(new Date(property.updatedAt).getTime());
  if (property.financialsComputedAt) stamps.push(new Date(property.financialsComputedAt).getTime());
  for (const t of stamps) {
    if (Number.isFinite(t) && t > cachedAt) return false;
  }
  return true;
}

/**
 * Internal proxy URL for the portal's deck route. Both api-server and the
 * portal sit behind the shared proxy at localhost:80; the portal owns "/"
 * (and SPA-served "/internal/*") while api-server owns "/api".
 */
function deckUrl(propertyId: number, token: string): string {
  return `http://localhost:80/internal/deck/${propertyId}?token=${encodeURIComponent(token)}`;
}

/** Render the deck via Playwright and return the PDF bytes. Throws on failure. */
async function renderDeckPdfOnce(propertyId: number): Promise<Buffer> {
  const { token } = signDeckToken(propertyId);
  const url = deckUrl(propertyId, token);

  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: DECK_VIEWPORT_WIDTH, height: DECK_VIEWPORT_HEIGHT },
    deviceScaleFactor: 1,
  });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(PDF_RENDER_TIMEOUT_MS);

    await page.goto(url, { waitUntil: "load", timeout: PDF_RENDER_TIMEOUT_MS });
    // Deck route fetches payload, decodes images, then sets window.__deckReady.
    // If anything in the React route throws, it sets window.__deckError so we
    // fail fast instead of waiting out the full 60s ready-poll timeout.
    await page.waitForFunction(
      "window.__deckReady === true || typeof window.__deckError === 'string'",
      undefined,
      { timeout: DECK_READY_POLL_TIMEOUT_MS },
    );
    const deckError = await page.evaluate(
      "window.__deckError || null",
    ) as string | null;
    if (deckError) {
      throw new Error(`Deck route reported error: ${deckError}`);
    }
    return await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
    });
  } finally {
    await context.close().catch(() => {});
  }
}

/**
 * Wrapper that retries once on a Chromium disconnect race. The browser
 * singleton can be torn down between `getBrowser()` and `newContext()` by
 * the `disconnected` event handler; the retry picks up a freshly-launched
 * instance instead of bubbling a confusing "Target closed" error to the
 * client. Any other failure (timeout, deck error, render failure) is not
 * retried.
 */
function isDisconnectError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /Target.*closed|Browser.*closed|Connection closed|browserContext\.newContext/i.test(msg);
}

async function renderDeckPdf(propertyId: number): Promise<Buffer> {
  try {
    return await renderDeckPdfOnce(propertyId);
  } catch (err) {
    if (!isDisconnectError(err)) throw err;
    logger.warn(
      `[property-deck-pdf] Browser disconnect during render for ${propertyId}; retrying once`,
      "property-deck-pdf",
    );
    return await renderDeckPdfOnce(propertyId);
  }
}

router.get(
  "/api/properties/:id/deck.pdf",
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

    const filename = `${slugify(property.name)}-deck.pdf`;
    const sp = await getStorageProviderAsync();

    // ── Fast path: serve cached PDF if it is newer than every invalidation stamp.
    try {
      const existing = await getPdfVariantRow(propertyId);
      if (
        existing &&
        existing.r2_key &&
        isCacheFresh(existing, propertyId, property as { updatedAt?: Date | null; financialsComputedAt?: Date | null })
      ) {
        const cached = await sp.downloadBuffer(existing.r2_key).catch(() => null);
        if (cached?.buffer) {
          res.setHeader("Content-Type", PDF_CONTENT_TYPE);
          res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
          res.setHeader("Content-Length", String(cached.buffer.length));
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("X-Deck-Cache", "hit");
          return res.end(cached.buffer);
        }
        // Row claims ready but bytes are gone — fall through to regenerate.
        logger.warn(
          `[property-deck-pdf] Cached row for ${propertyId} but R2 fetch failed; regenerating`,
          "property-deck-pdf",
        );
      }
    } catch (err) {
      logger.warn(`[property-deck-pdf] Cache lookup failed for ${propertyId}: ${err}`, "property-deck-pdf");
    }

    // ── Slow path: render, cache, serve.
    const user = getAuthUser(req);
    const triggeredBy = user?.email ?? user?.id?.toString() ?? "deck-pdf";
    await upsertPdfVariantRow({
      propertyId,
      status: "generating",
      triggeredBy,
      errorMessage: null,
    }).catch(() => {});

    try {
      const pdf = await renderDeckPdf(propertyId);
      const key = pdfR2Key(propertyId);
      await sp.uploadBuffer(key, pdf, PDF_CONTENT_TYPE);
      await upsertPdfVariantRow({
        propertyId,
        status: "ready",
        r2Key: key,
        fileSizeBytes: pdf.length,
        generatedAt: new Date(),
        triggeredBy,
        errorMessage: null,
      });
      logger.info(
        `[property-deck-pdf] Rendered ${pdf.length}B for property ${propertyId} → ${key}`,
        "property-deck-pdf",
      );

      res.setHeader("Content-Type", PDF_CONTENT_TYPE);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", String(pdf.length));
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Deck-Cache", "miss");
      return res.end(pdf);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "PDF render failed";
      logger.error(
        `[property-deck-pdf] Render failed for property ${propertyId}: ${message}`,
        "property-deck-pdf",
      );
      await upsertPdfVariantRow({
        propertyId,
        status: "error",
        triggeredBy,
        errorMessage: message.slice(0, SLIDE_ERROR_MSG_MAX_LENGTH),
      }).catch(() => {});
      if (!res.headersSent) {
        return res.status(HTTP_500_INTERNAL_SERVER_ERROR).json({ error: message });
      }
      return res;
    }
  },
);

export { router as propertyDeckPdfRouter };
