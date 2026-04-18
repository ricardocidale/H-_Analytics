/**
 * calc/validation/assumption-consistency.ts — Pre-flight validation of model assumptions.
 *
 * PURPOSE:
 * Before the financial engine runs any projections, this module checks that all
 * user-entered assumptions are internally consistent, within reasonable ranges,
 * and free of contradictions. Think of it as a "preflight checklist" that catches
 * data-entry errors before they propagate into multi-year financial projections.
 *
 * SEVERITY LEVELS:
 *   - "critical": Model cannot run (e.g., missing start date, negative occupancy).
 *     The engine should refuse to proceed.
 *   - "material": Results will be unreliable (e.g., start occupancy > max occupancy,
 *     interest rate above 25%). The engine can run but results are suspect.
 *   - "warning": Unusual but not necessarily wrong (e.g., exit cap rate outside
 *     3–15% typical range, no capital raise funding configured).
 *   - "info": Informational notes for the user.
 *
 * ISSUE CATEGORIES:
 *   - missing_value: A required field is not provided.
 *   - out_of_range: A value is outside the reasonable or mathematically valid range.
 *   - contradiction: Two values conflict (e.g., start occupancy exceeds max occupancy).
 *   - timing_conflict: Dates are in the wrong order (e.g., operations before model start,
 *     refinance before acquisition).
 *   - business_rule: A business logic rule is violated (e.g., no funding before operations).
 *
 * KEY FINANCIAL TERMS CHECKED:
 *   - Exit Cap Rate: The capitalization rate used to value the property at sale.
 *     Typical hospitality range: 3–15%. A zero or negative cap rate causes divide-by-zero.
 *   - LTV (Loan-to-Value): Acquisition LTV above 95% is extremely aggressive.
 *   - ADR (Average Daily Rate): Must be positive — zero ADR means zero revenue.
 *   - SAFE (Simple Agreement for Future Equity): Startup funding for the management
 *     company. If no capital raise dates are configured, the company has no capital before
 *     operations begin.
 *   - Land Value Percent: Portion of purchase price allocated to land (not depreciable).
 *     Typical range: 5–50%.
 *
 * HOW IT FITS THE SYSTEM:
 * Called via the dispatch layer as the "assumption_consistency" skill. Also invoked
 * by the financial auditor before running full projections. The `is_valid` flag
 * (true when no critical or material issues) gates whether the engine proceeds.
 */
import {
  VALIDATION_EXIT_CAP_RATE_MIN,
  VALIDATION_EXIT_CAP_RATE_MAX,
  VALIDATION_INFLATION_RATE_MAX,
  VALIDATION_BASE_MGMT_FEE_MAX,
  VALIDATION_INTEREST_RATE_MAX,
  VALIDATION_ACQ_LTV_MAX,
  VALIDATION_LAND_VALUE_PCT_MAX,
} from "../../shared/constants.js";

export interface AssumptionIssue {
  severity: "critical" | "material" | "warning" | "info";
  category: "missing_value" | "out_of_range" | "contradiction" | "timing_conflict" | "business_rule";
  entity: string;
  field: string;
  message: string;
  current_value: string;
  expected_range: string;
}

/**
 * Industry-vertical exit-revenue-multiple range, sourced from the admin-managed
 * `exit_multiples` table (shared/schema/intelligence.ts). When supplied, the
 * watchdog flags any user-entered exit revenue multiple that falls outside
 * [valueLow, valueHigh] for the matching `industry_vertical`.
 */
export interface ExitMultipleRange {
  dimensionKey: string;
  label?: string;
  valueLow?: number | null;
  valueMid?: number | null;
  valueHigh?: number | null;
}

export interface AssumptionConsistencyInput {
  global_assumptions: {
    model_start_date: string;
    projection_years?: number;
    company_ops_start_date?: string;
    inflation_rate?: number;
    fixed_cost_escalation_rate?: number;
    base_management_fee?: number;
    incentive_management_fee?: number;
    capital_raise_1_date?: string;
    capital_raise_1_amount?: number;
    capital_raise_2_date?: string;
    capital_raise_2_amount?: number;
    exit_cap_rate?: number;
    industry_vertical?: string;
    exit_revenue_multiple?: number;
    debt_assumptions?: {
      interest_rate?: number;
      amortization_years?: number;
      acq_ltv?: number;
      refi_ltv?: number;
    };
  };
  properties?: Array<{
    name: string;
    operations_start_date: string;
    acquisition_date?: string;
    purchase_price: number;
    room_count?: number;
    start_adr?: number;
    start_occupancy?: number;
    max_occupancy?: number;
    type?: string;
    will_refinance?: string;
    refinance_date?: string;
    exit_cap_rate?: number;
    industry_vertical?: string;
    exit_revenue_multiple?: number;
    land_value_percent?: number;
  }>;
  /** Reference ranges from the exit_multiples table, keyed by industry vertical. */
  exit_multiples?: ExitMultipleRange[];
}

export interface AssumptionConsistencyOutput {
  is_valid: boolean;
  total_issues: number;
  issues: AssumptionIssue[];
  summary_by_severity: {
    critical: number;
    material: number;
    warning: number;
    info: number;
  };
}

export function checkAssumptionConsistency(input: AssumptionConsistencyInput): AssumptionConsistencyOutput {
  const issues: AssumptionIssue[] = [];
  const g = input.global_assumptions;

  // Global checks
  if (!g.model_start_date) {
    issues.push({
      severity: "critical", category: "missing_value", entity: "global", field: "model_start_date",
      message: "Model start date is required", current_value: "missing", expected_range: "Valid ISO date",
    });
  }

  if (g.exit_cap_rate !== undefined && g.exit_cap_rate <= 0) {
    issues.push({
      severity: "critical", category: "out_of_range", entity: "global", field: "exit_cap_rate",
      message: "Exit cap rate must be positive (cannot be 0%)", current_value: String(g.exit_cap_rate),
      expected_range: "0.03 – 0.15 (3% – 15%)",
    });
  }

  if (g.exit_cap_rate !== undefined && (g.exit_cap_rate < VALIDATION_EXIT_CAP_RATE_MIN || g.exit_cap_rate > VALIDATION_EXIT_CAP_RATE_MAX)) {
    issues.push({
      severity: "warning", category: "out_of_range", entity: "global", field: "exit_cap_rate",
      message: `Exit cap rate ${(g.exit_cap_rate * 100).toFixed(1)}% is outside typical hospitality range`,
      current_value: String(g.exit_cap_rate), expected_range: `${VALIDATION_EXIT_CAP_RATE_MIN} – ${VALIDATION_EXIT_CAP_RATE_MAX} (${VALIDATION_EXIT_CAP_RATE_MIN * 100}% – ${VALIDATION_EXIT_CAP_RATE_MAX * 100}%)`,
    });
  }

  if (g.inflation_rate !== undefined && (g.inflation_rate < 0 || g.inflation_rate > VALIDATION_INFLATION_RATE_MAX)) {
    issues.push({
      severity: "warning", category: "out_of_range", entity: "global", field: "inflation_rate",
      message: `Inflation rate ${(g.inflation_rate * 100).toFixed(1)}% is outside reasonable range`,
      current_value: String(g.inflation_rate), expected_range: `0.00 – ${VALIDATION_INFLATION_RATE_MAX} (0% – ${VALIDATION_INFLATION_RATE_MAX * 100}%)`,
    });
  }

  if (g.base_management_fee !== undefined && (g.base_management_fee < 0 || g.base_management_fee > VALIDATION_BASE_MGMT_FEE_MAX)) {
    issues.push({
      severity: "warning", category: "out_of_range", entity: "global", field: "base_management_fee",
      message: `Base management fee ${(g.base_management_fee * 100).toFixed(1)}% is outside typical range`,
      current_value: String(g.base_management_fee), expected_range: `0.02 – ${VALIDATION_BASE_MGMT_FEE_MAX} (2% – ${VALIDATION_BASE_MGMT_FEE_MAX * 100}%)`,
    });
  }

  if (g.debt_assumptions) {
    const da = g.debt_assumptions;
    if (da.interest_rate !== undefined && (da.interest_rate < 0 || da.interest_rate > VALIDATION_INTEREST_RATE_MAX)) {
      issues.push({
        severity: "material", category: "out_of_range", entity: "global", field: "debt_assumptions.interest_rate",
        message: `Interest rate ${(da.interest_rate * 100).toFixed(1)}% is outside reasonable range`,
        current_value: String(da.interest_rate), expected_range: `0.02 – 0.15 (2% – 15%)`,
      });
    }
    if (da.acq_ltv !== undefined && (da.acq_ltv < 0 || da.acq_ltv > VALIDATION_ACQ_LTV_MAX)) {
      issues.push({
        severity: "material", category: "out_of_range", entity: "global", field: "debt_assumptions.acq_ltv",
        message: `Acquisition LTV ${(da.acq_ltv * 100).toFixed(0)}% exceeds typical maximum`,
        current_value: String(da.acq_ltv), expected_range: `0.50 – 0.80 (50% – 80%)`,
      });
    }
  }

  // Exit revenue multiple check (global) — uses admin-managed exit_multiples
  // ranges keyed by industry vertical. A user-entered multiple outside the
  // [valueLow, valueHigh] band raises a warning suggesting the recommended
  // mid value for that vertical.
  checkExitRevenueMultiple({
    issues,
    entity: "global",
    industryVertical: g.industry_vertical,
    multiple: g.exit_revenue_multiple,
    ranges: input.exit_multiples,
  });

  // Capital raise funding check
  if (g.company_ops_start_date && g.model_start_date) {
    const noCapitalRaise = !g.capital_raise_1_date && !g.capital_raise_2_date;
    if (noCapitalRaise) {
      issues.push({
        severity: "warning", category: "business_rule", entity: "global", field: "capital_raise_dates",
        message: "No capital raise funding dates configured — management company may have no funding before operations start",
        current_value: "missing", expected_range: "At least one capital raise date before company_ops_start_date",
      });
    }
  }

  // Property checks
  if (input.properties) {
    for (const prop of input.properties) {
      const entity = `property: ${prop.name}`;

      if (prop.purchase_price <= 0) {
        issues.push({
          severity: "critical", category: "out_of_range", entity, field: "purchase_price",
          message: "Purchase price must be positive", current_value: String(prop.purchase_price),
          expected_range: "> 0",
        });
      }

      if (prop.start_occupancy !== undefined && (prop.start_occupancy < 0 || prop.start_occupancy > 1)) {
        issues.push({
          severity: "critical", category: "out_of_range", entity, field: "start_occupancy",
          message: `Start occupancy ${(prop.start_occupancy * 100).toFixed(0)}% is invalid`,
          current_value: String(prop.start_occupancy), expected_range: "0.00 – 1.00 (0% – 100%)",
        });
      }

      if (prop.max_occupancy !== undefined && (prop.max_occupancy < 0 || prop.max_occupancy > 1)) {
        issues.push({
          severity: "critical", category: "out_of_range", entity, field: "max_occupancy",
          message: `Max occupancy ${(prop.max_occupancy * 100).toFixed(0)}% is invalid`,
          current_value: String(prop.max_occupancy), expected_range: "0.00 – 1.00 (0% – 100%)",
        });
      }

      if (prop.start_occupancy !== undefined && prop.max_occupancy !== undefined &&
        prop.start_occupancy > prop.max_occupancy) {
        issues.push({
          severity: "material", category: "contradiction", entity, field: "start_occupancy / max_occupancy",
          message: `Start occupancy (${(prop.start_occupancy * 100).toFixed(0)}%) exceeds max occupancy (${(prop.max_occupancy * 100).toFixed(0)}%)`,
          current_value: `${prop.start_occupancy} > ${prop.max_occupancy}`,
          expected_range: "start_occupancy <= max_occupancy",
        });
      }

      if (prop.land_value_percent !== undefined && (prop.land_value_percent < 0 || prop.land_value_percent > VALIDATION_LAND_VALUE_PCT_MAX)) {
        issues.push({
          severity: "warning", category: "out_of_range", entity, field: "land_value_percent",
          message: `Land value ${(prop.land_value_percent * 100).toFixed(0)}% is outside typical range`,
          current_value: String(prop.land_value_percent), expected_range: "0.05 – 0.50 (5% – 50%)",
        });
      }

      // Timing checks
      if (g.model_start_date && prop.operations_start_date) {
        if (new Date(prop.operations_start_date) < new Date(g.model_start_date)) {
          issues.push({
            severity: "material", category: "timing_conflict", entity, field: "operations_start_date",
            message: `Operations start (${prop.operations_start_date}) is before model start (${g.model_start_date})`,
            current_value: prop.operations_start_date, expected_range: `>= ${g.model_start_date}`,
          });
        }
      }

      if (prop.will_refinance === "Yes" && prop.refinance_date && prop.acquisition_date) {
        if (new Date(prop.refinance_date) <= new Date(prop.acquisition_date)) {
          issues.push({
            severity: "critical", category: "timing_conflict", entity, field: "refinance_date",
            message: `Refinance date (${prop.refinance_date}) is before or at acquisition date (${prop.acquisition_date})`,
            current_value: prop.refinance_date, expected_range: `> ${prop.acquisition_date}`,
          });
        }
      }

      if (prop.start_adr !== undefined && prop.start_adr <= 0) {
        issues.push({
          severity: "critical", category: "out_of_range", entity, field: "start_adr",
          message: "Starting ADR must be positive", current_value: String(prop.start_adr),
          expected_range: "> 0",
        });
      }

      // Per-property exit revenue multiple — falls back to the global vertical
      // when the property does not declare its own.
      checkExitRevenueMultiple({
        issues,
        entity,
        industryVertical: prop.industry_vertical ?? g.industry_vertical,
        multiple: prop.exit_revenue_multiple,
        ranges: input.exit_multiples,
      });
    }
  }

  const summary_by_severity = {
    critical: issues.filter(i => i.severity === "critical").length,
    material: issues.filter(i => i.severity === "material").length,
    warning: issues.filter(i => i.severity === "warning").length,
    info: issues.filter(i => i.severity === "info").length,
  };

  return {
    is_valid: summary_by_severity.critical === 0 && summary_by_severity.material === 0,
    total_issues: issues.length,
    issues,
    summary_by_severity,
  };
}

/**
 * Emit a warning when `multiple` falls outside the [valueLow, valueHigh] band
 * for the matching `industryVertical`. Silently no-ops when any required input
 * is missing (no vertical, no multiple, or no matching range row), so this is
 * additive guidance — it never blocks the engine.
 */
function checkExitRevenueMultiple(args: {
  issues: AssumptionIssue[];
  entity: string;
  industryVertical?: string;
  multiple?: number;
  ranges?: ExitMultipleRange[];
}): void {
  const { issues, entity, industryVertical, multiple, ranges } = args;
  if (multiple === undefined || multiple === null) return;
  if (!industryVertical || !ranges || ranges.length === 0) return;

  const verticalKey = industryVertical.toLowerCase().trim();
  const range = ranges.find(r => r.dimensionKey?.toLowerCase().trim() === verticalKey);
  if (!range) return;

  const low = range.valueLow ?? undefined;
  const mid = range.valueMid ?? undefined;
  const high = range.valueHigh ?? undefined;
  if (low === undefined || high === undefined) return;

  if (multiple < low || multiple > high) {
    const label = range.label ?? range.dimensionKey;
    const recommendation = mid !== undefined
      ? ` Recommended midpoint for ${label}: ${mid}x revenue.`
      : "";
    issues.push({
      severity: "warning",
      category: "out_of_range",
      entity,
      field: "exit_revenue_multiple",
      message: `Exit revenue multiple ${multiple}x is outside the typical ${label} range (${low}x – ${high}x).${recommendation}`,
      current_value: String(multiple),
      expected_range: `${low}x – ${high}x`,
    });
  }
}
