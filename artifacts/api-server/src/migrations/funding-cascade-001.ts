import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "funding-cascade-001";

export async function runFundingCascade001(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE global_assumptions
        ADD COLUMN IF NOT EXISTS runway_buffer_months real,
        ADD COLUMN IF NOT EXISTS sizing_overshoot_pct real,
        ADD COLUMN IF NOT EXISTS revenue_ramp_delay_months real,
        ADD COLUMN IF NOT EXISTS burn_flex_down_pct real
    `);

    logger.info(`[${TAG}] Funding Specialist cascade columns added (or already existed)`);
  } catch (error: unknown) {
    logger.error(`[${TAG}] Migration failed: ${String(error)}`, TAG);
    throw error;
  }
}
