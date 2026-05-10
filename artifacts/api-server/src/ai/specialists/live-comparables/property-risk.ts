/**
 * live-comparables/property-risk.ts — PropertyRisk specialist comparables.
 *
 * PropertyRisk   FRED CUSR0000SAH21 units=pc1 (US lodging CPI YoY %)
 *                + IMF WEO REST PCPIPCH/EMG (EM aggregate inflation projection)
 *                EU Eurostat HICP row kept canned (SDMX parsing deferred).
 */

import { logger } from "../../../logger";
import { getMarketRate } from "../../../data/marketRates";
import {
  getCannedInflationComparables,
  type InflationComparableRow,
} from "../property-risk-orchestrator-adapter";
import { CHANNEL, FETCH_TIMEOUT_MS, fetchFredObs } from "./shared";

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
  const usBandRate = await getMarketRate("us_lodging_cpi_band_halfwidth");
  if (usLodgingPc1 !== null && usBandRate?.value != null) {
    const mid = usLodgingPc1 / 100;
    const halfWidth = usBandRate.value / 100;
    const low = Math.max(0, mid - halfWidth);
    const high = mid + halfWidth;
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
  const [emBandLowRate, emBandHighRate] = await Promise.all([
    getMarketRate("imf_em_cpi_band_delta_low"),
    getMarketRate("imf_em_cpi_band_delta_high"),
  ]);
  if (emPct !== null && emBandLowRate?.value != null && emBandHighRate?.value != null) {
    const mid = emPct / 100;
    const bandLow = emBandLowRate.value / 100;
    const bandHigh = emBandHighRate.value / 100;
    const low = Math.max(0, mid - bandLow);
    const high = mid + bandHigh;
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
