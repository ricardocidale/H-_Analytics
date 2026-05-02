/**
 * property-photos-hero-unique-001 — Enforce at-most-one hero per property.
 *
 * The `is_hero` flag on property_photos is maintained as a single-per-property
 * invariant in application code (setHeroPhoto, addPropertyPhoto), but concurrent
 * uploads can produce duplicate heroes — two calls both see `isFirst = true` and
 * both insert with is_hero = true in the same transaction window.
 *
 * A partial unique index at the DB level is the authoritative guard:
 *   UNIQUE (property_id) WHERE is_hero = true
 *
 * This migration:
 *   1. Deduplicates any existing rows with multiple heroes per property by
 *      setting all but the lowest-sort_order (tie-break: lowest id) to false.
 *   2. Creates the partial unique index idempotently (IF NOT EXISTS).
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "property-photos-hero-unique-001";

export async function runPropertyPhotosHeroUnique001(): Promise<void> {
  try {
    // Step 1: Deduplicate. For each property with >1 hero, keep the row with
    // the smallest sort_order (most "primary" position), tie-breaking on the
    // smallest id (oldest row). All other is_hero=true rows are cleared.
    const dedupe = await db.execute(sql`
      UPDATE property_photos
      SET is_hero = false
      WHERE id IN (
        SELECT id FROM (
          SELECT
            id,
            ROW_NUMBER() OVER (
              PARTITION BY property_id
              ORDER BY sort_order ASC, id ASC
            ) AS rn
          FROM property_photos
          WHERE is_hero = true
        ) ranked
        WHERE rn > 1
      )
    `);
    const cleared = dedupe.rowCount ?? 0;
    if (cleared > 0) {
      logger.info(`[${TAG}] Cleared is_hero on ${cleared} duplicate hero row(s)`);
    }

    // Step 2: Partial unique index — at most one hero per property.
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS property_photos_single_hero_idx
        ON property_photos (property_id)
        WHERE is_hero = true
    `);
    logger.info(`[${TAG}] Partial unique index property_photos_single_hero_idx ensured`);
  } catch (error: unknown) {
    logger.error(`[${TAG}] Migration failed: ${String(error)}`, TAG);
    throw error;
  }
}
