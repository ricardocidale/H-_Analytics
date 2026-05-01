import { describe, it, expect } from "vitest";
import { computeFCF, extractWorkingCapitalChanges } from "../../analytics/fcf/compute-fcf.js";
import type { PostedEntry } from "../../domain/ledger/types.js";
import type { PeriodIncomeStatement, PeriodCashFlow } from "../../statements/types.js";
import type { RoundingPolicy } from "../../domain/types/rounding.js";

const rounding: RoundingPolicy = { precision: 2, bankers_rounding: false };

function makeEntry(overrides: Partial<PostedEntry>): PostedEntry {
  return {
    period: "2026-06",
    event_id: "evt1",
    account: "CASH",
    debit: 0,
    credit: 0,
    classification: "BS_ASSET",
    cash_flow_bucket: "FINANCING",
    memo: "",
    ...overrides,
  };
}

describe("computeFCF — basic funding event", () => {
  it("computes FCFE for a funding event (no IS activity)", () => {
    const entries: PostedEntry[] = [
      makeEntry({ account: "CASH", debit: 1_000_000, credit: 0, cash_flow_bucket: "FINANCING" }),
      makeEntry({ account: "EQUITY_CONTRIBUTED", debit: 0, credit: 1_000_000, classification: "BS_EQUITY", cash_flow_bucket: "FINANCING" }),
    ];
    const is: PeriodIncomeStatement[] = [{
      period: "2026-06",
      revenue_accounts: [],
      expense_accounts: [],
      total_revenue: 0,
      total_expenses: 0,
      net_income: 0,
    }];
    const cf: PeriodCashFlow[] = [{
      period: "2026-06",
      operating: 0,
      investing: 0,
      financing: 1_000_000,
      net_cash_change: 1_000_000,
    }];

    const result = computeFCF({ income_statements: is, cash_flows: cf, posted_entries: entries }, rounding);
    expect(result.consolidated.entries).toHaveLength(1);
    const entry = result.consolidated.entries[0];
    // No IS activity → FCFF = FCFE = 0 (funding is equity, not operating)
    expect(entry.fcff).toBe(0);
    // FCFE = FCFF - interest + net borrowing = 0 - 0 + 0 = 0
    // (equity contribution is not net borrowing)
    expect(entry.fcfe).toBe(0);
  });
});

describe("computeFCF — debt service event", () => {
  it("computes FCFE for interest + principal payment", () => {
    const entries: PostedEntry[] = [
      makeEntry({ period: "2026-08", account: "INTEREST_EXPENSE", debit: 7500, credit: 0, classification: "IS_EXPENSE", cash_flow_bucket: "OPERATING" }),
      makeEntry({ period: "2026-08", account: "CASH", debit: 0, credit: 7500, cash_flow_bucket: "OPERATING" }),
      makeEntry({ period: "2026-08", account: "DEBT_ACQUISITION", debit: 2500, credit: 0, classification: "BS_LIABILITY", cash_flow_bucket: "FINANCING" }),
      makeEntry({ period: "2026-08", account: "CASH", debit: 0, credit: 2500, cash_flow_bucket: "FINANCING" }),
    ];
    const is: PeriodIncomeStatement[] = [{
      period: "2026-08",
      revenue_accounts: [],
      expense_accounts: [{ account: "INTEREST_EXPENSE", amount: 7500 }],
      total_revenue: 0,
      total_expenses: 7500,
      net_income: -7500,
    }];
    const cf: PeriodCashFlow[] = [{
      period: "2026-08",
      operating: -7500,
      investing: 0,
      financing: -2500,
      net_cash_change: -10000,
    }];

    const result = computeFCF({ income_statements: is, cash_flows: cf, posted_entries: entries }, rounding);
    const entry = result.consolidated.entries[0];

    // NI = -7500, Interest = 7500, CapEx = 0, Net Borrowing = -2500
    // FCFF = NI + Interest - CapEx = -7500 + 7500 = 0
    expect(entry.fcff).toBe(0);
    // FCFE = FCFF - Interest + Net Borrowing = 0 - 7500 + (-2500) = -10000
    expect(entry.fcfe).toBe(-10_000);
  });
});

describe("computeFCF — acquisition event", () => {
  it("identifies capex from property purchase", () => {
    const entries: PostedEntry[] = [
      makeEntry({ period: "2026-07", account: "PROPERTY", debit: 1_500_000, credit: 0, classification: "BS_ASSET", cash_flow_bucket: "INVESTING" }),
      makeEntry({ period: "2026-07", account: "DEBT_ACQUISITION", debit: 0, credit: 1_000_000, classification: "BS_LIABILITY", cash_flow_bucket: "FINANCING" }),
      makeEntry({ period: "2026-07", account: "EQUITY_CONTRIBUTED", debit: 0, credit: 500_000, classification: "BS_EQUITY", cash_flow_bucket: "FINANCING" }),
    ];
    const is: PeriodIncomeStatement[] = [{
      period: "2026-07",
      revenue_accounts: [],
      expense_accounts: [],
      total_revenue: 0,
      total_expenses: 0,
      net_income: 0,
    }];
    const cf: PeriodCashFlow[] = [{
      period: "2026-07",
      operating: 0,
      investing: 0,
      financing: 0,
      net_cash_change: 0,
    }];

    const result = computeFCF({ income_statements: is, cash_flows: cf, posted_entries: entries }, rounding);
    const entry = result.consolidated.entries[0];

    // CapEx = PROPERTY debit = 1,500,000
    expect(entry.capex).toBe(1_500_000);
    // Net borrowing = DEBT credit = 1,000,000
    expect(entry.net_borrowing).toBe(1_000_000);
    // FCFF = NI + Interest - CapEx = 0 + 0 - 1,500,000 = -1,500,000
    expect(entry.fcff).toBe(-1_500_000);
    // FCFE = FCFF - Interest + Net Borrowing = -1,500,000 + 1,000,000 = -500,000
    expect(entry.fcfe).toBe(-500_000);
  });
});

describe("computeFCF — totals", () => {
  it("sums totals across periods", () => {
    const entries: PostedEntry[] = [
      // Period 1: funding
      makeEntry({ period: "2026-06", account: "CASH", debit: 1_000_000, cash_flow_bucket: "FINANCING" }),
      makeEntry({ period: "2026-06", account: "EQUITY_CONTRIBUTED", debit: 0, credit: 1_000_000, classification: "BS_EQUITY", cash_flow_bucket: "FINANCING" }),
      // Period 2: interest payment
      makeEntry({ period: "2026-07", account: "INTEREST_EXPENSE", debit: 5000, classification: "IS_EXPENSE", cash_flow_bucket: "OPERATING" }),
      makeEntry({ period: "2026-07", account: "CASH", debit: 0, credit: 5000, cash_flow_bucket: "OPERATING" }),
    ];
    const is: PeriodIncomeStatement[] = [
      { period: "2026-06", revenue_accounts: [], expense_accounts: [], total_revenue: 0, total_expenses: 0, net_income: 0 },
      { period: "2026-07", revenue_accounts: [], expense_accounts: [{ account: "INTEREST_EXPENSE", amount: 5000 }], total_revenue: 0, total_expenses: 5000, net_income: -5000 },
    ];
    const cf: PeriodCashFlow[] = [
      { period: "2026-06", operating: 0, investing: 0, financing: 1_000_000, net_cash_change: 1_000_000 },
      { period: "2026-07", operating: -5000, investing: 0, financing: 0, net_cash_change: -5000 },
    ];

    const result = computeFCF({ income_statements: is, cash_flows: cf, posted_entries: entries }, rounding);
    expect(result.consolidated.entries).toHaveLength(2);
    // Total FCFF = 0 + (-5000 + 5000) = 0
    expect(result.consolidated.total_fcff).toBe(0);
    // Total FCFE = 0 + (-5000 + 5000 - 5000) = -5000
    expect(result.consolidated.total_fcfe).toBe(-5000);
  });
});

describe("computeFCF — empty input", () => {
  it("returns empty for no data", () => {
    const result = computeFCF(
      { income_statements: [], cash_flows: [], posted_entries: [] },
      rounding,
    );
    expect(result.consolidated.entries).toHaveLength(0);
    expect(result.consolidated.total_fcff).toBe(0);
    expect(result.consolidated.total_fcfe).toBe(0);
  });
});

describe("computeFCF — working capital integration", () => {
  it("positive WC change (growing revenue) reduces FCFF and FCFE", () => {
    const entries: PostedEntry[] = [
      makeEntry({ period: "2026-06", account: "DEPRECIATION_EXPENSE", debit: 10000, classification: "IS_EXPENSE", cash_flow_bucket: "OPERATING" }),
      makeEntry({ period: "2026-06", account: "CASH", debit: 0, credit: 10000, cash_flow_bucket: "OPERATING" }),
    ];
    const is: PeriodIncomeStatement[] = [{
      period: "2026-06",
      revenue_accounts: [{ account: "ROOM_REVENUE", amount: 50000 }],
      expense_accounts: [{ account: "DEPRECIATION_EXPENSE", amount: 10000 }],
      total_revenue: 50000,
      total_expenses: 10000,
      net_income: 40000,
    }];
    const cf: PeriodCashFlow[] = [{
      period: "2026-06",
      operating: 40000,
      investing: 0,
      financing: 0,
      net_cash_change: 40000,
    }];

    const withoutWC = computeFCF({ income_statements: is, cash_flows: cf, posted_entries: entries }, rounding);
    const withWC = computeFCF({
      income_statements: is,
      cash_flows: cf,
      posted_entries: entries,
      working_capital_changes: { "2026-06": 5000 },
    }, rounding);

    expect(withWC.consolidated.entries[0].working_capital_change).toBe(5000);
    expect(withWC.consolidated.entries[0].fcff).toBe(withoutWC.consolidated.entries[0].fcff - 5000);
    expect(withWC.consolidated.entries[0].fcfe).toBe(withoutWC.consolidated.entries[0].fcfe - 5000);
  });

  it("negative WC change (declining revenue) increases FCFF and FCFE", () => {
    const entries: PostedEntry[] = [
      makeEntry({ period: "2026-09", account: "DEPRECIATION_EXPENSE", debit: 8000, classification: "IS_EXPENSE", cash_flow_bucket: "OPERATING" }),
      makeEntry({ period: "2026-09", account: "CASH", debit: 0, credit: 8000, cash_flow_bucket: "OPERATING" }),
    ];
    const is: PeriodIncomeStatement[] = [{
      period: "2026-09",
      revenue_accounts: [{ account: "ROOM_REVENUE", amount: 30000 }],
      expense_accounts: [{ account: "DEPRECIATION_EXPENSE", amount: 8000 }],
      total_revenue: 30000,
      total_expenses: 8000,
      net_income: 22000,
    }];
    const cf: PeriodCashFlow[] = [{
      period: "2026-09",
      operating: 22000,
      investing: 0,
      financing: 0,
      net_cash_change: 22000,
    }];

    const withoutWC = computeFCF({ income_statements: is, cash_flows: cf, posted_entries: entries }, rounding);
    const withWC = computeFCF({
      income_statements: is,
      cash_flows: cf,
      posted_entries: entries,
      working_capital_changes: { "2026-09": -3000 },
    }, rounding);

    expect(withWC.consolidated.entries[0].working_capital_change).toBe(-3000);
    expect(withWC.consolidated.entries[0].fcff).toBe(withoutWC.consolidated.entries[0].fcff + 3000);
    expect(withWC.consolidated.entries[0].fcfe).toBe(withoutWC.consolidated.entries[0].fcfe + 3000);
  });

  it("WC change defaults to 0 when not provided", () => {
    const is: PeriodIncomeStatement[] = [{
      period: "2026-06",
      revenue_accounts: [],
      expense_accounts: [],
      total_revenue: 0,
      total_expenses: 0,
      net_income: 0,
    }];
    const result = computeFCF({
      income_statements: is,
      cash_flows: [{ period: "2026-06", operating: 0, investing: 0, financing: 0, net_cash_change: 0 }],
      posted_entries: [],
    }, rounding);
    expect(result.consolidated.entries[0].working_capital_change).toBe(0);
  });

  it("multi-period WC changes accumulate in totals", () => {
    const entries: PostedEntry[] = [];
    const is: PeriodIncomeStatement[] = [
      { period: "2026-06", revenue_accounts: [], expense_accounts: [], total_revenue: 10000, total_expenses: 0, net_income: 10000 },
      { period: "2026-07", revenue_accounts: [], expense_accounts: [], total_revenue: 8000, total_expenses: 0, net_income: 8000 },
    ];
    const cf: PeriodCashFlow[] = [
      { period: "2026-06", operating: 10000, investing: 0, financing: 0, net_cash_change: 10000 },
      { period: "2026-07", operating: 8000, investing: 0, financing: 0, net_cash_change: 8000 },
    ];

    const result = computeFCF({
      income_statements: is,
      cash_flows: cf,
      posted_entries: entries,
      working_capital_changes: { "2026-06": 2000, "2026-07": -1000 },
    }, rounding);

    expect(result.consolidated.entries[0].fcff).toBe(10000 - 2000);
    expect(result.consolidated.entries[1].fcff).toBe(8000 + 1000);
    expect(result.consolidated.total_fcff).toBe(8000 + 9000);
  });
});

describe("extractWorkingCapitalChanges — engine-to-FCF bridge", () => {
  it("extracts per-period WC changes from engine monthly data", () => {
    const monthlyData = [
      { period: "2026-06", workingCapitalChange: 1500 },
      { period: "2026-07", workingCapitalChange: -800 },
      { period: "2026-08", workingCapitalChange: 200 },
    ];
    const wc = extractWorkingCapitalChanges(monthlyData);
    expect(wc).toEqual({ "2026-06": 1500, "2026-07": -800, "2026-08": 200 });
  });

  it("aggregates multiple entries for the same period", () => {
    const monthlyData = [
      { period: "2026-06", workingCapitalChange: 500 },
      { period: "2026-06", workingCapitalChange: 300 },
    ];
    const wc = extractWorkingCapitalChanges(monthlyData);
    expect(wc["2026-06"]).toBe(800);
  });

  it("skips entries without a period", () => {
    const monthlyData: Array<{ period?: string; workingCapitalChange: number }> = [
      { period: undefined, workingCapitalChange: 1000 },
      { period: "2026-06", workingCapitalChange: 500 },
    ];
    const wc = extractWorkingCapitalChanges(monthlyData);
    expect(wc).toEqual({ "2026-06": 500 });
  });

  it("end-to-end: engine monthly WC → extractWorkingCapitalChanges → computeFCF", () => {
    const engineMonthly = [
      { period: "2026-06", workingCapitalChange: 3000 },
      { period: "2026-07", workingCapitalChange: -1500 },
    ];
    const wcChanges = extractWorkingCapitalChanges(engineMonthly);

    const is: PeriodIncomeStatement[] = [
      { period: "2026-06", revenue_accounts: [], expense_accounts: [], total_revenue: 20000, total_expenses: 5000, net_income: 15000 },
      { period: "2026-07", revenue_accounts: [], expense_accounts: [], total_revenue: 18000, total_expenses: 4000, net_income: 14000 },
    ];
    const cf: PeriodCashFlow[] = [
      { period: "2026-06", operating: 15000, investing: 0, financing: 0, net_cash_change: 15000 },
      { period: "2026-07", operating: 14000, investing: 0, financing: 0, net_cash_change: 14000 },
    ];

    const result = computeFCF({
      income_statements: is,
      cash_flows: cf,
      posted_entries: [],
      working_capital_changes: wcChanges,
    }, rounding);

    expect(result.consolidated.entries[0].working_capital_change).toBe(3000);
    expect(result.consolidated.entries[0].fcff).toBe(15000 - 3000);
    expect(result.consolidated.entries[1].working_capital_change).toBe(-1500);
    expect(result.consolidated.entries[1].fcff).toBe(14000 + 1500);

    expect(result.consolidated.total_fcff).toBe(12000 + 15500);
  });
});
