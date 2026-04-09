import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "research-config-001";

/**
 * Adds research_config JSONB column to global_assumptions.
 * Stores per-event AI research configuration (tools, context, focus areas).
 * Safe to run multiple times — uses IF NOT EXISTS.
 */
export async function runMigration(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE global_assumptions
      ADD COLUMN IF NOT EXISTS research_config jsonb DEFAULT '{}'::jsonb
    `);
    logger.info(`[${TAG}] research_config column added (or already existed)`);
  } catch (error: unknown) {
    logger.error(`[${TAG}] Migration failed: ${String(error)}`, TAG);
    throw error;
  }
}
