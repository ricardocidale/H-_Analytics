import type { RoundingPolicy } from "../../domain/types/rounding.js";
import { computeReturnMetrics } from "./metrics.js";
import type { SensitivityPoint } from "./types.js";

export interface SensitivityScenario {
  label: string;
  cashFlows: number[];
}

/**
 * Run sensitivity analysis across multiple pre-computed cash flow scenarios.
 * The caller is responsible for constructing the scenarios with varied assumptions.
 * This function just computes return metrics for each.
 *
 * @param scenarios Array of labeled cash flow scenarios
 * @param periodsPerYear 12 for monthly, 1 for annual
 * @param rounding Rounding policy
 */
export function runSensitivity(
  scenarios: SensitivityScenario[],
  periodsPerYear: number,
  rounding: RoundingPolicy,
): SensitivityPoint[] {
  return scenarios.map((scenario) => ({
    label: scenario.label,
    metrics: computeReturnMetrics(scenario.cashFlows, periodsPerYear, rounding),
  }));
}
