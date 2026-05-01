/**
 * Stress-test insight generator — applies deterministic stress scenarios
 * (15% occupancy drop, 200bps rate increase) and flags properties that break
 * cash flow under either scenario.
 */

import type { Property } from "@workspace/db";
import type { RiskInsight } from "@shared/risk-types";
import { pmt } from "@calc/shared/pmt";
import {
  computeTotalCostRate,
  dollars,
  estimateAnnualDebtService,
  estimateAnnualRevenue,
  estimateNOI,
  pct,
  propertyEntity,
} from "./helpers";

export function generateStressTestInsights(properties: Property[]): RiskInsight[] {
  const insights: RiskInsight[] = [];

  for (const p of properties) {
    const baseRevenue = estimateAnnualRevenue(p);
    const baseNOI = estimateNOI(p);
    const debtService = estimateAnnualDebtService(p);

    // Stress: occupancy drops 15%
    const stressedOccupancy = (p.maxOccupancy ?? 0.7) * 0.85;
    const stressedRevenue = baseRevenue * (stressedOccupancy / (p.maxOccupancy ?? 0.7));
    const stressedNOI = stressedRevenue * (1 - computeTotalCostRate(p));
    const noiDelta = stressedNOI - baseNOI;
    const cashAfterDebt = stressedNOI - debtService;

    if (debtService > 0 && cashAfterDebt < 0) {
      insights.push({
        category: "operational",
        severity: "warning",
        title: `${p.name}: occupancy stress breaks cash flow`,
        narrative: `If occupancy on "${p.name}" drops 15% (from ${pct(p.maxOccupancy ?? 0.7)} to ${pct(stressedOccupancy)}), NOI falls to ${dollars(stressedNOI)} — ${dollars(Math.abs(cashAfterDebt))} short of covering debt service. This stress scenario results in negative cash flow, meaning the investment would require additional capital to service its debt.`,
        dataPoints: [
          { label: "Base NOI", value: dollars(baseNOI) },
          { label: "Stressed NOI (-15% occ)", value: dollars(stressedNOI), delta: dollars(noiDelta) },
          { label: "Debt Service", value: dollars(debtService) },
          { label: "Cash Shortfall", value: dollars(cashAfterDebt) },
        ],
        actionItems: [
          "Build a cash reserve to cover 12 months of potential shortfall",
          "Negotiate covenants that allow for temporary DSCR dips",
          "Develop contingency plan for revenue decline (cost cuts, marketing push)",
        ],
        affectedEntities: [propertyEntity(p)],
      });
    }

    // Stress: rates rise 200bps
    if (debtService > 0) {
      const currentRate = p.acquisitionInterestRate ?? 0.065;
      const stressedRate = currentRate + 0.02;
      const loanAmount = (p.purchasePrice ?? 0) * (p.acquisitionLTV ?? 0);
      const stressedMonthlyRate = stressedRate / 12;
      const termMonths = (p.acquisitionTermYears ?? 25) * 12;
      const stressedMonthly = (loanAmount > 0 && stressedMonthlyRate > 0)
        ? pmt(loanAmount, stressedMonthlyRate, termMonths)
        : 0;
      const stressedDebtService = stressedMonthly * 12;
      const debtServiceIncrease = stressedDebtService - debtService;
      const stressedCash = baseNOI - stressedDebtService;

      if (stressedCash < 0 && baseNOI - debtService > 0) {
        insights.push({
          category: "macro",
          severity: "warning",
          title: `${p.name}: rate increase breaks cash flow`,
          narrative: `A 200 basis point increase in interest rates on "${p.name}" would raise annual debt service by ${dollars(debtServiceIncrease)} to ${dollars(stressedDebtService)}, pushing the property from positive to negative cash flow. This is a significant vulnerability for variable-rate debt or upcoming refinancing.`,
          dataPoints: [
            { label: "Current Rate", value: pct(currentRate) },
            { label: "Stressed Rate (+200bps)", value: pct(stressedRate) },
            { label: "Current Debt Service", value: dollars(debtService) },
            { label: "Stressed Debt Service", value: dollars(stressedDebtService), delta: `+${dollars(debtServiceIncrease)}` },
            { label: "Cash Flow at Stressed Rate", value: dollars(stressedCash) },
          ],
          actionItems: [
            "Lock in fixed-rate financing to eliminate rate risk",
            "Purchase an interest rate cap to limit exposure",
            "Reduce leverage to improve cash flow cushion",
          ],
          affectedEntities: [propertyEntity(p)],
        });
      }
    }
  }

  return insights;
}
