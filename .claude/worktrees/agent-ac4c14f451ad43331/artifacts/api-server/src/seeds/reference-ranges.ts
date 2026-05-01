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

// ── Pass 5: Hospitality KPI benchmarks — margins, cap rates, fees ────────────
// Tables 1, 6 from H+ Research 2026 (Americas vs. Southern Europe)

type KpiBenchmarkSeed = {
  metricKey: string; label: string;
  country: string; segment?: string;
  low: number; mid: number; high: number; unit: string;
  source: string; sourceUrl?: string; methodology?: string;
};

const HOSPITALITY_KPI_BENCHMARKS: KpiBenchmarkSeed[] = [
  // ── GOP margin ──
  { metricKey: "gop-margin", label: "GOP Margin — US Boutique/Select Service",
    country: "US", segment: "boutique_hotel",
    low: 25.0, mid: 35.0, high: 45.0, unit: "percent_of_revenue",
    source: "CBRE Hotels Trends 2024–2025 / HVS Survey",
    sourceUrl: "https://www.cbre.com", methodology: "USALI GOP ÷ Total Revenue; select to luxury boutique range" },
  { metricKey: "gop-margin", label: "GOP Margin — Spain Boutique",
    country: "ES", segment: "boutique_hotel",
    low: 20.0, mid: 27.5, high: 35.0, unit: "percent_of_revenue",
    source: "Horwath HTL Spain / HVS Europe Hotels 2024",
    sourceUrl: "https://www.horwathhtl.com" },
  { metricKey: "gop-margin", label: "GOP Margin — Italy Boutique",
    country: "IT", segment: "boutique_hotel",
    low: 20.0, mid: 27.0, high: 34.0, unit: "percent_of_revenue",
    source: "Horwath HTL Italy / HVS Europe Hotels 2024",
    sourceUrl: "https://www.horwathhtl.com" },
  { metricKey: "gop-margin", label: "GOP Margin — Greece Boutique",
    country: "GR", segment: "boutique_hotel",
    low: 20.0, mid: 28.0, high: 36.0, unit: "percent_of_revenue",
    source: "GNTO / HVS Athens 2024" },

  // ── NOI margin (after FF&E reserve) ──
  { metricKey: "noi-margin-after-ffe", label: "NOI Margin after FF&E — US Boutique",
    country: "US", segment: "boutique_hotel",
    low: 15.0, mid: 22.5, high: 30.0, unit: "percent_of_revenue",
    source: "CBRE Hotels Trends 2024–2025", sourceUrl: "https://www.cbre.com",
    methodology: "NOI after deducting standard 4–5% FF&E reserve from GOP" },
  { metricKey: "noi-margin-after-ffe", label: "NOI Margin after FF&E — Spain Boutique",
    country: "ES", segment: "boutique_hotel",
    low: 10.0, mid: 17.5, high: 25.0, unit: "percent_of_revenue",
    source: "Horwath HTL Spain 2024" },
  { metricKey: "noi-margin-after-ffe", label: "NOI Margin after FF&E — Italy Boutique",
    country: "IT", segment: "boutique_hotel",
    low: 10.0, mid: 17.0, high: 24.0, unit: "percent_of_revenue",
    source: "Horwath HTL Italy 2024" },
  { metricKey: "noi-margin-after-ffe", label: "NOI Margin after FF&E — Greece Boutique",
    country: "GR", segment: "boutique_hotel",
    low: 10.0, mid: 18.0, high: 26.0, unit: "percent_of_revenue",
    source: "GNTO / HVS Athens 2024" },

  // ── Stabilized occupancy (national average as benchmark) ──
  { metricKey: "occupancy-stabilized", label: "Stabilized Occupancy — US Boutique",
    country: "US", segment: "boutique_hotel",
    low: 0.65, mid: 0.70, high: 0.75, unit: "percent",
    source: "STR / CBRE Hotels 2024", sourceUrl: "https://www.costar.com" },
  { metricKey: "occupancy-stabilized", label: "Stabilized Occupancy — Southern Europe Boutique",
    country: "ES", segment: "boutique_hotel",
    low: 0.60, mid: 0.66, high: 0.72, unit: "percent",
    source: "Horwath HTL Spain / MTE Spain 2024" },
  { metricKey: "occupancy-stabilized", label: "Stabilized Occupancy — Italy Boutique",
    country: "IT", segment: "boutique_hotel",
    low: 0.58, mid: 0.65, high: 0.72, unit: "percent",
    source: "Horwath HTL Italy 2024" },
  { metricKey: "occupancy-stabilized", label: "Stabilized Occupancy — Greece Boutique",
    country: "GR", segment: "boutique_hotel",
    low: 0.55, mid: 0.63, high: 0.70, unit: "percent",
    source: "GNTO 2024" },

  // ── Stabilization ramp period ──
  { metricKey: "ramp-months", label: "Ramp to Stabilization — US",
    country: "US",
    low: 12.0, mid: 18.0, high: 24.0, unit: "months",
    source: "HVS / Horwath HTL Americas 2024", sourceUrl: "https://www.hvs.com",
    methodology: "Months from opening to reach stabilized occupancy; influenced by brand, market depth, and pre-opening marketing spend" },
  { metricKey: "ramp-months", label: "Ramp to Stabilization — Spain",
    country: "ES",
    low: 18.0, mid: 27.0, high: 36.0, unit: "months",
    source: "Horwath HTL Spain 2024", sourceUrl: "https://www.horwathhtl.com" },
  { metricKey: "ramp-months", label: "Ramp to Stabilization — Italy",
    country: "IT",
    low: 18.0, mid: 27.0, high: 36.0, unit: "months",
    source: "Horwath HTL Italy 2024" },
  { metricKey: "ramp-months", label: "Ramp to Stabilization — Greece",
    country: "GR",
    low: 18.0, mid: 27.0, high: 36.0, unit: "months",
    source: "HVS Athens 2024" },

  // ── Cap rate ──
  { metricKey: "cap-rate", label: "Exit Cap Rate — US Boutique Hotel",
    country: "US", segment: "boutique_hotel",
    low: 6.0, mid: 7.5, high: 9.5, unit: "percent",
    source: "CBRE Hotels Cap Rate Survey H2 2024", sourceUrl: "https://www.cbre.com",
    methodology: "TTM NOI ÷ Transaction price; stabilized boutique/lifestyle hotels" },
  { metricKey: "cap-rate", label: "Exit Cap Rate — Spain Boutique",
    country: "ES", segment: "boutique_hotel",
    low: 5.0, mid: 6.0, high: 7.5, unit: "percent",
    source: "Cushman & Wakefield Hotels Spain 2024 / HVS" },
  { metricKey: "cap-rate", label: "Exit Cap Rate — Italy Boutique",
    country: "IT", segment: "boutique_hotel",
    low: 5.0, mid: 6.0, high: 7.5, unit: "percent",
    source: "Cushman & Wakefield Hotels Italy 2024" },
  { metricKey: "cap-rate", label: "Exit Cap Rate — Greece Boutique",
    country: "GR", segment: "boutique_hotel",
    low: 6.0, mid: 7.0, high: 9.0, unit: "percent",
    source: "HVS Athens / JLL Hotels Greece 2024" },

  // ── Management fees (Table 6) ──
  { metricKey: "mgmt-fee-base", label: "Management Fee — Base % Revenue — US",
    country: "US",
    low: 2.0, mid: 3.0, high: 4.0, unit: "percent_of_revenue",
    source: "HVS / CBRE Hotels Management Fee Survey 2024", sourceUrl: "https://www.hvs.com",
    methodology: "Base fee as % of total hotel revenue; independent operators at low end, branded operators at high end" },
  { metricKey: "mgmt-fee-incentive", label: "Management Fee — Incentive % GOP — US",
    country: "US",
    low: 8.0, mid: 10.0, high: 12.0, unit: "percent_of_gop",
    source: "HVS / CBRE Hotels Management Fee Survey 2024", sourceUrl: "https://www.hvs.com",
    methodology: "Incentive calculated on Adjusted GOP after owner's priority return; branded full-service at high end" },
  { metricKey: "mgmt-fee-accounting", label: "Management Fee — Accounting/Tech/Mgmt per Room — US",
    country: "US",
    low: 500.0, mid: 1000.0, high: 1500.0, unit: "usd_per_room_annual",
    source: "CBRE Hotels / AHLA 2024" },
  { metricKey: "mgmt-fee-base", label: "Management Fee — Base % Revenue — Southern Europe",
    country: "ES",
    low: 2.0, mid: 2.75, high: 3.5, unit: "percent_of_revenue",
    source: "HVS Europe / Horwath HTL Spain 2024" },
  { metricKey: "mgmt-fee-incentive", label: "Management Fee — Incentive % GOP — Southern Europe",
    country: "ES",
    low: 8.0, mid: 9.0, high: 10.0, unit: "percent_of_gop",
    source: "HVS Europe / Horwath HTL 2024" },
];

async function seedHospitalityKpiBenchmarks(): Promise<void> {
  for (const r of HOSPITALITY_KPI_BENCHMARKS) {
    await upsertRange({
      domain: "kpi", metricKey: r.metricKey, label: r.label,
      country: r.country, segment: r.segment ?? null,
      year: YEAR,
      low: r.low, mid: r.mid, high: r.high, unit: r.unit,
      sourceName: r.source, sourceUrl: r.sourceUrl ?? null,
      methodology: r.methodology ?? null,
      confidence: r.sourceUrl ? "medium" : "low",
    });
  }
  logger.info(`Seeded hospitality KPI benchmarks: ${HOSPITALITY_KPI_BENCHMARKS.length} rows`, TAG);
}

// ── Pass 6: Financing benchmarks (Table 2) ────────────────────────────────────

const FINANCING_BENCHMARKS: Array<{
  metricKey: string; label: string; country: string; segment?: string;
  low: number; mid: number; high: number; unit: string;
  source: string; sourceUrl?: string; methodology?: string;
}> = [
  // LTV
  { metricKey: "ltv-senior", label: "Senior Loan LTV — US Boutique Hotel",
    country: "US", segment: "boutique_hotel",
    low: 55.0, mid: 62.5, high: 70.0, unit: "percent",
    source: "CBRE Hotels Capital Markets / HVS Debt Survey 2024", sourceUrl: "https://www.cbre.com",
    methodology: "Senior construction/bridge lenders; stabilized perm closer to low end; value-add deals at high end" },
  { metricKey: "ltv-senior", label: "Senior Loan LTV — Southern Europe Hotel",
    country: "ES", segment: "boutique_hotel",
    low: 50.0, mid: 57.5, high: 65.0, unit: "percent",
    source: "HVS Europe / Cushman & Wakefield Hotels Finance 2024",
    methodology: "European lenders haircut appraised values harder; Spain/Italy/Greece typically more conservative than US" },
  // DSCR
  { metricKey: "dscr-minimum", label: "DSCR Minimum — US Hotel Senior Debt",
    country: "US",
    low: 1.20, mid: 1.30, high: 1.50, unit: "ratio",
    source: "CBRE Hotels / HVS Debt Survey 2024",
    methodology: "Minimum DSCR required for loan approval; stabilized TTM NOI ÷ annual debt service" },
  { metricKey: "dscr-minimum", label: "DSCR Minimum — European Hotel Senior Debt",
    country: "ES",
    low: 1.25, mid: 1.35, high: 1.60, unit: "ratio",
    source: "HVS Europe Hotels Debt Survey 2024" },
  // Debt yield
  { metricKey: "debt-yield-minimum", label: "Debt Yield Minimum — US Hotel Perm Loan",
    country: "US",
    low: 7.0, mid: 8.0, high: 9.5, unit: "percent",
    source: "CBRE Capital Markets Hotels 2024",
    methodology: "NOI ÷ Loan amount; lender floor for perm underwriting independent of rate environment" },
  // Interest rate spreads
  { metricKey: "interest-rate-bridge", label: "Bridge Loan Rate — US Hotel",
    country: "US",
    low: 7.0, mid: 8.5, high: 10.0, unit: "percent",
    source: "HVS / CBRE Hotels Capital Markets 2024",
    methodology: "All-in floating rate (SOFR + spread); SOFR ~5.3% + 175–300bps spread as of 2024" },
  { metricKey: "interest-rate-perm", label: "Permanent Loan Rate — US Hotel",
    country: "US",
    low: 6.5, mid: 7.5, high: 8.5, unit: "percent",
    source: "CBRE Hotels Capital Markets 2024",
    methodology: "Fixed rate agency or life-company perm; based on 10-yr Treasury + 250–350bps spread" },
  // Equity multiples
  { metricKey: "equity-multiple-target", label: "Equity Multiple Target — US Boutique Hotel",
    country: "US", segment: "boutique_hotel",
    low: 1.8, mid: 2.2, high: 2.8, unit: "multiple",
    source: "CBRE Hotels / HVS Investor Survey 2024",
    methodology: "Total equity distributions ÷ total equity invested over hold period (typically 5–7 years); IRR target 12–18% IRR" },
  { metricKey: "equity-multiple-target", label: "Equity Multiple Target — Southern Europe Boutique",
    country: "ES", segment: "boutique_hotel",
    low: 1.7, mid: 2.0, high: 2.5, unit: "multiple",
    source: "HVS Europe / Cushman & Wakefield Hotels Investor Survey 2024" },
  // Preferred equity / mezz spread
  { metricKey: "mezzanine-rate", label: "Mezzanine / Pref Equity Rate — US Hotel",
    country: "US",
    low: 12.0, mid: 14.0, high: 18.0, unit: "percent",
    source: "HVS / CBRE Hotels Capital Markets 2024",
    methodology: "All-in preferred return or mezz coupon; PIK or current-pay depending on structure" },
];

async function seedFinancingBenchmarks(): Promise<void> {
  for (const r of FINANCING_BENCHMARKS) {
    await upsertRange({
      domain: "financing", metricKey: r.metricKey, label: r.label,
      country: r.country, segment: r.segment ?? null,
      year: YEAR,
      low: r.low, mid: r.mid, high: r.high, unit: r.unit,
      sourceName: r.source, sourceUrl: r.sourceUrl ?? null,
      methodology: r.methodology ?? null,
      confidence: r.sourceUrl ? "medium" : "low",
    });
  }
  logger.info(`Seeded financing benchmarks: ${FINANCING_BENCHMARKS.length} rows`, TAG);
}

// ── Pass 7: Operating cost benchmarks (Tables 3, 4) ──────────────────────────

const OPERATING_COST_BENCHMARKS: Array<{
  metricKey: string; label: string; country: string; segment?: string;
  low: number; mid: number; high: number; unit: string;
  source: string; sourceUrl?: string; methodology?: string;
}> = [
  // ── Labor (Table 3) ──
  { metricKey: "fte-per-key-select", label: "FTE per Key — US Select Service",
    country: "US", segment: "select_service",
    low: 0.45, mid: 0.55, high: 0.65, unit: "fte_per_key",
    source: "AHLA / HVS Staffing Survey 2024", sourceUrl: "https://www.hvs.com",
    methodology: "Full-time equivalent staff per available room; includes all departments; limited F&B select service" },
  { metricKey: "fte-per-key-full", label: "FTE per Key — US Full Service Boutique",
    country: "US", segment: "boutique_hotel",
    low: 0.80, mid: 1.00, high: 1.20, unit: "fte_per_key",
    source: "AHLA / CBRE Hotels Operational Survey 2024",
    methodology: "Full-service with full F&B; boutique hotels with personalized service land 20–30% above midscale full-service" },
  { metricKey: "fte-per-key-luxury", label: "FTE per Key — US Luxury",
    country: "US", segment: "luxury",
    low: 1.50, mid: 2.00, high: 2.50, unit: "fte_per_key",
    source: "CBRE Hotels / Forbes Five-Star benchmarks 2024" },
  { metricKey: "fte-per-key-select", label: "FTE per Key — Southern Europe Select",
    country: "ES", segment: "select_service",
    low: 0.50, mid: 0.65, high: 0.80, unit: "fte_per_key",
    source: "Horwath HTL Spain / IHOTELS Spain 2024",
    methodology: "Spain/Italy/Greece: higher than US select due to labor protections and split-shift requirements" },
  { metricKey: "fte-per-key-full", label: "FTE per Key — Southern Europe Full Service",
    country: "ES", segment: "boutique_hotel",
    low: 0.90, mid: 1.15, high: 1.40, unit: "fte_per_key",
    source: "Horwath HTL Spain 2024" },
  { metricKey: "benefits-load", label: "Benefits Load — US (% base wage)",
    country: "US",
    low: 22.0, mid: 25.0, high: 28.0, unit: "percent_of_base_salary",
    source: "BLS Employer Costs for Employee Compensation 2024", sourceUrl: "https://www.bls.gov",
    methodology: "Employer-paid benefits as % of base wages: FICA 7.65%, health insurance, workers comp, unemployment, PTO accrual" },
  { metricKey: "benefits-load", label: "Benefits Load — Southern Europe (% base wage)",
    country: "ES",
    low: 18.0, mid: 22.0, high: 28.0, unit: "percent_of_base_salary",
    source: "Ministerio de Trabajo España / IHOTELS 2024",
    methodology: "Spain: Social Security employer ~23.6%; Italy: INPS ~30%; Greece: IKA ~25%; range reflects mix across jurisdictions" },
  { metricKey: "payroll-tax-employer", label: "Payroll Tax Employer Contribution — US",
    country: "US",
    low: 7.65, mid: 9.5, high: 12.0, unit: "percent",
    source: "IRS Publication 15 / FUTA + SUTA 2024", sourceUrl: "https://www.irs.gov",
    methodology: "FICA 7.65% (SS 6.2% + Medicare 1.45%) + FUTA 0.6% + state SUTA 1–3.5%; bottom of range before SUTA" },
  { metricKey: "payroll-tax-employer", label: "Payroll Tax Employer Contribution — Spain",
    country: "ES",
    low: 23.0, mid: 25.0, high: 28.0, unit: "percent",
    source: "Seguridad Social España 2024",
    methodology: "Social Security contributions: contingencias comunes ~23.6% + contingencias profesionales ~1.5% + FOGASA + FP" },
  { metricKey: "payroll-tax-employer", label: "Payroll Tax Employer Contribution — Italy",
    country: "IT",
    low: 28.0, mid: 30.0, high: 32.0, unit: "percent",
    source: "INPS / Agenzia delle Entrate Italy 2024",
    methodology: "INPS contributions: ~30% of gross salary; varies by sector (CCNL turismo)" },
  { metricKey: "payroll-tax-employer", label: "Payroll Tax Employer Contribution — Greece",
    country: "GR",
    low: 22.0, mid: 24.0, high: 26.0, unit: "percent",
    source: "EFKA Greece / IKA contributions 2024",
    methodology: "IKA (social insurance): ~24% employer share; seasonal hotel workers have special seasonal contract provisions" },
  // ── F&B operating costs (Table 4) ──
  { metricKey: "food-cost-percent", label: "Food Cost % (COGS) — US Hotel Restaurant",
    country: "US",
    low: 28.0, mid: 32.0, high: 36.0, unit: "percent_of_food_revenue",
    source: "National Restaurant Association / CBRE Hotels F&B 2024",
    methodology: "Cost of food sold ÷ food revenue; higher end for upscale preparations; lower end for focused menus" },
  { metricKey: "beverage-cost-percent", label: "Beverage Cost % (COGS) — US Hotel Bar",
    country: "US",
    low: 20.0, mid: 24.0, high: 28.0, unit: "percent_of_beverage_revenue",
    source: "National Restaurant Association / CBRE Hotels F&B 2024",
    methodology: "Cost of beverages sold ÷ beverage revenue; full bar lower than wine-only; premium wine programs at high end" },
  { metricKey: "labor-cost-total", label: "Total Labor Cost % — US Hotel",
    country: "US",
    low: 28.0, mid: 33.0, high: 38.0, unit: "percent_of_revenue",
    source: "CBRE Hotels Trends in the US Hotel Industry 2024",
    methodology: "All departments including management, front office, housekeeping, F&B, maintenance; wages + benefits + contract" },
  { metricKey: "labor-cost-total", label: "Total Labor Cost % — Southern Europe Hotel",
    country: "ES",
    low: 30.0, mid: 35.0, high: 40.0, unit: "percent_of_revenue",
    source: "Horwath HTL Spain 2024",
    methodology: "Higher employer tax burden in SE; includes social security + benefits at prevailing CCNL rates" },
];

async function seedOperatingCostBenchmarks(): Promise<void> {
  for (const r of OPERATING_COST_BENCHMARKS) {
    await upsertRange({
      domain: "labor", metricKey: r.metricKey, label: r.label,
      country: r.country, segment: r.segment ?? null,
      year: YEAR,
      low: r.low, mid: r.mid, high: r.high, unit: r.unit,
      sourceName: r.source, sourceUrl: r.sourceUrl ?? null,
      methodology: r.methodology ?? null,
      confidence: r.sourceUrl ? "medium" : "low",
    });
  }
  logger.info(`Seeded operating cost benchmarks: ${OPERATING_COST_BENCHMARKS.length} rows`, TAG);
}

// ── Pass 8: EWW benchmarks (Table 7) — USALI 12th Ed. Schedule EWW ───────────

const EWW_BENCHMARKS: Array<{
  metricKey: string; label: string; country: string;
  low: number; mid: number; high: number; unit: string;
  source: string; methodology?: string;
}> = [
  // Electricity per room (USD / EUR annual)
  { metricKey: "electricity-per-room", label: "Electricity Cost per Room — US Hotel",
    country: "US",
    low: 1200, mid: 1500, high: 1800, unit: "usd_per_room_annual",
    source: "AHLA / EIA Commercial Buildings Energy Consumption Survey 2024",
    methodology: "All-in annual electricity cost divided by room count; USALI Schedule EWW (12th Ed.); climate/asset-age variation significant" },
  { metricKey: "electricity-per-room", label: "Electricity Cost per Room — Southern Europe Hotel",
    country: "ES",
    low: 1500, mid: 2000, high: 2500, unit: "eur_per_room_annual",
    source: "IHOTELS Spain / Eurostat Energy Statistics 2024",
    methodology: "EUR-denominated; Southern Europe electricity rates 30–60% above US on per-kWh basis; older building stock drives high end" },
  { metricKey: "electricity-per-room", label: "Electricity Cost per Room — Italy",
    country: "IT",
    low: 1600, mid: 2100, high: 2600, unit: "eur_per_room_annual",
    source: "Federalberghi / Eurostat 2024" },
  { metricKey: "electricity-per-room", label: "Electricity Cost per Room — Greece",
    country: "GR",
    low: 1400, mid: 1900, high: 2400, unit: "eur_per_room_annual",
    source: "SETE / Eurostat Greece 2024",
    methodology: "Seasonal hotels; higher peak summer consumption for pools and HVAC; solar installations reducing low end" },
  // Water per room
  { metricKey: "water-per-room", label: "Water & Sewer Cost per Room — US Hotel",
    country: "US",
    low: 400, mid: 550, high: 700, unit: "usd_per_room_annual",
    source: "AHLA / Water Research Foundation Hotel Study 2024",
    methodology: "Combined water + sewer charges; pool properties at high end; arid markets (Phoenix, Las Vegas) 40–60% above average" },
  { metricKey: "water-per-room", label: "Water Cost per Room — Southern Europe",
    country: "ES",
    low: 500, mid: 700, high: 900, unit: "eur_per_room_annual",
    source: "IHOTELS Spain / Ministerio de Medio Ambiente 2024",
    methodology: "Pool resorts and spa properties are at high end; Mediterranean scarcity premium applies" },
  // Waste per room
  { metricKey: "waste-per-room", label: "Waste & Recycling Cost per Room — US Hotel",
    country: "US",
    low: 150, mid: 225, high: 300, unit: "usd_per_room_annual",
    source: "AHLA / USTOA Sustainability Survey 2024",
    methodology: "Refuse removal + recycling; urban markets significantly higher; food-waste diversion programs add cost short-term" },
  { metricKey: "waste-per-room", label: "Waste Cost per Room — Southern Europe",
    country: "ES",
    low: 200, mid: 300, high: 400, unit: "eur_per_room_annual",
    source: "IHOTELS Spain 2024" },
  // Total EWW as % of revenue
  { metricKey: "eww-total-pct-revenue", label: "Total EWW Cost % Revenue — US Hotel",
    country: "US",
    low: 3.5, mid: 4.25, high: 5.0, unit: "percent_of_revenue",
    source: "CBRE Hotels / AHLA Sustainability Report 2024",
    methodology: "Total electricity + water + waste as % total hotel revenue; USALI Schedule EWW classification (12th Ed. effective 2026)" },
  { metricKey: "eww-total-pct-revenue", label: "Total EWW Cost % Revenue — Southern Europe",
    country: "ES",
    low: 4.5, mid: 5.5, high: 6.5, unit: "percent_of_revenue",
    source: "Horwath HTL Spain / IHOTELS 2024",
    methodology: "Higher EUR-denominated utility rates; pool/spa resort segment at high end" },
  { metricKey: "eww-total-pct-revenue", label: "Total EWW Cost % Revenue — Italy",
    country: "IT",
    low: 4.5, mid: 5.5, high: 6.5, unit: "percent_of_revenue",
    source: "Federalberghi / Horwath HTL Italy 2024" },
  { metricKey: "eww-total-pct-revenue", label: "Total EWW Cost % Revenue — Greece",
    country: "GR",
    low: 4.5, mid: 5.5, high: 6.5, unit: "percent_of_revenue",
    source: "SETE / HVS Athens 2024" },
  // EWW cost inflation rate
  { metricKey: "eww-cost-inflation", label: "EWW Cost Inflation Rate — US",
    country: "US",
    low: 3.5, mid: 4.25, high: 5.0, unit: "percent_annual",
    source: "EIA / AHLA Energy Cost Survey 2024",
    methodology: "Annual rate of EWW cost increase; 2022–2024 spike from energy markets may not persist at high end" },
  { metricKey: "eww-cost-inflation", label: "EWW Cost Inflation Rate — Southern Europe",
    country: "ES",
    low: 5.0, mid: 6.5, high: 8.0, unit: "percent_annual",
    source: "Eurostat / Horwath HTL Energy Outlook 2024",
    methodology: "Energy transition costs + carbon pricing in EU contributing to structural upward pressure" },
];

async function seedEwwBenchmarks(): Promise<void> {
  for (const r of EWW_BENCHMARKS) {
    await upsertRange({
      domain: "risk", metricKey: r.metricKey, label: r.label,
      country: r.country,
      year: YEAR,
      low: r.low, mid: r.mid, high: r.high, unit: r.unit,
      sourceName: r.source,
      methodology: r.methodology ?? null,
      confidence: "medium",
    });
  }
  logger.info(`Seeded EWW benchmarks: ${EWW_BENCHMARKS.length} rows`, TAG);
}

// ── Pass 9: CAPEX / construction benchmarks (Table 5, Table 8) ───────────────

const CAPEX_BENCHMARKS: Array<{
  metricKey: string; label: string; country: string; segment?: string;
  low: number; mid: number; high: number; unit: string;
  source: string; sourceUrl?: string; methodology?: string;
}> = [
  // ── Annual FF&E reserve (Table 8) ──
  { metricKey: "ffe-reserve-annual", label: "Annual FF&E Reserve — Standard (% Gross Revenue)",
    country: "US",
    low: 4.0, mid: 4.5, high: 5.0, unit: "percent_of_revenue",
    source: "HVS / CBRE Hotels / Hotel Franchisors Standard 2024", sourceUrl: "https://www.hvs.com",
    methodology: "Annual set-aside for furniture, fixtures & equipment replacement; branded hotels have franchise-mandated minimums of 4–5%" },
  { metricKey: "ffe-reserve-annual", label: "Annual FF&E Reserve — Southern Europe",
    country: "ES",
    low: 3.0, mid: 4.0, high: 5.0, unit: "percent_of_revenue",
    source: "Horwath HTL Spain / HVS Europe 2024",
    methodology: "Similar to US standard; EU brands increasingly require contractual minimums" },
  // ── Catch-up/PIP cycle CAPEX (Table 8) ──
  { metricKey: "ffe-catchup-pct-asset", label: "Catch-up FF&E Cycle Cost — US (% Asset Value)",
    country: "US",
    low: 15.0, mid: 20.0, high: 25.0, unit: "percent_asset_value",
    source: "HVS / CBRE Hotels Capital Markets 2024",
    methodology: "Comprehensive renovation every 7–10 years; full rooms + public areas + back-of-house; varies by brand PIP requirements" },
  { metricKey: "ffe-catchup-pct-asset", label: "Catch-up FF&E Cycle Cost — Southern Europe (% Asset Value)",
    country: "ES",
    low: 10.0, mid: 15.0, high: 20.0, unit: "percent_asset_value",
    source: "Horwath HTL Spain 2024",
    methodology: "Lower renovation frequency driven by family ownership patterns; heritage buildings constrain scope of renovations" },
  // ── PIP cost per key ──
  { metricKey: "pip-cost-per-key-brand-change", label: "PIP Cost per Key — Brand/Flag Change",
    country: "US",
    low: 20000, mid: 30000, high: 40000, unit: "usd_per_key",
    source: "HVS PIP Analysis 2024", sourceUrl: "https://www.hvs.com",
    methodology: "Product Improvement Plan cost on brand conversion; rooms-only renovation; excludes lobby and exterior" },
  { metricKey: "pip-cost-per-key-reposition", label: "PIP Cost per Key — Full Brand Repositioning",
    country: "US",
    low: 50000, mid: 75000, high: 100000, unit: "usd_per_key",
    source: "HVS PIP Analysis 2024",
    methodology: "Full repositioning: rooms + public spaces + F&B + back-of-house; luxury repositioning at high end" },
  // ── New construction cost per key (Table 5) ──
  { metricKey: "construction-cost-per-key-select", label: "New Construction Cost per Key — US Select Service",
    country: "US", segment: "select_service",
    low: 167000, mid: 195000, high: 223000, unit: "usd_per_key",
    source: "HVS / RS Means / Hotel Development Cost Surveys 2024–2025", sourceUrl: "https://www.hvs.com",
    methodology: "Hard costs only; site-specific, market, and design complexity premium not included; 2024 labor cost escalation baked in" },
  { metricKey: "construction-cost-per-key-full", label: "New Construction Cost per Key — US Full Service Boutique",
    country: "US", segment: "boutique_hotel",
    low: 300000, mid: 355000, high: 409000, unit: "usd_per_key",
    source: "HVS / Cushman & Wakefield Hotel Development Costs 2024" },
  { metricKey: "construction-cost-per-key-luxury", label: "New Construction Cost per Key — US Luxury",
    country: "US", segment: "luxury",
    low: 450000, mid: 600000, high: 900000, unit: "usd_per_key",
    source: "HVS / JLL Hotels Luxury Development Survey 2024",
    methodology: "High-end finishes, art budgets, specialized F&B, spa; top end for ultra-luxury urban flagships" },
  // ── Soft costs (% hard costs) ──
  { metricKey: "soft-costs-pct-hard", label: "Soft Costs as % Hard Costs — US Hotel Development",
    country: "US",
    low: 15.0, mid: 20.0, high: 25.0, unit: "percent",
    source: "HVS / RS Means Hotel Development Guide 2024",
    methodology: "Architecture/engineering 8–12%, FF&E design 2–4%, legal/permitting 2–4%, pre-opening 3–5%; varies by market regulation" },
  // ── Construction contingency ──
  { metricKey: "contingency-pct-hard", label: "Construction Contingency — % Hard Costs",
    country: "US",
    low: 5.0, mid: 7.5, high: 10.0, unit: "percent",
    source: "HVS / Hotel Development Cost Survey 2024",
    methodology: "Owner's contingency reserve in project budget; adaptive reuse and historic renovation at high end; ground-up standard at low end" },
  { metricKey: "contingency-pct-hard", label: "Construction Contingency — Southern Europe (% Hard Costs)",
    country: "ES",
    low: 5.0, mid: 8.0, high: 12.0, unit: "percent",
    source: "Horwath HTL Spain 2024",
    methodology: "Heritage building renovation and permitting uncertainty typically demands higher contingency in Spain/Italy" },
];

async function seedCapexBenchmarks(): Promise<void> {
  for (const r of CAPEX_BENCHMARKS) {
    await upsertRange({
      domain: "construction", metricKey: r.metricKey, label: r.label,
      country: r.country, segment: r.segment ?? null,
      year: YEAR,
      low: r.low, mid: r.mid, high: r.high, unit: r.unit,
      sourceName: r.source, sourceUrl: r.sourceUrl ?? null,
      methodology: r.methodology ?? null,
      confidence: r.sourceUrl ? "medium" : "low",
    });
  }
  logger.info(`Seeded CAPEX benchmarks: ${CAPEX_BENCHMARKS.length} rows`, TAG);
}

// ── Pass 10: Fixed costs — property tax, insurance (Table 9) ─────────────────

const FIXED_COST_BENCHMARKS: Array<{
  metricKey: string; label: string; country: string; subdivision?: string;
  low: number; mid: number; high: number; unit: string;
  source: string; sourceUrl?: string; methodology?: string;
}> = [
  // ── Property taxes ──
  { metricKey: "property-tax-rate", label: "Property Tax Rate — US (% Assessed Value)",
    country: "US",
    low: 1.0, mid: 1.75, high: 2.5, unit: "percent_assessed_value",
    source: "Lincoln Institute of Land Policy / CBRE Hotels Tax Survey 2024",
    methodology: "Effective rate on hotel assessed value; assessment may be below market; local jurisdiction rates vary 0.5–3.5%; reassessment at sale is a key risk event for proforma" },
  { metricKey: "property-tax-rate", label: "Property Tax Rate — New York",
    country: "US", subdivision: "NY",
    low: 1.5, mid: 2.5, high: 4.0, unit: "percent_assessed_value",
    source: "NYC Department of Finance / CBRE NYC Hotels 2024",
    methodology: "Class 4 commercial property; assessed value typically 45% of market value; 421-a exemptions may apply for new construction" },
  { metricKey: "property-tax-rate", label: "Property Tax Rate — Texas",
    country: "US", subdivision: "TX",
    low: 1.8, mid: 2.2, high: 2.8, unit: "percent_assessed_value",
    source: "Texas Comptroller / CBRE Hotels Texas 2024",
    methodology: "No state income tax but above-average property tax rates; hotels valued at income approach" },
  { metricKey: "property-tax-rate", label: "Property Tax Rate — Florida",
    country: "US", subdivision: "FL",
    low: 0.8, mid: 1.1, high: 1.6, unit: "percent_assessed_value",
    source: "Florida Department of Revenue 2024",
    methodology: "No state income tax; SOH cap limits annual increases on homestead but not commercial; tourist areas may carry special assessments" },
  { metricKey: "property-tax-rate", label: "IBI Property Tax (Impuesto Bienes Inmuebles) — Spain",
    country: "ES",
    low: 0.4, mid: 0.75, high: 1.1, unit: "percent_cadastral_value",
    source: "Ministerio de Hacienda España / IHOTELS 2024",
    methodology: "Annual municipal property tax on cadastral value; cadastral values typically 30–60% below market; varies by municipality" },
  { metricKey: "property-tax-rate", label: "IMU Property Tax — Italy",
    country: "IT",
    low: 0.76, mid: 1.0, high: 1.06, unit: "percent_cadastral_value",
    source: "Agenzia delle Entrate Italy 2024",
    methodology: "Imposta Municipale Propria (IMU); hotels classified as D category; base rate 0.76% + municipal surcharge; cadastral value << market" },
  { metricKey: "property-tax-rate", label: "Property Tax (ENFIA) — Greece",
    country: "GR",
    low: 0.3, mid: 0.6, high: 1.0, unit: "percent_objective_value",
    source: "AADE Greece / SETE 2024",
    methodology: "ENFIA (Unified Property Tax); objective value set by state; hotels on Aegean islands may benefit from reduced-rate zones" },
  // ── Insurance ──
  { metricKey: "insurance-per-room", label: "Property & Casualty Insurance per Room — US Hotel",
    country: "US",
    low: 1200, mid: 2100, high: 3000, unit: "usd_per_room_annual",
    source: "AHLA / Marsh McLennan Hotel Insurance Survey 2024",
    methodology: "All-risk property + general liability + loss of income; catastrophe-zone properties (FL, TX, CA) at high end; national average $1,800–2,200/room as of 2024" },
  { metricKey: "insurance-per-room", label: "Property & Casualty Insurance per Room — Southern Europe",
    country: "ES",
    low: 800, mid: 1150, high: 1500, unit: "eur_per_room_annual",
    source: "IHOTELS Spain / Mapfre Hospitality 2024",
    methodology: "Lower catastrophe exposure than US; seismic risk (IT/GR) adds premium; some EU markets require building insurance separately from contents" },
  { metricKey: "insurance-per-room", label: "Property & Casualty Insurance per Room — Italy",
    country: "IT",
    low: 900, mid: 1200, high: 1600, unit: "eur_per_room_annual",
    source: "Federalberghi / Generali Hotels 2024",
    methodology: "Seismic zone coverage adds 10–25%; heritage building replacement value premium" },
  { metricKey: "insurance-per-room", label: "Property & Casualty Insurance per Room — Greece",
    country: "GR",
    low: 700, mid: 1000, high: 1400, unit: "eur_per_room_annual",
    source: "SETE / XRTC Greece Insurance Survey 2024",
    methodology: "Aegean island properties add marine and seasonal storm coverage" },
  // ── Insurance inflation ──
  { metricKey: "insurance-cost-inflation", label: "Insurance Cost Inflation — US (recent trend)",
    country: "US",
    low: 18.0, mid: 21.5, high: 25.0, unit: "percent_annual",
    source: "Marsh / Aon Hotel Market Update 2023–2024",
    methodology: "Insurance market hardening 2021–2024; reinsurance capacity withdrawal from CAT-exposed markets; FL and CA at high end" },
  { metricKey: "insurance-cost-inflation", label: "Insurance Cost Inflation — Southern Europe",
    country: "ES",
    low: 8.0, mid: 10.0, high: 12.0, unit: "percent_annual",
    source: "MAPFRE / Lloyd's Europe Market Update 2024",
    methodology: "Moderate hardening; EU reinsurance market less stressed than US; climate risk creeping into Adriatic and Mediterranean coastal exposure" },
];

async function seedFixedCostBenchmarks(): Promise<void> {
  for (const r of FIXED_COST_BENCHMARKS) {
    await upsertRange({
      domain: "risk", metricKey: r.metricKey, label: r.label,
      country: r.country, subdivision: r.subdivision ?? null,
      year: YEAR,
      low: r.low, mid: r.mid, high: r.high, unit: r.unit,
      sourceName: r.source, sourceUrl: r.sourceUrl ?? null,
      methodology: r.methodology ?? null,
      confidence: r.sourceUrl ? "medium" : "low",
    });
  }
  logger.info(`Seeded fixed cost benchmarks: ${FIXED_COST_BENCHMARKS.length} rows`, TAG);
}

// ── Pass 11: Tax benchmarks (Table 10) ───────────────────────────────────────

const TAX_BENCHMARKS: Array<{
  metricKey: string; label: string; country: string; subdivision?: string;
  low: number; mid: number; high: number; unit: string;
  source: string; sourceUrl?: string; methodology?: string;
}> = [
  // ── Corporate income tax ──
  { metricKey: "corporate-tax-rate", label: "Corporate Income Tax — US (Federal)",
    country: "US",
    low: 21.0, mid: 21.0, high: 21.0, unit: "percent",
    source: "IRS / Tax Cuts and Jobs Act 2017 (effective 2018)", sourceUrl: "https://www.irs.gov",
    methodology: "Flat federal rate since TCJA 2017; combined federal + state effective rate typically 25–29%; state rates from 0% (TX, FL) to 9.8% (MN)" },
  { metricKey: "corporate-tax-rate-combined", label: "Corporate Income Tax — US (Federal + State effective)",
    country: "US",
    low: 23.0, mid: 26.5, high: 30.0, unit: "percent",
    source: "Tax Foundation / KPMG Corporate Tax Survey 2024",
    methodology: "Federal 21% + blended state; leisure-heavy states (FL, NV) at low end; high-state-tax markets (CA, NY, MN) at high end" },
  { metricKey: "corporate-tax-rate", label: "Corporate Income Tax — Spain",
    country: "ES",
    low: 25.0, mid: 25.0, high: 25.0, unit: "percent",
    source: "Agencia Tributaria España 2024", sourceUrl: "https://www.agenciatributaria.es",
    methodology: "Impuesto sobre Sociedades; standard rate 25%; 15% for newly created companies first 2 profitable years; 23% for SMEs <1M revenue" },
  { metricKey: "corporate-tax-rate", label: "Corporate Income Tax — Italy",
    country: "IT",
    low: 24.0, mid: 27.9, high: 27.9, unit: "percent",
    source: "Agenzia delle Entrate Italy 2024", sourceUrl: "https://www.agenziaentrate.gov.it",
    methodology: "IRES 24% + IRAP (regional business tax) 3.9% standard; IRAP varies by region; hotel sector typically IRES + IRAP = 27.9%" },
  { metricKey: "corporate-tax-rate", label: "Corporate Income Tax — Greece",
    country: "GR",
    low: 22.0, mid: 22.0, high: 22.0, unit: "percent",
    source: "AADE Greece / KPMG Greece 2024",
    methodology: "Corporate income tax 22%; reduced 10-year tax holiday available for hotel investments above EUR 3M in qualifying zones" },
  { metricKey: "corporate-tax-rate", label: "Corporate Income Tax — Portugal",
    country: "PT",
    low: 21.0, mid: 21.0, high: 31.5, unit: "percent",
    source: "Autoridade Tributária Portugal 2024",
    methodology: "IRC standard 21%; municipal surtax (derrama) up to 1.5%; state surtax on profits above EUR 1.5M; some Madeira IFIZ zones at reduced rates" },
  // ── VAT / Tourism services ──
  { metricKey: "vat-hotel-services", label: "VAT on Hotel Services — Spain",
    country: "ES",
    low: 10.0, mid: 10.0, high: 21.0, unit: "percent",
    source: "Agencia Tributaria España 2024",
    methodology: "Reduced rate 10% applies to hotel accommodation and restaurant services; standard 21% applies to non-food retail, some ancillary services; Canary Islands IGIC 7%" },
  { metricKey: "vat-hotel-services", label: "VAT on Hotel Services — Italy",
    country: "IT",
    low: 10.0, mid: 10.0, high: 22.0, unit: "percent",
    source: "Agenzia delle Entrate Italy 2024",
    methodology: "Reduced rate 10% on accommodation; restaurant services 10%; standard 22% on retail/non-food; reduced 5% on some cultural services" },
  { metricKey: "vat-hotel-services", label: "VAT on Hotel Services — Greece",
    country: "GR",
    low: 13.0, mid: 13.0, high: 24.0, unit: "percent",
    source: "AADE Greece 2024",
    methodology: "Reduced rate 13% on hotel accommodation; restaurant services 13%; standard 24% on most other services; Aegean island rates 30% lower (e.g. 9%/16%)" },
  { metricKey: "vat-hotel-services", label: "VAT on Hotel Services — Portugal",
    country: "PT",
    low: 6.0, mid: 6.0, high: 23.0, unit: "percent",
    source: "Autoridade Tributária Portugal 2024",
    methodology: "Reduced rate 6% on hotel accommodation; restaurant food 6%; beverages 13%; standard 23%; Azores/Madeira lower rates" },
  // ── Property transfer tax ──
  { metricKey: "property-transfer-tax", label: "Property Transfer Tax — US",
    country: "US",
    low: 0.5, mid: 2.5, high: 5.0, unit: "percent",
    source: "CBRE Hotels Capital Markets / Lincoln Institute 2024",
    methodology: "State + local deed/transfer taxes; TX and FL at low end; NY (1.425%–2.075%), CA, and RETT-heavy states at high end; entity-level transfers (stock deals) may avoid" },
  { metricKey: "property-transfer-tax", label: "Transfer Tax ITP — Spain (on existing buildings)",
    country: "ES",
    low: 6.0, mid: 8.5, high: 11.0, unit: "percent",
    source: "Ministerio de Hacienda España / IHOTELS 2024",
    methodology: "Impuesto de Transmisiones Patrimoniales; buyer-side tax on resale buildings; rate set by Autonomous Community: Madrid 6%, Cataluña 10%, Andalucía 7%; new builds use IVA+AJD instead" },
  { metricKey: "property-transfer-tax", label: "Transfer Tax — Italy",
    country: "IT",
    low: 2.0, mid: 5.5, high: 9.0, unit: "percent",
    source: "Agenzia delle Entrate Italy 2024",
    methodology: "Imposta di registro: 2% for primary residence, 9% commercial (hotels); VAT option on new builds at 10%+registration; luxury hotel reclassification reduces rate in some regions" },
  { metricKey: "property-transfer-tax", label: "Transfer Tax — Greece",
    country: "GR",
    low: 3.0, mid: 3.0, high: 3.0, unit: "percent",
    source: "AADE Greece 2024",
    methodology: "Fixed 3% property transfer tax; seller declares value; VAT 24% applies on new residential transfers from developers but hotels typically follow transfer tax regime" },
  // ── Capital gains tax ──
  { metricKey: "capital-gains-tax", label: "Capital Gains Tax — US (Long-term Federal)",
    country: "US",
    low: 20.0, mid: 23.8, high: 23.8, unit: "percent",
    source: "IRS / Investment Income Tax 2024", sourceUrl: "https://www.irs.gov",
    methodology: "Long-term (>1 year): 20% federal + 3.8% NIIT for high-income; depreciation recapture taxed at 25%; combined state+federal can reach 33–37% in high-tax states" },
  { metricKey: "capital-gains-tax", label: "Capital Gains Tax — Spain",
    country: "ES",
    low: 19.0, mid: 23.0, high: 26.0, unit: "percent",
    source: "Agencia Tributaria España 2024",
    methodology: "Impuesto sobre las Ganancias Patrimoniales: 19% up to EUR 6k, 21% EUR 6–50k, 23% EUR 50–200k, 26% above EUR 200k; participations exemption may apply for qualifying holding structures" },
  { metricKey: "capital-gains-tax", label: "Capital Gains Tax — Italy",
    country: "IT",
    low: 24.0, mid: 26.0, high: 26.0, unit: "percent",
    source: "Agenzia delle Entrate Italy 2024",
    methodology: "Plusvalenza: IRES 24%; cedolare secca 26% for individuals; participation exemption 95% for qualifying holdings; holding-period discount eliminated 2019" },
  { metricKey: "capital-gains-tax", label: "Capital Gains Tax — Greece",
    country: "GR",
    low: 15.0, mid: 15.0, high: 15.0, unit: "percent",
    source: "AADE Greece 2024",
    methodology: "Flat 15% on real property gains; exemption for primary residence; 5-year transfer moratorium on subsidized development zones" },
];

async function seedTaxBenchmarks(): Promise<void> {
  for (const r of TAX_BENCHMARKS) {
    await upsertRange({
      domain: "tax", metricKey: r.metricKey, label: r.label,
      country: r.country, subdivision: r.subdivision ?? null,
      year: YEAR,
      low: r.low, mid: r.mid, high: r.high, unit: r.unit,
      sourceName: r.source, sourceUrl: r.sourceUrl ?? null,
      methodology: r.methodology ?? null,
      confidence: r.sourceUrl ? "medium" : "low",
    });
  }
  logger.info(`Seeded tax benchmarks: ${TAX_BENCHMARKS.length} rows`, TAG);
}

// ── Pass 12: 2026 Bibliography Additions — PwC, Actabl, JLL, RLB/Whitebridge ──
// New jurisdictions (CY, NL, AT), updated SS rates (ES, GR), CPOR/HPOR,
// lifestyle ADR premium, EU/UK inflation, AU construction per sqm.

const PASS12_SEEDS: Array<Parameters<typeof upsertRange>[0]> = [
  // ── Tax: Cyprus (CY) — new jurisdiction ──────────────────────────────────
  { domain: "tax", metricKey: "corporate-tax-rate",
    label: "Corporate Income Tax — Cyprus",
    country: "CY", year: YEAR,
    low: 12.5, mid: 12.5, high: 15.0, unit: "percent",
    sourceName: "RemotePeople Employer of Record Cyprus 2026 / OECD Global Minimum Tax",
    sourceUrl: "https://remotepeople.com/countries/cyprus/employer-of-record/",
    methodology: "Domestic CIT 12.5% for small/mid operators and boutique hotel SPVs below OECD Pillar Two threshold; rate rises to 15% only for in-scope multinationals with €750M+ consolidated revenue. Non-Dom regime: 0% on worldwide dividends & interest for 17 years; 0% CGT on private shares.",
    confidence: "high" },

  { domain: "tax", metricKey: "payroll-tax-employer",
    label: "Employer Social Security Contribution — Cyprus",
    country: "CY", year: YEAR,
    low: 15.4, mid: 15.4, high: 15.4, unit: "percent",
    sourceName: "RemotePeople Employer of Record Cyprus 2026",
    sourceUrl: "https://remotepeople.com/countries/cyprus/employer-of-record/",
    methodology: "Social Insurance 8.8% + GeSY healthcare 2.9% + Social Cohesion Fund 2.0% + EKAD 1.2% + Holiday Fund 0.5% = 15.4%; lowest employer SS in Southern/Eastern Europe",
    confidence: "high" },

  { domain: "tax", metricKey: "capital-gains-tax",
    label: "Capital Gains Tax on Shares — Cyprus (Non-Dom)",
    country: "CY", year: YEAR,
    low: 0.0, mid: 0.0, high: 0.0, unit: "percent",
    sourceName: "Koufettas Law / TaxLife Cyprus Non-Dom 2026",
    sourceUrl: "https://koufettaslaw.com/cyprus-vs-malta-vs-portugal-vs-greece-2026-tax-comparison/",
    methodology: "Zero CGT on disposal of private company shares under Cyprus law; applicable to holding structures; EU-compatible; real property gains subject to separate 20% rate",
    confidence: "high" },

  // ── Tax: Netherlands (NL) — hotel VAT 2026 ───────────────────────────────
  { domain: "tax", metricKey: "vat-hotel-services",
    label: "VAT on Hotel / Short-Stay Accommodation — Netherlands (2026)",
    country: "NL", year: YEAR,
    low: 21.0, mid: 21.0, high: 21.0, unit: "percent",
    sourceName: "PwC Key Tax Issues at Year End for Real Estate Investors 2025/2026",
    sourceUrl: "https://www.pwc.com/gx/en/tax/pdf/key-tax-issues-at-year-end-for-real-estate-investors-2025-26.pdf",
    methodology: "Mandatory effective 2026-01-01: hotel accommodation, boarding houses, and holiday rentals moved from 9% reduced rate to standard 21% rate; 12pp increase forces margin decision or demand-price pass-through",
    confidence: "high" },

  { domain: "tax", metricKey: "property-transfer-tax",
    label: "Real Estate Transfer Tax — Netherlands (Commercial CRE)",
    country: "NL", year: YEAR,
    low: 10.4, mid: 10.4, high: 10.4, unit: "percent",
    sourceName: "PwC Key Tax Issues at Year End for Real Estate Investors 2025/2026",
    sourceUrl: "https://www.pwc.com/gx/en/tax/pdf/key-tax-issues-at-year-end-for-real-estate-investors-2025-26.pdf",
    methodology: "Overdrachtsbelasting: 10.4% on commercial and logistics real estate; residential reduced to 8% in 2026; new 2026 VAT revision scheme applies to renovation/expansion — track asset use changes over 5–10 year window",
    confidence: "high" },

  // ── Tax: Austria (AT) — RETT + share deal crackdown ─────────────────────
  { domain: "tax", metricKey: "property-transfer-tax",
    label: "Real Estate Transfer Tax — Austria",
    country: "AT", year: YEAR,
    low: 3.5, mid: 4.6, high: 4.6, unit: "percent",
    sourceName: "PwC Key Tax Issues at Year End for Real Estate Investors 2025/2026",
    sourceUrl: "https://www.pwc.com/gx/en/tax/pdf/key-tax-issues-at-year-end-for-real-estate-investors-2025-26.pdf",
    methodology: "Standard RETT 3.5% on acquisition price + 1.1% registration fee on market value; BBG 2025 aggressively closed share-deal loophole: indirect share transfers now frequently trigger 3.5% on fair market value",
    confidence: "high" },

  // ── Tax: Spain — employer SS update (PwC 2026, supersedes 2024 estimate) ─
  { domain: "tax", metricKey: "payroll-tax-employer",
    label: "Employer Social Security Contribution — Spain (2026)",
    country: "ES", year: YEAR,
    low: 30.65, mid: 30.65, high: 32.15, unit: "percent",
    sourceName: "PwC Worldwide Tax Summaries: Spain 2026",
    sourceUrl: "https://taxsummaries.pwc.com/spain/corporate/other-taxes",
    methodology: "General regime 2026: contingencias comunes + desempleo + FOGASA + FP + MECANISMO EQUIDAD = 30.65%; plus variable accident rate ~1.5% (office) to 6.7% (construction); employee contribution 6.50%",
    confidence: "high" },

  // ── Tax: Greece — employer SS precise rate (PwC 2026) ────────────────────
  { domain: "tax", metricKey: "payroll-tax-employer",
    label: "Employer Social Security Contribution — Greece (2025/2026)",
    country: "GR", year: YEAR,
    low: 21.79, mid: 21.79, high: 22.5, unit: "percent",
    sourceName: "PwC Worldwide Tax Summaries: Greece 2026",
    sourceUrl: "https://taxsummaries.pwc.com/greece/corporate/other-taxes",
    methodology: "EFKA (e-EFKA) 2025/2026: employer 21.79% of gross salary; employee 13.37%; combined 35.16%; monthly cap at EUR 7,761.94; 50% income tax exemption available for new employees for 7 years",
    confidence: "high" },

  // ── Labor: CPOR / HPOR benchmarks (Actabl 2026) ──────────────────────────
  { domain: "labor", metricKey: "cpor",
    label: "Wage Cost Per Occupied Room — US Hotel (2025)",
    country: "US", year: YEAR,
    low: 42.82, mid: 48.32, high: 56.0, unit: "usd_per_occupied_room",
    sourceName: "Actabl / HotelData.com — 2025 Hotel Labor Costs & Trends",
    sourceUrl: "https://lodgingmagazine.com/new-report-finds-operators-improve-labor-efficiency-amid-rising-wages-and-softer-revenue/",
    methodology: "Aggregated from thousands of US hotel properties; 2025 CPOR $48.32 (+12.8% from $42.82 in 2024); Q4 2025 spike of +21.1% signals permanent cost recalibration; hourly wages rose 8.0%",
    confidence: "high" },

  { domain: "labor", metricKey: "hpor-extended-stay",
    label: "Hours Per Occupied Room — US Extended-Stay",
    country: "US", year: YEAR,
    low: 1.20, mid: 1.30, high: 1.45, unit: "hours_per_occupied_room",
    sourceName: "Actabl / HotelData.com 2025 Hotel Labor Costs & Trends",
    sourceUrl: "https://lodgingmagazine.com/new-report-finds-operators-improve-labor-efficiency-amid-rising-wages-and-softer-revenue/",
    methodology: "Most efficient segment: limited housekeeping, minimal daily service; HPOR rose 4.4% overall in 2025",
    confidence: "high" },

  { domain: "labor", metricKey: "hpor-select-service",
    label: "Hours Per Occupied Room — US Select-Service",
    country: "US", year: YEAR,
    low: 1.30, mid: 1.44, high: 1.65, unit: "hours_per_occupied_room",
    sourceName: "Actabl / HotelData.com 2025 Hotel Labor Costs & Trends",
    sourceUrl: "https://lodgingmagazine.com/new-report-finds-operators-improve-labor-efficiency-amid-rising-wages-and-softer-revenue/",
    methodology: "Limited F&B, reduced housekeeping services; cross-training can push toward low end; MPOR (minutes per occupied room) fell 9% overall through productivity optimization",
    confidence: "high" },

  { domain: "labor", metricKey: "hpor-full-service",
    label: "Hours Per Occupied Room — US Full-Service / Boutique",
    country: "US", segment: "boutique_hotel", year: YEAR,
    low: 2.30, mid: 2.57, high: 3.10, unit: "hours_per_occupied_room",
    sourceName: "Actabl / HotelData.com 2025 Hotel Labor Costs & Trends",
    sourceUrl: "https://lodgingmagazine.com/new-report-finds-operators-improve-labor-efficiency-amid-rising-wages-and-softer-revenue/",
    methodology: "Full F&B, full housekeeping, concierge; engineering/guestrooms most susceptible to overrun; maintenance engineer CPOR +7.5% YoY",
    confidence: "high" },

  { domain: "labor", metricKey: "hpor-resort",
    label: "Hours Per Occupied Room — US Resort",
    country: "US", segment: "luxury", year: YEAR,
    low: 3.90, mid: 4.48, high: 5.50, unit: "hours_per_occupied_room",
    sourceName: "Actabl / HotelData.com 2025 Hotel Labor Costs & Trends",
    sourceUrl: "https://lodgingmagazine.com/new-report-finds-operators-improve-labor-efficiency-amid-rising-wages-and-softer-revenue/",
    methodology: "Complex resort: multiple F&B outlets, spa, activities, pool, event services; massive staffing complexity; rate-growth moderation exposes margin risk",
    confidence: "high" },

  // ── KPI: Lifestyle ADR premium (JLL 2026) ─────────────────────────────────
  { domain: "kpi", metricKey: "lifestyle-adr-premium",
    label: "Lifestyle Hotel ADR Premium over Traditional — APAC/Global",
    country: "GLOBAL", year: YEAR,
    low: 10.0, mid: 10.5, high: 11.0, unit: "percent",
    sourceName: "JLL Hotels & Hospitality — APAC Lifestyle Hotels 2026",
    sourceUrl: "https://geonet.properties/news/jll-11-signals-shaping-hotel-investment-right-now",
    methodology: "Lifestyle properties command 10–11% ADR premium over traditional hotels in same market; consistent across varying macroeconomic cycles; driven by distinctive design and localized experiences",
    confidence: "high" },

  // ── Macro: EU/UK inflation projections (CBRE 2026) ────────────────────────
  { domain: "macro", metricKey: "inflation-cpi-eu",
    label: "Eurozone Inflation — 2026 Projection",
    country: "EU", year: YEAR,
    low: 1.2, mid: 1.5, high: 2.0, unit: "percent_annual",
    sourceName: "CBRE European Real Estate Market Outlook 2026",
    sourceUrl: "https://mediaassets.cbre.com/-/media/files/2026/european-real-estate-market-outlook-2026.pdf",
    methodology: "ECB not expected to cut rates further in 2026; inflation supports real household income and domestic consumption; structural supply-demand imbalances in living sector persist",
    confidence: "medium" },

  { domain: "macro", metricKey: "inflation-cpi-gb",
    label: "UK Inflation — 2026 Projection",
    country: "GB", year: YEAR,
    low: 2.0, mid: 2.5, high: 3.0, unit: "percent_annual",
    sourceName: "CBRE UK Real Estate Market Outlook 2026",
    sourceUrl: "https://www.cbre.co.uk/insights",
    methodology: "Stickier inflation than Eurozone; single BOE rate cut anticipated; long-term rates remaining elevated; service sector wage growth principal driver",
    confidence: "medium" },

  // ── Construction: Australia per sqm (RLB/Whitebridge 2026) ───────────────
  { domain: "construction", metricKey: "construction-cost-per-sqm-budget",
    label: "Hotel Construction Cost per sqm — Australia Budget",
    country: "AU", year: YEAR,
    low: 3670, mid: 4455, high: 5240, unit: "aud_per_sqm",
    sourceName: "Whitebridge Hospitality / RLB — APAC Hotels Monitor Issue 12",
    sourceUrl: "https://whitebridgehospitality.com/media/zpdphtop/whitebridge-apac-hotels-monitor-issue-12.pdf",
    methodology: "Budget properties; CCCI annual growth +2.9% (Jun 2025) — return to pre-COVID ~4% historical average; post-pandemic supply chain spikes largely subsided",
    confidence: "medium" },

  { domain: "construction", metricKey: "construction-cost-per-sqm-boutique",
    label: "Hotel Construction Cost per sqm — Australia Boutique Motel",
    country: "AU", year: YEAR,
    low: 5025, mid: 6292, high: 7558, unit: "aud_per_sqm",
    sourceName: "BMT Quantity Surveyors / RLB APAC Hotels Monitor Issue 12",
    sourceUrl: "https://whitebridgehospitality.com/media/zpdphtop/whitebridge-apac-hotels-monitor-issue-12.pdf",
    methodology: "Single-level boutique motel; range reflects finish level; on-site construction activity increased in Australia per RLB 2025",
    confidence: "medium" },

  { domain: "construction", metricKey: "construction-cost-per-sqm-luxury",
    label: "Hotel Construction Cost per sqm — Australia Luxury",
    country: "AU", year: YEAR,
    low: 4820, mid: 6000, high: 8500, unit: "aud_per_sqm",
    sourceName: "Whitebridge Hospitality / RLB — APAC Hotels Monitor Issue 12",
    sourceUrl: "https://whitebridgehospitality.com/media/zpdphtop/whitebridge-apac-hotels-monitor-issue-12.pdf",
    methodology: "Bespoke luxury; AUD 4,820+ per sqm minimum; no published upper bound for ultra-luxury one-off projects; India contrast: >10% YoY GOP growth driven by low energy costs",
    confidence: "low" },
];

async function seedPass12Updates(): Promise<void> {
  for (const r of PASS12_SEEDS) {
    await upsertRange(r);
  }
  logger.info(`Seeded Pass 12 (2026 bibliography additions): ${PASS12_SEEDS.length} rows`, TAG);
}

// ── Main entry point (called from runSeeds) ───────────────────────────────────

export async function seedReferenceRanges(): Promise<void> {
  logger.info("Seeding reference_range table...", TAG);
  await seedKpiRows();
  await seedLaborRows();
  await refreshMacroFromFRED(); // uses static fallback if no FRED key
  // Tables 1–10: hospitality benchmarks (Americas + Southern Europe)
  await seedHospitalityKpiBenchmarks();
  await seedFinancingBenchmarks();
  await seedOperatingCostBenchmarks();
  await seedEwwBenchmarks();
  await seedCapexBenchmarks();
  await seedFixedCostBenchmarks();
  await seedTaxBenchmarks();
  await seedPass12Updates();
  logger.info("Reference range seeding complete", TAG);
}
