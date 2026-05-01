import { describe, it, expect } from "vitest";
import { computeRefinance } from "../../calc/refinance/refinance-calculator.js";
import { DEFAULT_ACCOUNTING_POLICY } from "../../domain/types/accounting-policy.js";
import type { RefinanceInput } from "../../calc/refinance/types.js";
import type { RoundingPolicy } from "../../domain/types/rounding.js";

const rounding: RoundingPolicy = { precision: 2, bankers_rounding: false };

function baseInput(overrides: Partial<RefinanceInput> = {}): RefinanceInput {
  return {
    refinance_date: "2029-04-01",
    current_loan_balance: 800_000,
    valuation: { method: "direct", property_value_at_refi: 2_000_000 },
    ltv_max: 0.65,
    closing_cost_pct: 0.03,
    prepayment_penalty: { type: "none", value: 0 },
    new_loan_terms: {
      rate_annual: 0.07,
      term_months: 300,
      amortization_months: 300,
      io_months: 0,
    },
    accounting_policy_ref: DEFAULT_ACCOUNTING_POLICY,
    rounding_policy: rounding,
    ...overrides,
  };
}

describe("flags — ltv_binding", () => {
  it("is true when no DSCR constraint", () => {
    const result = computeRefinance(baseInput());
    expect(result.flags.ltv_binding).toBe(true);
    expect(result.flags.dscr_binding).toBe(false);
  });

  it("is true when DSCR is not binding", () => {
    const result = computeRefinance(
      baseInput({ dscr_min: 1.1, noi_for_dscr: 200_000 }),
    );
    expect(result.flags.ltv_binding).toBe(true);
    expect(result.flags.dscr_binding).toBe(false);
  });
});

describe("flags — dscr_binding", () => {
  it("is true when DSCR constrains below LTV", () => {
    const result = computeRefinance(
      baseInput({
        ltv_max: 0.75,
        dscr_min: 1.25,
        noi_for_dscr: 100_000,
      }),
    );
    expect(result.flags.dscr_binding).toBe(true);
    expect(result.flags.ltv_binding).toBe(false);
    expect(result.new_loan_amount_gross).toBeLessThan(2_000_000 * 0.75);
  });
});

describe("flags — negative_cash_out", () => {
  it("is true when payoff exceeds net proceeds", () => {
    const result = computeRefinance(
      baseInput({ current_loan_balance: 1_400_000 }),
    );
    expect(result.flags.negative_cash_out).toBe(true);
    expect(result.cash_out_to_equity).toBe(0);
  });

  it("is false when net proceeds exceed payoff", () => {
    const result = computeRefinance(
      baseInput({ current_loan_balance: 500_000 }),
    );
    expect(result.flags.negative_cash_out).toBe(false);
    expect(result.cash_out_to_equity).toBeGreaterThan(0);
  });
});

describe("flags — invalid_inputs", () => {
  it("returns errors for invalid ltv_max", () => {
    const result = computeRefinance(baseInput({ ltv_max: 0 }));
    expect(result.flags.invalid_inputs.length).toBeGreaterThan(0);
    expect(result.flags.invalid_inputs[0]).toContain("ltv_max");
    expect(result.new_loan_amount_gross).toBe(0);
  });

  it("returns errors when dscr_min set without noi_for_dscr", () => {
    const result = computeRefinance(
      baseInput({ dscr_min: 1.25, noi_for_dscr: undefined }),
    );
    expect(result.flags.invalid_inputs.length).toBeGreaterThan(0);
    expect(result.flags.invalid_inputs[0]).toContain("noi_for_dscr");
  });

  it("returns errors for negative balance", () => {
    const result = computeRefinance(
      baseInput({ current_loan_balance: -100 }),
    );
    expect(result.flags.invalid_inputs.length).toBeGreaterThan(0);
  });

  it("returns errors when io_months >= term_months", () => {
    const result = computeRefinance(
      baseInput({
        new_loan_terms: {
          rate_annual: 0.07,
          term_months: 24,
          amortization_months: 300,
          io_months: 24,
        },
      }),
    );
    expect(result.flags.invalid_inputs.length).toBeGreaterThan(0);
    expect(result.flags.invalid_inputs[0]).toContain("io_months");
  });

  it("returns empty schedule and zero amounts on validation failure", () => {
    const result = computeRefinance(baseInput({ ltv_max: 0 }));
    expect(result.new_debt_service_schedule).toHaveLength(0);
    expect(result.journal_hooks).toHaveLength(0);
    expect(result.proceeds_breakdown).toHaveLength(0);
  });
});
