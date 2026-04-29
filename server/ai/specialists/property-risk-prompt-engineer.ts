// UNWIRED — blocking on: G3-P3 runner rewrite (property-risk-intelligence-runner.ts)
/**
 * Prompt Engineer pre-stage for the Risk Intelligence Specialist N+1 pipeline (G3).
 *
 * Per Intelligence Bar requirement #8: before the parallel panels run, a cheap
 * LLM call (Gemini Flash) reads property context + inflation comparables and
 * produces tailored addenda for the quant and market panel system prompts.
 *
 *   quantAddendum — property-specific calibration signals for the quant panel
 *   marketAddendum — LP-relevant inflation deviation context for market panel
 *
 * Mirrors `mgmt-co-funding-prompt-engineer.ts` for the Risk pipeline.
 * The `regressContext` field carries prior-pass addenda + failure reason into
 * the next PE call, preventing infinite regress from identical framing.
 */

import { z } from "zod";
import type { PropertyRiskIntelligencePromptInputContext } from "./property-risk-intelligence-prompt";
import { RISK_DIMENSION_KEYS } from "./property-risk-orchestrator-adapter";
import type { InflationComparableRow } from "./property-risk-orchestrator-adapter";

// ── Regress context ────────────────────────────────────────────────────────

export interface RegressContext {
  priorQuantAddendum: string;
  priorMarketAddendum: string;
  regressReason: string;
}

// ── Output schema ──────────────────────────────────────────────────────────

export const RiskPromptEngineerOutputSchema = z.object({
  quantAddendum: z
    .string()
    .max(800)
    .describe(
      "Additional context to prepend to the quant panel system prompt. Focus on property-specific signals that help ground the inflation range against the country outlook (import-heavy cost structure, long-stay vs. transient mix, seasonal CPI exposure).",
    ),
  marketAddendum: z
    .string()
    .max(600)
    .describe(
      "Additional context to prepend to the market panel system prompt. Focus on LP-relevant deviation drivers between country CPI and this property's experienced inflation.",
    ),
  rationale: z
    .string()
    .max(400)
    .describe(
      "One-sentence explanation of the primary inflation-deviation signal identified for this property.",
    ),
});
export type RiskPromptEngineerOutput = z.infer<typeof RiskPromptEngineerOutputSchema>;

// ── Prompt builders ────────────────────────────────────────────────────────

export function buildRiskPromptEngineerSystemPrompt(): string {
  return `You are a Prompt Engineer for a hospitality property risk intelligence specialist. Your job is to analyze a property's inflation context and produce targeted addenda that make the downstream quantitative and market panel prompts more effective for this specific property.

# Your role

Given a property profile (persona, country inflation outlook, inflation comparables, saved override), produce:
1. quantAddendum — extra signals that help the quantitative panel ground its inflation range against the authority-sourced country outlook
2. marketAddendum — extra LP context that helps the market panel identify deviation drivers specific to this property
3. rationale — what makes this property's inflation exposure distinctive from the generic case

# Guidance for quantAddendum

Surface characteristics that affect how the quant panel should interpret the comparables:
- Revenue mix signals (F&B-heavy properties in tourist economies face import-driven CPI overrun)
- Lease/contract structure (long-stay or rent-controlled assets underrun country CPI)
- Seasonality and operator type (high-season transient luxury vs. residential extended-stay)
- Dimensions where the comparable set is from a different geography and the range should be widened

# Guidance for marketAddendum

Surface LP dynamics specific to inflation for this property:
- Investor expectations for this vertical + locale's inflation exposure
- Whether the operator's cost structure is more exposed to traded goods (import risk) or labor (wage-growth risk)
- Flag where property-level deviation from country CPI is material for LP underwriting

# Constraints
- quantAddendum: max 800 characters
- marketAddendum: max 600 characters
- rationale: max 400 characters, one sentence preferred
- Do NOT reproduce the comparables verbatim — reference patterns, not rows
- Do NOT invent market data absent from the comparables or country outlook
- Do NOT produce numeric ranges — those are the quant panel's job`;
}

export function buildRiskPromptEngineerUserPrompt(
  ctx: PropertyRiskIntelligencePromptInputContext,
  comparables: readonly InflationComparableRow[],
  regressContext?: RegressContext,
): string {
  const personaLine = `${ctx.persona.marketTier} tier, ${ctx.persona.verticalSlug} vertical, ${ctx.persona.locale} locale`;
  const locationLine = ctx.inputs.country
    ? `${ctx.inputs.city ? `${ctx.inputs.city}, ` : ""}${ctx.inputs.country}`
    : ctx.persona.locale;

  const overrideLine =
    ctx.inputs.propertyInflationRate != null
      ? `${(ctx.inputs.propertyInflationRate * 100).toFixed(2)}%`
      : "(not set — will default to country outlook midpoint)";

  const outlookBlock = ctx.countryInflationOutlook
    ? `  Authority: ${ctx.countryInflationOutlook.source}
  Range: ${(ctx.countryInflationOutlook.low * 100).toFixed(2)}% – ${(ctx.countryInflationOutlook.high * 100).toFixed(2)}% (mid ${(ctx.countryInflationOutlook.mid * 100).toFixed(2)}%)
  As of: ${ctx.countryInflationOutlook.asOf}`
    : "  (no country outlook available — reason with caution)";

  const dimensionLine = RISK_DIMENSION_KEYS.join(", ");

  const compBlock =
    comparables.length > 0
      ? comparables
          .slice(0, 5)
          .map(
            (c, i) =>
              `  [${i}] ${c.authority} (${c.country}, ${c.sector}, ${c.vintage}) ` +
              `— ${(c.low * 100).toFixed(1)}%–${(c.high * 100).toFixed(1)}% (mid ${(c.mid * 100).toFixed(1)}%)`,
          )
          .join("\n")
      : "  (no comparables available)";

  const regressBlock = regressContext
    ? `\n# Prior synthesis pass failed — produce DIFFERENT addenda\n` +
      `Prior quantAddendum sent:\n${regressContext.priorQuantAddendum}\n\n` +
      `Prior marketAddendum sent:\n${regressContext.priorMarketAddendum}\n\n` +
      `Failure reason: ${regressContext.regressReason}\n` +
      `Do NOT reproduce the prior addenda — produce meaningfully different framing that addresses the failure.\n`
    : "";

  return `# Property profile
${personaLine}
Location: ${locationLine}

# Current risk dimension
${dimensionLine}
Saved override: ${overrideLine}

# Country / market inflation outlook (authority-sourced)
${outlookBlock}

# Cross-sectoral CPI comparables (${comparables.length} rows — calibration cross-reference)
${compBlock}
${regressBlock}
# Your task
Produce targeted quantAddendum and marketAddendum for this specific property. Focus on what makes this property's inflation exposure unusual relative to a generic operator in this locale. Be concise and specific — these addenda will be prepended to panel system prompts.`;
}
