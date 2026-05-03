/**
 * amortization.ts — Generic loan amortization helpers (ASC 470)
 *
 * Pure functions with no side effects. Used by loanCalculations.ts to
 * eliminate duplication between acquisition loan and refinance loan math.
 */
import { dPow, dDiv } from '@calc/shared/decimal.js';

/**
 * Outstanding principal balance using the present-value-of-annuity formula.
 *
 * Formula: Balance = PMT × [1 − (1+r)^(−remaining)] / r
 * Zero-rate edge case: straight-line principal reduction.
 *
 * @param payment       Fixed monthly payment (PMT)
 * @param rate          Monthly interest rate
 * @param monthsPaid    Number of payments already made
 * @param totalPayments Full amortization term in months
 * @param initialBalance Original loan principal
 */
export function outstandingBalance(
  payment: number,
  rate: number,
  monthsPaid: number,
  totalPayments: number,
  initialBalance: number
): number {
  if (monthsPaid <= 0) return initialBalance;
  const remaining = totalPayments - monthsPaid;
  if (remaining <= 0) return 0;
  if (Math.abs(rate) < 1e-10) return initialBalance - payment * monthsPaid;
  return dDiv(payment * (1 - dPow(1 + rate, -remaining)), rate);
}

/**
 * Debt service for a contiguous block of months.
 *
 * Fast-forwards `skipMonths` payments from `startBalance` to reach the
 * beginning of the target period, then accumulates interest and principal
 * for `monthsInPeriod` months.
 *
 * @param payment       Fixed monthly payment (PMT)
 * @param rate          Monthly interest rate
 * @param skipMonths    Payments to fast-forward before the period starts
 * @param monthsInPeriod Payments to accumulate (the "target year" slice)
 * @param startBalance  Loan principal at month 0 (before any payments)
 */
export function debtServiceForPeriod(
  payment: number,
  rate: number,
  skipMonths: number,
  monthsInPeriod: number,
  startBalance: number
): { interest: number; principal: number; endingBalance: number } {
  let balance = startBalance;

  // Fast-forward to the start of the target period
  for (let i = 0; i < skipMonths; i++) {
    const interest = balance * rate;
    const principal = payment - interest;
    balance = Math.max(0, balance - principal);
  }

  // Accumulate the target period
  let interest = 0;
  let principal = 0;
  for (let m = 0; m < monthsInPeriod; m++) {
    const monthlyInterest = balance * rate;
    const monthlyPrincipal = payment - monthlyInterest;
    interest += monthlyInterest;
    principal += monthlyPrincipal;
    balance = Math.max(0, balance - monthlyPrincipal);
  }

  return { interest, principal, endingBalance: balance };
}
