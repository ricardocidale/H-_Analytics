/**
 * constants-compensation-benchmarks.ts — Cached benchmark ranges that drive
 * the Analyst watchdog on the Compensation tab of Company Assumptions.
 *
 * Mirrors the pattern in `constants-revenue-benchmarks.ts`: a hardcoded
 * low/mid/high band per dimension, grounded in industry sources, stable
 * across all users until the Tier-1 LLM refresh path lands.
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

export const DEFAULT_COMPENSATION_BENCHMARKS: CompensationBenchmarks = {
  partnerCompYear1:  { low: 300_000, mid: 540_000, high: 900_000 },
  partnerCompYear10: { low: 700_000, mid: 900_000, high: 1_500_000 },
  partnerCountYear1: { low: 2,       mid: 3,       high: 5 },
  staffSalary:       { low: 50_000,  mid: 75_000,  high: 120_000 },
  staffTier3Fte:     { low: 5,       mid: 7,       high: 12 },
};
