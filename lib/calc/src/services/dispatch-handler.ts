/**
 * dispatch-handler.ts — Dispatch handler for the centralized_service_margin tool.
 *
 * Wraps the margin calculator for use via the calc/dispatch.ts tool router.
 * Accepts a service fee amount and markup, returns vendor cost, gross profit,
 * and effective margin.
 */

import { vendorCostFromFee, grossProfitFromFee, effectiveMargin } from "./margin-calculator.js";

interface CentralizedServiceMarginInput {
  /** The fee amount the property pays for this service */
  serviceRevenue: number;
  /** Cost-plus markup as decimal (e.g., 0.20 = 20%) */
  markup: number;
}

interface CentralizedServiceMarginOutput {
  serviceRevenue: number;
  markup: number;
  vendorCost: number;
  grossProfit: number;
  effectiveMargin: number;
}

export function computeCentralizedServiceMargin(
  input: CentralizedServiceMarginInput,
): CentralizedServiceMarginOutput {
  const { serviceRevenue, markup } = input;
  return {
    serviceRevenue,
    markup,
    vendorCost: vendorCostFromFee(serviceRevenue, markup),
    grossProfit: grossProfitFromFee(serviceRevenue, markup),
    effectiveMargin: effectiveMargin(markup),
  };
}
