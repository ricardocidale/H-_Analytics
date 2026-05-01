import { customType, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * `bytea` column type for raw binary storage in Postgres. Used by media_assets
 * to keep image bytes inside Neon (Replit-independent) instead of an external
 * bucket. The driver returns Buffer for bytea, so the JS-side type is Buffer.
 */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/**
 * media_assets — content-addressable image store living entirely in Neon.
 *
 * Why a dedicated table instead of inlining bytes back into property_photos?
 *   Phase B's slowness was *not* "Postgres holds bytes" — it was "the same
 *   table holds bytes AND business columns, so every business query pulled
 *   blobs into the buffer cache." Isolating bytes here means callers like
 *   `SELECT * FROM property_photos` stay fast, and only `/api/media/:filename`
 *   touches the bytea pages.
 *
 * Filenames are the public URL key (`/api/media/<filename>`) so existing
 * source-code refs need only a path-segment swap. SHA-256 enforces dedup and
 * doubles as a strong ETag for HTTP caching.
 */
export const mediaAssets = pgTable(
  "media_assets",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    filename: text("filename").notNull().unique(),
    contentType: text("content_type").notNull(),
    bytes: bytea("bytes").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    kind: text("kind").notNull(),
    createdAt: timestamp("created_at", { withTimezone: false }).notNull().defaultNow(),
  },
  (t) => [
    index("media_assets_kind_idx").on(t.kind),
    index("media_assets_sha256_idx").on(t.sha256),
  ],
);

export type MediaAsset = typeof mediaAssets.$inferSelect;
export type InsertMediaAsset = typeof mediaAssets.$inferInsert;
