/**
 * pmt.ts — Loan Payment Calculation (PMT Function)
 *
 * Implements the standard fixed-rate mortgage payment formula, identical to
 * Excel's PMT() function. This is the foundational formula for all debt
 * service calculations in the financial model.
 *
 * The formula: PMT = P × r × (1+r)^n / ((1+r)^n - 1)
 *   where P = principal (loan amount), r = monthly interest rate, n = number of payments
 *
 * This produces a constant monthly payment that covers both interest and principal.
 * Early payments are mostly interest; later payments are mostly principal. This is
 * called "amortization" — the loan balance gradually reduces to zero by the end.
 *
 * Edge cases handled:
 *   - Zero interest rate: Payment = principal ÷ number of payments (simple division)
 *   - Zero principal or zero payments: Returns 0
 *
 * Also exports ioPayment() for interest-only periods where the borrower pays
 * only the interest each month and the principal balance stays unchanged.
 *
 * @param principal  Loan amount (e.g., $2,000,000)
 * @param monthlyRate  Monthly interest rate (annual / 12, e.g., 0.065/12 = 0.005417)
 * @param totalPayments  Number of amortizing payments (e.g., 360 for a 30-year loan)
 * @returns Monthly payment amount (e.g., $12,653.74)
 */
import { dPow, dMul, dDiv } from "./decimal.js";

export function pmt(
  principal: number,
  monthlyRate: number,
  totalPayments: number,
): number {
  if (principal === 0 || totalPayments === 0) return 0;
  if (Math.abs(monthlyRate) < 1e-10) return dDiv(principal, totalPayments);
  // Cap rate to prevent exponentiation overflow (50% annual = ~4.17% monthly)
  const safeRate = Math.min(monthlyRate, 0.05);
  const factor = dPow(1 + safeRate, totalPayments);
  // Guard against Infinity from extreme exponentiation
  if (!Number.isFinite(factor) || factor <= 1) return principal * safeRate; // interest-only fallback
  const payment = dDiv(dMul(principal, dMul(safeRate, factor)), factor - 1);
  return Number.isFinite(payment) ? payment : principal * safeRate;
}

/**
 * Interest-only payment for a given balance and monthly rate.
 */
export function ioPayment(
  balance: number,
  monthlyRate: number,
): number {
  return balance * monthlyRate;
}
