import { describe, it, expect } from "vitest";
import { extractBalanceSheet } from "../../statements/balance-sheet.js";
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

describe("extractBalanceSheet — basic", () => {
  it("produces balanced sheet for funding event", () => {
    const entries: PostedEntry[] = [
      makeEntry({ account: "CASH", debit: 1_000_000, credit: 0 }),
      makeEntry({
        account: "EQUITY_CONTRIBUTED",
        debit: 0,
        credit: 1_000_000,
        classification: "BS_EQUITY",
      }),
    ];
    const bs = extractBalanceSheet(entries, "2026-06", 0, rounding);
    expect(bs.total_assets).toBe(1_000_000);
    expect(bs.total_liabilities).toBe(0);
    expect(bs.total_equity).toBe(1_000_000);
    expect(bs.balanced).toBe(true);
  });

  it("includes debt as liability", () => {
    const entries: PostedEntry[] = [
      makeEntry({ account: "PROPERTY", debit: 1_500_000, classification: "BS_ASSET", cash_flow_bucket: "INVESTING" }),
      makeEntry({ account: "DEBT_ACQUISITION", debit: 0, credit: 1_000_000, classification: "BS_LIABILITY" }),
      makeEntry({ account: "EQUITY_CONTRIBUTED", debit: 0, credit: 500_000, classification: "BS_EQUITY" }),
    ];
    const bs = extractBalanceSheet(entries, "2026-06", 0, rounding);
    expect(bs.total_assets).toBe(1_500_000);
    expect(bs.total_liabilities).toBe(1_000_000);
    expect(bs.total_equity).toBe(500_000);
    expect(bs.balanced).toBe(true);
  });

  it("includes retained earnings from net income", () => {
    const entries: PostedEntry[] = [
      makeEntry({ account: "CASH", debit: 500_000, credit: 0 }),
      makeEntry({ account: "EQUITY_CONTRIBUTED", debit: 0, credit: 500_000, classification: "BS_EQUITY" }),
    ];
    const bs = extractBalanceSheet(entries, "2026-06", -7500, rounding);
    const reLine = bs.equity.find((e) => e.account === "RETAINED_EARNINGS");
    expect(reLine).toBeDefined();
    expect(reLine!.balance).toBe(-7500);
  });
});

describe("extractBalanceSheet — cumulative", () => {
  it("accumulates across periods", () => {
    const entries: PostedEntry[] = [
      // June: funding $1M
      makeEntry({ period: "2026-06", account: "CASH", debit: 1_000_000 }),
      makeEntry({ period: "2026-06", account: "EQUITY_CONTRIBUTED", debit: 0, credit: 1_000_000, classification: "BS_EQUITY" }),
      // July: acquisition
      makeEntry({ period: "2026-07", account: "PROPERTY", debit: 1_500_000, classification: "BS_ASSET", cash_flow_bucket: "INVESTING" }),
      makeEntry({ period: "2026-07", account: "DEBT_ACQUISITION", debit: 0, credit: 1_000_000, classification: "BS_LIABILITY" }),
      makeEntry({ period: "2026-07", account: "EQUITY_CONTRIBUTED", debit: 0, credit: 500_000, classification: "BS_EQUITY" }),
    ];
    const bs = extractBalanceSheet(entries, "2026-07", 0, rounding);
    expect(bs.total_assets).toBe(2_500_000); // CASH + PROPERTY
    expect(bs.total_liabilities).toBe(1_000_000);
    expect(bs.total_equity).toBe(1_500_000);
    expect(bs.balanced).toBe(true);
  });
});

describe("extractBalanceSheet — deferred assets", () => {
  it("classifies CLOSING_COSTS as asset", () => {
    const entries: PostedEntry[] = [
      makeEntry({ account: "CLOSING_COSTS", debit: 20_000, classification: "BS_DEFERRED" }),
      makeEntry({ account: "EQUITY_CONTRIBUTED", debit: 0, credit: 20_000, classification: "BS_EQUITY" }),
    ];
    const bs = extractBalanceSheet(entries, "2026-06", 0, rounding);
    expect(bs.total_assets).toBe(20_000);
    expect(bs.assets.find((a) => a.account === "CLOSING_COSTS")?.balance).toBe(20_000);
    expect(bs.balanced).toBe(true);
  });
});
