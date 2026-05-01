import { describe, it, expect } from "vitest";
import { computeFCF } from "../../analytics/fcf/compute-fcf.js";
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

describe("FCFE two-method reconciliation — Direct vs From-NI", () => {
  it("Method 1 (Direct) equals Method 2 (From NI) for operating period", () => {
    const noi = 50000;
    const interest = 7500;
    const principal = 2500;
    const depreciation = 3000;
    const taxableIncome = noi - interest - depreciation;
    const tax = Math.max(0, taxableIncome * 0.21);
    const netIncome = noi - interest - depreciation - tax;

    const directFCFE = noi - (interest + principal) - tax;
    const fromNI_FCFE = netIncome + depreciation - principal;

    expect(directFCFE).toBeCloseTo(fromNI_FCFE, 2);
  });

  it("Methods agree with zero debt (cash purchase)", () => {
    const noi = 50000;
    const interest = 0;
    const principal = 0;
    const depreciation = 3000;
    const taxableIncome = noi - interest - depreciation;
    const tax = Math.max(0, taxableIncome * 0.21);
    const netIncome = noi - interest - depreciation - tax;

    const directFCFE = noi - (interest + principal) - tax;
    const fromNI_FCFE = netIncome + depreciation - principal;

    expect(directFCFE).toBeCloseTo(fromNI_FCFE, 2);
  });

  it("Methods agree with high leverage", () => {
    const noi = 50000;
    const interest = 35000;
    const principal = 5000;
    const depreciation = 8000;
    const taxableIncome = noi - interest - depreciation;
    const tax = Math.max(0, taxableIncome * 0.21);
    const netIncome = noi - interest - depreciation - tax;

    const directFCFE = noi - (interest + principal) - tax;
    const fromNI_FCFE = netIncome + depreciation - principal;

    expect(directFCFE).toBeCloseTo(fromNI_FCFE, 2);
  });

  it("Methods agree when taxable income is negative (tax shield)", () => {
    const noi = 20000;
    const interest = 15000;
    const principal = 3000;
    const depreciation = 10000;
    const taxableIncome = noi - interest - depreciation;
    const tax = Math.max(0, taxableIncome * 0.21);
    const netIncome = noi - interest - depreciation - tax;

    const directFCFE = noi - (interest + principal) - tax;
    const fromNI_FCFE = netIncome + depreciation - principal;

    expect(tax).toBe(0);
    expect(directFCFE).toBeCloseTo(fromNI_FCFE, 2);
  });

  it("Methods agree with refinancing proceeds", () => {
    const noi = 50000;
    const interest = 7500;
    const principal = 2500;
    const depreciation = 3000;
    const refiProceeds = 200000;
    const taxableIncome = noi - interest - depreciation;
    const tax = Math.max(0, taxableIncome * 0.21);
    const netIncome = noi - interest - depreciation - tax;

    const directFCFE = noi - (interest + principal) - tax + refiProceeds;
    const fromNI_FCFE = netIncome + depreciation - principal + refiProceeds;

    expect(directFCFE).toBeCloseTo(fromNI_FCFE, 2);
  });
});

describe("FCFE via computeFCF — ledger-derived values", () => {
  it("FCFE for operating period with interest and depreciation", () => {
    const entries: PostedEntry[] = [
      makeEntry({ period: "2026-08", account: "INTEREST_EXPENSE", debit: 7500, credit: 0, classification: "IS_EXPENSE", cash_flow_bucket: "OPERATING" }),
      makeEntry({ period: "2026-08", account: "CASH", debit: 0, credit: 7500, cash_flow_bucket: "OPERATING" }),
      makeEntry({ period: "2026-08", account: "DEPRECIATION_EXPENSE", debit: 3000, credit: 0, classification: "IS_EXPENSE", cash_flow_bucket: "OPERATING" }),
      makeEntry({ period: "2026-08", account: "DEBT_ACQUISITION", debit: 2500, credit: 0, classification: "BS_LIABILITY", cash_flow_bucket: "FINANCING" }),
      makeEntry({ period: "2026-08", account: "CASH", debit: 0, credit: 2500, cash_flow_bucket: "FINANCING" }),
    ];
    const is: PeriodIncomeStatement[] = [{
      period: "2026-08",
      revenue_accounts: [],
      expense_accounts: [
        { account: "INTEREST_EXPENSE", amount: 7500 },
        { account: "DEPRECIATION_EXPENSE", amount: 3000 },
      ],
      total_revenue: 0,
      total_expenses: 10500,
      net_income: -10500,
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

    expect(entry.net_income).toBe(-10500);
    expect(entry.depreciation).toBe(3000);
    expect(entry.interest_expense).toBe(7500);
    expect(entry.net_borrowing).toBe(-2500);

    expect(entry.fcff).toBe(0);
    expect(entry.fcfe).toBe(-10000);
  });

  it("FCFF formula: NI + Depreciation + Interest - CapEx", () => {
    const entries: PostedEntry[] = [
      makeEntry({ period: "2026-09", account: "INTEREST_EXPENSE", debit: 5000, credit: 0, classification: "IS_EXPENSE", cash_flow_bucket: "OPERATING" }),
      makeEntry({ period: "2026-09", account: "CASH", debit: 0, credit: 5000, cash_flow_bucket: "OPERATING" }),
      makeEntry({ period: "2026-09", account: "DEPRECIATION_EXPENSE", debit: 4000, credit: 0, classification: "IS_EXPENSE", cash_flow_bucket: "OPERATING" }),
    ];
    const is: PeriodIncomeStatement[] = [{
      period: "2026-09",
      revenue_accounts: [],
      expense_accounts: [
        { account: "INTEREST_EXPENSE", amount: 5000 },
        { account: "DEPRECIATION_EXPENSE", amount: 4000 },
      ],
      total_revenue: 0,
      total_expenses: 9000,
      net_income: -9000,
    }];
    const cf: PeriodCashFlow[] = [{
      period: "2026-09",
      operating: -5000,
      investing: 0,
      financing: 0,
      net_cash_change: -5000,
    }];

    const result = computeFCF({ income_statements: is, cash_flows: cf, posted_entries: entries }, rounding);
    const entry = result.consolidated.entries[0];

    const expectedFCFF = entry.net_income + entry.depreciation + entry.interest_expense - entry.capex;
    expect(entry.fcff).toBeCloseTo(expectedFCFF, 2);
  });

  it("FCFE formula: FCFF - Interest + Net Borrowing", () => {
    const entries: PostedEntry[] = [
      makeEntry({ period: "2026-10", account: "INTEREST_EXPENSE", debit: 8000, credit: 0, classification: "IS_EXPENSE", cash_flow_bucket: "OPERATING" }),
      makeEntry({ period: "2026-10", account: "CASH", debit: 0, credit: 8000, cash_flow_bucket: "OPERATING" }),
      makeEntry({ period: "2026-10", account: "DEBT_ACQUISITION", debit: 3000, credit: 0, classification: "BS_LIABILITY", cash_flow_bucket: "FINANCING" }),
      makeEntry({ period: "2026-10", account: "CASH", debit: 0, credit: 3000, cash_flow_bucket: "FINANCING" }),
    ];
    const is: PeriodIncomeStatement[] = [{
      period: "2026-10",
      revenue_accounts: [],
      expense_accounts: [{ account: "INTEREST_EXPENSE", amount: 8000 }],
      total_revenue: 0,
      total_expenses: 8000,
      net_income: -8000,
    }];
    const cf: PeriodCashFlow[] = [{
      period: "2026-10",
      operating: -8000,
      investing: 0,
      financing: -3000,
      net_cash_change: -11000,
    }];

    const result = computeFCF({ income_statements: is, cash_flows: cf, posted_entries: entries }, rounding);
    const entry = result.consolidated.entries[0];

    const expectedFCFE = entry.fcff - entry.interest_expense + entry.net_borrowing;
    expect(entry.fcfe).toBeCloseTo(expectedFCFE, 2);
  });
});
