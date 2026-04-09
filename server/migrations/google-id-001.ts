import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "google-id-001";

export async function runGoogleId001(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS google_id text
    `);

    logger.info(`[${TAG}] google_id column added to users (or already existed)`);
  } catch (error: unknown) {
    logger.error(`[${TAG}] Migration failed: ${String(error)}`, TAG);
    throw error;
  }
}
