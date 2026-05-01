import { describe, it, expect } from "vitest";
import { applyEvents } from "../../statements/event-applier.js";
import type { StatementEvent } from "../../domain/ledger/types.js";
import type { RoundingPolicy } from "../../domain/types/rounding.js";

const rounding: RoundingPolicy = { precision: 2, bankers_rounding: false };

function makeFundingEvent(
  eventId: string,
  date: string,
  amount: number,
): StatementEvent {
  return {
    event_id: eventId,
    event_type: "FUNDING",
    date,
    entity_id: "opco",
    journal_deltas: [
      {
        account: "CASH",
        debit: amount,
        credit: 0,
        classification: "BS_ASSET",
        cash_flow_bucket: "FINANCING",
        memo: "Cash inflow",
      },
      {
        account: "EQUITY_CONTRIBUTED",
        debit: 0,
        credit: amount,
        classification: "BS_EQUITY",
        cash_flow_bucket: "FINANCING",
        memo: "Equity contribution",
      },
    ],
  };
}

describe("applyEvents — empty input", () => {
  it("returns empty results for no events", () => {
    const result = applyEvents([], rounding);
    expect(result.posted_entries).toHaveLength(0);
    expect(result.periods).toHaveLength(0);
    expect(result.income_statements).toHaveLength(0);
    expect(result.balance_sheets).toHaveLength(0);
    expect(result.cash_flows).toHaveLength(0);
    expect(result.reconciliation.all_passed).toBe(true);
    expect(result.flags.has_posting_errors).toBe(false);
  });
});

describe("applyEvents — single event", () => {
  it("processes a single funding event", () => {
    const result = applyEvents(
      [makeFundingEvent("f1", "2026-06-01", 1_000_000)],
      rounding,
    );
    expect(result.periods).toEqual(["2026-06"]);
    expect(result.posted_entries).toHaveLength(2);
    expect(result.income_statements).toHaveLength(1);
    expect(result.balance_sheets).toHaveLength(1);
    expect(result.cash_flows).toHaveLength(1);

    // BS should balance
    const bs = result.balance_sheets[0];
    expect(bs.total_assets).toBe(1_000_000);
    expect(bs.total_equity).toBe(1_000_000);
    expect(bs.balanced).toBe(true);

    // CF should show financing inflow
    const cf = result.cash_flows[0];
    expect(cf.financing).toBe(1_000_000);
  });
});

describe("applyEvents — multi-period", () => {
  it("handles events across multiple periods", () => {
    const result = applyEvents(
      [
        makeFundingEvent("f1", "2026-06-01", 1_000_000),
        makeFundingEvent("f2", "2026-09-01", 500_000),
      ],
      rounding,
    );
    expect(result.periods).toEqual(["2026-06", "2026-09"]);
    expect(result.posted_entries).toHaveLength(4);

    // BS as of September should be cumulative
    const sepBS = result.balance_sheets.find((bs) => bs.period === "2026-09")!;
    expect(sepBS.total_assets).toBe(1_500_000);
    expect(sepBS.total_equity).toBe(1_500_000);
    expect(sepBS.balanced).toBe(true);
  });
});

describe("applyEvents — unbalanced events", () => {
  it("skips unbalanced events and flags them", () => {
    const badEvent: StatementEvent = {
      event_id: "bad1",
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
          memo: "Cash",
        },
        {
          account: "EQUITY_CONTRIBUTED",
          debit: 0,
          credit: 500_000,
          classification: "BS_EQUITY",
          cash_flow_bucket: "FINANCING",
          memo: "Short equity",
        },
      ],
    };

    const goodEvent = makeFundingEvent("good1", "2026-07-01", 800_000);

    const result = applyEvents([badEvent, goodEvent], rounding);
    expect(result.flags.has_posting_errors).toBe(true);
    expect(result.flags.unbalanced_events).toEqual(["bad1"]);
    // Only the good event is posted
    expect(result.posted_entries).toHaveLength(2);
    expect(result.periods).toEqual(["2026-07"]);
  });
});

describe("applyEvents — reconciliation integration", () => {
  it("all reconciliation checks pass for valid events", () => {
    const result = applyEvents(
      [
        makeFundingEvent("f1", "2026-06-01", 1_000_000),
        makeFundingEvent("f2", "2026-08-01", 500_000),
      ],
      rounding,
    );
    expect(result.reconciliation.all_passed).toBe(true);
  });
});
