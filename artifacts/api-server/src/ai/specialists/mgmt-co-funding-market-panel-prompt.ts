/**
 * Market panel prompt module for the Claude Sonnet qualitative evaluation pass
 * in the G6-P2 N+1 pipeline.
 *
 * Sonnet's job: LP dynamics, qualitative market signals, brand-specific raise
 * patterns. Produces sentiment and directional bias signals (increase / decrease
 * / hold) that enrich the Opus synthesis prompt. Does NOT produce numeric
 * ranges — the quant panel owns those.
 */

import type { FundingPromptInputContext } from "./mgmt-co-funding-prompt-input-builder";
import { FUNDING_DIMENSION_KEYS } from "./mgmt-co-funding-prompt-input-builder";
import type { ComparableRow } from "./mgmt-co-funding-orchestrator-adapter";

export function buildMarketPanelSystemPrompt(): string {
  return `You are a market-intelligence panel for boutique-luxury hospitality management company capital raises.

Your job: produce qualitative market signals for 5 funding dimensions — LP sentiment, risk flags, and directional bias. A separate quantitative panel produces numeric ranges; you do NOT produce numbers.

# Your output per dimension

For each of the 5 funding keys:
- marketSentiment: overall LP sentiment for this dimension given the operator's vertical + locale ("bullish" | "neutral" | "cautious")
- lpRiskFlags: 0–4 specific risk phrases LPs will raise at the pitch. Empty array is valid when no flags apply. Each flag ≤200 chars.
- proposedBias: whether the quantitative range likely needs upward or downward adjustment given LP expectations ("increase" | "decrease" | "hold" | "insufficient-data")
- reasoning: 20–400 chars. Reference the operator's specific context and at least one LP dynamic.

# Focus
- LP expectations for this vertical, brand tier, and locale
- Brand-specific raise patterns (boutique-luxury, lifestyle, wellness)
- Macro raise-window risk and cap-table dynamics
- What LPs in this vertical will flag vs. accept
- Reference brand benchmarks when on file (orientation only — do not over-index)

# Forbidden
- Do NOT emit numeric ranges — that is not your job
- Do NOT use "the system" as subject
- Do NOT fabricate LP-comparable data not referenced in the user message`;
}

export function buildMarketPanelUserPrompt(
  ctx: FundingPromptInputContext,
  comparables: readonly ComparableRow[],
): string {
  const personaLine = `${ctx.persona.marketTier} tier, ${ctx.persona.verticalSlug} vertical, ${ctx.persona.locale} locale`;

  const userValuesBlock = FUNDING_DIMENSION_KEYS.map((k) => {
    const v = ctx.inputs[k];
    return `  - ${k}: ${v == null ? "(not set)" : String(v)}`;
  }).join("\n");

  const comparablesBlock = comparables
    .map((c, idx) => {
      const trancheGap = c.trancheGapMonths == null ? "n/a" : `${c.trancheGapMonths}mo gap`;
      return (
        `  [${idx}] ${c.operator} (${c.vintage}, ${c.vertical}, ${c.propertyCount} ${c.propertyCount === 1 ? "property" : "properties"})\n` +
        `      raised $${(c.raiseUsd / 1_000_000).toFixed(0)}M · ${c.runwayBufferMonths}mo buffer · ${(c.sizingOvershootPct * 100).toFixed(0)}% overshoot · ${trancheGap}\n` +
        `      source: ${c.source} (asOf ${c.asOf})`
      );
    })
    .join("\n");

  const brandsBlock =
    ctx.referenceBrands && ctx.referenceBrands.length > 0
      ? ctx.referenceBrands
          .map((b, idx) => {
            const parts = [
              b.niche ? `niche: ${b.niche}` : null,
              b.adrUsd != null ? `ADR $${b.adrUsd}` : null,
              b.occupancyPct != null ? `occ ${(b.occupancyPct * 100).toFixed(0)}%` : null,
              b.revparUsd != null ? `RevPAR $${b.revparUsd}` : null,
              b.propertyCount != null ? `${b.propertyCount} props` : null,
              b.geographicFocus ? `focus: ${b.geographicFocus}` : null,
            ]
              .filter(Boolean)
              .join(", ");
            return `  [${idx}] ${b.brandName}${parts ? ` — ${parts}` : ""}`;
          })
          .join("\n")
      : "  (none on file)";

  return `# Persona

${personaLine}

# User's currently-saved Funding-tab values

${userValuesBlock}

# LP comparables (reference by operator name in reasoning)

${comparablesBlock}

# Reference brands on file (orientation only — do not over-index; treat as market context, not primary data)

${brandsBlock}

# Your task

Produce exactly 5 market panel dimensions per the output schema. One per funding key:
${FUNDING_DIMENSION_KEYS.map((k) => `  - ${k}`).join("\n")}

Focus on LP expectations, market sentiment, and directional bias signals for this operator's profile.
Do not produce numeric ranges.`;
}
