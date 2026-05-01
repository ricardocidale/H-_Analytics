import { describe, it, expect } from "vitest";
import { computeAcqSizing } from "../../calc/financing/sizing.js";
import type { RoundingPolicy } from "../../domain/types/rounding.js";

const rounding: RoundingPolicy = { precision: 2, bankers_rounding: false };

describe("computeAcqSizing — LTV", () => {
  it("sizes loan by LTV", () => {
    const result = computeAcqSizing(2_300_000, 0.75, undefined, rounding);
    expect(result.loan_amount).toBe(1_725_000);
    expect(result.ltv_binding).toBe(true);
    expect(result.override_binding).toBe(false);
  });

  it("handles low LTV", () => {
    const result = computeAcqSizing(1_000_000, 0.50, undefined, rounding);
    expect(result.loan_amount).toBe(500_000);
  });

  it("handles 100% LTV", () => {
    const result = computeAcqSizing(1_000_000, 1.0, undefined, rounding);
    expect(result.loan_amount).toBe(1_000_000);
  });
});

describe("computeAcqSizing — override", () => {
  it("uses override amount directly", () => {
    const result = computeAcqSizing(2_300_000, undefined, 1_500_000, rounding);
    expect(result.loan_amount).toBe(1_500_000);
    expect(result.ltv_binding).toBe(false);
    expect(result.override_binding).toBe(true);
  });

  it("override can exceed LTV-equivalent", () => {
    // Override doesn't check against purchase price
    const result = computeAcqSizing(1_000_000, undefined, 900_000, rounding);
    expect(result.loan_amount).toBe(900_000);
    expect(result.override_binding).toBe(true);
  });
});

describe("computeAcqSizing — edge cases", () => {
  it("LTV of 0 results in zero loan", () => {
    const result = computeAcqSizing(2_300_000, 0, undefined, rounding);
    expect(result.loan_amount).toBe(0);
  });

  it("no LTV or override defaults to zero loan", () => {
    // Both undefined — validation should catch this upstream
    const result = computeAcqSizing(2_300_000, undefined, undefined, rounding);
    expect(result.loan_amount).toBe(0);
    expect(result.ltv_binding).toBe(true);
  });
});
