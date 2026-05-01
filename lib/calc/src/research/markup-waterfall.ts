/**
 * markup-waterfall.ts — Compute cost-plus markup waterfall for a service.
 *
 * Given vendor cost and markup percentage, produces the full waterfall:
 * vendor cost → fee charged → gross profit → effective margin.
 * Benchmark ranges sourced from INDUSTRY_MARKUP_RANGES in shared/constants-benchmarks.ts
 * (HVS Central Services Survey). No numeric literals in this file.
 */

interface MarkupWaterfallInput {
  vendorCost: number;
  markupPct: number;
  serviceType?: string;
}

interface MarkupWaterfallOutput {
  vendorCost: number;
  markupPct: number;
  feeCharged: number;
  grossProfit: number;
  effectiveMargin: number;
  industryMarkupRange: { low: number; mid: number; high: number } | null;
  serviceType: string | null;
}

import { INDUSTRY_MARKUP_RANGES } from "@shared/constants";

const INDUSTRY_MARKUPS = INDUSTRY_MARKUP_RANGES;

const LEGACY_KEY_ALIASES: Record<string, string> = {
  it: "technology_reservations",
  reservations: "technology_reservations",
};

export function computeMarkupWaterfall(input: MarkupWaterfallInput): MarkupWaterfallOutput {
  const { vendorCost, markupPct } = input;
  const feeCharged = vendorCost * (1 + markupPct);
  const grossProfit = feeCharged - vendorCost;
  const effectiveMargin = feeCharged > 0 ? grossProfit / feeCharged : 0;

  const rawKey = (input.serviceType ?? "").toLowerCase().replace(/[\s/&]+/g, "_");
  const key = LEGACY_KEY_ALIASES[rawKey] ?? rawKey;
  const industryMarkupRange = INDUSTRY_MARKUPS[key] ?? null;

  return {
    vendorCost,
    markupPct,
    feeCharged: Math.round(feeCharged * 100) / 100,
    grossProfit: Math.round(grossProfit * 100) / 100,
    effectiveMargin: Math.round(effectiveMargin * 10000) / 10000,
    industryMarkupRange,
    serviceType: input.serviceType ?? null,
  };
}
