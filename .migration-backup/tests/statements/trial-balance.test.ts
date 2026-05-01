import { describe, it, expect } from "vitest";
import {
  buildTrialBalance,
  buildCumulativeTrialBalance,
} from "../../engine/posting/trial-balance.js";
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

describe("buildTrialBalance — single period", () => {
  it("aggregates debits and credits for one account", () => {
    const entries: PostedEntry[] = [
      makeEntry({ account: "CASH", debit: 500, credit: 0 }),
      makeEntry({ account: "CASH", debit: 300, credit: 0 }),
    ];
    const tb = buildTrialBalance(entries, "2026-06", rounding);
    const cash = tb.find((e) => e.account === "CASH")!;
    expect(cash.debit_total).toBe(800);
    expect(cash.credit_total).toBe(0);
    expect(cash.balance).toBe(800); // DEBIT normal
  });

  it("respects CREDIT normal side", () => {
    const entries: PostedEntry[] = [
      makeEntry({
        account: "EQUITY_CONTRIBUTED",
        debit: 0,
        credit: 1000,
        classification: "BS_EQUITY",
      }),
    ];
    const tb = buildTrialBalance(entries, "2026-06", rounding);
    const eq = tb.find((e) => e.account === "EQUITY_CONTRIBUTED")!;
    expect(eq.balance).toBe(1000); // CREDIT normal: credit - debit
  });

  it("handles multiple accounts", () => {
    const entries: PostedEntry[] = [
      makeEntry({ account: "CASH", debit: 1000, credit: 0 }),
      makeEntry({
        account: "EQUITY_CONTRIBUTED",
        debit: 0,
        credit: 1000,
        classification: "BS_EQUITY",
      }),
    ];
    const tb = buildTrialBalance(entries, "2026-06", rounding);
    expect(tb).toHaveLength(2);
  });

  it("filters by period", () => {
    const entries: PostedEntry[] = [
      makeEntry({ period: "2026-06", account: "CASH", debit: 1000 }),
      makeEntry({ period: "2026-07", account: "CASH", debit: 500 }),
    ];
    const tb = buildTrialBalance(entries, "2026-06", rounding);
    const cash = tb.find((e) => e.account === "CASH")!;
    expect(cash.debit_total).toBe(1000); // only June
  });

  it("returns empty for period with no entries", () => {
    const entries: PostedEntry[] = [
      makeEntry({ period: "2026-06", account: "CASH", debit: 1000 }),
    ];
    const tb = buildTrialBalance(entries, "2026-07", rounding);
    expect(tb).toHaveLength(0);
  });
});

describe("buildCumulativeTrialBalance", () => {
  it("accumulates across periods", () => {
    const entries: PostedEntry[] = [
      makeEntry({ period: "2026-06", account: "CASH", debit: 1000, credit: 0 }),
      makeEntry({ period: "2026-07", account: "CASH", debit: 500, credit: 0 }),
    ];
    const tb = buildCumulativeTrialBalance(entries, "2026-07", rounding);
    const cash = tb.find((e) => e.account === "CASH")!;
    expect(cash.debit_total).toBe(1500);
    expect(cash.balance).toBe(1500);
  });

  it("excludes entries after the target period", () => {
    const entries: PostedEntry[] = [
      makeEntry({ period: "2026-06", account: "CASH", debit: 1000 }),
      makeEntry({ period: "2026-08", account: "CASH", debit: 500 }),
    ];
    const tb = buildCumulativeTrialBalance(entries, "2026-07", rounding);
    const cash = tb.find((e) => e.account === "CASH")!;
    expect(cash.debit_total).toBe(1000); // only through July
  });
});
