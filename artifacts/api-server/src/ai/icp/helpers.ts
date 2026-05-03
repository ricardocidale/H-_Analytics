/**
 * server/ai/icp/helpers.ts — Pure helpers shared across ICP generators.
 *
 * Numeric aggregation, classification counting, and string formatters used by
 * the portfolio analyzer, the config builder, the LLM prompt builder, and the
 * narrative builder. All functions are deterministic and side-effect free.
 */

import type { NumericAggregate } from "@shared/icp-types";

// ─── Numeric aggregation ────────────────────────────────────────────────────

export function aggregateNumeric(values: number[]): NumericAggregate {
  if (values.length === 0) return { min: 0, max: 0, median: 0, mean: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median: Math.round(median),
    mean: Math.round(sum / sorted.length),
  };
}

export function aggregateNullable(
  values: (number | null | undefined)[],
): NumericAggregate | null {
  const valid = values.filter((v): v is number => v != null && v > 0);
  return valid.length > 0 ? aggregateNumeric(valid) : null;
}

// ─── Classification counting ────────────────────────────────────────────────

export function countMap<T extends string>(
  values: (T | null | undefined)[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of values) {
    if (v) counts[v] = (counts[v] ?? 0) + 1;
  }
  return counts;
}

export function dominant(counts: Record<string, number>): string {
  let best = "";
  let bestCount = 0;
  for (const [k, v] of Object.entries(counts)) {
    if (v > bestCount) { best = k; bestCount = v; }
  }
  return best;
}

// ─── String formatters ──────────────────────────────────────────────────────

export function fmtK(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}K`;
  return String(Math.round(v));
}

export function pctDisplay(v: number): string {
  // Handle both 0-1 and 0-100 formats
  const pct = v > 1 ? v : v * 100;
  return `${Math.round(pct)}%`;
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
