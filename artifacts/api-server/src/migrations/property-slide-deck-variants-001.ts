/**
 * property-slide-deck-variants-001
 *
 * Replaces the single-row `property_slide_decks` table with
 * `property_slide_deck_variants` — one row per (property_id, format) so Track 1
 * (pptx) and Track 2 (image) are stored and managed independently.
 *
 * Steps (all idempotent):
 *   1. Create property_slide_deck_variants with composite PK (property_id, format)
 *   2. Copy existing property_slide_decks rows as format='pptx'
 *   3. Drop property_slide_decks (if it exists)
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "property-slide-deck-variants-001";

export async function runPropertySlideDeckVariants001(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS property_slide_deck_variants (
        property_id     integer    NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
        format          text       NOT NULL,
        status          text       NOT NULL DEFAULT 'idle',
        r2_key          text,
        file_size_bytes integer,
        generated_at    timestamptz,
        triggered_by    text,
        error_message   text,
        updated_at      timestamptz NOT NULL DEFAULT NOW(),
        PRIMARY KEY (property_id, format),
        CONSTRAINT property_slide_deck_variants_format_check
          CHECK (format IN ('pptx', 'image')),
        CONSTRAINT property_slide_deck_variants_status_check
          CHECK (status IN ('idle', 'generating', 'ready', 'error'))
      )
    `);
    logger.info(`[${TAG}] property_slide_deck_variants table created (or already existed)`);

    // Copy old single-format rows as format='pptx' when the old table still exists.
    const { rows: tableCheck } = await db.execute(sql`
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'property_slide_decks'
    `);
    if (tableCheck.length > 0) {
      await db.execute(sql`
        INSERT INTO property_slide_deck_variants
          (property_id, format, status, r2_key, file_size_bytes, generated_at, triggered_by, error_message, updated_at)
        SELECT
          property_id, 'pptx', status, r2_key, file_size_bytes, generated_at, triggered_by, error_message, updated_at
        FROM property_slide_decks
        ON CONFLICT (property_id, format) DO NOTHING
      `);
      await db.execute(sql`DROP TABLE property_slide_decks`);
      logger.info(`[${TAG}] Migrated rows from property_slide_decks → property_slide_deck_variants and dropped old table`);
    }
  } catch (error: unknown) {
    logger.error(`[${TAG}] Migration failed: ${String(error)}`, TAG);
    throw error;
  }
}
