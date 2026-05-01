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

describe("computeRefinance — no cash-out", () => {
  it("caps cash-out at zero when payoff exceeds net proceeds", () => {
    const result = computeRefinance(
      baseInput({ current_loan_balance: 1_400_000 }),
    );
    // net loan = 1,300,000 - 39,000 = 1,261,000
    // payoff = 1,400,000 → exceeds net
    expect(result.cash_out_to_equity).toBe(0);
    expect(result.flags.negative_cash_out).toBe(true);
    expect(result.payoff_total).toBe(1_400_000);
  });
});

describe("computeRefinance — cash-out positive", () => {
  it("computes positive cash-out when net exceeds payoff", () => {
    const result = computeRefinance(
      baseInput({ current_loan_balance: 500_000 }),
    );
    // net loan = 1,261,000 - payoff 500,000 = 761,000
    expect(result.cash_out_to_equity).toBe(761_000);
    expect(result.flags.negative_cash_out).toBe(false);
  });
});

describe("computeRefinance — penalty variants", () => {
  it("no penalty: payoff equals balance only", () => {
    const result = computeRefinance(baseInput());
    expect(result.payoff_breakdown.prepayment_penalty).toBe(0);
    expect(result.payoff_total).toBe(800_000);
  });

  it("pct penalty: adds percentage of balance", () => {
    const result = computeRefinance(
      baseInput({
        prepayment_penalty: { type: "pct_of_balance", value: 0.02 },
      }),
    );
    expect(result.payoff_breakdown.prepayment_penalty).toBe(16_000);
    expect(result.payoff_total).toBe(816_000);
  });

  it("fixed penalty: adds fixed dollar amount", () => {
    const result = computeRefinance(
      baseInput({
        prepayment_penalty: { type: "fixed", value: 25_000 },
      }),
    );
    expect(result.payoff_breakdown.prepayment_penalty).toBe(25_000);
    expect(result.payoff_total).toBe(825_000);
  });
});

describe("computeRefinance — IO period", () => {
  it("generates schedule with IO-then-amortizing transition", () => {
    const result = computeRefinance(
      baseInput({
        new_loan_terms: {
          rate_annual: 0.07,
          term_months: 300,
          amortization_months: 300,
          io_months: 24,
        },
      }),
    );

    const schedule = result.new_debt_service_schedule;
    expect(schedule).toHaveLength(300);

    // IO months
    for (let m = 0; m < 24; m++) {
      expect(schedule[m].is_io).toBe(true);
      expect(schedule[m].principal).toBe(0);
    }

    // Amortizing months
    expect(schedule[24].is_io).toBe(false);
    expect(schedule[24].principal).toBeGreaterThan(0);

    // Final month
    expect(schedule[299].ending_balance).toBe(0);
  });
});

describe("computeRefinance — journal hooks structure", () => {
  it("always contains DEBT_OLD and DEBT_NEW entries", () => {
    const result = computeRefinance(baseInput());
    const accounts = result.journal_hooks.map((j) => j.account);
    expect(accounts).toContain("DEBT_OLD");
    expect(accounts).toContain("DEBT_NEW");
  });

  it("DEBT_OLD debit matches old loan balance", () => {
    const result = computeRefinance(baseInput());
    const debtOld = result.journal_hooks.find((j) => j.account === "DEBT_OLD");
    expect(debtOld).toBeDefined();
    expect(debtOld!.debit).toBe(800_000);
    expect(debtOld!.credit).toBe(0);
    expect(debtOld!.cash_flow_bucket).toBe("FINANCING");
  });

  it("DEBT_NEW credit matches gross loan amount", () => {
    const result = computeRefinance(baseInput());
    const debtNew = result.journal_hooks.find((j) => j.account === "DEBT_NEW");
    expect(debtNew).toBeDefined();
    expect(debtNew!.debit).toBe(0);
    expect(debtNew!.credit).toBe(1_300_000);
    expect(debtNew!.cash_flow_bucket).toBe("FINANCING");
  });

  it("CASH entry equals cash-out to equity", () => {
    const result = computeRefinance(
      baseInput({ current_loan_balance: 500_000 }),
    );
    const cash = result.journal_hooks.find((j) => j.account === "CASH");
    expect(cash).toBeDefined();
    expect(cash!.debit).toBe(result.cash_out_to_equity);
    expect(cash!.cash_flow_bucket).toBe("FINANCING");
  });

  it("cash-in required entry when negative cash-out", () => {
    const result = computeRefinance(
      baseInput({ current_loan_balance: 1_400_000 }),
    );
    const cashDebit = result.journal_hooks.find((j) => j.account === "CASH" && j.debit > 0);
    expect(cashDebit).toBeDefined();
    const equityCredit = result.journal_hooks.find((j) => j.account === "EQUITY_CONTRIBUTED" && j.credit > 0);
    expect(equityCredit).toBeDefined();
    expect(result.cash_in_required).toBeGreaterThan(0);
    expect(result.cash_out_to_equity).toBe(0);
    const equity = result.journal_hooks.find((j) => j.account === "EQUITY_CONTRIBUTED");
    expect(equity).toBeDefined();
  });

  it("penalty and accrued interest hooks present when applicable", () => {
    const result = computeRefinance(
      baseInput({
        prepayment_penalty: { type: "fixed", value: 10_000 },
        accrued_interest_to_payoff: 5_000,
      }),
    );
    const accounts = result.journal_hooks.map((j) => j.account);
    expect(accounts).toContain("PREPAYMENT_PENALTY_EXPENSE");
    expect(accounts).toContain("ACCRUED_INTEREST_PAYABLE");
  });

  it("no penalty hook when penalty is none", () => {
    const result = computeRefinance(baseInput());
    const penalty = result.journal_hooks.find(
      (j) => j.account === "PREPAYMENT_PENALTY_EXPENSE",
    );
    expect(penalty).toBeUndefined();
  });
});

describe("computeRefinance — NOI/cap-rate valuation", () => {
  it("derives property value and sizes loan correctly", () => {
    const result = computeRefinance(
      baseInput({
        valuation: {
          method: "noi_cap",
          stabilized_noi: 170_000,
          cap_rate: 0.085,
        },
      }),
    );
    // 170k / 0.085 = 2,000,000 → same as direct 2M
    expect(result.new_loan_amount_gross).toBe(1_300_000);
  });
});

describe("computeRefinance — proceeds breakdown", () => {
  it("contains all required line items", () => {
    const result = computeRefinance(
      baseInput({
        prepayment_penalty: { type: "fixed", value: 10_000 },
        accrued_interest_to_payoff: 5_000,
      }),
    );
    const labels = result.proceeds_breakdown.map((p) => p.label);
    expect(labels).toContain("New Loan (Gross)");
    expect(labels).toContain("Less: Closing Costs");
    expect(labels).toContain("Net Loan Proceeds");
    expect(labels).toContain("Less: Old Loan Payoff");
    expect(labels).toContain("Less: Prepayment Penalty");
    expect(labels).toContain("Less: Accrued Interest");
    expect(labels).toContain("Cash-Out to Equity");
  });

  it("omits penalty and accrued interest lines when zero", () => {
    const result = computeRefinance(baseInput());
    const labels = result.proceeds_breakdown.map((p) => p.label);
    expect(labels).not.toContain("Less: Prepayment Penalty");
    expect(labels).not.toContain("Less: Accrued Interest");
  });
});
