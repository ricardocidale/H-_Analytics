import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "property-notnull-001";

export async function runPropertyNotNullMigration(): Promise<void> {
  await db.execute(sql`
    UPDATE properties SET ar_days = 30 WHERE ar_days IS NULL;
    UPDATE properties SET ap_days = 45 WHERE ap_days IS NULL;
    UPDATE properties SET reinvestment_rate = 0.05 WHERE reinvestment_rate IS NULL;
    UPDATE properties SET day_count_convention = '30/360' WHERE day_count_convention IS NULL;
    UPDATE properties SET escalation_method = 'annual' WHERE escalation_method IS NULL;
    UPDATE properties SET cost_seg_enabled = false WHERE cost_seg_enabled IS NULL;
    UPDATE properties SET cost_seg_5yr_pct = 0.15 WHERE cost_seg_5yr_pct IS NULL;
    UPDATE properties SET cost_seg_7yr_pct = 0.10 WHERE cost_seg_7yr_pct IS NULL;
    UPDATE properties SET cost_seg_15yr_pct = 0.05 WHERE cost_seg_15yr_pct IS NULL;
  `);

  await db.execute(sql`
    ALTER TABLE properties ALTER COLUMN ar_days SET NOT NULL;
    ALTER TABLE properties ALTER COLUMN ap_days SET NOT NULL;
    ALTER TABLE properties ALTER COLUMN reinvestment_rate SET NOT NULL;
    ALTER TABLE properties ALTER COLUMN day_count_convention SET NOT NULL;
    ALTER TABLE properties ALTER COLUMN escalation_method SET NOT NULL;
    ALTER TABLE properties ALTER COLUMN cost_seg_enabled SET NOT NULL;
    ALTER TABLE properties ALTER COLUMN cost_seg_5yr_pct SET NOT NULL;
    ALTER TABLE properties ALTER COLUMN cost_seg_7yr_pct SET NOT NULL;
    ALTER TABLE properties ALTER COLUMN cost_seg_15yr_pct SET NOT NULL;
  `);

  logger.info("Property NOT NULL constraints applied", TAG);
}
