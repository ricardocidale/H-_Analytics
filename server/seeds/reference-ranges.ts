/**
 * Reference Range seeder — populates reference_range from authoritative sources.
 *
 * Run order: after market-data-tables seed (labor/ADR data already in DB).
 * Safe to re-run (upserts via ON CONFLICT DO UPDATE).
 *
 * Three passes:
 *   1. KPI rows from existing market_adr_index seed data (instant, no API)
 *   2. KPI rows refreshed from AirROI live API (if AIRROI_API_KEY is set)
 *   3. Labor rows from existing labor_rates seed data
 *   4. Macro rows from FRED (if FRED_API_KEY is set)
 *
 * The Admin "Refresh" button in the Reference Ranges tab calls
 * POST /api/admin/reference-ranges/refresh to re-run passes 2 and 4.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "seed:reference-ranges";
const YEAR = new Date().getFullYear();

// ── Helpers ───────────────────────────────────────────────────────────────────

async function upsertRange(row: {
  domain: string; metricKey: string; label: string;
  country: string; subdivision?: string | null; market?: string | null;
  segment?: string | null; propertyType?: string | null;
  year: number;
  low: number; mid: number; high: number; unit: string;
  sourceName?: string | null; sourceUrl?: string | null;
  methodology?: string | null; confidence?: string;
  verifiedBy?: string | null;
}): Promise<void> {
  await db.execute(sql`
    INSERT INTO reference_range
      (domain, metric_key, label, country, subdivision, market, segment, property_type,
       year, low, mid, high, unit, source_name, source_url, methodology, confidence,
       verified_by, last_verified_at, updated_at)
    VALUES
      (${row.domain}, ${row.metricKey}, ${row.label},
       ${row.country}, ${row.subdivision ?? null}, ${row.market ?? null},
       ${row.segment ?? null}, ${row.propertyType ?? null},
       ${row.year}, ${row.low}, ${row.mid}, ${row.high}, ${row.unit},
       ${row.sourceName ?? null}, ${row.sourceUrl ?? null},
       ${row.methodology ?? null}, ${row.confidence ?? "medium"},
       ${"seed-loader"}, now(), now())
    ON CONFLICT (domain, metric_key, country, subdivision, market, segment, property_type, year)
      DO UPDATE SET
        low = EXCLUDED.low, mid = EXCLUDED.mid, high = EXCLUDED.high,
        unit = EXCLUDED.unit,
        source_name = COALESCE(EXCLUDED.source_name, reference_range.source_name),
        source_url  = COALESCE(EXCLUDED.source_url,  reference_range.source_url),
        methodology = COALESCE(EXCLUDED.methodology,  reference_range.methodology),
        confidence  = EXCLUDED.confidence,
        verified_by = EXCLUDED.verified_by,
        last_verified_at = now(),
        updated_at  = now()
  `);
}

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

async function seedKpiRows(): Promise<void> {
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

  const { AirROIService } = await import("../services/AirROIService");
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

// ── Pass 3: Labor rows ────────────────────────────────────────────────────────

const LABOR_SEEDS: Array<{
  role: string; label: string; country: string; market?: string;
  low: number; mid: number; high: number; unit: string; source: string; sourceUrl?: string;
}> = [
  // US — national averages (BLS OES 2024)
  { role: "general-manager",      label: "General Manager (lodging)",       country: "US", low: 72000, mid: 95000, high: 135000, unit: "usd_annual", source: "BLS OES 11-9081 / HVS salary survey 2024", sourceUrl: "https://www.bls.gov/oes/" },
  { role: "revenue-manager",      label: "Revenue Manager",                 country: "US", low: 55000, mid: 72000, high: 98000,  unit: "usd_annual", source: "BLS OES 13-2051 proxy / Hcareers 2024", sourceUrl: "https://www.bls.gov/oes/" },
  { role: "front-desk-clerk",     label: "Front Desk / Guest Services",     country: "US", low: 32000, mid: 37440, high: 48000,  unit: "usd_annual", source: "BLS OES 43-4081 2024", sourceUrl: "https://www.bls.gov/oes/" },
  { role: "housekeeper",          label: "Housekeeper / Room Attendant",    country: "US", low: 28000, mid: 33280, high: 44000,  unit: "usd_annual", source: "BLS OES 37-2012 2024", sourceUrl: "https://www.bls.gov/oes/" },
  { role: "executive-chef",       label: "Executive Chef",                  country: "US", low: 58000, mid: 75000, high: 110000, unit: "usd_annual", source: "BLS OES 35-1011 2024", sourceUrl: "https://www.bls.gov/oes/" },
  { role: "food-service-manager", label: "Food & Beverage Manager",         country: "US", low: 48000, mid: 62000, high: 85000,  unit: "usd_annual", source: "BLS OES 11-9051 2024", sourceUrl: "https://www.bls.gov/oes/" },
  { role: "marketing-manager",    label: "Marketing Manager",               country: "US", low: 52000, mid: 68000, high: 95000,  unit: "usd_annual", source: "BLS OES 11-2021 / Hcareers 2024", sourceUrl: "https://www.bls.gov/oes/" },
  { role: "maintenance",          label: "Maintenance / Engineering Tech",  country: "US", low: 34000, mid: 41600, high: 58000,  unit: "usd_annual", source: "BLS OES 49-9071 2024", sourceUrl: "https://www.bls.gov/oes/" },
  // Eden, UT premium (Utah mountain resort market — ~15% above US general)
  { role: "general-manager",      label: "General Manager — Eden UT",       country: "US", market: "Eden UT",      low: 85000,  mid: 110000, high: 155000, unit: "usd_annual", source: "Utah DOL / resort market premium 2024" },
  { role: "front-desk-clerk",     label: "Front Desk — Eden UT",            country: "US", market: "Eden UT",      low: 36000,  mid: 43000,  high: 55000,  unit: "usd_annual", source: "Utah DOL 2024" },
  // Medellín, CO (DANE / Colombian hospitality industry 2024, in USD at ~3,100 COP/USD)
  { role: "general-manager",      label: "General Manager — Medellín",      country: "CO", market: "Medellín",     low: 18000,  mid: 24000,  high: 36000,  unit: "usd_annual", source: "DANE / Colombian hospitality industry 2024", sourceUrl: "https://www.dane.gov.co" },
  { role: "front-desk-clerk",     label: "Front Desk — Medellín",           country: "CO", market: "Medellín",     low: 4000,   mid: 4800,   high: 6500,   unit: "usd_annual", source: "DANE / SMLV + hospitality premium 2024", sourceUrl: "https://www.dane.gov.co" },
  { role: "housekeeper",          label: "Housekeeper — Medellín",          country: "CO", market: "Medellín",     low: 3600,   mid: 4200,   high: 5500,   unit: "usd_annual", source: "DANE / Colombian hospitality industry 2024", sourceUrl: "https://www.dane.gov.co" },
  { role: "executive-chef",       label: "Executive Chef — Medellín",       country: "CO", market: "Medellín",     low: 9000,   mid: 13000,  high: 20000,  unit: "usd_annual", source: "Colombian hospitality industry 2024" },
  // Cartagena (tourism premium over Medellín)
  { role: "general-manager",      label: "General Manager — Cartagena",     country: "CO", market: "Cartagena",    low: 20000,  mid: 27000,  high: 40000,  unit: "usd_annual", source: "DANE / Cartagena tourism sector 2024", sourceUrl: "https://www.dane.gov.co" },
  { role: "front-desk-clerk",     label: "Front Desk — Cartagena",          country: "CO", market: "Cartagena",    low: 4500,   mid: 5400,   high: 7000,   unit: "usd_annual", source: "DANE / Cartagena tourism sector 2024", sourceUrl: "https://www.dane.gov.co" },
];

async function seedLaborRows(): Promise<void> {
  for (const r of LABOR_SEEDS) {
    await upsertRange({
      domain: "labor", metricKey: r.role, label: r.label,
      country: r.country, market: r.market ?? null,
      year: YEAR, low: r.low, mid: r.mid, high: r.high, unit: r.unit,
      sourceName: r.source, sourceUrl: r.sourceUrl ?? null,
      methodology: "Annual base salary excluding tips, overtime, and benefits load",
      confidence: "medium",
    });
  }
  logger.info(`Seeded labor rows: ${LABOR_SEEDS.length} roles`, TAG);
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

  const { FREDService } = await import("../services/FREDService");
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

// ── Main entry point (called from runSeeds) ───────────────────────────────────

export async function seedReferenceRanges(): Promise<void> {
  logger.info("Seeding reference_range table...", TAG);
  await seedKpiRows();
  await seedLaborRows();
  await refreshMacroFromFRED(); // uses static fallback if no FRED key
  logger.info("Reference range seeding complete", TAG);
}
