import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "rebecca-chat-prefs-001";

export async function runRebeccaChatPrefs001(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS rebecca_response_mode text,
        ADD COLUMN IF NOT EXISTS rebecca_show_tool_timing boolean
    `);

    logger.info(`[${TAG}] rebecca_response_mode and rebecca_show_tool_timing columns added to users (or already existed)`);
  } catch (error: unknown) {
    logger.error(`[${TAG}] Migration failed: ${String(error)}`, TAG);
    throw error;
  }
}
