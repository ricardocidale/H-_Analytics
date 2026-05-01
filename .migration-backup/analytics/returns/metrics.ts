import type { RoundingPolicy } from "../../domain/types/rounding.js";
import { roundTo } from "../../domain/types/rounding.js";
import { computeIRR } from "./irr.js";
import type { ReturnMetrics } from "./types.js";

/**
 * Compute return metrics from a series of equity cash flows.
 *
 * @param cashFlows Array of periodic cash flows (negative = invested, positive = returned)
 * @param periodsPerYear 12 for monthly, 1 for annual
 * @param rounding Rounding policy
 */
export function computeReturnMetrics(
  cashFlows: number[],
  periodsPerYear: number,
  rounding: RoundingPolicy,
): ReturnMetrics {
  const r = (v: number) => roundTo(v, rounding);

  // Total invested = absolute sum of negative cash flows
  const total_invested = r(
    Math.abs(
      cashFlows.filter((cf) => cf < 0).reduce((sum, cf) => sum + cf, 0),
    ),
  );

  // Total distributions = sum of positive cash flows
  const total_distributions = r(
    cashFlows.filter((cf) => cf > 0).reduce((sum, cf) => sum + cf, 0),
  );

  const net_profit = r(total_distributions - total_invested);

  // MOIC = Total Distributions / Total Invested
  const moic =
    total_invested > 0
      ? r(total_distributions / total_invested)
      : 0;

  // DPI = Distributions to Paid-In (same as MOIC for fully realized)
  const dpi = moic;

  // Cash-on-Cash = average annual FCFE / Total Invested
  const totalPeriods = cashFlows.length;
  const years = totalPeriods / periodsPerYear;
  const totalNetCF = cashFlows.reduce((sum, cf) => sum + cf, 0);
  const avgAnnualCF = years > 0 ? totalNetCF / years : 0;
  const cash_on_cash =
    total_invested > 0
      ? r(avgAnnualCF / total_invested)
      : 0;

  // IRR
  const irr = computeIRR(cashFlows, periodsPerYear);

  return {
    irr,
    moic,
    cash_on_cash,
    dpi,
    total_invested,
    total_distributions,
    net_profit,
  };
}
