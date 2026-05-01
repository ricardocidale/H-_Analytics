import type { IRRResult } from "./types.js";
import { dPow } from "../../calc/shared/decimal.js";

const DEFAULT_MAX_ITERATIONS = 100;
const DEFAULT_TOLERANCE = 1e-8;

/**
 * Compute NPV at a given discount rate.
 * NPV = Σ CF_t / (1+r)^t
 */
function npv(cashFlows: number[], rate: number): number {
  let result = 0;
  for (let t = 0; t < cashFlows.length; t++) {
    result += cashFlows[t] / dPow(1 + rate, t);
  }
  return result;
}

/**
 * Compute the derivative of NPV with respect to rate.
 * NPV'(r) = Σ -t * CF_t / (1+r)^(t+1)
 */
function npvDerivative(cashFlows: number[], rate: number): number {
  let result = 0;
  for (let t = 1; t < cashFlows.length; t++) {
    result += (-t * cashFlows[t]) / dPow(1 + rate, t + 1);
  }
  return result;
}

/**
 * Compute IRR using Newton-Raphson method.
 *
 * @param cashFlows Array of periodic cash flows (negative = outflow, positive = inflow)
 * @param periodsPerYear Number of periods per year (12 for monthly, 1 for annual). Used for annualization.
 * @param maxIterations Maximum Newton-Raphson iterations
 * @param tolerance Convergence tolerance for NPV
 */
export function computeIRR(
  cashFlows: number[],
  periodsPerYear: number = 1,
  maxIterations: number = DEFAULT_MAX_ITERATIONS,
  tolerance: number = DEFAULT_TOLERANCE,
): IRRResult {
  // Edge cases
  if (cashFlows.length < 2) {
    return { irr_periodic: null, irr_annualized: null, converged: false, iterations: 0 };
  }

  const hasNegative = cashFlows.some((cf) => cf < 0);
  const hasPositive = cashFlows.some((cf) => cf > 0);

  // Need both positive and negative cash flows for IRR to exist
  if (!hasNegative || !hasPositive) {
    return { irr_periodic: null, irr_annualized: null, converged: false, iterations: 0 };
  }

  // Initial guess: ratio-based heuristic
  const totalPositive = cashFlows
    .filter((cf) => cf > 0)
    .reduce((sum, cf) => sum + cf, 0);
  const totalNegative = Math.abs(
    cashFlows.filter((cf) => cf < 0).reduce((sum, cf) => sum + cf, 0),
  );
  let rate = dPow(totalPositive / totalNegative, 1 / cashFlows.length) - 1;

  // Clamp initial guess to reasonable range
  rate = Math.max(-0.5, Math.min(rate, 10));

  let iterations = 0;
  for (let i = 0; i < maxIterations; i++) {
    iterations = i + 1;
    const npvVal = npv(cashFlows, rate);

    if (Math.abs(npvVal) < tolerance) {
      const annualized =
        periodsPerYear === 1
          ? rate
          : dPow(1 + rate, periodsPerYear) - 1;
      return {
        irr_periodic: rate,
        irr_annualized: annualized,
        converged: true,
        iterations,
      };
    }

    const derivative = npvDerivative(cashFlows, rate);

    // Avoid division by near-zero derivative
    if (Math.abs(derivative) < 1e-15) {
      break;
    }

    const newRate = rate - npvVal / derivative;

    // Guard against divergence — clamp to reasonable range
    if (newRate < -0.99) {
      rate = -0.99;
    } else if (newRate > 100) {
      rate = 100;
    } else {
      rate = newRate;
    }
  }

  // Did not converge — return best guess if NPV is very small
  const finalNpv = npv(cashFlows, rate);
  if (Math.abs(finalNpv) < 1) {
    const annualized =
      periodsPerYear === 1 ? rate : dPow(1 + rate, periodsPerYear) - 1;
    return {
      irr_periodic: rate,
      irr_annualized: annualized,
      converged: true,
      iterations,
    };
  }

  return { irr_periodic: null, irr_annualized: null, converged: false, iterations };
}
