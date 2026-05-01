/**
 * Task #454 (Phase 4) — Promote-vs-ignore telemetry for Specialist
 * Required Fields tab.
 *
 * Creates the append-only `specialist_recommendation_events` table that
 * the Required Fields card writes to on every promote click, every
 * explicit Ignore click, and (passively) when the admin leaves the page
 * with unacted recommendations still visible. Aggregating by
 * (specialist_id, field_key) gives the promote-vs-ignore ratio that
 * calibrates whether a catalog key should be default-"recommended" in a
 * future release.
 *
 * Non-destructive: CREATE TABLE IF NOT EXISTS + IF NOT EXISTS on each
 * index. Safe to re-run.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] specialist-recommendation-events-001";

export async function runSpecialistRecommendationEvents001(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS specialist_recommendation_events (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      specialist_id text NOT NULL,
      field_key text NOT NULL,
      action text NOT NULL,
      actor_user_id integer REFERENCES users(id) ON DELETE SET NULL,
      occurred_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS specialist_rec_events_specialist_idx
      ON specialist_recommendation_events (specialist_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS specialist_rec_events_specialist_field_idx
      ON specialist_recommendation_events (specialist_id, field_key)
  `);
  logger.info(`${TAG} specialist_recommendation_events ready`);
}
