import { describe, it, expect } from "vitest";
import { buildEquityRollForward } from "../../calc/funding/equity-rollforward.js";
import type { FundingEvent } from "../../calc/funding/types.js";
import type { RoundingPolicy } from "../../domain/types/rounding.js";

const rounding: RoundingPolicy = { precision: 2, bankers_rounding: false };

const opcoEntity = { type: "OPCO" as const, id: "opco", name: "OpCo" };
const propEntity = (id: string, name: string) => ({
  type: "PROPERTY" as const,
  id,
  name,
});

describe("buildEquityRollForward — single entity", () => {
  it("tracks a single contribution", () => {
    const events: FundingEvent[] = [
      {
        date: "2026-06-01",
        tranche_id: "t1",
        label: "SAFE 1",
        amount: 1_000_000,
        target_entity: opcoEntity,
        source: "SAFE",
      },
    ];
    const entries = buildEquityRollForward(events, "2026-04-01", rounding);

    // Should have entries from 2026-04 through 2026-06 (3 months)
    const opcoEntries = entries.filter((e) => e.entity_id === "opco");
    expect(opcoEntries).toHaveLength(3);

    // April: no contributions
    expect(opcoEntries[0].period).toBe("2026-04");
    expect(opcoEntries[0].beginning_balance).toBe(0);
    expect(opcoEntries[0].contributions).toBe(0);
    expect(opcoEntries[0].ending_balance).toBe(0);

    // May: no contributions
    expect(opcoEntries[1].period).toBe("2026-05");
    expect(opcoEntries[1].beginning_balance).toBe(0);
    expect(opcoEntries[1].ending_balance).toBe(0);

    // June: $1M contribution
    expect(opcoEntries[2].period).toBe("2026-06");
    expect(opcoEntries[2].beginning_balance).toBe(0);
    expect(opcoEntries[2].contributions).toBe(1_000_000);
    expect(opcoEntries[2].ending_balance).toBe(1_000_000);
  });

  it("accumulates multiple contributions over time", () => {
    const events: FundingEvent[] = [
      {
        date: "2026-06-01",
        tranche_id: "t1",
        label: "SAFE 1",
        amount: 1_000_000,
        target_entity: opcoEntity,
        source: "SAFE",
      },
      {
        date: "2026-08-01",
        tranche_id: "t2",
        label: "SAFE 2",
        amount: 500_000,
        target_entity: opcoEntity,
        source: "SAFE",
      },
    ];
    const entries = buildEquityRollForward(events, "2026-06-01", rounding);
    const opcoEntries = entries.filter((e) => e.entity_id === "opco");

    // June: $1M
    expect(opcoEntries[0].contributions).toBe(1_000_000);
    expect(opcoEntries[0].ending_balance).toBe(1_000_000);

    // July: carry forward
    expect(opcoEntries[1].beginning_balance).toBe(1_000_000);
    expect(opcoEntries[1].contributions).toBe(0);
    expect(opcoEntries[1].ending_balance).toBe(1_000_000);

    // August: +$500K
    expect(opcoEntries[2].beginning_balance).toBe(1_000_000);
    expect(opcoEntries[2].contributions).toBe(500_000);
    expect(opcoEntries[2].ending_balance).toBe(1_500_000);
  });
});

describe("buildEquityRollForward — multi-entity", () => {
  it("tracks separate entities independently", () => {
    const events: FundingEvent[] = [
      {
        date: "2026-06-01",
        tranche_id: "t1",
        label: "SAFE 1",
        amount: 1_000_000,
        target_entity: opcoEntity,
        source: "SAFE",
      },
      {
        date: "2026-07-01",
        tranche_id: "t2",
        label: "Prop A Equity",
        amount: 800_000,
        target_entity: propEntity("p1", "Prop A"),
        source: "LP_EQUITY",
      },
    ];
    const entries = buildEquityRollForward(events, "2026-06-01", rounding);

    const opcoEntries = entries.filter((e) => e.entity_id === "opco");
    const propEntries = entries.filter((e) => e.entity_id === "p1");

    // Both span June-July (2 months)
    expect(opcoEntries).toHaveLength(2);
    expect(propEntries).toHaveLength(2);

    // OpCo: funded in June
    expect(opcoEntries[0].contributions).toBe(1_000_000);
    expect(opcoEntries[1].ending_balance).toBe(1_000_000);

    // Prop A: funded in July
    expect(propEntries[0].contributions).toBe(0);
    expect(propEntries[1].contributions).toBe(800_000);
    expect(propEntries[1].ending_balance).toBe(800_000);
  });
});

describe("buildEquityRollForward — reconciliation", () => {
  it("total contributions tie to sum of all events", () => {
    const events: FundingEvent[] = [
      {
        date: "2026-06-01",
        tranche_id: "t1",
        label: "SAFE 1",
        amount: 1_000_000,
        target_entity: opcoEntity,
        source: "SAFE",
      },
      {
        date: "2026-07-01",
        tranche_id: "t2",
        label: "Prop Equity",
        amount: 800_000,
        target_entity: propEntity("p1", "Prop"),
        source: "LP_EQUITY",
      },
      {
        date: "2026-09-01",
        tranche_id: "t3",
        label: "SAFE 2",
        amount: 500_000,
        target_entity: opcoEntity,
        source: "SAFE",
      },
    ];
    const entries = buildEquityRollForward(events, "2026-06-01", rounding);

    const totalContributions = entries.reduce(
      (sum, e) => sum + e.contributions,
      0,
    );
    const totalEventAmounts = events.reduce((sum, e) => sum + e.amount, 0);
    expect(totalContributions).toBe(totalEventAmounts);
  });

  it("distributions are always zero", () => {
    const events: FundingEvent[] = [
      {
        date: "2026-06-01",
        tranche_id: "t1",
        label: "SAFE 1",
        amount: 1_000_000,
        target_entity: opcoEntity,
        source: "SAFE",
      },
    ];
    const entries = buildEquityRollForward(events, "2026-04-01", rounding);
    expect(entries.every((e) => e.distributions === 0)).toBe(true);
  });

  it("returns empty for no events", () => {
    const entries = buildEquityRollForward([], "2026-04-01", rounding);
    expect(entries).toHaveLength(0);
  });
});
