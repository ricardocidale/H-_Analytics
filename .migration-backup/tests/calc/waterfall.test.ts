import { describe, it, expect } from "vitest";
import { computeWaterfall } from "../../calc/analysis/waterfall.js";
import type { WaterfallInput, WaterfallTier } from "../../calc/analysis/waterfall.js";

const rounding = { precision: 2, bankers_rounding: false };

const standardTiers: WaterfallTier[] = [
  { label: "Tier 1: 8-12% IRR", hurdle_irr: 0.08, lp_split: 0.80, gp_split: 0.20 },
  { label: "Tier 2: 12-18% IRR", hurdle_irr: 0.12, lp_split: 0.70, gp_split: 0.30 },
  { label: "Tier 3: 18%+ IRR", hurdle_irr: 0.18, lp_split: 0.60, gp_split: 0.40 },
];

function makeInput(overrides: Partial<WaterfallInput> = {}): WaterfallInput {
  return {
    total_equity_invested: 1000000,
    lp_equity: 900000,
    gp_equity: 100000,
    distributable_cash_flows: [500000, 600000, 800000],
    preferred_return: 0.08,
    tiers: standardTiers,
    rounding_policy: rounding,
    ...overrides,
  };
}

describe("Waterfall Distribution Calculator", () => {
  it("computes total distributable from cash flows", () => {
    const result = computeWaterfall(makeInput());
    expect(result.total_distributable).toBe(1900000);
  });

  it("returns capital first", () => {
    const result = computeWaterfall(makeInput());
    expect(result.return_of_capital).toBe(1000000);
  });

  it("pays preferred return after capital", () => {
    const result = computeWaterfall(makeInput());
    expect(result.preferred_return_amount).toBe(80000);
    expect(result.preferred_return_shortfall).toBe(0);
  });

  it("records shortfall when insufficient cash", () => {
    const result = computeWaterfall(makeInput({ distributable_cash_flows: [500000, 400000] }));
    expect(result.preferred_return_shortfall).toBeGreaterThan(0);
  });

  it("distributes remaining through tiers", () => {
    const result = computeWaterfall(makeInput());
    expect(result.tier_results.length).toBe(3);
    const totalTierDist = result.tier_results.reduce((s, t) => s + t.amount_distributed, 0);
    expect(totalTierDist).toBeGreaterThan(0);
  });

  it("LP + GP totals equal total distributable", () => {
    const result = computeWaterfall(makeInput());
    const totalDist = result.total_to_lp + result.total_to_gp;
    expect(totalDist).toBeCloseTo(result.total_distributable - result.residual_undistributed, 0);
  });

  it("computes LP and GP multiples", () => {
    const result = computeWaterfall(makeInput());
    expect(result.lp_multiple).toBeGreaterThan(1);
    expect(result.gp_multiple).toBeGreaterThan(1);
  });

  it("LP gets majority of returns in standard structure", () => {
    const result = computeWaterfall(makeInput());
    expect(result.total_to_lp).toBeGreaterThan(result.total_to_gp);
    expect(result.lp_irr_share).toBeGreaterThan(0.5);
  });

  it("handles catch-up provision", () => {
    const result = computeWaterfall(makeInput({
      catch_up_rate: 1.0,
      catch_up_to_gp_pct: 0.20,
    }));
    expect(result.catch_up_amount).toBeGreaterThan(0);
  });

  it("handles zero cash flows", () => {
    const result = computeWaterfall(makeInput({ distributable_cash_flows: [] }));
    expect(result.total_distributable).toBe(0);
    expect(result.return_of_capital).toBe(0);
    expect(result.total_to_lp).toBe(0);
    expect(result.total_to_gp).toBe(0);
  });

  it("handles exact capital return with no surplus", () => {
    const result = computeWaterfall(makeInput({ distributable_cash_flows: [1000000] }));
    expect(result.return_of_capital).toBe(1000000);
    expect(result.preferred_return_amount).toBe(0);
  });

  it("tier splits sum to 1.0", () => {
    for (const tier of standardTiers) {
      expect(tier.lp_split + tier.gp_split).toBe(1.0);
    }
  });
});
