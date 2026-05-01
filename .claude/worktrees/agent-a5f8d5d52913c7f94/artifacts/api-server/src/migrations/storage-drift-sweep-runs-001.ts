/**
 * Task #528 — Create the `storage_drift_sweep_runs` table.
 *
 * Single-row table (PK = "default") populated by the
 * `storage-reconcile-remediate.yml` workflow's final step. The Admin →
 * Observability page reads this row to surface the last sweep's result
 * (timestamp, exit status, mutation counts, residual unresolved count,
 * link to the GitHub Actions run) without operators having to leave the
 * app and dig through the Actions UI.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "storage-drift-sweep-runs-001";

export async function runStorageDriftSweepRuns001(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS storage_drift_sweep_runs (
        id              text PRIMARY KEY,
        finished_at     timestamp NOT NULL,
        exit_code       integer NOT NULL,
        status          text NOT NULL,
        rewrote_count   integer NOT NULL DEFAULT 0,
        copied_count    integer NOT NULL DEFAULT 0,
        skipped_count   integer NOT NULL DEFAULT 0,
        failed_count    integer NOT NULL DEFAULT 0,
        residual_count  integer NOT NULL DEFAULT 0,
        run_id          text,
        run_url         text,
        trigger         text,
        trigger_reason  text,
        notes           text,
        updated_at      timestamp NOT NULL DEFAULT NOW()
      )
    `);
    logger.info(`[${TAG}] storage_drift_sweep_runs table created (or already existed)`);
  } catch (error: unknown) {
    logger.error(`[${TAG}] Migration failed: ${String(error)}`, TAG);
    throw error;
  }
}
