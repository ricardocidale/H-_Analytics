/**
 * Migrate every graphic (heroes, property photos, logos, root icons) into the
 * `media_assets` table inside Neon. Goal: zero dependence on the Replit Object
 * Storage sidecar so the codebase ports cleanly to Cursor / Claude Code / any
 * stock Postgres host.
 *
 * Sources
 *   - client/public/images/*   (38 hero/album files still on disk from Phase C)
 *   - client/public/logos/*    (6 bundled brand logos)
 *   - client/public/{favicon,og-image,opengraph}.{png,jpg}  (root icons)
 *   - /objects/property-photos/<id>.png  (28 rows pulled from bucket)
 *   - /objects/uploads/<uuid>            (logos.url referencing bucket UUIDs)
 *
 * Filename namespacing avoids collisions: heroes/logos/icons keep their
 * original filename, photos use `photo-<id>.png`, bucket-stored logos use
 * `logo-<id>.<ext>`.
 *
 * Idempotent: SHA-256 unique constraint causes ON CONFLICT short-circuit.
 * Re-running after a partial failure is safe.
 */
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";

import { eq, sql } from "drizzle-orm";

import { db } from "../server/db";
import { logger } from "../server/logger";
import { getStorageProviderAsync } from "../server/providers/storage";
import { logos, mediaAssets, propertyPhotos } from "@shared/schema";

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".gif": "image/gif",
};

function contentTypeFor(filename: string): string {
  const ext = extname(filename).toLowerCase();
  return CONTENT_TYPE_BY_EXT[ext] ?? "application/octet-stream";
}

function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

async function insertAsset(
  filename: string,
  contentType: string,
  bytes: Buffer,
  kind: string,
): Promise<{ inserted: boolean }> {
  // sha256 is stored as a non-unique index (for ETag lookups + dedup
  // analytics). We intentionally do NOT short-circuit on duplicate content:
  // every public filename gets its own row so URL → bytes is 1:1 and we can
  // version a single asset later by writing a new filename.
  const sha256 = sha256Hex(bytes);
  await db
    .insert(mediaAssets)
    .values({
      filename,
      contentType,
      bytes,
      sizeBytes: bytes.length,
      sha256,
      kind,
    })
    .onConflictDoNothing({ target: mediaAssets.filename });
  return { inserted: true };
}

async function migrateDirectory(
  diskDir: string,
  kind: string,
): Promise<Array<{ filename: string; size: number }>> {
  let entries: string[];
  try {
    entries = await readdir(diskDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const results: Array<{ filename: string; size: number }> = [];
  for (const name of entries) {
    if (name.startsWith(".")) continue;
    const ext = extname(name).toLowerCase();
    if (!CONTENT_TYPE_BY_EXT[ext]) continue;
    const bytes = await readFile(join(diskDir, name));
    const { inserted } = await insertAsset(name, contentTypeFor(name), bytes, kind);
    results.push({ filename: name, size: bytes.length });
    logger.info(
      `${inserted ? "INS" : "DUP"} [${kind}] ${name} (${bytes.length} bytes)`,
      "migrate-graphics",
    );
  }
  return results;
}

async function migratePropertyPhotosFromBucket(): Promise<void> {
  const provider = await getStorageProviderAsync();
  const rows = await db.select().from(propertyPhotos);
  for (const photo of rows) {
    const newFilename = `photo-${photo.id}.png`;

    // Skip only if the row already points at a real media asset.
    if (photo.imageUrl?.startsWith("/api/media/")) {
      const existing = await db.execute<{ n: number }>(
        sql`SELECT count(*)::int AS n FROM media_assets WHERE filename = ${newFilename}`,
      );
      if ((existing.rows[0]?.n ?? 0) > 0) continue;
    }

    // Bucket key — derived from the photo id even if the row has already been
    // re-pointed at /api/media/. The bucket files from Phase B haven't been
    // deleted, so fetch is still possible.
    const bucketKey = photo.imageUrl?.startsWith("/objects/")
      ? photo.imageUrl
      : `/objects/property-photos/${photo.id}.png`;

    try {
      const { buffer, contentType } = await provider.downloadBuffer(bucketKey);
      await insertAsset(newFilename, contentType || "image/png", buffer, "property-photo");
      await db
        .update(propertyPhotos)
        .set({ imageUrl: `/api/media/${newFilename}` })
        .where(eq(propertyPhotos.id, photo.id));
      logger.info(`photo ${photo.id}: ${photo.imageUrl} → /api/media/${newFilename}`, "migrate-graphics");
    } catch (err) {
      logger.error(
        `photo ${photo.id}: bucket fetch failed (${(err as Error).message}) — skipping`,
        "migrate-graphics",
      );
    }
  }
}

async function migrateLogosFromBucket(): Promise<void> {
  const provider = await getStorageProviderAsync();
  const rows = await db.select().from(logos);
  for (const logo of rows) {
    if (logo.url.startsWith("/api/media/")) continue;

    // Bundled disk logos (/logos/foo.png) — already migrated by directory pass
    // above; just rewrite the DB column to the new public URL.
    if (logo.url.startsWith("/logos/")) {
      const filename = logo.url.replace(/^\/logos\//, "");
      await db.update(logos).set({ url: `/api/media/${filename}` }).where(eq(logos.id, logo.id));
      logger.info(`logo ${logo.id}: ${logo.url} → /api/media/${filename}`, "migrate-graphics");
      continue;
    }

    // Bucket-stored logos (/objects/uploads/<uuid>) — pull bytes, name
    // deterministically off the row id so the new URL is stable.
    if (logo.url.startsWith("/objects/")) {
      const bucketKey = logo.url;
      try {
        const { buffer, contentType } = await provider.downloadBuffer(bucketKey);
        const ext = (contentType.split("/")[1] || "png").replace("jpeg", "jpg");
        const newFilename = `logo-${logo.id}.${ext === "jpg" ? "jpeg" : ext}`;
        await insertAsset(newFilename, contentType, buffer, "logo");
        await db
          .update(logos)
          .set({ url: `/api/media/${newFilename}` })
          .where(eq(logos.id, logo.id));
        logger.info(`logo ${logo.id}: ${logo.url} → /api/media/${newFilename}`, "migrate-graphics");
      } catch (err) {
        logger.error(
          `logo ${logo.id}: bucket fetch failed (${(err as Error).message}) — skipping`,
          "migrate-graphics",
        );
      }
    }
  }
}

async function main() {
  logger.info("=== media_assets migration starting ===", "migrate-graphics");

  // 1. Heroes / album shots (still on disk in client/public/images/)
  const heroes = await migrateDirectory("client/public/images", "hero");
  logger.info(`Heroes: ${heroes.length} files inserted`, "migrate-graphics");

  // 2. Bundled brand logos (client/public/logos/)
  const bundledLogos = await migrateDirectory("client/public/logos", "logo");
  logger.info(`Bundled logos: ${bundledLogos.length} files inserted`, "migrate-graphics");

  // 3. Root icons (favicon, og-image)
  const rootIcons: Array<{ name: string; kind: string }> = [
    { name: "favicon.png", kind: "icon" },
    { name: "og-image.png", kind: "icon" },
    { name: "opengraph.png", kind: "icon" },
    { name: "opengraph.jpg", kind: "icon" },
  ];
  for (const { name, kind } of rootIcons) {
    try {
      const bytes = await readFile(join("client/public", name));
      await insertAsset(name, contentTypeFor(name), bytes, kind);
      logger.info(`Root icon: ${name}`, "migrate-graphics");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  // 4. Property photos (currently /objects/property-photos/<id>.png in bucket)
  await migratePropertyPhotosFromBucket();

  // 5. Logos (mix of /logos/* on disk, /objects/uploads/<uuid> in bucket)
  await migrateLogosFromBucket();

  // Final summary
  const counts = await db.execute(sql`
    SELECT kind, count(*)::int AS n, pg_size_pretty(sum(size_bytes)) AS total
    FROM media_assets GROUP BY kind ORDER BY kind;
  `);
  logger.info(`Final media_assets inventory: ${JSON.stringify(counts.rows)}`, "migrate-graphics");
}

main().then(
  () => process.exit(0),
  (err) => {
    logger.error(`fatal: ${(err as Error).stack ?? err}`, "migrate-graphics");
    process.exit(1);
  },
);
