import { describe, it, expect } from "vitest";
import { computeFunding } from "../../calc/funding/funding-engine.js";
import { DEFAULT_ACCOUNTING_POLICY } from "../../domain/types/accounting-policy.js";
import type { FundingInput } from "../../calc/funding/types.js";
import type { RoundingPolicy } from "../../domain/types/rounding.js";

const rounding: RoundingPolicy = { precision: 2, bankers_rounding: false };

function baseInput(overrides: Partial<FundingInput> = {}): FundingInput {
  return {
    model_start_date: "2026-04-01",
    company_ops_start_date: "2026-06-01",
    tranches: [
      {
        tranche_id: "safe1",
        label: "SAFE 1",
        amount: 1_000_000,
        trigger: { type: "scheduled", date: "2026-06-01" },
        target_entity: { type: "OPCO", id: "opco", name: "OpCo" },
        source: "SAFE",
      },
    ],
    property_requirements: [],
    accounting_policy_ref: DEFAULT_ACCOUNTING_POLICY,
    rounding_policy: rounding,
    ...overrides,
  };
}

describe("computeFunding — validation", () => {
  it("rejects empty tranches", () => {
    const result = computeFunding(baseInput({ tranches: [] }));
    expect(result.flags.invalid_inputs.length).toBeGreaterThan(0);
    expect(result.funding_timeline).toHaveLength(0);
  });

  it("rejects invalid model_start_date", () => {
    const result = computeFunding(baseInput({ model_start_date: "" }));
    expect(result.flags.invalid_inputs.length).toBeGreaterThan(0);
  });

  it("rejects tranche with amount <= 0", () => {
    const result = computeFunding(
      baseInput({
        tranches: [
          {
            tranche_id: "t1",
            label: "Bad",
            amount: 0,
            trigger: { type: "scheduled", date: "2026-06-01" },
            target_entity: { type: "OPCO", id: "opco", name: "OpCo" },
            source: "SAFE",
          },
        ],
      }),
    );
    expect(result.flags.invalid_inputs.length).toBeGreaterThan(0);
  });

  it("returns empty result on validation failure", () => {
    const result = computeFunding(baseInput({ model_start_date: "invalid" }));
    expect(result.funding_timeline).toHaveLength(0);
    expect(result.gate_checks).toHaveLength(0);
    expect(result.journal_hooks).toHaveLength(0);
    expect(result.equity_rollforward).toHaveLength(0);
  });
});

describe("computeFunding — OpCo only", () => {
  it("handles single OpCo tranche", () => {
    const result = computeFunding(baseInput());
    expect(result.funding_timeline).toHaveLength(1);
    expect(result.total_equity_committed).toBe(1_000_000);
    expect(result.total_funded_opco).toBe(1_000_000);
    expect(result.total_funded_properties).toBe(0);
    expect(result.flags.all_gates_passed).toBe(true);
  });

  it("handles multiple OpCo tranches", () => {
    const result = computeFunding(
      baseInput({
        tranches: [
          {
            tranche_id: "s1",
            label: "SAFE 1",
            amount: 1_000_000,
            trigger: { type: "scheduled", date: "2026-06-01" },
            target_entity: { type: "OPCO", id: "opco", name: "OpCo" },
            source: "SAFE",
          },
          {
            tranche_id: "s2",
            label: "SAFE 2",
            amount: 500_000,
            trigger: { type: "scheduled", date: "2027-01-01" },
            target_entity: { type: "OPCO", id: "opco", name: "OpCo" },
            source: "SAFE",
          },
        ],
      }),
    );
    expect(result.funding_timeline).toHaveLength(2);
    expect(result.total_funded_opco).toBe(1_500_000);
  });
});

describe("computeFunding — with properties", () => {
  it("handles property with on_acquisition trigger", () => {
    const result = computeFunding(
      baseInput({
        tranches: [
          {
            tranche_id: "s1",
            label: "SAFE 1",
            amount: 1_000_000,
            trigger: { type: "scheduled", date: "2026-06-01" },
            target_entity: { type: "OPCO", id: "opco", name: "OpCo" },
            source: "SAFE",
          },
          {
            tranche_id: "eq1",
            label: "Prop Equity",
            amount: 500_000,
            trigger: { type: "on_acquisition", property_id: "p1" },
            target_entity: { type: "PROPERTY", id: "p1", name: "Prop" },
            source: "LP_EQUITY",
          },
        ],
        property_requirements: [
          {
            property_id: "p1",
            property_name: "Prop",
            acquisition_date: "2026-09-01",
            operations_start_date: "2027-03-01",
            total_cost: 1_000_000,
            loan_amount: 500_000,
            equity_required: 500_000,
          },
        ],
      }),
    );
    expect(result.funding_timeline).toHaveLength(2);
    expect(result.total_funded_properties).toBe(500_000);
    expect(result.flags.all_gates_passed).toBe(true);
  });
});

describe("computeFunding — gate failures", () => {
  it("detects OpCo ops before funding", () => {
    const result = computeFunding(
      baseInput({
        company_ops_start_date: "2026-04-01",
        tranches: [
          {
            tranche_id: "s1",
            label: "SAFE 1",
            amount: 1_000_000,
            trigger: { type: "scheduled", date: "2026-09-01" },
            target_entity: { type: "OPCO", id: "opco", name: "OpCo" },
            source: "SAFE",
          },
        ],
      }),
    );
    const opcoCheck = result.gate_checks.find(
      (g) => g.entity.type === "OPCO",
    );
    expect(opcoCheck!.passed).toBe(false);
    expect(result.flags.all_gates_passed).toBe(false);
  });

  it("detects property funding shortfall", () => {
    const result = computeFunding(
      baseInput({
        tranches: [
          {
            tranche_id: "s1",
            label: "SAFE 1",
            amount: 1_000_000,
            trigger: { type: "scheduled", date: "2026-06-01" },
            target_entity: { type: "OPCO", id: "opco", name: "OpCo" },
            source: "SAFE",
          },
          {
            tranche_id: "eq1",
            label: "Partial Equity",
            amount: 300_000,
            trigger: { type: "on_acquisition", property_id: "p1" },
            target_entity: { type: "PROPERTY", id: "p1", name: "Prop" },
            source: "LP_EQUITY",
          },
        ],
        property_requirements: [
          {
            property_id: "p1",
            property_name: "Prop",
            acquisition_date: "2026-09-01",
            operations_start_date: "2027-03-01",
            total_cost: 1_000_000,
            loan_amount: 0,
            equity_required: 1_000_000,
          },
        ],
      }),
    );
    expect(result.flags.has_shortfalls).toBe(true);
    expect(result.flags.all_gates_passed).toBe(false);
    const propCheck = result.gate_checks.find((g) => g.entity.id === "p1");
    expect(propCheck!.shortfall_amount).toBe(700_000);
  });
});

describe("computeFunding — warnings", () => {
  it("warns about unresolvable tranche triggers", () => {
    const result = computeFunding(
      baseInput({
        tranches: [
          {
            tranche_id: "s1",
            label: "SAFE 1",
            amount: 1_000_000,
            trigger: { type: "scheduled", date: "2026-06-01" },
            target_entity: { type: "OPCO", id: "opco", name: "OpCo" },
            source: "SAFE",
          },
          {
            tranche_id: "eq1",
            label: "Ghost Prop",
            amount: 500_000,
            trigger: { type: "on_acquisition", property_id: "nonexistent" },
            target_entity: {
              type: "PROPERTY",
              id: "nonexistent",
              name: "???",
            },
            source: "LP_EQUITY",
          },
        ],
      }),
    );
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("could not resolve");
    // The resolvable tranche still works
    expect(result.funding_timeline).toHaveLength(1);
  });
});

describe("computeFunding — journal hooks structure", () => {
  it("every event produces CASH debit and EQUITY credit", () => {
    const result = computeFunding(baseInput());
    expect(result.journal_hooks).toHaveLength(2);

    const cashHook = result.journal_hooks.find((j) => j.account === "CASH");
    expect(cashHook).toBeDefined();
    expect(cashHook!.debit).toBe(1_000_000);
    expect(cashHook!.credit).toBe(0);
    expect(cashHook!.cash_flow_bucket).toBe("FINANCING");

    const eqHook = result.journal_hooks.find(
      (j) => j.account === "EQUITY_CONTRIBUTED",
    );
    expect(eqHook).toBeDefined();
    expect(eqHook!.debit).toBe(0);
    expect(eqHook!.credit).toBe(1_000_000);
    expect(eqHook!.cash_flow_bucket).toBe("FINANCING");
  });

  it("equity never hits IS", () => {
    const result = computeFunding(baseInput());
    for (const hook of result.journal_hooks) {
      expect(hook.classification).not.toContain("IS_");
    }
  });
});
