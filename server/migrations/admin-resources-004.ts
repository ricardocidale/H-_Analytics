/**
 * Task #500 — AI Intelligence transparency hub.
 *
 * Adds `specialist_research_quality_snapshots`: lightweight per-Specialist
 * quality store powering the "Quality & Gaps" surfaces. Append-only history
 * (one row per (specialistId, computedAt)); the most recent row is the
 * authoritative current snapshot.
 *
 * Non-destructive: CREATE TABLE IF NOT EXISTS. Safe to re-run.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] admin-resources-004";

export async function runAdminResources004(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS specialist_research_quality_snapshots (
      id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      specialist_id text NOT NULL,
      score integer NOT NULL,
      gaps jsonb NOT NULL DEFAULT '[]'::jsonb,
      signals jsonb NOT NULL DEFAULT '{}'::jsonb,
      computed_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS specialist_quality_specialist_idx
      ON specialist_research_quality_snapshots (specialist_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS specialist_quality_specialist_time_idx
      ON specialist_research_quality_snapshots (specialist_id, computed_at)
  `);
  logger.info(`${TAG} specialist_research_quality_snapshots ready`);
}
