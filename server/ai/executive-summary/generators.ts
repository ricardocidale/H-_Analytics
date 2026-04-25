/**
 * server/ai/executive-summary/generators.ts — Public entry points for
 * generating property and portfolio executive summaries. Composes the
 * deterministic finance helpers, LLM section generator, and template
 * fallbacks.
 */

import type { Property } from "@shared/schema";
import type { AssumptionGuidance } from "@shared/schema/intelligence-v2";
import { computePortfolioRiskScore } from "../portfolio-risk-scorer";
import { computeConfidenceBreakdown } from "../confidence-scorer";
import {
  pct,
  computeKeyMetrics,
  computeEquityInvested,
  estimateNOI,
  estimateAnnualDebtService,
  summarizeWorstStress,
} from "./finance-helpers";
import { generateLLMPropertySections, generateLLMPortfolioSections } from "./llm-sections";
import { buildTemplateSummary, buildTemplatePortfolioSummary } from "./templates";
import type {
  ExecutiveSummaryOptions,
  PortfolioExecutiveSummary,
  PropertyExecutiveSummary,
  PropertyQualitativeSections,
  PortfolioQualitativeSections,
} from "./types";

/**
 * Generate an executive summary for a single property.
 * Deterministic metrics are always computed; LLM sections are optional.
 */
export async function generatePropertyExecutiveSummary(
  property: Property,
  guidanceRecords: AssumptionGuidance[],
  options: ExecutiveSummaryOptions = {},
): Promise<PropertyExecutiveSummary> {
  const { includeLLM = true } = options;
  const now = new Date().toISOString();

  // 1. Compute key metrics (deterministic)
  const keyMetrics = computeKeyMetrics(property);

  // 2. Build confidence summary
  let confidenceSummary = "No research data available.";
  let comparableData = "No comparable data available — run research engines to populate.";
  const sources: string[] = [];

  if (guidanceRecords.length > 0) {
    try {
      const confidence = await computeConfidenceBreakdown(guidanceRecords, "property");
      confidenceSummary = `${confidence.overall} confidence (${confidence.overallScore}/100): ${confidence.explanation}`;

      // Extract comparable count
      let maxComps = 0;
      for (const r of guidanceRecords) {
        const cs = r.comparableSet as Record<string, unknown> | null;
        if (cs && typeof cs === "object") {
          const comps = Array.isArray(cs) ? cs : (Array.isArray(cs.comps) ? cs.comps : null);
          if (comps && comps.length > maxComps) maxComps = comps.length;
        }
      }

      const location = [property.city, property.stateProvince, property.country].filter(Boolean).join(", ");
      comparableData = maxComps > 0
        ? `Based on ${maxComps} comparable properties in ${location || "the target market"}, with ${confidence.overall} confidence.`
        : `Research available for ${guidanceRecords.length} assumption fields in ${location || "the target market"}.`;

      // Collect sources
      for (const r of guidanceRecords) {
        if (r.sourceName && !sources.includes(r.sourceName)) {
          sources.push(r.sourceName);
        }
      }
    } catch {
      // Confidence scoring failed — continue with defaults
    }
  }

  // 3. Build guidance summary for LLM prompt
  const guidanceSummary = guidanceRecords.length > 0
    ? guidanceRecords
        .filter(r => r.valueMid != null)
        .slice(0, 10)
        .map(r => `${r.assumptionKey}: ${r.valueLow}–${r.valueHigh} (mid: ${r.valueMid}, confidence: ${r.confidence})`)
        .join("; ") || "Research ran but no numeric guidance produced."
    : "No research has been run for this property.";

  // 4. Build stress summary
  const stressSummary = summarizeWorstStress(property);

  // 5. Generate qualitative sections (LLM or template)
  let sections: PropertyQualitativeSections;

  if (includeLLM) {
    const llmSections = await generateLLMPropertySections(
      property, keyMetrics, stressSummary, confidenceSummary, guidanceSummary,
    );
    sections = llmSections ?? buildTemplateSummary(property, keyMetrics);
  } else {
    sections = buildTemplateSummary(property, keyMetrics);
  }

  return {
    propertyName: property.name,
    propertyId: property.id,
    generatedAt: now,
    investmentThesis: sections.investmentThesis,
    keyMetrics,
    marketPosition: sections.marketPosition,
    revenueStrategy: sections.revenueStrategy,
    riskFactors: sections.riskFactors,
    mitigants: sections.mitigants,
    exitStrategy: sections.exitStrategy,
    comparableData,
    confidenceLevel: confidenceSummary,
    sources,
  };
}

/**
 * Generate a portfolio-level executive summary.
 * Aggregates metrics across all properties and builds portfolio narrative.
 */
export async function generatePortfolioExecutiveSummary(
  properties: Property[],
  guidanceByProperty: Map<number, AssumptionGuidance[]>,
  options: ExecutiveSummaryOptions = {},
): Promise<PortfolioExecutiveSummary> {
  const { includeLLM = true } = options;
  const now = new Date().toISOString();
  const active = properties.filter((p: any) => p.isActive !== false);

  // 1. Compute portfolio-level metrics
  let totalInvestment = 0;
  let totalEquity = 0;
  let weightedIRRSum = 0;
  const sources: string[] = [];

  const propertySummaries: PortfolioExecutiveSummary["propertySummaries"] = [];

  for (const p of active) {
    const metrics = computeKeyMetrics(p);
    const equity = computeEquityInvested(p);
    totalInvestment += metrics.totalInvestment;
    totalEquity += equity;
    weightedIRRSum += metrics.projectedIRR * equity;

    // Collect sources from guidance
    const guidance = guidanceByProperty.get(p.id) ?? [];
    for (const r of guidance) {
      if (r.sourceName && !sources.includes(r.sourceName)) {
        sources.push(r.sourceName);
      }
    }

    // Build one-liner
    const location = [p.city, p.stateProvince].filter(Boolean).join(", ") || p.country || "";
    const tier = p.qualityTier ?? "upscale";
    const model = p.businessModel === "vrbo" ? "luxury rental" : "boutique hotel";
    const ltv = p.acquisitionLTV ?? 0;
    const leverageNote = ltv > 0.60 ? "leveraged" : ltv > 0 ? "low leverage" : "all-equity";

    propertySummaries.push({
      name: p.name,
      irr: metrics.projectedIRR,
      riskGrade: "B", // Placeholder — refined in the per-property grading loop
      oneLiner: `${tier.charAt(0).toUpperCase() + tier.slice(1)} ${model} in ${location}, ${pct(metrics.projectedIRR)} IRR, ${leverageNote}`,
    });
  }

  const weightedIRR = totalEquity > 0 ? weightedIRRSum / totalEquity : 0;

  // 2. Portfolio risk grade
  const riskReport = computePortfolioRiskScore(active);
  const portfolioRiskGrade = riskReport.riskGrade;

  // Update per-property risk grades from individual risk scoring
  for (const ps of propertySummaries) {
    const prop = active.find(p => p.name === ps.name);
    if (prop) {
      // Simple property-level grade based on IRR and leverage
      const ltv = prop.acquisitionLTV ?? 0;
      const noi = estimateNOI(prop);
      const ds = estimateAnnualDebtService(prop);
      const dscr = ds > 0 ? noi / ds : 99;
      if (dscr < 1.0 && ds > 0) ps.riskGrade = "F";
      else if (dscr < 1.25 && ds > 0) ps.riskGrade = "D";
      else if (ltv > 0.80) ps.riskGrade = "C";
      else if (ltv > 0.65) ps.riskGrade = "B";
      else ps.riskGrade = "A";
    }
  }

  // 3. Geographic spread
  const countriesArr = Array.from(new Set(active.map(p => p.country || "Unknown")));
  const marketsArr = Array.from(new Set(active.map(p => p.market || p.city || "Unknown")));
  const geographicSpread = `${countriesArr.length} ${countriesArr.length === 1 ? "country" : "countries"}, ${marketsArr.length} ${marketsArr.length === 1 ? "market" : "markets"}`;

  // 4. Generate qualitative sections
  let qualitative: PortfolioQualitativeSections;

  if (includeLLM) {
    const llmSections = await generateLLMPortfolioSections(
      active, propertySummaries, totalInvestment, weightedIRR, portfolioRiskGrade, geographicSpread,
    );
    qualitative = llmSections ?? buildTemplatePortfolioSummary(active, totalInvestment, weightedIRR, portfolioRiskGrade, geographicSpread);
  } else {
    qualitative = buildTemplatePortfolioSummary(active, totalInvestment, weightedIRR, portfolioRiskGrade, geographicSpread);
  }

  return {
    generatedAt: now,
    portfolioThesis: qualitative.portfolioThesis,
    totalProperties: active.length,
    totalInvestment,
    weightedIRR,
    portfolioRiskGrade,
    geographicSpread,
    brandStrategy: qualitative.brandStrategy,
    diversificationAnalysis: qualitative.diversificationAnalysis,
    growthPlan: qualitative.growthPlan,
    managementCompanyValue: qualitative.managementCompanyValue,
    propertySummaries,
    sources,
  };
}
