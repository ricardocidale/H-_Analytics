/**
 * Market panel prompt module for the Claude Sonnet qualitative evaluation pass
 * in the Compensation G3 N+1 pipeline.
 *
 * Sonnet's job: LP-perception dynamics, key-person risk signals, comp-share
 * sentiment. Produces sentiment and directional bias signals (increase /
 * decrease / hold) that enrich the Opus synthesis prompt. Does NOT produce
 * numeric ranges — the quant panel owns those.
 */

import type { CompensationPromptInputContext } from "./mgmt-co-compensation-prompt-input-builder";
import { COMPENSATION_DIMENSION_KEYS } from "./mgmt-co-compensation-prompt-input-builder";
import type { CompensationComparableRow } from "./mgmt-co-compensation-orchestrator-adapter";

export function buildMarketPanelSystemPrompt(): string {
  return `You are a market-intelligence panel for boutique-luxury hospitality management company compensation plans.

Your job: produce qualitative market signals for 5 compensation dimensions — LP sentiment, key-person and comp-share risk flags, and directional bias. A separate quantitative panel produces numeric ranges; you do NOT produce numbers.

# Your output per dimension

For each of the 5 compensation keys:
- marketSentiment: overall LP sentiment for this dimension given the operator's vertical + locale ("bullish" | "neutral" | "cautious")
- lpRiskFlags: 0–4 specific risk phrases an LP will raise about this dimension (e.g. "Year 1 partner draw runs ahead of fee revenue ramp", "Single-founder ops carries key-person risk LPs will price"). Empty array is valid when no flags apply. Each flag ≤200 chars.
- proposedBias: whether the quantitative range likely needs upward or downward adjustment given LP-perception ("increase" | "decrease" | "hold" | "insufficient-data")
- reasoning: 20–400 chars. Reference the operator's specific context and at least one LP-perception or operator-stage dynamic.

# Focus
- Founder-stage discipline: comp restraint at Year 1 vs. early-dilution risk to LPs
- Terminal trajectory at Year 10: ManCo revenue growth vs. partner-comp share at scale
- Key-person risk in single- or two-founder ops; cap-table dilution in heavy founding teams
- Talent retention dynamics tied to staff salary level for the operator's locale
- Operating-capacity adequacy at Tier-3 staffing for an institutional-stage portfolio

# Forbidden
- Do NOT emit numeric ranges — that is not your job
- Do NOT use "the system" as subject
- Do NOT fabricate operator-comparable data not referenced in the user message`;
}

export function buildMarketPanelUserPrompt(
  ctx: CompensationPromptInputContext,
  comparables: readonly CompensationComparableRow[],
): string {
  const personaLine = `${ctx.persona.marketTier} tier, ${ctx.persona.verticalSlug} vertical, ${ctx.persona.locale} locale`;

  const usdDisplay = (v: number | null | undefined) =>
    v == null ? "(not set)" : `$${Math.round(v).toLocaleString("en-US")}`;
  const countDisplay = (v: number | null | undefined) =>
    v == null ? "(not set)" : `${v.toFixed(0)}`;

  const userValuesBlock = COMPENSATION_DIMENSION_KEYS.map((k) => {
    const v = (ctx.inputs as Record<string, number | null | undefined>)[k];
    const display =
      k === "partnerCountYear1" || k === "staffTier3Fte" ? countDisplay(v) : usdDisplay(v);
    return `  - ${k}: ${display}`;
  }).join("\n");

  const comparablesBlock = comparables
    .map((c, idx) => {
      return (
        `  [${idx}] ${c.operator} — ${c.locale} (${c.vertical}, ${c.propertyCount} props)\n` +
        `      Y1 mgmt comp $${Math.round(c.partnerCompYear1Usd).toLocaleString("en-US")}` +
        ` · Y10 $${Math.round(c.partnerCompYear10Usd).toLocaleString("en-US")}` +
        ` · ${c.partnerCountYear1}p` +
        ` · staff $${Math.round(c.staffSalaryUsd).toLocaleString("en-US")}` +
        ` · T3 ${c.staffTier3Fte} FTE\n` +
        `      source: ${c.source} (${c.vintage})`
      );
    })
    .join("\n");

  return `# Persona

${personaLine}

# User's currently-saved Compensation-tab values

${userValuesBlock}

# Hospitality ManCo compensation comparables (reference by operator name in reasoning)

${comparablesBlock}

# Your task

Produce exactly 5 market panel dimensions per the output schema. One per compensation key:
${COMPENSATION_DIMENSION_KEYS.map((k) => `  - ${k}`).join("\n")}

Focus on LP-perception, key-person risk, comp-share sentiment, and directional bias signals for this operator's profile.
Do not produce numeric ranges.`;
}
