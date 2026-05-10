/**
 * Pure helpers for the ReferenceRangesTab component split.
 *
 * Extracted from `../ReferenceRangesTab.tsx` (task-1360) without behavior
 * changes — every function is byte-identical to the original.
 */
import type {
  ReferenceRangeDomain,
  ReferenceRangeConfidence,
} from "@shared/schema/reference-range";
import { FRESHNESS_BADGE } from "./constants";
import type { FormState, ReferenceRangeRow } from "./types";

export function freshness(lastVerifiedAt: string | null): keyof typeof FRESHNESS_BADGE {
  if (!lastVerifiedAt) return "missing";
  const ageMs = Date.now() - new Date(lastVerifiedAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays <= 90) return "fresh";
  if (ageDays <= 365) return "aging";
  return "stale";
}

export function formatJurisdiction(row: ReferenceRangeRow): string {
  const parts = [row.country];
  if (row.subdivision) parts.push(row.subdivision);
  if (row.market) parts.push(row.market);
  if (row.segment) parts.push(`[${row.segment}]`);
  if (row.propertyType) parts.push(`(${row.propertyType})`);
  return parts.join(" · ");
}

export function formatYear(year: number): string {
  return year === 0 ? "Evergreen" : String(year);
}

export function rowToForm(row: ReferenceRangeRow): FormState {
  return {
    domain: (row.domain as ReferenceRangeDomain),
    metricKey: row.metricKey,
    label: row.label,
    country: row.country,
    subdivision: row.subdivision ?? "",
    market: row.market ?? "",
    segment: row.segment ?? "",
    propertyType: row.propertyType ?? "",
    year: String(row.year),
    low: String(row.low),
    mid: String(row.mid),
    high: String(row.high),
    unit: row.unit,
    confidence: (row.confidence as ReferenceRangeConfidence),
    sourceName: row.sourceName ?? "",
    sourceUrl: row.sourceUrl ?? "",
    methodology: row.methodology ?? "",
  };
}

export function formToPayload(f: FormState): Record<string, unknown> {
  const orNull = (s: string) => (s.trim() === "" ? null : s.trim());
  return {
    domain: f.domain,
    metricKey: f.metricKey.trim(),
    label: f.label.trim(),
    country: f.country.trim() || "GLOBAL",
    subdivision: orNull(f.subdivision),
    market: orNull(f.market),
    segment: orNull(f.segment),
    propertyType: orNull(f.propertyType),
    year: Number(f.year),
    low: Number(f.low),
    mid: Number(f.mid),
    high: Number(f.high),
    unit: f.unit.trim(),
    confidence: f.confidence,
    sourceName: orNull(f.sourceName),
    sourceUrl: orNull(f.sourceUrl),
    methodology: orNull(f.methodology),
  };
}

export function validateForm(f: FormState): string | null {
  if (!f.metricKey.trim()) return "Metric Key is required.";
  if (!/^[a-z0-9-]+$/.test(f.metricKey.trim())) return "Metric Key must be kebab-case (a–z, 0–9, hyphen).";
  if (!f.label.trim()) return "Label is required.";
  if (!f.country.trim()) return "Country is required (use GLOBAL if not country-specific).";
  if (!f.unit.trim()) return "Unit is required.";
  if (f.year === "" || Number.isNaN(Number(f.year))) return "Year must be a number (use 0 for evergreen).";
  if (Number(f.year) < 0) return "Year cannot be negative.";
  for (const k of ["low", "mid", "high"] as const) {
    if (f[k] === "" || Number.isNaN(Number(f[k]))) return `${k[0].toUpperCase()}${k.slice(1)} must be a number.`;
  }
  const lo = Number(f.low), mi = Number(f.mid), hi = Number(f.high);
  if (!(lo <= mi && mi <= hi)) return "Range must satisfy low ≤ mid ≤ high.";
  return null;
}
