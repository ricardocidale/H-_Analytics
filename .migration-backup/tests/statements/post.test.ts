import { describe, it, expect } from "vitest";
import { postEvents } from "../../engine/posting/post.js";
import type { StatementEvent } from "../../domain/ledger/types.js";
import type { RoundingPolicy } from "../../domain/types/rounding.js";

const rounding: RoundingPolicy = { precision: 2, bankers_rounding: false };

function makeFundingEvent(overrides: Partial<StatementEvent> = {}): StatementEvent {
  return {
    event_id: "evt1",
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
        memo: "Cash inflow from funding",
      },
      {
        account: "EQUITY_CONTRIBUTED",
        debit: 0,
        credit: 1_000_000,
        classification: "BS_EQUITY",
        cash_flow_bucket: "FINANCING",
        memo: "Equity contribution",
      },
    ],
    ...overrides,
  };
}

describe("postEvents — balanced events", () => {
  it("posts a balanced event", () => {
    const result = postEvents([makeFundingEvent()], rounding);
    expect(result.entries).toHaveLength(2);
    expect(result.unbalanced_events).toHaveLength(0);
  });

  it("extracts period from date", () => {
    const result = postEvents([makeFundingEvent()], rounding);
    expect(result.entries[0].period).toBe("2026-06");
  });

  it("preserves all fields from journal delta", () => {
    const result = postEvents([makeFundingEvent()], rounding);
    const cashEntry = result.entries.find((e) => e.account === "CASH")!;
    expect(cashEntry.event_id).toBe("evt1");
    expect(cashEntry.debit).toBe(1_000_000);
    expect(cashEntry.credit).toBe(0);
    expect(cashEntry.classification).toBe("BS_ASSET");
    expect(cashEntry.cash_flow_bucket).toBe("FINANCING");
    expect(cashEntry.memo).toBe("Cash inflow from funding");
  });

  it("posts multiple events", () => {
    const events: StatementEvent[] = [
      makeFundingEvent({ event_id: "evt1", date: "2026-06-01" }),
      makeFundingEvent({ event_id: "evt2", date: "2026-07-01" }),
    ];
    const result = postEvents(events, rounding);
    expect(result.entries).toHaveLength(4);
    expect(result.unbalanced_events).toHaveLength(0);
  });
});

describe("postEvents — unbalanced events", () => {
  it("rejects an unbalanced event", () => {
    const event: StatementEvent = {
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
          credit: 999_000,
          classification: "BS_EQUITY",
          cash_flow_bucket: "FINANCING",
          memo: "Equity (short)",
        },
      ],
    };
    const result = postEvents([event], rounding);
    expect(result.entries).toHaveLength(0);
    expect(result.unbalanced_events).toEqual(["bad1"]);
  });

  it("posts balanced events even when unbalanced events exist", () => {
    const good = makeFundingEvent({ event_id: "good" });
    const bad: StatementEvent = {
      event_id: "bad",
      event_type: "FUNDING",
      date: "2026-06-01",
      entity_id: "opco",
      journal_deltas: [
        {
          account: "CASH",
          debit: 100,
          credit: 0,
          classification: "BS_ASSET",
          cash_flow_bucket: "FINANCING",
          memo: "Cash",
        },
      ],
    };
    const result = postEvents([good, bad], rounding);
    expect(result.entries).toHaveLength(2); // only the good event
    expect(result.unbalanced_events).toEqual(["bad"]);
  });
});

describe("postEvents — empty input", () => {
  it("returns empty for no events", () => {
    const result = postEvents([], rounding);
    expect(result.entries).toHaveLength(0);
    expect(result.unbalanced_events).toHaveLength(0);
  });
});
