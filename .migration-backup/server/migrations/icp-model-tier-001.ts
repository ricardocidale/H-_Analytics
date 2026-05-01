import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "icp-model-tier-001";

export async function runIcpModelTierMigration(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE global_assumptions
      ADD COLUMN IF NOT EXISTS icp_model_tier text
    `);
    logger.info("Migration complete", TAG);
  } catch (error: unknown) {
    logger.error(`Migration failed: ${error}`, TAG);
  }
}
