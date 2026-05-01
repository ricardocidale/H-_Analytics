/**
 * calc/refinance/types.ts — TypeScript type definitions for the Refinance Calculator.
 *
 * PURPOSE:
 * Defines every input, output, and intermediate type used by the refinance
 * calculation skill. Refinancing replaces an existing (acquisition) loan with a
 * new loan, typically to extract equity, secure a lower rate, or reset the
 * amortization schedule. This module captures all the data needed to model that
 * transaction, including prepayment penalties, DSCR-based sizing, and the
 * resulting journal entries.
 *
 * HOW IT FITS THE SYSTEM:
 * The refinance calculator (`calc/refinance/refinance-calculator.ts`) imports
 * these types. It is invoked by the financial engine when a property's timeline
 * includes a refinance event. The outputs feed into the property's debt service
 * schedule, cash flow statement, and balance sheet.
 *
 * KEY FINANCIAL CONCEPTS:
 *
 * Prepayment Penalty — a fee charged by the lender for paying off a loan early.
 *   Three common structures in commercial real estate:
 *   - "none": No penalty (rare in fixed-rate CRE loans).
 *   - "pct_of_balance": A flat percentage of the outstanding principal (e.g., 2%).
 *   - "fixed": A fixed dollar amount regardless of balance.
 *
 * Property Valuation — determines the maximum new loan size via LTV. Two paths:
 *   - "direct": The borrower provides an appraised or agreed-upon value.
 *   - "noi_cap": Value = Stabilized NOI / Cap Rate. This is the income approach
 *     to valuation, the most common method in hospitality.
 *
 * LTV (Loan-to-Value) — New Loan Amount / Property Value. Lenders cap this
 *   (e.g., 65–75%) to maintain a cushion against value declines.
 *
 * DSCR Binding — If NOI is insufficient to cover debt service at the LTV-implied
 *   loan amount (DSCR < minimum, typically 1.25×), the loan is sized down to
 *   the DSCR-constrained maximum instead. The `dscr_binding` flag indicates this.
 *
 * Cash-Out to Equity — After paying off the old loan, prepayment penalty,
 *   accrued interest, and new closing costs, any remaining proceeds go to the
 *   equity holders. If negative, the borrower must contribute additional equity.
 *
 * Journal Hooks — Double-entry accounting entries (JournalDelta[]) generated at
 *   refinance to keep the balance sheet in balance: derecognize old debt, record
 *   new debt, book closing costs, and distribute cash-out proceeds.
 *   (See ASC 470-50 for debt modification/extinguishment guidance.)
 */
import type { AccountingPolicy } from "../../domain/types/accounting-policy.js";
import type { RoundingPolicy } from "../../domain/types/rounding.js";
import type { JournalDelta } from "../../domain/types/journal-delta.js";

// Re-export shared types used by refinance
export type { NewLoanTerms, ScheduleEntry } from "../shared/types.js";
import type { NewLoanTerms, ScheduleEntry } from "../shared/types.js";

// --- Input types ---

export type PrepaymentPenaltyType = "none" | "pct_of_balance" | "fixed";

export interface PrepaymentPenalty {
  type: PrepaymentPenaltyType;
  /** Percentage (0.02 = 2%) if pct_of_balance; dollar amount if fixed; ignored if none */
  value: number;
}

/** Mutually exclusive valuation input: provide exactly one path */
export type PropertyValuation =
  | { method: "direct"; property_value_at_refi: number }
  | { method: "noi_cap"; stabilized_noi: number; cap_rate: number };

export interface RefinanceInput {
  refinance_date: string;
  current_loan_balance: number;
  valuation: PropertyValuation;
  ltv_max: number;
  closing_cost_pct: number;
  prepayment_penalty: PrepaymentPenalty;
  accrued_interest_to_payoff?: number;
  dscr_min?: number;
  noi_for_dscr?: number;
  new_loan_terms: NewLoanTerms;
  accounting_policy_ref: AccountingPolicy;
  rounding_policy: RoundingPolicy;
}

// --- Output types ---

export interface ProceedsLineItem {
  label: string;
  amount: number;
}

export interface RefinanceFlags {
  /** DSCR constraint reduced loan below LTV max */
  dscr_binding: boolean;
  /** LTV was the binding constraint */
  ltv_binding: boolean;
  /** Net proceeds < payoff (no cash to equity) */
  negative_cash_out: boolean;
  /** Validation error messages (empty = valid) */
  invalid_inputs: string[];
}

export interface RefinanceOutput {
  new_loan_amount_gross: number;
  new_loan_amount_net: number;
  payoff_total: number;
  payoff_breakdown: {
    old_loan_balance: number;
    prepayment_penalty: number;
    accrued_interest: number;
  };
  cash_out_to_equity: number;
  cash_in_required: number;
  proceeds_breakdown: ProceedsLineItem[];
  new_debt_service_schedule: ScheduleEntry[];
  journal_hooks: JournalDelta[];
  flags: RefinanceFlags;
}
