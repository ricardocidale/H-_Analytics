/**
 * routes/brand-assets.ts
 *
 * Two endpoints for canonical H+ / L+B brand assets stored in R2:
 *
 *   GET /api/brand-assets/:filename
 *     Public (no auth). Proxies the asset from R2 with a 1-year cache header.
 *     Used by the logo DB entries seeded by seeds/brand-assets.ts so the
 *     logos table can reference stable /api/brand-assets/<file> URLs.
 *
 *   GET /api/admin/brand-assets
 *     Admin-only. Returns the manifest of canonical brand assets — their R2
 *     keys, proxy URLs, labels, and whether each exists in R2.
 *     Used by the BrandAssetsTab admin UI.
 */

import type { Express } from "express";
import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import type { Readable } from "stream";
import { requireAdmin } from "../auth";
import { logger } from "../logger";
import {
  R2_BRAND_KEY_H_PLUS_ENHANCED,
  R2_BRAND_KEY_H_PLUS_GLASS,
  R2_BRAND_KEY_OG_BANNER,
} from "@shared/constants";

// ── R2 client (lazy, returns null when env vars missing) ───────────────────

interface R2Context {
  s3: S3Client;
  bucket: string;
}

function getR2(): R2Context | null {
  const bucket = process.env.R2_BUCKET;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!bucket || !accountId || !accessKeyId || !secretAccessKey) return null;
  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return { s3, bucket };
}

// ── Canonical brand asset manifest ────────────────────────────────────────

interface BrandAssetEntry {
  key: string;
  filename: string;
  label: string;
  category: "logo" | "og";
  url: string;
}

function filename(key: string): string {
  return key.split("/").at(-1) ?? key;
}

const BRAND_ASSET_MANIFEST: BrandAssetEntry[] = [
  {
    key: R2_BRAND_KEY_H_PLUS_ENHANCED,
    filename: filename(R2_BRAND_KEY_H_PLUS_ENHANCED),
    label: "H+ Enhanced Logo",
    category: "logo",
    url: `/api/brand-assets/${filename(R2_BRAND_KEY_H_PLUS_ENHANCED)}`,
  },
  {
    key: R2_BRAND_KEY_H_PLUS_GLASS,
    filename: filename(R2_BRAND_KEY_H_PLUS_GLASS),
    label: "H+ Glass Logo",
    category: "logo",
    url: `/api/brand-assets/${filename(R2_BRAND_KEY_H_PLUS_GLASS)}`,
  },
  {
    key: R2_BRAND_KEY_OG_BANNER,
    filename: filename(R2_BRAND_KEY_OG_BANNER),
    label: "OG Social Banner",
    category: "og",
    url: `/api/brand-assets/${filename(R2_BRAND_KEY_OG_BANNER)}`,
  },
];

// ── Route registration ─────────────────────────────────────────────────────

export function register(app: Express) {
  /**
   * GET /api/brand-assets/:filename
   * Public proxy — streams asset from R2, 1-year immutable cache.
   */
  app.get("/api/brand-assets/:filename", async (req, res) => {
    const { filename: fn } = req.params as { filename: string };

    // Safety: only allow filenames present in the manifest (no path traversal)
    const entry = BRAND_ASSET_MANIFEST.find((e) => e.filename === fn);
    if (!entry) {
      return res.status(404).json({ error: "Brand asset not found", code: "BRAS-001" });
    }

    const r2 = getR2();
    if (!r2) {
      logger.warn("R2 not configured — brand-assets route unavailable", "brand-assets");
      return res.status(503).json({ error: "Asset storage not configured", code: "BRAS-002" });
    }

    try {
      const out = await r2.s3.send(
        new GetObjectCommand({ Bucket: r2.bucket, Key: entry.key }),
      );
      if (!out.Body) {
        return res.status(404).json({ error: "Asset not found in storage", code: "BRAS-003" });
      }

      res.set({
        "Content-Type": out.ContentType || "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
        ...(out.ContentLength ? { "Content-Length": String(out.ContentLength) } : {}),
      });
      (out.Body as Readable).pipe(res);
    } catch (err: unknown) {
      const isNotFound =
        err instanceof Error &&
        (err.name === "NoSuchKey" || err.name === "NotFound" ||
          (err as unknown as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404);
      if (isNotFound) {
        return res.status(404).json({ error: "Asset not yet uploaded to R2", code: "BRAS-004" });
      }
      logger.error(
        `brand-assets proxy error for ${fn}: ${err instanceof Error ? err.message : String(err)}`,
        "brand-assets",
      );
      return res.status(500).json({ error: "Failed to serve asset", code: "BRAS-005" });
    }
  });

  /**
   * GET /api/admin/brand-assets
   * Admin-only — returns manifest with existence check + last-modified from R2.
   */
  app.get("/api/admin/brand-assets", requireAdmin, async (_req, res) => {
    const r2 = getR2();

    const results = await Promise.all(
      BRAND_ASSET_MANIFEST.map(async (entry) => {
        let exists = false;
        let lastModified: string | null = null;

        if (r2) {
          try {
            const head = await r2.s3.send(
              new HeadObjectCommand({ Bucket: r2.bucket, Key: entry.key }),
            );
            exists = true;
            lastModified = head.LastModified?.toISOString() ?? null;
          } catch {
            exists = false;
          }
        }

        return { ...entry, exists, lastModified };
      }),
    );

    return res.json(results);
  });
}
