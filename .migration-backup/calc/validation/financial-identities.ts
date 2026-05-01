/**
 * calc/validation/financial-identities.ts — GAAP financial identity validator.
 *
 * PURPOSE:
 * Validates that the three core financial statements (Balance Sheet, Income Statement,
 * Cash Flow Statement) satisfy the fundamental accounting identities required by
 * Generally Accepted Accounting Principles (GAAP). Any violation indicates a bug
 * in the financial engine or a data integrity issue.
 *
 * IDENTITIES CHECKED:
 *
 * 1. BALANCE SHEET EQUATION (ASC 210):
 *    Total Assets = Total Liabilities + Total Equity
 *    This is the foundational double-entry bookkeeping identity. If it fails,
 *    every number downstream is suspect. Severity: CRITICAL.
 *
 * 2. INDIRECT METHOD OPERATING CASH FLOW (ASC 230-10-45):
 *    Operating Cash Flow = Net Income + Depreciation
 *    Depreciation is a non-cash expense that reduces net income but does not
 *    consume cash. Adding it back converts accrual-basis net income to cash-basis
 *    operating cash flow. Severity: MATERIAL.
 *
 * 3. NET INCOME DERIVATION (ASC 220):
 *    Net Income = NOI − Interest Expense − Depreciation − Income Tax
 *    Traces the path from operating performance (NOI) to bottom-line profit.
 *    Severity: MATERIAL.
 *
 * 4. FINANCING CASH FLOW COMPOSITION (ASC 230-10-45-15):
 *    Financing Cash Flow = −Principal Payment + Refinancing Proceeds
 *    Financing activities reflect debt transactions. Interest is operating (not
 *    financing) under the indirect method. Severity: MATERIAL.
 *
 * 5. CASH RECONCILIATION (ASC 230-10-45-24):
 *    Ending Cash = Beginning Cash + Net Cash Change
 *    The cash flow statement must reconcile to the balance sheet's cash position.
 *    Severity: CRITICAL.
 *
 * AUDIT OPINION:
 *   - UNQUALIFIED: All identities hold within tolerance — "clean" opinion.
 *   - QUALIFIED: Minor (non-critical) variances detected — likely rounding.
 *   - ADVERSE: Critical identity failures — the statements are materially misstated.
 *
 * HOW IT FITS THE SYSTEM:
 * Called via the dispatch layer as the "financial_identities" skill. The financial
 * auditor runs this for every property in every projection period. Any ADVERSE
 * opinion triggers a red flag in the verification dashboard.
 */
import type { RoundingPolicy } from "../../domain/types/rounding.js";
import { rounder, withinTolerance, variance, DEFAULT_TOLERANCE } from "../shared/utils.js";

export interface FinancialIdentitiesInput {
  period_label?: string;
  balance_sheet: {
    total_assets: number;
    total_liabilities: number;
    total_equity: number;
  };
  income_statement: {
    revenue?: number;
    total_expenses?: number;
    gop?: number;
    agop?: number;
    noi: number;
    anoi?: number;
    interest_expense: number;
    depreciation: number;
    income_tax: number;
    net_income: number;
  };
  cash_flow_statement: {
    operating_cash_flow: number;
    financing_cash_flow: number;
    net_cash_change?: number;
    beginning_cash?: number;
    ending_cash: number;
    principal_payment?: number;
    refinancing_proceeds?: number;
  };
  tolerance?: number;
  rounding_policy: RoundingPolicy;
}

export interface FinancialIdentitiesOutput {
  all_passed: boolean;
  checks: Array<{
    identity: string;
    formula: string;
    gaap_reference: string;
    expected: number;
    actual: number;
    variance: number;
    passed: boolean;
    severity: "critical" | "material" | "minor";
  }>;
  opinion: "UNQUALIFIED" | "QUALIFIED" | "ADVERSE";
}

interface IdentityCheck {
  identity: string;
  formula: string;
  gaap_reference: string;
  expected: number;
  actual: number;
  variance: number;
  passed: boolean;
  severity: "critical" | "material" | "minor";
}

function makeCheck(
  identity: string, formula: string, gaap_reference: string,
  expected: number, actual: number, tol: number,
  failSeverity: "critical" | "material",
  r: (v: number) => number,
): IdentityCheck {
  const v = r(variance(actual, expected));
  const passed = withinTolerance(actual, expected, tol);
  return { identity, formula, gaap_reference, expected, actual: r(actual), variance: v, passed, severity: passed ? "minor" : failSeverity };
}

export function validateFinancialIdentities(input: FinancialIdentitiesInput): FinancialIdentitiesOutput {
  const r = rounder(input.rounding_policy);
  const tol = input.tolerance ?? DEFAULT_TOLERANCE;
  const bs = input.balance_sheet;
  const is = input.income_statement;
  const cf = input.cash_flow_statement;
  const checks: IdentityCheck[] = [];

  checks.push(makeCheck(
    "Balance Sheet Equation", "Total Assets = Total Liabilities + Total Equity", "ASC 210",
    r(bs.total_liabilities + bs.total_equity), r(bs.total_assets), tol, "critical", r,
  ));

  checks.push(makeCheck(
    "Indirect Method Operating Cash Flow", "OCF = Net Income + Depreciation (non-cash add-back)", "ASC 230-10-45",
    r(is.net_income + is.depreciation), r(cf.operating_cash_flow), tol, "material", r,
  ));

  checks.push(makeCheck(
    "Net Income Derivation", "Net Income = ANOI - Interest Expense - Depreciation - Income Tax", "ASC 220",
    r((is.anoi ?? is.noi) - is.interest_expense - is.depreciation - is.income_tax), r(is.net_income), tol, "material", r,
  ));

  if (cf.principal_payment !== undefined) {
    const refiProceeds = cf.refinancing_proceeds ?? 0;
    checks.push(makeCheck(
      "Financing Cash Flow Composition", "CFF = -Principal Payment + Refinancing Proceeds", "ASC 230-10-45-15",
      r(-cf.principal_payment + refiProceeds), r(cf.financing_cash_flow), tol, "material", r,
    ));
  }

  if (cf.beginning_cash !== undefined && cf.net_cash_change !== undefined) {
    checks.push(makeCheck(
      "Cash Reconciliation", "Ending Cash = Beginning Cash + Net Cash Change", "ASC 230-10-45-24",
      r(cf.beginning_cash + cf.net_cash_change), r(cf.ending_cash), tol, "critical", r,
    ));
  }

  const all_passed = checks.every(c => c.passed);
  const criticalFails = checks.filter(c => !c.passed && c.severity === "critical").length;

  let opinion: "UNQUALIFIED" | "QUALIFIED" | "ADVERSE";
  if (all_passed) opinion = "UNQUALIFIED";
  else if (criticalFails > 0) opinion = "ADVERSE";
  else opinion = "QUALIFIED";

  return { all_passed, checks, opinion };
}
