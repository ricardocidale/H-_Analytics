import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "icon-set-001";

export async function runIconSet001(): Promise<void> {
  await db.execute(
    sql`ALTER TABLE design_themes ADD COLUMN IF NOT EXISTS icon_set TEXT NOT NULL DEFAULT 'lucide'`
  );
  logger.info(`[${TAG}] Migration complete`);
}
