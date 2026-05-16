/**
 * scenario-perspective-role-001 — Add perspective_role column to scenarios.
 *
 * Adds:
 *   - perspective_role  text NOT NULL DEFAULT 'operator'
 *
 * Idempotent — ADD COLUMN IF NOT EXISTS + DEFAULT ensures existing rows get
 * the correct default without a separate backfill.
 * Mirrors migration 0074_scenario_perspective_role.sql.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] scenario-perspective-role-001";

export async function runScenarioPerspectiveRole001(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE scenarios
    ADD COLUMN IF NOT EXISTS perspective_role text NOT NULL DEFAULT 'operator'
  `);

  logger.info(`${TAG} perspective_role column ensured on scenarios`);
}
