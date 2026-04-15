import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "rebecca-opt-out-001";

export async function runRebeccaOptOut001(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS rebecca_opt_out boolean NOT NULL DEFAULT false
    `);

    logger.info(`[${TAG}] rebecca_opt_out column added to users (or already existed)`);
  } catch (error: unknown) {
    logger.error(`[${TAG}] Migration failed: ${String(error)}`, TAG);
    throw error;
  }
}
