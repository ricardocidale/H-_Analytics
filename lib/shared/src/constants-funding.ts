export const DEFAULT_CAPITAL_RAISE_VALUATION_CAP = 2500000;
export const DEFAULT_CAPITAL_RAISE_DISCOUNT_RATE = 0.20;
export const DEFAULT_EARLY_STAGE_DISCOUNT_PREMIUM = 0.05;
export const DEFAULT_EARLY_STAGE_CAP_DISCOUNT = 0.20;
export const DEFAULT_TRANCHE_BUFFER_MULTIPLIER = 1.15;
export const DEFAULT_FUNDING_ROUNDING_INCREMENT = 50_000;
export const DEFAULT_TRANCHE1_PERIOD_RATIO = 0.45;
export const DEFAULT_TRANCHE1_MAX_ALLOCATION = 0.65;
export const DEFAULT_TRANCHE_BIFURCATION_MONTHS = 48;
export const DEFAULT_TRANCHE2_PERIOD_RATIO = 0.75;
export const DEFAULT_TRANCHE2_ALLOCATION_PCT = 0.55;
export const DEFAULT_VALUATION_CAP_UPLIFT = 1.20;
export const DEFAULT_MIN_DISCOUNT_RATE = 0.10;
export const DEFAULT_RISK_FREE_RATE_FALLBACK = 0.04;
export const DEFAULT_SINGLE_TRANCHE_MAX_MONTHS = 18;
export const DEFAULT_SINGLE_TRANCHE_MAX_RAISE = 400_000;
export const DEFAULT_THREE_TRANCHE_MIN_T2 = 500_000;
export const DEFAULT_TREASURY_HIGH_RATE_THRESHOLD = 4.5;
export const DEFAULT_TREASURY_LOW_RATE_THRESHOLD = 3.0;

/** Default loan interest rate for acquisition and refinance debt. Source: current US boutique hospitality debt market (2024–2025). */
export const DEFAULT_INTEREST_RATE = 0.075;
export const DEFAULT_FUNDING_INTEREST_RATE = 0.08;
export const DEFAULT_FUNDING_INTEREST_PAYMENT_FREQUENCY = "accrues_only";

export const DEFAULT_CAPITAL_RAISE_TRANCHE = 800_000;

export const DEFAULT_MAX_CAPITAL_RAISE_DISCOUNT_RATE = 0.30;
export const DEFAULT_RISK_FREE_RATE_SENSITIVITY = 0.1;
export const TRAILING_YEAR_MONTHS_OFFSET = 11;

/**
 * DEFAULT_CAPITAL_RAISE_BENCHMARKS — Stub seed for the Analyst watchdog.
 *
 * These are hardcoded, deterministic ranges used as the fallback population
 * for the `capital_raise_benchmarks` table until the LLM refresh path lands.
 * Each dimension has low/mid/high bounds on which the watchdog evaluator
 * compares the user's saved Funding-tab assumptions:
 *   - runwayBufferMonths        — months of runway buffer past ops start
 *   - sizingOvershootPct        — total raise as a % above modeled need
 *   - trancheGapMonths          — months between Tranche 1 and Tranche 2
 *   - revenueRampDelayMonths    — months before properties hit stable rev
 *   - burnFlexDownPct           — burn flex-down headroom as % of plan burn
 */
export const DEFAULT_CAPITAL_RAISE_BENCHMARKS = {
  runwayBufferMonthsLow: 6,
  runwayBufferMonthsMid: 9,
  runwayBufferMonthsHigh: 12,
  sizingOvershootPctLow: 0.10,
  sizingOvershootPctMid: 0.20,
  sizingOvershootPctHigh: 0.35,
  trancheGapMonthsLow: 6,
  trancheGapMonthsMid: 10,
  trancheGapMonthsHigh: 14,
  revenueRampDelayMonthsLow: 3,
  revenueRampDelayMonthsMid: 6,
  revenueRampDelayMonthsHigh: 9,
  burnFlexDownPctLow: 0.10,
  burnFlexDownPctMid: 0.20,
  burnFlexDownPctHigh: 0.30,
} as const;

/**
 * Funding Specialist required-field Defaults (per .claude/rules/inflation-cascade.md
 * and packet g1.5b-funding-cascade-a). These named constants are the canonical
 * single literal source — seed rows in script/seed-model-defaults.ts and Admin UI
 * fallbacks must reference them, never re-state the literal.
 *
 * Runway / overshoot / burn-flex are aligned with the mid-band of
 * `DEFAULT_CAPITAL_RAISE_BENCHMARKS` above; revenue-ramp uses the packet-locked
 * 9-month default, which is intentionally more conservative than the benchmark
 * mid (6) because hospitality stabilization typically lags fundraising plans.
 */
export const DEFAULT_RUNWAY_BUFFER_MONTHS = DEFAULT_CAPITAL_RAISE_BENCHMARKS.runwayBufferMonthsMid;
export const DEFAULT_SIZING_OVERSHOOT_PCT = DEFAULT_CAPITAL_RAISE_BENCHMARKS.sizingOvershootPctMid;
export const DEFAULT_REVENUE_RAMP_DELAY_MONTHS = 9;
export const DEFAULT_BURN_FLEX_DOWN_PCT = DEFAULT_CAPITAL_RAISE_BENCHMARKS.burnFlexDownPctMid;

/**
 * Universal Layer-1 default for the per-property refinance LTV cap relative to
 * the ORIGINAL acquisition loan amount. Used by the layered defaults resolver
 * (plan 2026-05-13-001 — feat seed-calibration-bracket-defaults-and-irr-views).
 *
 * This is a DEFAULT VARIABLE per `hplus-variable-taxonomy`, NOT a true
 * constant. Day-zero seed value lands in `model_defaults` under the canonical
 * key `mc.funding.refiMaxLtvToOriginal` (universal scope: country / subdivision
 * / businessType / sizeBand all NULL). After seed, the DB row is the source of
 * truth — `seed-model-defaults.ts` is the only consumer of this TS literal.
 *
 * Bracket-specific overlays land in `icp_brackets.default_refi_max_ltv_to_original`
 * (Layer 2). Per-property values live on the property row (Layer 3).
 *
 * Value rationale: 0.70 caps the refi proceeds at 70% of the ORIGINAL loan
 * principal, preventing the inflated mid-projection cash-out spikes that
 * drove the demo portfolio combined IRR to ~50%+ (see plan Problem Frame).
 * The pre-existing `DEFAULT_REFI_LTV` (0.65) governs the refi-LTV applied to
 * the new appraised value; `DEFAULT_REFI_MAX_LTV_TO_ORIGINAL` is a separate,
 * additional cap on the resulting cash-out as a multiple of original debt.
 */
export const DEFAULT_REFI_MAX_LTV_TO_ORIGINAL = 0.70;

export const SEED_DEBT_ASSUMPTIONS = {
  acqLTV: 0.75,             // Acquisition loan-to-value (75% LTV means 25% equity down)
  refiLTV: 0.75,            // Refinance loan-to-value
  interestRate: DEFAULT_INTEREST_RATE, // Annual interest rate — sourced from DEFAULT_INTEREST_RATE
  amortizationYears: 25,    // Loan fully amortizes over 25 years
  acqClosingCostRate: 0.02, // Acquisition closing costs as % of loan amount
  refiClosingCostRate: 0.03,// Refinance closing costs as % of new loan amount
} as const;

// v1 placeholder — G6-P3 computes from the engine output.
export const DEFAULT_RUNWAY_NEED_MONTHS_PLACEHOLDER = 18;

/** Minimum number of live EDGAR Form D rows required before falling back to canned comparables. */
export const EDGAR_MIN_LIVE_ROWS = 3;
/** Representative sizing overshoot fraction for EDGAR Form D comparable rows (not disclosed in Form D filings). */
export const EDGAR_COMPARABLE_SIZING_OVERSHOOT_PCT = 0.15;

// ──────────────────────────────────────────────────────────
// PORTFOLIO CAPITAL RAISE SPECIALIST
// Dimension benchmark thresholds, quality scores, and output schema bounds.
// Source: PE/boutique hospitality fund industry norms (ADR-007).
// ──────────────────────────────────────────────────────────

/** First close minimum as a fraction of total fund equity.
 * PE convention: first close at 30–50% of total fund; 30% is the baseline floor used
 * both as the engine computation threshold and as the benchmark low anchor. */
export const PORTFOLIO_RAISE_FIRST_CLOSE_FRACTION       = 0.30;
export const PORTFOLIO_RAISE_FIRST_CLOSE_BENCHMARK_MID  = 0.40;
export const PORTFOLIO_RAISE_FIRST_CLOSE_BENCHMARK_HIGH = 0.50;

/** Portfolio DSCR benchmark thresholds (lender covenant convention). */
export const PORTFOLIO_RAISE_DSCR_BENCHMARK_LOW  = 1.0;   // covenant breach threshold
export const PORTFOLIO_RAISE_DSCR_BENCHMARK_MID  = 1.25;  // standard lender covenant floor
export const PORTFOLIO_RAISE_DSCR_BENCHMARK_HIGH = 1.5;   // healthy coverage

/** Ramp capital buffer (months of working capital). */
export const PORTFOLIO_RAISE_RAMP_BUFFER_MONTHS_LOW  = 3;   // minimum viable buffer
export const PORTFOLIO_RAISE_RAMP_BUFFER_MONTHS_MID  = 6;   // expected LP minimum
export const PORTFOLIO_RAISE_RAMP_BUFFER_MONTHS_HIGH = 12;  // conservative cushion

/** Achievable levered IRR range for boutique luxury value-add funds.
 * Source: HVS / PwC Real Estate Investor Survey 2024 — boutique luxury value-add: 12–18% levered. */
export const PORTFOLIO_RAISE_IRR_BENCHMARK_LOW  = 0.12;  // 12% levered IRR
export const PORTFOLIO_RAISE_IRR_BENCHMARK_MID  = 0.15;  // 15% levered IRR
export const PORTFOLIO_RAISE_IRR_BENCHMARK_HIGH = 0.18;  // 18% levered IRR

/** Conviction enum → 0–100 quality score mapping for portfolio raise specialist. */
export const PORTFOLIO_RAISE_QUALITY_SCORE_HIGH       = 85;
export const PORTFOLIO_RAISE_QUALITY_SCORE_MODERATE   = 65;
export const PORTFOLIO_RAISE_QUALITY_SCORE_DEVELOPING = 45;

/** Zod output-schema string-length bounds for portfolio raise specialist verdict fields. */
export const PORTFOLIO_RAISE_REASONING_MIN_CHARS = 20;
export const PORTFOLIO_RAISE_REASONING_MAX_CHARS = 500;
export const PORTFOLIO_RAISE_NARRATIVE_MIN_CHARS = 50;
export const PORTFOLIO_RAISE_NARRATIVE_MAX_CHARS = 800;

/** Tranche 2 disbursement occupancy window for Launch-stage management company raises.
 * LP convention: second tranche releases once Property 1 demonstrates occupancy traction
 * (60–65% is the industry validation band; below 60% is still ramp, above 65% is stable). */
export const PORTFOLIO_RAISE_TRANCHE2_OCCUPANCY_LOW  = 60;  // % lower trigger
export const PORTFOLIO_RAISE_TRANCHE2_OCCUPANCY_HIGH = 65;  // % upper trigger

/** LP waterfall economics — European waterfall default for boutique luxury portfolio funds. */
export const PORTFOLIO_RAISE_LP_PREFERRED_RETURN_PCT = 8;   // 8% non-compounded preferred return
export const PORTFOLIO_RAISE_GP_CARRY_PCT            = 20;  // 20% GP promote above hurdle
export const PORTFOLIO_RAISE_ASSET_CONCENTRATION_MAX_PCT = 25;  // single-asset max % of total fund equity
