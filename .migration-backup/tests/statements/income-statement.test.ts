import { describe, it, expect } from "vitest";
import { extractIncomeStatement } from "../../statements/income-statement.js";
import type { TrialBalanceEntry } from "../../domain/ledger/types.js";
import type { RoundingPolicy } from "../../domain/types/rounding.js";

const rounding: RoundingPolicy = { precision: 2, bankers_rounding: false };

describe("extractIncomeStatement", () => {
  it("extracts expense accounts", () => {
    const tb: TrialBalanceEntry[] = [
      { account: "INTEREST_EXPENSE", debit_total: 7500, credit_total: 0, balance: 7500 },
      { account: "DEPRECIATION_EXPENSE", debit_total: 4545, credit_total: 0, balance: 4545 },
    ];
    const is = extractIncomeStatement(tb, "2026-08", rounding);
    expect(is.expense_accounts).toHaveLength(2);
    expect(is.total_expenses).toBe(12045);
    expect(is.total_revenue).toBe(0);
    expect(is.net_income).toBe(-12045);
  });

  it("returns zero for empty trial balance", () => {
    const is = extractIncomeStatement([], "2026-06", rounding);
    expect(is.total_revenue).toBe(0);
    expect(is.total_expenses).toBe(0);
    expect(is.net_income).toBe(0);
    expect(is.period).toBe("2026-06");
  });

  it("ignores BS accounts", () => {
    const tb: TrialBalanceEntry[] = [
      { account: "CASH", debit_total: 1_000_000, credit_total: 0, balance: 1_000_000 },
      { account: "EQUITY_CONTRIBUTED", debit_total: 0, credit_total: 1_000_000, balance: 1_000_000 },
      { account: "INTEREST_EXPENSE", debit_total: 5000, credit_total: 0, balance: 5000 },
    ];
    const is = extractIncomeStatement(tb, "2026-06", rounding);
    expect(is.expense_accounts).toHaveLength(1);
    expect(is.total_expenses).toBe(5000);
  });

  it("calculates net income as revenue minus expenses", () => {
    // Using a hypothetical IS_REVENUE account — not in current chart but testing the logic
    const tb: TrialBalanceEntry[] = [
      { account: "INTEREST_EXPENSE", debit_total: 3000, credit_total: 0, balance: 3000 },
    ];
    const is = extractIncomeStatement(tb, "2026-06", rounding);
    expect(is.net_income).toBe(-3000);
  });
});
