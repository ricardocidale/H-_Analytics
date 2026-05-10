/**
 * live-comparables/company.ts — Company financial defaults comparables.
 *
 * Company        FRED DGS10 (10-yr Treasury yield) → live US costOfEquity anchor.
 *                Equity risk premium for boutique hospitality management sourced from
 *                market_rates.erp_boutique_hospitality (Damodaran WACC — Lodging).
 *                Corporate tax rate sourced from getFactoryNumber('taxRate', 'United States').
 */

import { logger } from "../../../logger";
import { getMarketRate } from "../../../data/marketRates";
import { getFactoryNumber } from "@shared/model-constants-registry";
import {
  getCannedCompanyComparables,
  type CompanyComparableRow,
} from "../mgmt-co-company-orchestrator-adapter";
import {
  LIVE_ANCHOR_BASE_MGMT_FEE_RATE,
  DEFAULT_INCENTIVE_MGMT_FEE_BENCHMARK_MID,
} from "@shared/constants-company-benchmarks";
import { CHANNEL, fetchFredObs } from "./shared";

// ────────────────────────────────────────────────────────────────────────────
// Company — financial defaults comparables

/**
 * Fetch live company financial defaults comparables, enriched with a live
 * US cost-of-equity anchor derived from the current 10-year Treasury yield
 * (FRED DGS10) plus a boutique-hospitality equity risk premium.
 *
 * The live anchor row is PREPENDED so the synthesis panel sees it first.
 * All 12 canned rows follow. If DGS10 is unavailable, only the canned set
 * is returned.
 *
 * Formula: costOfEquity = (DGS10 / 100) + erp
 *   ERP sourced from market_rates.erp_boutique_hospitality (Damodaran WACC — Lodging).
 *   Corporate tax rate sourced from getFactoryNumber('taxRate', 'United States').
 */
export async function getCompanyComparables(): Promise<
  readonly CompanyComparableRow[]
> {
  const canned = getCannedCompanyComparables();
  const [dgs10Pct, erpRate] = await Promise.all([
    fetchFredObs("DGS10"),
    getMarketRate("erp_boutique_hospitality"),
  ]);

  if (dgs10Pct === null || erpRate?.value == null) {
    logger.info("getCompanyComparables: DGS10 or ERP rate unavailable, returning canned set", CHANNEL);
    return canned;
  }

  const riskFreeRate = dgs10Pct / 100;
  const erp = erpRate.value / 100;
  const liveCoE = parseFloat((riskFreeRate + erp).toFixed(4));
  const companyTaxRate = getFactoryNumber("taxRate", "United States");
  const today = new Date().toISOString().slice(0, 10);

  const liveAnchor: CompanyComparableRow = {
    operator: "US Market Anchor (Live)",
    locale: "US",
    vertical: "boutique-luxury",
    propertyCount: 0,
    baseManagementFee: LIVE_ANCHOR_BASE_MGMT_FEE_RATE,
    incentiveManagementFee: DEFAULT_INCENTIVE_MGMT_FEE_BENCHMARK_MID,
    companyTaxRate,
    costOfEquity: liveCoE,
    vintage: new Date().getFullYear(),
    source: `FRED DGS10 ${dgs10Pct.toFixed(2)}% + ${(erp * 100).toFixed(0)} pp boutique-hospitality ERP as of ${today}`,
  };

  logger.info(
    `getCompanyComparables: DGS10=${dgs10Pct.toFixed(2)}% → liveCoE=${(liveCoE * 100).toFixed(1)}% (live anchor prepended)`,
    CHANNEL,
  );
  return [liveAnchor, ...canned];
}
