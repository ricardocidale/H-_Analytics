import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "appearance-defaults-001";

export async function runAppearanceDefaults001(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE global_assumptions
      ADD COLUMN IF NOT EXISTS default_color_mode text
    `);
    await db.execute(sql`
      ALTER TABLE global_assumptions
      ADD COLUMN IF NOT EXISTS default_bg_animation text
    `);
    await db.execute(sql`
      ALTER TABLE global_assumptions
      ADD COLUMN IF NOT EXISTS default_font_preference text
    `);

    logger.info(`[${TAG}] Appearance default columns added to global_assumptions (or already existed)`);
  } catch (error: unknown) {
    logger.error(`[${TAG}] Migration failed: ${String(error)}`, TAG);
    throw error;
  }
}
