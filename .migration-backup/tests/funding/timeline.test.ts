import { describe, it, expect } from "vitest";
import { buildFundingTimeline } from "../../calc/funding/timeline.js";
import type {
  FundingTranche,
  PropertyFundingRequirement,
} from "../../calc/funding/types.js";

const opcoEntity = { type: "OPCO" as const, id: "opco", name: "OpCo" };
const propEntity = (id: string, name: string) => ({
  type: "PROPERTY" as const,
  id,
  name,
});

describe("buildFundingTimeline — scheduled tranches", () => {
  it("resolves scheduled tranches by date", () => {
    const tranches: FundingTranche[] = [
      {
        tranche_id: "t1",
        label: "SAFE 1",
        amount: 1_000_000,
        trigger: { type: "scheduled", date: "2026-06-01" },
        target_entity: opcoEntity,
        source: "SAFE",
      },
    ];
    const { events, warnings } = buildFundingTimeline(tranches, []);
    expect(events).toHaveLength(1);
    expect(events[0].date).toBe("2026-06-01");
    expect(events[0].amount).toBe(1_000_000);
    expect(warnings).toHaveLength(0);
  });

  it("sorts events chronologically", () => {
    const tranches: FundingTranche[] = [
      {
        tranche_id: "t2",
        label: "SAFE 2",
        amount: 500_000,
        trigger: { type: "scheduled", date: "2027-01-01" },
        target_entity: opcoEntity,
        source: "SAFE",
      },
      {
        tranche_id: "t1",
        label: "SAFE 1",
        amount: 1_000_000,
        trigger: { type: "scheduled", date: "2026-06-01" },
        target_entity: opcoEntity,
        source: "SAFE",
      },
    ];
    const { events } = buildFundingTimeline(tranches, []);
    expect(events[0].date).toBe("2026-06-01");
    expect(events[1].date).toBe("2027-01-01");
  });

  it("handles duplicate dates", () => {
    const tranches: FundingTranche[] = [
      {
        tranche_id: "t1",
        label: "SAFE 1",
        amount: 500_000,
        trigger: { type: "scheduled", date: "2026-06-01" },
        target_entity: opcoEntity,
        source: "SAFE",
      },
      {
        tranche_id: "t2",
        label: "Prop Equity",
        amount: 800_000,
        trigger: { type: "scheduled", date: "2026-06-01" },
        target_entity: propEntity("p1", "Prop A"),
        source: "LP_EQUITY",
      },
    ];
    const { events } = buildFundingTimeline(tranches, []);
    expect(events).toHaveLength(2);
    expect(events[0].date).toBe("2026-06-01");
    expect(events[1].date).toBe("2026-06-01");
  });
});

describe("buildFundingTimeline — on_acquisition trigger", () => {
  it("resolves date from property acquisition_date", () => {
    const props: PropertyFundingRequirement[] = [
      {
        property_id: "p1",
        property_name: "Prop A",
        acquisition_date: "2026-07-01",
        operations_start_date: "2027-01-01",
        total_cost: 1_500_000,
        loan_amount: 700_000,
        equity_required: 800_000,
      },
    ];
    const tranches: FundingTranche[] = [
      {
        tranche_id: "t1",
        label: "Prop A Equity",
        amount: 800_000,
        trigger: { type: "on_acquisition", property_id: "p1" },
        target_entity: propEntity("p1", "Prop A"),
        source: "SPONSOR_EQUITY",
      },
    ];
    const { events, warnings } = buildFundingTimeline(tranches, props);
    expect(events).toHaveLength(1);
    expect(events[0].date).toBe("2026-07-01");
    expect(warnings).toHaveLength(0);
  });

  it("warns and skips if property_id not found", () => {
    const tranches: FundingTranche[] = [
      {
        tranche_id: "t1",
        label: "Unknown Prop",
        amount: 500_000,
        trigger: { type: "on_acquisition", property_id: "nonexistent" },
        target_entity: propEntity("nonexistent", "???"),
        source: "LP_EQUITY",
      },
    ];
    const { events, warnings } = buildFundingTimeline(tranches, []);
    expect(events).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("could not resolve");
  });
});

describe("buildFundingTimeline — conditional trigger", () => {
  it("uses fallback_date for conditional triggers", () => {
    const tranches: FundingTranche[] = [
      {
        tranche_id: "t1",
        label: "Conditional",
        amount: 300_000,
        trigger: {
          type: "conditional",
          condition: "revenue_target_met",
          fallback_date: "2027-06-01",
        },
        target_entity: opcoEntity,
        source: "SAFE",
      },
    ];
    const { events } = buildFundingTimeline(tranches, []);
    expect(events).toHaveLength(1);
    expect(events[0].date).toBe("2027-06-01");
  });
});
