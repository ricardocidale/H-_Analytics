import { describe, it, expect } from "vitest";
import { computeClosingCosts } from "../../calc/financing/closing-costs.js";
import type { RoundingPolicy } from "../../domain/types/rounding.js";

const rounding: RoundingPolicy = { precision: 2, bankers_rounding: false };

describe("computeClosingCosts", () => {
  it("computes pct-based costs correctly", () => {
    const result = computeClosingCosts(1_725_000, 0.02, 0, rounding);
    expect(result.pct_based).toBe(34_500);
    expect(result.fixed_fees).toBe(0);
    expect(result.total).toBe(34_500);
  });

  it("computes fixed fees correctly", () => {
    const result = computeClosingCosts(1_000_000, 0, 5_000, rounding);
    expect(result.pct_based).toBe(0);
    expect(result.fixed_fees).toBe(5_000);
    expect(result.total).toBe(5_000);
  });

  it("combines pct and fixed fees", () => {
    const result = computeClosingCosts(1_725_000, 0.02, 5_000, rounding);
    expect(result.pct_based).toBe(34_500);
    expect(result.fixed_fees).toBe(5_000);
    expect(result.total).toBe(39_500);
  });

  it("handles zero costs", () => {
    const result = computeClosingCosts(1_000_000, 0, 0, rounding);
    expect(result.total).toBe(0);
  });

  it("rounds fractional costs correctly", () => {
    // 1,000,001 * 0.03 = 30,000.03
    const result = computeClosingCosts(1_000_001, 0.03, 0, rounding);
    expect(result.pct_based).toBe(30_000.03);
  });
});
