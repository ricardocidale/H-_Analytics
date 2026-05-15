/**
 * model-defaults-ltv-recalibration-001 — Plan 2026-05-13-001 U8 follow-up
 *
 * User-confirmed rule (2026-05-13):
 *   LTV defaults = 70% for both acquisition and refinancing.
 *   "Seed value = default value." (user directive, 2026-05-13)
 *
 * Changes:
 *   - mc.funding.ltv:    0.75 → 0.70  (acquisition LTV default)
 *   - mc.funding.refiLtv: 0.65 → 0.70  (refinance LTV default)
 *
 * mc.funding.refiMaxLtvToOriginal = 0.70 — unchanged (already correct)
 *
 * Idempotent: UPDATEs are unconditional (same value on repeat run).
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] model-defaults-ltv-recalibration-001";

// Source: user directive 2026-05-13 — "LTV defaults always equal to 70% for financing and refinancing"
const SEED_TARGET_LTV = 0.70;

export async function runModelDefaultsLtvRecalibration001(): Promise<void> {
  logger.info(`${TAG} Setting mc.funding.ltv and mc.funding.refiLtv to ${SEED_TARGET_LTV}`);

  const result1 = await db.execute(sql`
    UPDATE model_defaults
    SET value = ${SEED_TARGET_LTV}
    WHERE default_key = 'mc.funding.ltv'
  `);
  logger.info(`${TAG} mc.funding.ltv → ${SEED_TARGET_LTV} (${(result1 as { rowCount?: number }).rowCount ?? 0} row)`);

  const result2 = await db.execute(sql`
    UPDATE model_defaults
    SET value = ${SEED_TARGET_LTV}
    WHERE default_key = 'mc.funding.refiLtv'
  `);
  logger.info(`${TAG} mc.funding.refiLtv → ${SEED_TARGET_LTV} (${(result2 as { rowCount?: number }).rowCount ?? 0} row)`);
}
