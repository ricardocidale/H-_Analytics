/**
 * property-refi-max-ltv-001 — Per-property refi-LTV cap (Plan 2026-05-13-001 U2)
 *
 * Belt-and-suspenders runtime migration that runs after the Drizzle SQL
 * migration 0064_property_refi_max_ltv_cap.sql. Idempotent.
 *
 * Adds the `properties.refi_max_ltv_to_original` column (real, NOT NULL,
 * default 0.70) and the matching CHECK constraint. Mirrors the SQL migration
 * exactly so dev DBs whose `_journal.json` has drifted past 0064 still end up
 * with the column populated.
 *
 * Why a runtime guard in addition to the SQL migration? Same rationale as
 * icp-brackets-003: drift between the Drizzle journal and the live DB
 * happens, and the runtime guard heals it on every boot via ADD COLUMN
 * IF NOT EXISTS. The DO-block-guarded CHECK addition prevents constraint
 * duplication on re-run.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] property-refi-max-ltv-001";

export async function runPropertyRefiMaxLtv001(): Promise<void> {
  logger.info(
    `${TAG} Adding refi_max_ltv_to_original column to properties (idempotent)`,
    "migration",
  );

  await db.execute(sql`
    ALTER TABLE "properties"
    ADD COLUMN IF NOT EXISTS "refi_max_ltv_to_original" real NOT NULL DEFAULT 0.70
  `);

  // CHECK constraint added separately so a re-run does not error on duplicate
  // constraint name. Drizzle's named CHECK constraints are not auto-skipped
  // when the column exists.
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'prop_refi_max_ltv_to_original_range'
      )
      AND EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'properties'
          AND column_name = 'refi_max_ltv_to_original'
      ) THEN
        ALTER TABLE "properties"
          ADD CONSTRAINT "prop_refi_max_ltv_to_original_range"
          CHECK ("refi_max_ltv_to_original" >= 0 AND "refi_max_ltv_to_original" <= 1);
      END IF;
    END $$
  `);

  logger.info(`${TAG} refi_max_ltv_to_original column + CHECK ensured`, "migration");
}
