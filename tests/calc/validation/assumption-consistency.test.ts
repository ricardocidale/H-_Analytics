import { describe, it, expect } from "vitest";
import {
  checkAssumptionConsistency,
  type AssumptionConsistencyInput,
  type AssumptionConsistencyOutput,
} from "../../../calc/validation/assumption-consistency.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid global assumptions — no issues expected. */
function validGlobal(): AssumptionConsistencyInput["global_assumptions"] {
  return {
    model_start_date: "2026-04-01",
    projection_years: 10,
    inflation_rate: 0.03,
    exit_cap_rate: 0.085,
    base_management_fee: 0.05,
    incentive_management_fee: 0.15,
    debt_assumptions: {
      interest_rate: 0.09,
      amortization_years: 25,
      acq_ltv: 0.75,
      refi_ltv: 0.65,
    },
  };
}

/** Minimal valid property — no issues expected. */
function validProperty(): NonNullable<AssumptionConsistencyInput["properties"]>[number] {
  return {
    name: "Test Hotel",
    operations_start_date: "2026-06-01",
    acquisition_date: "2026-05-01",
    purchase_price: 2_000_000,
    room_count: 20,
    start_adr: 300,
    start_occupancy: 0.55,
    max_occupancy: 0.85,
    type: "Full Equity",
    land_value_percent: 0.20,
  };
}

/** Build a complete valid input with one property. */
function validInput(): AssumptionConsistencyInput {
  return {
    global_assumptions: validGlobal(),
    properties: [validProperty()],
  };
}

/** Count issues of a given severity in the output. */
function countSeverity(
  output: AssumptionConsistencyOutput,
  severity: "critical" | "material" | "warning" | "info",
): number {
  return output.issues.filter((i) => i.severity === severity).length;
}

// ===========================================================================
// 1. Valid input
// ===========================================================================
describe("valid input", () => {
  it("returns is_valid: true with 0 issues for clean input", () => {
    const result = checkAssumptionConsistency(validInput());
    expect(result.is_valid).toBe(true);
    expect(result.total_issues).toBe(0);
    expect(result.issues).toHaveLength(0);
    expect(result.summary_by_severity).toEqual({
      critical: 0,
      material: 0,
      warning: 0,
      info: 0,
    });
  });

  it("returns is_valid: true when only globals are provided (no properties)", () => {
    const result = checkAssumptionConsistency({
      global_assumptions: validGlobal(),
    });
    expect(result.is_valid).toBe(true);
    expect(result.total_issues).toBe(0);
  });
});

// ===========================================================================
// 2. Missing model_start_date
// ===========================================================================
describe("missing model_start_date", () => {
  it("raises a critical missing_value issue when model_start_date is empty string", () => {
    const input = validInput();
    input.global_assumptions.model_start_date = "";
    const result = checkAssumptionConsistency(input);

    expect(result.is_valid).toBe(false);
    expect(result.summary_by_severity.critical).toBeGreaterThanOrEqual(1);

    const issue = result.issues.find(
      (i) => i.field === "model_start_date" && i.severity === "critical",
    );
    expect(issue).toBeDefined();
    expect(issue!.category).toBe("missing_value");
    expect(issue!.entity).toBe("global");
  });
});

// ===========================================================================
// 3. Exit cap rate
// ===========================================================================
describe("exit_cap_rate", () => {
  it("zero exit cap rate raises critical issue", () => {
    const input = validInput();
    input.global_assumptions.exit_cap_rate = 0;
    const result = checkAssumptionConsistency(input);

    expect(result.is_valid).toBe(false);
    const critical = result.issues.find(
      (i) => i.field === "exit_cap_rate" && i.severity === "critical",
    );
    expect(critical).toBeDefined();
    expect(critical!.category).toBe("out_of_range");
  });

  it("negative exit cap rate raises critical issue", () => {
    const input = validInput();
    input.global_assumptions.exit_cap_rate = -0.05;
    const result = checkAssumptionConsistency(input);

    expect(result.is_valid).toBe(false);
    const critical = result.issues.find(
      (i) => i.field === "exit_cap_rate" && i.severity === "critical",
    );
    expect(critical).toBeDefined();
  });

  it("exit cap rate below 3% raises warning (but not critical)", () => {
    const input = validInput();
    input.global_assumptions.exit_cap_rate = 0.02;
    const result = checkAssumptionConsistency(input);

    // 0.02 is positive so no critical for <= 0, but it IS < 0.03 so warning fires
    const warning = result.issues.find(
      (i) => i.field === "exit_cap_rate" && i.severity === "warning",
    );
    expect(warning).toBeDefined();
    expect(warning!.category).toBe("out_of_range");
  });

  it("exit cap rate above 15% raises warning", () => {
    const input = validInput();
    input.global_assumptions.exit_cap_rate = 0.20;
    const result = checkAssumptionConsistency(input);

    const warning = result.issues.find(
      (i) => i.field === "exit_cap_rate" && i.severity === "warning",
    );
    expect(warning).toBeDefined();
  });

  it("exit cap rate at 3% boundary does not raise warning", () => {
    const input = validInput();
    input.global_assumptions.exit_cap_rate = 0.03;
    const result = checkAssumptionConsistency(input);

    const exitIssues = result.issues.filter((i) => i.field === "exit_cap_rate");
    expect(exitIssues).toHaveLength(0);
  });

  it("exit cap rate at 15% boundary does not raise warning", () => {
    const input = validInput();
    input.global_assumptions.exit_cap_rate = 0.15;
    const result = checkAssumptionConsistency(input);

    const exitIssues = result.issues.filter((i) => i.field === "exit_cap_rate");
    expect(exitIssues).toHaveLength(0);
  });

  it("undefined exit cap rate produces no issue", () => {
    const input = validInput();
    input.global_assumptions.exit_cap_rate = undefined;
    const result = checkAssumptionConsistency(input);

    const exitIssues = result.issues.filter((i) => i.field === "exit_cap_rate");
    expect(exitIssues).toHaveLength(0);
  });

  it("zero exit cap rate generates both critical and warning", () => {
    const input = validInput();
    input.global_assumptions.exit_cap_rate = 0;
    const result = checkAssumptionConsistency(input);

    // 0 is <= 0 (critical) AND < 0.03 (warning)
    const exitIssues = result.issues.filter((i) => i.field === "exit_cap_rate");
    expect(exitIssues.length).toBe(2);
    expect(exitIssues.some((i) => i.severity === "critical")).toBe(true);
    expect(exitIssues.some((i) => i.severity === "warning")).toBe(true);
  });
});

// ===========================================================================
// 4. Inflation rate
// ===========================================================================
describe("inflation_rate", () => {
  it("negative inflation rate raises warning", () => {
    const input = validInput();
    input.global_assumptions.inflation_rate = -0.01;
    const result = checkAssumptionConsistency(input);

    const warning = result.issues.find(
      (i) => i.field === "inflation_rate" && i.severity === "warning",
    );
    expect(warning).toBeDefined();
    expect(warning!.category).toBe("out_of_range");
  });

  it("inflation rate above 15% raises warning", () => {
    const input = validInput();
    input.global_assumptions.inflation_rate = 0.20;
    const result = checkAssumptionConsistency(input);

    const warning = result.issues.find(
      (i) => i.field === "inflation_rate" && i.severity === "warning",
    );
    expect(warning).toBeDefined();
  });

  it("inflation rate at 0% boundary does not raise warning", () => {
    const input = validInput();
    input.global_assumptions.inflation_rate = 0;
    const result = checkAssumptionConsistency(input);

    const inflationIssues = result.issues.filter((i) => i.field === "inflation_rate");
    expect(inflationIssues).toHaveLength(0);
  });

  it("inflation rate at 15% boundary does not raise warning", () => {
    const input = validInput();
    input.global_assumptions.inflation_rate = 0.15;
    const result = checkAssumptionConsistency(input);

    const inflationIssues = result.issues.filter((i) => i.field === "inflation_rate");
    expect(inflationIssues).toHaveLength(0);
  });

  it("undefined inflation rate produces no issue", () => {
    const input = validInput();
    input.global_assumptions.inflation_rate = undefined;
    const result = checkAssumptionConsistency(input);

    const inflationIssues = result.issues.filter((i) => i.field === "inflation_rate");
    expect(inflationIssues).toHaveLength(0);
  });
});

// ===========================================================================
// 5. Base management fee
// ===========================================================================
describe("base_management_fee", () => {
  it("negative base management fee raises warning", () => {
    const input = validInput();
    input.global_assumptions.base_management_fee = -0.01;
    const result = checkAssumptionConsistency(input);

    const warning = result.issues.find(
      (i) => i.field === "base_management_fee" && i.severity === "warning",
    );
    expect(warning).toBeDefined();
  });

  it("base management fee above 10% raises warning", () => {
    const input = validInput();
    input.global_assumptions.base_management_fee = 0.12;
    const result = checkAssumptionConsistency(input);

    const warning = result.issues.find(
      (i) => i.field === "base_management_fee" && i.severity === "warning",
    );
    expect(warning).toBeDefined();
  });

  it("base management fee at 0% boundary does not raise warning", () => {
    const input = validInput();
    input.global_assumptions.base_management_fee = 0;
    const result = checkAssumptionConsistency(input);

    const feeIssues = result.issues.filter((i) => i.field === "base_management_fee");
    expect(feeIssues).toHaveLength(0);
  });

  it("base management fee at 10% boundary does not raise warning", () => {
    const input = validInput();
    input.global_assumptions.base_management_fee = 0.10;
    const result = checkAssumptionConsistency(input);

    const feeIssues = result.issues.filter((i) => i.field === "base_management_fee");
    expect(feeIssues).toHaveLength(0);
  });

  it("undefined base management fee produces no issue", () => {
    const input = validInput();
    input.global_assumptions.base_management_fee = undefined;
    const result = checkAssumptionConsistency(input);

    const feeIssues = result.issues.filter((i) => i.field === "base_management_fee");
    expect(feeIssues).toHaveLength(0);
  });
});

// ===========================================================================
// 6. Debt assumptions
// ===========================================================================
describe("debt_assumptions", () => {
  describe("interest_rate", () => {
    it("interest rate above 25% raises material issue", () => {
      const input = validInput();
      input.global_assumptions.debt_assumptions!.interest_rate = 0.30;
      const result = checkAssumptionConsistency(input);

      const issue = result.issues.find(
        (i) => i.field === "debt_assumptions.interest_rate" && i.severity === "material",
      );
      expect(issue).toBeDefined();
      expect(issue!.category).toBe("out_of_range");
    });

    it("negative interest rate raises material issue", () => {
      const input = validInput();
      input.global_assumptions.debt_assumptions!.interest_rate = -0.05;
      const result = checkAssumptionConsistency(input);

      const issue = result.issues.find(
        (i) => i.field === "debt_assumptions.interest_rate" && i.severity === "material",
      );
      expect(issue).toBeDefined();
    });

    it("interest rate at 0% boundary does not raise issue", () => {
      const input = validInput();
      input.global_assumptions.debt_assumptions!.interest_rate = 0;
      const result = checkAssumptionConsistency(input);

      const issues = result.issues.filter(
        (i) => i.field === "debt_assumptions.interest_rate",
      );
      expect(issues).toHaveLength(0);
    });

    it("interest rate at 25% boundary does not raise issue", () => {
      const input = validInput();
      input.global_assumptions.debt_assumptions!.interest_rate = 0.25;
      const result = checkAssumptionConsistency(input);

      const issues = result.issues.filter(
        (i) => i.field === "debt_assumptions.interest_rate",
      );
      expect(issues).toHaveLength(0);
    });
  });

  describe("acq_ltv", () => {
    it("LTV above 95% raises material issue", () => {
      const input = validInput();
      input.global_assumptions.debt_assumptions!.acq_ltv = 0.98;
      const result = checkAssumptionConsistency(input);

      const issue = result.issues.find(
        (i) => i.field === "debt_assumptions.acq_ltv" && i.severity === "material",
      );
      expect(issue).toBeDefined();
      expect(issue!.category).toBe("out_of_range");
    });

    it("negative LTV raises material issue", () => {
      const input = validInput();
      input.global_assumptions.debt_assumptions!.acq_ltv = -0.10;
      const result = checkAssumptionConsistency(input);

      const issue = result.issues.find(
        (i) => i.field === "debt_assumptions.acq_ltv" && i.severity === "material",
      );
      expect(issue).toBeDefined();
    });

    it("LTV at 95% boundary does not raise issue", () => {
      const input = validInput();
      input.global_assumptions.debt_assumptions!.acq_ltv = 0.95;
      const result = checkAssumptionConsistency(input);

      const issues = result.issues.filter(
        (i) => i.field === "debt_assumptions.acq_ltv",
      );
      expect(issues).toHaveLength(0);
    });

    it("LTV at 0% boundary does not raise issue", () => {
      const input = validInput();
      input.global_assumptions.debt_assumptions!.acq_ltv = 0;
      const result = checkAssumptionConsistency(input);

      const issues = result.issues.filter(
        (i) => i.field === "debt_assumptions.acq_ltv",
      );
      expect(issues).toHaveLength(0);
    });
  });

  it("no debt_assumptions object produces no debt issues", () => {
    const input = validInput();
    input.global_assumptions.debt_assumptions = undefined;
    const result = checkAssumptionConsistency(input);

    const debtIssues = result.issues.filter((i) =>
      i.field.startsWith("debt_assumptions"),
    );
    expect(debtIssues).toHaveLength(0);
  });
});

// ===========================================================================
// 7. SAFE funding gate
// ===========================================================================
describe("SAFE funding gate", () => {
  it("warns when company_ops_start_date is set but no capital raise dates exist", () => {
    const input = validInput();
    input.global_assumptions.company_ops_start_date = "2026-06-01";
    input.global_assumptions.capital_raise_1_date = undefined;
    input.global_assumptions.capital_raise_2_date = undefined;
    const result = checkAssumptionConsistency(input);

    const warning = result.issues.find(
      (i) => i.field === "capital_raise_dates" && i.severity === "warning",
    );
    expect(warning).toBeDefined();
    expect(warning!.category).toBe("business_rule");
  });

  it("no warning when capital_raise_1_date is present", () => {
    const input = validInput();
    input.global_assumptions.company_ops_start_date = "2026-06-01";
    input.global_assumptions.capital_raise_1_date = "2026-05-01";
    input.global_assumptions.capital_raise_2_date = undefined;
    const result = checkAssumptionConsistency(input);

    const safeIssues = result.issues.filter((i) => i.field === "capital_raise_dates");
    expect(safeIssues).toHaveLength(0);
  });

  it("no warning when capital_raise_2_date is present", () => {
    const input = validInput();
    input.global_assumptions.company_ops_start_date = "2026-06-01";
    input.global_assumptions.capital_raise_1_date = undefined;
    input.global_assumptions.capital_raise_2_date = "2026-05-15";
    const result = checkAssumptionConsistency(input);

    const safeIssues = result.issues.filter((i) => i.field === "capital_raise_dates");
    expect(safeIssues).toHaveLength(0);
  });

  it("no warning when company_ops_start_date is not set", () => {
    const input = validInput();
    input.global_assumptions.company_ops_start_date = undefined;
    input.global_assumptions.capital_raise_1_date = undefined;
    input.global_assumptions.capital_raise_2_date = undefined;
    const result = checkAssumptionConsistency(input);

    const safeIssues = result.issues.filter((i) => i.field === "capital_raise_dates");
    expect(safeIssues).toHaveLength(0);
  });

  it("no warning when model_start_date is missing (even if company_ops set)", () => {
    const input = validInput();
    input.global_assumptions.model_start_date = "";
    input.global_assumptions.company_ops_start_date = "2026-06-01";
    input.global_assumptions.capital_raise_1_date = undefined;
    input.global_assumptions.capital_raise_2_date = undefined;
    const result = checkAssumptionConsistency(input);

    // model_start_date is falsy so the SAFE check block is skipped
    const safeIssues = result.issues.filter((i) => i.field === "capital_raise_dates");
    expect(safeIssues).toHaveLength(0);
  });
});

// ===========================================================================
// 8. Property purchase price
// ===========================================================================
describe("property purchase_price", () => {
  it("zero purchase price raises critical issue", () => {
    const input = validInput();
    input.properties![0].purchase_price = 0;
    const result = checkAssumptionConsistency(input);

    expect(result.is_valid).toBe(false);
    const issue = result.issues.find(
      (i) => i.field === "purchase_price" && i.severity === "critical",
    );
    expect(issue).toBeDefined();
    expect(issue!.category).toBe("out_of_range");
    expect(issue!.entity).toContain("Test Hotel");
  });

  it("negative purchase price raises critical issue", () => {
    const input = validInput();
    input.properties![0].purchase_price = -500_000;
    const result = checkAssumptionConsistency(input);

    expect(result.is_valid).toBe(false);
    const issue = result.issues.find(
      (i) => i.field === "purchase_price" && i.severity === "critical",
    );
    expect(issue).toBeDefined();
  });

  it("positive purchase price does not raise issue", () => {
    const input = validInput();
    input.properties![0].purchase_price = 1;
    const result = checkAssumptionConsistency(input);

    const priceIssues = result.issues.filter((i) => i.field === "purchase_price");
    expect(priceIssues).toHaveLength(0);
  });
});

// ===========================================================================
// 9. Occupancy range
// ===========================================================================
describe("occupancy range", () => {
  it("start_occupancy > 1 raises critical issue", () => {
    const input = validInput();
    input.properties![0].start_occupancy = 1.5;
    const result = checkAssumptionConsistency(input);

    expect(result.is_valid).toBe(false);
    const issue = result.issues.find(
      (i) => i.field === "start_occupancy" && i.severity === "critical",
    );
    expect(issue).toBeDefined();
    expect(issue!.category).toBe("out_of_range");
  });

  it("start_occupancy < 0 raises critical issue", () => {
    const input = validInput();
    input.properties![0].start_occupancy = -0.1;
    const result = checkAssumptionConsistency(input);

    expect(result.is_valid).toBe(false);
    const issue = result.issues.find(
      (i) => i.field === "start_occupancy" && i.severity === "critical",
    );
    expect(issue).toBeDefined();
  });

  it("max_occupancy > 1 raises critical issue", () => {
    const input = validInput();
    input.properties![0].max_occupancy = 1.2;
    const result = checkAssumptionConsistency(input);

    expect(result.is_valid).toBe(false);
    const issue = result.issues.find(
      (i) => i.field === "max_occupancy" && i.severity === "critical",
    );
    expect(issue).toBeDefined();
  });

  it("max_occupancy < 0 raises critical issue", () => {
    const input = validInput();
    input.properties![0].max_occupancy = -0.5;
    const result = checkAssumptionConsistency(input);

    expect(result.is_valid).toBe(false);
    const issue = result.issues.find(
      (i) => i.field === "max_occupancy" && i.severity === "critical",
    );
    expect(issue).toBeDefined();
  });

  it("occupancy at 0 boundary does not raise issue", () => {
    const input = validInput();
    input.properties![0].start_occupancy = 0;
    input.properties![0].max_occupancy = 0;
    const result = checkAssumptionConsistency(input);

    const occIssues = result.issues.filter(
      (i) =>
        (i.field === "start_occupancy" || i.field === "max_occupancy") &&
        i.severity === "critical",
    );
    expect(occIssues).toHaveLength(0);
  });

  it("occupancy at 1 (100%) boundary does not raise issue", () => {
    const input = validInput();
    input.properties![0].start_occupancy = 1;
    input.properties![0].max_occupancy = 1;
    const result = checkAssumptionConsistency(input);

    const occIssues = result.issues.filter(
      (i) =>
        (i.field === "start_occupancy" || i.field === "max_occupancy") &&
        i.severity === "critical",
    );
    expect(occIssues).toHaveLength(0);
  });

  it("undefined occupancy values produce no issue", () => {
    const input = validInput();
    input.properties![0].start_occupancy = undefined;
    input.properties![0].max_occupancy = undefined;
    const result = checkAssumptionConsistency(input);

    const occIssues = result.issues.filter(
      (i) => i.field === "start_occupancy" || i.field === "max_occupancy",
    );
    expect(occIssues).toHaveLength(0);
  });
});

// ===========================================================================
// 10. Occupancy contradiction
// ===========================================================================
describe("occupancy contradiction", () => {
  it("start_occupancy > max_occupancy raises material contradiction", () => {
    const input = validInput();
    input.properties![0].start_occupancy = 0.90;
    input.properties![0].max_occupancy = 0.70;
    const result = checkAssumptionConsistency(input);

    const issue = result.issues.find(
      (i) =>
        i.field === "start_occupancy / max_occupancy" &&
        i.severity === "material",
    );
    expect(issue).toBeDefined();
    expect(issue!.category).toBe("contradiction");
  });

  it("start_occupancy == max_occupancy does not raise contradiction", () => {
    const input = validInput();
    input.properties![0].start_occupancy = 0.80;
    input.properties![0].max_occupancy = 0.80;
    const result = checkAssumptionConsistency(input);

    const contradictions = result.issues.filter(
      (i) => i.field === "start_occupancy / max_occupancy",
    );
    expect(contradictions).toHaveLength(0);
  });

  it("start < max does not raise contradiction", () => {
    const input = validInput();
    input.properties![0].start_occupancy = 0.50;
    input.properties![0].max_occupancy = 0.90;
    const result = checkAssumptionConsistency(input);

    const contradictions = result.issues.filter(
      (i) => i.field === "start_occupancy / max_occupancy",
    );
    expect(contradictions).toHaveLength(0);
  });

  it("contradiction not raised when either occupancy is undefined", () => {
    const input = validInput();
    input.properties![0].start_occupancy = 0.90;
    input.properties![0].max_occupancy = undefined;
    const result = checkAssumptionConsistency(input);

    const contradictions = result.issues.filter(
      (i) => i.field === "start_occupancy / max_occupancy",
    );
    expect(contradictions).toHaveLength(0);
  });
});

// ===========================================================================
// 11. Land value percent
// ===========================================================================
describe("land_value_percent", () => {
  it("land value above 80% raises warning", () => {
    const input = validInput();
    input.properties![0].land_value_percent = 0.90;
    const result = checkAssumptionConsistency(input);

    const warning = result.issues.find(
      (i) => i.field === "land_value_percent" && i.severity === "warning",
    );
    expect(warning).toBeDefined();
    expect(warning!.category).toBe("out_of_range");
  });

  it("negative land value raises warning", () => {
    const input = validInput();
    input.properties![0].land_value_percent = -0.05;
    const result = checkAssumptionConsistency(input);

    const warning = result.issues.find(
      (i) => i.field === "land_value_percent" && i.severity === "warning",
    );
    expect(warning).toBeDefined();
  });

  it("land value at 0% boundary does not raise issue", () => {
    const input = validInput();
    input.properties![0].land_value_percent = 0;
    const result = checkAssumptionConsistency(input);

    const landIssues = result.issues.filter((i) => i.field === "land_value_percent");
    expect(landIssues).toHaveLength(0);
  });

  it("land value at 80% boundary does not raise issue", () => {
    const input = validInput();
    input.properties![0].land_value_percent = 0.80;
    const result = checkAssumptionConsistency(input);

    const landIssues = result.issues.filter((i) => i.field === "land_value_percent");
    expect(landIssues).toHaveLength(0);
  });

  it("undefined land value produces no issue", () => {
    const input = validInput();
    input.properties![0].land_value_percent = undefined;
    const result = checkAssumptionConsistency(input);

    const landIssues = result.issues.filter((i) => i.field === "land_value_percent");
    expect(landIssues).toHaveLength(0);
  });
});

// ===========================================================================
// 12. Timing conflicts
// ===========================================================================
describe("timing conflicts", () => {
  describe("operations before model start", () => {
    it("operations_start_date before model_start_date raises material timing_conflict", () => {
      const input = validInput();
      input.global_assumptions.model_start_date = "2026-06-01";
      input.properties![0].operations_start_date = "2026-04-01";
      const result = checkAssumptionConsistency(input);

      const issue = result.issues.find(
        (i) => i.field === "operations_start_date" && i.severity === "material",
      );
      expect(issue).toBeDefined();
      expect(issue!.category).toBe("timing_conflict");
    });

    it("operations_start_date on model_start_date does not raise issue", () => {
      const input = validInput();
      input.global_assumptions.model_start_date = "2026-06-01";
      input.properties![0].operations_start_date = "2026-06-01";
      const result = checkAssumptionConsistency(input);

      const timingIssues = result.issues.filter(
        (i) => i.field === "operations_start_date" && i.category === "timing_conflict",
      );
      expect(timingIssues).toHaveLength(0);
    });

    it("operations_start_date after model_start_date does not raise issue", () => {
      const input = validInput();
      input.global_assumptions.model_start_date = "2026-04-01";
      input.properties![0].operations_start_date = "2026-07-01";
      const result = checkAssumptionConsistency(input);

      const timingIssues = result.issues.filter(
        (i) => i.field === "operations_start_date" && i.category === "timing_conflict",
      );
      expect(timingIssues).toHaveLength(0);
    });

    it("timing check skipped when model_start_date is empty", () => {
      const input = validInput();
      input.global_assumptions.model_start_date = "";
      input.properties![0].operations_start_date = "2025-01-01";
      const result = checkAssumptionConsistency(input);

      const timingIssues = result.issues.filter(
        (i) => i.field === "operations_start_date" && i.category === "timing_conflict",
      );
      expect(timingIssues).toHaveLength(0);
    });
  });

  describe("refinance before acquisition", () => {
    it("refinance_date on or before acquisition_date raises critical timing_conflict", () => {
      const input = validInput();
      input.properties![0].will_refinance = "Yes";
      input.properties![0].acquisition_date = "2026-06-01";
      input.properties![0].refinance_date = "2026-05-01";
      const result = checkAssumptionConsistency(input);

      expect(result.is_valid).toBe(false);
      const issue = result.issues.find(
        (i) => i.field === "refinance_date" && i.severity === "critical",
      );
      expect(issue).toBeDefined();
      expect(issue!.category).toBe("timing_conflict");
    });

    it("refinance_date equal to acquisition_date raises critical issue", () => {
      const input = validInput();
      input.properties![0].will_refinance = "Yes";
      input.properties![0].acquisition_date = "2026-06-01";
      input.properties![0].refinance_date = "2026-06-01";
      const result = checkAssumptionConsistency(input);

      expect(result.is_valid).toBe(false);
      const issue = result.issues.find(
        (i) => i.field === "refinance_date" && i.severity === "critical",
      );
      expect(issue).toBeDefined();
    });

    it("refinance_date after acquisition_date does not raise issue", () => {
      const input = validInput();
      input.properties![0].will_refinance = "Yes";
      input.properties![0].acquisition_date = "2026-05-01";
      input.properties![0].refinance_date = "2028-05-01";
      const result = checkAssumptionConsistency(input);

      const refiIssues = result.issues.filter(
        (i) => i.field === "refinance_date" && i.category === "timing_conflict",
      );
      expect(refiIssues).toHaveLength(0);
    });

    it("refinance check skipped when will_refinance is not 'Yes'", () => {
      const input = validInput();
      input.properties![0].will_refinance = "No";
      input.properties![0].acquisition_date = "2026-06-01";
      input.properties![0].refinance_date = "2026-01-01";
      const result = checkAssumptionConsistency(input);

      const refiIssues = result.issues.filter(
        (i) => i.field === "refinance_date" && i.category === "timing_conflict",
      );
      expect(refiIssues).toHaveLength(0);
    });

    it("refinance check skipped when acquisition_date is missing", () => {
      const input = validInput();
      input.properties![0].will_refinance = "Yes";
      input.properties![0].acquisition_date = undefined;
      input.properties![0].refinance_date = "2026-01-01";
      const result = checkAssumptionConsistency(input);

      const refiIssues = result.issues.filter(
        (i) => i.field === "refinance_date" && i.category === "timing_conflict",
      );
      expect(refiIssues).toHaveLength(0);
    });

    it("refinance check skipped when refinance_date is missing", () => {
      const input = validInput();
      input.properties![0].will_refinance = "Yes";
      input.properties![0].acquisition_date = "2026-05-01";
      input.properties![0].refinance_date = undefined;
      const result = checkAssumptionConsistency(input);

      const refiIssues = result.issues.filter(
        (i) => i.field === "refinance_date" && i.category === "timing_conflict",
      );
      expect(refiIssues).toHaveLength(0);
    });
  });
});

// ===========================================================================
// 13. ADR
// ===========================================================================
describe("start_adr", () => {
  it("zero ADR raises critical issue", () => {
    const input = validInput();
    input.properties![0].start_adr = 0;
    const result = checkAssumptionConsistency(input);

    expect(result.is_valid).toBe(false);
    const issue = result.issues.find(
      (i) => i.field === "start_adr" && i.severity === "critical",
    );
    expect(issue).toBeDefined();
    expect(issue!.category).toBe("out_of_range");
  });

  it("negative ADR raises critical issue", () => {
    const input = validInput();
    input.properties![0].start_adr = -100;
    const result = checkAssumptionConsistency(input);

    expect(result.is_valid).toBe(false);
    const issue = result.issues.find(
      (i) => i.field === "start_adr" && i.severity === "critical",
    );
    expect(issue).toBeDefined();
  });

  it("positive ADR does not raise issue", () => {
    const input = validInput();
    input.properties![0].start_adr = 1;
    const result = checkAssumptionConsistency(input);

    const adrIssues = result.issues.filter((i) => i.field === "start_adr");
    expect(adrIssues).toHaveLength(0);
  });

  it("undefined ADR produces no issue", () => {
    const input = validInput();
    input.properties![0].start_adr = undefined;
    const result = checkAssumptionConsistency(input);

    const adrIssues = result.issues.filter((i) => i.field === "start_adr");
    expect(adrIssues).toHaveLength(0);
  });
});

// ===========================================================================
// 14. Multi-issue aggregation
// ===========================================================================
describe("multi-issue aggregation", () => {
  it("severity counts match actual issues", () => {
    const input = validInput();
    // Critical: purchase_price <= 0
    input.properties![0].purchase_price = 0;
    // Critical: start_adr <= 0
    input.properties![0].start_adr = -50;
    // Material: start > max occupancy contradiction
    input.properties![0].start_occupancy = 0.90;
    input.properties![0].max_occupancy = 0.60;
    // Warning: land value > 80%
    input.properties![0].land_value_percent = 0.95;

    const result = checkAssumptionConsistency(input);

    expect(result.summary_by_severity.critical).toBe(
      countSeverity(result, "critical"),
    );
    expect(result.summary_by_severity.material).toBe(
      countSeverity(result, "material"),
    );
    expect(result.summary_by_severity.warning).toBe(
      countSeverity(result, "warning"),
    );
    expect(result.summary_by_severity.info).toBe(countSeverity(result, "info"));
    expect(result.total_issues).toBe(result.issues.length);
  });

  it("is_valid is false when any critical issue exists", () => {
    const input = validInput();
    input.properties![0].purchase_price = -1;
    const result = checkAssumptionConsistency(input);

    expect(result.summary_by_severity.critical).toBeGreaterThan(0);
    expect(result.is_valid).toBe(false);
  });

  it("is_valid is false when material issues exist (even with no critical)", () => {
    const input = validInput();
    input.properties![0].start_occupancy = 0.90;
    input.properties![0].max_occupancy = 0.60;
    const result = checkAssumptionConsistency(input);

    expect(result.summary_by_severity.critical).toBe(0);
    expect(result.summary_by_severity.material).toBeGreaterThan(0);
    expect(result.is_valid).toBe(false);
  });

  it("is_valid is true when only warnings exist (no critical or material)", () => {
    const input = validInput();
    input.properties![0].land_value_percent = 0.90;
    const result = checkAssumptionConsistency(input);

    expect(result.summary_by_severity.critical).toBe(0);
    expect(result.summary_by_severity.material).toBe(0);
    expect(result.summary_by_severity.warning).toBeGreaterThan(0);
    expect(result.is_valid).toBe(true);
  });

  it("total_issues equals the sum of all severity counts", () => {
    const input = validInput();
    // Generate multiple issues across severities
    input.properties![0].purchase_price = -1; // critical
    input.properties![0].land_value_percent = 0.95; // warning
    input.global_assumptions.inflation_rate = 0.50; // warning
    input.global_assumptions.debt_assumptions!.interest_rate = 0.30; // material

    const result = checkAssumptionConsistency(input);

    const sum =
      result.summary_by_severity.critical +
      result.summary_by_severity.material +
      result.summary_by_severity.warning +
      result.summary_by_severity.info;
    expect(result.total_issues).toBe(sum);
  });

  it("issues from multiple properties are all included", () => {
    const input = validInput();
    const prop2 = validProperty();
    prop2.name = "Second Hotel";
    prop2.purchase_price = -1;
    input.properties!.push(prop2);

    const result = checkAssumptionConsistency(input);

    const secondHotelIssues = result.issues.filter(
      (i) => i.entity.includes("Second Hotel"),
    );
    expect(secondHotelIssues.length).toBeGreaterThan(0);

    // Original property should have no issues
    const firstHotelIssues = result.issues.filter(
      (i) => i.entity.includes("Test Hotel"),
    );
    expect(firstHotelIssues).toHaveLength(0);
  });
});

// ===========================================================================
// 15. Edge cases
// ===========================================================================
describe("edge cases", () => {
  it("no properties array produces no property issues", () => {
    const input: AssumptionConsistencyInput = {
      global_assumptions: validGlobal(),
    };
    const result = checkAssumptionConsistency(input);

    expect(result.is_valid).toBe(true);
    expect(result.total_issues).toBe(0);
  });

  it("empty properties array produces no property issues", () => {
    const input: AssumptionConsistencyInput = {
      global_assumptions: validGlobal(),
      properties: [],
    };
    const result = checkAssumptionConsistency(input);

    expect(result.is_valid).toBe(true);
    expect(result.total_issues).toBe(0);
  });

  it("all optional global fields undefined produces no issues (only model_start_date required)", () => {
    const input: AssumptionConsistencyInput = {
      global_assumptions: {
        model_start_date: "2026-04-01",
      },
    };
    const result = checkAssumptionConsistency(input);

    expect(result.is_valid).toBe(true);
    expect(result.total_issues).toBe(0);
  });

  it("property with only required fields and no optional fields produces no issue for valid data", () => {
    const input: AssumptionConsistencyInput = {
      global_assumptions: { model_start_date: "2026-04-01" },
      properties: [
        {
          name: "Minimal Hotel",
          operations_start_date: "2026-06-01",
          purchase_price: 1_000_000,
        },
      ],
    };
    const result = checkAssumptionConsistency(input);

    expect(result.is_valid).toBe(true);
    expect(result.total_issues).toBe(0);
  });

  it("every issue has all required fields populated", () => {
    const input = validInput();
    input.global_assumptions.model_start_date = "";
    input.properties![0].purchase_price = -1;
    input.properties![0].start_adr = 0;
    input.properties![0].start_occupancy = 2;
    input.properties![0].land_value_percent = 0.95;

    const result = checkAssumptionConsistency(input);
    expect(result.issues.length).toBeGreaterThan(0);

    for (const issue of result.issues) {
      expect(issue.severity).toBeDefined();
      expect(["critical", "material", "warning", "info"]).toContain(issue.severity);
      expect(issue.category).toBeDefined();
      expect([
        "missing_value",
        "out_of_range",
        "contradiction",
        "timing_conflict",
        "business_rule",
      ]).toContain(issue.category);
      expect(issue.entity).toBeTruthy();
      expect(issue.field).toBeTruthy();
      expect(issue.message).toBeTruthy();
      expect(issue.current_value).toBeDefined();
      expect(issue.expected_range).toBeDefined();
    }
  });

  it("property entity string includes property name", () => {
    const input = validInput();
    input.properties![0].name = "Grand Budapest Hotel";
    input.properties![0].purchase_price = -1;
    const result = checkAssumptionConsistency(input);

    const propIssue = result.issues.find((i) => i.field === "purchase_price");
    expect(propIssue).toBeDefined();
    expect(propIssue!.entity).toContain("Grand Budapest Hotel");
  });

  it("negative exit cap rate triggers both critical and warning", () => {
    const input = validInput();
    input.global_assumptions.exit_cap_rate = -0.02;
    const result = checkAssumptionConsistency(input);

    const exitIssues = result.issues.filter((i) => i.field === "exit_cap_rate");
    // -0.02 is <= 0 (critical) AND < 0.03 (warning)
    expect(exitIssues.length).toBe(2);
    expect(exitIssues.some((i) => i.severity === "critical")).toBe(true);
    expect(exitIssues.some((i) => i.severity === "warning")).toBe(true);
  });

  it("info severity count is always 0 because no info-level checks exist", () => {
    // The source code has no code path that generates info severity issues
    const input = validInput();
    input.properties![0].purchase_price = -1;
    input.properties![0].start_adr = -1;
    input.global_assumptions.exit_cap_rate = -1;
    input.global_assumptions.inflation_rate = -1;
    input.global_assumptions.base_management_fee = -1;
    const result = checkAssumptionConsistency(input);

    expect(result.summary_by_severity.info).toBe(0);
  });

  it("multiple properties with issues accumulate correctly", () => {
    const input = validInput();
    // Property 1: critical (price) + critical (ADR)
    input.properties![0].purchase_price = 0;
    input.properties![0].start_adr = 0;

    // Property 2: critical (price) + material (occ contradiction)
    const prop2 = validProperty();
    prop2.name = "Hotel Two";
    prop2.purchase_price = -500;
    prop2.start_occupancy = 0.95;
    prop2.max_occupancy = 0.50;
    input.properties!.push(prop2);

    const result = checkAssumptionConsistency(input);

    // At least 3 critical: price(0) + adr(0) from prop1, price(-500) from prop2
    expect(result.summary_by_severity.critical).toBeGreaterThanOrEqual(3);
    // At least 1 material from occupancy contradiction on prop2
    expect(result.summary_by_severity.material).toBeGreaterThanOrEqual(1);
    expect(result.is_valid).toBe(false);
  });
});

// ===========================================================================
// 24. Exit revenue multiple vs admin-managed exit_multiples ranges
// ===========================================================================
describe("exit_revenue_multiple (industry vertical ranges)", () => {
  /** A small reference set mirroring rows from the exit_multiples table. */
  function ranges() {
    return [
      { dimensionKey: "saas", label: "SaaS", valueLow: 5, valueMid: 8, valueHigh: 12 },
      { dimensionKey: "ecommerce", label: "E-commerce", valueLow: 1, valueMid: 2, valueHigh: 3 },
      { dimensionKey: "marketplace", label: "Marketplace", valueLow: 3, valueMid: 5, valueHigh: 8 },
    ];
  }

  it("multiple inside the band raises no warning", () => {
    const input = validInput();
    input.global_assumptions.industry_vertical = "saas";
    input.global_assumptions.exit_revenue_multiple = 8;
    input.exit_multiples = ranges();
    const result = checkAssumptionConsistency(input);

    const exitIssues = result.issues.filter(i => i.field === "exit_revenue_multiple");
    expect(exitIssues).toHaveLength(0);
  });

  it("multiple above the high bound raises a warning with recommended mid", () => {
    const input = validInput();
    input.global_assumptions.industry_vertical = "saas";
    input.global_assumptions.exit_revenue_multiple = 20;
    input.exit_multiples = ranges();
    const result = checkAssumptionConsistency(input);

    const warning = result.issues.find(
      i => i.field === "exit_revenue_multiple" && i.entity === "global" && i.severity === "warning",
    );
    expect(warning).toBeDefined();
    expect(warning!.category).toBe("out_of_range");
    expect(warning!.expected_range).toBe("5x – 12x");
    expect(warning!.message).toContain("Recommended midpoint");
    expect(warning!.message).toContain("8x");
    expect(warning!.message).toContain("SaaS");
  });

  it("multiple below the low bound raises a warning", () => {
    const input = validInput();
    input.global_assumptions.industry_vertical = "ecommerce";
    input.global_assumptions.exit_revenue_multiple = 0.5;
    input.exit_multiples = ranges();
    const result = checkAssumptionConsistency(input);

    const warning = result.issues.find(
      i => i.field === "exit_revenue_multiple" && i.severity === "warning",
    );
    expect(warning).toBeDefined();
    expect(warning!.expected_range).toBe("1x – 3x");
    expect(warning!.message).toContain("E-commerce");
  });

  it("vertical match is case-insensitive", () => {
    const input = validInput();
    input.global_assumptions.industry_vertical = "  SaaS  ";
    input.global_assumptions.exit_revenue_multiple = 100;
    input.exit_multiples = ranges();
    const result = checkAssumptionConsistency(input);

    const warning = result.issues.find(i => i.field === "exit_revenue_multiple");
    expect(warning).toBeDefined();
  });

  it("no warning when no matching vertical is found", () => {
    const input = validInput();
    input.global_assumptions.industry_vertical = "biotech";
    input.global_assumptions.exit_revenue_multiple = 100;
    input.exit_multiples = ranges();
    const result = checkAssumptionConsistency(input);

    const exitIssues = result.issues.filter(i => i.field === "exit_revenue_multiple");
    expect(exitIssues).toHaveLength(0);
  });

  it("no warning when exit_multiples reference data is absent", () => {
    const input = validInput();
    input.global_assumptions.industry_vertical = "saas";
    input.global_assumptions.exit_revenue_multiple = 100;
    const result = checkAssumptionConsistency(input);

    const exitIssues = result.issues.filter(i => i.field === "exit_revenue_multiple");
    expect(exitIssues).toHaveLength(0);
  });

  it("no warning when industry_vertical is not provided", () => {
    const input = validInput();
    input.global_assumptions.exit_revenue_multiple = 100;
    input.exit_multiples = ranges();
    const result = checkAssumptionConsistency(input);

    const exitIssues = result.issues.filter(i => i.field === "exit_revenue_multiple");
    expect(exitIssues).toHaveLength(0);
  });

  it("no warning when range row has missing low/high bounds", () => {
    const input = validInput();
    input.global_assumptions.industry_vertical = "incomplete";
    input.global_assumptions.exit_revenue_multiple = 999;
    input.exit_multiples = [
      { dimensionKey: "incomplete", label: "Incomplete", valueLow: null, valueMid: 5, valueHigh: null },
    ];
    const result = checkAssumptionConsistency(input);

    const exitIssues = result.issues.filter(i => i.field === "exit_revenue_multiple");
    expect(exitIssues).toHaveLength(0);
  });

  it("warning omits the recommended midpoint when valueMid is null", () => {
    const input = validInput();
    input.global_assumptions.industry_vertical = "no-mid";
    input.global_assumptions.exit_revenue_multiple = 50;
    input.exit_multiples = [
      { dimensionKey: "no-mid", label: "No Mid", valueLow: 1, valueMid: null, valueHigh: 5 },
    ];
    const result = checkAssumptionConsistency(input);

    const warning = result.issues.find(i => i.field === "exit_revenue_multiple");
    expect(warning).toBeDefined();
    expect(warning!.message).not.toContain("Recommended midpoint");
  });

  it("per-property exit_revenue_multiple is checked using its own vertical", () => {
    const input = validInput();
    input.exit_multiples = ranges();
    input.properties![0].industry_vertical = "marketplace";
    input.properties![0].exit_revenue_multiple = 50;
    const result = checkAssumptionConsistency(input);

    const warning = result.issues.find(
      i => i.field === "exit_revenue_multiple" && i.entity.startsWith("property:"),
    );
    expect(warning).toBeDefined();
    expect(warning!.expected_range).toBe("3x – 8x");
    expect(warning!.message).toContain("Marketplace");
  });

  it("per-property check falls back to the global vertical", () => {
    const input = validInput();
    input.exit_multiples = ranges();
    input.global_assumptions.industry_vertical = "saas";
    input.properties![0].exit_revenue_multiple = 100;
    const result = checkAssumptionConsistency(input);

    const warning = result.issues.find(
      i => i.field === "exit_revenue_multiple" && i.entity.startsWith("property:"),
    );
    expect(warning).toBeDefined();
    expect(warning!.expected_range).toBe("5x – 12x");
  });

  it("warnings do not flip is_valid to false", () => {
    const input = validInput();
    input.global_assumptions.industry_vertical = "saas";
    input.global_assumptions.exit_revenue_multiple = 100;
    input.exit_multiples = ranges();
    const result = checkAssumptionConsistency(input);

    expect(result.is_valid).toBe(true);
    expect(result.summary_by_severity.warning).toBeGreaterThanOrEqual(1);
  });
});
