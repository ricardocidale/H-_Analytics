/**
 * constants-revenue-benchmarks.ts — Cached benchmark ranges that drive the
 * Analyst watchdog on the Revenue tab of Company Assumptions.
 *
 * Mirrors the pattern in `constants-funding.ts` (DEFAULT_CAPITAL_RAISE_BENCHMARKS):
 * a hardcoded low/mid/high band per dimension, grounded in industry sources,
 * stable across all users until the Tier-1 LLM refresh path lands.
 *
 * Persona scope: US East Coast + LATAM boutique-luxury hotels
 *   (10–80 rooms, $250–600 ADR, F&B + events + wellness).
 *
 * Sources:
 * - Marketing: HVS 2024 Hotel Cost Survey (boutique luxury sales+marketing
 *   line item, USALI Schedule 4) — typical 5–8% of total revenue, broader
 *   band 4–8% accounting for direct-booking-heavy operators.
 * - F&B / events / other revenue shares: STR/CoStar 2024 + BLLA 2024 boutique
 *   luxury full-service operating mix; F&B-forward properties trend toward
 *   the upper end of each band.
 * - Catering boost: industry rule-of-thumb additive uplift on F&B from
 *   off-property catering and private events.
 *
 * Used by `engine/watchdog/revenueEvaluator.ts`.
 */

export interface RevenueBenchmarkBand {
  low: number;
  mid: number;
  high: number;
}

export interface RevenueBenchmarks {
  /** Sales & Marketing as % of total revenue (USALI Schedule 4). */
  marketingRate: RevenueBenchmarkBand;
  /** F&B as % of total revenue. */
  fbRevenueShare: RevenueBenchmarkBand;
  /** Events as % of total revenue. */
  eventsRevenueShare: RevenueBenchmarkBand;
  /** Other operated departments as % of total revenue. */
  otherRevenueShare: RevenueBenchmarkBand;
  /** Catering boost on top of base F&B (additive uplift). */
  cateringBoostPct: RevenueBenchmarkBand;
}

export const DEFAULT_REVENUE_BENCHMARKS: RevenueBenchmarks = {
  marketingRate:      { low: 0.04, mid: 0.06, high: 0.08 },
  fbRevenueShare:     { low: 0.25, mid: 0.32, high: 0.40 },
  eventsRevenueShare: { low: 0.08, mid: 0.15, high: 0.22 },
  otherRevenueShare:  { low: 0.01, mid: 0.03, high: 0.05 },
  cateringBoostPct:   { low: 0.00, mid: 0.05, high: 0.15 },
};
