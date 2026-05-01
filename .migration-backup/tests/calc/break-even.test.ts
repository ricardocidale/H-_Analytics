import { describe, it, expect } from "vitest";
import { computeBreakEven } from "../../calc/analysis/break-even.js";
import type { BreakEvenInput } from "../../calc/analysis/break-even.js";

function makeInput(overrides: Partial<BreakEvenInput> = {}): BreakEvenInput {
  return {
    room_count: 20,
    adr: 300,
    days_per_month: 30.5,
    variable_cost_rate: 0.30,
    fixed_costs_monthly: 50000,
    management_fee_rate: 0,
    ffe_reserve_rate: 0,
    monthly_debt_service: 0,
    monthly_income_tax_estimate: 0,
    ancillary_revenue_pct: 0,
    ...overrides,
  };
}

describe("computeBreakEven — operating break-even", () => {
  it("solves occupancy where NOI = 0 (no debt, no tax)", () => {
    const result = computeBreakEven(makeInput());
    const denominator = 20 * 300 * 30.5 * 1.0 * 0.70;
    const expectedOcc = 50000 / denominator;
    expect(result.operating_break_even.occupancy).toBeCloseTo(expectedOcc, 4);
    expect(result.cash_flow_break_even.occupancy).toBeCloseTo(expectedOcc, 4);
  });

  it("revpar = ADR × occupancy", () => {
    const result = computeBreakEven(makeInput());
    const occ = result.operating_break_even.occupancy;
    expect(result.operating_break_even.revpar).toBeCloseTo(300 * occ, 1);
  });

  it("monthly revenue at break-even approximately covers fixed costs", () => {
    const result = computeBreakEven(makeInput());
    const occ = result.operating_break_even.occupancy;
    const roomRev = 20 * 300 * 30.5 * occ;
    const variableCost = roomRev * 0.30;
    expect(roomRev - variableCost).toBeCloseTo(50000, -1);
  });
});

describe("computeBreakEven — cash flow break-even with debt", () => {
  it("cash flow break-even is higher when debt service is added", () => {
    const result = computeBreakEven(makeInput({
      monthly_debt_service: 10000,
      monthly_income_tax_estimate: 5000,
    }));
    const opOcc = computeBreakEven(makeInput()).operating_break_even.occupancy;
    expect(result.cash_flow_break_even.occupancy).toBeGreaterThan(opOcc);
    const expectedOcc = (50000 + 15000) / (20 * 300 * 30.5 * 0.70);
    expect(result.cash_flow_break_even.occupancy).toBeCloseTo(expectedOcc, 4);
  });
});

describe("computeBreakEven — management fees and FFE", () => {
  it("management fees reduce contribution margin", () => {
    const withFees = computeBreakEven(makeInput({ management_fee_rate: 0.05 }));
    const withoutFees = computeBreakEven(makeInput());
    expect(withFees.operating_break_even.occupancy).toBeGreaterThan(
      withoutFees.operating_break_even.occupancy,
    );
  });

  it("FFE reserve reduces contribution margin", () => {
    const withFFE = computeBreakEven(makeInput({ ffe_reserve_rate: 0.04 }));
    const withoutFFE = computeBreakEven(makeInput({ ffe_reserve_rate: 0 }));
    expect(withFFE.operating_break_even.occupancy).toBeGreaterThan(
      withoutFFE.operating_break_even.occupancy,
    );
  });
});

describe("computeBreakEven — ancillary revenue", () => {
  it("ancillary revenue lowers break-even occupancy", () => {
    const withAnc = computeBreakEven(makeInput({ ancillary_revenue_pct: 0.20 }));
    const withoutAnc = computeBreakEven(makeInput());
    expect(withAnc.operating_break_even.occupancy).toBeLessThan(
      withoutAnc.operating_break_even.occupancy,
    );
  });
});

describe("computeBreakEven — sensitivity", () => {
  it("ADR drop 10% raises break-even occupancy", () => {
    const result = computeBreakEven(makeInput({ monthly_debt_service: 5000 }));
    expect(result.sensitivity.adr_drop_10pct_break_even).toBeGreaterThan(
      result.cash_flow_break_even.occupancy,
    );
  });

  it("fixed cost +10% raises break-even occupancy", () => {
    const result = computeBreakEven(makeInput({ monthly_debt_service: 5000 }));
    expect(result.sensitivity.fixed_cost_up_10pct_break_even).toBeGreaterThan(
      result.cash_flow_break_even.occupancy,
    );
  });
});

describe("computeBreakEven — edge cases", () => {
  it("contribution margin <= 0 returns occupancy 1.0", () => {
    const result = computeBreakEven(makeInput({ variable_cost_rate: 1.0 }));
    expect(result.operating_break_even.occupancy).toBe(1.0);
  });

  it("zero rooms returns occupancy 1.0", () => {
    const result = computeBreakEven(makeInput({ room_count: 0 }));
    expect(result.operating_break_even.occupancy).toBe(1.0);
  });

  it("zero fixed costs returns occupancy 0", () => {
    const result = computeBreakEven(makeInput({ fixed_costs_monthly: 0 }));
    expect(result.operating_break_even.occupancy).toBe(0);
  });
});
