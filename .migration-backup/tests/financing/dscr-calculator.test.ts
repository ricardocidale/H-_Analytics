import { describe, it, expect } from "vitest";
import { computeDSCR } from "../../calc/financing/dscr-calculator.js";
import type { DSCRInput } from "../../calc/financing/dscr-calculator.js";

const rounding = { precision: 2, bankers_rounding: false };

function makeInput(overrides: Partial<DSCRInput> = {}): DSCRInput {
  return {
    noi_annual: 120_000,
    interest_rate_annual: 0.06,
    term_months: 360,
    amortization_months: 360,
    min_dscr: 1.25,
    rounding_policy: rounding,
    ...overrides,
  };
}

describe("computeDSCR — fully amortizing", () => {
  it("computes max annual DS = NOI / min DSCR", () => {
    const result = computeDSCR(makeInput());
    expect(result.annual_debt_service_amortizing).toBeCloseTo(120_000 / 1.25, 0);
  });

  it("max loan is reverse-PMT solution", () => {
    const result = computeDSCR(makeInput());
    expect(result.max_loan_dscr).toBeGreaterThan(0);
    const maxMonthlyDS = (120_000 / 1.25) / 12;
    const monthlyRate = 0.06 / 12;
    const n = 360;
    const factor = Math.pow(1 + monthlyRate, n);
    const expectedLoan = maxMonthlyDS * (factor - 1) / (monthlyRate * factor);
    expect(result.max_loan_dscr).toBeCloseTo(expectedLoan, -1);
  });

  it("actual DSCR at binding loan is >= min DSCR", () => {
    const result = computeDSCR(makeInput());
    expect(result.actual_dscr).toBeGreaterThanOrEqual(1.25);
  });

  it("no IO fields when io_months = 0", () => {
    const result = computeDSCR(makeInput());
    expect(result.monthly_payment_io).toBeNull();
    expect(result.annual_debt_service_io).toBeNull();
    expect(result.io_dscr).toBeNull();
  });

  it("binding = none when no LTV constraint", () => {
    const result = computeDSCR(makeInput());
    expect(result.binding_constraint).toBe("none");
  });
});

describe("computeDSCR — with IO period", () => {
  it("IO payment = loan × monthly rate", () => {
    const result = computeDSCR(makeInput({ io_months: 24 }));
    expect(result.monthly_payment_io).toBeDefined();
    expect(result.monthly_payment_io).toBeCloseTo(
      result.max_loan_binding * (0.06 / 12), 0,
    );
  });

  it("IO DSCR > amortizing DSCR (IO payment smaller)", () => {
    const result = computeDSCR(makeInput({ io_months: 24 }));
    expect(result.io_dscr).toBeDefined();
    expect(result.io_dscr!).toBeGreaterThan(result.actual_dscr);
  });
});

describe("computeDSCR — full IO (io_months >= term)", () => {
  it("max loan = maxMonthlyDS / monthlyRate for full IO", () => {
    const result = computeDSCR(makeInput({
      io_months: 360,
      term_months: 360,
    }));
    const maxMonthlyDS = (120_000 / 1.25) / 12;
    const monthlyRate = 0.06 / 12;
    expect(result.max_loan_dscr).toBeCloseTo(maxMonthlyDS / monthlyRate, -1);
  });

  it("amortizing DS field uses IO value for full IO", () => {
    const result = computeDSCR(makeInput({
      io_months: 360,
      term_months: 360,
    }));
    expect(result.annual_debt_service_amortizing).toBeCloseTo(
      result.annual_debt_service_io!, 0,
    );
  });
});

describe("computeDSCR — LTV cross-check", () => {
  it("binding = ltv when LTV constraint is tighter", () => {
    const result = computeDSCR(makeInput({
      purchase_price: 1_000_000,
      ltv_max: 0.60,
    }));
    if (result.max_loan_dscr > 600_000) {
      expect(result.binding_constraint).toBe("ltv");
      expect(result.max_loan_binding).toBe(600_000);
      expect(result.max_loan_ltv).toBe(600_000);
    }
  });

  it("implied LTV computed when purchase price provided", () => {
    const result = computeDSCR(makeInput({
      purchase_price: 2_000_000,
      ltv_max: 0.75,
    }));
    expect(result.implied_ltv).toBeDefined();
    expect(result.implied_ltv!).toBeCloseTo(
      result.max_loan_binding / 2_000_000, 4,
    );
  });
});

describe("computeDSCR — edge cases", () => {
  it("handles zero NOI", () => {
    const result = computeDSCR(makeInput({ noi_annual: 0 }));
    expect(result.max_loan_dscr).toBe(0);
    expect(result.actual_dscr).toBe(0);
  });
});
