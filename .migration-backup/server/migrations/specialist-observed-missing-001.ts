/**
 * Task #428 — Persist "missing-but-useful" candidate fields observed during
 * Specialist runs so the Required Fields tab can surface them as
 * recommendations.
 *
 * Adds two telemetry-only columns to `specialist_configs`:
 *   - `last_observed_missing` (jsonb, default `[]`): the catalog-key list
 *     observed missing on the most recent run.
 *   - `last_observed_missing_at` (timestamp, nullable): when that list was
 *     written.
 *
 * Telemetry-only: writes deliberately bypass version snapshots / audit log,
 * so we do NOT mirror these onto `specialist_config_versions`.
 *
 * Non-destructive: ADD COLUMN IF NOT EXISTS. Safe to re-run.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] specialist-observed-missing-001";

export async function runSpecialistObservedMissing001(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE specialist_configs
      ADD COLUMN IF NOT EXISTS last_observed_missing jsonb NOT NULL DEFAULT '[]'::jsonb
  `);
  await db.execute(sql`
    ALTER TABLE specialist_configs
      ADD COLUMN IF NOT EXISTS last_observed_missing_at timestamp
  `);
  logger.info(`${TAG} specialist_configs.last_observed_missing columns ready`);
}
