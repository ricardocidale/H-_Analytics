import { describe, it, expect } from "vitest";
import { applyEvents } from "../../statements/event-applier.js";
import type { StatementEvent } from "../../domain/ledger/types.js";
import type { RoundingPolicy } from "../../domain/types/rounding.js";

const rounding: RoundingPolicy = { precision: 2, bankers_rounding: false };

/**
 * Golden test — all values hand-calculated:
 *
 * Event 1: FUNDING — 2026-06-01, OpCo, Funding instrument tranche $1,000,000
 *   CASH debit $1,000,000 (financing)
 *   EQUITY_CONTRIBUTED credit $1,000,000 (financing)
 *
 * Event 2: ACQUISITION — 2026-07-01, Property A
 *   PROPERTY debit $1,500,000 (investing)
 *   DEBT_ACQUISITION credit $1,000,000 (financing)
 *   CLOSING_COSTS debit $20,000 (financing, BS_DEFERRED)
 *   EQUITY_CONTRIBUTED credit $520,000 (financing)
 *
 * Event 3: DEBT_SERVICE — 2026-08-01, Property A
 *   INTEREST_EXPENSE debit $7,500 (operating)
 *   CASH credit $7,500 (operating)
 *   DEBT_ACQUISITION debit $2,500 (financing — principal paydown)
 *   CASH credit $2,500 (financing)
 *
 * Expected after all events:
 *
 * === Income Statement (2026-08 only) ===
 * Revenue: $0
 * Expenses: INTEREST_EXPENSE $7,500
 * Net Income: -$7,500
 *
 * === Balance Sheet (cumulative through 2026-08) ===
 * Assets:
 *   CASH: $1,000,000 - $7,500 - $2,500 = $990,000
 *   PROPERTY: $1,500,000
 *   CLOSING_COSTS: $20,000
 *   Total Assets: $2,510,000
 *
 * Liabilities:
 *   DEBT_ACQUISITION: $1,000,000 - $2,500 = $997,500
 *   Total Liabilities: $997,500
 *
 * Equity:
 *   EQUITY_CONTRIBUTED: $1,000,000 + $520,000 = $1,520,000
 *   RETAINED_EARNINGS: -$7,500
 *   Total Equity: $1,512,500
 *
 * Verify: $2,510,000 = $997,500 + $1,512,500 ✓
 *
 * === Cash Flow (2026-08 only) ===
 * Operating: -$7,500 (interest)
 * Investing: $0
 * Financing: -$2,500 (principal)
 * Net: -$10,000
 * ΔCASH in August: -$10,000 ✓
 */
describe("golden scenario — funding + acquisition + debt service", () => {
  const events: StatementEvent[] = [
    {
      event_id: "funding_1",
      event_type: "FUNDING",
      date: "2026-06-01",
      entity_id: "opco",
      journal_deltas: [
        {
          account: "CASH",
          debit: 1_000_000,
          credit: 0,
          classification: "BS_ASSET",
          cash_flow_bucket: "FINANCING",
          memo: "Funding tranche cash inflow",
        },
        {
          account: "EQUITY_CONTRIBUTED",
          debit: 0,
          credit: 1_000_000,
          classification: "BS_EQUITY",
          cash_flow_bucket: "FINANCING",
          memo: "Funding equity contribution",
        },
      ],
    },
    {
      event_id: "acq_1",
      event_type: "ACQUISITION",
      date: "2026-07-01",
      entity_id: "prop_a",
      journal_deltas: [
        {
          account: "PROPERTY",
          debit: 1_500_000,
          credit: 0,
          classification: "BS_ASSET",
          cash_flow_bucket: "INVESTING",
          memo: "Property acquisition",
        },
        {
          account: "DEBT_ACQUISITION",
          debit: 0,
          credit: 1_000_000,
          classification: "BS_LIABILITY",
          cash_flow_bucket: "FINANCING",
          memo: "Acquisition loan proceeds",
        },
        {
          account: "CLOSING_COSTS",
          debit: 20_000,
          credit: 0,
          classification: "BS_DEFERRED",
          cash_flow_bucket: "FINANCING",
          memo: "Closing costs",
        },
        {
          account: "EQUITY_CONTRIBUTED",
          debit: 0,
          credit: 520_000,
          classification: "BS_EQUITY",
          cash_flow_bucket: "FINANCING",
          memo: "Equity for acquisition",
        },
      ],
    },
    {
      event_id: "debt_svc_1",
      event_type: "DEBT_SERVICE",
      date: "2026-08-01",
      entity_id: "prop_a",
      journal_deltas: [
        {
          account: "INTEREST_EXPENSE",
          debit: 7_500,
          credit: 0,
          classification: "IS_EXPENSE",
          cash_flow_bucket: "OPERATING",
          memo: "Monthly interest",
        },
        {
          account: "CASH",
          debit: 0,
          credit: 7_500,
          classification: "BS_ASSET",
          cash_flow_bucket: "OPERATING",
          memo: "Interest payment",
        },
        {
          account: "DEBT_ACQUISITION",
          debit: 2_500,
          credit: 0,
          classification: "BS_LIABILITY",
          cash_flow_bucket: "FINANCING",
          memo: "Principal paydown",
        },
        {
          account: "CASH",
          debit: 0,
          credit: 2_500,
          classification: "BS_ASSET",
          cash_flow_bucket: "FINANCING",
          memo: "Principal payment",
        },
      ],
    },
  ];

  it("produces 3 periods", () => {
    const result = applyEvents(events, rounding);
    expect(result.periods).toEqual(["2026-06", "2026-07", "2026-08"]);
  });

  it("posts all entries without errors", () => {
    const result = applyEvents(events, rounding);
    expect(result.flags.has_posting_errors).toBe(false);
    expect(result.flags.unbalanced_events).toHaveLength(0);
    // 2 + 4 + 4 = 10 posted entries
    expect(result.posted_entries).toHaveLength(10);
  });

  it("income statement: only August has IS activity", () => {
    const result = applyEvents(events, rounding);

    const juneIS = result.income_statements.find((is) => is.period === "2026-06")!;
    expect(juneIS.net_income).toBe(0);

    const julyIS = result.income_statements.find((is) => is.period === "2026-07")!;
    expect(julyIS.net_income).toBe(0);

    const augIS = result.income_statements.find((is) => is.period === "2026-08")!;
    expect(augIS.total_expenses).toBe(7_500);
    expect(augIS.net_income).toBe(-7_500);
  });

  it("balance sheet: cumulative through August", () => {
    const result = applyEvents(events, rounding);

    const augBS = result.balance_sheets.find((bs) => bs.period === "2026-08")!;
    expect(augBS.total_assets).toBe(2_510_000);
    expect(augBS.total_liabilities).toBe(997_500);
    expect(augBS.total_equity).toBe(1_512_500);
    expect(augBS.balanced).toBe(true);

    // Verify individual accounts
    const cash = augBS.assets.find((a) => a.account === "CASH")!;
    expect(cash.balance).toBe(990_000);

    const property = augBS.assets.find((a) => a.account === "PROPERTY")!;
    expect(property.balance).toBe(1_500_000);

    const closingCosts = augBS.assets.find((a) => a.account === "CLOSING_COSTS")!;
    expect(closingCosts.balance).toBe(20_000);

    const debt = augBS.liabilities.find((a) => a.account === "DEBT_ACQUISITION")!;
    expect(debt.balance).toBe(997_500);

    const equity = augBS.equity.find((a) => a.account === "EQUITY_CONTRIBUTED")!;
    expect(equity.balance).toBe(1_520_000);

    const re = augBS.equity.find((a) => a.account === "RETAINED_EARNINGS")!;
    expect(re.balance).toBe(-7_500);
  });

  it("balance sheet: June snapshot", () => {
    const result = applyEvents(events, rounding);
    const juneBS = result.balance_sheets.find((bs) => bs.period === "2026-06")!;
    expect(juneBS.total_assets).toBe(1_000_000);
    expect(juneBS.total_liabilities).toBe(0);
    expect(juneBS.total_equity).toBe(1_000_000);
    expect(juneBS.balanced).toBe(true);
  });

  it("cash flow: August", () => {
    const result = applyEvents(events, rounding);
    const augCF = result.cash_flows.find((cf) => cf.period === "2026-08")!;
    expect(augCF.operating).toBe(-7_500);
    expect(augCF.financing).toBe(-2_500);
    expect(augCF.investing).toBe(0);
    expect(augCF.net_cash_change).toBe(-10_000);
  });

  it("cash flow: June (financing inflow)", () => {
    const result = applyEvents(events, rounding);
    const juneCF = result.cash_flows.find((cf) => cf.period === "2026-06")!;
    expect(juneCF.financing).toBe(1_000_000);
    expect(juneCF.net_cash_change).toBe(1_000_000);
  });

  it("cash flow: July (no cash entries — property/debt/equity are non-cash)", () => {
    const result = applyEvents(events, rounding);
    const julyCF = result.cash_flows.find((cf) => cf.period === "2026-07")!;
    // The acquisition event has no CASH entries — funded by debt + equity
    expect(julyCF.net_cash_change).toBe(0);
  });

  it("all reconciliation checks pass", () => {
    const result = applyEvents(events, rounding);
    expect(result.reconciliation.all_passed).toBe(true);
    for (const c of result.reconciliation.checks) {
      expect(c.passed).toBe(true);
    }
  });

  it("reconciliation covers all check types", () => {
    const result = applyEvents(events, rounding);
    const checkTypes = new Set(result.reconciliation.checks.map((c) => c.check));
    expect(checkTypes.has("BS_BALANCE")).toBe(true);
    expect(checkTypes.has("CF_TIEOUT")).toBe(true);
    expect(checkTypes.has("IS_TO_RE")).toBe(true);
  });
});
