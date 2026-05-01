import { describe, it, expect } from "vitest";
import { computeDebtYield } from "../../calc/financing/debt-yield.js";
import type { DebtYieldInput } from "../../calc/financing/debt-yield.js";

const rounding = { precision: 2, bankers_rounding: false };

function makeInput(overrides: Partial<DebtYieldInput> = {}): DebtYieldInput {
  return {
    noi_annual: 500_000,
    loan_amount: 5_000_000,
    min_debt_yield: 0.08,
    rounding_policy: rounding,
    ...overrides,
  };
}

describe("computeDebtYield — basic debt yield", () => {
  it("computes debt yield = NOI / loan amount", () => {
    const result = computeDebtYield(makeInput());
    expect(result.debt_yield).toBeCloseTo(0.10, 4);
  });

  it("computes max loan from min debt yield", () => {
    const result = computeDebtYield(makeInput());
    expect(result.max_loan_debt_yield).toBe(6_250_000);
  });

  it("passes min threshold when yield > min", () => {
    const result = computeDebtYield(makeInput());
    expect(result.passes_min_threshold).toBe(true);
  });

  it("fails min threshold when yield < min", () => {
    const result = computeDebtYield(makeInput({ loan_amount: 10_000_000 }));
    expect(result.debt_yield).toBeCloseTo(0.05, 4);
    expect(result.passes_min_threshold).toBe(false);
  });
});

describe("computeDebtYield — LTV cross-check", () => {
  it("binding = ltv when LTV produces smaller max loan", () => {
    const result = computeDebtYield(makeInput({
      purchase_price: 8_000_000,
      ltv_max: 0.75,
    }));
    expect(result.max_loan_ltv).toBe(6_000_000);
    expect(result.max_loan_debt_yield).toBe(6_250_000);
    expect(result.binding_constraint).toBe("ltv");
    expect(result.max_loan_binding).toBe(6_000_000);
  });

  it("binding = debt_yield when DY produces smaller max loan", () => {
    const result = computeDebtYield(makeInput({
      purchase_price: 10_000_000,
      ltv_max: 0.75,
    }));
    expect(result.max_loan_ltv).toBe(7_500_000);
    expect(result.max_loan_debt_yield).toBe(6_250_000);
    expect(result.binding_constraint).toBe("debt_yield");
    expect(result.max_loan_binding).toBe(6_250_000);
  });
});

describe("computeDebtYield — implied metrics", () => {
  it("computes actual debt yield at binding loan", () => {
    const result = computeDebtYield(makeInput());
    expect(result.actual_debt_yield).toBeCloseTo(0.08, 4);
  });

  it("computes implied LTV when purchase price provided", () => {
    const result = computeDebtYield(makeInput({
      purchase_price: 8_000_000,
      ltv_max: 0.75,
    }));
    expect(result.implied_ltv).toBeCloseTo(6_000_000 / 8_000_000, 4);
  });
});

describe("computeDebtYield — edge cases", () => {
  it("returns null debt yield when no loan amount", () => {
    const result = computeDebtYield(makeInput({ loan_amount: undefined }));
    expect(result.debt_yield).toBeNull();
    expect(result.passes_min_threshold).toBeNull();
  });

  it("returns null max loan when no min debt yield", () => {
    const result = computeDebtYield(makeInput({ min_debt_yield: undefined }));
    expect(result.max_loan_debt_yield).toBeNull();
    expect(result.binding_constraint).toBe("none");
  });

  it("binding = none when only debt yield constraint (no LTV)", () => {
    const result = computeDebtYield(makeInput());
    expect(result.binding_constraint).toBe("none");
    expect(result.max_loan_binding).toBe(6_250_000);
  });
});
