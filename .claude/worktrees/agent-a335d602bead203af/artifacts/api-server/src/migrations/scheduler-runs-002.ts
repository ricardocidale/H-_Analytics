/**
 * Task #558 — Create the `scheduler_run_history` table.
 *
 * Companion append-only table to `scheduler_runs`. The original table keeps
 * only the latest cycle per scheduler (upsert), so a transient failure that
 * is followed by a successful cycle gets silently overwritten and there is
 * nothing to look at when debugging "it failed twice last night, then
 * succeeded". This migration adds the per-cycle history table that the
 * scheduler-run tracker writes into on every cycle, trimmed to the last
 * `SCHEDULER_HISTORY_KEEP` rows per `scheduler_key`.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "scheduler-runs-002";

export async function runSchedulerRuns002(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS scheduler_run_history (
        id             serial PRIMARY KEY,
        scheduler_key  text NOT NULL,
        ran_at         timestamp NOT NULL DEFAULT NOW(),
        considered     integer NOT NULL DEFAULT 0,
        succeeded      integer NOT NULL DEFAULT 0,
        failed         integer NOT NULL DEFAULT 0,
        status         text NOT NULL,
        notes          text,
        duration_ms    integer
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS scheduler_run_history_key_ran_at_idx
        ON scheduler_run_history (scheduler_key, ran_at)
    `);
    logger.info(`[${TAG}] scheduler_run_history table created (or already existed)`);
  } catch (error: unknown) {
    logger.error(`[${TAG}] Migration failed: ${String(error)}`, TAG);
    throw error;
  }
}
