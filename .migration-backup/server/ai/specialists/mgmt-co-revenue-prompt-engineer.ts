/**
 * Prompt Engineer pre-stage for the Revenue Specialist N+1 pipeline (G2-P1).
 *
 * Per Intelligence Bar requirement #8: before the parallel panels run, a cheap
 * LLM call (Gemini Flash) reads operator context + revenue comparables and
 * produces tailored addenda for the quant and market panel system prompts.
 *
 *   quantAddendum  — operator-specific grounding for numeric range derivation
 *                    (ancillary mix calibration; F&B/marketing/events/other
 *                    capture rate signals)
 *   marketAddendum — guest-mix and concept-fit context for market sentiment
 *                    calibration (vertical, locale, brand positioning)
 *
 * In G2-P3 the PE is re-invoked with a `regressReason` when the synthesis
 * quality check fails (max 2 regresses). G2-P1 only defines the contract +
 * builders; the runner wiring lands in G2-P3.
 */

import { z } from "zod";
import type { RevenuePromptInputContext } from "./mgmt-co-revenue-prompt-input-builder";
import { REVENUE_DIMENSION_KEYS } from "./mgmt-co-revenue-prompt-input-builder";
import type { RevenueComparableRow } from "./mgmt-co-revenue-orchestrator-adapter";

// ── Regress context (G2-P3) ─────────────────────────────────────────────────

/**
 * Carries the prior-pass addenda and the synthesis quality-check failure
 * reason into the next PE call. Including prior addenda prevents the regress
 * from producing identical output (same framing → same failure → infinite
 * regress).
 *
 * Defined locally (not imported from Funding's PE) to keep Specialist
 * independence: shape happens to match today, but each Specialist owns its
 * own regress contract.
 */
export interface RegressContext {
  priorQuantAddendum: string;
  priorMarketAddendum: string;
  regressReason: string;
}

// ── Output schema ───────────────────────────────────────────────────────────

export const PromptEngineerOutputSchema = z.object({
  quantAddendum: z
    .string()
    .max(800)
    .describe(
      "Additional context to prepend to the quantitative panel system prompt. Focus on operator-specific signals that help ground numeric range derivation for the revenue ancillary mix.",
    ),
  marketAddendum: z
    .string()
    .max(600)
    .describe(
      "Additional context to prepend to the market panel system prompt. Focus on guest-mix, concept-fit, and brand positioning signals specific to this operator's vertical, tier, and locale.",
    ),
  rationale: z
    .string()
    .max(400)
    .describe(
      "One-sentence explanation of the primary adaptation made for this operator.",
    ),
});
export type PromptEngineerOutput = z.infer<typeof PromptEngineerOutputSchema>;

// ── Prompt builders ─────────────────────────────────────────────────────────

export function buildPromptEngineerSystemPrompt(): string {
  return `You are a Prompt Engineer for a hospitality management company revenue specialist. Your job is to analyze an operator's profile and produce targeted addenda that make the downstream quantitative and market panel prompts more effective for this specific operator.

# Your role

Given an operator profile (persona, current revenue-tab inputs, hotel revenue comparables), produce:
1. quantAddendum — extra signals that help the quantitative panel ground its numeric ranges in operator-specific evidence
2. marketAddendum — extra concept/guest-mix context that helps the market panel calibrate sentiment for this vertical/tier/locale
3. rationale — what makes this operator distinctive from the generic boutique-luxury case

# Guidance for quantAddendum

Surface characteristics that affect how the quant panel should interpret benchmarks:
- Property scale (single-property vs. multi-property; small-key vs. mid-scale)
- Revenue vertical signals (F&B-forward vs. wellness-forward vs. lifestyle; ancillary-heavy vs. rooms-led)
- Dimensions where the comparable set is thin and ranges should be widened
- Operator-specific signals not captured in the comparables (e.g. all-inclusive model, branded-residences component)

# Guidance for marketAddendum

Surface concept and guest-mix dynamics specific to this operator:
- Guest archetypes most relevant for this vertical + brand tier + locale
- Concept-fit pressure from current market trends (wellness inflation, F&B independence, event-space monetization)
- Brand positioning patterns that comparable operators use to defend ancillary capture
- Flag where guest-mix expectations diverge from the quantitative comp-set averages

# Constraints
- quantAddendum: max 800 characters
- marketAddendum: max 600 characters
- rationale: max 400 characters, one sentence preferred
- Do NOT reproduce the full comparable list verbatim — reference patterns, not rows
- Do NOT invent market data absent from the comparables
- Do NOT produce numeric ranges — those are the quant panel's job
- Output scale awareness: all 5 revenue dimensions are decimal fractions (0.06 not 6); do not let your prose imply whole-number percentages`;
}

export function buildPromptEngineerUserPrompt(
  ctx: RevenuePromptInputContext,
  comparables: readonly RevenueComparableRow[],
  regressContext?: RegressContext,
): string {
  const personaLine = `${ctx.persona.marketTier} tier, ${ctx.persona.verticalSlug} vertical, ${ctx.persona.locale} locale`;
  const portfolioLine =
    `${ctx.portfolio.propertyCount} ${ctx.portfolio.propertyCount === 1 ? "property" : "properties"}` +
    ` · avg stabilized occupancy ${(ctx.portfolio.avgOccupancyRate * 100).toFixed(0)}%` +
    ` · avg ADR $${ctx.portfolio.avgAdr.toFixed(0)}`;

  const inputsBlock = REVENUE_DIMENSION_KEYS.map((k) => {
    const v = (ctx.inputs as Record<string, number | null | undefined>)[k];
    return `  ${k}: ${v == null ? "(not set)" : `${(v * 100).toFixed(1)}%`}`;
  }).join("\n");

  const compBlock =
    comparables.length > 0
      ? comparables
          .slice(0, 5)
          .map(
            (c, i) =>
              `  [${i}] ${c.property} — ${c.city}, ${c.country} (${c.vertical}, ${c.roomCount} rooms) ` +
              `— marketing ${(c.marketingRateFraction * 100).toFixed(0)}%, ` +
              `F&B ${(c.fbShareFraction * 100).toFixed(0)}%, ` +
              `events ${(c.eventsShareFraction * 100).toFixed(0)}%`,
          )
          .join("\n")
      : "  (no revenue comparables available)";

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

# Current revenue-tab values
${inputsBlock}

# Hotel revenue comparable set (${comparables.length} rows — representative subset shown)
${compBlock}
${regressBlock}
# Your task
Produce targeted quantAddendum and marketAddendum for this specific operator. Focus on what makes this operator's situation unusual relative to the generic boutique-luxury case. Be concise and specific — these addenda will be prepended to panel system prompts.`;
}
