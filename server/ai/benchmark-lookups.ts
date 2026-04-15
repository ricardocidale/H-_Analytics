/**
 * benchmark-lookups.ts — Deterministic lookup tools for pre-collected market data.
 *
 * These functions query the 7 pre-collected tables (market_adr_index,
 * seasonal_calendars, event_calendars, labor_rates, fb_benchmarks,
 * airport_distances, hospitality_benchmarks) and return structured results.
 *
 * Used by:
 *   - Smart Data Router (data-routing.ts) as Priority 0 before external APIs
 *   - Research prompt builders to inject facts into LLM prompts
 *   - validate_assumption_range tool to check any assumption against benchmarks
 *
 * All functions return null/empty when no data exists — the caller decides
 * whether to fall back to external APIs or report "Developing" conviction.
 */

import { db } from "../db";
import {
  marketAdrIndex, seasonalCalendars, eventCalendars,
  laborRates, fbBenchmarks, airportDistances, hospitalityBenchmarks,
} from "@shared/schema";
import { eq, and, desc, ilike } from "drizzle-orm";
import { logger } from "../logger";

// ── Types ──────────────────────────────────────────────────────────────────

export interface AdrLookupResult {
  market: string;
  quarter: string;
  avgAdr: number | null;
  luxuryAdr: number | null;
  upscaleAdr: number | null;
  midscaleAdr: number | null;
  boutiqueAdr: number | null;
  avgOccupancy: number | null;
  avgRevpar: number | null;
  source: string | null;
}

export interface SeasonalCurveResult {
  market: string;
  months: Array<{ month: number; seasonType: string; demandMultiplier: number; adrMultiplier: number | null }>;
  peakMonth: number;
  troughMonth: number;
}

export interface EventCalendarResult {
  market: string;
  events: Array<{ name: string; startMonth: number | null; endMonth: number | null; impact: string; category: string | null; attendees: number | null; notes: string | null }>;
}

export interface LaborCostResult {
  market: string;
  country: string;
  roles: Array<{ role: string; hourlyRate: number | null; annualSalary: number | null; currency: string; source: string | null }>;
}

export interface FbBenchmarkResult {
  market: string;
  propertyType: string;
  avgTicketPerPerson: number | null;
  coversPerRoomNight: number | null;
  fbCostOfGoodsPercent: number | null;
  fbLaborCostPercent: number | null;
  source: string | null;
}

export interface BenchmarkRange {
  low: number;
  mid: number;
  high: number;
  source: string | null;
  sourceYear: number | null;
}

export interface AssumptionValidation {
  fieldName: string;
  userValue: number;
  verdict: "within" | "above" | "below" | "no_data";
  benchmarkRange: BenchmarkRange | null;
  deviationPercent: number | null;
  explanation: string;
}

// ── Lookups ────────────────────────────────────────────────────────────────

/** Look up ADR/occupancy benchmarks for a market. Returns latest quarter. */
export async function lookupMarketAdr(market: string): Promise<AdrLookupResult | null> {
  try {
    const [row] = await db.select().from(marketAdrIndex)
      .where(ilike(marketAdrIndex.market, market))
      .orderBy(desc(marketAdrIndex.quarter))
      .limit(1);
    if (!row) return null;
    return {
      market: row.market,
      quarter: row.quarter,
      avgAdr: row.avgAdr,
      luxuryAdr: row.luxuryAdr,
      upscaleAdr: row.upscaleAdr,
      midscaleAdr: row.midscaleAdr,
      boutiqueAdr: row.boutiqueAdr,
      avgOccupancy: row.avgOccupancy,
      avgRevpar: row.avgRevpar,
      source: row.source,
    };
  } catch (err: unknown) {
    logger.warn(`lookupMarketAdr failed: ${err instanceof Error ? err.message : err}`, "benchmark-lookups");
    return null;
  }
}

/** Look up 12-month seasonal demand curve for a market. */
export async function lookupSeasonalCurve(market: string): Promise<SeasonalCurveResult | null> {
  try {
    const rows = await db.select().from(seasonalCalendars)
      .where(ilike(seasonalCalendars.market, market))
      .orderBy(seasonalCalendars.month);
    if (rows.length === 0) return null;

    const months = rows.map(r => ({
      month: r.month,
      seasonType: r.seasonType,
      demandMultiplier: r.demandMultiplier,
      adrMultiplier: r.avgAdrMultiplier,
    }));

    const peakMonth = months.reduce((best, m) => m.demandMultiplier > best.demandMultiplier ? m : best).month;
    const troughMonth = months.reduce((best, m) => m.demandMultiplier < best.demandMultiplier ? m : best).month;

    return { market, months, peakMonth, troughMonth };
  } catch (err: unknown) {
    logger.warn(`lookupSeasonalCurve failed: ${err instanceof Error ? err.message : err}`, "benchmark-lookups");
    return null;
  }
}

/** Look up demand-driving events for a market. */
export async function lookupEventCalendar(market: string): Promise<EventCalendarResult | null> {
  try {
    const rows = await db.select().from(eventCalendars)
      .where(ilike(eventCalendars.market, market));
    if (rows.length === 0) return null;
    return {
      market,
      events: rows.map(r => ({
        name: r.eventName,
        startMonth: r.startMonth,
        endMonth: r.endMonth,
        impact: r.demandImpact,
        category: r.category,
        attendees: r.estimatedAttendees,
        notes: r.notes,
      })),
    };
  } catch (err: unknown) {
    logger.warn(`lookupEventCalendar failed: ${err instanceof Error ? err.message : err}`, "benchmark-lookups");
    return null;
  }
}

/** Look up hospitality labor costs for a market or country. */
export async function lookupLaborCosts(market: string, country?: string): Promise<LaborCostResult | null> {
  try {
    const rows = await db.select().from(laborRates)
      .where(ilike(laborRates.market, market));

    // If no market-specific data, try country-level ("US General", etc.)
    if (rows.length === 0 && country) {
      const fallback = await db.select().from(laborRates)
        .where(ilike(laborRates.market, `${country} General`));
      if (fallback.length === 0) return null;
      return {
        market: `${country} General`,
        country: fallback[0].country,
        roles: fallback.map(r => ({
          role: r.role,
          hourlyRate: r.hourlyRate,
          annualSalary: r.annualSalary,
          currency: r.currency,
          source: r.source,
        })),
      };
    }

    if (rows.length === 0) return null;
    return {
      market,
      country: rows[0].country,
      roles: rows.map(r => ({
        role: r.role,
        hourlyRate: r.hourlyRate,
        annualSalary: r.annualSalary,
        currency: r.currency,
        source: r.source,
      })),
    };
  } catch (err: unknown) {
    logger.warn(`lookupLaborCosts failed: ${err instanceof Error ? err.message : err}`, "benchmark-lookups");
    return null;
  }
}

/** Look up F&B operating benchmarks for a market and property type. */
export async function lookupFbBenchmarks(market: string, propertyType?: string): Promise<FbBenchmarkResult | null> {
  try {
    const conditions = [ilike(fbBenchmarks.market, market)];
    if (propertyType) conditions.push(eq(fbBenchmarks.propertyType, propertyType));

    const [row] = await db.select().from(fbBenchmarks)
      .where(and(...conditions))
      .limit(1);
    if (!row) return null;
    return {
      market: row.market,
      propertyType: row.propertyType,
      avgTicketPerPerson: row.avgTicketPerPerson,
      coversPerRoomNight: row.coversPerRoomNight,
      fbCostOfGoodsPercent: row.fbCostOfGoodsPercent,
      fbLaborCostPercent: row.fbLaborCostPercent,
      source: row.source,
    };
  } catch (err: unknown) {
    logger.warn(`lookupFbBenchmarks failed: ${err instanceof Error ? err.message : err}`, "benchmark-lookups");
    return null;
  }
}

/** Look up hospitality benchmarks by category and segment. */
export async function lookupBenchmark(
  category: string,
  segment?: string,
  country?: string,
): Promise<BenchmarkRange | null> {
  try {
    const conditions = [ilike(hospitalityBenchmarks.category, category)];
    if (segment) conditions.push(ilike(hospitalityBenchmarks.segment, segment));
    if (country) conditions.push(ilike(hospitalityBenchmarks.country, country));

    const rows = await db.select().from(hospitalityBenchmarks)
      .where(and(...conditions))
      .limit(10);
    if (rows.length === 0) return null;

    const values = rows.map(r => r.value).filter((v): v is number => v != null);
    if (values.length === 0) return null;

    values.sort((a, b) => a - b);
    const low = values[0];
    const high = values[values.length - 1];
    const mid = values[Math.floor(values.length / 2)];

    return {
      low,
      mid,
      high,
      source: rows[0].sourceName ?? null,
      sourceYear: rows[0].sourceYear ?? null,
    };
  } catch (err: unknown) {
    logger.warn(`lookupBenchmark failed: ${err instanceof Error ? err.message : err}`, "benchmark-lookups");
    return null;
  }
}

// ── The Key Tool: validate_assumption_range ─────────────────────────────────

/** Field-to-lookup mapping — which table and benchmark to check for each assumption field */
const FIELD_LOOKUP_MAP: Record<string, {
  category?: string;
  segment?: string;
  adrField?: keyof AdrLookupResult;
  unit: "currency" | "percent" | "count" | "years";
}> = {
  startAdr:                { adrField: "boutiqueAdr", unit: "currency" },
  startOccupancy:          { category: "occupancy", unit: "percent" },
  exitCapRate:             { category: "cap_rate", unit: "percent" },
  costRateRooms:           { category: "cost_rate", segment: "rooms", unit: "percent" },
  costRateFB:              { category: "cost_rate", segment: "fb", unit: "percent" },
  costRateAdmin:           { category: "cost_rate", segment: "admin", unit: "percent" },
  costRateMarketing:       { category: "cost_rate", segment: "marketing", unit: "percent" },
  costRatePropertyOps:     { category: "cost_rate", segment: "property_ops", unit: "percent" },
  costRateUtilities:       { category: "cost_rate", segment: "utilities", unit: "percent" },
  costRateInsurance:       { category: "cost_rate", segment: "insurance", unit: "percent" },
  costRateFFE:             { category: "cost_rate", segment: "ffe", unit: "percent" },
  revShareFB:              { category: "revenue_share", segment: "fb", unit: "percent" },
  revShareEvents:          { category: "revenue_share", segment: "events", unit: "percent" },
  adrGrowthRate:           { category: "adr_growth", unit: "percent" },
  baseManagementFeeRate:   { category: "management_fee", segment: "base", unit: "percent" },
  incentiveManagementFeeRate: { category: "management_fee", segment: "incentive", unit: "percent" },
};

/**
 * Validate any property assumption against pre-collected benchmark data.
 *
 * Returns a structured verdict: within/above/below/no_data with the benchmark
 * range and a human-readable explanation the LLM can include in its response.
 */
export async function validateAssumptionRange(
  fieldName: string,
  userValue: number,
  market?: string,
  tier?: string,
  country?: string,
): Promise<AssumptionValidation> {
  const mapping = FIELD_LOOKUP_MAP[fieldName];
  if (!mapping) {
    return {
      fieldName,
      userValue,
      verdict: "no_data",
      benchmarkRange: null,
      deviationPercent: null,
      explanation: `No benchmark mapping configured for field "${fieldName}".`,
    };
  }

  let range: BenchmarkRange | null = null;

  // Special case: ADR uses market_adr_index directly
  if (mapping.adrField && market) {
    const adr = await lookupMarketAdr(market);
    if (adr) {
      const val = adr[mapping.adrField] as number | null;
      if (val != null) {
        // Construct range: ±20% around the benchmark ADR
        range = {
          low: Math.round(val * 0.8),
          mid: Math.round(val),
          high: Math.round(val * 1.2),
          source: adr.source,
          sourceYear: null,
        };
      }
    }
  }

  // General benchmark lookup
  if (!range && mapping.category) {
    const segment = tier ? `${country ?? "us"}_${tier}` : mapping.segment;
    range = await lookupBenchmark(mapping.category, segment, country);

    // Fallback: try without segment
    if (!range) {
      range = await lookupBenchmark(mapping.category, undefined, country);
    }

    // Fallback: try global (no country)
    if (!range) {
      range = await lookupBenchmark(mapping.category);
    }
  }

  if (!range) {
    return {
      fieldName,
      userValue,
      verdict: "no_data",
      benchmarkRange: null,
      deviationPercent: null,
      explanation: `No benchmark data available for ${fieldName}${market ? ` in ${market}` : ""}.`,
    };
  }

  // Determine verdict
  const isPercent = mapping.unit === "percent";
  const displayValue = isPercent ? `${(userValue * 100).toFixed(1)}%` : `$${userValue.toLocaleString("en-US")}`;
  const displayLow = isPercent ? `${(range.low * 100).toFixed(1)}%` : `$${range.low.toLocaleString("en-US")}`;
  const displayHigh = isPercent ? `${(range.high * 100).toFixed(1)}%` : `$${range.high.toLocaleString("en-US")}`;

  let verdict: "within" | "above" | "below";
  let explanation: string;

  if (userValue >= range.low && userValue <= range.high) {
    verdict = "within";
    const deviation = Math.abs(range.mid) > 1e-6 ? ((userValue - range.mid) / range.mid) : 0;
    explanation = `${displayValue} is within the benchmark range (${displayLow}–${displayHigh}). Aligns with market data.`;
    return { fieldName, userValue, verdict, benchmarkRange: range, deviationPercent: Math.round(deviation * 100), explanation };
  } else if (userValue > range.high) {
    verdict = "above";
    const deviation = Math.abs(range.high) > 1e-6 ? ((userValue - range.high) / range.high) : 0;
    explanation = `${displayValue} is ${Math.round(deviation * 100)}% above the benchmark range (${displayLow}–${displayHigh}). May need justification for investors.`;
    return { fieldName, userValue, verdict, benchmarkRange: range, deviationPercent: Math.round(deviation * 100), explanation };
  } else {
    verdict = "below";
    const deviation = Math.abs(range.low) > 1e-6 ? ((range.low - userValue) / range.low) : 0;
    explanation = `${displayValue} is ${Math.round(deviation * 100)}% below the benchmark range (${displayLow}–${displayHigh}). Conservative assumption — may understate returns.`;
    return { fieldName, userValue, verdict, benchmarkRange: range, deviationPercent: Math.round(deviation * 100), explanation };
  }
}

// ── Convenience: validate all key assumptions at once ───────────────────────

export async function validateAllAssumptions(
  assumptions: Record<string, number>,
  market?: string,
  tier?: string,
  country?: string,
): Promise<AssumptionValidation[]> {
  const results: AssumptionValidation[] = [];

  for (const [field, value] of Object.entries(assumptions)) {
    if (FIELD_LOOKUP_MAP[field] && typeof value === "number" && Number.isFinite(value) && value !== 0) {
      const validation = await validateAssumptionRange(field, value, market, tier, country);
      results.push(validation);
    }
  }

  return results;
}
