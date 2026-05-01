import { describe, it, expect } from "vitest";
import { computeInterestRateSwap } from "../../calc/financing/interest-rate-swap.js";
import type { InterestRateSwapInput } from "../../calc/financing/interest-rate-swap.js";

const rounding = { precision: 2, bankers_rounding: false };

function makeInput(overrides: Partial<InterestRateSwapInput> = {}): InterestRateSwapInput {
  return {
    notional_amount: 3000000,
    fixed_rate: 0.065,
    floating_rate_current: 0.055,
    floating_rate_spread: 0.015,
    swap_term_years: 5,
    payment_frequency: 4,
    rounding_policy: rounding,
    ...overrides,
  };
}

describe("Interest Rate Swap Calculator", () => {
  it("computes all-in floating rate", () => {
    const result = computeInterestRateSwap(makeInput());
    expect(result.all_in_floating_rate).toBe(0.07);
  });

  it("computes annual fixed and floating costs", () => {
    const result = computeInterestRateSwap(makeInput());
    expect(result.annual_fixed_cost).toBe(195000);
    expect(result.annual_floating_cost).toBe(210000);
  });

  it("negative net payment means fixed payer receives", () => {
    const result = computeInterestRateSwap(makeInput());
    expect(result.annual_net_swap_payment).toBe(-15000);
    expect(result.current_payer).toBe("floating_payer");
  });

  it("generates correct number of period cash flows", () => {
    const result = computeInterestRateSwap(makeInput());
    expect(result.total_periods).toBe(20);
    expect(result.period_cash_flows.length).toBe(20);
  });

  it("computes breakeven floating rate", () => {
    const result = computeInterestRateSwap(makeInput());
    expect(result.breakeven_floating_rate).toBe(0.05);
  });

  it("generates rate scenarios", () => {
    const result = computeInterestRateSwap(makeInput());
    expect(result.rate_scenarios.length).toBeGreaterThan(0);
  });

  it("swap is favorable when floating rates are high", () => {
    const result = computeInterestRateSwap(makeInput({
      floating_rate_current: 0.07,
      floating_rate_spread: 0.02,
    }));
    expect(result.current_payer).toBe("floating_payer");
  });

  it("swap is unfavorable when floating rates are low", () => {
    const result = computeInterestRateSwap(makeInput({
      floating_rate_current: 0.03,
      floating_rate_spread: 0.01,
    }));
    expect(result.current_payer).toBe("fixed_payer");
  });

  it("computes DSCR when NOI provided", () => {
    const result = computeInterestRateSwap(makeInput({ noi_annual: 500000 }));
    for (const scenario of result.rate_scenarios) {
      expect(scenario.dscr_with_swap).not.toBeNull();
      expect(scenario.dscr_without_swap).not.toBeNull();
    }
  });

  it("DSCR is null when NOI not provided", () => {
    const result = computeInterestRateSwap(makeInput());
    for (const scenario of result.rate_scenarios) {
      expect(scenario.dscr_with_swap).toBeNull();
      expect(scenario.dscr_without_swap).toBeNull();
    }
  });

  it("total swap cost over term accumulates correctly", () => {
    const result = computeInterestRateSwap(makeInput());
    expect(result.total_swap_cost_over_term).toBe(result.annual_net_swap_payment * 5);
  });

  it("supports monthly payment frequency", () => {
    const result = computeInterestRateSwap(makeInput({ payment_frequency: 12 }));
    expect(result.total_periods).toBe(60);
    expect(result.periods_per_year).toBe(12);
  });

  it("provides swap recommendation", () => {
    const result = computeInterestRateSwap(makeInput());
    expect(["favorable", "unfavorable", "neutral"]).toContain(result.swap_recommendation);
  });
});
