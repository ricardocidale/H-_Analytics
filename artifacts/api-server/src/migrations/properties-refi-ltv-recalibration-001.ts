/**
 * properties-refi-ltv-recalibration-001 — Recalibrate refi_max_ltv_to_original
 *
 * Fixes all property rows where refi_max_ltv_to_original is NULL or > 0.70.
 * Root cause: SEED_REFI_MAX_LTV_TO_ORIGINAL was incorrectly set to 1.00,
 * allowing refi proceeds to equal the full purchase price and inflating IRR.
 *
 * Correct cap: 0.70 (70% of purchase price). Matches DEFAULT_REFI_MAX_LTV_TO_ORIGINAL
 * in constants-funding.ts and model_defaults row mc.funding.refiMaxLtvToOriginal.
 *
 * No-NULL rule: every property row must carry an explicit value regardless of
 * will_refinance setting, so a future toggle to 'Yes' gets a valid cap immediately.
 *
 * Idempotent: rows already at ≤ 0.70 are untouched. Running twice has no effect.
 * Source: Plan 2026-05-13-005.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] properties-refi-ltv-recalibration-001";

export async function runPropertiesRefiLtvRecalibration001(): Promise<void> {
  logger.info(`${TAG} Recalibrating refi_max_ltv_to_original on all property rows`);

  const result = await db.execute(sql`
    UPDATE properties
    SET refi_max_ltv_to_original = 0.70
    WHERE refi_max_ltv_to_original IS NULL
       OR refi_max_ltv_to_original > 0.70
  `);

  const rowCount = (result as { rowCount?: number }).rowCount ?? 0;
  logger.info(`${TAG} Fixed ${rowCount} property rows (set to 0.70 where NULL or > 0.70)`);
}
