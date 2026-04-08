import type { YearlyPropertyFinancials } from "@/lib/financial/yearlyAggregator";

interface InsightResult {
  message: string;
  type: "observation" | "warning" | "tip";
  context: string;
}

function fmt$(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function analyzePortfolioForInsights(
  consolidatedYearly: YearlyPropertyFinancials[],
  propertyCount: number,
  portfolioIRR: number,
): InsightResult | null {
  if (!consolidatedYearly?.length || propertyCount === 0) return null;

  const year1 = consolidatedYearly[0];
  const lastYear = consolidatedYearly[consolidatedYearly.length - 1];

  if (!year1) return null;

  const noiMargin = year1.revenueTotal > 0 ? year1.noi / year1.revenueTotal : 0;
  const revenueGrowth = year1.revenueTotal > 0 && lastYear
    ? (lastYear.revenueTotal - year1.revenueTotal) / year1.revenueTotal
    : 0;

  if (year1.noi < 0) {
    return {
      message: `Your Year 1 NOI is negative (${fmt$(year1.noi)}). This is common during ramp-up, but you may want to check your expense assumptions.`,
      type: "warning",
      context: "Why is Year 1 NOI negative? What can I adjust to improve it?",
    };
  }

  if (noiMargin < 0.20 && year1.revenueTotal > 0) {
    return {
      message: `NOI margin is ${fmtPct(noiMargin)} in Year 1 — below the typical 25-35% range for boutique hotels. Consider reviewing operating expenses.`,
      type: "warning",
      context: "What's driving the low NOI margin? How do my expenses compare to benchmarks?",
    };
  }

  if (portfolioIRR > 0 && portfolioIRR < 0.08) {
    return {
      message: `Portfolio IRR of ${fmtPct(portfolioIRR)} is below the typical 10-15% target for boutique hotel investments. Adjusting ADR growth or exit cap rate could help.`,
      type: "observation",
      context: "What levers can improve my portfolio IRR?",
    };
  }

  if (portfolioIRR >= 0.20) {
    return {
      message: `Strong portfolio IRR of ${fmtPct(portfolioIRR)} — well above market averages. Worth stress-testing with a higher exit cap rate to validate.`,
      type: "tip",
      context: "How sensitive is my IRR to changes in exit cap rate?",
    };
  }

  if (revenueGrowth > 0.5 && consolidatedYearly.length > 3) {
    return {
      message: `Revenue grows ${fmtPct(revenueGrowth)} from Year 1 to Year ${consolidatedYearly.length} — solid growth trajectory across ${propertyCount} ${propertyCount === 1 ? "property" : "properties"}.`,
      type: "observation",
      context: "Break down the revenue growth by property. Which ones are driving it?",
    };
  }

  if (propertyCount > 1 && year1.revenueTotal > 0) {
    return {
      message: `Year 1 portfolio generates ${fmt$(year1.revenueTotal)} in revenue and ${fmt$(year1.noi)} NOI across ${propertyCount} properties (${fmtPct(noiMargin)} margin).`,
      type: "observation",
      context: "Compare NOI margins across my properties. Which one performs best?",
    };
  }

  if (year1.revenueTotal > 0) {
    return {
      message: `Year 1 NOI of ${fmt$(year1.noi)} on ${fmt$(year1.revenueTotal)} revenue (${fmtPct(noiMargin)} margin). ${noiMargin > 0.30 ? "Healthy margins." : ""}`,
      type: "observation",
      context: "How does my NOI margin compare to similar hotels?",
    };
  }

  return null;
}
