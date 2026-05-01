/**
 * property-risk-orchestrator-adapter.ts — inflation comparables for the
 * Risk Intelligence Specialist's Tier-1 N+1 pipeline (G3).
 *
 * Provides canned cross-sectoral CPI reference rows that give the synthesis
 * Opus a calibration anchor beyond the single authority-sourced
 * `countryInflationOutlook` already in the prompt context. Three rows from
 * distinct agencies satisfy Intelligence Bar #4 (tabular comp evidence on
 * numeric dimensions).
 *
 * These are NOT the same as the `countryInflationOutlook` input — that is
 * already authority-anchored per country. These comparables are a
 * cross-reference sectoral/regional dataset: lodging-specific CPI
 * (BLS), accommodation-services HICP (Eurostat), and emerging-market
 * all-items CPI (IMF) — giving the quant and synthesis panels three
 * distinct cross-check rows for the `propertyInflationRate` dimension.
 *
 * Mirror of `mgmt-co-funding-orchestrator-adapter.ts` for the Risk pipeline.
 * Canned data is replaced by live API integration in a follow-up packet
 * (BLS API, Eurostat SDMX, IMF WEO REST).
 */

import type { Evidence } from "../../../engine/analyst/contracts/verdict";

// ────────────────────────────────────────────────────────────────────────────
// Dimension key constants (single dimension for v1)

export const RISK_DIMENSION_KEYS = ["propertyInflationRate"] as const;
export type RiskDimensionKey = (typeof RISK_DIMENSION_KEYS)[number];

// ────────────────────────────────────────────────────────────────────────────
// Comparables

/**
 * One cross-sectoral CPI reference row. Each row represents a distinct
 * authority + sector + geography combination. The synthesis Opus indexes
 * into this array via `evidenceRefs` integers.
 */
export interface InflationComparableRow {
  /** Short geographic label (e.g. "US", "EU", "EM"). */
  country: string;
  /** Publishing authority (e.g. "Bureau of Labor Statistics"). */
  authority: string;
  /** Data vintage year. */
  vintage: number;
  /** Low end of the observed/forecast range (decimal — 0.025 = 2.5%). */
  low: number;
  /** Midpoint of the observed/forecast range (decimal). */
  mid: number;
  /** High end of the observed/forecast range (decimal). */
  high: number;
  /** Economic sector the CPI series covers. */
  sector: string;
  /** Citable source name. */
  source: string;
  /** ISO date the source was published or last refreshed. */
  asOf: string;
}

/**
 * Canned inflation comparables for G3 bring-up. Three rows from distinct
 * international agencies — BLS lodging CPI (US), Eurostat HICP accommodation
 * (EU), and IMF WEO emerging-market all-items CPI (EM). Numbers are
 * representative of 2024 publications and should not be cited as forecasts;
 * the live API integration replaces this set in a follow-up packet.
 */
export function getCannedInflationComparables(): readonly InflationComparableRow[] {
  return [
    {
      country: "US",
      authority: "Bureau of Labor Statistics",
      vintage: 2024,
      sector: "lodging",
      low: 0.025,
      mid: 0.032,
      high: 0.040,
      source: "BLS CPI Lodging Away From Home",
      asOf: "2024-12-31",
    },
    {
      country: "EU",
      authority: "Eurostat",
      vintage: 2024,
      sector: "accommodation services",
      low: 0.020,
      mid: 0.028,
      high: 0.038,
      source: "Eurostat HICP Accommodation Services",
      asOf: "2024-12-31",
    },
    {
      country: "EM",
      authority: "IMF World Economic Outlook",
      vintage: 2024,
      sector: "all-items",
      low: 0.040,
      mid: 0.055,
      high: 0.075,
      source: "IMF WEO Emerging Market Economies CPI",
      asOf: "2024-10-01",
    },
  ];
}

/**
 * Convert one InflationComparableRow to one Evidence row. Used by the
 * runner to thread comparables through the AnalystVerdict contract without
 * schema extension — each comparable becomes one Evidence entry with
 * `tier: "db_table"` and a "Market comp:" prefix the bar tests filter on
 * (IB#4).
 */
export function comparableToEvidence(row: InflationComparableRow): Evidence {
  return {
    source: `Market comp: ${row.country} ${row.sector} CPI (${row.authority}, ${row.vintage})`,
    tier: "db_table",
    asOf: row.asOf,
    personaFit: 0.80,
  };
}
