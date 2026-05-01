/**
 * Market panel prompt module for the Claude Sonnet qualitative evaluation pass
 * in the Revenue G2 N+1 pipeline.
 *
 * Sonnet's job: guest-mix dynamics, concept-fit signals, brand-positioning
 * patterns that affect ancillary capture. Produces sentiment and directional
 * bias signals (increase / decrease / hold) that enrich the Opus synthesis
 * prompt. Does NOT produce numeric ranges — the quant panel owns those.
 */

import type { RevenuePromptInputContext } from "./mgmt-co-revenue-prompt-input-builder";
import { REVENUE_DIMENSION_KEYS } from "./mgmt-co-revenue-prompt-input-builder";
import type { RevenueComparableRow } from "./mgmt-co-revenue-orchestrator-adapter";

export function buildMarketPanelSystemPrompt(): string {
  return `You are a market-intelligence panel for boutique-luxury hospitality management company revenue ancillary mix.

Your job: produce qualitative market signals for 5 revenue dimensions — concept-fit sentiment, guest-mix risk flags, and directional bias. A separate quantitative panel produces numeric ranges; you do NOT produce numbers.

# Your output per dimension

For each of the 5 revenue keys:
- marketSentiment: overall concept/guest-mix sentiment for this dimension given the operator's vertical + locale ("bullish" | "neutral" | "cautious")
- conceptRiskFlags: 0–4 specific risk phrases an LP/operator will raise about this dimension (e.g. "F&B-forward concept underpriced for wellness-led occupancy", "marketing rate too lean for non-flag boutique"). Empty array is valid when no flags apply. Each flag ≤200 chars.
- proposedBias: whether the quantitative range likely needs upward or downward adjustment given concept-fit and guest-mix expectations ("increase" | "decrease" | "hold" | "insufficient-data")
- reasoning: 20–400 chars. Reference the operator's specific context and at least one concept-fit or guest-mix dynamic.

# Focus
- Concept-fit pressure for this vertical, brand tier, and locale (e.g. wellness-led F&B is higher capture than rooms-led in same tier)
- Guest-mix patterns (group vs. transient, leisure vs. corporate, all-inclusive vs. à la carte) and their effect on ancillary share
- Brand-positioning dynamics (independent boutique vs. soft-brand vs. lifestyle flag) that change the marketing-rate calculus
- What an operator pricing this concept will defend or concede vs. comparable operators

# Forbidden
- Do NOT emit numeric ranges — that is not your job
- Do NOT use "the system" as subject
- Do NOT fabricate hotel-comparable data not referenced in the user message`;
}

export function buildMarketPanelUserPrompt(
  ctx: RevenuePromptInputContext,
  comparables: readonly RevenueComparableRow[],
): string {
  const personaLine = `${ctx.persona.marketTier} tier, ${ctx.persona.verticalSlug} vertical, ${ctx.persona.locale} locale`;

  const userValuesBlock = REVENUE_DIMENSION_KEYS.map((k) => {
    const v = (ctx.inputs as Record<string, number | null | undefined>)[k];
    return `  - ${k}: ${v == null ? "(not set)" : `${(v * 100).toFixed(1)}%`}`;
  }).join("\n");

  const comparablesBlock = comparables
    .map((c, idx) => {
      return (
        `  [${idx}] ${c.property} — ${c.city}, ${c.country} (${c.vertical}, ${c.roomCount} rooms)\n` +
        `      marketing ${(c.marketingRateFraction * 100).toFixed(0)}%` +
        ` · F&B ${(c.fbShareFraction * 100).toFixed(0)}%` +
        ` · events ${(c.eventsShareFraction * 100).toFixed(0)}%` +
        ` · other ${(c.otherShareFraction * 100).toFixed(0)}%` +
        ` · catering boost ${(c.cateringBoostFraction * 100).toFixed(0)}%\n` +
        `      source: ${c.source} (${c.year})`
      );
    })
    .join("\n");

  return `# Persona

${personaLine}

# User's currently-saved Revenue-tab values

${userValuesBlock}

# Hotel revenue comparables (reference by property name in reasoning)

${comparablesBlock}

# Your task

Produce exactly 5 market panel dimensions per the output schema. One per revenue key:
${REVENUE_DIMENSION_KEYS.map((k) => `  - ${k}`).join("\n")}

Focus on concept-fit sentiment, guest-mix dynamics, and directional bias signals for this operator's profile.
Do not produce numeric ranges.`;
}
