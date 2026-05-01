/**
 * calc/financing/types.ts — TypeScript type definitions for the Acquisition Financing Calculator.
 *
 * PURPOSE:
 * Defines the input, output, and intermediate types for computing acquisition-time
 * loan sizing, closing costs, equity requirements, and debt service schedules.
 * These types are the contract between the financing calculator, the dispatch layer,
 * and the financial engine.
 *
 * HOW IT FITS THE SYSTEM:
 * `FinancingInput` is the payload sent to `computeFinancing()`. The function returns
 * `FinancingOutput`, which the financial engine consumes to:
 *   1. Populate the debt service rows on the property's cash flow statement.
 *   2. Record the initial journal entries (loan origination, equity contribution,
 *      closing cost capitalization) on the balance sheet.
 *   3. Determine how much equity the investor must contribute at closing.
 *
 * KEY FINANCIAL CONCEPTS:
 *
 * LoanType — Two standard commercial real estate loan structures:
 *   - "amortizing": Every payment includes both interest and principal from month 1.
 *   - "IO_then_amortizing": An initial interest-only (IO) period where payments
 *     are interest only, followed by fully amortizing payments. Common in
 *     transitional or value-add hospitality deals where NOI ramps over time.
 *
 * LTV (Loan-to-Value) — loan_amount / purchase_price. Lenders cap this ratio
 *   (typically 65–80% for hotels) to protect against value declines. If `ltv_max`
 *   is the binding constraint, `flags.ltv_binding = true`.
 *
 * Closing Costs — Fees paid at loan origination. Modeled as a percentage of the
 *   loan amount (`closing_cost_pct`, e.g., 2%) plus optional fixed fees. Under
 *   GAAP (ASC 310-20), these are typically capitalized (deferred) and amortized
 *   over the loan term, not expensed immediately.
 *
 * Equity Required — The cash the investor must bring to close:
 *   equity = purchase_price + closing_costs + upfront_reserves - net_loan_proceeds.
 *   This is the "check size" that determines IRR denominators.
 *
 * Journal Hooks — Double-entry accounting entries (JournalDelta[]) produced at
 *   loan origination. They ensure the balance sheet equation (A = L + E) holds
 *   from day one. See ASC 470 for debt recognition guidance.
 *
 * FinancingFlags — Diagnostic booleans indicating which constraint sized the loan
 *   and whether any validation errors were detected.
 */
import type { AccountingPolicy } from "../../domain/types/accounting-policy.js";
import type { RoundingPolicy } from "../../domain/types/rounding.js";
import type { JournalDelta } from "../../domain/types/journal-delta.js";
import type { ScheduleEntry } from "../shared/types.js";

// Re-export shared types used by financing
export type { NewLoanTerms, ScheduleEntry } from "../shared/types.js";

// --- Input types ---

export type LoanType = "amortizing" | "IO_then_amortizing";

export interface FinancingInput {
  /** Purchase/acquisition date (YYYY-MM or ISO date) */
  purchase_date: string;
  purchase_price: number;
  loan_type: LoanType;
  /** Annual interest rate as decimal (e.g. 0.09 = 9%) */
  interest_rate_annual: number;
  /** Total loan term in months */
  term_months: number;
  /** Amortization schedule length in months */
  amortization_months: number;
  /** Loan-to-value ratio (e.g. 0.75); mutually exclusive with loan_amount_override */
  ltv_max?: number;
  /** Exact loan amount; mutually exclusive with ltv_max */
  loan_amount_override?: number;
  /** Closing costs as % of loan amount (e.g. 0.02 = 2%) */
  closing_cost_pct: number;
  /** Additional fixed closing fees in dollars */
  fixed_fees?: number;
  /** Upfront reserves funded at close */
  upfront_reserves?: number;
  accounting_policy_ref: AccountingPolicy;
  rounding_policy: RoundingPolicy;
}

// --- Output types ---

export interface ClosingCostBreakdown {
  /** loan_amount * closing_cost_pct */
  pct_based: number;
  /** Additional fixed fees */
  fixed_fees: number;
  total: number;
}

export interface FinancingFlags {
  /** LTV determined loan size */
  ltv_binding: boolean;
  /** loan_amount_override used instead of LTV */
  override_binding: boolean;
  /** Validation error messages (empty = valid) */
  invalid_inputs: string[];
}

export interface FinancingOutput {
  /** Sized loan amount (before closing costs) */
  loan_amount_gross: number;
  /** Gross minus closing costs */
  loan_amount_net: number;
  closing_costs: ClosingCostBreakdown;
  /** purchase_price + closing_costs + reserves - loan_amount_net */
  equity_required: number;
  /** Net loan proceeds to borrower */
  initial_cash_in: number;
  upfront_reserves: number;
  debt_service_schedule: ScheduleEntry[];
  journal_hooks: JournalDelta[];
  flags: FinancingFlags;
}
