import { sql } from "drizzle-orm";
import { db } from "../db";
import { logger } from "../logger";

export async function runPropertyUrlsMigration() {
  const TAG = "[migration] property-urls-001";

  const exists = await db.execute(sql`
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'property_urls'
  `);

  if (exists.rows.length > 0) {
    logger.info(`${TAG} Table property_urls already exists, skipping`);
    return;
  }

  logger.info(`${TAG} Creating property_urls table…`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS property_urls (
      id SERIAL PRIMARY KEY,
      property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      label VARCHAR(200),
      is_valid BOOLEAN,
      is_relevant BOOLEAN,
      relevance_score REAL,
      last_checked_at TIMESTAMP,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_property_urls_property_id ON property_urls(property_id)
  `);

  logger.info(`${TAG} Done`);
}
