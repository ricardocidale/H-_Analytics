import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "photo-image-data-001";

/**
 * Adds the image_data column to property_photos so image binaries can be
 * stored directly in Neon PostgreSQL, removing the dependency on Replit
 * Object Storage for persistence.
 */
export async function runPhotoImageData001(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE property_photos
        ADD COLUMN IF NOT EXISTS image_data TEXT
    `);
    logger.info("Added image_data column to property_photos", TAG);
  } catch (error: unknown) {
    logger.error(`Migration failed: ${error}`, TAG);
    throw error;
  }
}
