import { describe, it, expect } from "vitest";
import { extractCashFlow, computeCashDelta } from "../../statements/cash-flow.js";
import type { PostedEntry } from "../../domain/ledger/types.js";
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

describe("extractCashFlow — bucket classification", () => {
  it("classifies financing cash inflows", () => {
    const entries: PostedEntry[] = [
      makeEntry({ account: "CASH", debit: 1_000_000, credit: 0, cash_flow_bucket: "FINANCING" }),
      makeEntry({ account: "EQUITY_CONTRIBUTED", debit: 0, credit: 1_000_000, classification: "BS_EQUITY", cash_flow_bucket: "FINANCING" }),
    ];
    const cf = extractCashFlow(entries, "2026-06", rounding);
    expect(cf.financing).toBe(1_000_000);
    expect(cf.operating).toBe(0);
    expect(cf.investing).toBe(0);
    expect(cf.net_cash_change).toBe(1_000_000);
  });

  it("classifies operating cash outflows", () => {
    const entries: PostedEntry[] = [
      makeEntry({ account: "INTEREST_EXPENSE", debit: 7500, credit: 0, classification: "IS_EXPENSE", cash_flow_bucket: "OPERATING" }),
      makeEntry({ account: "CASH", debit: 0, credit: 7500, cash_flow_bucket: "OPERATING" }),
    ];
    const cf = extractCashFlow(entries, "2026-06", rounding);
    expect(cf.operating).toBe(-7500);
    expect(cf.net_cash_change).toBe(-7500);
  });

  it("handles mixed buckets in one period", () => {
    const entries: PostedEntry[] = [
      // Financing inflow
      makeEntry({ account: "CASH", debit: 1_000_000, cash_flow_bucket: "FINANCING" }),
      makeEntry({ account: "EQUITY_CONTRIBUTED", debit: 0, credit: 1_000_000, classification: "BS_EQUITY", cash_flow_bucket: "FINANCING" }),
      // Operating outflow
      makeEntry({ account: "INTEREST_EXPENSE", debit: 5000, classification: "IS_EXPENSE", cash_flow_bucket: "OPERATING" }),
      makeEntry({ account: "CASH", debit: 0, credit: 5000, cash_flow_bucket: "OPERATING" }),
    ];
    const cf = extractCashFlow(entries, "2026-06", rounding);
    expect(cf.financing).toBe(1_000_000);
    expect(cf.operating).toBe(-5000);
    expect(cf.net_cash_change).toBe(995_000);
  });

  it("classifies investing cash outflows", () => {
    const entries: PostedEntry[] = [
      makeEntry({ account: "PROPERTY", debit: 1_500_000, classification: "BS_ASSET", cash_flow_bucket: "INVESTING" }),
      makeEntry({ account: "CASH", debit: 0, credit: 500_000, cash_flow_bucket: "INVESTING" }),
      makeEntry({ account: "DEBT_ACQUISITION", debit: 0, credit: 1_000_000, classification: "BS_LIABILITY", cash_flow_bucket: "FINANCING" }),
    ];
    const cf = extractCashFlow(entries, "2026-06", rounding);
    expect(cf.investing).toBe(-500_000);
  });
});

describe("computeCashDelta", () => {
  it("computes net cash change from CASH entries", () => {
    const entries: PostedEntry[] = [
      makeEntry({ account: "CASH", debit: 1_000_000, credit: 0 }),
      makeEntry({ account: "CASH", debit: 0, credit: 7500 }),
    ];
    const delta = computeCashDelta(entries, "2026-06", rounding);
    expect(delta).toBe(992_500);
  });

  it("returns 0 for period with no cash entries", () => {
    const entries: PostedEntry[] = [
      makeEntry({ account: "PROPERTY", debit: 1_000_000, classification: "BS_ASSET" }),
    ];
    const delta = computeCashDelta(entries, "2026-06", rounding);
    expect(delta).toBe(0);
  });
});

describe("extractCashFlow — empty", () => {
  it("returns zeros for empty period", () => {
    const cf = extractCashFlow([], "2026-06", rounding);
    expect(cf.operating).toBe(0);
    expect(cf.investing).toBe(0);
    expect(cf.financing).toBe(0);
    expect(cf.net_cash_change).toBe(0);
  });
});
