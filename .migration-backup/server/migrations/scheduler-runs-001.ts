/**
 * Task #542 — Create the `scheduler_runs` table.
 *
 * One row per background scheduler. Schedulers upsert this row at the end
 * of every cycle (success or failure) so the Admin → Observability page
 * can render "last run, what happened, did it fail" without scraping the
 * structured server log.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "scheduler-runs-001";

export async function runSchedulerRuns001(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS scheduler_runs (
        scheduler_key      text PRIMARY KEY,
        scheduler_label    text NOT NULL,
        last_run_at        timestamp NOT NULL DEFAULT NOW(),
        considered         integer NOT NULL DEFAULT 0,
        succeeded          integer NOT NULL DEFAULT 0,
        failed             integer NOT NULL DEFAULT 0,
        status             text NOT NULL,
        notes              text,
        cycle_interval_ms  bigint NOT NULL,
        duration_ms        integer,
        updated_at         timestamp NOT NULL DEFAULT NOW()
      )
    `);
    logger.info(`[${TAG}] scheduler_runs table created (or already existed)`);
  } catch (error: unknown) {
    logger.error(`[${TAG}] Migration failed: ${String(error)}`, TAG);
    throw error;
  }
}
