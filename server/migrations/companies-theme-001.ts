import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "companies-theme-001";

export async function runMigration(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE companies
      ADD COLUMN IF NOT EXISTS theme_id integer
    `);
    logger.info("Migration complete", TAG);
  } catch (error: unknown) {
    logger.error(`Migration failed: ${error}`, TAG);
  }
}
