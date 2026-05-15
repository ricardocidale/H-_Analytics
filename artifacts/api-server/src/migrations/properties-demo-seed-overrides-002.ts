/**
 * properties-demo-seed-overrides-002 — U8 full-equity refi rule: Medellin Duplex
 *
 * Plan 2026-05-13-001 U8 follow-up:
 *
 * Business rule (user-confirmed 2026-05-13):
 *   - Full-equity acquisitions (no acquisition debt, LTV = null) are refinanced
 *     3 years after operations begin.
 *   - Properties purchased with financing carry no refinancing in the model.
 *
 * Medellin Duplex is the only demo property matching the full-equity rule.
 * Its will_refinance was seeded as 'No'; this migration corrects it to 'Yes'
 * with standard full-equity refi terms.
 *
 * Terms rationale:
 *   - refinance_ltv 0.75 → capped to 0.70 × purchase_price ($560K max) by
 *     refi_max_ltv_to_original = 0.70 already on the row (set by
 *     properties-refi-ltv-recalibration-001). Net: modest cash-out, not an
 *     equity strip.
 *   - refinance_interest_rate 0.07 → current-cycle LatAm USD-denominated rate
 *     for prime-urban residential-hospitality collateral; HVS LatAm 2024.
 *   - refinance_term_years 25 → standard amortization, matches all other full-
 *     equity demo properties.
 *   - refinance_closing_cost_rate 0.03 → matches mc.funding.refiClosingCostRate
 *     model_defaults row.
 *   - refinance_years_after_acquisition 3 → full-equity refi convention per
 *     user direction 2026-05-13.
 *
 * Idempotent: UPDATE is unconditional (same values on repeat run).
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] properties-demo-seed-overrides-002";

const SEED_DUPLEX_REFI_LTV = 0.75;
const SEED_DUPLEX_REFI_RATE = 0.07;
const SEED_DUPLEX_REFI_TERM_YEARS = 25;
const SEED_DUPLEX_REFI_CLOSING_COST_RATE = 0.03;
const SEED_DUPLEX_REFI_YEARS_AFTER_ACQ = 3;

export async function runPropertiesDemoSeedOverrides002(): Promise<void> {
  logger.info(`${TAG} Applying full-equity refi rule to Medellin Duplex`);

  // refinance_date = operations_start_date (2025-09-01) + 3 years = 2028-09-01
  // Pattern matches Belleayre/Jano/Loch (all use ops_start + refi_years_after_acq).
  const result = await db.execute(sql`
    UPDATE properties
    SET will_refinance                    = 'Yes',
        refinance_years_after_acquisition = ${SEED_DUPLEX_REFI_YEARS_AFTER_ACQ},
        refinance_date                    = '2028-09-01',
        refinance_ltv                     = ${SEED_DUPLEX_REFI_LTV},
        refinance_interest_rate           = ${SEED_DUPLEX_REFI_RATE},
        refinance_term_years              = ${SEED_DUPLEX_REFI_TERM_YEARS},
        refinance_closing_cost_rate       = ${SEED_DUPLEX_REFI_CLOSING_COST_RATE}
    WHERE name = 'Medellin Duplex'
  `);

  logger.info(`${TAG} Medellin Duplex: will_refinance='Yes', refi_yr=${SEED_DUPLEX_REFI_YEARS_AFTER_ACQ}, ltv=${SEED_DUPLEX_REFI_LTV}, rate=${SEED_DUPLEX_REFI_RATE} (${(result as { rowCount?: number }).rowCount ?? 0} row)`);
}
