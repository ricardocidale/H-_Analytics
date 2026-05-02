/**
 * property-slide-decks-001 — Create the `property_slide_decks` table.
 *
 * Tracks per-property PPTX generation status and R2 storage key so that
 * slides are pre-generated and cached rather than generated on every download.
 *
 * Status lifecycle: idle → generating → ready | error
 * Admin triggers regeneration via POST /api/properties/:id/slides/generate.
 * Download via GET /api/properties/:id/slides streams from R2.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "property-slide-decks-001";

export async function runPropertySlideDecks001(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS property_slide_decks (
        property_id     integer PRIMARY KEY,
        status          text NOT NULL DEFAULT 'idle',
        r2_key          text,
        file_size_bytes integer,
        generated_at    timestamptz,
        triggered_by    text,
        error_message   text,
        updated_at      timestamptz NOT NULL DEFAULT NOW()
      )
    `);
    logger.info(`[${TAG}] property_slide_decks table created (or already existed)`);
  } catch (error: unknown) {
    logger.error(`[${TAG}] Migration failed: ${String(error)}`, TAG);
    throw error;
  }
}
