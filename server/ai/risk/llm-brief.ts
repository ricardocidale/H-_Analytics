/**
 * LLM-enhanced risk brief generator — takes deterministic insights + per-
 * property briefs and asks Claude to enhance the narrative prose. Gracefully
 * degrades to the deterministic output on any LLM failure.
 */

import type {
  MacroContext,
  PropertyRiskBrief,
  RiskInsight,
} from "@shared/risk-types";
import type { Property } from "@shared/schema";
import { getAnthropicClient } from "../clients";
import { logger } from "../../logger";
import { BENCHMARKS } from "./benchmarks";
import {
  assessPropertyRiskLevel,
  dollars,
  estimateAnnualDebtService,
  estimateNOI,
  pct,
} from "./helpers";

// ─── Per-Property Brief (Deterministic) ───────────────────────────────────────

export function buildDeterministicPropertyBrief(
  property: Property,
  allInsights: RiskInsight[],
): PropertyRiskBrief {
  const propInsights = allInsights.filter(i =>
    i.affectedEntities.some(e => e.type === "property" && e.id === property.id),
  );

  const riskLevel = assessPropertyRiskLevel(propInsights);

  // Build basic strengths
  const strengths: string[] = [];
  const noi = estimateNOI(property);
  const debtService = estimateAnnualDebtService(property);
  const dscr = debtService > 0 ? noi / debtService : 99;

  if (dscr > BENCHMARKS.dscr150Threshold && debtService > 0) {
    strengths.push(`Strong debt service coverage at ${dscr.toFixed(2)}x`);
  }
  if ((property.acquisitionLTV ?? 0) < 0.65 && (property.acquisitionLTV ?? 0) > 0) {
    strengths.push(`Conservative leverage at ${pct(property.acquisitionLTV ?? 0)} LTV`);
  }
  if ((property.roomCount ?? 0) >= 10) {
    strengths.push(`Scale advantage with ${property.roomCount} rooms`);
  }
  const fbShare = property.revShareFB ?? 0;
  const eventsShare = property.revShareEvents ?? 0;
  if (fbShare > 0.20 || eventsShare > 0.10) {
    strengths.push("Diversified revenue streams beyond room revenue");
  }
  // Keep `dollars` referenced for dependency clarity; future strengths may
  // cite absolute NOI, and importing it only when it's used elsewhere causes
  // churn on every new strength-rule addition.
  void dollars;

  const strengthsNarrative = strengths.length > 0
    ? `Key strengths: ${strengths.join(". ")}. These factors support the investment thesis and provide resilience against market downturns.`
    : "No standout strengths identified based on current assumptions. Consider running research engines to validate positioning.";

  // Build concerns narrative from insights
  const concerns = propInsights
    .filter(i => i.severity === "warning" || i.severity === "critical")
    .map(i => i.title);
  const concernsNarrative = concerns.length > 0
    ? `Key concerns: ${concerns.join(". ")}. These risks should be addressed or mitigated before committing capital.`
    : propInsights.filter(i => i.severity === "caution").length > 0
      ? `Minor cautions flagged (${propInsights.filter(i => i.severity === "caution").length} items). Review these to ensure assumptions are well-supported.`
      : "No significant concerns identified based on current data.";

  // Basic questions
  const questions = [
    "What is the competitive set and how does this property differentiate?",
    "What is the realistic ramp-up timeline based on comparable openings?",
    "What are the key downside scenarios and how much capital is at risk?",
  ];

  return {
    propertyId: property.id,
    propertyName: property.name,
    overallRiskLevel: riskLevel,
    insights: propInsights,
    strengthsNarrative,
    concernsNarrative,
    questionsToAsk: questions,
  };
}

// ─── LLM-Enhanced Narratives ──────────────────────────────────────────────────

/** Narrow shape for the JSON Claude returns in `generateLLMRiskBrief`. */
interface LLMPropertyEnhancement {
  propertyName?: string;
  strengthsNarrative?: string;
  concernsNarrative?: string;
  questionsToAsk?: string[];
}

interface LLMRiskBriefPayload {
  overallNarrative?: string;
  propertyEnhancements?: LLMPropertyEnhancement[];
}

export async function generateLLMRiskBrief(
  deterministicInsights: RiskInsight[],
  propertyBriefs: PropertyRiskBrief[],
  macroContext: MacroContext,
): Promise<{
  overallNarrative: string;
  enhancedBriefs: PropertyRiskBrief[];
} | null> {
  try {
    const anthropic = getAnthropicClient();

    // Build structured prompt
    const insightsSummary = deterministicInsights
      .slice(0, 15)
      .map(i => `[${i.severity.toUpperCase()}] ${i.title}: ${i.narrative}`)
      .join("\n\n");

    const propertySummaries = propertyBriefs
      .map(b => `${b.propertyName} (Risk: ${b.overallRiskLevel}): ${b.insights.length} insights. Strengths: ${b.strengthsNarrative} Concerns: ${b.concernsNarrative}`)
      .join("\n\n");

    const macroSummary = `Fed Funds: ${macroContext.fedFundsRate}, Mortgage Rate: ${macroContext.mortgageRate}, CPI: ${macroContext.inflationRate}. ${macroContext.narrative}`;

    const prompt = `You are a senior hospitality investment analyst preparing a risk brief for an investor evaluating a boutique hospitality portfolio.

Portfolio data (top risk insights):
${insightsSummary}

Property profiles:
${propertySummaries}

Current macro environment:
${macroSummary}

Generate a concise, professional risk brief in this exact JSON format:
{
  "overallNarrative": "3-5 sentence portfolio summary for investors (plain language, no jargon, explain what the numbers mean)",
  "propertyEnhancements": [
    {
      "propertyName": "exact property name",
      "strengthsNarrative": "2-3 sentences on what's good about this investment",
      "concernsNarrative": "2-3 sentences on what an investor should worry about",
      "questionsToAsk": ["3-5 specific questions an investor should ask before committing"]
    }
  ]
}

Rules:
1. Be direct and honest — flag aggressive assumptions without being alarmist
2. Write like a Wall Street analyst, not a marketer — investors want truth
3. Connect macro data to property-level impact (e.g., "rates at X% means your debt service on Property Y is Z")
4. Questions should be specific to these properties, not generic
5. Return ONLY valid JSON, no markdown formatting`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250514",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find(b => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;

    let parsed: LLMRiskBriefPayload;
    try {
      parsed = JSON.parse(textBlock.text) as LLMRiskBriefPayload;
    } catch {
      logger.warn("LLM returned malformed JSON for risk enhancement — using unenhanced briefs", "risk-intelligence");
      return null;
    }

    // Enhance property briefs with LLM content
    const enhancements = parsed.propertyEnhancements ?? [];
    const enhancedBriefs = propertyBriefs.map(brief => {
      const enhancement = enhancements.find(e => e.propertyName === brief.propertyName);
      if (enhancement) {
        return {
          ...brief,
          strengthsNarrative: enhancement.strengthsNarrative || brief.strengthsNarrative,
          concernsNarrative: enhancement.concernsNarrative || brief.concernsNarrative,
          questionsToAsk: enhancement.questionsToAsk || brief.questionsToAsk,
        };
      }
      return brief;
    });

    return {
      overallNarrative: parsed.overallNarrative || "",
      enhancedBriefs,
    };
  } catch (err: unknown) {
    logger.warn(`LLM risk brief generation failed (graceful degradation): ${err instanceof Error ? err.message : err}`, "risk-intelligence");
    return null;
  }
}
