/**
 * Prompt Engineer pre-stage for the Company Specialist N+1 pipeline
 * (Phase 2 of P7-B).
 *
 * Per Intelligence Bar requirement #8: before the parallel panels run, a
 * cheap LLM call (Gemini Flash) reads operator context + comparables and
 * produces tailored addenda for the quant and market panel system prompts.
 *
 *   quantAddendum  — operator-specific grounding for numeric range derivation
 *                    (stage-calibrated fee structure; locale-driven tax-rate
 *                    context; DCF hurdle signals relative to capital stack)
 *   marketAddendum — LP-perception context for sentiment and bias calibration
 *                    (fee scrutiny archetypes; DCF-inflation narrative; tax
 *                    compliance signals for LP data-room diligence)
 *
 * On regress (Phase 2 quality-check fail), the PE is re-invoked with a
 * `regressReason`. Including prior addenda prevents the regress from
 * producing identical output (same framing → same failure → infinite loop).
 */

import { z } from "zod";
import type { CompanyPromptInputContext } from "./mgmt-co-company-prompt-input-builder";
import { COMPANY_DIMENSION_KEYS } from "./mgmt-co-company-prompt-input-builder";
import type { CompanyComparableRow } from "./mgmt-co-company-orchestrator-adapter";

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
      "Additional context to prepend to the quantitative panel system prompt. Focus on operator-stage signals (founder vs. expansion vs. institutional), locale-specific tax-rate calibration, and DCF hurdle context relative to the operator's capital stack that help ground numeric range derivation for company fee/rate dimensions.",
    ),
  marketAddendum: z
    .string()
    .max(600)
    .describe(
      "Additional context to prepend to the market panel system prompt. Focus on LP-perception archetypes — base fee vs. branded-operator comparisons, incentive fee alignment signals, tax-rate audit triggers, and DCF discount-rate narrative consistency for this operator's vertical, tier, and locale.",
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
  return `You are a Prompt Engineer for a hospitality management company fee structure and financial defaults specialist. Your job is to analyze an operator's profile and produce targeted addenda that make the downstream quantitative and market panel prompts more effective for this specific operator.

# Your role

Given an operator profile (persona, current company-tab inputs, ManCo financial comparables), produce:
1. quantAddendum — extra signals that help the quantitative panel ground its numeric ranges in operator-specific evidence
2. marketAddendum — extra LP-perception context that helps the market panel calibrate sentiment for this operator's stage and vertical
3. rationale — what makes this operator distinctive from the generic boutique-luxury case

# Guidance for quantAddendum

Surface characteristics that affect how the quant panel should interpret benchmarks:
- Operator stage (founder-led 3-5 props vs. expansion 6-12 vs. institutional 13-25) and how that shifts fee premium
- Locale-driven effective tax rate context (US federal + state combined; Latam tax structures differ materially)
- Capital-stack complexity and how it informs the appropriate DCF hurdle (single-LP vs. institutional fund; EB-5 vs. conventional)
- Property portfolio revenue scale — ManCo fee economics as a % of property revenue look different at $2M vs. $20M total
- Vertical-specific incentive alignment: wellness and lifestyle boutiques carry different GOP volatility than standard boutique-luxury

# Guidance for marketAddendum

Surface LP-perception dynamics specific to this operator:
- Base fee scrutiny: LPs benchmark against branded operators (Marriott Autograph, Hilton Tapestry) — the spread above branded rates needs a value-proposition justification
- Incentive fee alignment: a low GOP kicker signals operator skepticism about their own performance projections; a high one may cannibalize LP equity net of promote
- Tax-rate signals: over-accruing understates distributable cash; under-accruing surfaces at audit; each is a different LP diligence flag
- DCF discount-rate narrative: a low Re inflates NAV (LP re-underwrite problem); a high Re is conservative but must align with the modeled IRR

# Constraints
- quantAddendum: max 800 characters
- marketAddendum: max 600 characters
- rationale: max 400 characters, one sentence preferred
- Do NOT reproduce the full comparable list verbatim — reference patterns, not rows
- Do NOT invent data absent from the comparables
- Do NOT produce numeric ranges — those are the quant panel's job
- Output scale awareness: all 4 dimensions are fractions (0.08 = 8%) — do NOT reference percentage integers`;
}

export function buildPromptEngineerUserPrompt(
  ctx: CompanyPromptInputContext,
  comparables: readonly CompanyComparableRow[],
  regressContext?: RegressContext,
): string {
  const personaLine = `${ctx.persona.marketTier} tier, ${ctx.persona.verticalSlug} vertical, ${ctx.persona.locale} locale`;
  const portfolioLine =
    `${ctx.portfolio.propertyCount} ${ctx.portfolio.propertyCount === 1 ? "property" : "properties"}` +
    ` · ManCo revenue $${(ctx.portfolio.totalManagementCoRevenueUsd / 1_000_000).toFixed(1)}M/yr` +
    ` · monthly burn $${(ctx.portfolio.monthlyBurnUsd / 1_000).toFixed(0)}K`;

  const pct = (v: number | null | undefined) =>
    v == null ? "(not set)" : `${(v * 100).toFixed(1)}%`;

  const inputsBlock = COMPANY_DIMENSION_KEYS.map((k) => {
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
              `  [${i}] ${c.operator} — ${c.locale} (${c.vertical}, ${c.propertyCount} props) ` +
              `— baseFee ${p(c.baseManagementFee)}, incentiveFee ${p(c.incentiveManagementFee)}, ` +
              `taxRate ${p(c.companyTaxRate)}, Re ${p(c.costOfEquity)}`,
          )
          .join("\n")
      : "  (no company comparables available)";

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

# Current company-tab values
${inputsBlock}

# ManCo company comparable set (${comparables.length} rows — representative subset shown)
${compBlock}
${regressBlock}
# Your task
Produce targeted quantAddendum and marketAddendum for this specific operator. Focus on what makes this operator's fee structure and financial defaults unusual relative to the generic boutique-luxury case. Be concise and specific — these addenda will be prepended to panel system prompts.`;
}
