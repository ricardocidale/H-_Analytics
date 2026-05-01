/**
 * Prompt Engineer pre-stage for the Overhead Specialist N+1 pipeline
 * (Phase 2 of P7-B).
 *
 * Per Intelligence Bar requirement #8: before the parallel panels run, a
 * cheap LLM call (Gemini Flash) reads operator context + comparables and
 * produces tailored addenda for the quant and market panel system prompts.
 *
 *   quantAddendum  — operator-specific grounding for numeric range derivation
 *                    (founder-stage discipline; locale-driven office and
 *                    professional-services calibration; per-property variable
 *                    cost dynamics at portfolio scale)
 *   marketAddendum — LP-perception context for sentiment and bias
 *                    calibration (audit-readiness archetypes; insurance
 *                    adequacy patterns; retainer discipline signals)
 *
 * On regress (Phase 2 quality-check fail), the PE is re-invoked with a
 * `regressReason`. Including prior addenda prevents the regress from
 * producing identical output (same framing → same failure → infinite loop).
 */

import { z } from "zod";
import type { OverheadPromptInputContext } from "./mgmt-co-overhead-prompt-input-builder";
import { OVERHEAD_DIMENSION_KEYS } from "./mgmt-co-overhead-prompt-input-builder";
import type { OverheadComparableRow } from "./mgmt-co-overhead-orchestrator-adapter";

// ── Regress context ──────────────────────────────────────────────────────────

/**
 * Carries the prior-pass addenda and the synthesis quality-check failure
 * reason into the next PE call. Defined locally (not imported from another
 * Specialist) to keep Specialist independence.
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
      "Additional context to prepend to the quantitative panel system prompt. Focus on operator-stage signals (founder vs. expansion vs. institutional), locale-specific office and professional-services calibration, and per-property variable cost dynamics that help ground numeric range derivation for overhead dimensions.",
    ),
  marketAddendum: z
    .string()
    .max(600)
    .describe(
      "Additional context to prepend to the market panel system prompt. Focus on LP-perception archetypes — audit-readiness expectations, insurance adequacy (D&O/E&O/cyber exposure), retainer discipline, and per-property travel/IT cadence — for this operator's vertical, tier, and locale.",
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
  return `You are a Prompt Engineer for a hospitality management company overhead specialist. Your job is to analyze an operator's profile and produce targeted addenda that make the downstream quantitative and market panel prompts more effective for this specific operator.

# Your role

Given an operator profile (persona, current overhead-tab inputs, ManCo overhead comparables), produce:
1. quantAddendum — extra signals that help the quantitative panel ground its numeric ranges in operator-specific evidence
2. marketAddendum — extra LP-perception context that helps the market panel calibrate sentiment for this operator's stage and vertical
3. rationale — what makes this operator distinctive from the generic boutique-luxury case

# Guidance for quantAddendum

Surface characteristics that affect how the quant panel should interpret benchmarks:
- Operator stage (founder-led 3-5 props vs. expansion 6-12 vs. institutional 13-25)
- Locale-driven office + professional-services baselines (US gateway vs. Latam vs. Mediterranean Europe)
- Portfolio scale and how it amplifies per-property travel × IT licensing variable cost growth
- Tech-stack richness implied by vertical (boutique-luxury / wellness vs. midscale)
- Audit-readiness implied by capital stack complexity (multiple LPs, debt + mezz, cross-border)

# Guidance for marketAddendum

Surface LP-perception dynamics specific to this operator:
- Audit-readiness expectations: under-budgeting professional services is the classic early-stage trap that surfaces in the first audit
- Insurance adequacy: D&O / E&O / cyber thresholds LPs price into ManCo cap-tables; under-insured = personal exposure for partners
- Retainer discipline: over-spending on legal / consulting tends to compound at scale
- Per-property travel cadence: signals operating model (remote-first vs. high-touch concierge); LP perception tied to vertical
- Tech-spend posture: corporate-level cybersecurity vs. per-property licensing — overlap vs. discipline

# Constraints
- quantAddendum: max 800 characters
- marketAddendum: max 600 characters
- rationale: max 400 characters, one sentence preferred
- Do NOT reproduce the full comparable list verbatim — reference patterns, not rows
- Do NOT invent data absent from the comparables
- Do NOT produce numeric ranges — those are the quant panel's job
- Output scale awareness: USD whole-integer for all 6 dimensions`;
}

export function buildPromptEngineerUserPrompt(
  ctx: OverheadPromptInputContext,
  comparables: readonly OverheadComparableRow[],
  regressContext?: RegressContext,
): string {
  const personaLine = `${ctx.persona.marketTier} tier, ${ctx.persona.verticalSlug} vertical, ${ctx.persona.locale} locale`;
  const portfolioLine =
    `${ctx.portfolio.propertyCount} ${ctx.portfolio.propertyCount === 1 ? "property" : "properties"}` +
    ` · ManCo revenue $${(ctx.portfolio.totalManagementCoRevenueUsd / 1_000_000).toFixed(1)}M/yr` +
    ` · monthly burn $${(ctx.portfolio.monthlyBurnUsd / 1_000).toFixed(0)}K`;

  const usdDisplay = (v: number | null | undefined) =>
    v == null ? "(not set)" : `$${Math.round(v).toLocaleString("en-US")}`;

  const inputsBlock = OVERHEAD_DIMENSION_KEYS.map((k) => {
    const v = (ctx.inputs as Record<string, number | null | undefined>)[k];
    return `  ${k}: ${usdDisplay(v)}`;
  }).join("\n");

  const k = (n: number) => `$${Math.round(n / 1000).toLocaleString("en-US")}K`;
  const compBlock =
    comparables.length > 0
      ? comparables
          .slice(0, 5)
          .map(
            (c, i) =>
              `  [${i}] ${c.operator} — ${c.locale} (${c.vertical}, ${c.propertyCount} props) ` +
              `— office ${k(c.officeLeaseUsd)}, prof svcs ${k(c.professionalServicesUsd)}, ` +
              `tech ${k(c.techInfraUsd)}, ins ${k(c.businessInsuranceUsd)}, ` +
              `travel/c ${k(c.travelCostPerClientUsd)}, IT/c ${k(c.itLicensePerClientUsd)}`,
          )
          .join("\n")
      : "  (no overhead comparables available)";

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

# Current overhead-tab values
${inputsBlock}

# ManCo overhead comparable set (${comparables.length} rows — representative subset shown)
${compBlock}
${regressBlock}
# Your task
Produce targeted quantAddendum and marketAddendum for this specific operator. Focus on what makes this operator's situation unusual relative to the generic boutique-luxury case. Be concise and specific — these addenda will be prepended to panel system prompts.`;
}
