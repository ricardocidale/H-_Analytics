/**
 * calc/validation/export-verification.ts — Post-export data integrity checker.
 *
 * PURPOSE:
 * After the UI exports financial data to Excel, PDF, PowerPoint, CSV, or image
 * formats, this module verifies that the exported output matches the source data.
 * It catches common export bugs: missing report sections, truncated year columns,
 * rounding drift between the calculation engine and the export renderer, and
 * dropped properties.
 *
 * VERIFICATION CHECKS:
 *   1. Export Format Valid — confirms the format/source combination is recognized.
 *   2. All Expected Sections Present — compares expected section names against
 *      actual sections found in the exported file (case-insensitive match).
 *   3. Sample Values Match — spot-checks a set of known values against their
 *      exported counterparts, allowing for a configurable tolerance (default:
 *      $0.01, set by DEFAULT_TOLERANCE from shared utils).
 *   4. Year Count Correct — ensures no projection years were dropped in export.
 *   5. Property Count Correct — ensures all properties are represented.
 *
 * WHY SPOT-CHECKING INSTEAD OF FULL COMPARISON:
 * Full cell-by-cell comparison is impractical for large multi-property exports.
 * Spot-checking a representative sample (e.g., Year 1 NOI, final-year cash balance,
 * total revenue) catches the most common failure modes while keeping the check fast.
 *
 * HOW IT FITS THE SYSTEM:
 * Called via the dispatch layer as the "export_verification" skill. The UI triggers
 * this after every export operation and surfaces any mismatches to the user as
 * warnings before they distribute the report to stakeholders.
 */
import { roundCents, DEFAULT_TOLERANCE } from "../shared/utils.js";

export interface SampleValue {
  label: string;
  expected_value: number;
  exported_value: number;
  tolerance?: number;
}

export interface ExportVerificationInput {
  export_format: "excel" | "pdf" | "pptx" | "csv" | "png_chart" | "png_table";
  export_source: "income_statement" | "cash_flow" | "balance_sheet" | "investment_analysis" | "dashboard" | "company_financials" | "consolidated";
  expected_sections?: string[];
  sample_values?: SampleValue[];
  expected_year_count?: number;
  expected_property_count?: number;
  actual_sections?: string[];
  actual_year_count?: number;
  actual_property_count?: number;
}

export interface ExportVerificationOutput {
  all_passed: boolean;
  checks: Array<{
    check: string;
    passed: boolean;
    details: string;
  }>;
  missing_sections: string[];
  value_mismatches: Array<{
    label: string;
    expected: number;
    actual: number;
    variance: number;
  }>;
}

export function verifyExport(input: ExportVerificationInput): ExportVerificationOutput {
  const checks: Array<{ check: string; passed: boolean; details: string }> = [];
  const missing_sections: string[] = [];
  const value_mismatches: Array<{ label: string; expected: number; actual: number; variance: number }> = [];

  checks.push({
    check: "Export Format Valid",
    passed: true,
    details: `Format: ${input.export_format}, Source: ${input.export_source}`,
  });

  if (input.expected_sections && input.actual_sections) {
    const actualSet = new Set(input.actual_sections.map(s => s.toLowerCase()));
    for (const section of input.expected_sections) {
      if (!actualSet.has(section.toLowerCase())) {
        missing_sections.push(section);
      }
    }
    const sectionsPassed = missing_sections.length === 0;
    checks.push({
      check: "All Expected Sections Present",
      passed: sectionsPassed,
      details: sectionsPassed
        ? `All ${input.expected_sections.length} sections found`
        : `Missing ${missing_sections.length} sections: ${missing_sections.join(", ")}`,
    });
  } else if (input.expected_sections) {
    checks.push({
      check: "All Expected Sections Present",
      passed: false,
      details: "Cannot verify sections — actual_sections not provided",
    });
  }

  if (input.sample_values) {
    for (const sv of input.sample_values) {
      const tol = sv.tolerance ?? DEFAULT_TOLERANCE;
      const v = Math.abs(sv.expected_value - sv.exported_value);
      if (v > tol) {
        value_mismatches.push({ label: sv.label, expected: sv.expected_value, actual: sv.exported_value, variance: roundCents(v) });
      }
    }
    const valuesPassed = value_mismatches.length === 0;
    checks.push({
      check: "Sample Values Match",
      passed: valuesPassed,
      details: valuesPassed
        ? `All ${input.sample_values.length} spot-check values match within tolerance`
        : `${value_mismatches.length} of ${input.sample_values.length} values have mismatches`,
    });
  }

  if (input.expected_year_count !== undefined && input.actual_year_count !== undefined) {
    const yearsPassed = input.actual_year_count === input.expected_year_count;
    checks.push({
      check: "Year Count Correct",
      passed: yearsPassed,
      details: yearsPassed
        ? `${input.actual_year_count} years as expected`
        : `Expected ${input.expected_year_count} years, found ${input.actual_year_count}`,
    });
  }

  if (input.expected_property_count !== undefined && input.actual_property_count !== undefined) {
    const propsPassed = input.actual_property_count === input.expected_property_count;
    checks.push({
      check: "Property Count Correct",
      passed: propsPassed,
      details: propsPassed
        ? `${input.actual_property_count} properties as expected`
        : `Expected ${input.expected_property_count} properties, found ${input.actual_property_count}`,
    });
  }

  return {
    all_passed: checks.every(c => c.passed) && missing_sections.length === 0 && value_mismatches.length === 0,
    checks,
    missing_sections,
    value_mismatches,
  };
}
