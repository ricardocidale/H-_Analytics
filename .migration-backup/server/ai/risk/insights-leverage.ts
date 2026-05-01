/**
 * Leverage insight generator — checks LTV and DSCR against hospitality
 * benchmarks and flags aggressive or unsustainable capital structures.
 */

import type { Property } from "@shared/schema";
import type { RiskInsight } from "@shared/risk-types";
import { BENCHMARKS } from "./benchmarks";
import {
  dollars,
  estimateAnnualDebtService,
  estimateNOI,
  pct,
  propertyEntity,
} from "./helpers";

export function generateLeverageInsights(properties: Property[]): RiskInsight[] {
  const insights: RiskInsight[] = [];

  for (const p of properties) {
    const ltv = p.acquisitionLTV ?? 0;
    const noi = estimateNOI(p);
    const debtService = estimateAnnualDebtService(p);
    const dscr = debtService > 0 ? noi / debtService : 99;

    // LTV check
    if (ltv > BENCHMARKS.ltv85Threshold) {
      insights.push({
        category: "leverage",
        severity: "critical",
        title: `Very high leverage on ${p.name}`,
        narrative: `The loan-to-value ratio of ${pct(ltv)} on "${p.name}" significantly exceeds the ${pct(BENCHMARKS.ltv85Threshold)} threshold considered aggressive for hospitality assets. This leaves very little equity cushion — a ${pct(0.15)} decline in property value would put the loan underwater. Lenders may also impose restrictive covenants at this leverage level.`,
        dataPoints: [
          { label: "LTV", value: pct(ltv), benchmark: `<${pct(BENCHMARKS.ltv75Threshold)}`, delta: `+${pct(ltv - BENCHMARKS.ltv75Threshold)} above safe` },
          { label: "Purchase Price", value: dollars(p.purchasePrice ?? 0) },
          { label: "Loan Amount", value: dollars((p.purchasePrice ?? 0) * ltv) },
        ],
        actionItems: [
          "Increase equity contribution to bring LTV below 75%",
          "Negotiate interest-only period to improve early cash flow",
          "Consider mezzanine financing to reduce senior debt exposure",
        ],
        affectedEntities: [propertyEntity(p)],
      });
    } else if (ltv > BENCHMARKS.ltv75Threshold) {
      insights.push({
        category: "leverage",
        severity: "caution",
        title: `Elevated leverage on ${p.name}`,
        narrative: `The LTV of ${pct(ltv)} on "${p.name}" exceeds the ${pct(BENCHMARKS.ltv75Threshold)} level that most institutional hospitality lenders consider conservative. While not uncommon for value-add deals, this leverage level amplifies both upside returns and downside risk.`,
        dataPoints: [
          { label: "LTV", value: pct(ltv), benchmark: `<${pct(BENCHMARKS.ltv75Threshold)}`, delta: `+${pct(ltv - BENCHMARKS.ltv75Threshold)} above benchmark` },
        ],
        actionItems: [
          "Verify debt service coverage under a 15% revenue decline scenario",
          "Confirm loan terms include reasonable cure periods",
        ],
        affectedEntities: [propertyEntity(p)],
      });
    }

    // DSCR check
    if (debtService > 0 && dscr < 1.0) {
      insights.push({
        category: "leverage",
        severity: "critical",
        title: `Negative cash flow on ${p.name}`,
        narrative: `"${p.name}" has a debt service coverage ratio of ${dscr.toFixed(2)}x, meaning estimated NOI does not cover debt payments. The property would require additional capital infusion of approximately ${dollars(debtService - noi)} per year to service debt. This is a significant risk that must be addressed before committing capital.`,
        dataPoints: [
          { label: "DSCR", value: `${dscr.toFixed(2)}x`, benchmark: `>${BENCHMARKS.dscr125Threshold.toFixed(2)}x`, delta: `${(dscr - BENCHMARKS.dscr125Threshold).toFixed(2)}x below minimum` },
          { label: "Annual NOI", value: dollars(noi) },
          { label: "Annual Debt Service", value: dollars(debtService) },
          { label: "Annual Shortfall", value: dollars(debtService - noi) },
        ],
        actionItems: [
          "Reduce leverage or negotiate lower interest rate",
          "Increase revenue assumptions (ADR, occupancy, ancillary) if supported by market data",
          "Budget a cash reserve to cover shortfalls during ramp-up",
        ],
        affectedEntities: [propertyEntity(p)],
      });
    } else if (debtService > 0 && dscr < BENCHMARKS.dscr125Threshold) {
      insights.push({
        category: "leverage",
        severity: "warning",
        title: `Thin debt coverage on ${p.name}`,
        narrative: `"${p.name}" has a DSCR of ${dscr.toFixed(2)}x, below the ${BENCHMARKS.dscr125Threshold.toFixed(2)}x minimum that lenders typically require. A modest decline in occupancy or increase in expenses could push the property into negative cash flow territory.`,
        dataPoints: [
          { label: "DSCR", value: `${dscr.toFixed(2)}x`, benchmark: `>${BENCHMARKS.dscr125Threshold.toFixed(2)}x` },
          { label: "Annual NOI", value: dollars(noi) },
          { label: "Annual Debt Service", value: dollars(debtService) },
        ],
        actionItems: [
          "Stress test with 10-15% occupancy reduction",
          "Build operating reserve equal to 6 months of debt service",
        ],
        affectedEntities: [propertyEntity(p)],
      });
    }
  }

  return insights;
}
