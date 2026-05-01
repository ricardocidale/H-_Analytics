import { describe, it, expect } from "vitest";
import { checkGates } from "../../calc/funding/gates.js";
import type {
  FundingEvent,
  PropertyFundingRequirement,
} from "../../calc/funding/types.js";
import type { RoundingPolicy } from "../../domain/types/rounding.js";

const rounding: RoundingPolicy = { precision: 2, bankers_rounding: false };

const opcoEntity = { type: "OPCO" as const, id: "opco", name: "OpCo" };
const propEntity = (id: string, name: string) => ({
  type: "PROPERTY" as const,
  id,
  name,
});

function makeEvent(
  overrides: Partial<FundingEvent> & { date: string },
): FundingEvent {
  return {
    tranche_id: "t1",
    label: "Tranche",
    amount: 1_000_000,
    target_entity: opcoEntity,
    source: "SAFE",
    ...overrides,
  };
}

describe("checkGates — OpCo gate", () => {
  it("passes when first tranche <= ops start", () => {
    const events: FundingEvent[] = [
      makeEvent({ date: "2026-06-01", target_entity: opcoEntity }),
    ];
    const checks = checkGates("2026-06-01", events, [], rounding);
    const opco = checks.find((c) => c.entity.type === "OPCO");
    expect(opco!.passed).toBe(true);
  });

  it("passes when tranche is before ops start", () => {
    const events: FundingEvent[] = [
      makeEvent({ date: "2026-04-01", target_entity: opcoEntity }),
    ];
    const checks = checkGates("2026-06-01", events, [], rounding);
    const opco = checks.find((c) => c.entity.type === "OPCO");
    expect(opco!.passed).toBe(true);
  });

  it("fails when ops start before first tranche", () => {
    const events: FundingEvent[] = [
      makeEvent({ date: "2026-09-01", target_entity: opcoEntity }),
    ];
    const checks = checkGates("2026-06-01", events, [], rounding);
    const opco = checks.find((c) => c.entity.type === "OPCO");
    expect(opco!.passed).toBe(false);
    expect(opco!.gate_type).toBe("opco_ops_before_funding");
  });

  it("fails when no OPCO tranches exist", () => {
    const checks = checkGates("2026-06-01", [], [], rounding);
    const opco = checks.find((c) => c.entity.type === "OPCO");
    expect(opco!.passed).toBe(false);
  });

  it("ignores property tranches for OpCo gate", () => {
    const events: FundingEvent[] = [
      makeEvent({
        date: "2026-04-01",
        target_entity: propEntity("p1", "Prop"),
      }),
    ];
    const checks = checkGates("2026-06-01", events, [], rounding);
    const opco = checks.find((c) => c.entity.type === "OPCO");
    expect(opco!.passed).toBe(false);
  });
});

describe("checkGates — Property gate", () => {
  const propReq: PropertyFundingRequirement = {
    property_id: "p1",
    property_name: "Prop A",
    acquisition_date: "2026-07-01",
    operations_start_date: "2027-01-01",
    total_cost: 1_500_000,
    loan_amount: 700_000,
    equity_required: 800_000,
  };

  it("passes when property fully funded by acquisition", () => {
    const events: FundingEvent[] = [
      makeEvent({
        date: "2026-07-01",
        amount: 800_000,
        target_entity: propEntity("p1", "Prop A"),
      }),
    ];
    const checks = checkGates("2026-06-01", events, [propReq], rounding);
    const prop = checks.find((c) => c.entity.id === "p1");
    expect(prop!.passed).toBe(true);
  });

  it("passes when overfunded", () => {
    const events: FundingEvent[] = [
      makeEvent({
        date: "2026-06-01",
        amount: 1_000_000,
        target_entity: propEntity("p1", "Prop A"),
      }),
    ];
    const checks = checkGates("2026-06-01", events, [propReq], rounding);
    const prop = checks.find((c) => c.entity.id === "p1");
    expect(prop!.passed).toBe(true);
  });

  it("detects shortfall", () => {
    const events: FundingEvent[] = [
      makeEvent({
        date: "2026-07-01",
        amount: 500_000,
        target_entity: propEntity("p1", "Prop A"),
      }),
    ];
    const checks = checkGates("2026-06-01", events, [propReq], rounding);
    const prop = checks.find((c) => c.entity.id === "p1");
    expect(prop!.passed).toBe(false);
    expect(prop!.gate_type).toBe("funding_shortfall");
    expect(prop!.shortfall_amount).toBe(300_000);
  });

  it("fails when no tranches target the property", () => {
    const checks = checkGates("2026-06-01", [], [propReq], rounding);
    const prop = checks.find((c) => c.entity.id === "p1");
    expect(prop!.passed).toBe(false);
    expect(prop!.shortfall_amount).toBe(800_000);
  });

  it("excludes funding that arrives after acquisition date", () => {
    const events: FundingEvent[] = [
      makeEvent({
        date: "2026-08-01",
        amount: 800_000,
        target_entity: propEntity("p1", "Prop A"),
      }),
    ];
    const checks = checkGates("2026-06-01", events, [propReq], rounding);
    const prop = checks.find((c) => c.entity.id === "p1");
    expect(prop!.passed).toBe(false);
  });

  it("aggregates multiple tranches for the same property", () => {
    const events: FundingEvent[] = [
      makeEvent({
        date: "2026-05-01",
        amount: 400_000,
        target_entity: propEntity("p1", "Prop A"),
        tranche_id: "t1",
      }),
      makeEvent({
        date: "2026-06-01",
        amount: 400_000,
        target_entity: propEntity("p1", "Prop A"),
        tranche_id: "t2",
      }),
    ];
    const checks = checkGates("2026-06-01", events, [propReq], rounding);
    const prop = checks.find((c) => c.entity.id === "p1");
    expect(prop!.passed).toBe(true);
  });
});

describe("checkGates — all_gates_passed flag", () => {
  it("all pass when everything is funded", () => {
    const propReq: PropertyFundingRequirement = {
      property_id: "p1",
      property_name: "Prop A",
      acquisition_date: "2026-07-01",
      operations_start_date: "2027-01-01",
      total_cost: 1_000_000,
      loan_amount: 0,
      equity_required: 1_000_000,
    };
    const events: FundingEvent[] = [
      makeEvent({
        date: "2026-06-01",
        amount: 1_000_000,
        target_entity: opcoEntity,
      }),
      makeEvent({
        date: "2026-07-01",
        amount: 1_000_000,
        target_entity: propEntity("p1", "Prop A"),
        tranche_id: "t2",
      }),
    ];
    const checks = checkGates("2026-06-01", events, [propReq], rounding);
    expect(checks.every((c) => c.passed)).toBe(true);
  });
});
