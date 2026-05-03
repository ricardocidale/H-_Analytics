import { describe, it, expect } from "vitest";
import { computeExitValuation } from "./exit-valuation.js";

const RP = { precision: 2, bankers_rounding: false };

describe("computeExitValuation()", () => {
  it("computes gross sale price as NOI / exit cap rate", () => {
    const out = computeExitValuation({
      stabilized_noi: 1_000_000,
      exit_cap_rate: 0.08,
      commission_rate: 0.05,
      outstanding_debt: 0,
      rounding_policy: RP,
    });
    expect(out.gross_sale_price).toBeCloseTo(12_500_000, 2);
  });

  it("returns gross 0 when exit cap rate is 0 (no division by zero)", () => {
    const out = computeExitValuation({
      stabilized_noi: 500_000,
      exit_cap_rate: 0,
      rounding_policy: RP,
    });
    expect(out.gross_sale_price).toBe(0);
  });

  it("walks gross → commission → closing → debt repayment → net to equity", () => {
    const out = computeExitValuation({
      stabilized_noi: 1_000_000,
      exit_cap_rate: 0.08, // gross = 12,500,000
      commission_rate: 0.04, // commission = 500,000
      other_closing_costs: 100_000,
      outstanding_debt: 5_000_000,
      rounding_policy: RP,
    });
    expect(out.commission).toBeCloseTo(500_000, 2);
    // net_sale_proceeds = 12.5M - 500k - 100k = 11.9M
    expect(out.net_sale_proceeds).toBeCloseTo(11_900_000, 2);
    expect(out.debt_repayment).toBeCloseTo(5_000_000, 2);
    // net_to_equity = 11.9M - 5M = 6.9M
    expect(out.net_to_equity).toBeCloseTo(6_900_000, 2);
    expect(out.debt_free_at_exit).toBe(true);
  });

  it("flags debt_free_at_exit=false when debt exceeds net proceeds", () => {
    const out = computeExitValuation({
      stabilized_noi: 100_000,
      exit_cap_rate: 0.10, // gross = 1,000,000
      commission_rate: 0.05,
      outstanding_debt: 2_000_000,
      rounding_policy: RP,
    });
    expect(out.net_to_equity).toBeLessThan(0);
    expect(out.debt_free_at_exit).toBe(false);
  });

  it("computes implied price per key when room_count is provided", () => {
    const out = computeExitValuation({
      stabilized_noi: 1_000_000,
      exit_cap_rate: 0.08, // gross = 12,500,000
      room_count: 100,
      rounding_policy: RP,
    });
    expect(out.implied_price_per_key).toBeCloseTo(125_000, 2);
  });

  it("returns null implied_price_per_key when room_count is missing or zero", () => {
    const out = computeExitValuation({
      stabilized_noi: 1_000_000,
      exit_cap_rate: 0.08,
      rounding_policy: RP,
    });
    expect(out.implied_price_per_key).toBeNull();
  });
});
