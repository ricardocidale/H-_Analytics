import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "themes-system-flag-001";

export async function runThemesSystemFlag001(): Promise<void> {
  await db.execute(
    sql`ALTER TABLE design_themes ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE`
  );
  await db.execute(
    sql`UPDATE design_themes SET is_system = TRUE WHERE id IN (14, 15, 16, 17, 18, 19)`
  );
  logger.info(`[${TAG}] Migration complete`);
}
