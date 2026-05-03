import type { IndependentMonthlyResult } from "../types";

export interface PortfolioTotals {
  revenue: number;
  feeBase: number;
  feeIncentive: number;
}

export function sumServerPortfolioTotals(
  allCalcs: IndependentMonthlyResult[][]
): PortfolioTotals {
  let revenue = 0;
  let feeBase = 0;
  let feeIncentive = 0;
  for (const propCalc of allCalcs) {
    for (const m of propCalc) {
      revenue      += m.revenueTotal;
      feeBase      += m.feeBase;
      feeIncentive += m.feeIncentive;
    }
  }
  return { revenue, feeBase, feeIncentive };
}
