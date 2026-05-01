/**
 * company-data-injector.ts — Gathers verified macro data for company research prompts.
 *
 * The smart data router (data-routing.ts) handles property-level field routing
 * with progressive relaxation. Company research needs different data:
 *   - FRED macro rates (CPI, SOFR, Treasury yields, prime rate)
 *   - Country defaults (tax rates, depreciation periods)
 *   - Hospitality benchmarks (management fee norms, staffing ratios)
 *   - Portfolio-derived statistics (from the company's own properties)
 *
 * This module gathers all available macro data and formats it as a prompt
 * injection block — same role as buildPromptInjectionBlock for properties.
 */

import { FREDService } from "../services/FREDService";
import { storage } from "../storage";
import { getCountryDefaults } from "@shared/countryDefaults";
import { logger } from "../logger";

/* ─── Types ──────────────────────────────────────────────────────── */

interface CompanyDataPoint {
  field: string;
  label: string;
  value: number | string;
  source: string;
  confidence: "high" | "medium" | "low";
  fetchedAt: string;
}

/* ─── FRED data ──────────────────────────────────────────────────── */

async function gatherFredData(): Promise<CompanyDataPoint[]> {
  const points: CompanyDataPoint[] = [];
  const fred = new FREDService();

  if (!fred.isAvailable()) {
    logger.info("Company data injector: FRED not available, skipping macro rates", "data-router");
    return points;
  }

  try {
    const rates = await fred.fetchAllRates();
    const now = new Date().toISOString();

    if (rates.cpi) {
      // CPI annual change → inflation rate
      const cpiVal = rates.cpi.current.value;
      if (Number.isFinite(cpiVal)) {
        points.push({
          field: "inflationRate",
          label: "CPI Inflation Rate (annualized)",
          value: cpiVal,
          source: `FRED CPI-U — ${rates.cpi.current.source} (${rates.cpi.current.publishedAt ?? rates.cpi.current.fetchedAt})`,
          confidence: "high",
          fetchedAt: now,
        });
      }
    }

    if (rates.sofr) {
      const sofrVal = rates.sofr.current.value;
      if (Number.isFinite(sofrVal)) {
        points.push({
          field: "sofrRate",
          label: "SOFR (Secured Overnight Financing Rate)",
          value: `${sofrVal.toFixed(2)}%`,
          source: `FRED SOFR — ${rates.sofr.current.source} (${rates.sofr.current.publishedAt ?? rates.sofr.current.fetchedAt})`,
          confidence: "high",
          fetchedAt: now,
        });
      }
    }

    if (rates.primeRate) {
      const primeVal = rates.primeRate.current.value;
      if (Number.isFinite(primeVal)) {
        points.push({
          field: "primeRate",
          label: "US Prime Rate",
          value: `${primeVal.toFixed(2)}%`,
          source: `FRED Prime Rate — ${rates.primeRate.current.source} (${rates.primeRate.current.publishedAt ?? rates.primeRate.current.fetchedAt})`,
          confidence: "high",
          fetchedAt: now,
        });
      }
    }

    if (rates.treasury10y) {
      const t10Val = rates.treasury10y.current.value;
      if (Number.isFinite(t10Val)) {
        points.push({
          field: "treasury10y",
          label: "10-Year Treasury Yield",
          value: `${t10Val.toFixed(2)}%`,
          source: `FRED 10Y Treasury — ${rates.treasury10y.current.source} (${rates.treasury10y.current.publishedAt ?? rates.treasury10y.current.fetchedAt})`,
          confidence: "high",
          fetchedAt: now,
        });

        // Derive cost of equity estimate: risk-free rate + equity risk premium (~5-6% for hospitality)
        points.push({
          field: "costOfEquityBenchmark",
          label: "Estimated Cost of Equity (risk-free + hospitality ERP)",
          value: `${(t10Val + 5.5).toFixed(1)}% – ${(t10Val + 7.0).toFixed(1)}%`,
          source: `10Y Treasury (${t10Val.toFixed(2)}%) + hospitality equity risk premium (5.5-7.0%)`,
          confidence: "medium",
          fetchedAt: now,
        });
      }
    }
  } catch (err: unknown) {
    logger.warn(`Company data injector: FRED fetch failed (non-blocking): ${err instanceof Error ? err.message : err}`, "data-router");
  }

  return points;
}

/* ─── Country defaults ───────────────────────────────────────────── */

function gatherCountryDefaults(countries: string[]): CompanyDataPoint[] {
  const points: CompanyDataPoint[] = [];
  const now = new Date().toISOString();

  for (const country of countries) {
    const defaults = getCountryDefaults(country);
    if (!defaults) continue;

    points.push({
      field: `taxRate_${country}`,
      label: `Corporate Tax Rate (${country})`,
      value: `${(defaults.taxRate * 100).toFixed(1)}%`,
      source: `Country defaults database — ${country}`,
      confidence: "high",
      fetchedAt: now,
    });

    if (defaults.depreciationYears) {
      points.push({
        field: `depreciation_${country}`,
        label: `Depreciation Period (${country})`,
        value: `${defaults.depreciationYears} years`,
        source: `Country defaults database — ${country}`,
        confidence: "high",
        fetchedAt: now,
      });
    }
  }

  return points;
}

/* ─── Hospitality benchmarks ─────────────────────────────────────── */

async function gatherBenchmarks(): Promise<CompanyDataPoint[]> {
  const points: CompanyDataPoint[] = [];
  const now = new Date().toISOString();

  try {
    const snapshots = await storage.getBenchmarkSnapshots();
    if (!snapshots || snapshots.length === 0) return points;

    // Extract management-company-relevant benchmarks
    const relevantCategories = new Set([
      "management_fees", "staffing", "overhead", "operating_costs",
      "industry_metrics", "market_rates", "compensation",
    ]);

    for (const snap of snapshots) {
      if (snap.staleness === "stale") continue;
      if (snap.value == null) continue;
      if (relevantCategories.has(snap.category) || snap.snapshotKey.includes("mgmt") || snap.snapshotKey.includes("fee")) {
        points.push({
          field: snap.snapshotKey,
          label: snap.snapshotKey.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
          value: snap.value,
          source: snap.source ? `${snap.source} (benchmark DB)` : "H+ Benchmark Database",
          confidence: snap.staleness === "fresh" ? "high" : "medium",
          fetchedAt: now,
        });
      }
    }
  } catch (err: unknown) {
    logger.warn(`Company data injector: benchmark fetch failed (non-blocking): ${err instanceof Error ? err.message : err}`, "data-router");
  }

  return points;
}

/* ─── Portfolio-derived statistics ────────────────────────────────── */

function gatherPortfolioStats(
  properties: Array<{ country?: string | null; location?: string | null; roomCount?: number | null; startAdr?: number | null; purchasePrice?: number | null; qualityTier?: string | null }>,
): CompanyDataPoint[] {
  if (properties.length === 0) return [];

  const points: CompanyDataPoint[] = [];
  const now = new Date().toISOString();

  const rooms = properties.map(p => p.roomCount ?? 0).filter(r => r > 0);
  const adrs = properties.map(p => p.startAdr ?? 0).filter(a => a > 0);
  const prices = properties.map(p => p.purchasePrice ?? 0).filter(p => p > 0);
  const countries = Array.from(new Set(properties.map(p => p.country).filter((c): c is string => !!c)));

  if (rooms.length > 0) {
    points.push({
      field: "portfolioTotalRooms",
      label: "Portfolio Total Room Count",
      value: rooms.reduce((a, b) => a + b, 0),
      source: `Portfolio analysis (${properties.length} properties)`,
      confidence: "high",
      fetchedAt: now,
    });
  }

  if (adrs.length > 0) {
    const avgAdr = Math.round(adrs.reduce((a, b) => a + b, 0) / adrs.length);
    points.push({
      field: "portfolioAvgAdr",
      label: "Portfolio Average ADR",
      value: `$${avgAdr}`,
      source: `Portfolio analysis (${adrs.length} properties with ADR set)`,
      confidence: "high",
      fetchedAt: now,
    });
  }

  if (prices.length > 0) {
    const totalValue = prices.reduce((a, b) => a + b, 0);
    points.push({
      field: "portfolioTotalValue",
      label: "Portfolio Total Acquisition Value",
      value: `$${(totalValue / 1_000_000).toFixed(1)}M`,
      source: `Portfolio analysis (${prices.length} properties with purchase price)`,
      confidence: "high",
      fetchedAt: now,
    });
  }

  if (countries.length > 0) {
    points.push({
      field: "portfolioCountries",
      label: "Portfolio Operating Countries",
      value: countries.join(", "),
      source: "Portfolio analysis",
      confidence: "high",
      fetchedAt: now,
    });
  }

  return points;
}

/* ─── Main: Build company data injection block ───────────────────── */

export async function buildCompanyDataInjection(
  properties: Array<{ country?: string | null; location?: string | null; roomCount?: number | null; startAdr?: number | null; purchasePrice?: number | null; qualityTier?: string | null }>,
): Promise<string> {
  const countries = Array.from(new Set(
    properties.map(p => p.country).filter((c): c is string => !!c)
  ));

  // Gather all data sources in parallel
  const [fredData, benchmarks] = await Promise.all([
    gatherFredData(),
    gatherBenchmarks(),
  ]);

  const countryData = gatherCountryDefaults(countries.length > 0 ? countries : ["US"]);
  const portfolioStats = gatherPortfolioStats(properties);

  const allPoints = [...fredData, ...countryData, ...benchmarks, ...portfolioStats];

  if (allPoints.length === 0) {
    return "";
  }

  // Format the injection block
  const lines: string[] = [];
  lines.push(`\n\n## VERIFIED COMPANY DATA (${allPoints.length} data points — use as ground truth)\n`);

  // Group by category
  const categories = new Map<string, CompanyDataPoint[]>();
  for (const pt of allPoints) {
    let cat = "Other";
    if (pt.field.startsWith("portfolio")) cat = "Portfolio Statistics";
    else if (pt.field.includes("Rate") || pt.field.includes("rate") || pt.field === "sofrRate" || pt.field === "primeRate" || pt.field.startsWith("treasury")) cat = "Macro Economic Rates";
    else if (pt.field.startsWith("taxRate") || pt.field.startsWith("depreciation")) cat = "Country Tax & Regulatory";
    else cat = "Industry Benchmarks";

    const group = categories.get(cat) ?? [];
    group.push(pt);
    categories.set(cat, group);
  }

  for (const [cat, pts] of Array.from(categories.entries())) {
    lines.push(`\n### ${cat}`);
    for (const pt of pts) {
      const conf = pt.confidence === "high" ? "[HIGH CONF]" : pt.confidence === "medium" ? "[MED CONF]" : "[LOW CONF]";
      lines.push(`- ${pt.label}: ${pt.value} ${conf}`);
      lines.push(`  Source: ${pt.source}`);
    }
  }

  lines.push(`\nUse the verified data above to calibrate your recommendations. Your ranges for inflation rate, tax rate, and cost of equity MUST be consistent with the macro data provided.`);

  logger.info(`Company data injector: ${allPoints.length} verified data points gathered (${fredData.length} FRED, ${countryData.length} country, ${benchmarks.length} benchmark, ${portfolioStats.length} portfolio)`, "data-router");

  return lines.join("\n");
}
