import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "enhanced-photo-001";

export async function runEnhancedPhoto001(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE property_photos
        ADD COLUMN IF NOT EXISTS enhanced_image_data TEXT
    `);
    logger.info("Added enhanced_image_data column to property_photos", TAG);
  } catch (error) {
    logger.error(`Migration failed: ${error}`, TAG);
    throw error;
  }
}
