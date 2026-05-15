import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

export async function runPropertyFeeMarkup001(): Promise<void> {
  const TAG = "property-fee-markup-001";
  const check = await db.execute(sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'property_fee_categories' AND column_name = 'service_markup'
  `);
  if ((check as { rows: Array<Record<string, unknown>> }).rows.length > 0) {
    logger.info(`[${TAG}] Column already exists, skipping`);
    return;
  }

  await db.execute(sql`
    ALTER TABLE "property_fee_categories" ADD COLUMN IF NOT EXISTS "service_markup" real
  `);
  logger.info(`[${TAG}] Added service_markup column to property_fee_categories table`);
}
