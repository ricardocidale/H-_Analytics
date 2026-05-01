import { describe, it, expect } from "vitest";
import { computeFinancing } from "../../calc/financing/financing-calculator.js";
import { DEFAULT_ACCOUNTING_POLICY } from "../../domain/types/accounting-policy.js";
import type { FinancingInput } from "../../calc/financing/types.js";
import type { RoundingPolicy } from "../../domain/types/rounding.js";

const rounding: RoundingPolicy = { precision: 2, bankers_rounding: false };

/**
 * Golden test — all values hand-calculated:
 *
 * Purchase price: 2,300,000
 * LTV: 75% → loan = 1,725,000
 * Closing cost pct: 2% → 34,500
 * Fixed fees: 5,000
 * Total closing: 39,500
 * Net loan: 1,725,000 - 39,500 = 1,685,500
 * Reserves: 50,000
 * Equity = 2,300,000 + 39,500 + 50,000 - 1,725,000 = 664,500
 *
 * PMT(1,725,000, 0.09/12, 300):
 *   r = 0.0075
 *   (1+r)^300 = (1.0075)^300 ≈ 9.4089
 *   PMT = 1,725,000 × 0.0075 × 9.4089 / (9.4089 - 1) ≈ 14,491.69
 *
 * Schedule month 0:
 *   Interest = 1,725,000 × 0.0075 = 12,937.50
 *   Principal = 14,491.69 - 12,937.50 = 1,554.19
 */
describe("golden scenario", () => {
  const input: FinancingInput = {
    purchase_date: "2026-04-01",
    purchase_price: 2_300_000,
    loan_type: "amortizing",
    interest_rate_annual: 0.09,
    term_months: 300,
    amortization_months: 300,
    ltv_max: 0.75,
    closing_cost_pct: 0.02,
    fixed_fees: 5_000,
    upfront_reserves: 50_000,
    accounting_policy_ref: DEFAULT_ACCOUNTING_POLICY,
    rounding_policy: rounding,
  };

  it("matches all hand-calculated values", () => {
    const result = computeFinancing(input);

    // Loan sizing
    expect(result.loan_amount_gross).toBe(1_725_000);
    expect(result.loan_amount_net).toBe(1_685_500);

    // Closing costs
    expect(result.closing_costs.pct_based).toBe(34_500);
    expect(result.closing_costs.fixed_fees).toBe(5_000);
    expect(result.closing_costs.total).toBe(39_500);

    // Equity & reserves
    expect(result.equity_required).toBe(664_500);
    expect(result.upfront_reserves).toBe(50_000);
    expect(result.initial_cash_in).toBe(1_685_500);

    // Flags
    expect(result.flags.ltv_binding).toBe(true);
    expect(result.flags.override_binding).toBe(false);
    expect(result.flags.invalid_inputs).toHaveLength(0);

    // Schedule
    expect(result.debt_service_schedule).toHaveLength(300);

    // First month
    const m0 = result.debt_service_schedule[0];
    expect(m0.beginning_balance).toBe(1_725_000);
    expect(m0.interest).toBe(12_937.50);
    expect(m0.principal).toBeGreaterThan(1_500);
    expect(m0.payment).toBeCloseTo(m0.interest + m0.principal, 2);
    expect(m0.is_io).toBe(false);

    // Last month fully amortizes
    const mLast = result.debt_service_schedule[299];
    expect(mLast.ending_balance).toBe(0);
  });

  it("schedule roll-forward is consistent", () => {
    const result = computeFinancing(input);
    const schedule = result.debt_service_schedule;

    for (let i = 0; i < schedule.length - 1; i++) {
      expect(schedule[i].ending_balance).toBe(schedule[i + 1].beginning_balance);
    }

    const totalPrincipal = schedule.reduce((s, e) => s + e.principal, 0);
    expect(totalPrincipal).toBeCloseTo(1_725_000, 0);
  });

  it("journal hooks contain expected accounts", () => {
    const result = computeFinancing(input);
    const accounts = result.journal_hooks.map((j) => j.account);

    expect(accounts).toContain("PROPERTY");
    expect(accounts).toContain("DEBT_ACQUISITION");
    expect(accounts).toContain("CLOSING_COSTS");
    expect(accounts).toContain("EQUITY_CONTRIBUTED");
    expect(accounts).toContain("RESERVES");
  });

  it("DEBT_ACQUISITION credit matches gross loan", () => {
    const result = computeFinancing(input);
    const debt = result.journal_hooks.find((j) => j.account === "DEBT_ACQUISITION");
    expect(debt).toBeDefined();
    expect(debt!.credit).toBe(1_725_000);
    expect(debt!.debit).toBe(0);
    expect(debt!.cash_flow_bucket).toBe("FINANCING");
  });
});
