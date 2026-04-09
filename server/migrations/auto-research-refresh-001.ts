import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "auto-research-refresh-001";

export async function runMigration(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE global_assumptions
      ADD COLUMN IF NOT EXISTS auto_research_refresh_enabled boolean NOT NULL DEFAULT false
    `);
    await db.execute(sql`
      ALTER TABLE global_assumptions
      ALTER COLUMN auto_research_refresh_enabled SET DEFAULT false
    `);
    await db.execute(sql`
      UPDATE global_assumptions SET auto_research_refresh_enabled = false
      WHERE auto_research_refresh_enabled = true
    `);
    logger.info(`[${TAG}] auto_research_refresh_enabled column added (or already existed)`);
  } catch (error: unknown) {
    logger.error(`[${TAG}] Migration failed: ${String(error)}`, TAG);
    throw error;
  }
}
