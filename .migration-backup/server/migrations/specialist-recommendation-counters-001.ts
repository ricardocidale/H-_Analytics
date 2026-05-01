/**
 * Task #438 — Per-(specialistId, fieldKey) appearance counter for the
 * Required Fields recommendations card.
 *
 * Creates `specialist_recommendation_counters`. Each row tracks how many
 * Specialist runs have surfaced a given catalog candidate field in the
 * observed-missing list since the last promotion. Promotions annotate the
 * row by setting `last_promoted_at` and resetting `appearances` to 0.
 *
 * Non-destructive: CREATE TABLE / INDEX IF NOT EXISTS. Safe to re-run.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] specialist-recommendation-counters-001";

export async function runSpecialistRecommendationCounters001(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS specialist_recommendation_counters (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      specialist_id text NOT NULL,
      field_key text NOT NULL,
      appearances integer NOT NULL DEFAULT 0,
      first_observed_at timestamp NOT NULL DEFAULT now(),
      last_observed_at timestamp NOT NULL DEFAULT now(),
      last_promoted_at timestamp
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS specialist_rec_counters_uniq
      ON specialist_recommendation_counters (specialist_id, field_key)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS specialist_rec_counters_specialist_idx
      ON specialist_recommendation_counters (specialist_id)
  `);
  logger.info(`${TAG} specialist_recommendation_counters ready`);
}
