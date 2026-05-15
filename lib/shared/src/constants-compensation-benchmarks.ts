/**
 * constants-compensation-benchmarks.ts — Cached benchmark ranges that drive
 * the Analyst watchdog on the Compensation tab of Company Assumptions.
 *
 * Mirrors the pattern in `constants-revenue-benchmarks.ts`: a hardcoded
 * low/mid/high band per dimension, grounded in industry sources, stable
 * across all users until the Tier-1 LLM refresh path lands.
 *
 * @deprecated Values are now seeded into the `model_constants` DB table and
 * are admin-editable without a deploy. Use `resolveCompensationBenchmarks()`
 * from `artifacts/api-server/src/finance/benchmark-resolver.ts` for DB-backed
 * values, or `getFactoryNumber(key)` from `@shared/model-constants-registry`
 * for TS-only fallbacks. Direct imports here will be removed in a future
 * cleanup pass.
 *
 * Persona scope: boutique-luxury hospitality management companies operating
 *   3–25 properties, founder-led to institutional-scale.
 *
 * Sources:
 * - Partner compensation: hospitality ManCo comp benchmarks (founder-led
 *   stage typically $90–540K Year 1 total mgmt comp; matures to $700K–1.5M
 *   by Year 10 as the platform reaches institutional scale).
 * - Partner count: typical founding teams range 2–5 partners; mid is 3.
 * - Staff salary: AHLA Lodging Industry Survey + market hospitality
 *   benchmarks for mid-level operations roles ($50–120K with $75K mid).
 * - Tier-3 FTE: scale-stage staffing for 6+ properties; full-platform
 *   institutional-scale operators typically run 7–12 FTEs at peak.
 *
 * Used by `engine/watchdog/compensationEvaluator.ts`.
 */

export interface CompensationBenchmarkBand {
  low: number;
  mid: number;
  high: number;
}

export interface CompensationBenchmarks {
  /** Year 1 total management compensation (annual USD). */
  partnerCompYear1: CompensationBenchmarkBand;
  /** Year 10 total management compensation (annual USD). Captures growth trajectory. */
  partnerCompYear10: CompensationBenchmarkBand;
  /** Year 1 partner headcount. */
  partnerCountYear1: CompensationBenchmarkBand;
  /** Average annual salary per FTE (USD). */
  staffSalary: CompensationBenchmarkBand;
  /** Tier-3 FTE count (max-scale staffing model). */
  staffTier3Fte: CompensationBenchmarkBand;
}

export const DEFAULT_PARTNER_COMP_YEAR1_BENCHMARK_LOW  = 300_000;
export const DEFAULT_PARTNER_COMP_YEAR1_BENCHMARK_MID  = 540_000;
export const DEFAULT_PARTNER_COMP_YEAR1_BENCHMARK_HIGH = 900_000;

export const DEFAULT_PARTNER_COMP_YEAR10_BENCHMARK_LOW  = 700_000;
export const DEFAULT_PARTNER_COMP_YEAR10_BENCHMARK_MID  = 900_000;
export const DEFAULT_PARTNER_COMP_YEAR10_BENCHMARK_HIGH = 1_500_000;

export const DEFAULT_PARTNER_COUNT_YEAR1_BENCHMARK_LOW  = 2;
export const DEFAULT_PARTNER_COUNT_YEAR1_BENCHMARK_MID  = 3;
export const DEFAULT_PARTNER_COUNT_YEAR1_BENCHMARK_HIGH = 5;

export const DEFAULT_STAFF_SALARY_BENCHMARK_LOW  = 50_000;
export const DEFAULT_STAFF_SALARY_BENCHMARK_MID  = 75_000;
export const DEFAULT_STAFF_SALARY_BENCHMARK_HIGH = 120_000;

export const DEFAULT_STAFF_TIER3_FTE_BENCHMARK_LOW  = 5;
export const DEFAULT_STAFF_TIER3_FTE_BENCHMARK_MID  = 7;
export const DEFAULT_STAFF_TIER3_FTE_BENCHMARK_HIGH = 12;

export const DEFAULT_COMPENSATION_BENCHMARKS: CompensationBenchmarks = {
  partnerCompYear1:  { low: DEFAULT_PARTNER_COMP_YEAR1_BENCHMARK_LOW,  mid: DEFAULT_PARTNER_COMP_YEAR1_BENCHMARK_MID,  high: DEFAULT_PARTNER_COMP_YEAR1_BENCHMARK_HIGH },
  partnerCompYear10: { low: DEFAULT_PARTNER_COMP_YEAR10_BENCHMARK_LOW, mid: DEFAULT_PARTNER_COMP_YEAR10_BENCHMARK_MID, high: DEFAULT_PARTNER_COMP_YEAR10_BENCHMARK_HIGH },
  partnerCountYear1: { low: DEFAULT_PARTNER_COUNT_YEAR1_BENCHMARK_LOW, mid: DEFAULT_PARTNER_COUNT_YEAR1_BENCHMARK_MID, high: DEFAULT_PARTNER_COUNT_YEAR1_BENCHMARK_HIGH },
  staffSalary:       { low: DEFAULT_STAFF_SALARY_BENCHMARK_LOW,        mid: DEFAULT_STAFF_SALARY_BENCHMARK_MID,        high: DEFAULT_STAFF_SALARY_BENCHMARK_HIGH },
  staffTier3Fte:     { low: DEFAULT_STAFF_TIER3_FTE_BENCHMARK_LOW,     mid: DEFAULT_STAFF_TIER3_FTE_BENCHMARK_MID,     high: DEFAULT_STAFF_TIER3_FTE_BENCHMARK_HIGH },
};
