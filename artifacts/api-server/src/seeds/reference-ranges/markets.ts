/**
 * Reference Range seeder — market KPI passes.
 *
 * Pass 1: KPI rows from existing market_adr_index seed data (instant, no API)
 * Pass 2: KPI rows refreshed from AirROI live API (if AIRROI_API_KEY is set)
 * Pass 4: Macro rows from FRED (if FRED_API_KEY is set)
 */

import { logger } from "../../logger";
import { TAG, YEAR, upsertRange } from "./helpers";

// ── Pass 1: KPI market benchmarks from existing seed data ─────────────────────

const MARKET_KPI_SEEDS: Array<{
  market: string; country: string; subdivision?: string;
  adr: number; occupancy: number; revpar: number; boutiqueAdr: number;
  segment: string; source: string; sourceUrl?: string;
}> = [
  // US markets
  { market: "New York City",  country: "US", subdivision: "NY",
    adr: 305, occupancy: 0.725, revpar: 221, boutiqueAdr: 400,
    segment: "all",
    source: "STR / H+ Research composite 2025" },
  { market: "Miami",          country: "US", subdivision: "FL",
    adr: 285, occupancy: 0.740, revpar: 211, boutiqueAdr: 380,
    segment: "all",
    source: "STR / CBRE Hotels 2024" },
  { market: "Eden UT",        country: "US", subdivision: "UT",
    adr: 338, occupancy: 0.480, revpar: 162, boutiqueAdr: 420,
    segment: "str",
    source: "AirROI 2026 (Eden, UT STR market)", sourceUrl: "https://www.airroi.com/airbnb-data/united-states/utah/eden" },
  { market: "Park City UT",   country: "US", subdivision: "UT",
    adr: 280, occupancy: 0.600, revpar: 168, boutiqueAdr: 380,
    segment: "boutique_hotel",
    source: "STR / Ski resort segment 2024" },
  { market: "Nashville TN",   country: "US", subdivision: "TN",
    adr: 218, occupancy: 0.690, revpar: 150, boutiqueAdr: 290,
    segment: "all",
    source: "STR / CBRE Hotels Nashville 2024" },
  { market: "Sedona AZ",      country: "US", subdivision: "AZ",
    adr: 350, occupancy: 0.610, revpar: 214, boutiqueAdr: 460,
    segment: "boutique_hotel",
    source: "AZ Office of Tourism / STR boutique segment 2024" },
  { market: "Aspen CO",       country: "US", subdivision: "CO",
    adr: 680, occupancy: 0.560, revpar: 381, boutiqueAdr: 850,
    segment: "luxury",
    source: "Aspen Chamber / STR luxury mountain segment 2024" },
  // Colombia markets
  { market: "Medellín",       country: "CO",
    adr: 85,  occupancy: 0.570, revpar: 48,  boutiqueAdr: 145,
    segment: "str",
    source: "AirROI 2025 / Everyplace Medellín STR report", sourceUrl: "https://www.airroi.com/airbnb-data/colombia/antioquia/medellin" },
  { market: "Cartagena",      country: "CO",
    adr: 145, occupancy: 0.620, revpar: 90,  boutiqueAdr: 200,
    segment: "boutique_hotel",
    source: "ProColombia tourism data 2024" },
];

export async function seedKpiRows(): Promise<void> {
  for (const m of MARKET_KPI_SEEDS) {
    await upsertRange({
      domain: "kpi", metricKey: "adr", label: `Average Daily Rate — ${m.market}`,
      country: m.country, subdivision: m.subdivision ?? null, market: m.market,
      segment: m.segment,
      year: YEAR, low: m.adr * 0.85, mid: m.adr, high: m.adr * 1.15, unit: "usd_per_night",
      sourceName: m.source, sourceUrl: m.sourceUrl ?? null,
      methodology: "Market-level composite; boutique segment typically 20-40% premium over all-class average",
      confidence: m.sourceUrl ? "medium" : "low",
    });
    await upsertRange({
      domain: "kpi", metricKey: "occupancy", label: `Occupancy Rate — ${m.market}`,
      country: m.country, subdivision: m.subdivision ?? null, market: m.market,
      segment: m.segment,
      year: YEAR, low: m.occupancy - 0.08, mid: m.occupancy, high: m.occupancy + 0.08, unit: "percent",
      sourceName: m.source, sourceUrl: m.sourceUrl ?? null, confidence: "medium",
    });
    await upsertRange({
      domain: "kpi", metricKey: "revpar", label: `RevPAR — ${m.market}`,
      country: m.country, subdivision: m.subdivision ?? null, market: m.market,
      segment: m.segment,
      year: YEAR,
      low: Math.round(m.revpar * 0.85), mid: m.revpar, high: Math.round(m.revpar * 1.15),
      unit: "usd_per_available_room_night",
      sourceName: m.source, sourceUrl: m.sourceUrl ?? null, confidence: "medium",
    });
    await upsertRange({
      domain: "kpi", metricKey: "adr-boutique", label: `Boutique ADR — ${m.market}`,
      country: m.country, subdivision: m.subdivision ?? null, market: m.market,
      segment: "boutique_hotel",
      year: YEAR,
      low: Math.round(m.boutiqueAdr * 0.80), mid: m.boutiqueAdr, high: Math.round(m.boutiqueAdr * 1.25),
      unit: "usd_per_night",
      sourceName: m.source, confidence: "low",
    });
  }
  logger.info(`Seeded KPI rows for ${MARKET_KPI_SEEDS.length} markets`, TAG);
}

// ── Pass 2: KPI refresh from AirROI live API ─────────────────────────────────

export async function refreshKpiFromAirROI(): Promise<{ updated: number; skipped: number }> {
  if (!process.env.AIRROI_API_KEY) {
    logger.warn("AIRROI_API_KEY not set — skipping live KPI refresh", TAG);
    return { updated: 0, skipped: MARKET_KPI_SEEDS.length };
  }

  const { AirROIService } = await import("../../services/AirROIService");
  const svc = new AirROIService();

  if (!svc.isAvailable()) return { updated: 0, skipped: MARKET_KPI_SEEDS.length };

  const results = await svc.fetchAllMarkets();
  let updated = 0;

  for (const r of results) {
    const parts = r.marketKey.split(" ");
    const subdivision = parts[parts.length - 1]; // "UT", "TN", "CO", "FL", "AZ", "CO"
    const country = r.marketKey.endsWith(" CO") && !["Aspen CO"].includes(r.marketKey) ? "CO" : "US";

    await upsertRange({
      domain: "kpi", metricKey: "adr", label: `Average Daily Rate — ${r.marketKey}`,
      country, subdivision: country === "US" ? subdivision : null, market: r.marketKey,
      year: YEAR, low: Math.round(r.adrUsd * 0.85), mid: r.adrUsd, high: Math.round(r.adrUsd * 1.15),
      unit: "usd_per_night",
      sourceName: "AirROI STR Market Data", sourceUrl: "https://www.airroi.com",
      methodology: `Live TTM data as of ${r.asOf}. STR market average; boutique premium applies.`,
      confidence: "medium",
      verifiedBy: "airroi-refresh",
    });
    await upsertRange({
      domain: "kpi", metricKey: "occupancy", label: `Occupancy Rate — ${r.marketKey}`,
      country, subdivision: country === "US" ? subdivision : null, market: r.marketKey,
      year: YEAR,
      low: Math.round((r.occupancyRate - 0.08) * 10000) / 10000,
      mid: r.occupancyRate,
      high: Math.round((r.occupancyRate + 0.08) * 10000) / 10000,
      unit: "percent",
      sourceName: "AirROI STR Market Data", sourceUrl: "https://www.airroi.com",
      confidence: "medium",
      verifiedBy: "airroi-refresh",
    });
    await upsertRange({
      domain: "kpi", metricKey: "revpar", label: `RevPAR — ${r.marketKey}`,
      country, subdivision: country === "US" ? subdivision : null, market: r.marketKey,
      year: YEAR,
      low: Math.round(r.revparUsd * 0.85), mid: r.revparUsd, high: Math.round(r.revparUsd * 1.15),
      unit: "usd_per_available_room_night",
      sourceName: "AirROI STR Market Data", sourceUrl: "https://www.airroi.com",
      confidence: "medium",
      verifiedBy: "airroi-refresh",
    });
    updated++;
  }

  logger.info(`AirROI refresh: updated ${updated} markets`, TAG);
  return { updated, skipped: MARKET_KPI_SEEDS.length - updated };
}

// ── Pass 4: Macro rows from FRED ─────────────────────────────────────────────

export async function refreshMacroFromFRED(): Promise<{ updated: number }> {
  if (!process.env.FRED_API_KEY) {
    logger.warn("FRED_API_KEY not set — seeding static macro fallback", TAG);
    // Static fallback when FRED key not available
    await upsertRange({ domain: "macro", metricKey: "inflation-cpi-us", label: "US Inflation (CPI, headline)", country: "US", year: YEAR, low: 2.0, mid: 3.0, high: 4.5, unit: "percent_annual", sourceName: "FRED CPIAUCSL — static fallback", confidence: "low" });
    await upsertRange({ domain: "macro", metricKey: "prime-rate-us",    label: "US Prime Rate",                country: "US", year: YEAR, low: 7.0, mid: 7.5, high: 8.5, unit: "percent",        sourceName: "FRED DPRIME — static fallback", confidence: "low" });
    await upsertRange({ domain: "macro", metricKey: "treasury-10yr-us", label: "US 10-Year Treasury Yield",    country: "US", year: YEAR, low: 3.8, mid: 4.3, high: 5.2, unit: "percent",        sourceName: "FRED DGS10 — static fallback", confidence: "low" });
    await upsertRange({ domain: "macro", metricKey: "inflation-cpi-co", label: "Colombia Inflation (CPI)",     country: "CO", year: YEAR, low: 4.0, mid: 5.5, high: 8.0, unit: "percent_annual", sourceName: "Banco de la República / World Bank — static fallback", confidence: "low" });
    return { updated: 0 };
  }

  const { FREDService } = await import("../../services/FREDService");
  const fred = new FREDService();
  if (!fred.isAvailable()) return { updated: 0 };

  let updated = 0;
  const fetchAndUpsert = async (seriesKey: Parameters<typeof fred.fetchRate>[0], metricKey: string, label: string) => {
    const data = await fred.fetchRate(seriesKey);
    if (!data?.current) return;
    const rawVal = data.current.value;
    const v = typeof rawVal === "number" ? rawVal : parseFloat(String(rawVal));
    if (!Number.isFinite(v)) return;
    await upsertRange({
      domain: "macro", metricKey, label, country: "US", year: YEAR,
      low: Math.round(v * 0.85 * 100) / 100,
      mid: Math.round(v * 100) / 100,
      high: Math.round(v * 1.15 * 100) / 100,
      unit: "percent",
      sourceName: `FRED ${seriesKey}`, sourceUrl: "https://fred.stlouisfed.org",
      methodology: "Most recent observation ±15% band",
      confidence: "high",
    });
    updated++;
  };

  await Promise.all([
    fetchAndUpsert("cpi",         "inflation-cpi-us", "US Inflation (CPI, headline)"),
    fetchAndUpsert("primeRate",   "prime-rate-us",    "US Prime Rate"),
    fetchAndUpsert("treasury10y", "treasury-10yr-us", "US 10-Year Treasury Yield"),
  ]);

  logger.info(`FRED macro refresh: ${updated} series updated`, TAG);
  return { updated };
}
