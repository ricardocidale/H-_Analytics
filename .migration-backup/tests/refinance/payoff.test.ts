import { describe, it, expect } from "vitest";
import { computePayoff } from "../../calc/refinance/payoff.js";
import type { RoundingPolicy } from "../../domain/types/rounding.js";

const rounding: RoundingPolicy = { precision: 2, bankers_rounding: false };

describe("computePayoff", () => {
  it("returns balance only when penalty is none", () => {
    const result = computePayoff(
      800_000,
      { type: "none", value: 0 },
      0,
      rounding,
    );
    expect(result.old_loan_balance).toBe(800_000);
    expect(result.prepayment_penalty).toBe(0);
    expect(result.accrued_interest).toBe(0);
    expect(result.total).toBe(800_000);
  });

  it("computes pct_of_balance penalty correctly", () => {
    const result = computePayoff(
      800_000,
      { type: "pct_of_balance", value: 0.02 },
      0,
      rounding,
    );
    expect(result.prepayment_penalty).toBe(16_000);
    expect(result.total).toBe(816_000);
  });

  it("computes fixed penalty correctly", () => {
    const result = computePayoff(
      800_000,
      { type: "fixed", value: 25_000 },
      0,
      rounding,
    );
    expect(result.prepayment_penalty).toBe(25_000);
    expect(result.total).toBe(825_000);
  });

  it("adds accrued interest to payoff total", () => {
    const result = computePayoff(
      800_000,
      { type: "pct_of_balance", value: 0.02 },
      6_000,
      rounding,
    );
    expect(result.accrued_interest).toBe(6_000);
    expect(result.total).toBe(822_000); // 800k + 16k + 6k
  });

  it("handles zero balance", () => {
    const result = computePayoff(
      0,
      { type: "pct_of_balance", value: 0.02 },
      0,
      rounding,
    );
    expect(result.total).toBe(0);
  });
});
