/**
 * Prompt Engineer pre-stage for the Compensation Specialist N+1 pipeline
 * (G3 of ADR-007).
 *
 * Per Intelligence Bar requirement #8: before the parallel panels run, a
 * cheap LLM call (Gemini Flash) reads operator context + comparables and
 * produces tailored addenda for the quant and market panel system prompts.
 *
 *   quantAddendum  — operator-specific grounding for numeric range derivation
 *                    (founder-stage discipline; Year 10 trajectory shape;
 *                    locale-driven staff salary calibration)
 *   marketAddendum — LP-perception context for sentiment and bias
 *                    calibration (founder vs. expansion vs. institutional
 *                    archetypes; key-person risk patterns)
 *
 * On regress (G3 quality-check fail), the PE is re-invoked with a
 * `regressReason`. Including prior addenda prevents the regress from
 * producing identical output (same framing → same failure → infinite loop).
 */

import { z } from "zod";
import type { CompensationPromptInputContext } from "./mgmt-co-compensation-prompt-input-builder";
import { COMPENSATION_DIMENSION_KEYS } from "./mgmt-co-compensation-prompt-input-builder";
import type { CompensationComparableRow } from "./mgmt-co-compensation-orchestrator-adapter";

// ── Regress context ──────────────────────────────────────────────────────────

/**
 * Carries the prior-pass addenda and the synthesis quality-check failure
 * reason into the next PE call. Defined locally (not imported from Funding
 * or Revenue) to keep Specialist independence.
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
      "Additional context to prepend to the quantitative panel system prompt. Focus on operator-stage signals (founder vs. expansion vs. institutional) and locale-specific staff salary calibration that help ground numeric range derivation for compensation dimensions.",
    ),
  marketAddendum: z
    .string()
    .max(600)
    .describe(
      "Additional context to prepend to the market panel system prompt. Focus on LP-perception archetypes — founder restraint vs. early-dilution risk, terminal-trajectory comp share at scale, key-person risk — for this operator's vertical, tier, and locale.",
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
  return `You are a Prompt Engineer for a hospitality management company compensation specialist. Your job is to analyze an operator's profile and produce targeted addenda that make the downstream quantitative and market panel prompts more effective for this specific operator.

# Your role

Given an operator profile (persona, current compensation-tab inputs, ManCo compensation comparables), produce:
1. quantAddendum — extra signals that help the quantitative panel ground its numeric ranges in operator-specific evidence
2. marketAddendum — extra LP-perception context that helps the market panel calibrate sentiment for this operator's stage and vertical
3. rationale — what makes this operator distinctive from the generic boutique-luxury case

# Guidance for quantAddendum

Surface characteristics that affect how the quant panel should interpret benchmarks:
- Operator stage (founder-led 3-5 props vs. expansion 6-12 vs. institutional 13-25)
- Locale-driven staff salary baselines (US gateway vs. Latam vs. Mediterranean Europe)
- ManCo revenue trajectory implied by the portfolio plan and how it caps defensible Year 10 partner comp
- Tier-3 staffing requirements implied by target portfolio scale at maturity

# Guidance for marketAddendum

Surface LP-perception dynamics specific to this operator:
- Founder-stage discipline expectations: comp restraint at Year 1 as a credibility signal vs. early-dilution risk
- Terminal-trajectory perception: how partner comp share at scale reads to LPs reviewing the full 10-year arc
- Key-person risk archetype (single-founder vs. small-team vs. heavy-founder cap table)
- Talent-retention dynamics tied to staff salary level for the operator's locale

# Constraints
- quantAddendum: max 800 characters
- marketAddendum: max 600 characters
- rationale: max 400 characters, one sentence preferred
- Do NOT reproduce the full comparable list verbatim — reference patterns, not rows
- Do NOT invent data absent from the comparables
- Do NOT produce numeric ranges — those are the quant panel's job
- Output scale awareness: USD for partner-comp / staff-salary, whole-number counts for partner-count / Tier-3 FTE`;
}

export function buildPromptEngineerUserPrompt(
  ctx: CompensationPromptInputContext,
  comparables: readonly CompensationComparableRow[],
  regressContext?: RegressContext,
): string {
  const personaLine = `${ctx.persona.marketTier} tier, ${ctx.persona.verticalSlug} vertical, ${ctx.persona.locale} locale`;
  const portfolioLine =
    `${ctx.portfolio.propertyCount} ${ctx.portfolio.propertyCount === 1 ? "property" : "properties"}` +
    ` · ManCo revenue $${(ctx.portfolio.totalManagementCoRevenueUsd / 1_000_000).toFixed(1)}M/yr` +
    ` · monthly burn $${(ctx.portfolio.monthlyBurnUsd / 1_000).toFixed(0)}K`;

  const usdDisplay = (v: number | null | undefined) =>
    v == null ? "(not set)" : `$${Math.round(v).toLocaleString("en-US")}`;
  const countDisplay = (v: number | null | undefined) =>
    v == null ? "(not set)" : `${v.toFixed(0)}`;

  const inputsBlock = COMPENSATION_DIMENSION_KEYS.map((k) => {
    const v = (ctx.inputs as Record<string, number | null | undefined>)[k];
    const display =
      k === "partnerCountYear1" || k === "staffTier3Fte" ? countDisplay(v) : usdDisplay(v);
    return `  ${k}: ${display}`;
  }).join("\n");

  const compBlock =
    comparables.length > 0
      ? comparables
          .slice(0, 5)
          .map(
            (c, i) =>
              `  [${i}] ${c.operator} — ${c.locale} (${c.vertical}, ${c.propertyCount} props) ` +
              `— Y1 $${Math.round(c.partnerCompYear1Usd / 1000)}K, Y10 $${Math.round(c.partnerCompYear10Usd / 1000)}K, ` +
              `${c.partnerCountYear1}p, staff $${Math.round(c.staffSalaryUsd / 1000)}K, T3 ${c.staffTier3Fte} FTE`,
          )
          .join("\n")
      : "  (no compensation comparables available)";

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

# Current compensation-tab values
${inputsBlock}

# ManCo compensation comparable set (${comparables.length} rows — representative subset shown)
${compBlock}
${regressBlock}
# Your task
Produce targeted quantAddendum and marketAddendum for this specific operator. Focus on what makes this operator's situation unusual relative to the generic boutique-luxury case. Be concise and specific — these addenda will be prepended to panel system prompts.`;
}
