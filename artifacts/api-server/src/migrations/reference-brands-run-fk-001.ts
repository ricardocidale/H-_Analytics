/**
 * reference-brands-run-fk-001 — Add FK and index for refreshed_by_run_id.
 *
 * The column was added in reference_brands_001 as a bare integer, but the FK
 * constraint and covering index were never created. This migration adds both
 * idempotently so they match the Drizzle schema declaration.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "reference-brands-run-fk-001";

export async function runReferenceBrandsRunFk001(): Promise<void> {
  try {
    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'reference_brands_refreshed_by_run_id_fk'
            AND table_name = 'reference_brands'
        ) THEN
          ALTER TABLE reference_brands
            ADD CONSTRAINT reference_brands_refreshed_by_run_id_fk
            FOREIGN KEY (refreshed_by_run_id)
            REFERENCES research_runs(id)
            ON DELETE SET NULL;
        END IF;
      END
      $$
    `);
    logger.info(`[${TAG}] FK reference_brands_refreshed_by_run_id_fk ensured`);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS reference_brands_refreshed_by_run_id_idx
        ON reference_brands (refreshed_by_run_id)
        WHERE refreshed_by_run_id IS NOT NULL
    `);
    logger.info(`[${TAG}] Index reference_brands_refreshed_by_run_id_idx ensured`);
  } catch (error: unknown) {
    logger.error(`[${TAG}] Migration failed: ${String(error)}`, TAG);
    throw error;
  }
}
