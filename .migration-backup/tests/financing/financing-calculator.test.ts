import { describe, it, expect } from "vitest";
import { computeFinancing } from "../../calc/financing/financing-calculator.js";
import { DEFAULT_ACCOUNTING_POLICY } from "../../domain/types/accounting-policy.js";
import type { FinancingInput } from "../../calc/financing/types.js";
import type { RoundingPolicy } from "../../domain/types/rounding.js";

const rounding: RoundingPolicy = { precision: 2, bankers_rounding: false };

function baseInput(overrides: Partial<FinancingInput> = {}): FinancingInput {
  return {
    purchase_date: "2026-04-01",
    purchase_price: 2_000_000,
    loan_type: "amortizing",
    interest_rate_annual: 0.07,
    term_months: 300,
    amortization_months: 300,
    ltv_max: 0.75,
    closing_cost_pct: 0.02,
    accounting_policy_ref: DEFAULT_ACCOUNTING_POLICY,
    rounding_policy: rounding,
    ...overrides,
  };
}

describe("computeFinancing — fully amortizing", () => {
  it("produces a fully amortizing schedule", () => {
    const result = computeFinancing(baseInput());
    expect(result.debt_service_schedule).toHaveLength(300);
    expect(result.debt_service_schedule.every((e) => !e.is_io)).toBe(true);
    expect(result.debt_service_schedule[299].ending_balance).toBe(0);
  });

  it("loan net = gross - closing costs", () => {
    const result = computeFinancing(baseInput());
    expect(result.loan_amount_net).toBe(
      result.loan_amount_gross - result.closing_costs.total,
    );
  });
});

describe("computeFinancing — IO then amortizing", () => {
  it("generates IO-then-amort schedule", () => {
    const result = computeFinancing(
      baseInput({
        loan_type: "IO_then_amortizing",
        term_months: 360,
        amortization_months: 300,
      }),
    );
    const schedule = result.debt_service_schedule;
    expect(schedule).toHaveLength(360);

    // First 60 months are IO (360 - 300 = 60)
    for (let m = 0; m < 60; m++) {
      expect(schedule[m].is_io).toBe(true);
      expect(schedule[m].principal).toBe(0);
    }

    // Month 60 starts amortizing
    expect(schedule[60].is_io).toBe(false);
    expect(schedule[60].principal).toBeGreaterThan(0);

    // Final month
    expect(schedule[359].ending_balance).toBe(0);
  });

  it("balance unchanged during IO period", () => {
    const result = computeFinancing(
      baseInput({
        loan_type: "IO_then_amortizing",
        term_months: 360,
        amortization_months: 300,
      }),
    );
    const loanAmt = result.loan_amount_gross;
    for (let m = 0; m < 60; m++) {
      expect(result.debt_service_schedule[m].beginning_balance).toBe(loanAmt);
      expect(result.debt_service_schedule[m].ending_balance).toBe(loanAmt);
    }
  });
});

describe("computeFinancing — with reserves", () => {
  it("includes reserves in equity required", () => {
    const withReserves = computeFinancing(
      baseInput({ upfront_reserves: 100_000 }),
    );
    const withoutReserves = computeFinancing(baseInput());

    expect(withReserves.upfront_reserves).toBe(100_000);
    expect(withReserves.equity_required).toBe(
      withoutReserves.equity_required + 100_000,
    );
  });
});

describe("computeFinancing — loan_amount_override", () => {
  it("uses override instead of LTV", () => {
    const result = computeFinancing(
      baseInput({
        ltv_max: undefined,
        loan_amount_override: 1_000_000,
      }),
    );
    expect(result.loan_amount_gross).toBe(1_000_000);
    expect(result.flags.override_binding).toBe(true);
    expect(result.flags.ltv_binding).toBe(false);
  });
});

describe("computeFinancing — journal hooks", () => {
  it("always contains PROPERTY and DEBT accounts", () => {
    const result = computeFinancing(baseInput());
    const accounts = result.journal_hooks.map((j) => j.account);
    expect(accounts).toContain("PROPERTY");
    expect(accounts).toContain("DEBT_ACQUISITION");
    expect(accounts).toContain("EQUITY_CONTRIBUTED");
  });

  it("PROPERTY debit matches purchase price", () => {
    const result = computeFinancing(baseInput());
    const prop = result.journal_hooks.find((j) => j.account === "PROPERTY");
    expect(prop!.debit).toBe(2_000_000);
    expect(prop!.cash_flow_bucket).toBe("INVESTING");
  });

  it("EQUITY credit matches equity required", () => {
    const result = computeFinancing(baseInput());
    const eq = result.journal_hooks.find(
      (j) => j.account === "EQUITY_CONTRIBUTED",
    );
    expect(eq!.credit).toBe(result.equity_required);
    expect(eq!.cash_flow_bucket).toBe("FINANCING");
  });

  it("no RESERVES hook when reserves are zero", () => {
    const result = computeFinancing(baseInput());
    const reserves = result.journal_hooks.find(
      (j) => j.account === "RESERVES",
    );
    expect(reserves).toBeUndefined();
  });

  it("includes RESERVES hook when reserves > 0", () => {
    const result = computeFinancing(
      baseInput({ upfront_reserves: 50_000 }),
    );
    const reserves = result.journal_hooks.find(
      (j) => j.account === "RESERVES",
    );
    expect(reserves).toBeDefined();
    expect(reserves!.debit).toBe(50_000);
  });

  it("CLOSING_COSTS classified as BS_DEFERRED by default", () => {
    const result = computeFinancing(baseInput());
    const costs = result.journal_hooks.find(
      (j) => j.account === "CLOSING_COSTS",
    );
    expect(costs).toBeDefined();
    expect(costs!.classification).toBe("BS_DEFERRED");
    expect(costs!.cash_flow_bucket).toBe("FINANCING");
  });
});

describe("computeFinancing — validation", () => {
  it("rejects purchase_price <= 0", () => {
    const result = computeFinancing(baseInput({ purchase_price: 0 }));
    expect(result.flags.invalid_inputs.length).toBeGreaterThan(0);
    expect(result.loan_amount_gross).toBe(0);
  });

  it("rejects both ltv_max and loan_amount_override", () => {
    const result = computeFinancing(
      baseInput({ ltv_max: 0.75, loan_amount_override: 1_000_000 }),
    );
    expect(result.flags.invalid_inputs.length).toBeGreaterThan(0);
    expect(result.flags.invalid_inputs[0]).toContain("mutually exclusive");
  });

  it("rejects neither ltv_max nor loan_amount_override", () => {
    const result = computeFinancing(
      baseInput({ ltv_max: undefined, loan_amount_override: undefined }),
    );
    expect(result.flags.invalid_inputs.length).toBeGreaterThan(0);
  });

  it("rejects IO_then_amortizing when term <= amortization", () => {
    const result = computeFinancing(
      baseInput({
        loan_type: "IO_then_amortizing",
        term_months: 300,
        amortization_months: 300,
      }),
    );
    expect(result.flags.invalid_inputs.length).toBeGreaterThan(0);
    expect(result.flags.invalid_inputs[0]).toContain("IO_then_amortizing");
  });

  it("returns empty schedule on validation failure", () => {
    const result = computeFinancing(baseInput({ purchase_price: -1 }));
    expect(result.debt_service_schedule).toHaveLength(0);
    expect(result.journal_hooks).toHaveLength(0);
  });
});

describe("computeFinancing — zero closing costs", () => {
  it("no CLOSING_COSTS journal hook when costs are zero", () => {
    const result = computeFinancing(
      baseInput({ closing_cost_pct: 0, fixed_fees: 0 }),
    );
    const costs = result.journal_hooks.find(
      (j) => j.account === "CLOSING_COSTS",
    );
    expect(costs).toBeUndefined();
    expect(result.closing_costs.total).toBe(0);
  });
});
