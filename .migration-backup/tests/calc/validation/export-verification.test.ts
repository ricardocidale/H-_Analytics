import { describe, it, expect } from "vitest";
import { verifyExport } from "../../../calc/validation/export-verification.js";
import type {
  ExportVerificationInput,
  SampleValue,
} from "../../../calc/validation/export-verification.js";
import { DEFAULT_TOLERANCE } from "../../../calc/shared/utils.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid input that produces a clean pass (format check only). */
function minimalInput(
  overrides?: Partial<ExportVerificationInput>,
): ExportVerificationInput {
  return {
    export_format: "excel",
    export_source: "income_statement",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Basic pass — all checks present and passing -> all_passed: true
// ---------------------------------------------------------------------------

describe("Basic pass", () => {
  it("returns all_passed: true when every check passes", () => {
    const result = verifyExport({
      export_format: "pdf",
      export_source: "balance_sheet",
      expected_sections: ["Revenue", "Expenses"],
      actual_sections: ["Revenue", "Expenses"],
      sample_values: [
        { label: "NOI", expected_value: 100_000, exported_value: 100_000 },
      ],
      expected_year_count: 10,
      actual_year_count: 10,
      expected_property_count: 5,
      actual_property_count: 5,
    });

    expect(result.all_passed).toBe(true);
    expect(result.missing_sections).toHaveLength(0);
    expect(result.value_mismatches).toHaveLength(0);
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  it("always includes the 'Export Format Valid' check", () => {
    const result = verifyExport(minimalInput());
    const formatCheck = result.checks.find(
      (c) => c.check === "Export Format Valid",
    );
    expect(formatCheck).toBeDefined();
    expect(formatCheck!.passed).toBe(true);
    expect(formatCheck!.details).toContain("excel");
    expect(formatCheck!.details).toContain("income_statement");
  });

  it("includes format and source in the format check details", () => {
    const result = verifyExport(
      minimalInput({
        export_format: "pptx",
        export_source: "dashboard",
      }),
    );
    const formatCheck = result.checks.find(
      (c) => c.check === "Export Format Valid",
    );
    expect(formatCheck!.details).toBe("Format: pptx, Source: dashboard");
  });
});

// ---------------------------------------------------------------------------
// 2. Section presence — expected sections all present -> passes;
//    missing sections -> fails with list
// ---------------------------------------------------------------------------

describe("Section presence", () => {
  it("passes when all expected sections are found in actual_sections", () => {
    const result = verifyExport(
      minimalInput({
        expected_sections: ["Revenue", "Expenses", "NOI"],
        actual_sections: ["Revenue", "Expenses", "NOI", "Extra"],
      }),
    );

    const sectionCheck = result.checks.find(
      (c) => c.check === "All Expected Sections Present",
    );
    expect(sectionCheck).toBeDefined();
    expect(sectionCheck!.passed).toBe(true);
    expect(sectionCheck!.details).toBe("All 3 sections found");
    expect(result.missing_sections).toHaveLength(0);
  });

  it("fails and lists missing sections when some are absent", () => {
    const result = verifyExport(
      minimalInput({
        expected_sections: ["Revenue", "Expenses", "NOI", "Cash Flow"],
        actual_sections: ["Revenue", "NOI"],
      }),
    );

    const sectionCheck = result.checks.find(
      (c) => c.check === "All Expected Sections Present",
    );
    expect(sectionCheck!.passed).toBe(false);
    expect(result.missing_sections).toEqual(["Expenses", "Cash Flow"]);
    expect(sectionCheck!.details).toContain("Missing 2 sections");
    expect(sectionCheck!.details).toContain("Expenses");
    expect(sectionCheck!.details).toContain("Cash Flow");
  });

  it("all_passed is false when sections are missing", () => {
    const result = verifyExport(
      minimalInput({
        expected_sections: ["Revenue"],
        actual_sections: ["Expenses"],
      }),
    );
    expect(result.all_passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Section case insensitivity — "IS" matches "is"
// ---------------------------------------------------------------------------

describe("Section case insensitivity", () => {
  it('matches "IS" in expected against "is" in actual', () => {
    const result = verifyExport(
      minimalInput({
        expected_sections: ["IS"],
        actual_sections: ["is"],
      }),
    );

    expect(result.missing_sections).toHaveLength(0);
    const sectionCheck = result.checks.find(
      (c) => c.check === "All Expected Sections Present",
    );
    expect(sectionCheck!.passed).toBe(true);
  });

  it("matches mixed-case section names", () => {
    const result = verifyExport(
      minimalInput({
        expected_sections: ["Balance Sheet", "CASH FLOW", "noi"],
        actual_sections: ["balance sheet", "Cash Flow", "NOI"],
      }),
    );

    expect(result.missing_sections).toHaveLength(0);
    expect(result.all_passed).toBe(true);
  });

  it("detects missing sections regardless of case", () => {
    const result = verifyExport(
      minimalInput({
        expected_sections: ["REVENUE", "DEBT"],
        actual_sections: ["revenue"],
      }),
    );

    expect(result.missing_sections).toEqual(["DEBT"]);
  });
});

// ---------------------------------------------------------------------------
// 4. Sample value matching — within tolerance -> passes;
//    outside tolerance -> value mismatch
// ---------------------------------------------------------------------------

describe("Sample value matching", () => {
  it("passes when all values are within tolerance", () => {
    const result = verifyExport(
      minimalInput({
        sample_values: [
          { label: "NOI", expected_value: 100_000, exported_value: 100_000.005 },
          { label: "Revenue", expected_value: 500_000, exported_value: 500_000 },
        ],
      }),
    );

    const valueCheck = result.checks.find(
      (c) => c.check === "Sample Values Match",
    );
    expect(valueCheck!.passed).toBe(true);
    expect(valueCheck!.details).toContain("2 spot-check values match");
    expect(result.value_mismatches).toHaveLength(0);
  });

  it("fails when a value is outside tolerance", () => {
    const result = verifyExport(
      minimalInput({
        sample_values: [
          { label: "NOI", expected_value: 100_000, exported_value: 100_002 },
        ],
      }),
    );

    const valueCheck = result.checks.find(
      (c) => c.check === "Sample Values Match",
    );
    expect(valueCheck!.passed).toBe(false);
    expect(result.value_mismatches).toHaveLength(1);
    expect(result.value_mismatches[0].label).toBe("NOI");
    expect(result.value_mismatches[0].expected).toBe(100_000);
    expect(result.value_mismatches[0].actual).toBe(100_002);
    expect(result.value_mismatches[0].variance).toBe(2);
  });

  it("reports variance rounded to cents via roundCents", () => {
    const result = verifyExport(
      minimalInput({
        sample_values: [
          {
            label: "Fee",
            expected_value: 100,
            exported_value: 103.456,
          },
        ],
      }),
    );

    expect(result.value_mismatches).toHaveLength(1);
    // roundCents(3.456) = 3.46
    expect(result.value_mismatches[0].variance).toBe(3.46);
  });

  it("all_passed is false when value mismatches exist", () => {
    const result = verifyExport(
      minimalInput({
        sample_values: [
          { label: "NOI", expected_value: 100, exported_value: 200 },
        ],
      }),
    );
    expect(result.all_passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Default tolerance — uses DEFAULT_TOLERANCE from shared utils
// ---------------------------------------------------------------------------

describe("Default tolerance", () => {
  it("DEFAULT_TOLERANCE is 0.01", () => {
    expect(DEFAULT_TOLERANCE).toBe(0.01);
  });

  it("passes when difference equals DEFAULT_TOLERANCE exactly", () => {
    const result = verifyExport(
      minimalInput({
        sample_values: [
          {
            label: "Revenue",
            expected_value: 1000,
            exported_value: 1000 + DEFAULT_TOLERANCE,
          },
        ],
      }),
    );

    expect(result.value_mismatches).toHaveLength(0);
  });

  it("fails when difference is just above DEFAULT_TOLERANCE", () => {
    const result = verifyExport(
      minimalInput({
        sample_values: [
          {
            label: "Revenue",
            expected_value: 1000,
            exported_value: 1000 + DEFAULT_TOLERANCE + 0.001,
          },
        ],
      }),
    );

    expect(result.value_mismatches).toHaveLength(1);
  });

  it("passes when difference is just below DEFAULT_TOLERANCE", () => {
    const result = verifyExport(
      minimalInput({
        sample_values: [
          {
            label: "Revenue",
            expected_value: 1000,
            exported_value: 1000 + DEFAULT_TOLERANCE - 0.01,
          },
        ],
      }),
    );

    expect(result.value_mismatches).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 6. Custom tolerance — per-value tolerance overrides default
// ---------------------------------------------------------------------------

describe("Custom tolerance", () => {
  it("uses per-value tolerance when specified", () => {
    const result = verifyExport(
      minimalInput({
        sample_values: [
          {
            label: "Revenue",
            expected_value: 1000,
            exported_value: 1005,
            tolerance: 10,
          },
        ],
      }),
    );

    // Difference is 5, tolerance is 10 => passes
    expect(result.value_mismatches).toHaveLength(0);
  });

  it("fails with custom tolerance when variance exceeds it", () => {
    const result = verifyExport(
      minimalInput({
        sample_values: [
          {
            label: "Revenue",
            expected_value: 1000,
            exported_value: 1005,
            tolerance: 3,
          },
        ],
      }),
    );

    // Difference is 5, tolerance is 3 => fails
    expect(result.value_mismatches).toHaveLength(1);
    expect(result.value_mismatches[0].variance).toBe(5);
  });

  it("tighter custom tolerance catches differences default would allow", () => {
    // With DEFAULT_TOLERANCE = 1.0, a 0.8 difference would pass.
    // With custom tolerance = 0.5, it should fail.
    const result = verifyExport(
      minimalInput({
        sample_values: [
          {
            label: "Fee",
            expected_value: 100,
            exported_value: 100.8,
            tolerance: 0.5,
          },
        ],
      }),
    );

    expect(result.value_mismatches).toHaveLength(1);
  });

  it("looser custom tolerance allows differences default would reject", () => {
    // With DEFAULT_TOLERANCE = 1.0, a 1.5 difference would fail.
    // With custom tolerance = 2.0, it should pass.
    const result = verifyExport(
      minimalInput({
        sample_values: [
          {
            label: "Fee",
            expected_value: 100,
            exported_value: 101.5,
            tolerance: 2.0,
          },
        ],
      }),
    );

    expect(result.value_mismatches).toHaveLength(0);
  });

  it("mixes default and custom tolerances across values in one call", () => {
    const result = verifyExport(
      minimalInput({
        sample_values: [
          // Uses default tolerance (0.01) — diff 0.005 => passes
          { label: "A", expected_value: 100, exported_value: 100.005 },
          // Uses custom tolerance (0.001) — diff 0.005 => fails
          {
            label: "B",
            expected_value: 100,
            exported_value: 100.005,
            tolerance: 0.001,
          },
        ],
      }),
    );

    expect(result.value_mismatches).toHaveLength(1);
    expect(result.value_mismatches[0].label).toBe("B");
  });
});

// ---------------------------------------------------------------------------
// 7. Year count — matches expected -> passes; mismatch -> fails
// ---------------------------------------------------------------------------

describe("Year count", () => {
  it("passes when actual matches expected year count", () => {
    const result = verifyExport(
      minimalInput({
        expected_year_count: 10,
        actual_year_count: 10,
      }),
    );

    const yearCheck = result.checks.find(
      (c) => c.check === "Year Count Correct",
    );
    expect(yearCheck).toBeDefined();
    expect(yearCheck!.passed).toBe(true);
    expect(yearCheck!.details).toBe("10 years as expected");
  });

  it("fails when actual does not match expected year count", () => {
    const result = verifyExport(
      minimalInput({
        expected_year_count: 10,
        actual_year_count: 8,
      }),
    );

    const yearCheck = result.checks.find(
      (c) => c.check === "Year Count Correct",
    );
    expect(yearCheck!.passed).toBe(false);
    expect(yearCheck!.details).toBe("Expected 10 years, found 8");
  });

  it("all_passed is false when year count mismatches", () => {
    const result = verifyExport(
      minimalInput({
        expected_year_count: 5,
        actual_year_count: 3,
      }),
    );
    expect(result.all_passed).toBe(false);
  });

  it("does not generate a year check when expected_year_count is undefined", () => {
    const result = verifyExport(
      minimalInput({
        actual_year_count: 10,
      }),
    );

    const yearCheck = result.checks.find(
      (c) => c.check === "Year Count Correct",
    );
    expect(yearCheck).toBeUndefined();
  });

  it("does not generate a year check when actual_year_count is undefined", () => {
    const result = verifyExport(
      minimalInput({
        expected_year_count: 10,
      }),
    );

    const yearCheck = result.checks.find(
      (c) => c.check === "Year Count Correct",
    );
    expect(yearCheck).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 8. Property count — matches expected -> passes; mismatch -> fails
// ---------------------------------------------------------------------------

describe("Property count", () => {
  it("passes when actual matches expected property count", () => {
    const result = verifyExport(
      minimalInput({
        expected_property_count: 5,
        actual_property_count: 5,
      }),
    );

    const propCheck = result.checks.find(
      (c) => c.check === "Property Count Correct",
    );
    expect(propCheck).toBeDefined();
    expect(propCheck!.passed).toBe(true);
    expect(propCheck!.details).toBe("5 properties as expected");
  });

  it("fails when actual does not match expected property count", () => {
    const result = verifyExport(
      minimalInput({
        expected_property_count: 5,
        actual_property_count: 3,
      }),
    );

    const propCheck = result.checks.find(
      (c) => c.check === "Property Count Correct",
    );
    expect(propCheck!.passed).toBe(false);
    expect(propCheck!.details).toBe("Expected 5 properties, found 3");
  });

  it("all_passed is false when property count mismatches", () => {
    const result = verifyExport(
      minimalInput({
        expected_property_count: 5,
        actual_property_count: 2,
      }),
    );
    expect(result.all_passed).toBe(false);
  });

  it("handles zero expected and actual property counts", () => {
    const result = verifyExport(
      minimalInput({
        expected_property_count: 0,
        actual_property_count: 0,
      }),
    );

    const propCheck = result.checks.find(
      (c) => c.check === "Property Count Correct",
    );
    expect(propCheck!.passed).toBe(true);
    expect(propCheck!.details).toBe("0 properties as expected");
  });

  it("does not generate a property check when expected_property_count is undefined", () => {
    const result = verifyExport(
      minimalInput({
        actual_property_count: 5,
      }),
    );

    const propCheck = result.checks.find(
      (c) => c.check === "Property Count Correct",
    );
    expect(propCheck).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 9. Missing actual data — expected_sections without actual_sections -> fails
// ---------------------------------------------------------------------------

describe("Missing actual data", () => {
  it("fails with explanation when expected_sections provided but actual_sections missing", () => {
    const result = verifyExport(
      minimalInput({
        expected_sections: ["Revenue", "Expenses"],
        // actual_sections intentionally omitted
      }),
    );

    const sectionCheck = result.checks.find(
      (c) => c.check === "All Expected Sections Present",
    );
    expect(sectionCheck).toBeDefined();
    expect(sectionCheck!.passed).toBe(false);
    expect(sectionCheck!.details).toBe(
      "Cannot verify sections \u2014 actual_sections not provided",
    );
  });

  it("all_passed is false when actual_sections not provided", () => {
    const result = verifyExport(
      minimalInput({
        expected_sections: ["Revenue"],
      }),
    );
    expect(result.all_passed).toBe(false);
  });

  it("missing_sections remains empty when actual_sections not provided (no comparison done)", () => {
    const result = verifyExport(
      minimalInput({
        expected_sections: ["Revenue"],
      }),
    );
    // The missing_sections array is not populated because the comparison
    // is not performed — only the check itself fails.
    expect(result.missing_sections).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 10. Partial input — only some check types provided -> only those checks run
// ---------------------------------------------------------------------------

describe("Partial input", () => {
  it("runs only format check when no optional fields provided", () => {
    const result = verifyExport(minimalInput());

    expect(result.checks).toHaveLength(1);
    expect(result.checks[0].check).toBe("Export Format Valid");
    expect(result.all_passed).toBe(true);
  });

  it("runs format + sections checks only when just sections are provided", () => {
    const result = verifyExport(
      minimalInput({
        expected_sections: ["Revenue"],
        actual_sections: ["Revenue"],
      }),
    );

    expect(result.checks).toHaveLength(2);
    const names = result.checks.map((c) => c.check);
    expect(names).toContain("Export Format Valid");
    expect(names).toContain("All Expected Sections Present");
  });

  it("runs format + value checks only when just sample_values are provided", () => {
    const result = verifyExport(
      minimalInput({
        sample_values: [
          { label: "NOI", expected_value: 100, exported_value: 100 },
        ],
      }),
    );

    expect(result.checks).toHaveLength(2);
    const names = result.checks.map((c) => c.check);
    expect(names).toContain("Export Format Valid");
    expect(names).toContain("Sample Values Match");
  });

  it("runs format + year count only when just year counts provided", () => {
    const result = verifyExport(
      minimalInput({
        expected_year_count: 10,
        actual_year_count: 10,
      }),
    );

    expect(result.checks).toHaveLength(2);
    const names = result.checks.map((c) => c.check);
    expect(names).toContain("Export Format Valid");
    expect(names).toContain("Year Count Correct");
  });

  it("runs format + property count only when just property counts provided", () => {
    const result = verifyExport(
      minimalInput({
        expected_property_count: 3,
        actual_property_count: 3,
      }),
    );

    expect(result.checks).toHaveLength(2);
    const names = result.checks.map((c) => c.check);
    expect(names).toContain("Export Format Valid");
    expect(names).toContain("Property Count Correct");
  });

  it("runs all 5 check types when all fields are provided", () => {
    const result = verifyExport({
      export_format: "csv",
      export_source: "cash_flow",
      expected_sections: ["Operating", "Financing"],
      actual_sections: ["Operating", "Financing"],
      sample_values: [
        { label: "OCF", expected_value: 50_000, exported_value: 50_000 },
      ],
      expected_year_count: 10,
      actual_year_count: 10,
      expected_property_count: 5,
      actual_property_count: 5,
    });

    expect(result.checks).toHaveLength(5);
    const names = result.checks.map((c) => c.check);
    expect(names).toContain("Export Format Valid");
    expect(names).toContain("All Expected Sections Present");
    expect(names).toContain("Sample Values Match");
    expect(names).toContain("Year Count Correct");
    expect(names).toContain("Property Count Correct");
  });
});

// ---------------------------------------------------------------------------
// 11. Empty/zero checks — no sections, no values -> still passes
// ---------------------------------------------------------------------------

describe("Empty/zero checks", () => {
  it("passes with empty sample_values array", () => {
    const result = verifyExport(
      minimalInput({
        sample_values: [],
      }),
    );

    // Empty array still triggers the check block; 0 mismatches => passes
    const valueCheck = result.checks.find(
      (c) => c.check === "Sample Values Match",
    );
    expect(valueCheck).toBeDefined();
    expect(valueCheck!.passed).toBe(true);
    expect(valueCheck!.details).toContain("0 spot-check values match");
    expect(result.all_passed).toBe(true);
  });

  it("passes with empty expected_sections and empty actual_sections", () => {
    const result = verifyExport(
      minimalInput({
        expected_sections: [],
        actual_sections: [],
      }),
    );

    const sectionCheck = result.checks.find(
      (c) => c.check === "All Expected Sections Present",
    );
    expect(sectionCheck!.passed).toBe(true);
    expect(sectionCheck!.details).toBe("All 0 sections found");
    expect(result.all_passed).toBe(true);
  });

  it("passes with no optional fields at all", () => {
    const result = verifyExport(minimalInput());
    expect(result.all_passed).toBe(true);
    expect(result.missing_sections).toHaveLength(0);
    expect(result.value_mismatches).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 12. Multiple mismatches — aggregation of value mismatches and missing sections
// ---------------------------------------------------------------------------

describe("Multiple mismatches", () => {
  it("aggregates multiple value mismatches", () => {
    const result = verifyExport(
      minimalInput({
        sample_values: [
          { label: "Revenue", expected_value: 100_000, exported_value: 110_000 },
          { label: "NOI", expected_value: 50_000, exported_value: 45_000 },
          { label: "Cash", expected_value: 20_000, exported_value: 20_000 },
        ],
      }),
    );

    expect(result.value_mismatches).toHaveLength(2);
    expect(result.value_mismatches[0].label).toBe("Revenue");
    expect(result.value_mismatches[0].variance).toBe(10_000);
    expect(result.value_mismatches[1].label).toBe("NOI");
    expect(result.value_mismatches[1].variance).toBe(5_000);

    const valueCheck = result.checks.find(
      (c) => c.check === "Sample Values Match",
    );
    expect(valueCheck!.passed).toBe(false);
    expect(valueCheck!.details).toBe("2 of 3 values have mismatches");
  });

  it("aggregates multiple missing sections", () => {
    const result = verifyExport(
      minimalInput({
        expected_sections: ["Revenue", "Expenses", "NOI", "Cash Flow"],
        actual_sections: ["Revenue"],
      }),
    );

    expect(result.missing_sections).toEqual(["Expenses", "NOI", "Cash Flow"]);
    expect(result.all_passed).toBe(false);
  });

  it("aggregates section mismatches and value mismatches together", () => {
    const result = verifyExport(
      minimalInput({
        expected_sections: ["Revenue", "Debt"],
        actual_sections: ["Revenue"],
        sample_values: [
          { label: "NOI", expected_value: 100, exported_value: 200 },
        ],
        expected_year_count: 10,
        actual_year_count: 8,
        expected_property_count: 5,
        actual_property_count: 3,
      }),
    );

    expect(result.all_passed).toBe(false);
    expect(result.missing_sections).toEqual(["Debt"]);
    expect(result.value_mismatches).toHaveLength(1);

    // Count how many checks failed
    const failedChecks = result.checks.filter((c) => !c.passed);
    expect(failedChecks.length).toBe(4); // sections, values, years, properties
  });

  it("all_passed is true only when checks pass AND no missing sections AND no value mismatches", () => {
    // A scenario where checks all pass but we verify the overall flag:
    const passing = verifyExport({
      export_format: "excel",
      export_source: "income_statement",
      expected_sections: ["A"],
      actual_sections: ["A"],
      sample_values: [
        { label: "X", expected_value: 10, exported_value: 10 },
      ],
      expected_year_count: 5,
      actual_year_count: 5,
      expected_property_count: 2,
      actual_property_count: 2,
    });

    expect(passing.all_passed).toBe(true);
    expect(passing.checks.every((c) => c.passed)).toBe(true);
    expect(passing.missing_sections).toHaveLength(0);
    expect(passing.value_mismatches).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Edge cases and additional coverage
// ---------------------------------------------------------------------------

describe("Edge cases", () => {
  it("handles negative value differences correctly", () => {
    const result = verifyExport(
      minimalInput({
        sample_values: [
          { label: "Debt", expected_value: 500_000, exported_value: 499_997 },
        ],
      }),
    );

    // abs(500000 - 499997) = 3 > DEFAULT_TOLERANCE (1.0)
    expect(result.value_mismatches).toHaveLength(1);
    expect(result.value_mismatches[0].variance).toBe(3);
  });

  it("handles zero expected and exported values", () => {
    const result = verifyExport(
      minimalInput({
        sample_values: [
          { label: "Zero", expected_value: 0, exported_value: 0 },
        ],
      }),
    );

    expect(result.value_mismatches).toHaveLength(0);
    expect(result.all_passed).toBe(true);
  });

  it("handles all export_format types", () => {
    const formats: ExportVerificationInput["export_format"][] = [
      "excel",
      "pdf",
      "pptx",
      "csv",
      "png_chart",
      "png_table",
    ];

    for (const fmt of formats) {
      const result = verifyExport(minimalInput({ export_format: fmt }));
      expect(result.all_passed).toBe(true);
      expect(result.checks[0].details).toContain(fmt);
    }
  });

  it("handles all export_source types", () => {
    const sources: ExportVerificationInput["export_source"][] = [
      "income_statement",
      "cash_flow",
      "balance_sheet",
      "investment_analysis",
      "dashboard",
      "company_financials",
      "consolidated",
    ];

    for (const src of sources) {
      const result = verifyExport(minimalInput({ export_source: src }));
      expect(result.all_passed).toBe(true);
      expect(result.checks[0].details).toContain(src);
    }
  });

  it("does not add section check when only actual_sections provided (no expected)", () => {
    const result = verifyExport(
      minimalInput({
        actual_sections: ["Revenue", "Expenses"],
      }),
    );

    const sectionCheck = result.checks.find(
      (c) => c.check === "All Expected Sections Present",
    );
    expect(sectionCheck).toBeUndefined();
    expect(result.all_passed).toBe(true);
  });

  it("value at exactly tolerance boundary passes (boundary condition)", () => {
    const result = verifyExport(
      minimalInput({
        sample_values: [
          {
            label: "Boundary",
            expected_value: 1000,
            exported_value: 1000.01, // diff = 0.01 = DEFAULT_TOLERANCE exactly
          },
        ],
      }),
    );

    // Math.abs(1000 - 1000.01) = 0.01; 0.01 > 0.01 is false, so it passes
    expect(result.value_mismatches).toHaveLength(0);
  });
});
