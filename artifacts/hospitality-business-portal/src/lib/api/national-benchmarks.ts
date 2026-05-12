/**
 * national-benchmarks.ts — Client hook for the ICP national research feed
 * benchmarks (vendor pass-through costs + Mgmt Co markup factors).
 *
 * Each row carries Fabio's deterministic range-quality dot
 * (`green | amber | red | grey`) and the underlying guardrail bounds, so
 * the front-of-app does not re-derive plausibility heuristics.
 *
 * Returns empty arrays when no rows have been fetched yet so consumers
 * can render a graceful empty-state.
 */
import { useQuery } from "@tanstack/react-query";

export type RangeQualityDot = "green" | "yellow" | "red" | "grey";

export interface NationalBenchmarkRow {
  serviceLine: string;
  /** Decimal fraction of revenue (e.g. 0.03 = 3%). */
  value: number;
  period: string;
  source: string;
  sourceUrl: string | null;
  fetchedAt: string;
  dot: RangeQualityDot;
  guardrail: { low: number; high: number } | null;
}

export interface NationalBenchmarksResponse {
  vendorCosts: NationalBenchmarkRow[];
  markupFactors: NationalBenchmarkRow[];
  vendorCostsLastFetchedAt: string | null;
  markupFactorsLastFetchedAt: string | null;
}

const EMPTY: NationalBenchmarksResponse = {
  vendorCosts: [],
  markupFactors: [],
  vendorCostsLastFetchedAt: null,
  markupFactorsLastFetchedAt: null,
};

const STALE_TIME_MS = 5 * 60 * 1000;

export function useNationalBenchmarks() {
  return useQuery<NationalBenchmarksResponse>({
    queryKey: ["nationalBenchmarks"],
    queryFn: async () => {
      const res = await fetch("/api/national-benchmarks");
      if (!res.ok) return EMPTY;
      return (await res.json()) as NationalBenchmarksResponse;
    },
    staleTime: STALE_TIME_MS,
  });
}

/**
 * Map a ServiceTemplate display name to the canonical service_line slug
 * used in vendor_passthrough_costs / mgmt_co_markup_factors. Returns null
 * for unknown service names so the chip renders nothing rather than a
 * misleading benchmark.
 */
export function serviceTemplateNameToServiceLine(name: string): string | null {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (normalized.includes("market")) return "marketing";
  if (normalized.includes("technology") || normalized.includes("reservation") || normalized === "it") {
    return normalized.includes("reservation") ? "reservations" : "it";
  }
  if (normalized.includes("account")) return "accounting";
  if (normalized.includes("revenue management")) return "revenue_management";
  if (normalized.includes("procurement") || normalized.includes("purchasing")) return "procurement";
  if (normalized.includes("hr") || normalized.includes("human resources")) return "hr";
  if (normalized.includes("design") || normalized.includes("renovation")) return "design";
  if (normalized.includes("general management") || normalized.includes("management oversight")) {
    return "general_management";
  }
  if (normalized.includes("housekeep")) return "housekeeping";
  if (normalized.includes("maintenance")) return "maintenance";
  if (normalized.includes("food") || normalized.includes("beverage") || normalized.includes("f b")) {
    return "food_beverage";
  }
  return null;
}
