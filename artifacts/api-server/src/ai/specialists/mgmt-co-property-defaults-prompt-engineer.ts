/**
 * Prompt Engineer pre-stage for the Property-Defaults Specialist N+1 pipeline
 * (Phase 2 of P7-B).
 *
 * Per Intelligence Bar requirement #8: before the parallel panels run, a
 * cheap LLM call (Gemini Flash) reads operator context + comparables and
 * produces tailored addenda for the quant and market panel system prompts.
 *
 *   quantAddendum  — operator-specific grounding for numeric range derivation
 *                    (property infrastructure profile; channel mix signals;
 *                    locale-driven energy variability context)
 *   marketAddendum — LP-perception context for sentiment and bias calibration
 *                    (OTA cost exposure archetypes; event profitability scrutiny;
 *                    utilities-infrastructure consistency signals)
 *
 * On regress (Phase 2 quality-check fail), the PE is re-invoked with a
 * `regressReason`. Including prior addenda prevents the regress from
 * producing identical output (same framing → same failure → infinite loop).
 */

import { z } from "zod";
import type { PropertyDefaultsPromptInputContext } from "./mgmt-co-property-defaults-prompt-input-builder";
import { PROPERTY_DEFAULTS_DIMENSION_KEYS } from "./mgmt-co-property-defaults-prompt-input-builder";
import type { PropertyDefaultsComparableRow } from "./mgmt-co-property-defaults-orchestrator-adapter";

// ── Regress context ──────────────────────────────────────────────────────────

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
      "Additional context to prepend to the quantitative panel system prompt. Focus on property infrastructure signals (room count, HVAC zoning, smart-room controls), channel-mix composition (OTA vs. direct booking percentage), and locale-specific energy variability patterns that help ground numeric range derivation for property expense and commission dimensions.",
    ),
  marketAddendum: z
    .string()
    .max(600)
    .describe(
      "Additional context to prepend to the market panel system prompt. Focus on LP-perception archetypes — event-expense profitability scrutiny, ancillary revenue mix implications, OTA commission exposure signals, and utilities infrastructure consistency for this operator's vertical, tier, and locale.",
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
  return `You are a Prompt Engineer for a hospitality property underwriting defaults specialist. Your job is to analyze an operator's profile and produce targeted addenda that make the downstream quantitative and market panel prompts more effective for this specific operator.

# Your role

Given an operator profile (persona, current property-defaults inputs, property underwriting comparables), produce:
1. quantAddendum — extra signals that help the quantitative panel ground its numeric ranges in operator-specific evidence
2. marketAddendum — extra LP-perception context that helps the market panel calibrate sentiment for this operator's stage and vertical
3. rationale — what makes this operator distinctive from the generic boutique-luxury case

# Guidance for quantAddendum

Surface characteristics that affect how the quant panel should interpret benchmarks:
- Property infrastructure maturity: smart-room controls and HVAC zoning raise the utilities variable fraction; older fixed-load infrastructure pulls it lower — both are legitimate depending on property vintage
- Channel mix composition: an operator with heavy OTA dependence (>40% of bookings through OTAs) will sit at the high end of the sales commission range; a direct-booking-optimized portfolio can achieve materially lower blended rates
- F&B program depth: properties with extensive banquet/event programming have structurally higher event expense ratios than room-only or limited-event boutiques
- Ancillary revenue complexity: a diverse ancillary stack (spa, resort fees, parking, retail) has a different average cost structure than a simple ancillary profile
- Locale energy intensity: warm-climate properties (lower heating load) and cool-climate properties (higher cooling load) differ materially on the variable/fixed energy split

# Guidance for marketAddendum

Surface LP-perception dynamics specific to this operator:
- OTA commission risk: LPs benchmark blended commission against Kalibri Labs direct-booking leaders — a high commission rate raises distribution-cost questions that need to be answered in the LP data room
- Event profitability: USALI-comp-set comparison; a high event expense ratio signals either under-pricing or above-benchmark F&B labor cost — LPs look at event contribution margin, not just event revenue
- Utilities variability consistency: a variable split inconsistent with the property's infrastructure profile (stated as modern but split is low) is an LP credibility risk
- Ancillary profitability: other expense ratio above USALI undistributed benchmark for the comp set signals LP scrutiny on ancillary pricing strategy

# Constraints
- quantAddendum: max 800 characters
- marketAddendum: max 600 characters
- rationale: max 400 characters, one sentence preferred
- Do NOT reproduce the full comparable list verbatim — reference patterns, not rows
- Do NOT invent data absent from the comparables
- Do NOT produce numeric ranges — those are the quant panel's job
- Output scale awareness: all 4 dimensions are fractions (0.65 = 65%) — do NOT reference percentage integers`;
}

export function buildPromptEngineerUserPrompt(
  ctx: PropertyDefaultsPromptInputContext,
  comparables: readonly PropertyDefaultsComparableRow[],
  regressContext?: RegressContext,
): string {
  const personaLine = `${ctx.persona.marketTier} tier, ${ctx.persona.verticalSlug} vertical, ${ctx.persona.locale} locale`;
  const portfolioLine =
    `${ctx.portfolio.propertyCount} ${ctx.portfolio.propertyCount === 1 ? "property" : "properties"}` +
    ` · ManCo revenue $${(ctx.portfolio.totalManagementCoRevenueUsd / 1_000_000).toFixed(1)}M/yr` +
    ` · monthly burn $${(ctx.portfolio.monthlyBurnUsd / 1_000).toFixed(0)}K`;

  const pct = (v: number | null | undefined) =>
    v == null ? "(not set)" : `${(v * 100).toFixed(1)}%`;

  const inputsBlock = PROPERTY_DEFAULTS_DIMENSION_KEYS.map((k) => {
    const v = (ctx.inputs as Record<string, number | null | undefined>)[k];
    return `  ${k}: ${pct(v)}`;
  }).join("\n");

  const p = (n: number) => `${(n * 100).toFixed(1)}%`;
  const compBlock =
    comparables.length > 0
      ? comparables
          .slice(0, 5)
          .map(
            (c, i) =>
              `  [${i}] ${c.propertyName} — ${c.locale} (${c.vertical}, ${c.roomCount} rooms) ` +
              `— eventExp ${p(c.eventExpenseRate)}, otherExp ${p(c.otherExpenseRate)}, ` +
              `utilVarSplit ${p(c.utilitiesVariableSplit)}, salesComm ${p(c.salesCommissionRate)}`,
          )
          .join("\n")
      : "  (no property-defaults comparables available)";

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

# Current property-defaults values
${inputsBlock}

# Property underwriting comparables (${comparables.length} rows — representative subset shown)
${compBlock}
${regressBlock}
# Your task
Produce targeted quantAddendum and marketAddendum for this specific operator. Focus on what makes this operator's property expense defaults and commission structure unusual relative to the generic boutique-luxury case. Be concise and specific — these addenda will be prepended to panel system prompts.`;
}
