/**
 * Funding Specialist prompt module — system + user prompt builders for the
 * single-shot Opus call (G1.5c-v1).
 *
 * **CRITICAL — quality bar.** The prompt is the most important file in this
 * Specialist. Single-shot Opus quality is bounded by (1) prompt design and
 * (2) context richness. We invest in both. N+1 panels, regress, cache, live
 * comparables, and persona resolution are deferred to G6-P2/P3/P4 — none of
 * those compensate for a weak prompt.
 *
 * **Persona authority:** `.claude/rules/the-analyst-persona.md` is the single
 * source of truth for The Analyst's voice. This system prompt embodies it.
 * Senior advisor at Norfolk AI specializing in capital raises for
 * boutique-luxury hospitality management companies. Range-first delivery.
 * Investor-aware framing. Disagrees when warranted.
 *
 * **Vocabulary discipline:** `.claude/rules/branding-vocabulary-enforcement.md`
 * names banned phrases. The system prompt teaches Opus to avoid them in output.
 * The vocabulary-compliance test gates downstream rendering.
 *
 * **Anti-mode-collapse:** per `.claude/rules/field-definitions-no-prescription-hints.md`,
 * the system prompt does NOT embed numeric typical-range hints (e.g. "typical
 * 12-18 months"). Per-market reasoning emerges from comparables + benchmarks
 * + persona, not from prompt presets.
 *
 * Output contract: `FundingSpecialistOutputSchema` (strict Zod). 5 dimensions,
 * each with low/mid/high/conviction/reasoning/evidenceRefs. Refusal to comply
 * → schema rejection at runner layer → Tier-0 fallback with
 * `meta.fallbackReason: "tier1_temporarily_unavailable"`.
 */

import type { AnalystWatchdogBenchmarks } from "@workspace/db";
import type { ComparableRow } from "./mgmt-co-funding-orchestrator-adapter";
import {
  FUNDING_DIMENSION_KEYS,
  buildFundingPromptInput,
  type FundingPromptInputContext,
} from "./mgmt-co-funding-prompt-input-builder";
import type { MarketBenchmarkEntry } from "./market-benchmark-types";
export type { MarketBenchmarkEntry };

// ────────────────────────────────────────────────────────────────────────────
// System prompt — The Analyst persona + voice + output discipline

/**
 * The system prompt Opus receives. Embodies The Analyst persona, voice
 * rules, calibration discipline, and output-format constraints.
 *
 * Engineering principle: every line earns its place. No filler. No
 * "you're a helpful assistant" boilerplate. The Analyst is a specific
 * advisor with specific expertise, and the prompt establishes that.
 */
export function buildFundingSystemPrompt(): string {
  return `You are The Analyst — a senior advisor at Norfolk AI specializing in capital raises for boutique-luxury and lifestyle-luxury hospitality management companies. You have direct experience advising on LP allocations, fund-of-funds dynamics, and brand-specific raise patterns across mid-market hospitality SPVs and the management companies that operate them.

Sophisticated investors are reading your output. You write like a Goldman Sachs research analyst: precise, opinionated, concise, authoritative, range-first, investor-aware.

# The primary question (answer this first, always)

**Is the amount being raised enough — and is it arriving at the right time?**

That is the only question that matters to an LP reading this plan. Your 5 dimensions are evidence. Your overallNarrative must answer this question directly, even if with DEVELOPING conviction. No overallNarrative that sidesteps it is acceptable.

# What you do

You analyze the user's currently-saved Funding-tab inputs against:
1. The benchmarks our research surface has compiled for this Specialist (low/mid/high per dimension, with source labels).
2. The LP-comparable raises provided in the user message (each row is a real-world raise the user can be cited against).
3. The persona context (vertical, brand tier, locale) that frames what "right" looks like for this specific operator.
4. The portfolio aggregate (property count, raise need, runway need) that grounds the magnitudes.

You produce a structured verdict: 5 dimensions, each with a range, a conviction level, a tight reasoning paragraph, and 1-5 evidence references (indexes into the comparables array).

# When engine-computed analysis is available

If the user message contains a "# Engine-computed funding analysis" section, those numbers are primary grounding — use them directly and cite them by field name:
- totalRaiseNeeded overrides abstract raise-adequacy inference; anchor all sizing commentary to this figure.
- monthlyBurnRate is the burn figure for runway analysis — not a guess, not a comparable.
- breakevenMonth and monthsOfRunway replace the cash-flow-redirect hedge for runway adequacy.
- Tranche amounts and month indices are the plan structure — validate their pacing against the comparable set.

Do NOT redirect to the Cash Flow Statement for fields already visible in the engine section.

# When engine data is absent

You see the user's funding plan inputs — amounts, dates, buffers, overshoot targets. You do NOT see computed monthly cash flows. When your analysis raises concerns that only the engine output can confirm, say so explicitly in the relevant dimension's reasoning AND in the overallNarrative:

> "The Analyst sees [concern]. Verify by checking your Cash Flow Statement — look for months where cumulative cash turns negative or where excess capital sits idle for more than 2-3 months."

Use this redirect when:
- The runway buffer looks thin but you can't see whether it covers the gap between tranches.
- The raise size looks borderline relative to the portfolio aggregate and you can't confirm it clears overhead + pre-ops + debt service.
- Tranche 2 timing may arrive too late to cover a revenue ramp gap, but the exact month depends on engine output.

Do NOT fabricate sufficiency. The Cash Flow Statement redirect is the honest answer when the engine section is absent.

# How you write

- **Range-first.** Every dimension leads with low–high (mid: X). The midpoint is your best educated guess. The range is the intelligence — it captures what you don't know.
- **Reference the user's specific numbers.** Not "operators in this range typically..." but "your 12-month runway buffer sits below the comparable set's 14–18 month band."
- **Cite comparables specifically.** "Boutique Lifestyle Group A (2023) raised $30M with an 18-month buffer" beats "industry comps suggest 18 months."
- **Disagree when warranted.** If the user's input is weak, say so. "Your 6-month buffer leaves no cushion for ramp lag — LPs will flag this." Hedging makes you useless.
- **One tight paragraph per dimension.** Max 500 chars. If you can't make the case in 500 chars, you're not focused.
- **Investor-aware.** "LPs in this vertical will ask why..." or "Expect a flag on cap-table dilution at this overshoot." You know who's reading the output.

# Forbidden patterns

- Never "Absolutely!", "Great question!", "I'd be happy to help!", "Let me break this down for you", "I hope that helps!" — these are chatbot tells. You are an advisor.
- Never start with "Sure!" or "Definitely!" — just give the verdict.
- Never end with "Hope that helps!" — end with the next question or observation, or stop.
- Never use "the system" as the subject of action. The Analyst (you) is the subject when something is being analyzed.
- Never invent comparables that weren't in the user message. If you cite, the cite must be present.
- Never emit a typical industry range as the basis for your call. Reason from the comparables and benchmarks the user message provides.

# Conviction calibration (binding)

Use exactly three levels. Don't soften or hedge:

- **HIGH** — multiple comparables agree AND benchmark range supports your call AND persona context aligns. You can defend this in front of an LP.
- **MODERATE** — one signal supports (either comparables OR benchmarks OR persona, not all three). Reasonable but not bulletproof.
- **DEVELOPING** — sparse data; comparables are weak or your persona is underrepresented. Honest signal that you'd want more before committing.

If you find yourself wanting "high" but the data is thin, write "moderate" or "developing" and say what would unblock "high" in the reasoning.

# Output format (strict)

You must emit exactly 5 dimensions, one per funding key:
${FUNDING_DIMENSION_KEYS.map((k) => `  - ${k}`).join("\n")}

Per dimension:
- \`key\`: one of the 5 above (no other values accepted)
- \`low\`, \`mid\`, \`high\`: numbers; must satisfy \`low ≤ mid ≤ high\`
- \`conviction\`: "high" | "moderate" | "developing" (lowercase, no other values)
- \`reasoning\`: 20–500 chars, references user's specific inputs and at least one comparable
- \`evidenceRefs\`: 1–5 integer indexes into the comparables array (the order they appear in the user message)

Required: an \`overallNarrative\` of 50–800 chars. It must directly answer the primary question — is the amount enough and arriving at the right time? If yes: say so with conviction and name the evidence. If no or uncertain: say so and include the Cash Flow Statement redirect. Investor-aware framing. Range-first if you cite numbers. This field is not optional.

If the user message is missing context you need (e.g., no comparables, sparse benchmarks), produce DEVELOPING-conviction output that names what's missing in the reasoning. Do not fabricate.`;
}

// ────────────────────────────────────────────────────────────────────────────
// User prompt — structured data dump with rich context

/**
 * Build the user message Opus consumes per call. Structured, dense, every
 * field labeled so Opus can reason about each in isolation.
 *
 * Engineering principle: the user message is data, not narration. We don't
 * tell Opus how to think — the system prompt does that. The user message
 * gives Opus everything it needs to think well.
 */
export function buildFundingUserPrompt(
  ctx: FundingPromptInputContext,
  benchmarks: AnalystWatchdogBenchmarks,
  comparables: readonly ComparableRow[],
  marketCalibration?: MarketBenchmarkEntry[],
): string {
  const promptInput = buildFundingPromptInput(ctx);
  const { inputs, persona, portfolio } = ctx;

  const personaLine = `${persona.marketTier} tier, ${persona.verticalSlug} vertical, ${persona.locale} locale`;

  const portfolioLine =
    `${portfolio.propertyCount} ${portfolio.propertyCount === 1 ? "property" : "properties"} ` +
    `· $${(portfolio.totalRaiseNeedUsd / 1_000_000).toFixed(1)}M total raise need ` +
    `· ${portfolio.runwayNeedMonths.toFixed(0)}-month modeled runway need`;

  const userValuesBlock = FUNDING_DIMENSION_KEYS.map((k) => {
    const v = inputs[k];
    const display = v == null ? "(not set)" : formatValue(k, v);
    return `  - ${k}: ${display}`;
  }).join("\n");

  const benchmarksBlock = FUNDING_DIMENSION_KEYS.map((k) => {
    const low = benchmarks[`${k}Low` as keyof AnalystWatchdogBenchmarks];
    const mid = benchmarks[`${k}Mid` as keyof AnalystWatchdogBenchmarks];
    const high = benchmarks[`${k}High` as keyof AnalystWatchdogBenchmarks];
    return `  - ${k}: ${formatValue(k, Number(low))}–${formatValue(k, Number(high))} (mid ${formatValue(k, Number(mid))})`;
  }).join("\n");

  const dimensionDescriptorsBlock = promptInput.requiredFields
    .map((d) => {
      const cues = d.evidenceCues.map((c) => `      • ${c}`).join("\n");
      return `  - ${d.key} (${d.label}, unit ${d.unit})\n    Reasoning sources to consult:\n${cues}`;
    })
    .join("\n");

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

  const priorVerdictsBlock =
    promptInput.priorVerdicts.length === 0
      ? "  (no prior verdicts — this is a fresh review)"
      : promptInput.priorVerdicts
          .map(
            (v) =>
              `  - ${v.specialistId} runId ${v.cognitiveRunId ?? "tier-0"} asOf ${v.asOf}`,
          )
          .join("\n");

  const engineAnalysisBlock = ctx.engineAnalysis
    ? `# Engine-computed funding analysis (primary grounding — use directly)\n\n` +
      `  Total raise needed:   $${(ctx.engineAnalysis.totalRaiseNeeded / 1_000_000).toFixed(2)}M\n` +
      `  Monthly burn rate:    $${(ctx.engineAnalysis.monthlyBurnRate / 1_000).toFixed(0)}K/mo\n` +
      `  Breakeven month:      ${ctx.engineAnalysis.breakevenMonth != null ? `month ${ctx.engineAnalysis.breakevenMonth}` : "not reached within projection window"}\n` +
      `  Months of runway:     ${ctx.engineAnalysis.monthsOfRunway.toFixed(0)}\n` +
      `  Funding gap:          $${(ctx.engineAnalysis.fundingGap / 1_000).toFixed(0)}K (negative = surplus)\n` +
      `  Peak cash deficit:    $${(ctx.engineAnalysis.peakCashDeficit / 1_000).toFixed(0)}K\n` +
      (ctx.engineAnalysis.tranches.length > 0
        ? `  Tranches:\n` +
          ctx.engineAnalysis.tranches
            .map((t, i) => `    [${i + 1}] $${(t.amountUsd / 1_000_000).toFixed(2)}M at month ${t.monthIndex}`)
            .join("\n")
        : `  Tranches:             none computed`) +
      `\n`
    : "";

  const icpBlock = ctx.icpModel
    ? `# Management company model (ICP — user-selected anchor)

Model ${ctx.icpModel.tier}: ${ctx.icpModel.label} — ${ctx.icpModel.tagline}
  Properties managed:   ${ctx.icpModel.propertyCount.min}–${ctx.icpModel.propertyCount.max} (typical ${ctx.icpModel.propertyCount.typical})
  Revenue ramp:         ${ctx.icpModel.rampMonths}mo to first meaningful management fee revenue
  Monthly burn:         $${(ctx.icpModel.monthlyBurnUsd / 1000).toFixed(0)}K overhead (excl. partner comp)
  Partners:             ${ctx.icpModel.partnerCount} × $${(ctx.icpModel.partnerCompMonthlyUsd / 1000).toFixed(0)}K/mo
  Typical raise:        $${(ctx.icpModel.targetRaiseUsd.min / 1_000_000).toFixed(1)}M–$${(ctx.icpModel.targetRaiseUsd.max / 1_000_000).toFixed(1)}M (typical $${(ctx.icpModel.targetRaiseUsd.typical / 1_000_000).toFixed(1)}M)
  Tranches:             ${ctx.icpModel.typicalTrancheCount} (${ctx.icpModel.trancheGapMonths}mo gap)
  Runway buffer:        ${ctx.icpModel.runwayBufferMonths}mo model anchor
  Sizing overshoot:     ${(ctx.icpModel.sizingOvershootPct * 100).toFixed(0)}% model anchor
  Revenue ramp delay:   ${ctx.icpModel.revenueRampDelayMonths}mo model anchor
  Burn flex-down:       ${(ctx.icpModel.burnFlexDownPct * 100).toFixed(0)}% model anchor

Use this model as a SECONDARY anchor — the user's saved values above take precedence where present. When user values are missing or at default, anchor ranges to this model. Adjust for any delta between user's actual property count (${portfolio.propertyCount}) and this model's typical (${ctx.icpModel.propertyCount.typical}).`
    : "# Management company model (ICP)\n\n  (no model selected — user has not chosen A/B/C)";

  const marketCalibrationBlock =
    marketCalibration && marketCalibration.length > 0
      ? `\n# Regional market calibration (reference data — NOT prescriptions)\n\nThe following ranges are from published benchmark surveys for the operator's target market.\nThey are calibration data only. Reason per-deal from the operator's specific profile,\ncapital-stack discipline, and comparable set above. Do NOT emit these ranges verbatim.\n\n${marketCalibration.map((b) => {
          const src = b.sourceName ? ` · source: ${b.sourceName}` : "";
          return `  - ${b.label}: ${b.low}–${b.high} (mid ${b.mid}) ${b.unit} [${b.country}]${src}`;
        }).join("\n")}\n`
      : "";

  return `# Persona

${personaLine}

# Portfolio aggregate

${portfolioLine}

${engineAnalysisBlock}
${icpBlock}

# User's currently-saved Funding-tab values

${userValuesBlock}

# Benchmark ranges (research-compiled, source-labeled)

Source: ${benchmarks.refreshedBy ?? "internal benchmark snapshot"}${benchmarks.lastRefreshedAt ? ` (lastRefreshed ${new Date(benchmarks.lastRefreshedAt).toISOString().slice(0, 10)})` : ""}

${benchmarksBlock}
${marketCalibrationBlock}
# Dimension descriptors and reasoning sources to consult

${dimensionDescriptorsBlock}

# LP comparables (cite by index in evidenceRefs)

${comparablesBlock}

# Prior verdicts (composition references)

${priorVerdictsBlock}

# Specialist intent

${promptInput.intent}

# Output scale — IMPORTANT

- For "mo" dimensions (runwayBufferMonths, trancheGapMonths, revenueRampDelayMonths): output low/mid/high as whole months (e.g., 12 for 12 months, not 0.12).
- For "%" dimensions (sizingOvershootPct, burnFlexDownPct): output low/mid/high as DECIMAL FRACTIONS (e.g., 0.18 for 18%, 0.25 for 25%). Do NOT output whole-number percentages like 18 or 25.

# Your task

Produce the 5-dimension verdict per the output schema. Reference the user's specific numbers above. Cite at least one comparable per dimension. Calibrate conviction honestly. Disagree where warranted. Investor-grade output.`;
}

// ────────────────────────────────────────────────────────────────────────────
// Display helpers — pure formatting, no business logic

/**
 * Format a numeric value for prompt display based on the dimension's unit
 * convention. Months are integer-ish; percentages are `X%`. Same convention
 * as `engine/analyst/surface/mgmt-co/funding-specialist.ts` DIMENSION_META.
 */
function formatValue(key: string, value: number): string {
  if (key === "runwayBufferMonths" || key === "trancheGapMonths" || key === "revenueRampDelayMonths") {
    return `${value.toFixed(0)}mo`;
  }
  if (key === "sizingOvershootPct" || key === "burnFlexDownPct") {
    return `${(value * 100).toFixed(1)}%`;
  }
  return String(value);
}
