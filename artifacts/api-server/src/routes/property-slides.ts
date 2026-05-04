/**
 * property-slides.ts
 *
 * Per-property slide deck status + the bulk hero-image ZIP export.
 *
 * The investor-facing PDF deck is generated on demand by Playwright
 * (HTML→PDF) — see `property-deck-pdf.ts`. This file only exposes:
 *
 *   GET /api/properties/hero-images/zip   — admin: ZIP of hero images
 *   GET /api/slides/status                — admin: PDF variant status rows
 *
 * In current code only `pdf` rows are written (see
 * `upsertPdfVariantRow` in `property-deck-pdf.ts`); `'pptx'` and `'image'`
 * remain in the format CHECK for historical rows and future variants
 * (see migrations 0029 and 0033).
 */

import { Router, type Request, type Response } from "express";
import archiver from "archiver";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../auth";
import { logger } from "../logger";
import { storage } from "../storage";
import { db } from "../db";
import { getStorageProviderAsync } from "../providers/storage";
import {
  HTTP_500_INTERNAL_SERVER_ERROR,
} from "../constants";

const router = Router();

// ── Types ─────────────────────────────────────────────────────────────────

interface VariantRow {
  property_id: number;
  format: string;
  status: string;
  r2_key: string | null;
  file_size_bytes: number | null;
  generated_at: Date | null;
  triggered_by: string | null;
  error_message: string | null;
  updated_at: Date;
}

// ── DB helpers ─────────────────────────────────────────────────────────────

async function getAllVariantRows(): Promise<VariantRow[]> {
  const rows = await db.execute(sql`
    SELECT * FROM property_slide_deck_variants
    ORDER BY property_id, format
  `);
  return rows.rows as unknown as VariantRow[];
}

// ── Hero image resolution helper ───────────────────────────────────────────

async function resolveHeroImageBuffer(
  imageUrl: string,
): Promise<{ buffer: Buffer; ext: string } | null> {
  try {
    const port = process.env.PORT ?? "8080";

    if (imageUrl.startsWith("/objects/")) {
      const key = imageUrl.slice("/objects/".length);
      const sp = await getStorageProviderAsync();
      const result = await sp.downloadBuffer(key);
      if (!result) return null;
      const lower = key.toLowerCase();
      const ext = lower.endsWith(".jpg") || lower.endsWith(".jpeg") ? "jpg"
        : lower.endsWith(".webp") ? "webp"
        : lower.endsWith(".gif") ? "gif"
        : "png";
      return { buffer: result.buffer, ext };
    }

    if (imageUrl.startsWith("/api/")) {
      const resp = await fetch(`http://localhost:${port}${imageUrl}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!resp.ok) return null;
      const buf = Buffer.from(await resp.arrayBuffer());
      const contentType = resp.headers.get("content-type") ?? "";
      const ext = contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg"
        : contentType.includes("webp") ? "webp"
        : contentType.includes("gif") ? "gif"
        : "png";
      return { buffer: buf, ext };
    }

    return null;
  } catch (err) {
    logger.warn(`[hero-zip] resolveHeroImageBuffer failed for ${imageUrl}: ${err}`, "property-slides");
    return null;
  }
}

/**
 * Resolve the highest-available-resolution hero image for a property,
 * trying each candidate URL in descending quality order and falling back
 * to the next one when a fetch fails. Returns null only when every
 * candidate has been exhausted.
 *
 * Candidate priority for the bulk hero-image export:
 *   1. variants.original — the unmodified upload (highest fidelity)
 *   2. variants.full     — ~2400px webp
 *   3. variants.hero     — ~1600px webp
 *   4. variants.card     — ~800px webp
 *   5. hero photo's own imageUrl (covers DB-served originals)
 *   6. property's denormalized imageUrl (legacy fallback)
 */
async function resolveBestHeroImageBuffer(
  property: { id: number; imageUrl?: string | null },
): Promise<{ buffer: Buffer; ext: string } | null> {
  const candidates: string[] = [];

  try {
    const hero = await storage.getHeroPhoto(property.id);
    if (hero) {
      const variants = hero.variants ?? {};
      if (variants.original) candidates.push(variants.original);
      if (variants.full) candidates.push(variants.full);
      if (variants.hero) candidates.push(variants.hero);
      if (variants.card) candidates.push(variants.card);
      if (hero.imageUrl) candidates.push(hero.imageUrl);
    }
  } catch (err) {
    logger.warn(`[hero-zip] getHeroPhoto failed for property ${property.id}: ${err}`, "property-slides");
  }

  if (property.imageUrl) candidates.push(property.imageUrl);

  const seen = new Set<string>();
  for (const url of candidates) {
    if (seen.has(url)) continue;
    seen.add(url);
    const result = await resolveHeroImageBuffer(url);
    if (result) return result;
  }
  return null;
}

// ── Routes ────────────────────────────────────────────────────────────────

/**
 * GET /api/properties/hero-images/zip
 * Streams a ZIP of all property hero images, one file per property,
 * named {sanitized-property-name}.{ext}. Properties with no hero image
 * are silently skipped. Response is streamed so it doesn't time out on
 * large portfolios.
 *
 * IMPORTANT: this literal route must appear before any `/api/properties/:id/*`
 * routes registered by sibling routers so Express does not match
 * "hero-images" as an :id param.
 */
router.get("/api/properties/hero-images/zip", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const props = await storage.getAllProperties();
    if (!props || props.length === 0) {
      return res.status(404).json({ error: "No properties found" });
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="property-hero-images.zip"');
    res.setHeader("Cache-Control", "no-store");

    const archive = archiver("zip", { zlib: { level: 5 } });

    archive.on("error", (err) => {
      logger.error(`[hero-zip] archiver error: ${err.message}`, "property-slides");
      if (!res.headersSent) res.status(500).json({ error: "ZIP generation failed" });
    });

    archive.pipe(res);

    for (const prop of props) {
      const resolved = await resolveBestHeroImageBuffer({
        id: prop.id,
        imageUrl: (prop as Record<string, unknown>).imageUrl as string | undefined | null,
      });
      if (!resolved) continue;

      const safeName = prop.name.replace(/[^a-zA-Z0-9\s-]/g, "").trim().replace(/\s+/g, "-");
      const filename = `${safeName}.${resolved.ext}`;
      archive.append(resolved.buffer, { name: filename });
    }

    await archive.finalize();
    return res;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "ZIP generation failed";
    logger.error(`[hero-zip] error: ${message}`, "property-slides");
    if (!res.headersSent) return res.status(500).json({ error: message });
    return res;
  }
});

/**
 * GET /api/slides/status
 * Returns variant rows for the admin Slide Decks tab. In current code only
 * `pdf` rows are written, but the schema also allows `'pptx'` / `'image'`.
 */
router.get("/api/slides/status", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const rows = await getAllVariantRows();
    return res.json(
      rows.map(r => ({
        propertyId: r.property_id,
        format: r.format,
        status: r.status,
        r2Key: r.r2_key,
        fileSizeBytes: r.file_size_bytes,
        generatedAt: r.generated_at,
        triggeredBy: r.triggered_by,
        errorMessage: r.error_message,
      })),
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch slide status";
    logger.error(`Slide status fetch error: ${message}`, "property-slides");
    return res.status(HTTP_500_INTERNAL_SERVER_ERROR).json({ error: message });
  }
});

export { router as propertySlidesRouter };
