/**
 * server/ai/risk-intelligence.ts — Risk Intelligence Engine (orchestrator).
 *
 * Generates investor-grade risk narratives, stress-test explanations, and
 * educational content about risks specific to each property and the overall
 * portfolio. Combines deterministic data analysis with optional LLM-enhanced
 * narratives.
 *
 * Two layers:
 *   1. Deterministic insights — purely from data, always available, fast.
 *   2. LLM-enhanced narratives — optional, gracefully degraded if unavailable.
 *
 * Audit #319 R5 Phase 6 split this module into:
 *   - `shared/risk-types.ts` — portable types (RiskInsight, PropertyRiskBrief,
 *     PortfolioRiskBrief, MacroContext, RiskWorkingSet).
 *   - `server/ai/risk/benchmarks.ts` — BENCHMARKS constant.
 *   - `server/ai/risk/helpers.ts` — formatting + financial estimators +
 *     `buildRiskWorkingSet` session builder.
 *   - `server/ai/risk/insights-*.ts` — one generator per risk category
 *     (leverage, assumptions, macro, regulatory, concentration, stress).
 *   - `server/ai/risk/llm-brief.ts` — deterministic property-brief builder +
 *     LLM narrative enhancement.
 *
 * This file re-exports the public types from `@shared/risk-types` (to keep
 * the legacy `import … from "./risk-intelligence"` surface working) and
 * exposes the three top-level orchestrators consumed by the route layer.
 */

import type { Property } from "@workspace/db";
import type {
  PortfolioRiskBrief,
  PropertyRiskBrief,
  RiskInsight,
} from "@shared/risk-types";
import { storage } from "../storage";
import { computePortfolioRiskScore, type PortfolioRiskReport } from "./portfolio-risk-scorer";
import { pct } from "./risk/helpers";
import { generateAssumptionChallengeInsights } from "./risk/insights-assumptions";
import { generateConcentrationInsights } from "./risk/insights-concentration";
import { generateDueDiligenceInsights } from "./risk/insights-dd";
import { generateLeverageInsights } from "./risk/insights-leverage";
import { generateMacroInsights } from "./risk/insights-macro";
import { generateRegulatoryInsights } from "./risk/insights-regulatory";
import { generateStressTestInsights } from "./risk/insights-stress";
import {
  buildDeterministicPropertyBrief,
  generateLLMRiskBrief,
} from "./risk/llm-brief";

// ─── Public re-exports ────────────────────────────────────────────────────────
// Keep legacy importers working: any caller that did
//   import { RiskInsight, PropertyRiskBrief, PortfolioRiskBrief } from "./risk-intelligence"
// continues to resolve without touching call sites.

export type {
  RiskInsight,
  PropertyRiskBrief,
  PortfolioRiskBrief,
  MacroContext,
  RiskWorkingSet,
  PropertyFinancials,
  OverallRiskLevel,
  RiskSeverity,
  RiskCategory,
} from "@shared/risk-types";

export { generateLLMRiskBrief };

// ─── Main Deterministic Generator ─────────────────────────────────────────────

export async function generateDeterministicInsights(
  properties: Property[],
  _globalAssumptions?: unknown,
  _riskReport?: PortfolioRiskReport,
): Promise<{
  insights: RiskInsight[];
  macroContext: PortfolioRiskBrief["macroContext"];
}> {
  const leverageInsights = generateLeverageInsights(properties);
  const assumptionInsights = generateAssumptionChallengeInsights(properties);
  const { insights: macroInsights, macroContext } = await generateMacroInsights(properties);
  const regulatoryInsights = generateRegulatoryInsights(properties);
  const concentrationInsights = generateConcentrationInsights(properties);
  const stressInsights = generateStressTestInsights(properties);
  const ddInsights = await generateDueDiligenceInsights(
    properties,
    (id) => storage.getPropertyDdSummary(id),
  );

  const allInsights = [
    ...leverageInsights,
    ...assumptionInsights,
    ...macroInsights,
    ...regulatoryInsights,
    ...concentrationInsights,
    ...stressInsights,
    ...ddInsights,
  ];

  // Sort by severity: critical > warning > caution > info
  const severityOrder: Record<string, number> = { critical: 0, warning: 1, caution: 2, info: 3 };
  allInsights.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return { insights: allInsights, macroContext };
}

// ─── Top-Level Orchestrators ──────────────────────────────────────────────────

/**
 * Generate a full portfolio risk brief with deterministic insights and optional
 * LLM narratives.
 */
export async function generatePortfolioRiskBrief(
  properties: Property[],
  options: { includeLLM?: boolean } = {},
): Promise<PortfolioRiskBrief> {
  const active = properties.filter((p) => p.isActive !== false);

  // Deterministic analysis
  const { insights, macroContext } = await generateDeterministicInsights(active);

  // Build per-property briefs
  const propertyBriefs = active.map(p => buildDeterministicPropertyBrief(p, insights));

  // Identify top risks and strengths
  const topRisks = insights
    .filter(i => i.severity === "critical" || i.severity === "warning")
    .slice(0, 5);

  // Build strength insights from positive signals
  const strengthInsights: RiskInsight[] = [];
  const riskReport = computePortfolioRiskScore(active);

  if (riskReport.financialRisk.score >= 80) {
    strengthInsights.push({
      category: "leverage",
      severity: "info",
      title: "Strong financial fundamentals",
      narrative: `The portfolio has healthy financial metrics with an average LTV of ${pct(riskReport.financialRisk.averageLTV)} and portfolio DSCR of ${riskReport.financialRisk.portfolioDSCR.toFixed(2)}x. This provides a solid margin of safety against market downturns.`,
      dataPoints: [
        { label: "Avg LTV", value: pct(riskReport.financialRisk.averageLTV) },
        { label: "Portfolio DSCR", value: `${riskReport.financialRisk.portfolioDSCR.toFixed(2)}x` },
      ],
      actionItems: [],
      affectedEntities: [],
    });
  }

  if (riskReport.geographicRisk.countriesCount >= 2) {
    strengthInsights.push({
      category: "concentration",
      severity: "info",
      title: "Geographic diversification",
      narrative: `The portfolio spans ${riskReport.geographicRisk.countriesCount} countries and ${riskReport.geographicRisk.marketsCount} distinct markets, providing meaningful geographic diversification that reduces exposure to any single market downturn.`,
      dataPoints: [
        { label: "Countries", value: `${riskReport.geographicRisk.countriesCount}` },
        { label: "Markets", value: `${riskReport.geographicRisk.marketsCount}` },
      ],
      actionItems: [],
      affectedEntities: [],
    });
  }

  if (riskReport.operationalRisk.averageOccupancy > 0.75) {
    strengthInsights.push({
      category: "operational",
      severity: "info",
      title: "Solid occupancy targets",
      narrative: `Average target occupancy of ${pct(riskReport.operationalRisk.averageOccupancy)} is healthy and supported by market data. This provides a strong revenue foundation for the portfolio.`,
      dataPoints: [
        { label: "Avg Occupancy", value: pct(riskReport.operationalRisk.averageOccupancy) },
      ],
      actionItems: [],
      affectedEntities: [],
    });
  }

  const topStrengths = strengthInsights.slice(0, 3);

  // Default overall narrative (deterministic)
  let overallNarrative = `This portfolio of ${active.length} boutique hospitality ${active.length === 1 ? "property" : "properties"} has an overall risk grade of ${riskReport.riskGrade} (score: ${riskReport.overallScore}/100). `;
  if (topRisks.length > 0) {
    overallNarrative += `Key risk areas: ${topRisks.slice(0, 3).map(r => r.title).join("; ")}. `;
  }
  if (topStrengths.length > 0) {
    overallNarrative += `Key strengths: ${topStrengths.map(s => s.title).join("; ")}.`;
  }

  let finalBriefs = propertyBriefs;

  // Optional LLM enhancement
  if (options.includeLLM) {
    const llmResult = await generateLLMRiskBrief(insights, propertyBriefs, macroContext);
    if (llmResult) {
      overallNarrative = llmResult.overallNarrative || overallNarrative;
      finalBriefs = llmResult.enhancedBriefs;
    }
  }

  return {
    overallNarrative,
    propertyBriefs: finalBriefs,
    macroContext,
    topRisks,
    topStrengths,
  };
}

/**
 * Generate a risk brief for a single property.
 */
export async function generatePropertyRiskBrief(
  property: Property,
  allProperties: Property[],
  options: { includeLLM?: boolean } = {},
): Promise<PropertyRiskBrief> {
  const { insights, macroContext } = await generateDeterministicInsights(allProperties);
  let brief = buildDeterministicPropertyBrief(property, insights);

  if (options.includeLLM) {
    const llmResult = await generateLLMRiskBrief(
      insights.filter(i => i.affectedEntities.some(e => e.type === "property" && e.id === property.id)),
      [brief],
      macroContext,
    );
    if (llmResult && llmResult.enhancedBriefs.length > 0) {
      brief = llmResult.enhancedBriefs[0];
    }
  }

  return brief;
}

/**
 * Get a brief risk summary string suitable for inclusion in Rebecca context.
 */
export function getRiskSummaryForContext(brief: PropertyRiskBrief): string {
  const topInsight = brief.insights[0];
  const topStrength = brief.strengthsNarrative.split(":")[1]?.split(".")[0]?.trim() ?? "See full risk brief";
  const topConcern = topInsight?.title ?? "No significant concerns";
  return `Risk Profile: ${brief.overallRiskLevel}. Key concern: ${topConcern}. Key strength: ${topStrength}.`;
}
