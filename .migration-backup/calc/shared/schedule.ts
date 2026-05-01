/**
 * schedule.ts — Debt Service Schedule Builder
 *
 * Produces a month-by-month loan amortization schedule, which is central to
 * the pro forma model. The schedule shows, for each month of the loan:
 *   - Beginning balance (what you owe at the start of the month)
 *   - Interest payment (balance × monthly rate — this is an income statement expense)
 *   - Principal payment (reduces the loan balance — this is balance sheet only)
 *   - Total payment (interest + principal — this is the actual cash leaving)
 *   - Ending balance (beginning balance - principal)
 *
 * Two-phase structure:
 *   Phase 1 — Interest-Only (IO): During the IO period, you only pay interest.
 *     The loan balance doesn't decrease. Hotels often have IO periods because
 *     they need time to ramp up occupancy before generating enough cash for
 *     full amortizing payments.
 *
 *   Phase 2 — Amortizing: After IO ends, the PMT formula kicks in. The payment
 *     amount stays constant, but each month more goes to principal and less to
 *     interest (because the balance is shrinking, so interest shrinks too).
 *
 * Balloon payment: If amortization_months > term_months (e.g., 30-year amortization
 * on a 10-year term), the loan won't be fully paid off by maturity. The remaining
 * balance is due as a "balloon" payment in the final month. The final month logic
 * handles this by setting principal = remaining balance, which may be a large amount.
 *
 * The rounding policy ensures consistent decimal treatment. The final-month cleanup
 * prevents "rounding dust" — tiny leftover balances like $0.003 that would otherwise
 * appear on financial statements.
 */
import { pmt, ioPayment } from "./pmt.js";
import type { NewLoanTerms, ScheduleEntry } from "./types.js";
import type { RoundingPolicy } from "../../domain/types/rounding.js";
import { roundTo } from "../../domain/types/rounding.js";
import { MONTHS_PER_YEAR } from "../../shared/constants.js";

/**
 * Build a monthly debt service schedule with IO-to-amortization transition.
 *
 * During IO period (month 0 to io_months-1):
 *   payment = balance * monthlyRate, principal = 0
 *
 * After IO period (month io_months to term_months-1):
 *   PMT computed on full loan amount over amortization_months.
 *   If amortization_months > remaining term, a balloon exists at maturity.
 *   Final month: principal = remaining balance (prevents rounding dust).
 */
export function buildSchedule(
  loanAmount: number,
  terms: NewLoanTerms,
  rounding: RoundingPolicy,
): ScheduleEntry[] {
  const schedule: ScheduleEntry[] = [];
  const monthlyRate = terms.rate_annual / MONTHS_PER_YEAR;
  let balance = loanAmount;

  // Amortizing payment based on full loan amount over amortization_months
  const amortPayment = pmt(loanAmount, monthlyRate, terms.amortization_months);

  for (let m = 0; m < terms.term_months; m++) {
    const beginningBalance = roundTo(balance, rounding);
    const isIO = m < terms.io_months;

    let interest: number;
    let principal: number;
    let payment: number;

    let balloon = 0;

    if (m === terms.term_months - 1) {
      interest = roundTo(balance * monthlyRate, rounding);
      const regularPrincipal = isIO ? 0 : roundTo(amortPayment - interest, rounding);
      balloon = roundTo(Math.max(0, balance - Math.max(0, regularPrincipal)), rounding);
      principal = roundTo(balance, rounding);
      payment = roundTo(interest + principal, rounding);
    } else if (isIO) {
      interest = roundTo(ioPayment(balance, monthlyRate), rounding);
      principal = 0;
      payment = interest;
    } else {
      interest = roundTo(balance * monthlyRate, rounding);
      payment = roundTo(amortPayment, rounding);
      principal = roundTo(payment - interest, rounding);
    }

    balance = roundTo(Math.max(0, balance - principal), rounding);

    schedule.push({
      month: m,
      beginning_balance: beginningBalance,
      interest,
      principal,
      payment,
      ending_balance: balance,
      is_io: isIO,
      ...(balloon > 0 ? { balloon } : {}),
    });
  }

  return schedule;
}
