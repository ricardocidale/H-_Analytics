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
      CONSTRAINT admin_resources_daily_budget_nonneg CHECK (daily_request_budget IS NULL OR daily_request_budget >= 0)
  `);
  // Belt-and-suspenders: add constraint idempotently if column already existed without it.
  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage
        WHERE table_name = 'admin_resources'
        AND constraint_name = 'admin_resources_daily_budget_nonneg'
      ) THEN
        ALTER TABLE admin_resources
          ADD CONSTRAINT admin_resources_daily_budget_nonneg
          CHECK (daily_request_budget IS NULL OR daily_request_budget >= 0);
      END IF;
    END $$
  `);
  logger.info(`${TAG} daily_request_budget column ensured`);
}
