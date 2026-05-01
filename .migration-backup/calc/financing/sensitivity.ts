/**
 * calc/financing/sensitivity.ts — DSCR sensitivity matrix (rate × NOI stress test).
 *
 * PURPOSE:
 * Generates a two-dimensional stress-test matrix showing how the Debt Service
 * Coverage Ratio (DSCR) changes across a grid of interest rate shocks (in basis
 * points) and NOI shocks (in percentage changes). This is a standard lender and
 * investor tool for assessing loan resilience.
 *
 * HOW THE MATRIX WORKS:
 * For each (rate_shock_bps, noi_shock_pct) combination:
 *   stressed_rate = base_rate + (shock_bps / 10,000)
 *   stressed_NOI  = base_NOI × (1 + shock_pct / 100)
 *   stressed_DS   = PMT(loan_amount, stressed_rate, amort_months) × 12
 *   DSCR          = stressed_NOI / stressed_DS
 *
 * Each cell is flagged pass/fail against the minimum DSCR threshold (default 1.25×).
 * The output includes worst-case and best-case DSCR across all scenarios, plus a
 * count of failing scenarios.
 *
 * WHY AMORTIZING DS IS USED (NOT IO):
 * Lenders size loans to the worst-case (peak) debt service, which occurs during
 * the amortizing period. Even if the loan starts with IO payments, the sensitivity
 * matrix uses amortizing DS to ensure the loan remains viable after IO expires.
 * IO DSCR is reported separately for informational purposes.
 *
 * KEY TERMS:
 * - Basis Point (bp): 1/100th of 1%. So 100 bps = 1.00%.
 * - NOI Shock: Percentage change to base NOI. -20% simulates a 20% revenue decline.
 * - Pass/Fail: Whether the stressed DSCR meets the minimum threshold.
 *
 * HOW IT FITS THE SYSTEM:
 * Called via the dispatch layer as the "sensitivity" skill. Typically presented
 * as a color-coded heat map in the UI, showing green (pass) and red (fail) cells.
 */
import type { RoundingPolicy } from "../../domain/types/rounding.js";
import { roundTo } from "../../domain/types/rounding.js";
import { pmt, ioPayment } from "../shared/pmt.js";
import { MONTHS_PER_YEAR, STRESS_TEST_MIN_DSCR } from "../../shared/constants.js";

export interface SensitivityInput {
  /** Base annual Net Operating Income */
  noi_annual: number;
  /** Base loan amount */
  loan_amount: number;
  /** Base annual interest rate as decimal (e.g. 0.07 = 7%) */
  interest_rate_annual: number;
  /** Amortization schedule length in months */
  amortization_months: number;
  /** Total loan term in months */
  term_months: number;
  /** Interest-only period in months (0 = fully amortizing) */
  io_months?: number;
  /** Rate variations to test as basis points (e.g. [-200, -100, 0, 100, 200]) */
  rate_shocks_bps: number[];
  /** NOI variations to test as percentages (e.g. [-20, -10, 0, 10, 20]) */
  noi_shocks_pct: number[];
  /** Minimum DSCR threshold for pass/fail flagging */
  min_dscr?: number;
  rounding_policy: RoundingPolicy;
}

export interface SensitivityCell {
  /** Rate shock in bps */
  rate_shock_bps: number;
  /** NOI shock as percentage */
  noi_shock_pct: number;
  /** Stressed annual interest rate */
  stressed_rate: number;
  /** Stressed NOI */
  stressed_noi: number;
  /** Annual debt service during IO period (null if no IO) */
  annual_ds_io: number | null;
  /** Annual debt service during amortizing period (peak DS) */
  annual_ds_amortizing: number;
  /** DSCR during IO period (null if no IO) */
  dscr_io: number | null;
  /** DSCR during amortizing period (worst-case) */
  dscr_amortizing: number;
  /** Whether amortizing DSCR meets minimum threshold */
  passes: boolean;
}

export interface SensitivityOutput {
  /** Base case DSCR (amortizing, worst-case) */
  base_dscr: number;
  /** Base case IO DSCR (if applicable) */
  base_dscr_io: number | null;
  /** Base annual debt service (amortizing) */
  base_annual_ds: number;
  /** Full matrix of stress results */
  matrix: SensitivityCell[];
  /** Rate shock labels in bps */
  rate_axis: number[];
  /** NOI shock labels in pct */
  noi_axis: number[];
  /** Number of scenarios that fail DSCR threshold */
  failing_scenarios: number;
  /** Total scenarios tested */
  total_scenarios: number;
  /** Worst-case DSCR across all scenarios (amortizing) */
  worst_dscr: number;
  /** Best-case DSCR across all scenarios (amortizing) */
  best_dscr: number;
}

/**
 * Generate a DSCR stress-test matrix across interest rate and NOI variations.
 *
 * For each (rate_shock, noi_shock) combination:
 *   stressed_rate = base_rate + (shock_bps / 10_000)
 *   stressed_noi = base_noi * (1 + shock_pct / 100)
 *
 * DS is computed separately for IO and amortizing periods.
 * Pass/fail is based on AMORTIZING DSCR (worst-case DS), consistent
 * with standard commercial lending practice.
 */
export function computeSensitivity(input: SensitivityInput): SensitivityOutput {
  const r = (v: number) => roundTo(v, input.rounding_policy);
  const dscr_round = (v: number) => roundTo(v, { precision: 4, bankers_rounding: false });
  const ioMonths = input.io_months ?? 0;
  const isFullIO = ioMonths >= input.term_months;
  const minDSCR = input.min_dscr ?? STRESS_TEST_MIN_DSCR;

  const baseAmortDS = computeAmortizingAnnualDS(
    input.loan_amount,
    input.interest_rate_annual,
    input.amortization_months,
    input.rounding_policy,
  );
  const baseIODS = ioMonths > 0
    ? computeIOAnnualDS(input.loan_amount, input.interest_rate_annual, input.rounding_policy)
    : null;

  const baseDS = isFullIO ? (baseIODS ?? 0) : baseAmortDS;
  const baseDSCR = baseDS > 0 ? dscr_round(input.noi_annual / baseDS) : 0;
  const baseDSCRIO = baseIODS !== null && baseIODS > 0
    ? dscr_round(input.noi_annual / baseIODS)
    : null;

  const matrix: SensitivityCell[] = [];
  let worstDSCR = Infinity;
  let bestDSCR = -Infinity;
  let failCount = 0;

  for (const rateShock of input.rate_shocks_bps) {
    for (const noiShock of input.noi_shocks_pct) {
      const stressedRate = Math.max(0, input.interest_rate_annual + rateShock / 10_000);
      const stressedNOI = r(input.noi_annual * (1 + noiShock / 100));

      const amortDS = computeAmortizingAnnualDS(
        input.loan_amount,
        stressedRate,
        input.amortization_months,
        input.rounding_policy,
      );

      let ioDS: number | null = null;
      let dscrIO: number | null = null;
      if (ioMonths > 0) {
        ioDS = computeIOAnnualDS(input.loan_amount, stressedRate, input.rounding_policy);
        dscrIO = ioDS > 0 ? dscr_round(stressedNOI / ioDS) : 0;
      }

      const peakDS = isFullIO ? (ioDS ?? 0) : amortDS;
      const dscrAmort = peakDS > 0 ? dscr_round(stressedNOI / peakDS) : 0;
      const passes = dscrAmort >= minDSCR;
      if (!passes) failCount++;

      if (dscrAmort < worstDSCR) worstDSCR = dscrAmort;
      if (dscrAmort > bestDSCR) bestDSCR = dscrAmort;

      matrix.push({
        rate_shock_bps: rateShock,
        noi_shock_pct: noiShock,
        stressed_rate: roundTo(stressedRate, { precision: 6, bankers_rounding: false }),
        stressed_noi: stressedNOI,
        annual_ds_io: ioDS,
        annual_ds_amortizing: isFullIO ? (ioDS ?? 0) : amortDS,
        dscr_io: dscrIO,
        dscr_amortizing: dscrAmort,
        passes,
      });
    }
  }

  return {
    base_dscr: baseDSCR,
    base_dscr_io: baseDSCRIO,
    base_annual_ds: baseDS,
    matrix,
    rate_axis: [...input.rate_shocks_bps],
    noi_axis: [...input.noi_shocks_pct],
    failing_scenarios: failCount,
    total_scenarios: matrix.length,
    worst_dscr: worstDSCR === Infinity ? 0 : worstDSCR,
    best_dscr: bestDSCR === -Infinity ? 0 : bestDSCR,
  };
}

function computeAmortizingAnnualDS(
  loanAmount: number,
  annualRate: number,
  amortMonths: number,
  rounding: RoundingPolicy,
): number {
  const monthlyRate = annualRate / MONTHS_PER_YEAR;
  const monthly = pmt(loanAmount, monthlyRate, amortMonths);
  return roundTo(monthly * MONTHS_PER_YEAR, rounding);
}

function computeIOAnnualDS(
  loanAmount: number,
  annualRate: number,
  rounding: RoundingPolicy,
): number {
  const monthlyRate = annualRate / MONTHS_PER_YEAR;
  return roundTo(ioPayment(loanAmount, monthlyRate) * MONTHS_PER_YEAR, rounding);
}
