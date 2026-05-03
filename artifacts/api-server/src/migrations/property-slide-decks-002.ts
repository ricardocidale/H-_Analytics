/**
 * property-slide-decks-002 — Add FK to properties and status CHECK constraint.
 *
 * The original 001 migration omitted both guards for speed. This migration
 * adds them idempotently (using DO blocks) so it is safe to run against a
 * table that already has existing rows.
 *
 * Changes:
 *   • FK: property_slide_decks.property_id → properties.id ON DELETE CASCADE
 *     Ensures orphan rows are cleaned up when a property is deleted.
 *
 *   • CHECK: status IN ('idle','generating','ready','error')
 *     Prevents the app layer from writing arbitrary status strings and makes
 *     the lifecycle contract visible at the DB level.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "property-slide-decks-002";

export async function runPropertySlideDecks002(): Promise<void> {
  try {
    await db.execute(sql`
      DO $$
      BEGIN
        -- FK: property_id → properties.id
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'property_slide_decks_property_id_fk'
            AND table_name = 'property_slide_decks'
        ) THEN
          ALTER TABLE property_slide_decks
            ADD CONSTRAINT property_slide_decks_property_id_fk
            FOREIGN KEY (property_id)
            REFERENCES properties(id)
            ON DELETE CASCADE;
        END IF;

        -- CHECK: valid status values
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'property_slide_decks_status_check'
            AND table_name = 'property_slide_decks'
        ) THEN
          ALTER TABLE property_slide_decks
            ADD CONSTRAINT property_slide_decks_status_check
            CHECK (status IN ('idle', 'generating', 'ready', 'error'));
        END IF;
      END
      $$
    `);
    logger.info(`[${TAG}] FK and CHECK constraints ensured on property_slide_decks`);
  } catch (error: unknown) {
    logger.error(`[${TAG}] Migration failed: ${String(error)}`, TAG);
    throw error;
  }
}
