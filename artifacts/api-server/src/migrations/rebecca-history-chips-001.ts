import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "rebecca-history-chips-001";

export async function runRebeccaHistoryChips001(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS rebecca_history_open boolean,
        ADD COLUMN IF NOT EXISTS rebecca_suggested_chips jsonb
    `);

    logger.info(`[${TAG}] rebecca_history_open and rebecca_suggested_chips columns added to users (or already existed)`);
  } catch (error: unknown) {
    logger.error(`[${TAG}] Migration failed: ${String(error)}`, TAG);
    throw error;
  }
}
