/**
 * P5 follow-up — admin-editable Constants refresh cadence.
 *
 * Adds a nullable `refresh_cadence_days` column to `specialist_configs`
 * (override layer over the catalog default) and to
 * `specialist_config_versions` (snapshot for the Audit tab).
 *
 * Non-destructive: ADD COLUMN IF NOT EXISTS. Safe to re-run.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] admin-resources-003";

export async function runAdminResources003(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE specialist_configs
      ADD COLUMN IF NOT EXISTS refresh_cadence_days integer
  `);
  await db.execute(sql`
    ALTER TABLE specialist_config_versions
      ADD COLUMN IF NOT EXISTS refresh_cadence_days integer
  `);
  logger.info(`${TAG} specialist_configs.refresh_cadence_days column ready`);
}
