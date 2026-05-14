/**
 * properties-full-equity-refi-rule-001 — Plan 2026-05-13-001 U8 follow-up
 *
 * User-confirmed rules (2026-05-13, updated):
 *   1. The first 4 demo properties are full-equity (cash) acquisitions — no
 *      acquisition debt. They ARE refinanced (leveraged) after n years (default 3).
 *      Properties: Jano Grande Ranch, Loch Sheldrake, Belleayre Mountain, Medellin Duplex.
 *   2. The remaining 3 properties are financed (acquisition_ltv > 0) and do NOT refinance:
 *      Lakeview Haven Lodge, San Diego, Scott's House — already seeded correctly (no refi).
 *
 * Fixes:
 *   a) Sets acquisition_ltv = 0 on the 4 full-equity properties. This prevents
 *      withFinancialHydration from filling the null with mc.funding.ltv, which would
 *      add phantom acquisition debt and break the refinancing cash-out calculation.
 *   b) Corrects refinance_ltv from 0.75 → 0.70 on Jano/Loch/Belleayre. These properties
 *      carry explicit per-row refi_ltv values (not null) so the mc.funding.refiLtv
 *      model_defaults update alone does not reach them.
 *      Medellin Duplex refi_ltv is already set to 0.70 by properties-demo-seed-overrides-002.
 *
 * Idempotent: UPDATEs are unconditional (same values on repeat run).
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] properties-full-equity-refi-rule-001";

// Source: user directive 2026-05-13 — "LTV defaults always equal to 70%"
const SEED_REFI_LTV = 0.70;

// Full-equity properties: cash acquisition, refinanced after n years (no acquisition loan)
const FULL_EQUITY_NAMES = [
  "Jano Grande Ranch",
  "Loch Sheldrake",
  "Belleayre Mountain",
  "Medellin Duplex",
];

// Properties with explicit per-row refi_ltv values that need recalibration to 0.70
// (Medellin Duplex handled by properties-demo-seed-overrides-002; excluded here)
const REFI_LTV_RECAL_NAMES = ["Jano Grande Ranch", "Loch Sheldrake", "Belleayre Mountain"];

export async function runPropertiesFullEquityRefiRule001(): Promise<void> {
  logger.info(`${TAG} Setting acquisition_ltv=0 on full-equity properties; recalibrating refi_ltv to ${SEED_REFI_LTV}`);

  for (const name of FULL_EQUITY_NAMES) {
    const result = await db.execute(sql`
      UPDATE properties
      SET acquisition_ltv = 0
      WHERE name = ${name}
    `);
    logger.info(`${TAG} ${name}: acquisition_ltv→0 (${(result as { rowCount?: number }).rowCount ?? 0} row)`);
  }

  for (const name of REFI_LTV_RECAL_NAMES) {
    const result = await db.execute(sql`
      UPDATE properties
      SET refinance_ltv = ${SEED_REFI_LTV}
      WHERE name = ${name}
    `);
    logger.info(`${TAG} ${name}: refinance_ltv→${SEED_REFI_LTV} (${(result as { rowCount?: number }).rowCount ?? 0} row)`);
  }
}
