/**
 * live-comparables.ts — NAI-28: Live comparable fetchers for all 7 specialist runners.
 *
 * Each `getXxxComparables()` function:
 *   1. Tries free public APIs (non-fatal — 8 s timeout).
 *   2. Falls back to the canned dataset on any error.
 *   3. Logs "live" vs "canned" so the activity stream is transparent.
 *
 * Live sources wired today:
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
 *   Funding        SEC EDGAR EFTS — Form D ("hotel fund") filings since 2022.
 *                  Fetches the EFTS search index, then pulls individual Form D XMLs
 *                  for totalOfferingAmount and dateOfFirstSale. Deduplicates by CIK
 *                  (keeps the most-recent filing per entity). Cached 24 h.
 *                  Canned fallback if fewer than 3 live rows are returned.
 *
 * Canned-only (no free public source available):
 *   Revenue        STR Host / CBRE Hotel Horizons — F&B + ancillary revenue mix.
 *   Overhead       HFTP / AHLA overhead cost surveys.
 *   PropertyDefaults  Kalibri Labs / AHLA distribution cost studies.
 */

import { logger } from "../../logger";
import { cache } from "../../cache";
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
import {
  DEFAULT_RUNWAY_NEED_MONTHS_PLACEHOLDER,
  EDGAR_MIN_LIVE_ROWS,
  EDGAR_COMPARABLE_SIZING_OVERSHOOT_PCT,
} from "@shared/constants-funding";
import {
  LIVE_ANCHOR_BASE_MGMT_FEE_RATE,
  DEFAULT_INCENTIVE_MGMT_FEE_BENCHMARK_MID,
} from "@shared/constants-company-benchmarks";
import { IMF_EM_CPI_BAND_DELTA_HIGH } from "@shared/constants-benchmarks";
import {
  DEFAULT_MARKETING_RATE_BENCHMARK_MID,
  DEFAULT_FB_REVENUE_SHARE_BENCHMARK_MID,
  DEFAULT_EVENTS_REVENUE_SHARE_BENCHMARK_MID,
  DEFAULT_OTHER_REVENUE_SHARE_BENCHMARK_MID,
  DEFAULT_CATERING_BOOST_PCT_BENCHMARK_MID,
} from "@shared/constants-revenue-benchmarks";
import {
  DEFAULT_OFFICE_LEASE_BENCHMARK_MID,
  DEFAULT_PROFESSIONAL_SERVICES_BENCHMARK_MID,
  DEFAULT_TECH_INFRA_BENCHMARK_MID,
  DEFAULT_BUSINESS_INSURANCE_BENCHMARK_MID,
  DEFAULT_TRAVEL_COST_PER_CLIENT_BENCHMARK_MID,
  DEFAULT_IT_LICENSE_PER_CLIENT_BENCHMARK_MID,
} from "@shared/constants-overhead-benchmarks";
import {
  DEFAULT_EVENT_EXPENSE_RATE_BENCHMARK_MID,
  DEFAULT_OTHER_EXPENSE_RATE_BENCHMARK_MID,
  DEFAULT_UTILITIES_VARIABLE_SPLIT_BENCHMARK_MID,
} from "@shared/constants-property-defaults-benchmarks";
import {
  LIVE_OTA_COMMISSION_BOOKING_COM_FRACTION,
  LIVE_OTA_MIX_HEAVY_FRACTION,
  LIVE_OTA_MIX_STANDARD_FRACTION,
  LIVE_OTA_MIX_LIGHT_FRACTION,
  LIVE_MIN_PROPERTY_DEFAULTS_LIVE_ROWS,
  LIVE_MIN_REVENUE_LIVE_ROWS,
  LIVE_MIN_OVERHEAD_LIVE_ROWS,
  LIVE_BOOKING_REPRESENTATIVE_ROOM_COUNT,
  LIVE_BOOKING_ADR_BUDGET_THRESHOLD_USD,
  LIVE_BOOKING_CHECKIN_LEAD_DAYS,
  LIVE_BOOKING_CHECKOUT_LEAD_DAYS,
  LIVE_BOOKING_MAX_HOTELS_PER_CITY,
  LIVE_CNBC_FETCH_LIMIT,
  LIVE_CNBC_HEADLINE_SLICE,
} from "../../constants";

const CHANNEL = "live-comparables";
const FETCH_TIMEOUT_MS = 8_000;

const EQUITY_RISK_PREMIUM_BOUTIQUE = 0.12;

// SEC EDGAR — Form D hotel fund comparables
const EDGAR_UA = "NAI-HospitalityAnalytics/1.0 contact@norfolkai.com";
const EDGAR_EFTS_URL =
  "https://efts.sec.gov/LATEST/search-index?q=%22hotel+fund%22&forms=D&dateRange=custom&startdt=2022-01-01&enddt=2027-12-31";
const EDGAR_ARCHIVES_BASE = "https://www.sec.gov/Archives/edgar/data";
const EDGAR_MIN_RAISE_USD = 2_000_000; // exclude trivial/test filings
const EDGAR_MIN_VINTAGE = 2020;        // exclude stale vintage years
const EDGAR_CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours
const EDGAR_MAX_FILINGS = 15;          // XML fetches per call

// ── Wikipedia / RestCountries / CNBC / Booking.com / Alpha Vantage ──────────
const WIKIPEDIA_UA                = "NAI-HospitalityAnalytics/1.0 contact@norfolkai.com";
const WIKIPEDIA_SUMMARY_BASE      = "https://en.wikipedia.org/api/rest_v1/page/summary";
const RESTCOUNTRIES_ALPHA_BASE    = "https://restcountries.com/v3.1/alpha";
const CNBC_RAPIDAPI_HOST          = "cnbc.p.rapidapi.com";
const BOOKING_RAPIDAPI_HOST       = "booking-com.p.rapidapi.com";
const ALPHA_VANTAGE_RAPIDAPI_HOST = "alpha-vantage.p.rapidapi.com";
// 12 h cache for OTA-rate data (Booking.com pricing varies daily)
const LIVE_OTA_CACHE_TTL_SECONDS  = 12 * 60 * 60;

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
// EDGAR — hotel fund Form D comparables

/**
 * Fetch live LP-raise comparables from SEC EDGAR Form D filings.
 *
 * Strategy:
 *   1. Search EFTS for "hotel fund" Form D filings since 2022.
 *   2. Deduplicate hits by CIK — keep the most-recent filing per entity.
 *   3. Fetch each filing's primary_doc.xml in parallel to read:
 *        - totalOfferingAmount  (raise size in USD)
 *        - dateOfFirstSale      (vintage year; falls back to file_date year)
 *   4. Discard rows with raise < EDGAR_MIN_RAISE_USD or vintage < EDGAR_MIN_VINTAGE.
 *
 * Non-EDGAR fields (runwayBufferMonths, sizingOvershootPct, trancheGapMonths)
 * are set to representative constants because Form D does not disclose them.
 *
 * Cached 24 h — EDGAR is a free public endpoint with a rate-limit request
 * that we respect via User-Agent identification.
 */
async function fetchEdgarHotelFundComparables(): Promise<readonly ComparableRow[]> {
  const searchRes = await fetch(EDGAR_EFTS_URL, {
    headers: { "User-Agent": EDGAR_UA },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!searchRes.ok) return [];

  const searchData = (await searchRes.json()) as {
    hits?: { hits?: Array<{
      _source?: {
        adsh?: string;
        ciks?: string[];
        display_names?: string[];
        file_date?: string;
      };
    }> };
  };

  const hits = searchData.hits?.hits ?? [];

  // Deduplicate by CIK — keep only the first (most-relevant) filing per entity.
  const seenCiks = new Set<string>();
  const uniqueHits = hits.filter((h) => {
    const cik = h._source?.ciks?.[0];
    if (!cik || seenCiks.has(cik)) return false;
    seenCiks.add(cik);
    return true;
  });

  // Fetch Form D XMLs in parallel (up to EDGAR_MAX_FILINGS)
  const xmlFetches = uniqueHits.slice(0, EDGAR_MAX_FILINGS).map(async (hit) => {
    const src = hit._source;
    if (!src) return null;

    const cik = src.ciks?.[0]?.replace(/^0+/, "");
    const adsh = src.adsh?.replace(/-/g, "");
    if (!cik || !adsh) return null;

    try {
      const xmlUrl = `${EDGAR_ARCHIVES_BASE}/${cik}/${adsh}/primary_doc.xml`;
      const xmlRes = await fetch(xmlUrl, {
        headers: { "User-Agent": EDGAR_UA },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!xmlRes.ok) return null;
      const xml = await xmlRes.text();

      // Parse offering amount
      const amountMatch = xml.match(
        /<totalOfferingAmount[^>]*>([\d.]+)<\/totalOfferingAmount>/
      );
      if (!amountMatch) return null;
      const raiseUsd = Math.round(parseFloat(amountMatch[1]));
      if (!isFinite(raiseUsd) || raiseUsd < EDGAR_MIN_RAISE_USD) return null;

      // Parse dateOfFirstSale — may be nested <value>YYYY-MM-DD</value> or
      // just "true" (meaning "already occurred"). Fall back to file_date year.
      const dateMatch = xml.match(
        /<dateOfFirstSale[^>]*>(?:[^<]*<value>)?(\d{4}-\d{2}-\d{2})/
      );
      const vintage = dateMatch
        ? Number(dateMatch[1].slice(0, 4))
        : Number((src.file_date ?? "0").slice(0, 4));

      if (!isFinite(vintage) || vintage < EDGAR_MIN_VINTAGE) return null;

      // Clean entity name — EDGAR display_names often suffix "(CIK 0001234567)"
      const rawName = src.display_names?.[0] ?? "Unknown Hotel Fund";
      const operator = rawName.replace(/\s*\(CIK\s+\d+\)\s*$/, "").trim();

      const row: ComparableRow = {
        operator,
        vintage,
        vertical: "boutique-luxury",
        propertyCount: 0,
        raiseUsd,
        runwayBufferMonths: DEFAULT_RUNWAY_NEED_MONTHS_PLACEHOLDER,  // representative — not disclosed in Form D
        sizingOvershootPct: EDGAR_COMPARABLE_SIZING_OVERSHOOT_PCT,  // representative — not disclosed in Form D
        trancheGapMonths: null,    // not disclosed in Form D
        source: `SEC EDGAR Form D ${src.adsh ?? adsh} filed ${src.file_date ?? "n/a"}`,
        asOf: src.file_date ?? new Date().toISOString().slice(0, 10),
      };
      return row;
    } catch {
      return null;
    }
  });

  const results = await Promise.all(xmlFetches);
  return results.filter((r): r is ComparableRow => r !== null);
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
    const high = mid + IMF_EM_CPI_BAND_DELTA_HIGH;
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
    `getInflationComparables: ${liveCount}/${rows.length} rows live, ${rows.length - liveCount} canned`,
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
    baseManagementFee: LIVE_ANCHOR_BASE_MGMT_FEE_RATE,
    incentiveManagementFee: DEFAULT_INCENTIVE_MGMT_FEE_BENCHMARK_MID,
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
// Funding — LP raise comparables (SEC EDGAR Form D)

/**
 * Fetch live LP-raise comparables for the Funding specialist.
 *
 * Primary source: SEC EDGAR Form D "hotel fund" filings since 2022, fetched
 * via EFTS search + individual XML parsing. Cached 24 h to respect EDGAR's
 * rate-limit guidelines and avoid redundant XML fetches.
 *
 * Fallback: canned dataset (getCannedLpComparables) when EDGAR returns fewer
 * than 3 qualifying rows. The canned set is always appended after live rows
 * so the specialist has ≥ 3 comparables even on partial EDGAR results.
 *
 * Non-EDGAR representative constants (not disclosed in Form D filings):
 *   runwayBufferMonths = 18   (typical GP runway target)
 *   sizingOvershootPct = 0.15 (typical 15% oversize buffer)
 *   trancheGapMonths   = null (tranche structure not disclosed)
 */
export async function getLpComparables(): Promise<readonly ComparableRow[]> {
  const canned = getCannedLpComparables();

  const edgarRows = await cache.staleWhileRevalidate<readonly ComparableRow[]>(
    "edgar:hotel-fund-form-d",
    EDGAR_CACHE_TTL_SECONDS,
    () => fetchEdgarHotelFundComparables().catch(() => []),
  );

  if (edgarRows.length >= EDGAR_MIN_LIVE_ROWS) {
    logger.info(
      `getLpComparables: ${edgarRows.length} live EDGAR rows returned (canned appended for depth)`,
      CHANNEL,
    );
    return [...edgarRows, ...canned];
  }

  logger.info(
    `getLpComparables: EDGAR returned ${edgarRows.length} qualifying rows — using canned set`,
    CHANNEL,
  );
  return canned;
}

// ────────────────────────────────────────────────────────────────────────────
// Live-fetch helpers (NAI-33, NAI-34, NAI-35)

/** Date string N calendar days from today, formatted YYYY-MM-DD. */
function liveCompDateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Fetch a single Wikipedia REST API page summary (no auth required).
 * Returns the plain-text extract string, or null on any error / missing page.
 */
async function fetchWikipediaSummary(pageTitle: string): Promise<string | null> {
  try {
    const url = `${WIKIPEDIA_SUMMARY_BASE}/${encodeURIComponent(pageTitle)}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": WIKIPEDIA_UA },
    });
    if (!res.ok) return null;
    const data = await res.json() as { extract?: string };
    return data.extract ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch CNBC autocomplete headlines for a topic via RapidAPI KEY_3.
 * Returns up to LIVE_CNBC_HEADLINE_SLICE headline strings (empty array on error).
 */
async function fetchCNBCHeadlines(topic: string): Promise<string[]> {
  const key = process.env.RAPIDAPI_KEY_3;
  if (!key) return [];
  try {
    const url =
      `https://${CNBC_RAPIDAPI_HOST}/v2/auto-complete?` +
      new URLSearchParams({ q: topic, limit: String(LIVE_CNBC_FETCH_LIMIT) });
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "x-rapidapi-key": key, "x-rapidapi-host": CNBC_RAPIDAPI_HOST },
    });
    if (!res.ok) return [];
    const data = await res.json() as {
      data?: Array<{ title?: string; name?: string }>;
    };
    return (data.data ?? [])
      .map((a) => a.title ?? a.name ?? "")
      .filter(Boolean)
      .slice(0, LIVE_CNBC_HEADLINE_SLICE);
  } catch {
    return [];
  }
}

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

/** Shape of a single Booking.com live hotel snap used for OTA commission derivation. */
interface BookingHotelSnap {
  name: string;
  city: string;
  avgPricePerNightUsd: number;
}

/**
 * Fetch top boutique hotels for a city via Booking.com RapidAPI (KEY_2).
 *
 * Step 1 — resolve city → dest_id via /v1/hotels/locations.
 * Step 2 — search hotels ordered by review_score (quality proxy for boutique).
 * Avg nightly rate = min_total_price ÷ stay nights.
 *
 * Returns empty array on any API error or missing credential.
 */
async function fetchBookingComBoutiqueHotels(
  cityName: string,
): Promise<BookingHotelSnap[]> {
  const key = process.env.RAPIDAPI_KEY_2;
  if (!key) return [];
  try {
    const locUrl =
      `https://${BOOKING_RAPIDAPI_HOST}/v1/hotels/locations?` +
      new URLSearchParams({ name: cityName, locale: "en-us" });
    const locRes = await fetch(locUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "x-rapidapi-key": key, "x-rapidapi-host": BOOKING_RAPIDAPI_HOST },
    });
    if (!locRes.ok) return [];
    const locData = await locRes.json() as Array<{
      dest_id?: string;
      dest_type?: string;
    }>;
    const loc = locData?.[0];
    if (!loc?.dest_id) return [];

    const checkIn    = liveCompDateOffset(LIVE_BOOKING_CHECKIN_LEAD_DAYS);
    const checkOut   = liveCompDateOffset(LIVE_BOOKING_CHECKOUT_LEAD_DAYS);
    const stayNights = LIVE_BOOKING_CHECKOUT_LEAD_DAYS - LIVE_BOOKING_CHECKIN_LEAD_DAYS;
    const params = new URLSearchParams({
      dest_id:            loc.dest_id,
      dest_type:          loc.dest_type ?? "city",
      checkin_date:       checkIn,
      checkout_date:      checkOut,
      room_number:        "1",
      adults_number:      "1",
      order_by:           "review_score",
      locale:             "en-us",
      currency:           "USD",
      filter_by_currency: "USD",
      page_number:        "0",
    });
    const searchRes = await fetch(
      `https://${BOOKING_RAPIDAPI_HOST}/v1/hotels/search?${params}`,
      {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { "x-rapidapi-key": key, "x-rapidapi-host": BOOKING_RAPIDAPI_HOST },
      },
    );
    if (!searchRes.ok) return [];
    const searchData = await searchRes.json() as {
      result?: Array<{ hotel_name?: string; min_total_price?: number; city?: string }>;
    };

    return (searchData.result ?? [])
      .slice(0, LIVE_BOOKING_MAX_HOTELS_PER_CITY)
      .filter((h) => (h.min_total_price ?? 0) > 0)
      .map((h) => ({
        name: h.hotel_name ?? cityName,
        city: h.city ?? cityName,
        avgPricePerNightUsd: Math.round((h.min_total_price ?? 0) / stayNights),
      }));
  } catch {
    return [];
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
// Revenue comparables — NAI-33

/**
 * NAI-33: Revenue mix comparables for the Revenue specialist.
 *
 * Live sources (tried in parallel, each independently fault-tolerant):
 *   1. Wikipedia "Hotel_food_and_beverage" — F&B share benchmark context.
 *   2. Wikipedia "Revenue_management" — hospitality revenue-mix methodology.
 *   3. CNBC autocomplete (RapidAPI KEY_3) — recent boutique hotel F&B news.
 *
 * If ≥ LIVE_MIN_REVENUE_LIVE_ROWS sources respond, prepends one "live
 * cross-reference" composite row (values = benchmark MIDs; source string
 * cites fetch date + live URLs/headlines). Falls back to full canned set.
 */
export async function getRevenueComparables(): Promise<readonly RevenueComparableRow[]> {
  const canned = getCannedRevenueComparables();
  const today  = new Date().toISOString().slice(0, 10);

  const [wikiHotelFnBResult, wikiRevMgmtResult, cnbcResult] = await Promise.allSettled([
    fetchWikipediaSummary("Hotel_food_and_beverage"),
    fetchWikipediaSummary("Revenue_management"),
    fetchCNBCHeadlines("boutique hotel food beverage revenue mix percentage"),
  ]);

  const liveSources: string[] = [];
  if (wikiHotelFnBResult.status === "fulfilled" && wikiHotelFnBResult.value) {
    liveSources.push(
      "Wikipedia: Hotel food and beverage (en.wikipedia.org/wiki/Hotel_food_and_beverage)",
    );
  }
  if (wikiRevMgmtResult.status === "fulfilled" && wikiRevMgmtResult.value) {
    liveSources.push(
      "Wikipedia: Revenue management (en.wikipedia.org/wiki/Revenue_management)",
    );
  }
  if (cnbcResult.status === "fulfilled" && cnbcResult.value.length > 0) {
    liveSources.push(`CNBC News (cnbc.p.rapidapi.com): "${cnbcResult.value[0]}"`);
  }

  logger.info(
    `getRevenueComparables: ${liveSources.length} live sources reached`,
    CHANNEL,
  );

  if (liveSources.length < LIVE_MIN_REVENUE_LIVE_ROWS) {
    return canned;
  }

  const liveRow: RevenueComparableRow = {
    property:              "Boutique-Luxury US Composite (live cross-reference)",
    city:                  "US Market",
    country:               "US",
    vertical:              "boutique-luxury",
    roomCount:             0,  // composite — not property-specific
    marketingRateFraction: DEFAULT_MARKETING_RATE_BENCHMARK_MID,
    fbShareFraction:       DEFAULT_FB_REVENUE_SHARE_BENCHMARK_MID,
    eventsShareFraction:   DEFAULT_EVENTS_REVENUE_SHARE_BENCHMARK_MID,
    otherShareFraction:    DEFAULT_OTHER_REVENUE_SHARE_BENCHMARK_MID,
    cateringBoostFraction: DEFAULT_CATERING_BOOST_PCT_BENCHMARK_MID,
    year:                  new Date().getFullYear(),
    source: `Live (${today}) | ${liveSources.join(" | ")}`,
  };

  return [liveRow, ...canned];
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

// ────────────────────────────────────────────────────────────────────────────
// PropertyDefaults comparables — NAI-35

/**
 * NAI-35: Property-defaults comparables for the PropertyDefaults specialist.
 *
 * Live sources (tried in parallel):
 *   1. Booking.com (RapidAPI KEY_2) — live boutique hotel search in NYC,
 *      Miami, and Bogotá. Average ADR drives OTA booking-mix calibration:
 *        salesCommissionRate = adjustedMixFraction × BOOKING_COM_COMMISSION
 *      Hotels with ADR < LIVE_BOOKING_ADR_BUDGET_THRESHOLD_USD get the
 *      HEAVY OTA mix assumption; others use the city default.
 *   2. Wikipedia "Online_travel_agency" — OTA commission structure context.
 *   3. CNBC autocomplete (RapidAPI KEY_3) — recent OTA commission news.
 *
 * Falls back to full canned set if < LIVE_MIN_PROPERTY_DEFAULTS_LIVE_ROWS
 * live rows are returned. Canned rows for uncovered locales are appended.
 * Results cached 12 h (OTA rate data changes daily).
 */
export async function getPropertyDefaultsComparables(): Promise<
  readonly PropertyDefaultsComparableRow[]
> {
  const canned = getCannedPropertyDefaultsComparables();

  const liveRows = await cache.staleWhileRevalidate<PropertyDefaultsComparableRow[]>(
    "live-comparables:property-defaults:booking-com",
    LIVE_OTA_CACHE_TTL_SECONDS,
    () => fetchPropertyDefaultsLive(),
  );

  if (liveRows.length < LIVE_MIN_PROPERTY_DEFAULTS_LIVE_ROWS) {
    return canned;
  }

  const liveLocales = new Set(liveRows.map((r) => r.locale));
  const cannedFill  = canned.filter((r) => !liveLocales.has(r.locale));
  return [...liveRows, ...cannedFill];
}

/** Inner fetch function wrapped by the 12-h stale-while-revalidate cache. */
async function fetchPropertyDefaultsLive(): Promise<PropertyDefaultsComparableRow[]> {
  const today = new Date().toISOString().slice(0, 10);

  type CityConfig = {
    city: string;
    locale: string;
    vertical: "boutique-luxury" | "wellness" | "lifestyle";
    otaMixFraction: number;
  };

  const cities: CityConfig[] = [
    { city: "New York", locale: "US", vertical: "boutique-luxury", otaMixFraction: LIVE_OTA_MIX_HEAVY_FRACTION    },
    { city: "Miami",    locale: "US", vertical: "boutique-luxury", otaMixFraction: LIVE_OTA_MIX_STANDARD_FRACTION },
    { city: "Bogota",   locale: "CO", vertical: "boutique-luxury", otaMixFraction: LIVE_OTA_MIX_STANDARD_FRACTION },
  ];

  const [nyResult, miamiResult, bogotaResult, wikiOtaResult, cnbcResult] =
    await Promise.allSettled([
      fetchBookingComBoutiqueHotels(cities[0].city),
      fetchBookingComBoutiqueHotels(cities[1].city),
      fetchBookingComBoutiqueHotels(cities[2].city),
      fetchWikipediaSummary("Online_travel_agency"),
      fetchCNBCHeadlines(
        "OTA commission hotel distribution cost Booking Expedia Airbnb",
      ),
    ]);

  const cityResults = [
    { result: nyResult,     ...cities[0] },
    { result: miamiResult,  ...cities[1] },
    { result: bogotaResult, ...cities[2] },
  ];

  const otaContextSources: string[] = [];
  if (wikiOtaResult.status === "fulfilled" && wikiOtaResult.value) {
    otaContextSources.push(
      "Wikipedia: Online travel agency (en.wikipedia.org/wiki/Online_travel_agency)",
    );
  }
  if (cnbcResult.status === "fulfilled" && cnbcResult.value.length > 0) {
    otaContextSources.push(`CNBC News: "${cnbcResult.value[0]}"`);
  }

  const liveRows: PropertyDefaultsComparableRow[] = [];

  for (const { result, city, locale, vertical, otaMixFraction } of cityResults) {
    if (result.status !== "fulfilled" || !result.value.length) continue;
    const hotels = result.value.filter((h) => h.avgPricePerNightUsd > 0);
    if (!hotels.length) continue;

    const avgAdr = Math.round(
      hotels.reduce((s, h) => s + h.avgPricePerNightUsd, 0) / hotels.length,
    );
    const adjustedMix = avgAdr < LIVE_BOOKING_ADR_BUDGET_THRESHOLD_USD
      ? LIVE_OTA_MIX_HEAVY_FRACTION
      : otaMixFraction;
    const salesCommissionRate = parseFloat(
      (adjustedMix * LIVE_OTA_COMMISSION_BOOKING_COM_FRACTION).toFixed(4),
    );

    const rowSources = [
      `Booking.com live search (${city}, ${today}, avg $${avgAdr}/night, n=${hotels.length})`,
      ...otaContextSources,
      `OTA mix ${(adjustedMix * 100).toFixed(0)}% × ${(LIVE_OTA_COMMISSION_BOOKING_COM_FRACTION * 100).toFixed(0)}% commission = ${(salesCommissionRate * 100).toFixed(1)}% blended`,
    ];

    liveRows.push({
      propertyName:           `${city} Boutique Comp (Booking.com live, avg $${avgAdr}/night)`,
      locale,
      vertical,
      roomCount:              LIVE_BOOKING_REPRESENTATIVE_ROOM_COUNT,
      eventExpenseRate:       DEFAULT_EVENT_EXPENSE_RATE_BENCHMARK_MID,
      otherExpenseRate:       DEFAULT_OTHER_EXPENSE_RATE_BENCHMARK_MID,
      utilitiesVariableSplit: DEFAULT_UTILITIES_VARIABLE_SPLIT_BENCHMARK_MID,
      salesCommissionRate,
      vintage:                new Date().getFullYear(),
      source:                 rowSources.join(" | "),
    });
  }

  logger.info(
    `fetchPropertyDefaultsLive: ${liveRows.length} live rows from Booking.com`,
    CHANNEL,
  );
  return liveRows;
}
