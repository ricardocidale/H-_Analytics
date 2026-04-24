/**
 * calc/financing/prepayment.ts — Prepayment penalty calculator for early loan payoff.
 *
 * PURPOSE:
 * When a borrower pays off a commercial real estate loan before maturity (e.g., at
 * refinance or property sale), the lender charges a prepayment penalty to compensate
 * for lost interest income. This module computes the penalty amount under three
 * common structures used in hospitality lending.
 *
 * THREE PENALTY TYPES:
 *
 * 1. YIELD MAINTENANCE ("make-whole")
 *    The borrower compensates the lender for the present value of the interest rate
 *    differential over the remaining loan term. If the loan rate is 7% and current
 *    Treasuries are 4%, the borrower pays the PV of that 3% spread on the declining
 *    balance for every remaining month. This is the most expensive penalty and is
 *    common in CMBS (Commercial Mortgage-Backed Securities) loans.
 *    Formula: Σ PV[(scheduled_interest_m − treasury_interest_m)] for each remaining month
 *
 * 2. STEP-DOWN (declining percentage)
 *    A fixed percentage of the outstanding balance that decreases annually.
 *    Common pattern: 5-4-3-2-1 (5% in year 1, declining 1% per year).
 *    Simpler to calculate and more borrower-friendly in later years.
 *
 * 3. DEFEASANCE
 *    Instead of paying off the loan, the borrower purchases a portfolio of
 *    U.S. Treasury securities that replicate the remaining scheduled debt service
 *    payments. The lender keeps receiving payments from the Treasuries.
 *    Cost = PV(remaining payments at Treasury rate) − outstanding balance + admin fees.
 *    Common in securitized (CMBS) loans where the trust cannot accept early payoff.
 *
 * HOW IT FITS THE SYSTEM:
 * Called via the dispatch layer as the "prepayment" skill, and also used internally
 * by the refinance calculator to determine the total payoff cost of the existing loan.
 * The penalty amount flows into the refinance's "payoff_breakdown" and affects the
 * cash-out-to-equity computation.
 */
import type { RoundingPolicy } from "../../domain/types/rounding.js";
import { roundTo } from "../../domain/types/rounding.js";
import type { ScheduleEntry } from "../shared/types.js";
import { MONTHS_PER_YEAR } from "../../shared/constants.js";
import { dPow, dDiv } from "../shared/decimal.js";

export type PrepaymentType = "yield_maintenance" | "step_down" | "defeasance";

export interface PrepaymentInput {
  /** Outstanding loan balance at prepayment (or provide schedule + month) */
  outstanding_balance?: number;
  /** Full amortization schedule (used for balance lookup and cash flow modeling) */
  schedule?: ScheduleEntry[];
  /** Month of prepayment (0-indexed from origination) */
  prepayment_month?: number;
  /** Loan origination annual rate */
  loan_rate_annual: number;
  /** Total loan term in months */
  term_months: number;
  /** Type of prepayment penalty */
  prepayment_type: PrepaymentType;
  /** For yield maintenance: current Treasury rate (annual decimal, e.g. 0.04 = 4%) */
  treasury_rate_annual?: number;
  /** For step-down: array of penalty percentages by year [year1_pct, year2_pct, ...] (e.g. [0.05, 0.04, 0.03, 0.02, 0.01]) */
  step_down_schedule?: number[];
  /** For defeasance: estimated cost as % of balance (e.g. 0.01 = 1%) for admin/legal fees */
  defeasance_fee_pct?: number;
  rounding_policy: RoundingPolicy;
}

export interface PrepaymentOutput {
  /** Balance at prepayment */
  balance_at_prepayment: number;
  /** Months remaining on loan */
  months_remaining: number;
  /** Prepayment penalty amount */
  penalty_amount: number;
  /** Penalty as percentage of outstanding balance */
  penalty_pct: number;
  /** Total cost to prepay (balance + penalty) */
  total_prepayment_cost: number;
  /** Breakdown details */
  details: PrepaymentDetails;
  /** Input validation warnings (e.g., unusual treasury rates) */
  warnings: string[];
}

export interface YieldMaintenanceDetails {
  type: "yield_maintenance";
  /** Loan rate minus treasury rate */
  rate_differential: number;
  /** Present value of remaining interest differential on declining balance */
  pv_differential: number;
  /** Treasury rate used */
  treasury_rate: number;
}

export interface StepDownDetails {
  type: "step_down";
  /** Which year of the loan (1-indexed) */
  loan_year: number;
  /** Penalty percentage for that year */
  year_penalty_pct: number;
}

export interface DefeasanceDetails {
  type: "defeasance";
  /** Cost of purchasing treasury securities to replicate remaining cash flows */
  securities_cost: number;
  /** Administrative/legal fees */
  admin_fees: number;
}

export type PrepaymentDetails = YieldMaintenanceDetails | StepDownDetails | DefeasanceDetails;

/**
 * Calculate prepayment penalties for early loan payoff.
 *
 * Three penalty types:
 *
 * 1. Yield Maintenance: PV of interest rate differential on the actual
 *    remaining scheduled cash flows (declining balance for amortizing loans).
 *    Penalty = sum of PV[(scheduled_interest_m - treasury_interest_m)] for each remaining month.
 *
 * 2. Step-Down: Fixed percentage that decreases over time.
 *    Common pattern: 5-4-3-2-1 (5% in year 1, 4% in year 2, etc.)
 *
 * 3. Defeasance: Borrower purchases treasury securities to replicate
 *    remaining scheduled cash flows. Cost = PV of remaining payments at
 *    treasury rate minus outstanding balance, plus admin fees.
 */
export function computePrepayment(input: PrepaymentInput): PrepaymentOutput {
  const r = (v: number) => roundTo(v, input.rounding_policy);
  const pct = (v: number) => roundTo(v, { precision: 6, bankers_rounding: false });
  const warnings: string[] = [];

  const prepayMonth = input.prepayment_month ?? 0;
  const balance = resolveBalance(input);
  const monthsRemaining = input.term_months - prepayMonth;
  const remainingSchedule = getRemainingSchedule(input, prepayMonth);

  let effectiveTreasuryRate = input.treasury_rate_annual ?? 0;
  if (effectiveTreasuryRate < 0) {
    warnings.push("Treasury rate is negative — clamping to 0%");
    effectiveTreasuryRate = 0;
  }
  if (effectiveTreasuryRate > input.loan_rate_annual) {
    warnings.push(`Treasury rate (${(effectiveTreasuryRate * 100).toFixed(2)}%) exceeds loan rate (${(input.loan_rate_annual * 100).toFixed(2)}%) — yield maintenance penalty will be $0`);
  }
  if (effectiveTreasuryRate > 0.15) {
    warnings.push(`Treasury rate (${(effectiveTreasuryRate * 100).toFixed(2)}%) is unusually high — verify input`);
  }

  let penalty: number;
  let details: PrepaymentDetails;

  switch (input.prepayment_type) {
    case "yield_maintenance": {
      const result = computeYieldMaintenance(
        balance,
        monthsRemaining,
        remainingSchedule,
        input.loan_rate_annual,
        effectiveTreasuryRate,
        input.rounding_policy,
      );
      penalty = result.penalty;
      details = result.details;
      break;
    }
    case "step_down": {
      const result = computeStepDown(
        balance,
        prepayMonth,
        input.step_down_schedule ?? [],
        input.rounding_policy,
      );
      penalty = result.penalty;
      details = result.details;
      break;
    }
    case "defeasance": {
      const result = computeDefeasance(
        balance,
        monthsRemaining,
        remainingSchedule,
        input.loan_rate_annual,
        effectiveTreasuryRate,
        input.defeasance_fee_pct ?? 0.01,
        input.rounding_policy,
      );
      penalty = result.penalty;
      details = result.details;
      break;
    }
    default: {
      const _exhaustive: never = input.prepayment_type;
      throw new Error(`Unhandled prepayment_type: ${String(_exhaustive)}`);
    }
  }

  const penaltyPct = balance > 0 ? pct(penalty / balance) : 0;

  return {
    balance_at_prepayment: balance,
    months_remaining: monthsRemaining,
    penalty_amount: r(penalty),
    penalty_pct: penaltyPct,
    total_prepayment_cost: r(balance + penalty),
    details,
    warnings,
  };
}

function resolveBalance(input: PrepaymentInput): number {
  if (input.outstanding_balance !== undefined) {
    return input.outstanding_balance;
  }
  if (input.schedule && input.prepayment_month !== undefined) {
    const entry = input.schedule[input.prepayment_month];
    if (entry) return entry.beginning_balance;
    const lastEntry = input.schedule[input.schedule.length - 1];
    return lastEntry ? lastEntry.ending_balance : 0;
  }
  return 0;
}

function getRemainingSchedule(input: PrepaymentInput, prepayMonth: number): ScheduleEntry[] {
  if (!input.schedule) return [];
  return input.schedule.filter(e => e.month >= prepayMonth);
}

/**
 * Yield Maintenance using actual scheduled cash flows.
 *
 * For each remaining month in the schedule:
 *   loan_interest_m = scheduled interest on declining balance
 *   treasury_interest_m = beginning_balance_m * treasury_monthly_rate
 *   differential_m = loan_interest_m - treasury_interest_m
 *   PV(differential_m) = differential_m / (1 + treasury_monthly_rate)^(m - prepay_month)
 *
 * If no schedule provided, falls back to straight-line estimate on beginning balance.
 */
function computeYieldMaintenance(
  balance: number,
  monthsRemaining: number,
  remainingSchedule: ScheduleEntry[],
  loanRate: number,
  treasuryRate: number,
  rounding: RoundingPolicy,
): { penalty: number; details: YieldMaintenanceDetails } {
  const r = (v: number) => roundTo(v, rounding);
  const rateDiff = Math.max(0, loanRate - treasuryRate);
  const monthlyTreasury = treasuryRate / MONTHS_PER_YEAR;
  const monthlyLoan = loanRate / MONTHS_PER_YEAR;

  let pvDiff = 0;

  if (remainingSchedule.length > 0) {
    for (let i = 0; i < remainingSchedule.length; i++) {
      const entry = remainingSchedule[i];
      const loanInterest = entry.interest;
      const treasuryInterest = entry.beginning_balance * monthlyTreasury;
      const differential = Math.max(0, loanInterest - treasuryInterest);
      const discountPeriod = i + 1;
      const discountFactor = monthlyTreasury > 0
        ? dPow(1 + monthlyTreasury, -discountPeriod)
        : 1;
      pvDiff += differential * discountFactor;
    }
  } else {
    let runningBalance = balance;
    for (let m = 1; m <= monthsRemaining; m++) {
      const differential = runningBalance * (monthlyLoan - monthlyTreasury);
      const discountFactor = monthlyTreasury > 0
        ? dPow(1 + monthlyTreasury, -m)
        : 1;
      pvDiff += Math.max(0, differential) * discountFactor;
      runningBalance *= (1 - monthlyLoan);
    }
  }

  pvDiff = r(pvDiff);

  return {
    penalty: pvDiff,
    details: {
      type: "yield_maintenance",
      rate_differential: roundTo(rateDiff, { precision: 6, bankers_rounding: false }),
      pv_differential: pvDiff,
      treasury_rate: treasuryRate,
    },
  };
}

function computeStepDown(
  balance: number,
  prepaymentMonth: number,
  stepDownSchedule: number[],
  rounding: RoundingPolicy,
): { penalty: number; details: StepDownDetails } {
  const r = (v: number) => roundTo(v, rounding);
  const loanYear = Math.floor(prepaymentMonth / MONTHS_PER_YEAR) + 1;

  const yearIndex = Math.min(loanYear - 1, stepDownSchedule.length - 1);
  const penaltyPct = yearIndex >= 0 && stepDownSchedule.length > 0
    ? stepDownSchedule[yearIndex]
    : 0;

  return {
    penalty: r(balance * penaltyPct),
    details: {
      type: "step_down",
      loan_year: loanYear,
      year_penalty_pct: penaltyPct,
    },
  };
}

/**
 * Defeasance using actual scheduled cash flows.
 *
 * The borrower must purchase a portfolio of treasury securities that replicates
 * the remaining scheduled debt service payments. The cost is the PV of those
 * payments discounted at the treasury rate.
 *
 * Securities cost = PV(remaining payments at treasury rate) - outstanding balance
 * If treasury rate < loan rate, this is positive (penalty).
 * If treasury rate > loan rate, securities cost is zero (no premium).
 */
function computeDefeasance(
  balance: number,
  monthsRemaining: number,
  remainingSchedule: ScheduleEntry[],
  loanRate: number,
  treasuryRate: number,
  feePct: number,
  rounding: RoundingPolicy,
): { penalty: number; details: DefeasanceDetails } {
  const r = (v: number) => roundTo(v, rounding);
  const monthlyTreasury = treasuryRate / MONTHS_PER_YEAR;

  let securitiesCost = 0;

  if (remainingSchedule.length > 0) {
    let pvAtTreasury = 0;
    for (let i = 0; i < remainingSchedule.length; i++) {
      const entry = remainingSchedule[i];
      const discountPeriod = i + 1;
      const discountFactor = monthlyTreasury > 0
        ? dPow(1 + monthlyTreasury, discountPeriod)
        : 1;
      pvAtTreasury += dDiv(entry.payment, discountFactor);
    }
    securitiesCost = r(Math.max(0, pvAtTreasury - balance));
  } else if (treasuryRate < loanRate) {
    const monthlyLoan = loanRate / MONTHS_PER_YEAR;
    const monthlyPayment = balance * monthlyLoan;
    let pvAtTreasury = 0;
    for (let m = 1; m <= monthsRemaining; m++) {
      pvAtTreasury += dDiv(monthlyPayment, dPow(1 + monthlyTreasury, m));
    }
    pvAtTreasury += dDiv(balance, dPow(1 + monthlyTreasury, monthsRemaining));
    securitiesCost = r(Math.max(0, pvAtTreasury - balance));
  }

  const adminFees = r(balance * feePct);

  return {
    penalty: r(securitiesCost + adminFees),
    details: {
      type: "defeasance",
      securities_cost: securitiesCost,
      admin_fees: adminFees,
    },
  };
}
