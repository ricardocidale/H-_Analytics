/**
 * live-comparables/compensation.ts — ManCo compensation comparables.
 *
 * Compensation   FRED CES7000000003 (L&H avg hourly earnings) → annualised US floor
 *                anchor row. ManCo professional-staff salaries exceed the L&H average;
 *                this row is labelled as a market floor, not a target.
 */

import { logger } from "../../../logger";
import {
  getCannedCompensationComparables,
  type CompensationComparableRow,
} from "../mgmt-co-compensation-orchestrator-adapter";
import { CHANNEL, fetchFredObs } from "./shared";

// ────────────────────────────────────────────────────────────────────────────
// Compensation — management company compensation comparables

/**
 * Fetch live compensation comparables, enriched with a live US Leisure &
 * Hospitality industry average hourly earnings anchor (FRED CES7000000003).
 *
 * NOTE: CES7000000003 covers all L&H workers including hourly-wage staff.
 * ManCo professional compensation is materially higher. This row is explicitly
 * labelled as a market floor and prepended to the canned set so the synthesis
 * panel sees both the floor anchor and the representative canned profiles.
 *
 * If CES7000000003 is unavailable, only the canned set is returned.
 */
export async function getCompensationComparables(): Promise<
  readonly CompensationComparableRow[]
> {
  const canned = getCannedCompensationComparables();
  const hourlyEarnings = await fetchFredObs("CES7000000003");

  if (hourlyEarnings === null) {
    logger.info("getCompensationComparables: CES7000000003 unavailable, returning canned set", CHANNEL);
    return canned;
  }

  const ANNUAL_HOURS = 2_080;
  const annualSalaryUsd = Math.round(hourlyEarnings * ANNUAL_HOURS);
  const today = new Date().toISOString().slice(0, 10);

  const liveFloor: CompensationComparableRow = {
    operator: "US L&H Industry Average (Live Floor)",
    locale: "US",
    vertical: "boutique-luxury",
    propertyCount: 0,
    partnerCompYear1Usd: 0,
    partnerCompYear10Usd: 0,
    partnerCountYear1: 0,
    staffSalaryUsd: annualSalaryUsd,
    staffTier3Fte: 0,
    vintage: new Date().getFullYear(),
    source: `FRED CES7000000003 $${hourlyEarnings.toFixed(2)}/hr × ${ANNUAL_HOURS}h = $${annualSalaryUsd.toLocaleString()} as of ${today}. Market floor only — ManCo professional staff exceeds L&H average.`,
  };

  logger.info(
    `getCompensationComparables: L&H avg earnings $${hourlyEarnings.toFixed(2)}/hr → $${annualSalaryUsd.toLocaleString()}/yr (live floor prepended)`,
    CHANNEL,
  );
  return [liveFloor, ...canned];
}
