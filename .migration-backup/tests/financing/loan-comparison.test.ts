import { describe, it, expect } from "vitest";
import { compareLoanScenarios } from "../../calc/financing/loan-comparison.js";
import type { LoanScenario } from "../../calc/financing/loan-comparison.js";
import { DEFAULT_ACCOUNTING_POLICY } from "../../domain/types/accounting-policy.js";
import type { RoundingPolicy } from "../../domain/types/rounding.js";

const rounding: RoundingPolicy = { precision: 2, bankers_rounding: false };

function makeScenario(label: string, rate: number, overrides: Record<string, any> = {}): LoanScenario {
  return {
    label,
    input: {
      purchase_date: "2026-04-01",
      purchase_price: 2_000_000,
      loan_type: "amortizing" as const,
      interest_rate_annual: rate,
      term_months: 300,
      amortization_months: 300,
      ltv_max: 0.75,
      closing_cost_pct: 0.02,
      accounting_policy_ref: DEFAULT_ACCOUNTING_POLICY,
      rounding_policy: rounding,
      ...overrides,
    },
    noi_annual: 200_000,
  };
}

describe("compareLoanScenarios — two scenarios", () => {
  it("returns two scenario results", () => {
    const result = compareLoanScenarios([
      makeScenario("Low Rate", 0.05),
      makeScenario("High Rate", 0.08),
    ]);
    expect(result.scenarios).toHaveLength(2);
    expect(result.scenarios[0].label).toBe("Low Rate");
    expect(result.scenarios[1].label).toBe("High Rate");
  });

  it("low rate has lower total interest", () => {
    const result = compareLoanScenarios([
      makeScenario("Low Rate", 0.05),
      makeScenario("High Rate", 0.08),
    ]);
    expect(result.lowest_interest_label).toBe("Low Rate");
  });

  it("low rate has lower amortizing payment", () => {
    const result = compareLoanScenarios([
      makeScenario("Low Rate", 0.05),
      makeScenario("High Rate", 0.08),
    ]);
    expect(result.lowest_amort_payment_label).toBe("Low Rate");
    expect(result.scenarios[0].monthly_payment_amortizing).toBeLessThan(
      result.scenarios[1].monthly_payment_amortizing,
    );
  });

  it("both have same equity required (same LTV/price)", () => {
    const result = compareLoanScenarios([
      makeScenario("Low Rate", 0.05),
      makeScenario("High Rate", 0.08),
    ]);
    expect(result.scenarios[0].equity_required).toBe(result.scenarios[1].equity_required);
  });

  it("low rate has better DSCR when NOI provided", () => {
    const result = compareLoanScenarios([
      makeScenario("Low Rate", 0.05),
      makeScenario("High Rate", 0.08),
    ]);
    expect(result.best_dscr_label).toBe("Low Rate");
    expect(result.scenarios[0].dscr_amortizing).toBeGreaterThan(
      result.scenarios[1].dscr_amortizing!,
    );
  });

  it("comparison deltas include all expected fields", () => {
    const result = compareLoanScenarios([
      makeScenario("Low Rate", 0.05),
      makeScenario("High Rate", 0.08),
    ]);
    const fields = result.comparison_deltas.map(d => d.field);
    expect(fields).toContain("Loan Amount");
    expect(fields).toContain("Equity Required");
    expect(fields).toContain("Monthly Payment (Amortizing)");
    expect(fields).toContain("Total Interest Paid");
    expect(fields).toContain("Balloon at Maturity");
  });
});

describe("compareLoanScenarios — IO scenario", () => {
  it("tracks IO months and payments", () => {
    const result = compareLoanScenarios([
      makeScenario("No IO", 0.06),
      makeScenario("With IO", 0.06, {
        loan_type: "IO_then_amortizing",
        term_months: 360,
        amortization_months: 300,
      }),
    ]);
    const ioScenario = result.scenarios.find(s => s.label === "With IO");
    expect(ioScenario).toBeDefined();
    expect(ioScenario!.has_io_period).toBe(true);
    expect(ioScenario!.io_months).toBeGreaterThan(0);
    expect(ioScenario!.monthly_payment_io).not.toBeNull();

    const noIO = result.scenarios.find(s => s.label === "No IO");
    expect(noIO!.has_io_period).toBe(false);
    expect(noIO!.monthly_payment_io).toBeNull();
  });
});

describe("compareLoanScenarios — error cases", () => {
  it("throws when fewer than 2 scenarios provided", () => {
    expect(() => compareLoanScenarios([
      makeScenario("Only One", 0.06),
    ])).toThrow("Loan comparison requires at least 2 scenarios");
  });
});

describe("compareLoanScenarios — debt yield", () => {
  it("computes debt yield when NOI provided", () => {
    const result = compareLoanScenarios([
      makeScenario("A", 0.05),
      makeScenario("B", 0.07),
    ]);
    for (const s of result.scenarios) {
      expect(s.debt_yield).not.toBeNull();
      expect(s.debt_yield!).toBeCloseTo(200_000 / s.loan_amount, 4);
    }
  });
});

describe("compareLoanScenarios — balloon at maturity", () => {
  it("fully amortizing has zero balloon", () => {
    const result = compareLoanScenarios([
      makeScenario("A", 0.05),
      makeScenario("B", 0.07),
    ]);
    for (const s of result.scenarios) {
      expect(s.balloon_at_maturity).toBe(0);
    }
  });
});
