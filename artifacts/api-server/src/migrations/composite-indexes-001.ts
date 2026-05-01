import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "composite-indexes-001";

/**
 * Adds composite indexes on high-traffic query patterns.
 * Safe to run multiple times — uses IF NOT EXISTS.
 */
export async function runCompositeIndexes001(): Promise<void> {
  try {
    // Sessions: hourly cleanup scans by expiresAt
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at)
    `);

    // Market research: grouped by type + sorted by updatedAt
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS market_research_type_updated_idx
      ON market_research (type, updated_at)
    `);

    // Scenarios: filtered by userId + sorted by updatedAt
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS scenarios_user_updated_idx
      ON scenarios (user_id, updated_at)
    `);

    logger.info(`[${TAG}] Composite indexes created (or already existed)`);
  } catch (error: unknown) {
    logger.error(`[${TAG}] Migration failed: ${String(error)}`, TAG);
    throw error;
  }
}
