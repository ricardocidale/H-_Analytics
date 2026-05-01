import { describe, it, expect } from "vitest";
import { computeHoldVsSell } from "../../calc/analysis/hold-vs-sell.js";
import type { HoldVsSellInput } from "../../calc/analysis/hold-vs-sell.js";

const rounding = { precision: 2, bankers_rounding: false };

function makeInput(overrides: Partial<HoldVsSellInput> = {}): HoldVsSellInput {
  return {
    current_noi: 500000,
    noi_growth_rate: 0.03,
    current_market_value: 6000000,
    exit_cap_rate: 0.085,
    remaining_hold_years: 5,
    discount_rate: 0.10,
    outstanding_debt: 3000000,
    commission_rate: 0.05,
    annual_capex: 50000,
    annual_debt_service: 250000,
    rounding_policy: rounding,
    ...overrides,
  };
}

describe("Hold vs Sell Calculator", () => {
  it("projects NOI growth over hold period", () => {
    const result = computeHoldVsSell(makeInput());
    expect(result.hold.projected_noi.length).toBe(5);
    expect(result.hold.projected_noi[0]).toBe(500000);
    expect(result.hold.projected_noi[4]).toBeGreaterThan(500000);
  });

  it("projected FCF accounts for capex and debt service", () => {
    const result = computeHoldVsSell(makeInput());
    expect(result.hold.projected_fcf[0]).toBe(200000);
  });

  it("computes terminal value from exit cap rate", () => {
    const result = computeHoldVsSell(makeInput());
    expect(result.hold.terminal_value).toBeGreaterThan(0);
    expect(result.hold.terminal_noi).toBeGreaterThan(500000);
  });

  it("computes NPV of hold scenario", () => {
    const result = computeHoldVsSell(makeInput());
    expect(result.hold.npv_hold).toBeGreaterThan(0);
  });

  it("computes sell scenario correctly", () => {
    const result = computeHoldVsSell(makeInput());
    expect(result.sell.gross_sale_price).toBe(6000000);
    expect(result.sell.commission).toBe(300000);
    expect(result.sell.net_sale_proceeds).toBe(5700000);
    expect(result.sell.debt_repayment).toBe(3000000);
  });

  it("makes a recommendation", () => {
    const result = computeHoldVsSell(makeInput());
    expect(["hold", "sell", "indifferent"]).toContain(result.recommendation);
  });

  it("computes implied exit yield", () => {
    const result = computeHoldVsSell(makeInput());
    expect(result.implied_exit_yield).toBeCloseTo(0.0833, 3);
  });

  it("NPV advantage is positive for hold when growth is strong", () => {
    const result = computeHoldVsSell(makeInput({ noi_growth_rate: 0.08 }));
    expect(result.npv_advantage_hold).toBeGreaterThan(0);
  });

  it("recommends sell when NOI is declining", () => {
    const result = computeHoldVsSell(makeInput({ noi_growth_rate: -0.10 }));
    expect(result.recommendation).toBe("sell");
  });

  it("handles no debt scenario", () => {
    const result = computeHoldVsSell(makeInput({
      outstanding_debt: 0,
      annual_debt_service: 0,
    }));
    expect(result.sell.debt_repayment).toBe(0);
    expect(result.hold.projected_fcf[0]).toBe(450000);
  });

  it("applies capital gains tax when cost basis provided", () => {
    const result = computeHoldVsSell(makeInput({
      original_cost_basis: 4000000,
      accumulated_depreciation: 500000,
      capital_gains_rate: 0.20,
      depreciation_recapture_rate: 0.25,
    }));
    expect(result.sell.capital_gains_tax).toBeGreaterThanOrEqual(0);
    expect(result.sell.depreciation_recapture_tax).toBeGreaterThanOrEqual(0);
    expect(result.sell.net_after_tax_proceeds).toBeLessThan(result.sell.net_sale_proceeds);
  });

  it("computes opportunity cost of hold", () => {
    const result = computeHoldVsSell(makeInput());
    expect(result.opportunity_cost_of_hold).toBeGreaterThan(0);
  });

  it("computes breakeven NOI growth rate", () => {
    const result = computeHoldVsSell(makeInput());
    expect(typeof result.breakeven_noi_growth).toBe("number");
  });
});
