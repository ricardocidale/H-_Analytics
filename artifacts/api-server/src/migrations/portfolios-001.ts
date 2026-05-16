import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "portfolios-001";

export async function runPortfolios001(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "portfolios" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "name" varchar(255) NOT NULL,
        "description" text,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "portfolios_user_id_idx" ON "portfolios" ("user_id")
    `);
    await db.execute(sql`
      ALTER TABLE "properties"
        ADD COLUMN IF NOT EXISTS "portfolio_id" integer
    `);
    await db.execute(sql`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'properties_portfolio_id_portfolios_id_fk'
        ) THEN
          ALTER TABLE "properties"
            ADD CONSTRAINT "properties_portfolio_id_portfolios_id_fk"
            FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE SET NULL;
        END IF;
      END $$
    `);
    logger.info(`[${TAG}] portfolios table + properties.portfolio_id ensured`);
  } catch (error: unknown) {
    logger.error(`[${TAG}] Migration failed: ${String(error)}`, TAG);
    throw error;
  }
}
