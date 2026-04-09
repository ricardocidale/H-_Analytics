import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "can-manage-scenarios-001";

export async function runCanManageScenarios001(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS can_manage_scenarios boolean NOT NULL DEFAULT true
    `);

    logger.info(`[${TAG}] can_manage_scenarios column added to users (or already existed)`);
  } catch (error: unknown) {
    logger.error(`[${TAG}] Migration failed: ${String(error)}`, TAG);
    throw error;
  }
}
