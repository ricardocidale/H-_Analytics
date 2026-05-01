import type { TrialBalanceEntry } from "../domain/ledger/types.js";
import { getAccount } from "../domain/ledger/accounts.js";
import type { RoundingPolicy } from "../domain/types/rounding.js";
import { roundTo } from "../domain/types/rounding.js";
import type { PeriodIncomeStatement } from "./types.js";

/**
 * Extract income statement from a trial balance for a single period.
 * IS accounts: IS_REVENUE (credit normal) and IS_EXPENSE (debit normal).
 * Net Income = Total Revenue - Total Expenses.
 */
export function extractIncomeStatement(
  trialBalance: TrialBalanceEntry[],
  period: string,
  rounding: RoundingPolicy,
): PeriodIncomeStatement {
  const r = (v: number) => roundTo(v, rounding);

  const revenue_accounts: { account: string; amount: number }[] = [];
  const expense_accounts: { account: string; amount: number }[] = [];

  for (const tb of trialBalance) {
    const acctDef = getAccount(tb.account);
    if (!acctDef) continue;

    if (acctDef.classification.startsWith("IS_REVENUE")) {
      revenue_accounts.push({ account: tb.account, amount: r(tb.balance) });
    } else if (acctDef.classification === "IS_EXPENSE") {
      expense_accounts.push({ account: tb.account, amount: r(tb.balance) });
    }
  }

  const total_revenue = r(
    revenue_accounts.reduce((sum, a) => sum + a.amount, 0),
  );
  const total_expenses = r(
    expense_accounts.reduce((sum, a) => sum + a.amount, 0),
  );
  const net_income = r(total_revenue - total_expenses);

  return {
    period,
    revenue_accounts,
    expense_accounts,
    total_revenue,
    total_expenses,
    net_income,
  };
}
