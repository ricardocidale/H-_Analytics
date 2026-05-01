import type { InsertBenchmarkSnapshot } from "@shared/schema";
import { storage } from "../../storage";
import { logger } from "../../logger";

export interface FetcherResult {
  snapshots: Omit<InsertBenchmarkSnapshot, "id">[];
  errors: string[];
}

async function fetchFredRate(seriesId: string, label: string, category: string): Promise<FetcherResult> {
  const snapshots: Omit<InsertBenchmarkSnapshot, "id">[] = [];
  const errors: string[] = [];

  try {
    const apiKey = process.env.FRED_API_KEY;
    if (!apiKey) {
      return { snapshots: [], errors: [`FRED_API_KEY not set — skipping ${label}`] };
    }

    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=1`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      errors.push(`FRED ${seriesId}: HTTP ${response.status}`);
      return { snapshots, errors };
    }

    const data: unknown = await response.json();
    const fredData = data as { observations?: Array<{ value?: string }> };
    const obs = fredData.observations?.[0];
    if (obs?.value && obs.value !== ".") {
      snapshots.push({
        snapshotKey: `fred_${seriesId.toLowerCase()}`,
        category,
        value: parseFloat(obs.value),
        source: "FRED",
        sourceUrl: `https://fred.stlouisfed.org/series/${seriesId}`,
        staleness: "fresh",
        cadence: "monthly",
      });
    }
  } catch (err: unknown) {
    errors.push(`FRED ${seriesId}: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { snapshots, errors };
}

export async function fetchMacroRates(): Promise<FetcherResult> {
  const allSnapshots: Omit<InsertBenchmarkSnapshot, "id">[] = [];
  const allErrors: string[] = [];

  const series = [
    { id: "DFF", label: "Fed Funds Rate", category: "interest_rates" },
    { id: "DGS10", label: "10-Year Treasury", category: "interest_rates" },
    { id: "DGS30", label: "30-Year Treasury", category: "interest_rates" },
    { id: "MORTGAGE30US", label: "30-Year Mortgage", category: "interest_rates" },
    { id: "CPIAUCSL", label: "CPI All Urban", category: "inflation" },
    { id: "UNRATE", label: "Unemployment Rate", category: "labor" },
  ];

  const results = await Promise.allSettled(
    series.map(s => fetchFredRate(s.id, s.label, s.category))
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      allSnapshots.push(...result.value.snapshots);
      allErrors.push(...result.value.errors);
    } else {
      allErrors.push(`FRED fetch failed: ${result.reason}`);
    }
  }

  return { snapshots: allSnapshots, errors: allErrors };
}

/**
 * Hardcoded fallback benchmarks — used ONLY when the hospitality_benchmarks
 * table is empty (e.g., before the first migration/seed runs).
 */
const STATIC_BENCHMARKS: Array<{ key: string; category: string; value: number; source: string }> = [
  { key: "us_hotel_avg_adr_2024", category: "hospitality_adr", value: 157.95, source: "STR/CoStar 2024" },
  { key: "us_hotel_avg_occ_2024", category: "hospitality_occupancy", value: 63.0, source: "STR/CoStar 2024" },
  { key: "us_hotel_avg_revpar_2024", category: "hospitality_revpar", value: 99.51, source: "STR/CoStar 2024" },
  { key: "us_luxury_avg_adr_2024", category: "hospitality_adr", value: 396.40, source: "STR/CoStar 2024" },
  { key: "us_luxury_avg_occ_2024", category: "hospitality_occupancy", value: 68.2, source: "STR/CoStar 2024" },
  { key: "us_boutique_avg_adr_2024", category: "hospitality_adr", value: 245.00, source: "STR/BLLA 2024" },
  { key: "us_boutique_avg_occ_2024", category: "hospitality_occupancy", value: 70.5, source: "STR/BLLA 2024" },
  { key: "us_hotel_cap_rate_2024", category: "cap_rates", value: 7.8, source: "CBRE Hotel Cap Rate Survey 2024" },
  { key: "us_luxury_cap_rate_2024", category: "cap_rates", value: 6.2, source: "CBRE Hotel Cap Rate Survey 2024" },
  { key: "us_resort_cap_rate_2024", category: "cap_rates", value: 7.0, source: "CBRE Hotel Cap Rate Survey 2024" },
  { key: "us_ffe_reserve_rate", category: "cost_rates", value: 4.0, source: "ISHC 2024" },
  { key: "us_mgmt_fee_base_rate", category: "fee_rates", value: 3.0, source: "HVS 2024" },
  { key: "us_mgmt_fee_incentive_rate", category: "fee_rates", value: 10.0, source: "HVS 2024" },
  { key: "us_property_insurance_rate", category: "cost_rates", value: 1.2, source: "AAHOA 2024" },
  { key: "us_property_tax_rate", category: "cost_rates", value: 2.5, source: "Industry Average 2024" },
  { key: "depreciation_years_us", category: "depreciation", value: 39, source: "IRS Publication 946" },
  { key: "depreciation_years_colombia", category: "depreciation", value: 20, source: "Colombian Tax Code" },
  { key: "depreciation_years_canada", category: "depreciation", value: 25, source: "CRA CCA Class 1" },
  { key: "depreciation_years_france", category: "depreciation", value: 25, source: "French Tax Code" },
  { key: "depreciation_years_spain", category: "depreciation", value: 50, source: "Spanish Tax Code" },
  { key: "cost_seg_acceleration_pct", category: "depreciation", value: 30, source: "Cost Segregation Industry Average" },
];

export async function fetchHospitalityBenchmarks(): Promise<FetcherResult> {
  const snapshots: Omit<InsertBenchmarkSnapshot, "id">[] = [];

  // Try reading from the DB-backed hospitality_benchmarks table first
  try {
    const dbBenchmarks = await storage.getHospitalityBenchmarks({ isActive: true });

    if (dbBenchmarks.length > 0) {
      logger.info(`Loaded ${dbBenchmarks.length} hospitality benchmarks from DB`, "ambient-fetcher");
      for (const b of dbBenchmarks) {
        snapshots.push({
          snapshotKey: b.metricKey,
          category: b.category,
          value: b.value,
          source: b.sourceName ?? "DB",
          sourceUrl: b.sourceUrl ?? null,
          staleness: "fresh",
          cadence: "quarterly",
        });
      }
      return { snapshots, errors: [] };
    }
  } catch (err: unknown) {
    logger.warn(`Could not read hospitality_benchmarks table, falling back to hardcoded: ${err instanceof Error ? err.message : String(err)}`, "ambient-fetcher");
  }

  // Fallback: use hardcoded static benchmarks (backward compatible)
  for (const b of STATIC_BENCHMARKS) {
    snapshots.push({
      snapshotKey: b.key,
      category: b.category,
      value: b.value,
      source: b.source,
      sourceUrl: null,
      staleness: "fresh",
      cadence: "quarterly",
    });
  }

  return { snapshots, errors: [] };
}

export async function fetchAllBenchmarks(): Promise<FetcherResult> {
  const [macro, hospitality] = await Promise.all([
    fetchMacroRates(),
    fetchHospitalityBenchmarks(),
  ]);

  return {
    snapshots: [...macro.snapshots, ...hospitality.snapshots],
    errors: [...macro.errors, ...hospitality.errors],
  };
}
