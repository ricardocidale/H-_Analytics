/**
 * server/ai/executive-summary/formatters.ts — Plain text formatters for
 * embedding executive summaries into PDF/PPTX exports. Pure helpers.
 */

import { pct, dollars } from "./finance-helpers";
import type {
  PropertyExecutiveSummary,
  PortfolioExecutiveSummary,
} from "./types";

export function formatPropertySummaryAsText(summary: PropertyExecutiveSummary): string {
  const m = summary.keyMetrics;
  return `EXECUTIVE SUMMARY — ${summary.propertyName}
Generated: ${new Date(summary.generatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}

INVESTMENT THESIS
${summary.investmentThesis}

KEY METRICS
  Total Investment:    ${dollars(m.totalInvestment)}
  Projected IRR:       ${pct(m.projectedIRR)}
  Equity Multiple:     ${m.equityMultiple.toFixed(2)}x
  Stabilized NOI:      ${dollars(m.stabilizedNOI)}
  Exit Value:          ${dollars(m.exitValue)}
  DSCR:                ${m.dscr != null ? m.dscr.toFixed(2) + "x" : "N/A (all equity)"}
  Cash-on-Cash:        ${pct(m.cashOnCash)}
  Payback Period:      ${m.paybackYears.toFixed(1)} years

MARKET POSITION
${summary.marketPosition}

REVENUE STRATEGY
${summary.revenueStrategy}

RISK FACTORS
${summary.riskFactors}

RISK MITIGANTS
${summary.mitigants}

EXIT STRATEGY
${summary.exitStrategy}

DATA QUALITY
${summary.comparableData}
${summary.confidenceLevel}
${summary.sources.length > 0 ? "\nSources: " + summary.sources.join(", ") : ""}`;
}

export function formatPortfolioSummaryAsText(summary: PortfolioExecutiveSummary): string {
  const propLines = summary.propertySummaries
    .map(ps => `  - ${ps.name}: ${pct(ps.irr)} IRR, Risk ${ps.riskGrade} — ${ps.oneLiner}`)
    .join("\n");

  return `PORTFOLIO EXECUTIVE SUMMARY
Generated: ${new Date(summary.generatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}

PORTFOLIO THESIS
${summary.portfolioThesis}

PORTFOLIO METRICS
  Total Properties:    ${summary.totalProperties}
  Total Investment:    ${dollars(summary.totalInvestment)}
  Weighted IRR:        ${pct(summary.weightedIRR)}
  Risk Grade:          ${summary.portfolioRiskGrade}
  Geographic Spread:   ${summary.geographicSpread}

BRAND STRATEGY
${summary.brandStrategy}

DIVERSIFICATION
${summary.diversificationAnalysis}

GROWTH PLAN
${summary.growthPlan}

MANAGEMENT COMPANY VALUE
${summary.managementCompanyValue}

PROPERTY SUMMARIES
${propLines}
${summary.sources.length > 0 ? "\nSources: " + summary.sources.join(", ") : ""}`;
}
