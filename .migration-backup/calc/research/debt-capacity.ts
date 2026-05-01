/**
 * debt-capacity.ts — Deterministic Debt Capacity Calculator
 *
 * Computes the maximum supportable debt from NOI, target DSCR, and loan terms.
 * Used by AI research to ground financing recommendations in exact math.
 */
import { roundCents } from "../shared/utils.js";
import { pmt } from "../shared/pmt.js";
import { MONTHS_PER_YEAR } from "../../shared/constants.js";
import { dPow, dDiv } from "../shared/decimal.js";

interface DebtCapacityInput {
  annual_noi: number;
  dscr_target: number; // e.g., 1.25
  interest_rate: number; // annual, e.g., 0.065
  term_years: number; // e.g., 25
  property_value?: number; // for LTV calculation
}

interface DebtCapacityOutput {
  max_annual_debt_service: number;
  max_monthly_payment: number;
  max_loan_amount: number;
  implied_ltv_pct: number | null;
  annual_noi: number;
  dscr_target: number;
  interest_rate_pct: number;
  term_years: number;
  monthly_rate: number;
  total_payments: number;
}

export function computeDebtCapacity(input: DebtCapacityInput): DebtCapacityOutput {
  const {
    annual_noi,
    dscr_target,
    interest_rate,
    term_years,
    property_value,
  } = input;

  const maxAnnualDS = roundCents(annual_noi / dscr_target);
  const maxMonthlyPayment = roundCents(maxAnnualDS / MONTHS_PER_YEAR);

  // Reverse-solve PMT to find max principal
  const monthlyRate = interest_rate / MONTHS_PER_YEAR;
  const totalPayments = term_years * MONTHS_PER_YEAR;

  let maxLoan = 0;
  if (monthlyRate === 0) {
    maxLoan = maxMonthlyPayment * totalPayments;
  } else if (maxMonthlyPayment > 0 && totalPayments > 0) {
    // PMT = P * r * (1+r)^n / ((1+r)^n - 1)
    // P = PMT * ((1+r)^n - 1) / (r * (1+r)^n)
    const factor = dPow(1 + monthlyRate, totalPayments);
    maxLoan = dDiv(maxMonthlyPayment * (factor - 1), monthlyRate * factor);
  }
  maxLoan = roundCents(maxLoan);

  const impliedLTV = property_value && property_value > 0
    ? roundCents((maxLoan / property_value) * 100)
    : null;

  return {
    max_annual_debt_service: maxAnnualDS,
    max_monthly_payment: maxMonthlyPayment,
    max_loan_amount: maxLoan,
    implied_ltv_pct: impliedLTV,
    annual_noi,
    dscr_target,
    interest_rate_pct: roundCents(interest_rate * 100),
    term_years,
    monthly_rate: interest_rate / MONTHS_PER_YEAR,
    total_payments: totalPayments,
  };
}
