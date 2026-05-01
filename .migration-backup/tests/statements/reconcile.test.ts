import { describe, it, expect } from "vitest";
import { reconcile } from "../../statements/reconcile.js";
import type { PostedEntry } from "../../domain/ledger/types.js";
import type {
  PeriodBalanceSheet,
  PeriodCashFlow,
  PeriodIncomeStatement,
} from "../../statements/types.js";
import type { RoundingPolicy } from "../../domain/types/rounding.js";

const rounding: RoundingPolicy = { precision: 2, bankers_rounding: false };

describe("reconcile — all checks pass", () => {
  it("passes for a balanced scenario", () => {
    const entries: PostedEntry[] = [
      {
        period: "2026-06",
        event_id: "evt1",
        account: "CASH",
        debit: 1_000_000,
        credit: 0,
        classification: "BS_ASSET",
        cash_flow_bucket: "FINANCING",
        memo: "",
      },
      {
        period: "2026-06",
        event_id: "evt1",
        account: "EQUITY_CONTRIBUTED",
        debit: 0,
        credit: 1_000_000,
        classification: "BS_EQUITY",
        cash_flow_bucket: "FINANCING",
        memo: "",
      },
    ];

    const is: PeriodIncomeStatement[] = [
      {
        period: "2026-06",
        revenue_accounts: [],
        expense_accounts: [],
        total_revenue: 0,
        total_expenses: 0,
        net_income: 0,
      },
    ];

    const bs: PeriodBalanceSheet[] = [
      {
        period: "2026-06",
        assets: [{ account: "CASH", balance: 1_000_000 }],
        liabilities: [],
        equity: [
          { account: "EQUITY_CONTRIBUTED", balance: 1_000_000 },
          { account: "RETAINED_EARNINGS", balance: 0 },
        ],
        total_assets: 1_000_000,
        total_liabilities: 0,
        total_equity: 1_000_000,
        balanced: true,
      },
    ];

    const cf: PeriodCashFlow[] = [
      {
        period: "2026-06",
        operating: 0,
        investing: 0,
        financing: 1_000_000,
        net_cash_change: 1_000_000,
      },
    ];

    const result = reconcile(entries, is, bs, cf, rounding);
    expect(result.all_passed).toBe(true);
    expect(result.checks.length).toBeGreaterThan(0);
  });
});

describe("reconcile — BS imbalance", () => {
  it("detects A != L + E", () => {
    const entries: PostedEntry[] = [];
    const is: PeriodIncomeStatement[] = [
      {
        period: "2026-06",
        revenue_accounts: [],
        expense_accounts: [],
        total_revenue: 0,
        total_expenses: 0,
        net_income: 0,
      },
    ];
    const bs: PeriodBalanceSheet[] = [
      {
        period: "2026-06",
        assets: [{ account: "CASH", balance: 1_000_000 }],
        liabilities: [],
        equity: [{ account: "EQUITY_CONTRIBUTED", balance: 900_000 }],
        total_assets: 1_000_000,
        total_liabilities: 0,
        total_equity: 900_000,
        balanced: false,
      },
    ];
    const cf: PeriodCashFlow[] = [
      { period: "2026-06", operating: 0, investing: 0, financing: 0, net_cash_change: 0 },
    ];

    const result = reconcile(entries, is, bs, cf, rounding);
    const bsCheck = result.checks.find((c) => c.check === "BS_BALANCE");
    expect(bsCheck!.passed).toBe(false);
    expect(bsCheck!.variance).toBe(100_000);
  });
});

describe("reconcile — CF tie-out failure", () => {
  it("detects net CF != ΔCASH", () => {
    const entries: PostedEntry[] = [
      {
        period: "2026-06",
        event_id: "evt1",
        account: "CASH",
        debit: 1_000_000,
        credit: 0,
        classification: "BS_ASSET",
        cash_flow_bucket: "FINANCING",
        memo: "",
      },
    ];
    const is: PeriodIncomeStatement[] = [
      {
        period: "2026-06",
        revenue_accounts: [],
        expense_accounts: [],
        total_revenue: 0,
        total_expenses: 0,
        net_income: 0,
      },
    ];
    const bs: PeriodBalanceSheet[] = [
      {
        period: "2026-06",
        assets: [{ account: "CASH", balance: 1_000_000 }],
        liabilities: [],
        equity: [{ account: "EQUITY_CONTRIBUTED", balance: 1_000_000 }],
        total_assets: 1_000_000,
        total_liabilities: 0,
        total_equity: 1_000_000,
        balanced: true,
      },
    ];
    // CF says 500K but CASH delta is 1M
    const cf: PeriodCashFlow[] = [
      { period: "2026-06", operating: 0, investing: 0, financing: 500_000, net_cash_change: 500_000 },
    ];

    const result = reconcile(entries, is, bs, cf, rounding);
    const cfCheck = result.checks.find((c) => c.check === "CF_TIEOUT");
    expect(cfCheck!.passed).toBe(false);
  });
});

describe("reconcile — IS to RE", () => {
  it("verifies cumulative net income matches retained earnings", () => {
    const entries: PostedEntry[] = [];
    const is: PeriodIncomeStatement[] = [
      {
        period: "2026-06",
        revenue_accounts: [],
        expense_accounts: [{ account: "INTEREST_EXPENSE", amount: 5000 }],
        total_revenue: 0,
        total_expenses: 5000,
        net_income: -5000,
      },
    ];
    const bs: PeriodBalanceSheet[] = [
      {
        period: "2026-06",
        assets: [],
        liabilities: [],
        equity: [{ account: "RETAINED_EARNINGS", balance: -5000 }],
        total_assets: 0,
        total_liabilities: 0,
        total_equity: -5000,
        balanced: true,
      },
    ];
    const cf: PeriodCashFlow[] = [
      { period: "2026-06", operating: 0, investing: 0, financing: 0, net_cash_change: 0 },
    ];

    const result = reconcile(entries, is, bs, cf, rounding);
    const reCheck = result.checks.find((c) => c.check === "IS_TO_RE");
    expect(reCheck!.passed).toBe(true);
  });
});
