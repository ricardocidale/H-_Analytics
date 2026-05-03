/**
 * server/ai/executive-summary/llm-sections.ts — LLM-enhanced narrative
 * generation for executive summaries. Returns structured JSON sections
 * via Anthropic, gracefully degrading to null on any failure (callers
 * fall back to the template builders in templates.ts).
 */

import type { Property } from "@workspace/db";
import { getAnthropicClient } from "../clients";
import { logger } from "../../logger";
import { AI_EXEC_SUMMARY_FULL_MAX_TOKENS, AI_EXEC_SUMMARY_SECTION_MAX_TOKENS } from "../../constants";
import { pct, dollars, getRegulatoryHighlights } from "./finance-helpers";
import type {
  PropertyExecutiveSummary,
  PortfolioExecutiveSummary,
  PropertyQualitativeSections,
  PortfolioQualitativeSections,
} from "./types";

const PROPERTY_MODEL = "claude-opus-4-6";
const PORTFOLIO_MODEL = "claude-opus-4-6";

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
}

export async function generateLLMPropertySections(
  p: Property,
  metrics: PropertyExecutiveSummary["keyMetrics"],
  stressSummary: string,
  confidenceSummary: string,
  guidanceSummary: string,
): Promise<PropertyQualitativeSections | null> {
  try {
    const anthropic = getAnthropicClient();

    const location = [p.city, p.stateProvince, p.country].filter(Boolean).join(", ");
    const tier = p.qualityTier ?? "upscale";
    const model = p.businessModel ?? "hotel";
    const isPricingPerProperty = p.pricingModel === "per_property";

    const prompt = `You are writing a 1-page investment executive summary for a potential LP investor.

PROPERTY: "${p.name}"
- Location: ${location || "Not specified"}
- Type: ${tier} ${model === "vrbo" ? "luxury rental" : "boutique hotel"} conversion
- Rooms: ${p.roomCount ?? 0}
- Pricing: ${isPricingPerProperty ? `$${p.nightlyPropertyRate ?? p.startAdr}/night whole-property` : `$${p.startAdr} ADR per room`}
- Stabilized Occupancy: ${pct(p.maxOccupancy ?? 0.7)}
- Revenue Mix: ${pct(Math.max(0, 1 - (p.revShareFB ?? 0) - (p.revShareEvents ?? 0) - (p.revShareOther ?? 0)))} rooms, ${pct(p.revShareFB ?? 0)} F&B, ${pct(p.revShareEvents ?? 0)} events

KEY FINANCIAL METRICS:
- Total Investment: ${dollars(metrics.totalInvestment)}
- Projected IRR: ${pct(metrics.projectedIRR)}
- Equity Multiple: ${metrics.equityMultiple.toFixed(2)}x
- Stabilized NOI: ${dollars(metrics.stabilizedNOI)}
- Exit Value: ${dollars(metrics.exitValue)} at ${pct(p.exitCapRate ?? 0.07)} cap
- ${metrics.dscr != null ? `DSCR: ${metrics.dscr.toFixed(2)}x` : "All equity — no debt service"}
- Cash-on-Cash: ${pct(metrics.cashOnCash)}
- Payback: ${metrics.paybackYears.toFixed(1)} years

STRESS TEST: ${stressSummary}
MARKET RESEARCH: ${guidanceSummary}
CONFIDENCE: ${confidenceSummary}
REGULATORY: ${p.country ? getRegulatoryHighlights(p.country) : "US domestic investment"}

Write the following sections in professional, investor-ready language. Return ONLY valid JSON:
{
  "investmentThesis": "3-5 sentences — the elevator pitch for why an LP should invest",
  "marketPosition": "2-3 sentences — why this market, what the comp set looks like",
  "revenueStrategy": "2-3 sentences — rooms, F&B, events breakdown and growth drivers",
  "riskFactors": "2-3 sentences — honest assessment of what could go wrong",
  "mitigants": "2-3 sentences — what protects the investment",
  "exitStrategy": "2-3 sentences — when and how the property exits"
}

Rules:
1. Be direct, specific, and cite numbers. This is for a skeptical LP who has seen 100 deals.
2. Avoid generic language like "exciting opportunity" or "strong fundamentals."
3. Use specific data: "$310 ADR based on 8 comparable properties" not "competitive rates."
4. Write like a Wall Street analyst, not a marketer.
5. Return ONLY valid JSON, no markdown formatting.`;

    const response = await anthropic.messages.create({
      model: PROPERTY_MODEL,
      max_tokens: AI_EXEC_SUMMARY_FULL_MAX_TOKENS,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find(b => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;

    const parsed = JSON.parse(stripCodeFences(textBlock.text));
    return {
      investmentThesis: parsed.investmentThesis || "",
      marketPosition: parsed.marketPosition || "",
      revenueStrategy: parsed.revenueStrategy || "",
      riskFactors: parsed.riskFactors || "",
      mitigants: parsed.mitigants || "",
      exitStrategy: parsed.exitStrategy || "",
    };
  } catch (err: unknown) {
    logger.warn(`LLM executive summary failed (graceful degradation): ${err instanceof Error ? err.message : err}`, "executive-summary");
    return null;
  }
}

export async function generateLLMPortfolioSections(
  properties: Property[],
  propertySummaries: PortfolioExecutiveSummary["propertySummaries"],
  totalInvestment: number,
  weightedIRR: number,
  riskGrade: string,
  geographicSpread: string,
): Promise<PortfolioQualitativeSections | null> {
  try {
    const anthropic = getAnthropicClient();

    const propertyLines = propertySummaries
      .map(ps => `- ${ps.name}: ${pct(ps.irr)} IRR, Risk ${ps.riskGrade} — ${ps.oneLiner}`)
      .join("\n");

    const prompt = `You are writing a 1-page portfolio investment executive summary for a potential LP investor in a boutique hospitality management company.

PORTFOLIO OVERVIEW:
- Total Properties: ${properties.length}
- Total Investment: ${dollars(totalInvestment)}
- Weighted IRR: ${pct(weightedIRR)}
- Portfolio Risk Grade: ${riskGrade}
- Geographic Spread: ${geographicSpread}

PROPERTIES:
${propertyLines}

Write the following sections in professional, investor-ready language. Return ONLY valid JSON:
{
  "portfolioThesis": "3-5 sentences — why invest in this portfolio as a whole",
  "brandStrategy": "2-3 sentences — how the management company brand creates value",
  "diversificationAnalysis": "2-3 sentences — geographic and segment diversification",
  "growthPlan": "2-3 sentences — how the portfolio scales",
  "managementCompanyValue": "2-3 sentences — what the ManCo brings to the table"
}

Rules:
1. Focus on portfolio-level value, not individual property details.
2. Be specific about diversification benefits and risk reduction.
3. Write for a sophisticated LP evaluating manager quality.
4. Return ONLY valid JSON, no markdown formatting.`;

    const response = await anthropic.messages.create({
      model: PORTFOLIO_MODEL,
      max_tokens: AI_EXEC_SUMMARY_SECTION_MAX_TOKENS,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find(b => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;

    const parsed = JSON.parse(stripCodeFences(textBlock.text));
    return {
      portfolioThesis: parsed.portfolioThesis || "",
      brandStrategy: parsed.brandStrategy || "",
      diversificationAnalysis: parsed.diversificationAnalysis || "",
      growthPlan: parsed.growthPlan || "",
      managementCompanyValue: parsed.managementCompanyValue || "",
    };
  } catch (err: unknown) {
    logger.warn(`LLM portfolio summary failed (graceful degradation): ${err instanceof Error ? err.message : err}`, "executive-summary");
    return null;
  }
}
