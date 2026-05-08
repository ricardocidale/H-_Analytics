/**
 * admin-resources-006 — Pietro data infrastructure column.
 *
 * Adds daily_request_budget to admin_resources. Belt-and-suspenders for the
 * 0044 SQL migration — ensures the column exists on any DB regardless of
 * Drizzle journal state.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] admin-resources-006";

export async function runAdminResources006(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE admin_resources
      ADD COLUMN IF NOT EXISTS daily_request_budget integer
  `);
  logger.info(`${TAG} daily_request_budget column ensured`);
}
