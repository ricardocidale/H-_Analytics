/**
 * Shared types for market benchmark data resolved from the `reference_range`
 * table and injected into Specialist user prompts as calibration context.
 */

/**
 * One benchmark row from `reference_range`, pre-selected by a runner for a
 * specific metric + country. Passed into prompt builders as calibration data.
 *
 * These are injected as NON-PRESCRIPTIVE reference data per
 * `.claude/rules/field-definitions-no-prescription-hints.md` — the prompt
 * must frame them as calibration context and explicitly instruct the LLM to
 * reason per-deal rather than emit the range verbatim.
 */
export interface MarketBenchmarkEntry {
  metricKey: string;
  label: string;
  low: number;
  mid: number;
  high: number;
  unit: string;
  country: string;
  sourceName: string | null;
}
