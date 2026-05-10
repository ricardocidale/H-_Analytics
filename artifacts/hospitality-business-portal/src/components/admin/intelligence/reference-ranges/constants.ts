/**
 * Constants for the ReferenceRangesTab component split.
 *
 * Extracted from `../ReferenceRangesTab.tsx` (task-1360) without behavior
 * changes — these mirror the original local constants byte-for-byte.
 */
import { REFERENCE_RANGE_DOMAINS } from "@shared/schema/reference-range";
import type { FormState } from "./types";

export const ANY = "__any__";

export const FRESHNESS_BADGE: Record<"fresh" | "aging" | "stale" | "missing", string> = {
  fresh:   "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  aging:   "bg-sky-500/15 text-sky-700 border-sky-500/30",
  stale:   "bg-amber-500/15 text-amber-700 border-amber-500/30",
  missing: "bg-rose-500/15 text-rose-700 border-rose-500/30",
};

export const CONFIDENCE_BADGE: Record<string, string> = {
  high:   "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  medium: "bg-sky-500/15 text-sky-700 border-sky-500/30",
  low:    "bg-amber-500/15 text-amber-700 border-amber-500/30",
};

export const ANALYST_STEPS: readonly string[] = [
  "The Analyst is cross-referencing live market data…",
  "Updating KPI benchmarks from AirROI…",
  "Refreshing macro indicators from FRED…",
  "Done. Ranges updated.",
] as const;

export const EMPTY_FORM: FormState = {
  domain: REFERENCE_RANGE_DOMAINS[0],
  metricKey: "",
  label: "",
  country: "GLOBAL",
  subdivision: "",
  market: "",
  segment: "",
  propertyType: "",
  year: "0",
  low: "",
  mid: "",
  high: "",
  unit: "",
  confidence: "medium",
  sourceName: "",
  sourceUrl: "",
  methodology: "",
};
