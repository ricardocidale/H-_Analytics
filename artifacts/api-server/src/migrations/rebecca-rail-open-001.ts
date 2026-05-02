import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "rebecca-rail-open-001";

export async function runRebeccaRailOpen001(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS rebecca_rail_open boolean NOT NULL DEFAULT false
    `);

    logger.info(`[${TAG}] rebecca_rail_open column added to users (or already existed)`);
  } catch (error: unknown) {
    logger.error(`[${TAG}] Migration failed: ${String(error)}`, TAG);
    throw error;
  }
}
