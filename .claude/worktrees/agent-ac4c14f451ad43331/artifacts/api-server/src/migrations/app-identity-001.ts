import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "app-identity-001";

export async function runAppIdentity001(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE global_assumptions
      ADD COLUMN IF NOT EXISTS app_name text
    `);

    await db.execute(sql`
      ALTER TABLE logos
      ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'all'
    `);

    await db.execute(sql`
      UPDATE logos SET visibility = 'super_admin_only'
      WHERE is_app_logo = true AND visibility = 'all'
    `);

    logger.info(`[${TAG}] Added app_name to global_assumptions, visibility to logos`);
  } catch (error: unknown) {
    logger.error(`[${TAG}] Migration failed: ${String(error)}`, TAG);
    throw error;
  }
}
