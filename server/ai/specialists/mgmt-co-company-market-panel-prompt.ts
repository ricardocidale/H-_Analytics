/**
 * Market panel prompt module for the Claude Sonnet qualitative evaluation pass
 * in the Company Phase 2 N+1 pipeline.
 *
 * Sonnet's job: LP-perception dynamics for management fee structure, DCF
 * hurdle defensibility, and tax-rate scrutiny. Produces sentiment and
 * directional bias signals (increase / decrease / hold) that enrich the
 * Opus synthesis prompt. Does NOT produce numeric ranges — the quant panel
 * owns those.
 */

import type { CompanyPromptInputContext } from "./mgmt-co-company-prompt-input-builder";
import { COMPANY_DIMENSION_KEYS } from "./mgmt-co-company-prompt-input-builder";
import type { CompanyComparableRow } from "./mgmt-co-company-orchestrator-adapter";

export function buildMarketPanelSystemPrompt(): string {
  return `You are a market-intelligence panel for boutique-luxury hospitality management company fee structures and financial defaults.

Your job: produce qualitative market signals for 4 company dimensions — LP sentiment, LP scrutiny / alignment risk flags, and directional bias. A separate quantitative panel produces numeric ranges; you do NOT produce numbers.

# Your output per dimension

For each of the 4 company keys:
- marketSentiment: overall LP sentiment for this dimension given the operator's vertical + locale ("bullish" | "neutral" | "cautious")
- lpRiskFlags: 0–4 specific risk phrases an LP will raise about this dimension (e.g. "Base fee above branded-operator alternatives without a clear value-proposition justification", "Low incentive fee signals operator skepticism of their own performance projections"). Empty array is valid when no flags apply. Each flag ≤200 chars.
- proposedBias: whether the quantitative range likely needs upward or downward adjustment given LP-perception ("increase" | "decrease" | "hold" | "insufficient-data")
- reasoning: 20–400 chars. Reference the operator's specific context and at least one LP-perception dynamic.

# Focus
- Base fee scrutiny: branded-operator comparison (Marriott Autograph, Hilton Tapestry, Hyatt Small Luxury are the benchmark); premium above branded rates needs a defensible value proposition
- Incentive fee alignment: operator skin-in-the-game signal; too low = LP distrust; too high = cannibalization of LP equity net of promote
- Tax rate audit signals: over-accrual understates distributable cash (LP surprise at distribution time); under-accrual surfaces in first audit; both are distinct LP flags
- DCF discount rate narrative: Re consistency with modeled IRR targets; a low Re inflates the NAV and LPs re-underwrite with their own hurdle, seeing weaker returns

# Forbidden
- Do NOT emit numeric ranges — that is not your job
- Do NOT use "the system" as subject
- Do NOT fabricate operator-comparable data not referenced in the user message`;
}

export function buildMarketPanelUserPrompt(
  ctx: CompanyPromptInputContext,
  comparables: readonly CompanyComparableRow[],
): string {
  const personaLine = `${ctx.persona.marketTier} tier, ${ctx.persona.verticalSlug} vertical, ${ctx.persona.locale} locale`;

  const pct = (v: number | null | undefined) =>
    v == null ? "(not set)" : `${(v * 100).toFixed(1)}%`;

  const userValuesBlock = COMPANY_DIMENSION_KEYS.map((k) => {
    const v = (ctx.inputs as Record<string, number | null | undefined>)[k];
    return `  - ${k}: ${pct(v)}`;
  }).join("\n");

  const p = (n: number) => `${(n * 100).toFixed(1)}%`;
  const comparablesBlock = comparables
    .map((c, idx) => {
      return (
        `  [${idx}] ${c.operator} — ${c.locale} (${c.vertical}, ${c.propertyCount} props)\n` +
        `      baseFee ${p(c.baseManagementFee)}` +
        ` · incentiveFee ${p(c.incentiveManagementFee)}` +
        ` · taxRate ${p(c.companyTaxRate)}` +
        ` · Re ${p(c.costOfEquity)}\n` +
        `      source: ${c.source} (${c.vintage})`
      );
    })
    .join("\n");

  return `# Persona

${personaLine}

# User's currently-saved Company-tab values

${userValuesBlock}

# Hospitality ManCo financial comparables (reference by operator name in reasoning)

${comparablesBlock}

# Your task

Produce exactly 4 market panel dimensions per the output schema. One per company key:
${COMPANY_DIMENSION_KEYS.map((k) => `  - ${k}`).join("\n")}

Focus on LP-perception, fee-alignment signals, tax scrutiny, and DCF discount-rate defensibility for this operator's profile.
Do not produce numeric ranges.`;
}
