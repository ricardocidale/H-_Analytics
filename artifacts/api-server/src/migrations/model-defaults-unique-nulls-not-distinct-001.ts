/**
 * model-defaults-unique-nulls-not-distinct-001 — DB audit fix 2026-05-14
 *
 * Root cause (from DB audit by Replit, 2026-05-14):
 *   The unique index `uq_model_defaults_key_scope` on
 *   (default_key, country, country_subdivision, business_type, size_band)
 *   uses the default PostgreSQL behavior where NULL ≠ NULL inside unique
 *   indexes. All production rows have NULL for all four scope columns, so
 *   every server boot that runs the seed inserts 52 new rows without
 *   triggering the ON CONFLICT clause — building 52 duplicates per boot.
 *   Over ~1,854 boots this produced 85,926 rows for 52 distinct keys.
 *
 * Fix:
 *   DROP the old constraint and CREATE a UNIQUE INDEX with NULLS NOT DISTINCT
 *   (PostgreSQL 15+). This makes NULL = NULL inside the index, so re-seeding
 *   is fully idempotent.
 *
 * Idempotent: DROP CONSTRAINT IF EXISTS + CREATE UNIQUE INDEX IF NOT EXISTS
 * ensure the guard is safe to re-run.
 *
 * Note: CREATE INDEX cannot run inside a transaction — this guard lives as a
 * runtime patch rather than a Drizzle SQL migration for that reason.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] model-defaults-unique-nulls-not-distinct-001";

export async function runModelDefaultsUniqueNullsNotDistinct001(): Promise<void> {
  logger.info(`${TAG} Replacing uq_model_defaults_key_scope with NULLS NOT DISTINCT index`);

  // Drop the old UNIQUE CONSTRAINT (allows NULLs to be considered non-equal)
  await db.execute(sql`
    ALTER TABLE model_defaults
    DROP CONSTRAINT IF EXISTS uq_model_defaults_key_scope
  `);
  logger.info(`${TAG} Dropped constraint uq_model_defaults_key_scope (if existed)`);

  // Create new UNIQUE INDEX with NULLS NOT DISTINCT so re-seeding is idempotent
  // Cannot use IF NOT EXISTS directly with NULLS NOT DISTINCT in all PG 15 builds;
  // use DO $$ block for safe conditional creation.
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'model_defaults'
          AND indexname = 'uq_model_defaults_key_scope'
      ) THEN
        CREATE UNIQUE INDEX uq_model_defaults_key_scope
          ON model_defaults (default_key, country, country_subdivision, business_type, size_band)
          NULLS NOT DISTINCT;
      END IF;
    END$$
  `);
  logger.info(`${TAG} Created UNIQUE INDEX uq_model_defaults_key_scope NULLS NOT DISTINCT`);
}
