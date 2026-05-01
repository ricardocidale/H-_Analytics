/**
 * calc/returns/dcf-npv.ts — Discounted Cash Flow (DCF) and Net Present Value (NPV) calculator.
 *
 * PURPOSE:
 * Computes the Net Present Value of a series of cash flows discounted at a given rate.
 * DCF analysis is the cornerstone of investment valuation — it answers the question:
 * "What is a stream of future cash flows worth in today's dollars?"
 *
 * THE DCF FORMULA:
 *   NPV = Σ [CF_t / (1 + r)^t]  for t = 0, 1, 2, ..., n
 *
 * Where:
 *   CF_t = cash flow in period t
 *   r    = discount rate (required rate of return / cost of capital)
 *   t    = period index (0-based; period 0 is "today", not discounted)
 *
 * IMPORTANT: The cash_flows array uses t=0 as the first element. Period 0 is NOT
 * discounted (divisor = (1+r)^0 = 1). This convention means the initial investment
 * (negative cash flow) at t=0 is at face value, and future returns are discounted.
 *
 * IRR CROSS-CHECK:
 * If an IRR value is provided, the function verifies that NPV ≈ 0 when the cash
 * flows are discounted at the IRR. This catches IRR calculation errors in the
 * upstream `irr-vector` module. By definition, IRR is the rate r where NPV = 0.
 *
 * HOW IT FITS THE SYSTEM:
 * Called via the dispatch layer as the "dcf" skill. Used by the financial engine
 * to value properties, compute the NPV of hold-vs-sell scenarios, and validate
 * IRR results. The `pv_timeline` output lets the UI show period-by-period
 * present value waterfall charts.
 */
import type { RoundingPolicy } from "../../domain/types/rounding.js";
import { roundTo } from "../../domain/types/rounding.js";
import { rounder, sumArray, RATE_ROUNDING, DEFAULT_TOLERANCE } from "../shared/utils.js";
import { dPow, dDiv, dSum } from "../shared/decimal.js";

export interface DCFInput {
  cash_flows: number[];
  discount_rate: number;
  periods_per_year?: number;
  irr_cross_check?: number;
  tolerance?: number;
  rounding_policy: RoundingPolicy;
}

export interface DCFOutput {
  npv: number;
  pv_timeline: number[];
  total_undiscounted: number;
  annualized_discount_rate: number;
  irr_cross_check_passed: boolean | null;
}

export function computeDCF(input: DCFInput): DCFOutput {
  const r = rounder(input.rounding_policy);
  const periodsPerYear = input.periods_per_year ?? 1;
  const tolerance = input.tolerance ?? DEFAULT_TOLERANCE;

  const pv_timeline: number[] = [];
  const pvValues: number[] = [];

  for (let t = 0; t < input.cash_flows.length; t++) {
    const divisor = dPow(1 + input.discount_rate, t);
    if (divisor === 0 || !isFinite(divisor)) {
      throw new Error(`Invalid discount rate: divisor is ${divisor} at period ${t}`);
    }
    const pv = dDiv(input.cash_flows[t], divisor);
    pv_timeline.push(r(pv));
    pvValues.push(pv);
  }
  const npv = dSum(pvValues);

  const annualized_discount_rate =
    periodsPerYear === 1
      ? input.discount_rate
      : dPow(1 + input.discount_rate, periodsPerYear) - 1;

  let irr_cross_check_passed: boolean | null = null;
  if (input.irr_cross_check !== undefined) {
    const irrPvs: number[] = [];
    for (let t = 0; t < input.cash_flows.length; t++) {
      const d = dPow(1 + input.irr_cross_check, t);
      irrPvs.push(d !== 0 && isFinite(d) ? dDiv(input.cash_flows[t], d) : 0);
    }
    irr_cross_check_passed = Math.abs(dSum(irrPvs)) <= tolerance;
  }

  return {
    npv: r(npv),
    pv_timeline,
    total_undiscounted: r(sumArray(input.cash_flows)),
    annualized_discount_rate: roundTo(annualized_discount_rate, RATE_ROUNDING),
    irr_cross_check_passed,
  };
}
