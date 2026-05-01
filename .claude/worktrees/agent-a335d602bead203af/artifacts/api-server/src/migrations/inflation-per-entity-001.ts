import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "inflation-per-entity-001";

export async function runMigration(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE properties
      ADD COLUMN IF NOT EXISTS inflation_rate real
    `);

    await db.execute(sql`
      ALTER TABLE properties
      ADD COLUMN IF NOT EXISTS escalation_method text DEFAULT 'annual'
    `);

    await db.execute(sql`
      ALTER TABLE global_assumptions
      ADD COLUMN IF NOT EXISTS company_inflation_rate real
    `);

    await db.execute(sql`
      ALTER TABLE global_assumptions
      ADD COLUMN IF NOT EXISTS company_phone text,
      ADD COLUMN IF NOT EXISTS company_email text,
      ADD COLUMN IF NOT EXISTS company_website text,
      ADD COLUMN IF NOT EXISTS company_ein text,
      ADD COLUMN IF NOT EXISTS company_founding_year integer,
      ADD COLUMN IF NOT EXISTS company_street_address text,
      ADD COLUMN IF NOT EXISTS company_city text,
      ADD COLUMN IF NOT EXISTS company_state_province text,
      ADD COLUMN IF NOT EXISTS company_country text,
      ADD COLUMN IF NOT EXISTS company_zip_postal_code text
    `);

    logger.info(`[${TAG}] Per-entity inflation and company profile columns added (or already existed)`);
  } catch (error: unknown) {
    logger.error(`[${TAG}] Migration failed: ${String(error)}`, TAG);
    throw error;
  }
}
