import { describe, it, expect } from "vitest";
import { computePrepayment } from "../../calc/financing/prepayment.js";
import type { PrepaymentInput } from "../../calc/financing/prepayment.js";
import type { ScheduleEntry } from "../../calc/shared/types.js";

const rounding = { precision: 2, bankers_rounding: false };

function makeStepDownInput(overrides: Partial<PrepaymentInput> = {}): PrepaymentInput {
  return {
    outstanding_balance: 1_000_000,
    loan_rate_annual: 0.06,
    term_months: 120,
    prepayment_type: "step_down",
    prepayment_month: 13,
    step_down_schedule: [0.05, 0.04, 0.03, 0.02, 0.01],
    rounding_policy: rounding,
    ...overrides,
  };
}

function makeConstantSchedule(balance: number, months: number, rate: number): ScheduleEntry[] {
  const monthlyRate = rate / 12;
  const entries: ScheduleEntry[] = [];
  let runningBalance = balance;
  for (let i = 0; i < months; i++) {
    const interest = runningBalance * monthlyRate;
    const payment = interest;
    entries.push({
      month: i,
      beginning_balance: runningBalance,
      payment,
      interest,
      principal: 0,
      ending_balance: runningBalance,
      is_io: true,
    });
  }
  return entries;
}

describe("computePrepayment — step-down", () => {
  it("computes penalty using step-down schedule for year 2", () => {
    const result = computePrepayment(makeStepDownInput());
    expect(result.balance_at_prepayment).toBe(1_000_000);
    expect(result.months_remaining).toBe(120 - 13);
    expect(result.penalty_amount).toBe(40_000);
    expect(result.penalty_pct).toBeCloseTo(0.04, 4);
    expect(result.total_prepayment_cost).toBe(1_040_000);
    expect(result.details.type).toBe("step_down");
    if (result.details.type === "step_down") {
      expect(result.details.loan_year).toBe(2);
      expect(result.details.year_penalty_pct).toBe(0.04);
    }
  });

  it("uses year 1 penalty for month 0-11", () => {
    const result = computePrepayment(makeStepDownInput({ prepayment_month: 5 }));
    expect(result.penalty_amount).toBe(50_000);
    if (result.details.type === "step_down") {
      expect(result.details.loan_year).toBe(1);
      expect(result.details.year_penalty_pct).toBe(0.05);
    }
  });

  it("uses last schedule entry for years beyond schedule", () => {
    const result = computePrepayment(makeStepDownInput({ prepayment_month: 72 }));
    if (result.details.type === "step_down") {
      expect(result.details.year_penalty_pct).toBe(0.01);
    }
  });

  it("zero penalty when no step-down schedule", () => {
    const result = computePrepayment(makeStepDownInput({ step_down_schedule: [] }));
    expect(result.penalty_amount).toBe(0);
  });
});

describe("computePrepayment — yield maintenance", () => {
  it("computes PV of rate differential on constant balance", () => {
    const schedule = makeConstantSchedule(1_000_000, 120, 0.06);
    const result = computePrepayment({
      schedule,
      prepayment_month: 0,
      loan_rate_annual: 0.06,
      treasury_rate_annual: 0.04,
      term_months: 120,
      prepayment_type: "yield_maintenance",
      rounding_policy: rounding,
    });

    expect(result.balance_at_prepayment).toBe(1_000_000);
    expect(result.months_remaining).toBe(120);
    expect(result.details.type).toBe("yield_maintenance");

    if (result.details.type === "yield_maintenance") {
      expect(result.details.rate_differential).toBeCloseTo(0.02, 4);
      expect(result.details.treasury_rate).toBe(0.04);
      expect(result.details.pv_differential).toBeGreaterThan(0);
    }
    expect(result.penalty_amount).toBeGreaterThan(0);
    expect(result.total_prepayment_cost).toBeGreaterThan(1_000_000);
  });

  it("zero penalty when treasury rate >= loan rate", () => {
    const schedule = makeConstantSchedule(1_000_000, 120, 0.06);
    const result = computePrepayment({
      schedule,
      prepayment_month: 0,
      loan_rate_annual: 0.06,
      treasury_rate_annual: 0.08,
      term_months: 120,
      prepayment_type: "yield_maintenance",
      rounding_policy: rounding,
    });
    expect(result.penalty_amount).toBe(0);
  });
});

describe("computePrepayment — defeasance", () => {
  it("computes securities cost + admin fees", () => {
    const schedule = makeConstantSchedule(1_000_000, 60, 0.06);
    const result = computePrepayment({
      schedule,
      prepayment_month: 0,
      loan_rate_annual: 0.06,
      treasury_rate_annual: 0.04,
      term_months: 60,
      prepayment_type: "defeasance",
      defeasance_fee_pct: 0.01,
      rounding_policy: rounding,
    });

    expect(result.details.type).toBe("defeasance");
    if (result.details.type === "defeasance") {
      expect(result.details.admin_fees).toBe(10_000);
      expect(result.details.securities_cost).toBeGreaterThanOrEqual(0);
    }
    expect(result.penalty_amount).toBeGreaterThan(0);
    expect(result.total_prepayment_cost).toBeGreaterThan(1_000_000);
  });
});

describe("computePrepayment — balance resolution", () => {
  it("resolves balance from schedule when outstanding_balance not provided", () => {
    const schedule = makeConstantSchedule(500_000, 60, 0.06);
    const result = computePrepayment({
      schedule,
      prepayment_month: 10,
      loan_rate_annual: 0.06,
      term_months: 60,
      prepayment_type: "step_down",
      step_down_schedule: [0.05],
      rounding_policy: rounding,
    });
    expect(result.balance_at_prepayment).toBe(500_000);
  });

  it("returns 0 balance when no schedule and no outstanding_balance", () => {
    const result = computePrepayment({
      loan_rate_annual: 0.06,
      term_months: 60,
      prepayment_type: "step_down",
      step_down_schedule: [0.05],
      rounding_policy: rounding,
    });
    expect(result.balance_at_prepayment).toBe(0);
    expect(result.penalty_amount).toBe(0);
  });
});

describe("computePrepayment — treasury rate validation", () => {
  it("clamps negative treasury rate to 0 and warns", () => {
    const schedule = makeConstantSchedule(1_000_000, 60, 0.07);
    const result = computePrepayment({
      schedule,
      prepayment_month: 12,
      loan_rate_annual: 0.07,
      term_months: 60,
      prepayment_type: "yield_maintenance",
      treasury_rate_annual: -0.02,
      rounding_policy: rounding,
    });
    expect(result.warnings).toContain("Treasury rate is negative — clamping to 0%");
    expect(result.penalty_amount).toBeGreaterThanOrEqual(0);
  });

  it("warns when treasury rate exceeds loan rate", () => {
    const result = computePrepayment({
      outstanding_balance: 1_000_000,
      loan_rate_annual: 0.06,
      term_months: 60,
      prepayment_type: "yield_maintenance",
      treasury_rate_annual: 0.08,
      rounding_policy: rounding,
    });
    expect(result.warnings.some(w => w.includes("exceeds loan rate"))).toBe(true);
  });

  it("warns when treasury rate is unusually high (>15%)", () => {
    const result = computePrepayment({
      outstanding_balance: 1_000_000,
      loan_rate_annual: 0.20,
      term_months: 60,
      prepayment_type: "yield_maintenance",
      treasury_rate_annual: 0.18,
      rounding_policy: rounding,
    });
    expect(result.warnings.some(w => w.includes("unusually high"))).toBe(true);
  });

  it("returns empty warnings for normal treasury rate", () => {
    const result = computePrepayment(makeStepDownInput({
      treasury_rate_annual: 0.04,
    }));
    expect(result.warnings).toEqual([]);
  });
});
