/**
 * calc/financing/debt-yield.ts — Debt Yield calculator and reverse loan sizing.
 *
 * PURPOSE:
 * Computes the Debt Yield ratio and reverse-solves for the maximum loan amount
 * supportable by a minimum debt yield threshold. Debt Yield is a lender underwriting
 * metric increasingly used in commercial real estate alongside (or instead of) DSCR.
 *
 * WHAT IS DEBT YIELD?
 *   Debt Yield = Annual NOI / Loan Amount
 *
 * Unlike DSCR, debt yield is independent of interest rate, amortization period,
 * and loan term. This makes it a "structure-neutral" measure of a property's
 * ability to service debt. Lenders typically require a minimum debt yield of
 * 8–10% for stabilized hotel assets.
 *
 * REVERSE SIZING:
 *   Max Loan = NOI / min_debt_yield
 * If both a debt yield constraint and an LTV constraint are provided, the
 * binding constraint (the one producing the smaller loan) wins. This dual-
 * constraint approach mirrors real lender underwriting where the loan is sized
 * to the most restrictive of DSCR, debt yield, and LTV.
 *
 * HOW IT FITS THE SYSTEM:
 * Called from the dispatch layer as the "debt_yield" skill. The output helps
 * investors and lenders understand how much leverage a property can support
 * and which constraint is binding. The `binding_constraint` field makes it
 * easy to explain to stakeholders why a loan was sized the way it was.
 */
import type { RoundingPolicy } from "../../domain/types/rounding.js";
import { roundTo } from "../../domain/types/rounding.js";

export interface DebtYieldInput {
  /** Annual Net Operating Income */
  noi_annual: number;
  /** Loan amount (for computing debt yield) */
  loan_amount?: number;
  /** Minimum acceptable debt yield (e.g. 0.08 = 8%) */
  min_debt_yield?: number;
  /** Purchase price for LTV cross-check */
  purchase_price?: number;
  /** Max LTV for cross-check (e.g. 0.75) */
  ltv_max?: number;
  rounding_policy: RoundingPolicy;
}

export interface DebtYieldOutput {
  /** Debt Yield = NOI / Loan Amount (null if no loan_amount provided) */
  debt_yield: number | null;
  /** Max loan supportable by min debt yield constraint */
  max_loan_debt_yield: number | null;
  /** Max loan supportable by LTV constraint (if provided) */
  max_loan_ltv: number | null;
  /** The binding (lower) constraint */
  binding_constraint: "debt_yield" | "ltv" | "none";
  /** Final max loan (min of debt yield and LTV) */
  max_loan_binding: number | null;
  /** Actual debt yield at binding loan amount */
  actual_debt_yield: number | null;
  /** Implied LTV at binding loan amount */
  implied_ltv: number | null;
  /** Whether the provided loan_amount passes the min debt yield test */
  passes_min_threshold: boolean | null;
}

/**
 * Compute debt yield and reverse-solve for max loan.
 *
 * Debt Yield = NOI / Loan Amount
 * Max Loan (from min debt yield) = NOI / min_debt_yield
 *
 * Debt yield is a lender metric that measures cash flow coverage
 * independent of interest rate, term, or amortization — making it
 * useful for comparing across different financing structures.
 */
export function computeDebtYield(input: DebtYieldInput): DebtYieldOutput {
  if (input.min_debt_yield !== undefined && input.min_debt_yield <= 0) {
    throw new Error("min_debt_yield must be > 0");
  }

  const r = (v: number) => roundTo(v, input.rounding_policy);
  const pct = (v: number) => roundTo(v, { precision: 6, bankers_rounding: false });

  const debtYield = input.loan_amount && input.loan_amount > 0
    ? pct(input.noi_annual / input.loan_amount)
    : null;

  const maxLoanDebtYield = input.min_debt_yield && input.min_debt_yield > 0 && input.noi_annual > 0
    ? r(input.noi_annual / input.min_debt_yield)
    : input.min_debt_yield && input.min_debt_yield > 0 && input.noi_annual <= 0
      ? 0
      : null;

  let maxLoanLTV: number | null = null;
  if (input.purchase_price !== undefined && input.ltv_max !== undefined) {
    maxLoanLTV = r(input.purchase_price * input.ltv_max);
  }

  let bindingConstraint: "debt_yield" | "ltv" | "none";
  let maxLoanBinding: number | null;

  if (maxLoanDebtYield !== null && maxLoanLTV !== null) {
    if (maxLoanDebtYield <= maxLoanLTV) {
      bindingConstraint = "debt_yield";
      maxLoanBinding = maxLoanDebtYield;
    } else {
      bindingConstraint = "ltv";
      maxLoanBinding = maxLoanLTV;
    }
  } else if (maxLoanDebtYield !== null) {
    bindingConstraint = "none";
    maxLoanBinding = maxLoanDebtYield;
  } else {
    bindingConstraint = "none";
    maxLoanBinding = null;
  }

  const actualDebtYield = maxLoanBinding && maxLoanBinding > 0
    ? pct(input.noi_annual / maxLoanBinding)
    : null;

  const impliedLTV = maxLoanBinding !== null && input.purchase_price
    ? pct(maxLoanBinding / input.purchase_price)
    : null;

  let passesMinThreshold: boolean | null = null;
  if (debtYield !== null && input.min_debt_yield !== undefined) {
    passesMinThreshold = debtYield >= input.min_debt_yield;
  }

  return {
    debt_yield: debtYield,
    max_loan_debt_yield: maxLoanDebtYield,
    max_loan_ltv: maxLoanLTV,
    binding_constraint: bindingConstraint,
    max_loan_binding: maxLoanBinding,
    actual_debt_yield: actualDebtYield,
    implied_ltv: impliedLTV,
    passes_min_threshold: passesMinThreshold,
  };
}
