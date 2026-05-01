/**
 * calc/returns/equity-multiple.ts — Equity Multiple (MOIC) calculator.
 *
 * PURPOSE:
 * Computes the Equity Multiple (also called MOIC — Multiple on Invested Capital),
 * which measures how many times an investor gets their money back. This is one of
 * the simplest and most intuitive return metrics in real estate private equity.
 *
 * FORMULA:
 *   Equity Multiple = Total Distributions / Total Equity Invested
 *
 * Example: If an investor puts in $1M and receives $2.5M back over the hold
 * period, the equity multiple is 2.5×. The net profit is $1.5M (150% return).
 *
 * HOW IT DIFFERS FROM IRR:
 * - Equity Multiple ignores the TIME VALUE of money. A 2.0× over 3 years is
 *   very different from 2.0× over 10 years, but the multiple is the same.
 * - IRR captures the annualized return considering timing. Both metrics are
 *   needed for a complete picture.
 *
 * CASH FLOW CONVENTION:
 * The input `cash_flows` array uses negative values for invested capital (outflows)
 * and positive values for distributions (inflows). The function separates them:
 *   total_invested = |sum of all negative cash flows|
 *   total_returned = sum of all positive cash flows
 *
 * HOW IT FITS THE SYSTEM:
 * Called via the dispatch layer as the "equity_multiple" skill. Displayed alongside
 * IRR in the investment analysis dashboard to give investors both time-weighted
 * (IRR) and absolute (equity multiple) return perspectives.
 */
import type { RoundingPolicy } from "../../domain/types/rounding.js";
import { rounder, RATIO_ROUNDING } from "../shared/utils.js";
import { roundTo } from "../../domain/types/rounding.js";

export interface EquityMultipleInput {
  cash_flows: number[];
  label?: string;
  rounding_policy: RoundingPolicy;
}

export interface EquityMultipleOutput {
  equity_multiple: number;
  total_invested: number;
  total_returned: number;
  net_profit: number;
  profit_margin: number;
  label: string;
}

export function computeEquityMultiple(input: EquityMultipleInput): EquityMultipleOutput {
  const r = rounder(input.rounding_policy);

  const total_invested = r(
    Math.abs(input.cash_flows.filter(cf => cf < 0).reduce((sum, cf) => sum + cf, 0))
  );

  const total_returned = r(
    input.cash_flows.filter(cf => cf > 0).reduce((sum, cf) => sum + cf, 0)
  );

  const net_profit = r(total_returned - total_invested);

  const equity_multiple = total_invested > 0
    ? roundTo(total_returned / total_invested, RATIO_ROUNDING)
    : 0;

  const profit_margin = total_invested > 0
    ? roundTo(net_profit / total_invested, RATIO_ROUNDING)
    : 0;

  return { equity_multiple, total_invested, total_returned, net_profit, profit_margin, label: input.label ?? "" };
}
