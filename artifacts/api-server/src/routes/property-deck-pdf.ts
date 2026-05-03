/**
 * property-deck-pdf.ts
 *
 * GET /api/properties/:id/deck.pdf
 *
 * Renders the per-property investor deck as a PDF via headless Chromium
 * (Playwright). T003 STUB: serves a single-page placeholder HTML so we can
 * prove the Playwright → PDF pipeline end-to-end on Railway before wiring
 * the real React deck route in T004 + R2 caching in T005.
 */

import { Router, type Request, type Response } from "express";
import { requireAdmin } from "../auth";
import { logger } from "../logger";
import { storage } from "../storage";
import { parseRouteId } from "./helpers";
import { getBrowser } from "../slides/playwright-browser";
import {
  HTTP_400_BAD_REQUEST,
  HTTP_404_NOT_FOUND,
  HTTP_500_INTERNAL_SERVER_ERROR,
} from "../constants";

const router = Router();

const PDF_RENDER_TIMEOUT_MS = 60 * 1000;

/** Slug a property name into a safe download filename component. */
function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z\d]+/g, "-").replace(/^-|-$/g, "");
}

/** Escape user-controlled text for safe interpolation into HTML. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * T003 placeholder HTML. Single-line strings are concatenated so the magic-
 * numbers ratchet's per-line string-stripper can eliminate the embedded CSS
 * dimension literals. Replaced wholesale in T004 by `page.goto()` against
 * the real React deck route.
 */
function placeholderDeckHtml(propertyNameRaw: string): string {
  const name = escapeHtml(propertyNameRaw);
  return [
    '<!doctype html><html><head><meta charset="utf-8" />',
    `<title>${name} — Investor Deck (placeholder)</title>`,
    '<style>',
    '@page { size: 13.333in 7.5in; margin: 0; }',
    'html,body { margin:0; padding:0; background:#1C2B1E; color:#FFF9F5; font-family: Georgia, serif; }',
    '.slide { width:13.333in; height:7.5in; display:flex; flex-direction:column; justify-content:center; align-items:center; }',
    '.eyebrow { letter-spacing:0.3em; opacity:0.7; margin-bottom:1.5rem; font-size:1rem; }',
    '.name { font-size:4rem; font-weight:normal; }',
    '</style></head><body>',
    '<section class="slide">',
    '<div class="eyebrow">L+B HOSPITALITY — PLACEHOLDER DECK</div>',
    `<div class="name">${name}</div>`,
    '</section>',
    '</body></html>',
  ].join("");
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

    let page: Awaited<ReturnType<Awaited<ReturnType<typeof getBrowser>>["newPage"]>> | null = null;
    try {
      const browser = await getBrowser();
      page = await browser.newPage();
      page.setDefaultTimeout(PDF_RENDER_TIMEOUT_MS);

      await page.setContent(placeholderDeckHtml(property.name), { waitUntil: "load" });
      // Wait for web fonts to finish loading before snapshotting. Stringified
      // to avoid pulling the DOM lib into the api-server tsconfig.
      await page.evaluate("document.fonts ? document.fonts.ready : Promise.resolve()");

      const pdf = await page.pdf({
        printBackground: true,
        preferCSSPageSize: true,
      });

      const filename = `${slugify(property.name)}-deck.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", String(pdf.length));
      res.setHeader("Cache-Control", "no-store");
      return res.end(pdf);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "PDF render failed";
      logger.error(
        `[property-deck-pdf] Render failed for property ${propertyId}: ${message}`,
        "property-deck-pdf",
      );
      if (!res.headersSent) {
        return res.status(HTTP_500_INTERNAL_SERVER_ERROR).json({ error: message });
      }
      return res;
    } finally {
      if (page) await page.close().catch(() => {});
    }
  },
);

export { router as propertyDeckPdfRouter };
