/**
 * check-trend.ts
 *
 * Shared trend-detection logic used by check-selective.ts and
 * check-timing-report.ts.  Keeping it in one place ensures both scripts always
 * agree on what "regression" means — no drift possible.
 */

/** Fraction above the p75 baseline that counts as a regression (20 %). */
export const REGRESSION_THRESHOLD = 0.2;

/**
 * Return the 75th-percentile value from a numeric array (nearest-rank).
 * The array must be non-empty.
 */
export function p75(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil(sorted.length * 0.75) - 1;
  return sorted[Math.max(0, idx)];
}

export type TrendDirection = "up" | "down" | "flat" | "unknown";

/**
 * Classify the trend of `currentMs` relative to the p75 of `priorWindow`.
 *
 * - "up"      — current > baseline × (1 + REGRESSION_THRESHOLD)
 * - "down"    — current < baseline × (1 − REGRESSION_THRESHOLD)
 * - "flat"    — within ±REGRESSION_THRESHOLD of baseline
 * - "unknown" — priorWindow is empty or baseline is zero
 */
export function classifyTrend(priorWindow: number[], currentMs: number): TrendDirection {
  if (priorWindow.length === 0) return "unknown";
  const baseline = p75(priorWindow);
  if (baseline <= 0) return "unknown";
  const ratio = currentMs / baseline;
  if (ratio > 1 + REGRESSION_THRESHOLD) return "up";
  if (ratio < 1 - REGRESSION_THRESHOLD) return "down";
  return "flat";
}

/** Unicode arrow representing a trend direction. */
export function trendArrow(dir: TrendDirection): string {
  switch (dir) {
    case "up":      return "↑";
    case "down":    return "↓";
    case "flat":    return "→";
    case "unknown": return "?";
  }
}
