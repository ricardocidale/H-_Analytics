import { describe, it, expect } from "vitest";
import { computeFunding } from "../../calc/funding/funding-engine.js";
import { DEFAULT_ACCOUNTING_POLICY } from "../../domain/types/accounting-policy.js";
import type { FundingInput } from "../../calc/funding/types.js";
import type { RoundingPolicy } from "../../domain/types/rounding.js";

const rounding: RoundingPolicy = { precision: 2, bankers_rounding: false };

/**
 * Golden test — all values hand-calculated:
 *
 * Model Start: 2026-04-01
 * Company Ops Start: 2026-06-01
 *
 * Tranches:
 *   1. "Funding Tranche 1": $1,000,000 on 2026-06-01 → OpCo
 *   2. "Funding Tranche 2": $500,000 on 2027-01-01 → OpCo
 *   3. "Property A Equity": $800,000 on_acquisition p_a → Property A
 *   4. "Property B Equity": $1,200,000 on_acquisition p_b → Property B
 *
 * Properties:
 *   A: acq=2026-07-01, ops=2027-01-01, total=$1,500,000, loan=$700,000, equity=$800,000
 *   B: acq=2026-10-01, ops=2027-04-01, total=$2,000,000, loan=$800,000, equity=$1,200,000
 *
 * Expected Timeline (sorted):
 *   2026-06-01 Funding Tranche 1 $1,000,000
 *   2026-07-01 Property A Equity $800,000
 *   2026-10-01 Property B Equity $1,200,000
 *   2027-01-01 Funding Tranche 2 $500,000
 *
 * Gate Checks:
 *   OpCo: PASS (first OPCO tranche 2026-06-01 ≤ ops 2026-06-01)
 *   Property A: PASS ($800K funded at acq 2026-07-01)
 *   Property B: PASS ($1.2M funded at acq 2026-10-01)
 *
 * Totals:
 *   total_equity_committed: $3,500,000
 *   total_funded_opco: $1,500,000
 *   total_funded_properties: $2,000,000
 *
 * Journal hooks: 4 events × 2 deltas = 8 journal entries
 */
describe("golden scenario", () => {
  const input: FundingInput = {
    model_start_date: "2026-04-01",
    company_ops_start_date: "2026-06-01",
    tranches: [
      {
        tranche_id: "safe1",
        label: "SAFE Tranche 1",
        amount: 1_000_000,
        trigger: { type: "scheduled", date: "2026-06-01" },
        target_entity: { type: "OPCO", id: "opco", name: "Management Company" },
        source: "SAFE",
      },
      {
        tranche_id: "safe2",
        label: "SAFE Tranche 2",
        amount: 500_000,
        trigger: { type: "scheduled", date: "2027-01-01" },
        target_entity: { type: "OPCO", id: "opco", name: "Management Company" },
        source: "SAFE",
      },
      {
        tranche_id: "eq_a",
        label: "Property A Equity",
        amount: 800_000,
        trigger: { type: "on_acquisition", property_id: "p_a" },
        target_entity: { type: "PROPERTY", id: "p_a", name: "Property A" },
        source: "SPONSOR_EQUITY",
      },
      {
        tranche_id: "eq_b",
        label: "Property B Equity",
        amount: 1_200_000,
        trigger: { type: "on_acquisition", property_id: "p_b" },
        target_entity: { type: "PROPERTY", id: "p_b", name: "Property B" },
        source: "LP_EQUITY",
      },
    ],
    property_requirements: [
      {
        property_id: "p_a",
        property_name: "Property A",
        acquisition_date: "2026-07-01",
        operations_start_date: "2027-01-01",
        total_cost: 1_500_000,
        loan_amount: 700_000,
        equity_required: 800_000,
      },
      {
        property_id: "p_b",
        property_name: "Property B",
        acquisition_date: "2026-10-01",
        operations_start_date: "2027-04-01",
        total_cost: 2_000_000,
        loan_amount: 800_000,
        equity_required: 1_200_000,
      },
    ],
    accounting_policy_ref: DEFAULT_ACCOUNTING_POLICY,
    rounding_policy: rounding,
  };

  it("matches all hand-calculated values", () => {
    const result = computeFunding(input);

    // Timeline
    expect(result.funding_timeline).toHaveLength(4);
    expect(result.funding_timeline[0].date).toBe("2026-06-01");
    expect(result.funding_timeline[0].label).toBe("SAFE Tranche 1");
    expect(result.funding_timeline[1].date).toBe("2026-07-01");
    expect(result.funding_timeline[1].label).toBe("Property A Equity");
    expect(result.funding_timeline[2].date).toBe("2026-10-01");
    expect(result.funding_timeline[2].label).toBe("Property B Equity");
    expect(result.funding_timeline[3].date).toBe("2027-01-01");
    expect(result.funding_timeline[3].label).toBe("SAFE Tranche 2");

    // Gate checks
    expect(result.gate_checks).toHaveLength(3); // OpCo + 2 properties
    expect(result.gate_checks.every((g) => g.passed)).toBe(true);

    // Totals
    expect(result.total_equity_committed).toBe(3_500_000);
    expect(result.total_funded_opco).toBe(1_500_000);
    expect(result.total_funded_properties).toBe(2_000_000);

    // Flags
    expect(result.flags.all_gates_passed).toBe(true);
    expect(result.flags.has_shortfalls).toBe(false);
    expect(result.flags.invalid_inputs).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("journal hooks are balanced pairs", () => {
    const result = computeFunding(input);

    // 4 events × 2 entries each = 8
    expect(result.journal_hooks).toHaveLength(8);

    // Each pair: CASH debit + EQUITY_CONTRIBUTED credit
    for (let i = 0; i < result.journal_hooks.length; i += 2) {
      const cashEntry = result.journal_hooks[i];
      const equityEntry = result.journal_hooks[i + 1];

      expect(cashEntry.account).toBe("CASH");
      expect(cashEntry.debit).toBeGreaterThan(0);
      expect(cashEntry.credit).toBe(0);
      expect(cashEntry.classification).toBe("BS_ASSET");
      expect(cashEntry.cash_flow_bucket).toBe("FINANCING");

      expect(equityEntry.account).toBe("EQUITY_CONTRIBUTED");
      expect(equityEntry.debit).toBe(0);
      expect(equityEntry.credit).toBe(cashEntry.debit);
      expect(equityEntry.classification).toBe("BS_EQUITY");
      expect(equityEntry.cash_flow_bucket).toBe("FINANCING");
    }
  });

  it("equity roll-forward contributions tie to total", () => {
    const result = computeFunding(input);

    const totalContributions = result.equity_rollforward.reduce(
      (sum, e) => sum + e.contributions,
      0,
    );
    expect(totalContributions).toBe(3_500_000);
  });

  it("equity roll-forward ending balances by entity", () => {
    const result = computeFunding(input);

    // OpCo final balance = $1,000,000 + $500,000 = $1,500,000
    const opcoEntries = result.equity_rollforward.filter(
      (e) => e.entity_id === "opco",
    );
    const opcoFinal = opcoEntries[opcoEntries.length - 1];
    expect(opcoFinal.ending_balance).toBe(1_500_000);

    // Property A final balance = $800,000
    const propAEntries = result.equity_rollforward.filter(
      (e) => e.entity_id === "p_a",
    );
    const propAFinal = propAEntries[propAEntries.length - 1];
    expect(propAFinal.ending_balance).toBe(800_000);

    // Property B final balance = $1,200,000
    const propBEntries = result.equity_rollforward.filter(
      (e) => e.entity_id === "p_b",
    );
    const propBFinal = propBEntries[propBEntries.length - 1];
    expect(propBFinal.ending_balance).toBe(1_200_000);
  });
});
