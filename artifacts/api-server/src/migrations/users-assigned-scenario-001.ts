import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "users-assigned-scenario-001";

export async function runUsersAssignedScenario001(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "assigned_scenario_id" integer
    `);
    await db.execute(sql`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'users_assigned_scenario_id_fkey'
        ) THEN
          ALTER TABLE "users"
            ADD CONSTRAINT "users_assigned_scenario_id_fkey"
            FOREIGN KEY ("assigned_scenario_id") REFERENCES "scenarios"("id") ON DELETE SET NULL;
        END IF;
      END $$
    `);
    logger.info(`[${TAG}] users.assigned_scenario_id column + FK ensured`);
  } catch (error: unknown) {
    logger.error(`[${TAG}] Migration failed: ${String(error)}`, TAG);
    throw error;
  }
}
