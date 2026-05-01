import { sql } from "drizzle-orm";
import { db } from "../db";

/**
 * Storage layer for media_assets — keeps the route handler free of direct
 * drizzle-orm/db imports (Domain Boundary rule). Raw SQL is used here on
 * purpose: the bytea column trips drizzle's select-shape inference, and we
 * want streaming-friendly Buffer values without intermediate codec layers.
 */
export interface MediaAssetRow {
  contentType: string;
  bytes: Buffer;
  sizeBytes: number;
  sha256: string;
}

interface RawMediaRow extends Record<string, unknown> {
  content_type: string;
  bytes: Buffer;
  size_bytes: number;
  sha256: string;
}

export interface MediaStorage {
  getMediaByFilename(filename: string): Promise<MediaAssetRow | null>;
}

export class MediaStorageImpl implements MediaStorage {
  async getMediaByFilename(filename: string): Promise<MediaAssetRow | null> {
    const result = await db.execute<RawMediaRow>(sql`
      SELECT content_type, bytes, size_bytes, sha256
      FROM media_assets
      WHERE filename = ${filename}
      LIMIT 1
    `);
    const row = result.rows[0];
    if (!row) return null;
    return {
      contentType: row.content_type,
      bytes: row.bytes,
      sizeBytes: row.size_bytes,
      sha256: row.sha256,
    };
  }
}
