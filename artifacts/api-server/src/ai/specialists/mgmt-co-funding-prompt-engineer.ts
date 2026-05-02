/**
 * Prompt Engineer pre-stage for the Funding Specialist N+1 pipeline (G6-P3a).
 *
 * Per Intelligence Bar requirement #8: before the parallel panels run, a cheap
 * LLM call (Gemini Flash) reads operator context + comparables and produces
 * tailored addenda for the quant and market panel system prompts.
 *
 *   quantAddendum — operator-specific grounding for numeric range derivation
 *   marketAddendum — LP dynamics context for market sentiment calibration
 *
 * In G6-P3b the PE is re-invoked with a `regressReason` when the quality check
 * fails (max 2 regresses). G6-P3a always invokes it exactly once.
 */

import { z } from "zod";
import type { FundingPromptInputContext } from "./mgmt-co-funding-prompt-input-builder";
import { FUNDING_DIMENSION_KEYS } from "./mgmt-co-funding-prompt-input-builder";
import type { ComparableRow } from "./mgmt-co-funding-orchestrator-adapter";

// ── Regress context (G6-P3b) ────────────────────────────────────────────────

/**
 * Carries the prior-pass addenda and the quality-check failure reason into the
 * next PE call. Including prior addenda prevents the regress from producing
 * identical output (same framing → same failure → infinite regress).
 */
export interface RegressContext {
  priorQuantAddendum: string;
  priorMarketAddendum: string;
  regressReason: string;
}

// ── Output schema ────────────────────────────────────────────────────────────

export const PromptEngineerOutputSchema = z.object({
  quantAddendum: z
    .string()
    .max(800)
    .describe(
      "Additional context to prepend to the quantitative panel system prompt. Focus on operator-specific signals that help ground numeric range derivation.",
    ),
  marketAddendum: z
    .string()
    .max(600)
    .describe(
      "Additional context to prepend to the market panel system prompt. Focus on LP dynamics specific to this operator's vertical, tier, and locale.",
    ),
  rationale: z
    .string()
    .max(400)
    .describe(
      "One-sentence explanation of the primary adaptation made for this operator.",
    ),
});
export type PromptEngineerOutput = z.infer<typeof PromptEngineerOutputSchema>;

// ── Prompt builders ──────────────────────────────────────────────────────────

export function buildPromptEngineerSystemPrompt(): string {
  return `You are a Prompt Engineer for a hospitality management company capital raise specialist. Your job is to analyze an operator's profile and produce targeted addenda that make the downstream quantitative and market panel prompts more effective for this specific operator.

# Your role

Given an operator profile (persona, current inputs, LP comparables), produce:
1. quantAddendum — extra signals that help the quantitative panel ground its numeric ranges in operator-specific evidence
2. marketAddendum — extra LP context that helps the market panel calibrate sentiment for this vertical/tier/locale
3. rationale — what makes this operator distinctive from the generic case

# Guidance for quantAddendum

Surface characteristics that affect how the quant panel should interpret benchmarks:
- Portfolio scale (early-stage vs. expansion vs. mature multi-property)
- Raise structure characteristics (staged tranches, bridge risk, revenue-based)
- Dimensions where the comparable set is thin and ranges should be widened
- Operator-specific signals not captured in the comparables (e.g. bridge financing risk)

# Guidance for marketAddendum

Surface LP dynamics specific to this operator:
- LP archetypes most relevant for this vertical + brand tier + locale
- Current fundraising window risk factors for this geography or property type
- Brand-specific raise patterns that LPs in this space will benchmark against
- Flag where LP expectations diverge from the quantitative comp-set averages

# Constraints
- quantAddendum: max 800 characters
- marketAddendum: max 600 characters
- rationale: max 400 characters, one sentence preferred
- Do NOT reproduce the full comparable list verbatim — reference patterns, not rows
- Do NOT invent market data absent from the comparables
- Do NOT produce numeric ranges — those are the quant panel's job`;
}

export function buildPromptEngineerUserPrompt(
  ctx: FundingPromptInputContext,
  comparables: readonly ComparableRow[],
  regressContext?: RegressContext,
): string {
  const personaLine = `${ctx.persona.marketTier} tier, ${ctx.persona.verticalSlug} vertical, ${ctx.persona.locale} locale`;
  const portfolioLine = `${ctx.portfolio.propertyCount} ${ctx.portfolio.propertyCount === 1 ? "property" : "properties"}, $${(ctx.portfolio.totalRaiseNeedUsd / 1_000_000).toFixed(0)}M total raise need, ${ctx.portfolio.runwayNeedMonths}mo runway need`;

  const inputsBlock = FUNDING_DIMENSION_KEYS.map((k) => {
    const v = ctx.inputs[k];
    return `  ${k}: ${v == null ? "(not set)" : String(v)}`;
  }).join("\n");

  const compBlock =
    comparables.length > 0
      ? comparables
          .slice(0, 5)
          .map(
            (c, i) =>
              `  [${i}] ${c.operator} (${c.vintage}, ${c.vertical}, ${c.propertyCount} props) ` +
              `— $${(c.raiseUsd / 1_000_000).toFixed(0)}M raised, ${c.runwayBufferMonths}mo buffer, ` +
              `${(c.sizingOvershootPct * 100).toFixed(0)}% overshoot`,
          )
          .join("\n")
      : "  (no LP comparables available)";

  const referenceBrandsBlock =
    ctx.referenceBrands && ctx.referenceBrands.length > 0
      ? `\n# Reference brand comp-set (orientation-grade — treat as directional only, not authoritative benchmarks)\n` +
        ctx.referenceBrands
          .map(
            (b) =>
              `  ${b.brandName}` +
              (b.niche ? ` (${b.niche})` : "") +
              (b.geographicFocus ? ` — ${b.geographicFocus}` : "") +
              (b.adrUsd != null ? `, ADR $${b.adrUsd.toFixed(0)}` : "") +
              (b.occupancyPct != null ? `, occ ${(b.occupancyPct * 100).toFixed(0)}%` : "") +
              (b.revparUsd != null ? `, RevPAR $${b.revparUsd.toFixed(0)}` : "") +
              (b.propertyCount != null ? `, ${b.propertyCount} props` : ""),
          )
          .join("\n")
      : "";

  const regressBlock = regressContext
    ? `\n# Prior synthesis pass failed — produce DIFFERENT addenda\n` +
      `Prior quantAddendum sent:\n${regressContext.priorQuantAddendum}\n\n` +
      `Prior marketAddendum sent:\n${regressContext.priorMarketAddendum}\n\n` +
      `Failure reason: ${regressContext.regressReason}\n` +
      `Do NOT reproduce the prior addenda — produce meaningfully different framing that addresses the failure.\n`
    : "";

  return `# Operator profile
${personaLine}
Portfolio: ${portfolioLine}

# Current funding-tab values
${inputsBlock}

# LP comparable set (${comparables.length} rows — representative subset shown)
${compBlock}
${referenceBrandsBlock}
${regressBlock}
# Your task
Produce targeted quantAddendum and marketAddendum for this specific operator. Focus on what makes this operator's situation unusual relative to the generic boutique-luxury case. Be concise and specific — these addenda will be prepended to panel system prompts.`;
}
