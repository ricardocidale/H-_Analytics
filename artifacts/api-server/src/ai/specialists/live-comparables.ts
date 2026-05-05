/**
 * live-comparables.ts — NAI-28: Live comparable fetchers for all 7 specialist runners.
 *
 * Each `getXxxComparables()` function:
 *   1. Tries free public APIs (non-fatal — 8 s timeout).
 *   2. Falls back to the canned dataset on any error.
 *   3. Logs "live" vs "canned" so the activity stream is transparent.
 *
 * Live sources wired today (all free; only FRED_API_KEY required):
 *
 *   PropertyRisk   FRED CUSR0000SAH21 units=pc1 (US lodging CPI YoY %)
 *                  + IMF WEO REST PCPIPCH/EMG (EM aggregate inflation projection)
 *                  EU Eurostat HICP row kept canned (SDMX parsing deferred).
 *
 *   Company        FRED DGS10 (10-yr Treasury yield) → live US costOfEquity anchor.
 *                  Equity risk premium for boutique hospitality management: 12 pp above
 *                  the risk-free rate (illiquidity + concentration premium).
 *
 *   Compensation   FRED CES7000000003 (L&H avg hourly earnings) → annualised US floor
 *                  anchor row. ManCo professional-staff salaries exceed the L&H average;
 *                  this row is labelled as a market floor, not a target.
 *
 * Paid-API upgrade paths (no credentials available in this environment):
 *   Funding        PitchBook / PrivateEquityInfo — LP raise comparables.
 *   Revenue        STR Host / CBRE Hotel Horizons — F&B + ancillary revenue mix.
 *   Overhead       HFTP / AHLA overhead cost surveys.
 *   PropertyDefaults  Kalibri Labs / AHLA distribution cost studies.
 *
 * When a paid credential is added (e.g. PITCHBOOK_API_KEY), replace the
 * canned return in the relevant function with a live fetch + canned fallback.
 */

import { logger } from "../../logger";
import {
  getCannedLpComparables,
  type ComparableRow,
} from "./mgmt-co-funding-orchestrator-adapter";
import {
  getCannedRevenueComparables,
  type RevenueComparableRow,
} from "./mgmt-co-revenue-orchestrator-adapter";
import {
  getCannedCompensationComparables,
  type CompensationComparableRow,
} from "./mgmt-co-compensation-orchestrator-adapter";
import {
  getCannedOverheadComparables,
  type OverheadComparableRow,
} from "./mgmt-co-overhead-orchestrator-adapter";
import {
  getCannedCompanyComparables,
  type CompanyComparableRow,
} from "./mgmt-co-company-orchestrator-adapter";
import {
  getCannedPropertyDefaultsComparables,
  type PropertyDefaultsComparableRow,
} from "./mgmt-co-property-defaults-orchestrator-adapter";
import {
  getCannedInflationComparables,
  type InflationComparableRow,
} from "./property-risk-orchestrator-adapter";

const CHANNEL = "live-comparables";
const FETCH_TIMEOUT_MS = 8_000;

const EQUITY_RISK_PREMIUM_BOUTIQUE = 0.12;

// ────────────────────────────────────────────────────────────────────────────
// Internal fetch helpers

/**
 * Fetch one FRED series observation. Returns `null` on missing key, network
 * error, or un-parseable value.
 *
 * @param seriesId  FRED series identifier (e.g. "CUSR0000SAH21").
 * @param units     Optional FRED units transformation ("lin" | "pc1" | "pca").
 *                  "pc1" = percent change from year ago — used for CPI series.
 */
async function fetchFredObs(
  seriesId: string,
  units: "lin" | "pc1" | "pca" = "lin",
): Promise<number | null> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return null;

  try {
    const params = new URLSearchParams({
      series_id: seriesId,
      api_key: apiKey,
      file_type: "json",
      sort_order: "desc",
      limit: "1",
    });
    if (units !== "lin") params.set("units", units);

    const url = `https://api.stlouisfed.org/fred/series/observations?${params.toString()}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      observations?: Array<{ value?: string }>;
    };
    const val = data.observations?.[0]?.value;
    if (!val || val === ".") return null;

    const parsed = parseFloat(val);
    return isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Fetch the latest IMF World Economic Outlook CPI projection for a
 * country / aggregate group code (e.g. "EMG", "USA", "EU").
 *
 * Returns the percent value (e.g. 5.3 for 5.3%) or `null` on any error.
 * The IMF datamapper REST endpoint is free and requires no API key.
 */
async function fetchImfCpiPct(countryCode: string): Promise<number | null> {
  try {
    const url = `https://www.imf.org/external/datamapper/api/v1/PCPIPCH/${countryCode}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      values?: { PCPIPCH?: Record<string, Record<string, number>> };
    };
    const series = data.values?.PCPIPCH?.[countryCode];
    if (!series) return null;

    const years = Object.keys(series)
      .map(Number)
      .filter((y) => isFinite(y))
      .sort((a, b) => b - a);

    const currentYear = new Date().getFullYear();
    const targetYear = years.find((y) => y >= currentYear) ?? years[0];
    if (targetYear == null) return null;

    const val = series[String(targetYear)];
    return typeof val === "number" && isFinite(val) ? val : null;
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// PropertyRisk — inflation comparables

/**
 * Fetch live cross-sectoral CPI reference rows for the Property Risk
 * Intelligence specialist.
 *
 * US row:  FRED CUSR0000SAH21 units=pc1 — BLS CPI-U Lodging Away from Home,
 *          12-month percent change. Range band: ±0.8 pp around the mid.
 *
 * EU row:  Kept canned (Eurostat SDMX HICP CP114 parsing deferred; the
 *          Eurostat REST format requires custom SDMX path assembly that
 *          adds parsing complexity with minimal gain over the 2024 canned value).
 *
 * EM row:  IMF WEO PCPIPCH/EMG — Emerging Market and Developing Economies
 *          CPI projection. Range band: ±1.2 pp around the mid.
 */
export async function getInflationComparables(): Promise<
  readonly InflationComparableRow[]
> {
  const canned = getCannedInflationComparables();
  const today = new Date().toISOString().slice(0, 10);
  let rows = [...canned];
  let liveCount = 0;

  // ── US lodging CPI (FRED CUSR0000SAH21, percent change from year ago) ────
  const usLodgingPc1 = await fetchFredObs("CUSR0000SAH21", "pc1");
  if (usLodgingPc1 !== null) {
    const mid = usLodgingPc1 / 100;
    const low = Math.max(0, mid - 0.008);
    const high = mid + 0.008;
    const usRow: InflationComparableRow = {
      country: "US",
      authority: "Bureau of Labor Statistics",
      vintage: new Date().getFullYear(),
      sector: "lodging",
      low: parseFloat(low.toFixed(4)),
      mid: parseFloat(mid.toFixed(4)),
      high: parseFloat(high.toFixed(4)),
      source: "BLS CPI-U: Lodging Away from Home (CUSR0000SAH21) via FRED",
      asOf: today,
    };
    rows = rows.map((r) => (r.country === "US" ? usRow : r));
    liveCount++;
  }

  // ── EM CPI projection (IMF WEO PCPIPCH/EMG) ──────────────────────────────
  const emPct = await fetchImfCpiPct("EMG");
  if (emPct !== null) {
    const mid = emPct / 100;
    const low = Math.max(0, mid - 0.012);
    const high = mid + 0.015;
    const emRow: InflationComparableRow = {
      country: "EM",
      authority: "IMF World Economic Outlook",
      vintage: new Date().getFullYear(),
      sector: "all-items",
      low: parseFloat(low.toFixed(4)),
      mid: parseFloat(mid.toFixed(4)),
      high: parseFloat(high.toFixed(4)),
      source: "IMF WEO PCPIPCH: Emerging Market and Developing Economies",
      asOf: today,
    };
    rows = rows.map((r) => (r.country === "EM" ? emRow : r));
    liveCount++;
  }

  logger.info(
    `getInflationComparables: ${liveCount}/3 rows live, ${3 - liveCount} canned`,
    CHANNEL,
  );
  return rows;
}

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
 * Formula: costOfEquity = (DGS10 / 100) + EQUITY_RISK_PREMIUM_BOUTIQUE
 *   ERP of 12 pp reflects illiquidity + concentration + operator-execution
 *   risk for boutique-luxury management companies (3-25 properties).
 */
export async function getCompanyComparables(): Promise<
  readonly CompanyComparableRow[]
> {
  const canned = getCannedCompanyComparables();
  const dgs10Pct = await fetchFredObs("DGS10");

  if (dgs10Pct === null) {
    logger.info("getCompanyComparables: DGS10 unavailable, returning canned set", CHANNEL);
    return canned;
  }

  const riskFreeRate = dgs10Pct / 100;
  const liveCoE = parseFloat((riskFreeRate + EQUITY_RISK_PREMIUM_BOUTIQUE).toFixed(4));
  const today = new Date().toISOString().slice(0, 10);

  const liveAnchor: CompanyComparableRow = {
    operator: "US Market Anchor (Live)",
    locale: "US",
    vertical: "boutique-luxury",
    propertyCount: 0,
    baseManagementFee: 0.03,
    incentiveManagementFee: 0.10,
    companyTaxRate: 0.21,
    costOfEquity: liveCoE,
    vintage: new Date().getFullYear(),
    source: `FRED DGS10 ${dgs10Pct.toFixed(2)}% + ${(EQUITY_RISK_PREMIUM_BOUTIQUE * 100).toFixed(0)} pp boutique-hospitality ERP as of ${today}`,
  };

  logger.info(
    `getCompanyComparables: DGS10=${dgs10Pct.toFixed(2)}% → liveCoE=${(liveCoE * 100).toFixed(1)}% (live anchor prepended)`,
    CHANNEL,
  );
  return [liveAnchor, ...canned];
}

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

// ────────────────────────────────────────────────────────────────────────────
// No-live-source specialists — return canned (documented upgrade paths above)

/** LP raise comparables for the Funding specialist. Canned until PitchBook / PrivateEquityInfo credentials land. */
export async function getLpComparables(): Promise<readonly ComparableRow[]> {
  return getCannedLpComparables();
}

/** Revenue mix comparables for the Revenue specialist. Canned until STR Host / CBRE Hotel Horizons credentials land. */
export async function getRevenueComparables(): Promise<readonly RevenueComparableRow[]> {
  return getCannedRevenueComparables();
}

/** Overhead comparables for the Overhead specialist. Canned until HFTP / AHLA overhead cost survey credentials land. */
export async function getOverheadComparables(): Promise<readonly OverheadComparableRow[]> {
  return getCannedOverheadComparables();
}

/** Property-defaults comparables for the PropertyDefaults specialist. Canned until Kalibri Labs / AHLA distribution credentials land. */
export async function getPropertyDefaultsComparables(): Promise<readonly PropertyDefaultsComparableRow[]> {
  return getCannedPropertyDefaultsComparables();
}
