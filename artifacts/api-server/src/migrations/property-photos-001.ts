import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "property-photos-001";

/**
 * Creates the property_photos table and seeds one photo per existing property
 * from each property's current imageUrl (marked as hero).
 */
export async function runPropertyPhotos001(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS property_photos (
        id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
        property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
        image_url TEXT NOT NULL,
        caption TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_hero BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS property_photos_property_id_idx
      ON property_photos (property_id)
    `);

    // Add propertyPhotos column to scenarios (for snapshot compatibility)
    await db.execute(sql`
      ALTER TABLE scenarios
        ADD COLUMN IF NOT EXISTS property_photos JSONB
    `);

    await db.execute(sql`
      ALTER TABLE property_photos
        ADD COLUMN IF NOT EXISTS variants JSONB
    `);

    await db.execute(sql`
      ALTER TABLE property_photos
        ADD COLUMN IF NOT EXISTS generation_style TEXT
    `);

    await db.execute(sql`
      ALTER TABLE property_photos
        ADD COLUMN IF NOT EXISTS before_photo_id INTEGER
    `);

    // Seed one hero photo per property from existing imageUrl (idempotent)
    await db.execute(sql`
      INSERT INTO property_photos (property_id, image_url, sort_order, is_hero)
      SELECT p.id, p.image_url, 0, true
      FROM properties p
      WHERE p.image_url IS NOT NULL
        AND p.image_url != ''
        AND NOT EXISTS (
          SELECT 1 FROM property_photos pp WHERE pp.property_id = p.id
        )
    `);

    logger.info("Migration complete", TAG);
  } catch (error: unknown) {
    logger.error(`Migration failed: ${error}`, TAG);
  }
}
