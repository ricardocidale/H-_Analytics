/**
 * Task #559 — Add scheduled-replay tracking columns to
 * `rebecca_preview_fixtures`. The fixture-replay scheduler
 * (server/jobs/rebecca-fixture-replay.ts) writes the rolled-up replay
 * outcome into these columns so the admin fixtures panel can render a
 * per-fixture last-run badge without re-running the replay client-side.
 *
 * All four columns are nullable: a never-replayed fixture (e.g. one
 * created before the scheduler shipped, or while the kill switch was
 * on) shows up in the panel with no badge instead of a fake "pass".
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "rebecca-fixture-replay-001";

export async function runRebeccaFixtureReplay001(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE rebecca_preview_fixtures
        ADD COLUMN IF NOT EXISTS last_replay_at         timestamp,
        ADD COLUMN IF NOT EXISTS last_replay_status     text,
        ADD COLUMN IF NOT EXISTS last_replay_summary    jsonb,
        ADD COLUMN IF NOT EXISTS last_replay_fingerprint text
    `);
    logger.info(`[${TAG}] last-replay columns ensured on rebecca_preview_fixtures`);
  } catch (error: unknown) {
    logger.error(`[${TAG}] Migration failed: ${String(error)}`, TAG);
    throw error;
  }
}
