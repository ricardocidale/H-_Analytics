import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { logger } from "../logger";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * GET /api/media/:filename — streams a binary asset stored in Neon (bytea).
 *
 * Filename is the public key (UNIQUE indexed in media_assets). bytea pages
 * live on TOAST out-of-line so this route never drags blobs through queries
 * against business tables. SHA-256 doubles as a strong ETag, so a client
 * with the asset cached gets a 304 with no payload.
 *
 * `Cache-Control: public, max-age=1y, immutable` is safe because filename →
 * bytes is content-addressable: any byte change mints a new filename in the
 * migration scripts (or, for re-keyed rows, a new logo-<id> with new sha).
 */
export function register(app: Express) {
  app.get("/api/media/:filename", async (req: Request, res: Response) => {
    try {
      const filenameParam = req.params.filename;
      const filename = Array.isArray(filenameParam) ? filenameParam[0] : filenameParam;
      if (!filename || typeof filename !== "string" || filename.includes("/") || filename.includes("..")) {
        return res.status(400).json({ error: "Invalid filename", code: "MDIA-001" });
      }

      const asset = await storage.getMediaByFilename(filename);
      if (!asset) {
        return res.status(404).json({ error: "Not found", code: "MDIA-002" });
      }

      const etag = `"${asset.sha256}"`;
      if (req.headers["if-none-match"] === etag) {
        res.status(304).end();
        return;
      }

      res.set({
        "Content-Type": asset.contentType,
        "Content-Length": String(asset.sizeBytes),
        "Cache-Control": `public, max-age=${ONE_YEAR_SECONDS}, immutable`,
        ETag: etag,
      });
      return res.send(asset.bytes);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`media route error: ${msg}`, "media");
      return res.status(500).json({ error: "Failed to serve media", code: "MDIA-003" });
    }
  });
}
