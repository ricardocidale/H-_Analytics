import type { PostedEntry, TrialBalanceEntry } from "../domain/ledger/types.js";

/** Income statement for a single period. */
export interface PeriodIncomeStatement {
  period: string;
  revenue_accounts: { account: string; amount: number }[];
  expense_accounts: { account: string; amount: number }[];
  total_revenue: number;
  total_expenses: number;
  net_income: number;
}

/** Balance sheet for a single period (cumulative snapshot). */
export interface PeriodBalanceSheet {
  period: string;
  assets: { account: string; balance: number }[];
  liabilities: { account: string; balance: number }[];
  equity: { account: string; balance: number }[];
  total_assets: number;
  total_liabilities: number;
  total_equity: number;
  balanced: boolean; // true if A = L + E
}

/** Cash flow statement for a single period. */
export interface PeriodCashFlow {
  period: string;
  operating: number;
  investing: number;
  financing: number;
  net_cash_change: number;
}

/** A single reconciliation check result. */
export interface ReconciliationCheck {
  check: string;
  period: string;
  passed: boolean;
  expected: number;
  actual: number;
  variance: number;
  gaap_ref: string;
}

/** Full reconciliation across all periods. */
export interface ReconciliationResult {
  checks: ReconciliationCheck[];
  all_passed: boolean;
}

/** Complete output from the statement event applier. */
export interface StatementApplierOutput {
  posted_entries: PostedEntry[];
  periods: string[];
  trial_balances: Map<string, TrialBalanceEntry[]>;
  income_statements: PeriodIncomeStatement[];
  balance_sheets: PeriodBalanceSheet[];
  cash_flows: PeriodCashFlow[];
  reconciliation: ReconciliationResult;
  flags: {
    unbalanced_events: string[];
    has_posting_errors: boolean;
  };
}
