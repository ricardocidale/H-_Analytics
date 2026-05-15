/**
 * constants-revenue-benchmarks.ts — Cached benchmark ranges that drive the
 * Analyst watchdog on the Revenue tab of Company Assumptions.
 *
 * Mirrors the pattern in `constants-funding.ts` (DEFAULT_CAPITAL_RAISE_BENCHMARKS):
 * a hardcoded low/mid/high band per dimension, grounded in industry sources,
 * stable across all users until the Tier-1 LLM refresh path lands.
 *
 * @deprecated Values are now seeded into the `model_constants` DB table and
 * are admin-editable without a deploy. Use `resolveRevenueBenchmarks()`
 * from `artifacts/api-server/src/finance/benchmark-resolver.ts` for DB-backed
 * values, or `getFactoryNumber(key)` from `@shared/model-constants-registry`
 * for TS-only fallbacks. Direct imports here will be removed in a future
 * cleanup pass.
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

export const DEFAULT_MARKETING_RATE_BENCHMARK_LOW  = 0.04;
export const DEFAULT_MARKETING_RATE_BENCHMARK_MID  = 0.06;
export const DEFAULT_MARKETING_RATE_BENCHMARK_HIGH = 0.08;

export const DEFAULT_FB_REVENUE_SHARE_BENCHMARK_LOW  = 0.25;
export const DEFAULT_FB_REVENUE_SHARE_BENCHMARK_MID  = 0.32;
export const DEFAULT_FB_REVENUE_SHARE_BENCHMARK_HIGH = 0.40;

export const DEFAULT_EVENTS_REVENUE_SHARE_BENCHMARK_LOW  = 0.08;
export const DEFAULT_EVENTS_REVENUE_SHARE_BENCHMARK_MID  = 0.15;
export const DEFAULT_EVENTS_REVENUE_SHARE_BENCHMARK_HIGH = 0.22;

export const DEFAULT_OTHER_REVENUE_SHARE_BENCHMARK_LOW  = 0.01;
export const DEFAULT_OTHER_REVENUE_SHARE_BENCHMARK_MID  = 0.03;
export const DEFAULT_OTHER_REVENUE_SHARE_BENCHMARK_HIGH = 0.05;

export const DEFAULT_CATERING_BOOST_PCT_BENCHMARK_LOW  = 0.00;
export const DEFAULT_CATERING_BOOST_PCT_BENCHMARK_MID  = 0.05;
export const DEFAULT_CATERING_BOOST_PCT_BENCHMARK_HIGH = 0.15;

export const DEFAULT_REVENUE_BENCHMARKS: RevenueBenchmarks = {
  marketingRate:      { low: DEFAULT_MARKETING_RATE_BENCHMARK_LOW,      mid: DEFAULT_MARKETING_RATE_BENCHMARK_MID,      high: DEFAULT_MARKETING_RATE_BENCHMARK_HIGH },
  fbRevenueShare:     { low: DEFAULT_FB_REVENUE_SHARE_BENCHMARK_LOW,     mid: DEFAULT_FB_REVENUE_SHARE_BENCHMARK_MID,     high: DEFAULT_FB_REVENUE_SHARE_BENCHMARK_HIGH },
  eventsRevenueShare: { low: DEFAULT_EVENTS_REVENUE_SHARE_BENCHMARK_LOW, mid: DEFAULT_EVENTS_REVENUE_SHARE_BENCHMARK_MID, high: DEFAULT_EVENTS_REVENUE_SHARE_BENCHMARK_HIGH },
  otherRevenueShare:  { low: DEFAULT_OTHER_REVENUE_SHARE_BENCHMARK_LOW,  mid: DEFAULT_OTHER_REVENUE_SHARE_BENCHMARK_MID,  high: DEFAULT_OTHER_REVENUE_SHARE_BENCHMARK_HIGH },
  cateringBoostPct:   { low: DEFAULT_CATERING_BOOST_PCT_BENCHMARK_LOW,   mid: DEFAULT_CATERING_BOOST_PCT_BENCHMARK_MID,   high: DEFAULT_CATERING_BOOST_PCT_BENCHMARK_HIGH },
};
