/**
 * lb-deck-pdf.ts
 *
 * PDF render pipeline for the LB Slide Deck (one portfolio investor deck).
 * Parallel to property-deck-pdf.ts but for the single portfolio deck.
 *
 * Endpoints:
 *   POST /api/lb-slides/render           — trigger render (async, 202)
 *   GET  /api/lb-slides/render-status    — poll render status
 *   GET  /api/lb-slides/download/combined.pdf — stream PDF from R2
 *
 * Cache:
 *   R2 key: `lb-slides/pdf/{DECK_LOGIC_VERSION}/lb-deck.pdf`
 *   Status: in-memory enum (idle | rendering | ready | error), reset on restart.
 *   No DB row — the LB deck has no per-property row to maintain.
 *
 * Concurrency:
 *   Uses the same renderLimiter as property-deck-pdf.ts (shared singleton).
 */

import { Router, type Request, type Response } from "express";
import { requireAdmin } from "../auth";
import { logger } from "../logger";
import { storage } from "../storage";
import { getStorageProviderAsync } from "../providers/storage";
import { getBrowser } from "../slides/playwright-browser";
import { signLbDeckToken } from "../slides/lb-token";
import { DECK_LOGIC_VERSION } from "../slides/deck-logic-version";
import {
  PDF_RENDER_TIMEOUT_MS,
  DECK_READY_POLL_TIMEOUT_MS,
  DECK_VIEWPORT_WIDTH,
  DECK_VIEWPORT_HEIGHT,
  PDF_CONTENT_TYPE,
} from "../slides/deck-render-constants";
import {
  HTTP_200_OK,
  HTTP_202_ACCEPTED,
  HTTP_400_BAD_REQUEST,
  HTTP_404_NOT_FOUND,
  HTTP_500_INTERNAL_SERVER_ERROR,
  HTTP_503_SERVICE_UNAVAILABLE,
} from "../constants";
import { renderLimiter } from "../slides/render-limiter";

const router = Router();

const LB_PDF_R2_KEY = `lb-slides/pdf/${DECK_LOGIC_VERSION}/lb-deck.pdf`;

type RenderStatus = "idle" | "rendering" | "ready" | "error";

let currentStatus: RenderStatus = "idle";
let lastError: string | null = null;
let lastRenderedAt: Date | null = null;

function lbDeckUrl(token: string): string {
  return `http://localhost:80/internal/lb-deck?token=${encodeURIComponent(token)}`;
}

function isDisconnectError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /Target.*closed|Browser.*closed|Connection closed|browserContext\.newContext/i.test(msg);
}

async function renderLbDeckPdfOnce(): Promise<Buffer> {
  const { token } = signLbDeckToken();
  const url = lbDeckUrl(token);

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
    if (deckError) throw new Error(`LB deck route reported error: ${deckError}`);
    return await page.pdf({ printBackground: true, preferCSSPageSize: true });
  } finally {
    await context.close().catch(() => {});
  }
}

async function renderLbDeckPdf(): Promise<Buffer> {
  try {
    return await renderLbDeckPdfOnce();
  } catch (err) {
    if (!isDisconnectError(err)) throw err;
    logger.warn("[lb-deck-pdf] Browser disconnect; retrying once", "lb-deck-pdf");
    return await renderLbDeckPdfOnce();
  }
}

/**
 * GET /api/lb-slides/config
 * Returns the current lb_slides_config row (null fields if not yet set).
 */
router.get(
  "/api/lb-slides/config",
  requireAdmin,
  async (_req: Request, res: Response) => {
    try {
      const config = await storage.getLbSlidesConfig();
      return res.status(HTTP_200_OK).json(
        config ?? {
          slide1PropertyId: null,
          slide2PropertyId: null,
          slide3PropertyId: null,
          slide5PropertyId: null,
          slide4SectionSubtitle: null,
          slide6Disclaimer: null,
        },
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load LB config";
      return res.status(HTTP_500_INTERNAL_SERVER_ERROR).json({ error: message });
    }
  },
);

/**
 * PUT /api/lb-slides/config
 * Upserts the lb_slides_config row with the given property assignments.
 */
router.put(
  "/api/lb-slides/config",
  requireAdmin,
  async (req: Request, res: Response) => {
    const {
      slide1PropertyId,
      slide2PropertyId,
      slide3PropertyId,
      slide5PropertyId,
      slide4SectionSubtitle,
      slide6Disclaimer,
    } = req.body as {
      slide1PropertyId?: number | null;
      slide2PropertyId?: number | null;
      slide3PropertyId?: number | null;
      slide5PropertyId?: number | null;
      slide4SectionSubtitle?: string | null;
      slide6Disclaimer?: string | null;
    };
    try {
      const updated = await storage.upsertLbSlidesConfig({
        slide1PropertyId: slide1PropertyId ?? null,
        slide2PropertyId: slide2PropertyId ?? null,
        slide3PropertyId: slide3PropertyId ?? null,
        slide5PropertyId: slide5PropertyId ?? null,
        slide4SectionSubtitle: slide4SectionSubtitle ?? null,
        slide6Disclaimer: slide6Disclaimer ?? null,
      });
      return res.status(HTTP_200_OK).json(updated);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save LB config";
      return res.status(HTTP_500_INTERNAL_SERVER_ERROR).json({ error: message });
    }
  },
);

/**
 * GET /api/lb-slides/canonical/:n
 * Serves the canonical reference PNG for slide n (1–6) from R2.
 * Key pattern: canonical/lb-6-slide/slides/slide-{n}.png
 */
router.get(
  "/api/lb-slides/canonical/:n",
  requireAdmin,
  async (req: Request, res: Response) => {
    const n = Number(String(req.params.n ?? ""));
    const SLIDE_MIN = 1;
    const SLIDE_MAX = 6;
    /** 1 hour in seconds (unit conversion: 60min × 60s). */
    const CANONICAL_SLIDE_CACHE_MAX_AGE_S = 60 * 60;
    if (!Number.isFinite(n) || n < SLIDE_MIN || n > SLIDE_MAX) {
      return res.status(HTTP_400_BAD_REQUEST).json({ error: "Slide number must be 1–6" });
    }
    const key = `canonical/lb-6-slide/slides/slide-${n}.png`;
    try {
      const sp = await getStorageProviderAsync();
      const result = await sp.downloadBuffer(key);
      if (!result?.buffer) {
        return res.status(HTTP_404_NOT_FOUND).json({ error: `Canonical slide ${n} not found in storage` });
      }
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", `public, max-age=${CANONICAL_SLIDE_CACHE_MAX_AGE_S}`);
      res.setHeader("Content-Length", String(result.buffer.length));
      return res.end(result.buffer);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Fetch failed";
      logger.error(`[lb-deck-pdf] Canonical fetch failed for slide ${n}: ${message}`, "lb-deck-pdf");
      return res.status(HTTP_500_INTERNAL_SERVER_ERROR).json({ error: message });
    }
  },
);

/**
 * POST /api/lb-slides/render
 * Enqueue a background render. Returns 202 immediately.
 */
router.post(
  "/api/lb-slides/render",
  requireAdmin,
  (_req: Request, res: Response) => {
    if (currentStatus === "rendering") {
      return res.status(HTTP_202_ACCEPTED).json({ queued: true, status: "rendering" });
    }

    currentStatus = "rendering";
    lastError = null;

    void renderLimiter(async () => {
      try {
        const sp = await getStorageProviderAsync();
        const pdf = await renderLbDeckPdf();
        await sp.uploadBuffer(LB_PDF_R2_KEY, pdf, PDF_CONTENT_TYPE);
        currentStatus = "ready";
        lastRenderedAt = new Date();
        logger.info(`[lb-deck-pdf] Rendered ${pdf.length}B → ${LB_PDF_R2_KEY}`, "lb-deck-pdf");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "LB PDF render failed";
        logger.error(`[lb-deck-pdf] Render failed: ${message}`, "lb-deck-pdf");
        currentStatus = "error";
        lastError = message;
      }
    });

    return res.status(HTTP_202_ACCEPTED).json({ queued: true, status: "rendering" });
  },
);

/**
 * GET /api/lb-slides/render-status
 * Returns current render status and metadata.
 */
router.get(
  "/api/lb-slides/render-status",
  requireAdmin,
  (_req: Request, res: Response) => {
    return res.status(HTTP_200_OK).json({
      status: currentStatus,
      lastRenderedAt: lastRenderedAt?.toISOString() ?? null,
      lastError,
      r2Key: LB_PDF_R2_KEY,
    });
  },
);

/**
 * GET /api/lb-slides/download/combined.pdf
 * Streams the combined 6-slide PDF from R2.
 */
router.get(
  "/api/lb-slides/download/combined.pdf",
  requireAdmin,
  async (_req: Request, res: Response) => {
    if (currentStatus !== "ready") {
      return res.status(HTTP_503_SERVICE_UNAVAILABLE).json({
        error: "LB deck PDF is not ready. Trigger a render first.",
        status: currentStatus,
      });
    }
    try {
      const sp = await getStorageProviderAsync();
      const result = await sp.downloadBuffer(LB_PDF_R2_KEY);
      if (!result?.buffer) {
        currentStatus = "idle"; // stale manifest — reset
        return res.status(HTTP_404_NOT_FOUND).json({ error: "PDF not found in storage. Please re-render." });
      }
      res.setHeader("Content-Type", PDF_CONTENT_TYPE);
      res.setHeader("Content-Disposition", `attachment; filename="lb-slide-deck.pdf"`);
      res.setHeader("Content-Length", String(result.buffer.length));
      res.setHeader("Cache-Control", "no-store");
      return res.end(result.buffer);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Download failed";
      logger.error(`[lb-deck-pdf] Download failed: ${message}`, "lb-deck-pdf");
      return res.status(HTTP_500_INTERNAL_SERVER_ERROR).json({ error: message });
    }
  },
);

export { router as lbDeckPdfRouter };
