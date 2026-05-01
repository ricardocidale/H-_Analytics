import { CheckResult } from "./types";
import { withinTolerance } from "./property-checks";

/**
 * Build a single check result by comparing expected vs actual values.
 * The check passes if the values are within the 0.1% tolerance threshold.
 * Severity determines how the failure is classified in the audit report:
 *   - "critical": Fundamental formula error — the model cannot be trusted
 *   - "material": Significant variance that could affect financial decisions
 *   - "minor": Small discrepancy, likely from rounding
 *   - "info": Informational — not a pass/fail check (e.g., negative cash notification)
 */
export function check(
  metric: string,
  category: string,
  gaapRef: string,
  formula: string,
  expected: number,
  actual: number,
  severity: "critical" | "material" | "minor" | "info" = "material"
): CheckResult {
  const variance = actual - expected;
  const variancePct = expected !== 0 ? ((variance / expected) * 100) : (actual === 0 ? 0 : 100);
  return {
    metric,
    category,
    gaapRef,
    formula,
    expected: Math.round(expected * 100) / 100,
    actual: Math.round(actual * 100) / 100,
    variance: Math.round(variance * 100) / 100,
    variancePct: Math.round(variancePct * 100) / 100,
    passed: severity === "info" || withinTolerance(expected, actual),
    severity,
  };
}
