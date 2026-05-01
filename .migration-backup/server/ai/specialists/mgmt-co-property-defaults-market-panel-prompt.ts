/**
 * Market panel prompt module for the Claude Sonnet qualitative evaluation pass
 * in the Property-Defaults Phase 2 N+1 pipeline.
 *
 * Sonnet's job: LP-perception dynamics for property underwriting defaults —
 * event cost defensibility, ancillary profitability, utilities variability
 * consistency, and distribution cost risk. Produces sentiment and directional
 * bias signals (increase / decrease / hold) that enrich the Opus synthesis
 * prompt. Does NOT produce numeric ranges — the quant panel owns those.
 */

import type { PropertyDefaultsPromptInputContext } from "./mgmt-co-property-defaults-prompt-input-builder";
import { PROPERTY_DEFAULTS_DIMENSION_KEYS } from "./mgmt-co-property-defaults-prompt-input-builder";
import type { PropertyDefaultsComparableRow } from "./mgmt-co-property-defaults-orchestrator-adapter";

export function buildMarketPanelSystemPrompt(): string {
  return `You are a market-intelligence panel for boutique-luxury hospitality property underwriting defaults.

Your job: produce qualitative market signals for 4 property-defaults dimensions — LP sentiment, LP scrutiny / operational risk flags, and directional bias. A separate quantitative panel produces numeric ranges; you do NOT produce numbers.

# Your output per dimension

For each of the 4 property-defaults keys:
- marketSentiment: overall LP sentiment for this dimension given the operator's vertical + locale ("bullish" | "neutral" | "cautious")
- lpRiskFlags: 0–4 specific risk phrases an LP will raise about this dimension (e.g. "Event expense ratio above USALI boutique-luxury comp set suggests under-pricing or high F&B labor cost", "High blended OTA commission compresses RevPAR-to-NOI flow-through and signals direct-booking underinvestment"). Empty array is valid when no flags apply. Each flag ≤200 chars.
- proposedBias: whether the quantitative range likely needs upward or downward adjustment given LP-perception ("increase" | "decrease" | "hold" | "insufficient-data")
- reasoning: 20–400 chars. Reference the operator's specific context and at least one LP-perception dynamic.

# Focus
- Event expense rate: USALI/CBRE event-segment cost benchmark comparison; F&B prime cost drivers; LP scrutiny on event profitability contribution relative to comp set
- Other expense rate: USALI undistributed ancillary benchmark; ancillary revenue mix (spa/parking/resort fees) and its cost structure implications for LP diligence
- Utilities variable split: ENERGY STAR/Cornell benchmarks for boutique hotel class; infrastructure maturity signals (smart-room controls vs. fixed-load); worst-case NOI sensitivity at low occupancy
- Sales commission rate: Kalibri Labs direct-booking benchmark comparison; OTA mix exposure; LP signal on channel cost discipline and brand equity investment

# Forbidden
- Do NOT emit numeric ranges — that is not your job
- Do NOT use "the system" as subject
- Do NOT fabricate property-comparable data not referenced in the user message`;
}

export function buildMarketPanelUserPrompt(
  ctx: PropertyDefaultsPromptInputContext,
  comparables: readonly PropertyDefaultsComparableRow[],
): string {
  const personaLine = `${ctx.persona.marketTier} tier, ${ctx.persona.verticalSlug} vertical, ${ctx.persona.locale} locale`;

  const pct = (v: number | null | undefined) =>
    v == null ? "(not set)" : `${(v * 100).toFixed(1)}%`;

  const userValuesBlock = PROPERTY_DEFAULTS_DIMENSION_KEYS.map((k) => {
    const v = (ctx.inputs as Record<string, number | null | undefined>)[k];
    return `  - ${k}: ${pct(v)}`;
  }).join("\n");

  const p = (n: number) => `${(n * 100).toFixed(1)}%`;
  const comparablesBlock = comparables
    .map((c, idx) => {
      return (
        `  [${idx}] ${c.propertyName} — ${c.locale} (${c.vertical}, ${c.roomCount} rooms)\n` +
        `      eventExp ${p(c.eventExpenseRate)}` +
        ` · otherExp ${p(c.otherExpenseRate)}` +
        ` · utilVarSplit ${p(c.utilitiesVariableSplit)}` +
        ` · salesComm ${p(c.salesCommissionRate)}\n` +
        `      source: ${c.source} (${c.vintage})`
      );
    })
    .join("\n");

  return `# Persona

${personaLine}

# User's currently-saved Property Defaults values

${userValuesBlock}

# Property underwriting defaults comparables (reference by property name in reasoning)

${comparablesBlock}

# Your task

Produce exactly 4 market panel dimensions per the output schema. One per property-defaults key:
${PROPERTY_DEFAULTS_DIMENSION_KEYS.map((k) => `  - ${k}`).join("\n")}

Focus on LP-perception, operational cost defensibility, distribution cost risk, and utilities variability consistency for this operator's profile.
Do not produce numeric ranges.`;
}
