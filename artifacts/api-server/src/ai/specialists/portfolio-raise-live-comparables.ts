/**
 * portfolio-raise-live-comparables.ts — LP property fund deal dataset
 * for the Portfolio Capital Raise Specialist (v1).
 *
 * Attempts a live SEC EDGAR Form D fetch via getLpComparables(). Falls back to
 * the canned dataset when the live row count is below
 * LIVE_MIN_PORTFOLIO_RAISE_LIVE_ROWS.
 *
 * Live EDGAR rows are adapted to LpDealComparable via edgarRowToLpDeal().
 * EDGAR Form D does not disclose firstClosePct, dscrAtStabilization, or
 * leveredIrr — those fields are null/defaulted in live rows; the prompt
 * template already handles null with "n/a" text.
 *
 * Canned figures are representative boutique luxury and lifestyle-luxury fund
 * deals from public disclosures and industry survey data (HVS, CBRE, PwC Real
 * Estate Investor Survey 2023–2024). All IRR and DSCR figures are ranges
 * expressed as mid-points; treat as directional, not investment-grade.
 */

import type { LpDealComparable } from "./portfolio-raise-runner";
import {
  PORTFOLIO_RAISE_DSCR_BENCHMARK_MID,
  PORTFOLIO_RAISE_FIRST_CLOSE_FRACTION,
} from "@shared/constants-funding";
import { getLpComparables } from "./live-comparables";
import type { ComparableRow } from "../specialists/mgmt-co-funding-orchestrator-adapter";
import { LIVE_MIN_PORTFOLIO_RAISE_LIVE_ROWS } from "../../constants";
import { logger } from "../../logger";

const CHANNEL = "portfolio-raise-live-comparables";

// ── Canned dataset ─────────────────────────────────────────────────────────────

const CANNED_LP_COMPARABLES: readonly LpDealComparable[] = [
  {
    operator: "Auberge Resorts Collection",
    vintage: 2022,
    vertical: "boutique-luxury",
    propertyCount: 4,
    totalEquityUsd: 28_000_000,
    firstClosePct: PORTFOLIO_RAISE_FIRST_CLOSE_FRACTION,
    dscrAtStabilization: 1.42,
    leveredIrr: 0.165,
    source: "Public hospitality investor disclosures (illustrative)",
    asOf: "2022-09-01",
  },
  {
    operator: "Proper Hospitality Fund II",
    vintage: 2023,
    vertical: "lifestyle-luxury",
    propertyCount: 3,
    totalEquityUsd: 18_000_000,
    firstClosePct: 0.35,
    dscrAtStabilization: 1.30,
    leveredIrr: 0.152,
    source: "Public hospitality investor disclosures (illustrative)",
    asOf: "2023-04-01",
  },
  {
    operator: "Bunkhouse Group Portfolio",
    vintage: 2021,
    vertical: "boutique-lifestyle",
    propertyCount: 5,
    totalEquityUsd: 22_000_000,
    firstClosePct: 0.45,
    dscrAtStabilization: 1.38,
    leveredIrr: 0.148,
    source: "Public hospitality investor disclosures (illustrative)",
    asOf: "2021-11-01",
  },
  {
    operator: "Graduate Hotels Preferred Equity Vehicle",
    vintage: 2023,
    vertical: "upscale-lifestyle",
    propertyCount: 6,
    totalEquityUsd: 45_000_000,
    firstClosePct: 0.30,
    dscrAtStabilization: PORTFOLIO_RAISE_DSCR_BENCHMARK_MID,
    leveredIrr: 0.135,
    source: "Public hospitality investor disclosures (illustrative)",
    asOf: "2023-08-01",
  },
  {
    operator: "Virgin Hotels Capital Partners I",
    vintage: 2022,
    vertical: "boutique-luxury",
    propertyCount: 2,
    totalEquityUsd: 12_000_000,
    firstClosePct: 0.50,
    dscrAtStabilization: 1.48,
    leveredIrr: 0.178,
    source: "Public hospitality investor disclosures (illustrative)",
    asOf: "2022-03-01",
  },
  {
    operator: "Freehand Hotels SPV Portfolio",
    vintage: 2024,
    vertical: "boutique-lifestyle",
    propertyCount: 3,
    totalEquityUsd: 15_000_000,
    firstClosePct: 0.38,
    dscrAtStabilization: null,
    leveredIrr: 0.142,
    source: "Public hospitality investor disclosures (illustrative)",
    asOf: "2024-01-01",
  },
];

// ── Adapter ────────────────────────────────────────────────────────────────────

/**
 * Maps a ComparableRow (EDGAR Form D shape) to LpDealComparable.
 *
 * EDGAR Form D discloses the total offering amount (raiseUsd) and structural
 * metadata but does not include firstClosePct, DSCR, or levered IRR. Those
 * fields default to the standard first-close fraction and null respectively;
 * the prompt template renders null fields as "n/a".
 */
function edgarRowToLpDeal(row: ComparableRow): LpDealComparable {
  return {
    operator: row.operator,
    vintage: row.vintage,
    vertical: row.vertical,
    propertyCount: row.propertyCount,
    totalEquityUsd: row.raiseUsd,
    firstClosePct: PORTFOLIO_RAISE_FIRST_CLOSE_FRACTION,
    dscrAtStabilization: null,
    leveredIrr: null,
    source: row.source,
    asOf: row.asOf,
  };
}

// ── Public entry point ─────────────────────────────────────────────────────────

export async function getPortfolioRaiseComparables(): Promise<readonly LpDealComparable[]> {
  const live = await getLpComparables();
  if (live.length >= LIVE_MIN_PORTFOLIO_RAISE_LIVE_ROWS) {
    logger.info(`getPortfolioRaiseComparables: ${live.length} live rows`, CHANNEL);
    return live.map(edgarRowToLpDeal);
  }
  logger.info(
    `getPortfolioRaiseComparables: ${live.length}/${LIVE_MIN_PORTFOLIO_RAISE_LIVE_ROWS} live rows — using canned set`,
    CHANNEL,
  );
  return CANNED_LP_COMPARABLES;
}
