import { describe, it, expect } from "vitest";
import {
  checkFundingGates,
  type FundingGateInput,
  type FundingGateOutput,
  type GateResult,
} from "../../../calc/validation/funding-gates.js";
import { CENTS_TOLERANCE } from "../../../calc/shared/utils.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInput(overrides: Partial<FundingGateInput> = {}): FundingGateInput {
  return {
    entity_type: "property",
    entity_name: "Test Property",
    monthly_ending_cash: [],
    ...overrides,
  };
}

function findGate(output: FundingGateOutput, rule: string): GateResult | undefined {
  return output.gates.find((g) => g.rule === rule);
}

// ---------------------------------------------------------------------------
// 1. All Exports
// ---------------------------------------------------------------------------

describe("exports", () => {
  it("checkFundingGates is a function", () => {
    expect(typeof checkFundingGates).toBe("function");
  });

  it("returns FundingGateOutput shape", () => {
    const result = checkFundingGates(makeInput());
    expect(result).toHaveProperty("all_gates_passed");
    expect(result).toHaveProperty("gates");
    expect(result).toHaveProperty("negative_cash_months");
    expect(result).toHaveProperty("minimum_cash_balance");
    expect(Array.isArray(result.gates)).toBe(true);
    expect(Array.isArray(result.negative_cash_months)).toBe(true);
  });

  it("each gate result has the required shape", () => {
    const result = checkFundingGates(
      makeInput({ monthly_ending_cash: [100] }),
    );
    for (const gate of result.gates) {
      expect(gate).toHaveProperty("rule");
      expect(gate).toHaveProperty("description");
      expect(gate).toHaveProperty("passed");
      expect(gate).toHaveProperty("details");
      expect(gate).toHaveProperty("severity");
      expect(gate).toHaveProperty("first_violation_month");
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Negative Cash Detection
// ---------------------------------------------------------------------------

describe("No Negative Cash gate", () => {
  it("passes when all months have positive cash", () => {
    const result = checkFundingGates(
      makeInput({ monthly_ending_cash: [100, 200, 300] }),
    );
    const gate = findGate(result, "No Negative Cash")!;
    expect(gate.passed).toBe(true);
    expect(gate.severity).toBe("info");
    expect(gate.first_violation_month).toBe(-1);
    expect(result.negative_cash_months).toEqual([]);
  });

  it("passes when all months are exactly zero", () => {
    const result = checkFundingGates(
      makeInput({ monthly_ending_cash: [0, 0, 0] }),
    );
    const gate = findGate(result, "No Negative Cash")!;
    expect(gate.passed).toBe(true);
    expect(result.negative_cash_months).toEqual([]);
  });

  it("fails when a single month is negative", () => {
    const result = checkFundingGates(
      makeInput({ monthly_ending_cash: [100, -50, 200] }),
    );
    const gate = findGate(result, "No Negative Cash")!;
    expect(gate.passed).toBe(false);
    expect(gate.severity).toBe("material");
    expect(gate.first_violation_month).toBe(1);
    expect(result.negative_cash_months).toEqual([1]);
  });

  it("reports all negative months, not just the first", () => {
    const result = checkFundingGates(
      makeInput({ monthly_ending_cash: [100, -10, 50, -30, -5] }),
    );
    expect(result.negative_cash_months).toEqual([1, 3, 4]);
  });

  it("detects negative in first month", () => {
    const result = checkFundingGates(
      makeInput({ monthly_ending_cash: [-1, 100, 200] }),
    );
    const gate = findGate(result, "No Negative Cash")!;
    expect(gate.passed).toBe(false);
    expect(gate.first_violation_month).toBe(0);
    expect(result.negative_cash_months).toEqual([0]);
  });

  it("detects negative in last month", () => {
    const result = checkFundingGates(
      makeInput({ monthly_ending_cash: [100, 200, -5] }),
    );
    const gate = findGate(result, "No Negative Cash")!;
    expect(gate.first_violation_month).toBe(2);
    expect(result.negative_cash_months).toEqual([2]);
  });

  it("includes month count in passing details", () => {
    const result = checkFundingGates(
      makeInput({ monthly_ending_cash: [10, 20, 30] }),
    );
    const gate = findGate(result, "No Negative Cash")!;
    expect(gate.details).toContain("3 months");
  });

  it("includes violation count in failing details", () => {
    const result = checkFundingGates(
      makeInput({ monthly_ending_cash: [-1, -2, -3] }),
    );
    const gate = findGate(result, "No Negative Cash")!;
    expect(gate.details).toContain("3 months have negative cash");
  });
});

// ---------------------------------------------------------------------------
// 3. Debt-Free at Exit
// ---------------------------------------------------------------------------

describe("Debt-Free at Exit gate", () => {
  it("passes when final_debt_outstanding is 0", () => {
    const result = checkFundingGates(
      makeInput({
        monthly_ending_cash: [100],
        final_debt_outstanding: 0,
      }),
    );
    const gate = findGate(result, "Debt-Free at Exit")!;
    expect(gate.passed).toBe(true);
    expect(gate.severity).toBe("info");
    expect(gate.details).toBe("No outstanding debt at exit");
  });

  it("passes when final_debt_outstanding is within CENTS_TOLERANCE", () => {
    const result = checkFundingGates(
      makeInput({
        monthly_ending_cash: [100],
        final_debt_outstanding: CENTS_TOLERANCE,
      }),
    );
    const gate = findGate(result, "Debt-Free at Exit")!;
    expect(gate.passed).toBe(true);
  });

  it("passes when final_debt_outstanding is below CENTS_TOLERANCE", () => {
    const result = checkFundingGates(
      makeInput({
        monthly_ending_cash: [100],
        final_debt_outstanding: 0.005,
      }),
    );
    const gate = findGate(result, "Debt-Free at Exit")!;
    expect(gate.passed).toBe(true);
  });

  it("fails when final_debt_outstanding is positive and above tolerance", () => {
    const result = checkFundingGates(
      makeInput({
        monthly_ending_cash: [100],
        final_debt_outstanding: 500_000,
      }),
    );
    const gate = findGate(result, "Debt-Free at Exit")!;
    expect(gate.passed).toBe(false);
    expect(gate.severity).toBe("critical");
    expect(gate.details).toContain("500");
  });

  it("fails when final_debt_outstanding just exceeds CENTS_TOLERANCE", () => {
    const result = checkFundingGates(
      makeInput({
        monthly_ending_cash: [100],
        final_debt_outstanding: CENTS_TOLERANCE + 0.001,
      }),
    );
    const gate = findGate(result, "Debt-Free at Exit")!;
    expect(gate.passed).toBe(false);
  });

  it("is not included when final_debt_outstanding is undefined", () => {
    const result = checkFundingGates(
      makeInput({ monthly_ending_cash: [100] }),
    );
    const gate = findGate(result, "Debt-Free at Exit");
    expect(gate).toBeUndefined();
  });

  it("first_violation_month is -1 regardless of outcome", () => {
    const passing = checkFundingGates(
      makeInput({ monthly_ending_cash: [100], final_debt_outstanding: 0 }),
    );
    const failing = checkFundingGates(
      makeInput({ monthly_ending_cash: [100], final_debt_outstanding: 100_000 }),
    );
    expect(findGate(passing, "Debt-Free at Exit")!.first_violation_month).toBe(-1);
    expect(findGate(failing, "Debt-Free at Exit")!.first_violation_month).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// 4. Funding Date Gate
// ---------------------------------------------------------------------------

describe("Funding Date Gate", () => {
  describe("management_company entity", () => {
    it("passes when funding_date is before operations_start_date", () => {
      const result = checkFundingGates(
        makeInput({
          entity_type: "management_company",
          entity_name: "OpCo",
          operations_start_date: "2026-06-01",
          funding_date: "2026-04-01",
          monthly_ending_cash: [100],
        }),
      );
      const gate = findGate(result, "Management Company Funding Gate")!;
      expect(gate.passed).toBe(true);
      expect(gate.severity).toBe("info");
      expect(gate.first_violation_month).toBe(-1);
    });

    it("passes when funding_date equals operations_start_date", () => {
      const result = checkFundingGates(
        makeInput({
          entity_type: "management_company",
          entity_name: "OpCo",
          operations_start_date: "2026-06-01",
          funding_date: "2026-06-01",
          monthly_ending_cash: [100],
        }),
      );
      const gate = findGate(result, "Management Company Funding Gate")!;
      expect(gate.passed).toBe(true);
    });

    it("fails when funding_date is after operations_start_date (critical)", () => {
      const result = checkFundingGates(
        makeInput({
          entity_type: "management_company",
          entity_name: "OpCo",
          operations_start_date: "2026-06-01",
          funding_date: "2026-09-01",
          monthly_ending_cash: [100],
        }),
      );
      const gate = findGate(result, "Management Company Funding Gate")!;
      expect(gate.passed).toBe(false);
      expect(gate.severity).toBe("critical");
      expect(gate.description).toContain("capital raise funding");
    });

    it("includes correct dates in details", () => {
      const result = checkFundingGates(
        makeInput({
          entity_type: "management_company",
          entity_name: "OpCo",
          operations_start_date: "2026-06-01",
          funding_date: "2026-09-01",
          monthly_ending_cash: [100],
        }),
      );
      const gate = findGate(result, "Management Company Funding Gate")!;
      expect(gate.details).toContain("2026-06-01");
      expect(gate.details).toContain("2026-09-01");
    });
  });

  describe("property entity", () => {
    it("passes when funding_date is before operations_start_date", () => {
      const result = checkFundingGates(
        makeInput({
          entity_type: "property",
          entity_name: "Hotel A",
          operations_start_date: "2026-10-01",
          funding_date: "2026-07-01",
          monthly_ending_cash: [100],
        }),
      );
      const gate = findGate(result, "Property Activation Gate")!;
      expect(gate.passed).toBe(true);
      expect(gate.severity).toBe("info");
    });

    it("passes when funding_date equals operations_start_date", () => {
      const result = checkFundingGates(
        makeInput({
          entity_type: "property",
          entity_name: "Hotel A",
          operations_start_date: "2026-10-01",
          funding_date: "2026-10-01",
          monthly_ending_cash: [100],
        }),
      );
      const gate = findGate(result, "Property Activation Gate")!;
      expect(gate.passed).toBe(true);
    });

    it("fails when funding_date is after operations_start_date (critical)", () => {
      const result = checkFundingGates(
        makeInput({
          entity_type: "property",
          entity_name: "Hotel A",
          operations_start_date: "2026-07-01",
          funding_date: "2026-12-01",
          monthly_ending_cash: [100],
        }),
      );
      const gate = findGate(result, "Property Activation Gate")!;
      expect(gate.passed).toBe(false);
      expect(gate.severity).toBe("critical");
      expect(gate.description).toContain("acquisition/funding");
    });
  });

  describe("portfolio entity", () => {
    it("uses Property Activation Gate label for portfolio entity type", () => {
      const result = checkFundingGates(
        makeInput({
          entity_type: "portfolio",
          entity_name: "Portfolio",
          operations_start_date: "2026-06-01",
          funding_date: "2026-04-01",
          monthly_ending_cash: [100],
        }),
      );
      const gate = findGate(result, "Property Activation Gate")!;
      expect(gate).toBeDefined();
      expect(gate.passed).toBe(true);
    });
  });

  it("skips funding gate when operations_start_date is missing", () => {
    const result = checkFundingGates(
      makeInput({
        funding_date: "2026-06-01",
        monthly_ending_cash: [100],
      }),
    );
    const mgmtGate = findGate(result, "Management Company Funding Gate");
    const propGate = findGate(result, "Property Activation Gate");
    expect(mgmtGate).toBeUndefined();
    expect(propGate).toBeUndefined();
  });

  it("skips funding gate when funding_date is missing", () => {
    const result = checkFundingGates(
      makeInput({
        operations_start_date: "2026-06-01",
        monthly_ending_cash: [100],
      }),
    );
    const mgmtGate = findGate(result, "Management Company Funding Gate");
    const propGate = findGate(result, "Property Activation Gate");
    expect(mgmtGate).toBeUndefined();
    expect(propGate).toBeUndefined();
  });

  it("skips funding gate when both dates are missing", () => {
    const result = checkFundingGates(
      makeInput({ monthly_ending_cash: [100] }),
    );
    // Only the negative-cash gate should be present
    expect(result.gates.length).toBe(1);
    expect(result.gates[0].rule).toBe("No Negative Cash");
  });
});

// ---------------------------------------------------------------------------
// 5. Over-Distribution Detection
// ---------------------------------------------------------------------------

describe("No Over-Distribution gate", () => {
  it("passes when no distributions cause negative cash", () => {
    const result = checkFundingGates(
      makeInput({
        monthly_ending_cash: [100, 200, 300],
        monthly_distributions: [50, 50, 50],
      }),
    );
    const gate = findGate(result, "No Over-Distribution")!;
    expect(gate.passed).toBe(true);
    expect(gate.severity).toBe("info");
    expect(gate.first_violation_month).toBe(-1);
    expect(gate.details).toBe("No over-distributions detected");
  });

  it("fails when a distribution is made and cash is negative in the same month", () => {
    const result = checkFundingGates(
      makeInput({
        monthly_ending_cash: [100, -50, 300],
        monthly_distributions: [0, 100, 0],
      }),
    );
    const gate = findGate(result, "No Over-Distribution")!;
    expect(gate.passed).toBe(false);
    expect(gate.severity).toBe("material");
    expect(gate.first_violation_month).toBe(1);
    expect(gate.details).toContain("month 1");
  });

  it("does not flag when distribution is zero even if cash is negative", () => {
    const result = checkFundingGates(
      makeInput({
        monthly_ending_cash: [100, -50, 300],
        monthly_distributions: [0, 0, 0],
      }),
    );
    const gate = findGate(result, "No Over-Distribution")!;
    expect(gate.passed).toBe(true);
  });

  it("does not flag when distribution is positive but cash is non-negative", () => {
    const result = checkFundingGates(
      makeInput({
        monthly_ending_cash: [100, 0, 300],
        monthly_distributions: [50, 50, 50],
      }),
    );
    const gate = findGate(result, "No Over-Distribution")!;
    expect(gate.passed).toBe(true);
  });

  it("reports only the first over-distribution month", () => {
    const result = checkFundingGates(
      makeInput({
        monthly_ending_cash: [-10, -20, -30],
        monthly_distributions: [5, 10, 15],
      }),
    );
    const gate = findGate(result, "No Over-Distribution")!;
    expect(gate.first_violation_month).toBe(0);
  });

  it("handles distributions array longer than cash array (out-of-bounds cash defaults to 0)", () => {
    // When distribution index exceeds cash array length, cash defaults to 0.
    // dist > 0 and cash === 0 means cash < 0 is false, so no violation.
    const result = checkFundingGates(
      makeInput({
        monthly_ending_cash: [100],
        monthly_distributions: [0, 50],
      }),
    );
    const gate = findGate(result, "No Over-Distribution")!;
    // cash at index 1 = 0 (default), dist = 50 > 0, cash = 0 is NOT < 0
    expect(gate.passed).toBe(true);
  });

  it("is not included when monthly_distributions is undefined", () => {
    const result = checkFundingGates(
      makeInput({ monthly_ending_cash: [100] }),
    );
    const gate = findGate(result, "No Over-Distribution");
    expect(gate).toBeUndefined();
  });

  it("is not included when monthly_distributions is empty", () => {
    const result = checkFundingGates(
      makeInput({
        monthly_ending_cash: [100],
        monthly_distributions: [],
      }),
    );
    const gate = findGate(result, "No Over-Distribution");
    expect(gate).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 6. Minimum Cash Balance
// ---------------------------------------------------------------------------

describe("minimum_cash_balance", () => {
  it("returns the lowest value from the cash array", () => {
    const result = checkFundingGates(
      makeInput({ monthly_ending_cash: [500, 100, 300, 50, 200] }),
    );
    expect(result.minimum_cash_balance).toBe(50);
  });

  it("returns a negative minimum when cash goes negative", () => {
    const result = checkFundingGates(
      makeInput({ monthly_ending_cash: [100, -500, 200] }),
    );
    expect(result.minimum_cash_balance).toBe(-500);
  });

  it("returns 0 for an empty cash array", () => {
    const result = checkFundingGates(
      makeInput({ monthly_ending_cash: [] }),
    );
    expect(result.minimum_cash_balance).toBe(0);
  });

  it("returns the single value for a single-month array", () => {
    const result = checkFundingGates(
      makeInput({ monthly_ending_cash: [42] }),
    );
    expect(result.minimum_cash_balance).toBe(42);
  });

  it("handles all identical values", () => {
    const result = checkFundingGates(
      makeInput({ monthly_ending_cash: [100, 100, 100] }),
    );
    expect(result.minimum_cash_balance).toBe(100);
  });

  it("rounds to cents precision", () => {
    const result = checkFundingGates(
      makeInput({ monthly_ending_cash: [100.555, 200.333] }),
    );
    // roundCents(100.555) = Math.round(100.555 * 100) / 100 = 100.56
    expect(result.minimum_cash_balance).toBe(100.56);
  });

  it("correctly handles very small fractional values", () => {
    const result = checkFundingGates(
      makeInput({ monthly_ending_cash: [0.001, 0.002, 0.003] }),
    );
    expect(result.minimum_cash_balance).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 7. Gate Severity Classification
// ---------------------------------------------------------------------------

describe("severity classification", () => {
  it("funding gate failure is critical", () => {
    const result = checkFundingGates(
      makeInput({
        entity_type: "management_company",
        entity_name: "OpCo",
        operations_start_date: "2026-06-01",
        funding_date: "2026-09-01",
        monthly_ending_cash: [100],
      }),
    );
    const gate = findGate(result, "Management Company Funding Gate")!;
    expect(gate.severity).toBe("critical");
  });

  it("funding gate pass is info", () => {
    const result = checkFundingGates(
      makeInput({
        entity_type: "management_company",
        entity_name: "OpCo",
        operations_start_date: "2026-06-01",
        funding_date: "2026-04-01",
        monthly_ending_cash: [100],
      }),
    );
    const gate = findGate(result, "Management Company Funding Gate")!;
    expect(gate.severity).toBe("info");
  });

  it("negative cash is material", () => {
    const result = checkFundingGates(
      makeInput({ monthly_ending_cash: [-100] }),
    );
    const gate = findGate(result, "No Negative Cash")!;
    expect(gate.severity).toBe("material");
  });

  it("no negative cash is info", () => {
    const result = checkFundingGates(
      makeInput({ monthly_ending_cash: [100] }),
    );
    const gate = findGate(result, "No Negative Cash")!;
    expect(gate.severity).toBe("info");
  });

  it("debt-free failure is critical", () => {
    const result = checkFundingGates(
      makeInput({
        monthly_ending_cash: [100],
        final_debt_outstanding: 100_000,
      }),
    );
    const gate = findGate(result, "Debt-Free at Exit")!;
    expect(gate.severity).toBe("critical");
  });

  it("debt-free pass is info", () => {
    const result = checkFundingGates(
      makeInput({
        monthly_ending_cash: [100],
        final_debt_outstanding: 0,
      }),
    );
    const gate = findGate(result, "Debt-Free at Exit")!;
    expect(gate.severity).toBe("info");
  });

  it("over-distribution failure is material", () => {
    const result = checkFundingGates(
      makeInput({
        monthly_ending_cash: [-10],
        monthly_distributions: [5],
      }),
    );
    const gate = findGate(result, "No Over-Distribution")!;
    expect(gate.severity).toBe("material");
  });

  it("over-distribution pass is info", () => {
    const result = checkFundingGates(
      makeInput({
        monthly_ending_cash: [100],
        monthly_distributions: [5],
      }),
    );
    const gate = findGate(result, "No Over-Distribution")!;
    expect(gate.severity).toBe("info");
  });
});

// ---------------------------------------------------------------------------
// 8. Edge Cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("empty monthly_ending_cash array", () => {
    const result = checkFundingGates(makeInput({ monthly_ending_cash: [] }));
    expect(result.negative_cash_months).toEqual([]);
    expect(result.minimum_cash_balance).toBe(0);
    const gate = findGate(result, "No Negative Cash")!;
    expect(gate.passed).toBe(true);
  });

  it("single month positive cash", () => {
    const result = checkFundingGates(makeInput({ monthly_ending_cash: [1000] }));
    expect(result.negative_cash_months).toEqual([]);
    expect(result.minimum_cash_balance).toBe(1000);
    expect(findGate(result, "No Negative Cash")!.passed).toBe(true);
  });

  it("single month zero cash", () => {
    const result = checkFundingGates(makeInput({ monthly_ending_cash: [0] }));
    expect(result.negative_cash_months).toEqual([]);
    expect(result.minimum_cash_balance).toBe(0);
    expect(findGate(result, "No Negative Cash")!.passed).toBe(true);
  });

  it("single month negative cash", () => {
    const result = checkFundingGates(makeInput({ monthly_ending_cash: [-1] }));
    expect(result.negative_cash_months).toEqual([0]);
    expect(result.minimum_cash_balance).toBe(-1);
    expect(findGate(result, "No Negative Cash")!.passed).toBe(false);
  });

  it("all zeros", () => {
    const result = checkFundingGates(
      makeInput({ monthly_ending_cash: [0, 0, 0, 0, 0] }),
    );
    expect(result.negative_cash_months).toEqual([]);
    expect(result.minimum_cash_balance).toBe(0);
    expect(findGate(result, "No Negative Cash")!.passed).toBe(true);
  });

  it("all negative", () => {
    const result = checkFundingGates(
      makeInput({ monthly_ending_cash: [-10, -20, -30] }),
    );
    expect(result.negative_cash_months).toEqual([0, 1, 2]);
    expect(result.minimum_cash_balance).toBe(-30);
    expect(findGate(result, "No Negative Cash")!.passed).toBe(false);
    expect(findGate(result, "No Negative Cash")!.first_violation_month).toBe(0);
  });

  it("very large cash values", () => {
    const result = checkFundingGates(
      makeInput({ monthly_ending_cash: [1e12, 2e12, 3e12] }),
    );
    expect(result.minimum_cash_balance).toBe(1e12);
    expect(findGate(result, "No Negative Cash")!.passed).toBe(true);
  });

  it("very small negative values (below -CENTS_TOLERANCE)", () => {
    const result = checkFundingGates(
      makeInput({ monthly_ending_cash: [-0.001] }),
    );
    // -0.001 is less than 0, so it counts as negative
    expect(result.negative_cash_months).toEqual([0]);
  });

  it("final_debt_outstanding of exactly 0 passes", () => {
    const result = checkFundingGates(
      makeInput({
        monthly_ending_cash: [100],
        final_debt_outstanding: 0,
      }),
    );
    expect(findGate(result, "Debt-Free at Exit")!.passed).toBe(true);
  });

  it("final_debt_outstanding of negative value passes (less than tolerance)", () => {
    const result = checkFundingGates(
      makeInput({
        monthly_ending_cash: [100],
        final_debt_outstanding: -5,
      }),
    );
    // -5 <= CENTS_TOLERANCE (0.01) is true
    expect(findGate(result, "Debt-Free at Exit")!.passed).toBe(true);
  });

  it("120 months of cash data (full 10-year projection)", () => {
    const cash = Array.from({ length: 120 }, (_, i) => 1000 + i * 100);
    const result = checkFundingGates(makeInput({ monthly_ending_cash: cash }));
    expect(result.negative_cash_months).toEqual([]);
    expect(result.minimum_cash_balance).toBe(1000);
    expect(findGate(result, "No Negative Cash")!.passed).toBe(true);
  });

  it("no optional inputs supplied", () => {
    const result = checkFundingGates(
      makeInput({ monthly_ending_cash: [100, 200] }),
    );
    // Only negative cash gate should be present
    expect(result.gates.length).toBe(1);
    expect(result.gates[0].rule).toBe("No Negative Cash");
    expect(result.all_gates_passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 9. Overall Opinion (all_gates_passed)
// ---------------------------------------------------------------------------

describe("all_gates_passed (overall opinion)", () => {
  it("true when all gates pass", () => {
    const result = checkFundingGates(
      makeInput({
        entity_type: "property",
        entity_name: "Hotel A",
        operations_start_date: "2026-10-01",
        funding_date: "2026-07-01",
        monthly_ending_cash: [100, 200, 300],
        final_debt_outstanding: 0,
        monthly_distributions: [10, 20, 30],
      }),
    );
    expect(result.all_gates_passed).toBe(true);
    expect(result.gates.every((g) => g.passed)).toBe(true);
  });

  it("false when funding gate fails", () => {
    const result = checkFundingGates(
      makeInput({
        entity_type: "management_company",
        entity_name: "OpCo",
        operations_start_date: "2026-06-01",
        funding_date: "2026-09-01",
        monthly_ending_cash: [100],
      }),
    );
    expect(result.all_gates_passed).toBe(false);
  });

  it("false when negative cash gate fails", () => {
    const result = checkFundingGates(
      makeInput({ monthly_ending_cash: [-100] }),
    );
    expect(result.all_gates_passed).toBe(false);
  });

  it("false when debt-free gate fails", () => {
    const result = checkFundingGates(
      makeInput({
        monthly_ending_cash: [100],
        final_debt_outstanding: 500_000,
      }),
    );
    expect(result.all_gates_passed).toBe(false);
  });

  it("false when over-distribution gate fails", () => {
    const result = checkFundingGates(
      makeInput({
        monthly_ending_cash: [-100],
        monthly_distributions: [50],
      }),
    );
    expect(result.all_gates_passed).toBe(false);
  });

  it("false when multiple gates fail simultaneously", () => {
    const result = checkFundingGates(
      makeInput({
        entity_type: "management_company",
        entity_name: "OpCo",
        operations_start_date: "2026-06-01",
        funding_date: "2026-09-01",
        monthly_ending_cash: [-100, -200],
        final_debt_outstanding: 500_000,
        monthly_distributions: [50, 50],
      }),
    );
    expect(result.all_gates_passed).toBe(false);
    const failedGates = result.gates.filter((g) => !g.passed);
    expect(failedGates.length).toBeGreaterThanOrEqual(3);
  });

  it("true when only optional gates are absent", () => {
    const result = checkFundingGates(
      makeInput({ monthly_ending_cash: [100, 200] }),
    );
    // Only negative cash gate present and passing
    expect(result.all_gates_passed).toBe(true);
  });

  it("correctly aggregates mixed pass/fail across all gate types", () => {
    // Funding: passes, Negative cash: fails, Debt: passes, Distribution: fails
    const result = checkFundingGates(
      makeInput({
        entity_type: "property",
        entity_name: "Hotel A",
        operations_start_date: "2026-10-01",
        funding_date: "2026-07-01",
        monthly_ending_cash: [100, -50, 300],
        final_debt_outstanding: 0,
        monthly_distributions: [0, 100, 0],
      }),
    );
    expect(result.all_gates_passed).toBe(false);
    expect(findGate(result, "Property Activation Gate")!.passed).toBe(true);
    expect(findGate(result, "No Negative Cash")!.passed).toBe(false);
    expect(findGate(result, "Debt-Free at Exit")!.passed).toBe(true);
    expect(findGate(result, "No Over-Distribution")!.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 10. Gate Ordering and Composition
// ---------------------------------------------------------------------------

describe("gate ordering and composition", () => {
  it("funding gate appears before negative cash gate when both present", () => {
    const result = checkFundingGates(
      makeInput({
        entity_type: "property",
        entity_name: "Hotel A",
        operations_start_date: "2026-10-01",
        funding_date: "2026-07-01",
        monthly_ending_cash: [100],
      }),
    );
    const fundingIdx = result.gates.findIndex(
      (g) => g.rule === "Property Activation Gate",
    );
    const cashIdx = result.gates.findIndex(
      (g) => g.rule === "No Negative Cash",
    );
    expect(fundingIdx).toBeLessThan(cashIdx);
  });

  it("debt-free gate appears after negative cash gate", () => {
    const result = checkFundingGates(
      makeInput({
        monthly_ending_cash: [100],
        final_debt_outstanding: 0,
      }),
    );
    const cashIdx = result.gates.findIndex(
      (g) => g.rule === "No Negative Cash",
    );
    const debtIdx = result.gates.findIndex(
      (g) => g.rule === "Debt-Free at Exit",
    );
    expect(cashIdx).toBeLessThan(debtIdx);
  });

  it("all four gates present when all inputs provided", () => {
    const result = checkFundingGates(
      makeInput({
        entity_type: "property",
        entity_name: "Hotel A",
        operations_start_date: "2026-10-01",
        funding_date: "2026-07-01",
        monthly_ending_cash: [100],
        final_debt_outstanding: 0,
        monthly_distributions: [10],
      }),
    );
    expect(result.gates.length).toBe(4);
    expect(result.gates.map((g) => g.rule)).toEqual([
      "Property Activation Gate",
      "No Negative Cash",
      "Debt-Free at Exit",
      "No Over-Distribution",
    ]);
  });
});
