/**
 * hospitality-benchmarks seed — Seeds all hardcoded hospitality benchmark data
 * into the hospitality_benchmarks table.
 *
 * Only inserts rows that don't already exist (matched on metric_key + country + source_year).
 * Safe to re-run without duplicates.
 */

import { db } from "../db";
import { hospitalityBenchmarks } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { logger } from "../logger";

interface BenchmarkSeed {
  category: string;
  segment: string;
  metricKey: string;
  metricLabel: string;
  value: number;
  unit: string;
  sourceYear: number;
  sourceName: string;
  sourceUrl: string | null;
  country: string;
  notes: string | null;
}

const BENCHMARK_SEEDS: BenchmarkSeed[] = [
  // ── ADR Benchmarks ────────────────────────────────────────────────────
  {
    category: "adr", segment: "us_all", metricKey: "us_hotel_adr",
    metricLabel: "US Hotel Average ADR", value: 157.95, unit: "usd",
    sourceYear: 2024, sourceName: "STR/CoStar 2024 US Trend Report",
    sourceUrl: null, country: "US", notes: "All chain scales combined",
  },
  {
    category: "adr", segment: "us_luxury", metricKey: "us_luxury_adr",
    metricLabel: "US Luxury Hotel ADR", value: 396.40, unit: "usd",
    sourceYear: 2024, sourceName: "STR/CoStar 2024 US Trend Report",
    sourceUrl: null, country: "US", notes: "Luxury chain scale",
  },
  {
    category: "adr", segment: "us_boutique", metricKey: "us_boutique_adr",
    metricLabel: "US Boutique Hotel ADR", value: 245.00, unit: "usd",
    sourceYear: 2024, sourceName: "STR/BLLA 2024",
    sourceUrl: null, country: "US", notes: "Boutique Lifestyle Lodging Association data",
  },

  // ── Occupancy Benchmarks ──────────────────────────────────────────────
  {
    category: "occupancy", segment: "us_all", metricKey: "us_hotel_occupancy",
    metricLabel: "US Hotel Average Occupancy", value: 63.0, unit: "percent",
    sourceYear: 2024, sourceName: "STR/CoStar 2024 US Trend Report",
    sourceUrl: null, country: "US", notes: "All chain scales combined",
  },
  {
    category: "occupancy", segment: "us_luxury", metricKey: "us_luxury_occupancy",
    metricLabel: "US Luxury Hotel Occupancy", value: 68.2, unit: "percent",
    sourceYear: 2024, sourceName: "STR/CoStar 2024 US Trend Report",
    sourceUrl: null, country: "US", notes: "Luxury chain scale",
  },
  {
    category: "occupancy", segment: "us_boutique", metricKey: "us_boutique_occupancy",
    metricLabel: "US Boutique Hotel Occupancy", value: 70.5, unit: "percent",
    sourceYear: 2024, sourceName: "STR/BLLA 2024",
    sourceUrl: null, country: "US", notes: "Boutique Lifestyle Lodging Association data",
  },

  // ── RevPAR Benchmarks ─────────────────────────────────────────────────
  {
    category: "revpar", segment: "us_all", metricKey: "us_hotel_revpar",
    metricLabel: "US Hotel Average RevPAR", value: 99.51, unit: "usd",
    sourceYear: 2024, sourceName: "STR/CoStar 2024 US Trend Report",
    sourceUrl: null, country: "US", notes: "All chain scales combined",
  },

  // ── Cap Rate Benchmarks ───────────────────────────────────────────────
  {
    category: "cap_rate", segment: "us_all", metricKey: "us_hotel_cap_rate",
    metricLabel: "US Hotel Average Cap Rate", value: 7.8, unit: "percent",
    sourceYear: 2024, sourceName: "CBRE Hotel Cap Rate Survey 2024",
    sourceUrl: null, country: "US", notes: "All service tiers combined",
  },
  {
    category: "cap_rate", segment: "us_luxury", metricKey: "us_luxury_cap_rate",
    metricLabel: "US Luxury Hotel Cap Rate", value: 6.2, unit: "percent",
    sourceYear: 2024, sourceName: "CBRE Hotel Cap Rate Survey 2024",
    sourceUrl: null, country: "US", notes: "Luxury tier",
  },
  {
    category: "cap_rate", segment: "us_resort", metricKey: "us_resort_cap_rate",
    metricLabel: "US Resort Cap Rate", value: 7.0, unit: "percent",
    sourceYear: 2024, sourceName: "CBRE Hotel Cap Rate Survey 2024",
    sourceUrl: null, country: "US", notes: "Resort properties",
  },

  // ── Cost Rate Benchmarks ──────────────────────────────────────────────
  {
    category: "cost_rate", segment: "us_all", metricKey: "us_ffe_reserve_rate",
    metricLabel: "FF&E Reserve Rate", value: 4.0, unit: "percent",
    sourceYear: 2024, sourceName: "ISHC 2024",
    sourceUrl: null, country: "US", notes: "Percentage of total revenue for furniture, fixtures & equipment reserve",
  },
  {
    category: "cost_rate", segment: "us_all", metricKey: "us_property_insurance_rate",
    metricLabel: "Property Insurance Rate", value: 1.2, unit: "percent",
    sourceYear: 2024, sourceName: "AAHOA 2024",
    sourceUrl: null, country: "US", notes: "Percentage of total revenue",
  },
  {
    category: "cost_rate", segment: "us_all", metricKey: "us_property_tax_rate",
    metricLabel: "Property Tax Rate", value: 2.5, unit: "percent",
    sourceYear: 2024, sourceName: "Industry Average 2024",
    sourceUrl: null, country: "US", notes: "Percentage of assessed value; varies significantly by jurisdiction",
  },

  // ── Fee Rate Benchmarks ───────────────────────────────────────────────
  {
    category: "fee_rate", segment: "us_all", metricKey: "us_mgmt_fee_base_rate",
    metricLabel: "Management Fee — Base", value: 3.0, unit: "percent",
    sourceYear: 2024, sourceName: "HVS 2024",
    sourceUrl: null, country: "US", notes: "Base management fee as percentage of total revenue",
  },
  {
    category: "fee_rate", segment: "us_all", metricKey: "us_mgmt_fee_incentive_rate",
    metricLabel: "Management Fee — Incentive", value: 10.0, unit: "percent",
    sourceYear: 2024, sourceName: "HVS 2024",
    sourceUrl: null, country: "US", notes: "Incentive management fee as percentage of gross operating profit",
  },

  // ── Depreciation Benchmarks ───────────────────────────────────────────
  {
    category: "depreciation", segment: "us_all", metricKey: "depreciation_years_us",
    metricLabel: "Depreciation — US (Commercial Real Property)", value: 39, unit: "years",
    sourceYear: 2024, sourceName: "IRS Publication 946",
    sourceUrl: "https://www.irs.gov/publications/p946", country: "US",
    notes: "Non-residential real property straight-line depreciation under MACRS",
  },
  {
    category: "depreciation", segment: "co_all", metricKey: "depreciation_years_colombia",
    metricLabel: "Depreciation — Colombia", value: 20, unit: "years",
    sourceYear: 2024, sourceName: "Colombian Tax Code",
    sourceUrl: null, country: "CO",
    notes: "Standard commercial building useful life per DIAN",
  },
  {
    category: "depreciation", segment: "ca_all", metricKey: "depreciation_years_canada",
    metricLabel: "Depreciation — Canada (CCA Class 1)", value: 25, unit: "years",
    sourceYear: 2024, sourceName: "CRA CCA Class 1",
    sourceUrl: null, country: "CA",
    notes: "Capital Cost Allowance Class 1 — 4% declining balance, ~25 yr effective life",
  },
  {
    category: "depreciation", segment: "fr_all", metricKey: "depreciation_years_france",
    metricLabel: "Depreciation — France", value: 25, unit: "years",
    sourceYear: 2024, sourceName: "French Tax Code",
    sourceUrl: null, country: "FR",
    notes: "Standard commercial building amortization period",
  },
  {
    category: "depreciation", segment: "es_all", metricKey: "depreciation_years_spain",
    metricLabel: "Depreciation — Spain", value: 50, unit: "years",
    sourceYear: 2024, sourceName: "Spanish Tax Code",
    sourceUrl: null, country: "ES",
    notes: "Minimum depreciation period for commercial buildings (2% straight-line)",
  },
  {
    category: "depreciation", segment: "us_all", metricKey: "cost_seg_acceleration_pct",
    metricLabel: "Cost Segregation Acceleration %", value: 30, unit: "percent",
    sourceYear: 2024, sourceName: "Cost Segregation Industry Average",
    sourceUrl: null, country: "US",
    notes: "Typical percentage of building cost reclassified to shorter-lived property via cost segregation study",
  },
];

export async function seedHospitalityBenchmarks(): Promise<void> {
  let inserted = 0;
  let skipped = 0;

  for (const seed of BENCHMARK_SEEDS) {
    const existing = await db.select({ id: hospitalityBenchmarks.id })
      .from(hospitalityBenchmarks)
      .where(and(
        eq(hospitalityBenchmarks.metricKey, seed.metricKey),
        eq(hospitalityBenchmarks.country, seed.country),
        eq(hospitalityBenchmarks.sourceYear, seed.sourceYear),
      ))
      .limit(1);

    if (existing.length > 0) {
      skipped++;
      continue;
    }

    await db.insert(hospitalityBenchmarks).values({
      category: seed.category,
      segment: seed.segment,
      metricKey: seed.metricKey,
      metricLabel: seed.metricLabel,
      value: seed.value,
      unit: seed.unit,
      sourceYear: seed.sourceYear,
      sourceName: seed.sourceName,
      sourceUrl: seed.sourceUrl,
      country: seed.country,
      notes: seed.notes,
      isActive: true,
    });
    inserted++;
  }

  logger.info(`Hospitality benchmarks: ${inserted} inserted, ${skipped} already existed (${BENCHMARK_SEEDS.length} total)`, "seed");
}
