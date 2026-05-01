import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "app-logo-001";

export async function runAppLogo001(): Promise<void> {
  await db.execute(
    sql`ALTER TABLE logos ADD COLUMN IF NOT EXISTS is_app_logo BOOLEAN NOT NULL DEFAULT false`
  );
  await db.execute(
    sql`UPDATE logos SET is_app_logo = true WHERE is_default = true AND NOT EXISTS (SELECT 1 FROM logos WHERE is_app_logo = true)`
  );
  logger.info(`[${TAG}] Migration complete`);
}
