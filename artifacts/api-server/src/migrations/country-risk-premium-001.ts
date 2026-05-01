import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "country-risk-premium-001";

export async function runMigration(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE properties
      ADD COLUMN IF NOT EXISTS country_risk_premium real
    `);

    logger.info(`[${TAG}] country_risk_premium column added to properties (or already existed)`);
  } catch (error: unknown) {
    logger.error(`[${TAG}] Migration failed: ${String(error)}`, TAG);
    throw error;
  }
}
