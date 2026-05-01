import { describe, it, expect } from "vitest";
import { buildTrialBalance, buildCumulativeTrialBalance } from "../../engine/posting/trial-balance";
import type { PostedEntry } from "../../domain/ledger/types";
import type { RoundingPolicy } from "../../domain/types/rounding";

const rounding: RoundingPolicy = { precision: 2, bankers_rounding: false };

function makeEntry(account: string, debit: number, credit: number, period: string): PostedEntry {
  return {
    period,
    event_id: "evt-precision",
    account,
    debit,
    credit,
    classification: "BS_ASSET",
    cash_flow_bucket: "OPERATING",
    memo: "",
  };
}

describe("trial-balance dSum precision", () => {
  it("avoids penny drift on large number of small credits", () => {
    const entries: PostedEntry[] = [];
    for (let i = 0; i < 1000; i++) {
      entries.push(makeEntry("4000-Revenue", 0, 0.01, "2024-01"));
    }
    const tb = buildTrialBalance(entries, "2024-01", rounding);
    const row = tb.find((r) => r.account === "4000-Revenue");
    expect(row).toBeDefined();
    expect(row!.credit_total).toBe(10);
    expect(row!.debit_total).toBe(0);
  });

  it("avoids penny drift on 0.1 + 0.2 style floating-point traps", () => {
    const entries: PostedEntry[] = [
      makeEntry("5000-Expense", 0.1, 0, "2024-01"),
      makeEntry("5000-Expense", 0.2, 0, "2024-01"),
      makeEntry("5000-Expense", 0.3, 0, "2024-01"),
    ];
    const tb = buildTrialBalance(entries, "2024-01", rounding);
    const row = tb.find((r) => r.account === "5000-Expense");
    expect(row).toBeDefined();
    expect(row!.debit_total).toBe(0.6);
  });

  it("accumulates correctly across 100 entries of 33.33", () => {
    const entries: PostedEntry[] = [];
    for (let i = 0; i < 100; i++) {
      entries.push(makeEntry("1000-Cash", 33.33, 0, "2024-06"));
    }
    const tb = buildTrialBalance(entries, "2024-06", rounding);
    const row = tb.find((r) => r.account === "1000-Cash");
    expect(row).toBeDefined();
    expect(row!.debit_total).toBe(3333);
  });

  it("cumulative trial balance also uses precise summation", () => {
    const entries: PostedEntry[] = [];
    for (let i = 0; i < 500; i++) {
      entries.push(makeEntry("2000-AP", 0, 0.07, `2024-0${(i % 6) + 1}`));
    }
    const tb = buildCumulativeTrialBalance(entries, "2024-06", rounding);
    const row = tb.find((r) => r.account === "2000-AP");
    expect(row).toBeDefined();
    expect(row!.credit_total).toBe(35);
  });

  it("balance computation is correct for mixed debits and credits", () => {
    const entries: PostedEntry[] = [
      makeEntry("CASH", 100.01, 0, "2024-01"),
      makeEntry("CASH", 200.02, 0, "2024-01"),
      makeEntry("CASH", 0, 150.015, "2024-01"),
      makeEntry("CASH", 0, 150.015, "2024-01"),
    ];
    const tb = buildTrialBalance(entries, "2024-01", rounding);
    const row = tb.find((r) => r.account === "CASH");
    expect(row).toBeDefined();
    expect(row!.debit_total).toBe(300.03);
    expect(row!.credit_total).toBe(300.03);
    expect(row!.balance).toBe(0);
  });
});
