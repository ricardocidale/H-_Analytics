/**
 * live-comparables/overhead.ts — Overhead specialist comparables (NAI-34).
 *
 * Canned core (HFTP / AHLA overhead cost surveys) enriched with a live
 * cross-reference composite row when ≥ N live sources respond — Wikipedia,
 * CNBC, REST Countries, and Alpha Vantage public-company proxy.
 */

import { logger } from "../../../logger";
import {
  getCannedOverheadComparables,
  type OverheadComparableRow,
} from "../mgmt-co-overhead-orchestrator-adapter";
import {
  DEFAULT_OFFICE_LEASE_BENCHMARK_MID,
  DEFAULT_PROFESSIONAL_SERVICES_BENCHMARK_MID,
  DEFAULT_TECH_INFRA_BENCHMARK_MID,
  DEFAULT_BUSINESS_INSURANCE_BENCHMARK_MID,
  DEFAULT_TRAVEL_COST_PER_CLIENT_BENCHMARK_MID,
  DEFAULT_IT_LICENSE_PER_CLIENT_BENCHMARK_MID,
} from "@shared/constants-overhead-benchmarks";
import { LIVE_MIN_OVERHEAD_LIVE_ROWS } from "../../../constants";
import {
  CHANNEL,
  FETCH_TIMEOUT_MS,
  fetchWikipediaSummary,
  fetchCNBCHeadlines,
} from "./shared";

const RESTCOUNTRIES_ALPHA_BASE    = "https://restcountries.com/v3.1/alpha";
const ALPHA_VANTAGE_RAPIDAPI_HOST = "alpha-vantage.p.rapidapi.com";

/**
 * Fetch REST Countries economic context for an ISO-3166-1 alpha-2 code.
 * Returns a brief descriptive string or null on error.
 */
async function fetchRestCountryContext(isoAlpha2: string): Promise<string | null> {
  try {
    const url =
      `${RESTCOUNTRIES_ALPHA_BASE}/${encodeURIComponent(isoAlpha2)}` +
      "?fields=name,currencies,region";
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const data = await res.json() as {
      name?: { common?: string };
      currencies?: Record<string, { name?: string }>;
      region?: string;
    };
    const country  = data.name?.common ?? isoAlpha2;
    const currency = Object.values(data.currencies ?? {})[0]?.name ?? "";
    return `${country} (${data.region ?? ""}, ${currency})`.replace(/\s+/g, " ").trim();
  } catch {
    return null;
  }
}

/** Subset of Alpha Vantage OVERVIEW fields relevant to overhead calibration. */
interface AlphaVantageOverview {
  symbol: string;
  operatingMarginTTM: number | null;
  profitMarginTTM: number | null;
}

/**
 * Fetch Alpha Vantage OVERVIEW (RapidAPI KEY_3) for a stock ticker.
 * Used as large-scale public-company proxy for overhead ratio context.
 */
async function fetchAlphaVantageOverview(
  ticker: string,
): Promise<AlphaVantageOverview | null> {
  const key = process.env.RAPIDAPI_KEY_3;
  if (!key) return null;
  try {
    const url =
      `https://${ALPHA_VANTAGE_RAPIDAPI_HOST}/query?` +
      new URLSearchParams({ function: "OVERVIEW", symbol: ticker });
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "x-rapidapi-key": key, "x-rapidapi-host": ALPHA_VANTAGE_RAPIDAPI_HOST },
    });
    if (!res.ok) return null;
    const data = await res.json() as Record<string, string>;
    if (!data?.Symbol) return null;
    const opMargin     = parseFloat(data.OperatingMarginTTM ?? "");
    const profitMargin = parseFloat(data.ProfitMargin ?? "");
    return {
      symbol:             data.Symbol,
      operatingMarginTTM: isFinite(opMargin)     ? opMargin     : null,
      profitMarginTTM:    isFinite(profitMargin)  ? profitMargin : null,
    };
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Overhead comparables — NAI-34

/**
 * NAI-34: Overhead cost comparables for the Overhead specialist.
 *
 * Live sources (tried in parallel, each independently fault-tolerant):
 *   1. Wikipedia "Hotel_management" — ManCo overhead context and structure.
 *   2. CNBC autocomplete (RapidAPI KEY_3) — recent hotel mgmt overhead news.
 *   3. Alpha Vantage OVERVIEW (RapidAPI KEY_3) — Marriott (MAR) operating
 *      margin TTM as large-scale public-company proxy. Boutique ManCos run
 *      proportionally higher overhead (fewer properties amortising fixed
 *      costs); this is labelled explicitly in the source string.
 *   4. REST Countries (free) — US economic context for locale calibration.
 *
 * Prepends one "live context" composite row (benchmark MID values); canned
 * set follows unchanged.
 */
export async function getOverheadComparables(): Promise<readonly OverheadComparableRow[]> {
  const canned = getCannedOverheadComparables();
  const today  = new Date().toISOString().slice(0, 10);

  const [wikiResult, cnbcResult, alphaResult, countryResult] = await Promise.allSettled([
    fetchWikipediaSummary("Hotel_management"),
    fetchCNBCHeadlines("hotel management company corporate overhead operating expenses cost"),
    fetchAlphaVantageOverview("MAR"),
    fetchRestCountryContext("US"),
  ]);

  const liveSources: string[] = [];
  if (wikiResult.status === "fulfilled" && wikiResult.value) {
    liveSources.push(
      "Wikipedia: Hotel management (en.wikipedia.org/wiki/Hotel_management)",
    );
  }
  if (cnbcResult.status === "fulfilled" && cnbcResult.value.length > 0) {
    liveSources.push(`CNBC News (cnbc.p.rapidapi.com): "${cnbcResult.value[0]}"`);
  }
  if (
    alphaResult.status === "fulfilled" &&
    alphaResult.value?.operatingMarginTTM != null
  ) {
    const pct = (alphaResult.value.operatingMarginTTM * 100).toFixed(1);
    liveSources.push(
      `Alpha Vantage (MAR): ${pct}% operating margin TTM — large-scale proxy; boutique ManCos proportionally higher overhead`,
    );
  }
  if (countryResult.status === "fulfilled" && countryResult.value) {
    liveSources.push(`REST Countries: ${countryResult.value}`);
  }

  logger.info(
    `getOverheadComparables: ${liveSources.length} live sources reached`,
    CHANNEL,
  );

  if (liveSources.length < LIVE_MIN_OVERHEAD_LIVE_ROWS) {
    return canned;
  }

  const liveRow: OverheadComparableRow = {
    operator:                "US Boutique ManCo Composite (live cross-reference)",
    locale:                  "US",
    vertical:                "boutique-luxury",
    propertyCount:           0,   // composite — not operator-specific
    officeLeaseUsd:          DEFAULT_OFFICE_LEASE_BENCHMARK_MID,
    professionalServicesUsd: DEFAULT_PROFESSIONAL_SERVICES_BENCHMARK_MID,
    techInfraUsd:            DEFAULT_TECH_INFRA_BENCHMARK_MID,
    businessInsuranceUsd:    DEFAULT_BUSINESS_INSURANCE_BENCHMARK_MID,
    travelCostPerClientUsd:  DEFAULT_TRAVEL_COST_PER_CLIENT_BENCHMARK_MID,
    itLicensePerClientUsd:   DEFAULT_IT_LICENSE_PER_CLIENT_BENCHMARK_MID,
    vintage:                 new Date().getFullYear(),
    source: `Live (${today}) | ${liveSources.join(" | ")}`,
  };

  return [liveRow, ...canned];
}
