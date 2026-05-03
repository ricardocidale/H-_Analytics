/**
 * types.ts — Shared Type Definitions for the Calculation Engine
 *
 * Defines the data structures used across the calc/ directory, particularly
 * for debt service calculations (loan terms and amortization schedules).
 *
 * These types are used by both the original loan schedule and the refinance calculator,
 * ensuring consistent structure across the codebase.
 */

export interface NewLoanTerms {
  /** Annual interest rate as decimal (e.g. 0.07 = 7%) */
  rate_annual: number;
  /** Total loan term in months */
  term_months: number;
  /** Amortization schedule length in months */
  amortization_months: number;
  /** Interest-only period at start (0 = fully amortizing from day 1) */
  io_months: number;
}

export interface ScheduleEntry {
  /** 0-indexed month from loan origination */
  month: number;
  beginning_balance: number;
  interest: number;
  principal: number;
  /** interest + principal */
  payment: number;
  ending_balance: number;
  is_io: boolean;
  /** Balloon payment at maturity (non-zero only in the final month when amort > term) */
  balloon?: number;
}
