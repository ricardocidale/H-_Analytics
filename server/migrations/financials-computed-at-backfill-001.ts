import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "financials-computed-at-backfill-001";

/**
 * Task #442 backfill. The `properties.financials_computed_at` column was
 * added by `properties_financials_computed_at_001` (Task #454/#426) but
 * left null for every existing row. The Analyst's
 * `all-properties-financials-computed` prerequisite (see
 * engine/analyst/registry/prerequisite-registry.ts) reads this column to
 * decide whether the per-property numbers are fresh — so without a
 * one-shot backfill the gate would false-positive every property as stale
 * the moment the new prerequisite ships, blocking every portfolio
 * Specialist until each property is touched again.
 *
 * Strategy: for each row with a null `financials_computed_at`, copy the
 * existing `updated_at` timestamp (which is itself stamped on every row
 * write, including the per-property recompute paths that historically
 * called `updateProperty`). That gives a defensible per-property
 * "last touched" baseline instead of a synthetic `now()` that would
 * declare every property simultaneously fresh on deploy.
 *
 * Idempotent: only updates rows where the column is still null, so
 * re-running this migration is safe and the running app's freshly
 * stamped timestamps are never clobbered.
 */
export async function runFinancialsComputedAtBackfill001(): Promise<void> {
  try {
    const result = await db.execute(sql`
      UPDATE properties
      SET financials_computed_at = updated_at
      WHERE financials_computed_at IS NULL
    `);
    const rowCount = (result as { rowCount?: number }).rowCount ?? 0;
    logger.info(
      `[${TAG}] Backfilled financials_computed_at for ${rowCount} property(ies)`,
    );
  } catch (error: unknown) {
    logger.error(`[${TAG}] Migration failed: ${String(error)}`, TAG);
    throw error;
  }
}
