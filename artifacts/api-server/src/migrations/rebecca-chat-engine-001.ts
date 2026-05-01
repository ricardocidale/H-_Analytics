import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "rebecca-chat-engine-001";

export async function runRebeccaChatEngine001(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE global_assumptions
      ADD COLUMN IF NOT EXISTS rebecca_chat_engine text NOT NULL DEFAULT 'gemini'
    `);
    logger.info(`[${TAG}] rebecca_chat_engine column added (or already existed)`);
  } catch (error: unknown) {
    logger.error(`[${TAG}] Migration failed: ${String(error)}`, TAG);
    throw error;
  }
}
