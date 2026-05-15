/**
 * constants-property-defaults-benchmarks.ts — Cached benchmark ranges for the
 * Analyst watchdog on the Property Defaults surface (Admin → Model Defaults →
 * Property Underwriting tab).
 *
 * @deprecated Values are now seeded into the `model_constants` DB table and
 * are admin-editable without a deploy. Use `resolvePropertyDefaultsBenchmarks()`
 * from `artifacts/api-server/src/finance/benchmark-resolver.ts` for DB-backed
 * values, or `getFactoryNumber(key)` from `@shared/model-constants-registry`
 * for TS-only fallbacks. Direct imports here will be removed in a future
 * cleanup pass.
 *
 * Mirrors `constants-company-benchmarks.ts`: named LOW/MID/HIGH exports per
 * dimension, assembled into a band-object by reference (no inline literals).
 *
 * Persona scope: boutique-luxury hospitality management companies operating
 *   3–25 properties, US-based, founder-led to institutional-scale.
 *
 * Four tracked dimensions, all rate-based (fractions):
 *   1. eventExpenseRate       — event/banquet cost as fraction of event revenue
 *   2. otherExpenseRate       — other/ancillary cost as fraction of other revenue
 *   3. utilitiesVariableSplit — fraction of utilities treated as variable (vs. fixed)
 *   4. salesCommissionRate    — blended distribution/commission cost as fraction
 *
 * Sources:
 * - Event expense rate: AHLA/USALI F&B and Event Cost Benchmarks (11th ed.);
 *   CBRE Hotel Operations Report (banquet cost ratios for full-service boutique
 *   hotels run 55%–75% of event revenue; median near 65%).
 * - Other expense rate: CBRE Trends in the Hotel Industry; USALI undistributed-
 *   department benchmarks for ancillary/other revenue streams (50%–72% range).
 * - Utilities variable split: ENERGY STAR Hotel Energy Intensity benchmarks;
 *   Cornell Hotel Sustainability Handbook; STR Energy Cost Survey (40%–70%
 *   of utilities vary with occupancy; boutique-luxury median near 60%).
 * - Sales commission rate: Kalibri Labs Direct Booking Study; AHLA Distribution
 *   Cost Study; Phocuswright OTA Commission Report (blended weighted-average
 *   for boutique-luxury with 30%–50% OTA mix runs 3%–12%).
 *
 * ─── Naming convention ───
 *
 * Per `.claude/rules/no-hardcoded-values.md`, every benchmark value is
 * exported as a named `DEFAULT_*_BENCHMARK_{LOW,MID,HIGH}` constant.
 * The band-object assembles them by reference — no inline numeric literals.
 *
 * Used by `engine/watchdog/propertyDefaultsEvaluator.ts`.
 */

// ─── Event Expense Rate — fraction of event revenue ──────────────────────────
export const DEFAULT_EVENT_EXPENSE_RATE_BENCHMARK_LOW  = 0.55;
export const DEFAULT_EVENT_EXPENSE_RATE_BENCHMARK_MID  = 0.65;
export const DEFAULT_EVENT_EXPENSE_RATE_BENCHMARK_HIGH = 0.75;

// ─── Other Expense Rate — fraction of other/ancillary revenue ────────────────
export const DEFAULT_OTHER_EXPENSE_RATE_BENCHMARK_LOW  = 0.50;
export const DEFAULT_OTHER_EXPENSE_RATE_BENCHMARK_MID  = 0.60;
export const DEFAULT_OTHER_EXPENSE_RATE_BENCHMARK_HIGH = 0.72;

// ─── Utilities Variable Split — fraction of utilities that vary with occupancy
export const DEFAULT_UTILITIES_VARIABLE_SPLIT_BENCHMARK_LOW  = 0.40;
export const DEFAULT_UTILITIES_VARIABLE_SPLIT_BENCHMARK_MID  = 0.60;
export const DEFAULT_UTILITIES_VARIABLE_SPLIT_BENCHMARK_HIGH = 0.70;

// ─── Sales Commission Rate — blended distribution/OTA commission fraction ────
export const DEFAULT_SALES_COMMISSION_RATE_BENCHMARK_LOW  = 0.03;
export const DEFAULT_SALES_COMMISSION_RATE_BENCHMARK_MID  = 0.07;
export const DEFAULT_SALES_COMMISSION_RATE_BENCHMARK_HIGH = 0.12;

// ─── Band shape ──────────────────────────────────────────────────────────────

export interface PropertyDefaultsBenchmarkBand {
  low:  number;
  mid:  number;
  high: number;
}

export interface PropertyDefaultsBenchmarks {
  eventExpenseRate:       PropertyDefaultsBenchmarkBand;
  otherExpenseRate:       PropertyDefaultsBenchmarkBand;
  utilitiesVariableSplit: PropertyDefaultsBenchmarkBand;
  salesCommissionRate:    PropertyDefaultsBenchmarkBand;
}

export const DEFAULT_PROPERTY_DEFAULTS_BENCHMARKS: PropertyDefaultsBenchmarks = {
  eventExpenseRate: {
    low:  DEFAULT_EVENT_EXPENSE_RATE_BENCHMARK_LOW,
    mid:  DEFAULT_EVENT_EXPENSE_RATE_BENCHMARK_MID,
    high: DEFAULT_EVENT_EXPENSE_RATE_BENCHMARK_HIGH,
  },
  otherExpenseRate: {
    low:  DEFAULT_OTHER_EXPENSE_RATE_BENCHMARK_LOW,
    mid:  DEFAULT_OTHER_EXPENSE_RATE_BENCHMARK_MID,
    high: DEFAULT_OTHER_EXPENSE_RATE_BENCHMARK_HIGH,
  },
  utilitiesVariableSplit: {
    low:  DEFAULT_UTILITIES_VARIABLE_SPLIT_BENCHMARK_LOW,
    mid:  DEFAULT_UTILITIES_VARIABLE_SPLIT_BENCHMARK_MID,
    high: DEFAULT_UTILITIES_VARIABLE_SPLIT_BENCHMARK_HIGH,
  },
  salesCommissionRate: {
    low:  DEFAULT_SALES_COMMISSION_RATE_BENCHMARK_LOW,
    mid:  DEFAULT_SALES_COMMISSION_RATE_BENCHMARK_MID,
    high: DEFAULT_SALES_COMMISSION_RATE_BENCHMARK_HIGH,
  },
};
