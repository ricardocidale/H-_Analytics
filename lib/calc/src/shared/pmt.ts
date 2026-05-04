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
 *   - Monthly rate > 5% (60% annual): throws RangeError — call sites must validate inputs.
 *     Hospitality acquisition and refi loans are always conventional rates (< 20% annual).
 *     Bridge loans can be higher but never legitimately exceed 60% annual. Silently capping
 *     the rate produced wrong PMT values without any indication to the caller.
 *
 * Also exports ioPayment() for interest-only periods where the borrower pays
 * only the interest each month and the principal balance stays unchanged.
 *
 * @param principal  Loan amount (e.g., $2,000,000)
 * @param monthlyRate  Monthly interest rate (annual / 12, e.g., 0.065/12 = 0.005417)
 * @param totalPayments  Number of amortizing payments (e.g., 360 for a 30-year loan)
 * @returns Monthly payment amount (e.g., $12,653.74)
 * @throws RangeError if monthlyRate > 0.05 (60% annual) — caller must validate inputs
 */
import { dPow, dMul, dDiv } from "./decimal.js";

// Maximum monthly interest rate accepted by pmt().
// 5% per month = 60% annual — well above any legitimate hospitality loan.
// Rates above this threshold indicate a data entry error or unit mismatch (e.g.,
// annual rate passed as monthly). Throw rather than silently cap or produce wrong output.
const MAX_MONTHLY_RATE = 0.05;

export function pmt(
  principal: number,
  monthlyRate: number,
  totalPayments: number,
): number {
  if (principal === 0 || totalPayments === 0) return 0;
  if (Math.abs(monthlyRate) < 1e-10) return dDiv(principal, totalPayments);
  if (monthlyRate > MAX_MONTHLY_RATE) {
    throw new RangeError(
      `pmt(): monthlyRate ${monthlyRate.toFixed(6)} exceeds maximum ${MAX_MONTHLY_RATE} ` +
      `(${(monthlyRate * 12 * 100).toFixed(1)}% annual). ` +
      `Pass the annual rate divided by 12 — e.g., 0.065 / 12 for a 6.5% loan.`,
    );
  }
  const factor = dPow(1 + monthlyRate, totalPayments);
  // Guard against Infinity from extreme exponentiation (should not happen within validated range)
  if (!Number.isFinite(factor) || factor <= 1) return principal * monthlyRate; // interest-only fallback
  const payment = dDiv(dMul(principal, dMul(monthlyRate, factor)), factor - 1);
  return Number.isFinite(payment) ? payment : principal * monthlyRate;
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
