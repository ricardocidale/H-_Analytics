/**
 * server/report/executive-summary-section.ts — Export Integration Helper
 *
 * Converts an executive summary (property or portfolio) into a ReportSection
 * that the existing report compiler can embed as page 1 of any PDF/PPTX export.
 * Follows the ReportDefinition IR pattern from server/report/types.ts.
 */

import type { ReportSection, KpiSection, KpiMetric } from "./types";
import type {
  PropertyExecutiveSummary,
  PortfolioExecutiveSummary,
} from "../ai/executive-summary";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDollar(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${Math.round(val / 1_000).toLocaleString("en-US")}K`;
  return `$${Math.round(val).toLocaleString("en-US")}`;
}

function formatPct(val: number): string {
  return `${(val * 100).toFixed(1)}%`;
}

// ─── Property Summary → ReportSection ─────────────────────────────────────────

export function buildPropertyExecutiveSummarySection(
  summary: PropertyExecutiveSummary,
): ReportSection[] {
  const m = summary.keyMetrics;

  // KPI card with key metrics
  const kpiMetrics: KpiMetric[] = [
    {
      label: "Total Investment",
      value: formatDollar(m.totalInvestment),
      description: "Total capital required including purchase price and improvements",
    },
    {
      label: "Projected IRR",
      value: formatPct(m.projectedIRR),
      description: "Internal rate of return over the projected hold period",
    },
    {
      label: "Equity Multiple",
      value: `${m.equityMultiple.toFixed(2)}x`,
      description: "Total return divided by equity invested",
    },
    {
      label: "Stabilized NOI",
      value: formatDollar(m.stabilizedNOI),
      description: "Net Operating Income at stabilized occupancy",
    },
    {
      label: "Cash-on-Cash",
      value: formatPct(m.cashOnCash),
      description: "Year 1 cash flow as a percentage of equity invested",
    },
  ];

  if (m.dscr != null) {
    kpiMetrics.push({
      label: "DSCR",
      value: `${m.dscr.toFixed(2)}x`,
      description: "Debt Service Coverage Ratio — NOI divided by annual debt payments",
    });
  }

  const kpiSection: KpiSection = {
    kind: "kpi",
    title: `Executive Summary — ${summary.propertyName}`,
    metrics: kpiMetrics,
  };

  return [kpiSection];
}

// ─── Portfolio Summary → ReportSection ────────────────────────────────────────

export function buildPortfolioExecutiveSummarySection(
  summary: PortfolioExecutiveSummary,
): ReportSection[] {
  const kpiMetrics: KpiMetric[] = [
    {
      label: "Total Properties",
      value: `${summary.totalProperties}`,
      description: "Number of active properties in the portfolio",
    },
    {
      label: "Total Investment",
      value: formatDollar(summary.totalInvestment),
      description: "Aggregate capital across all properties",
    },
    {
      label: "Weighted IRR",
      value: formatPct(summary.weightedIRR),
      description: "Equity-weighted internal rate of return",
    },
    {
      label: "Risk Grade",
      value: summary.portfolioRiskGrade,
      description: "Portfolio risk grade from A (lowest risk) to F (highest risk)",
    },
    {
      label: "Geographic Spread",
      value: summary.geographicSpread,
      description: "Geographic diversification across countries and markets",
    },
  ];

  const kpiSection: KpiSection = {
    kind: "kpi",
    title: "Portfolio Executive Summary",
    metrics: kpiMetrics,
  };

  return [kpiSection];
}

/**
 * Universal builder — accepts either property or portfolio summary and returns
 * ReportSection array suitable for prepending to any ReportDefinition.
 */
export function buildExecutiveSummarySection(
  summary: PropertyExecutiveSummary | PortfolioExecutiveSummary,
): ReportSection[] {
  if ("propertyId" in summary) {
    return buildPropertyExecutiveSummarySection(summary);
  }
  return buildPortfolioExecutiveSummarySection(summary);
}
