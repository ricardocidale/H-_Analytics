/**
 * property-deck-pdf.ts
 *
 * GET /api/properties/:id/deck.pdf
 *
 * Renders the per-property investor deck as a 6-slide PDF via headless
 * Chromium (Playwright). T003 STUB: serves a placeholder HTML document so
 * we can prove the Playwright → PDF pipeline end-to-end on Railway before
 * wiring the real React deck route in T004 + R2 caching in T005.
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

const PDF_RENDER_TIMEOUT_MS = 60_000;

/** Slug a property name into a safe download filename component. */
function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Escape user-controlled text for safe interpolation into HTML. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** T003 placeholder HTML — replaced in T004 by a navigation to the React deck route. */
function placeholderDeckHtml(propertyNameRaw: string): string {
  const propertyName = escapeHtml(propertyNameRaw);
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${propertyName} — Investor Deck (placeholder)</title>
    <style>
      @page { size: 13.333in 7.5in; margin: 0; }
      html, body { margin: 0; padding: 0; background: #1C2B1E; color: #FFF9F5; font-family: Georgia, serif; }
      .slide {
        width: 13.333in; height: 7.5in;
        display: flex; flex-direction: column; justify-content: center; align-items: center;
        page-break-after: always;
      }
      .slide:last-child { page-break-after: auto; }
      .eyebrow { font-size: 18pt; letter-spacing: 0.3em; opacity: 0.6; margin-bottom: 24px; }
      .name { font-size: 64pt; font-weight: 400; }
      .num { font-size: 14pt; opacity: 0.4; margin-top: 48px; }
      .accent { color: #257D41; }
    </style>
  </head>
  <body>
    ${[1, 2, 3, 4, 5, 6].map(n => `
    <section class="slide">
      <div class="eyebrow">L+B HOSPITALITY</div>
      <div class="name">${propertyName}</div>
      <div class="num">Slide ${n} of 6 — placeholder</div>
    </section>`).join("")}
  </body>
</html>`;
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
