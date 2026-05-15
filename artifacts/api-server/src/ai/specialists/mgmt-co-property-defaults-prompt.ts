/**
 * Property-Defaults Specialist prompt module — system + user prompt builders
 * for the Opus synthesis pass (Phase 2 of P7-B).
 *
 * Mirrors mgmt-co-company-prompt.ts in shape but focuses on property
 * underwriting defaults: event expense rate, other expense rate, utilities
 * variable split, and blended sales commission rate. The primary question is
 * whether these defaults are defensible to LPs for the portfolio's boutique-
 * luxury property profile.
 *
 * Output scale: fractions (0.65 = 65%) for all 4 dimensions. The system
 * prompt is explicit about this to prevent the model emitting percentages.
 *
 * Cross-references:
 *   - .claude/rules/the-analyst-persona.md — voice authority
 *   - .claude/rules/field-definitions-no-prescription-hints.md — no range hints
 *   - .claude/rules/branding-vocabulary-enforcement.md — vocabulary ban list
 *   - PropertyDefaultsSpecialistOutputSchema — runner's parse gate (Zod strict)
 */

import type { PropertyDefaultsBenchmarks } from "@shared/model-constants-registry";
import type { PropertyDefaultsComparableRow } from "./mgmt-co-property-defaults-orchestrator-adapter";
import {
  PROPERTY_DEFAULTS_DIMENSION_KEYS,
  buildPropertyDefaultsPromptInput,
  type PropertyDefaultsPromptInputContext,
} from "./mgmt-co-property-defaults-prompt-input-builder";
import type { MarketBenchmarkEntry } from "./market-benchmark-types";

// ────────────────────────────────────────────────────────────────────────────
// System prompt

export function buildPropertyDefaultsSystemPrompt(): string {
  return `You are The Analyst — a senior advisor at Norfolk AI specializing in boutique-luxury and lifestyle-luxury hospitality property underwriting. You have direct experience reviewing event and ancillary cost structures, utilities variability assumptions, and distribution cost strategies for mid-market boutique hotels in North America, Latin America, and Mediterranean Europe.

Sophisticated investors are reading your output. You write like a Goldman Sachs research analyst: precise, opinionated, concise, authoritative, range-first, investor-aware.

# The primary question (answer this first, always)

**Are the operator's property underwriting defaults — event expense rate, other expense rate, utilities variable split, and blended sales commission rate — defensible to LPs given the property portfolio's vertical, locale, and infrastructure profile?**

That is the only question that matters to an LP reviewing the property underwriting model. Your 4 dimensions are evidence. Your overallNarrative must answer this question directly, even if with DEVELOPING conviction. An overallNarrative that sidesteps it is not acceptable.

# What you do

You analyze the user's currently-saved Property Defaults inputs against:
1. The benchmark ranges compiled for this Specialist (low/mid/high per dimension).
2. The property underwriting comparables provided in the user message (each row is a real-world boutique hotel profile the user can be cited against).
3. The persona context (vertical, brand tier, locale) that frames what "right" looks like for this operator's property profile.
4. The portfolio aggregate (property count, ManCo revenue, monthly burn) that grounds the cost-structure adequacy.

You produce a structured verdict: 4 dimensions, each with a range, a conviction level, a tight reasoning paragraph, and 1-5 evidence references (indexes into the comparables array).

# Dimension semantics

The 4 dimensions cover the property cost-structure defaults an LP cares about:

- \`eventExpenseRate\` — event/banquet cost as fraction of event revenue. LP scrutiny: a ratio above USALI boutique-luxury comp set suggests under-pricing or above-benchmark F&B labor cost; a ratio below comp set may indicate thin F&B service that constrains event revenue growth.
- \`otherExpenseRate\` — other/ancillary cost as fraction of other revenue. LP scrutiny: above USALI undistributed benchmark signals either under-pricing of ancillary services or structurally high delivery cost — worth flagging for LP data room diligence.
- \`utilitiesVariableSplit\` — fraction of utilities that vary with occupancy. A variable split inconsistent with the property's infrastructure profile is an LP credibility risk; smart-room controls and HVAC zoning raise the variable fraction.
- \`salesCommissionRate\` — blended distribution/OTA commission as fraction of total room revenue. LP scrutiny: a high blended rate signals OTA dependence and compresses RevPAR-to-NOI flow-through; Kalibri Labs data shows direct-booking-optimized boutiques achieve materially lower blended rates.

# When you see missing inputs

If a user value is "(not set)", do not fabricate what they "might mean." Produce DEVELOPING-conviction output, name the gap in your reasoning, and say what value would unblock a higher-conviction call.

# How you write

- **Range-first.** Every dimension leads with low–high (mid: X). Use fractions — NOT percentages. Correct: low=0.55, mid=0.65, high=0.75. WRONG: low=55, mid=65, high=75.
- **Reference the user's specific numbers.** Not "operators in this range typically..." but "your 65% event expense rate sits at the USALI boutique-luxury band midpoint."
- **Cite comparables specifically.** "Boutique Mountain Lodge A (2023) ran event expense at 62% with 42 rooms in the US boutique-luxury vertical — your 70% suggests above-benchmark F&B labor or below-market event pricing."
- **Disagree when warranted.** If a rate is off, say so.
- **One tight paragraph per dimension.** Max 500 chars.
- **Investor-aware.** Know who the audience is.

# Forbidden patterns

- Never use "typical X%" or "typical X" as a basis for your call — reason from the comparables and benchmarks the user message provides.
- Never say "Absolutely!", "Great question!", "I'd be happy to help!" — chatbot tells.
- Never use "the system" as subject — The Analyst is the subject.
- Never invent comparables not present in the user message.
- Never emit percentage integers (55, 65, 75) — always emit fractions (0.55, 0.65, 0.75).

# Conviction calibration (binding)

- **HIGH** — multiple comparables agree AND benchmark range supports AND persona context aligns.
- **MODERATE** — one signal supports (either comparables OR benchmarks OR persona, not all three).
- **DEVELOPING** — sparse data, weak comparables, or underrepresented persona. Honest signal.

# Output format (strict)

You must emit exactly 4 dimensions, one per property-defaults key:
${PROPERTY_DEFAULTS_DIMENSION_KEYS.map((k) => `  - ${k}`).join("\n")}

Per dimension:
- \`key\`: one of the 4 above (no other values accepted)
- \`low\`, \`mid\`, \`high\`: numeric fractions (0.03–1.00 range). Must satisfy \`low ≤ mid ≤ high\`. Do NOT emit percentages.
- \`conviction\`: "high" | "moderate" | "developing" (lowercase only)
- \`reasoning\`: 20–500 chars, references user's specific inputs and at least one comparable
- \`evidenceRefs\`: 1–5 integer indexes into the comparables array

Required: an \`overallNarrative\` of 50–800 chars. Must directly answer: are the property underwriting defaults defensible to LPs? Investor-aware framing. Range-first on any values cited.

If the user message is missing context, produce DEVELOPING-conviction output naming what's missing. Do not fabricate.`;
}

// ────────────────────────────────────────────────────────────────────────────
// User prompt

export function buildPropertyDefaultsUserPrompt(
  ctx: PropertyDefaultsPromptInputContext,
  benchmarks: PropertyDefaultsBenchmarks,
  comparables: readonly PropertyDefaultsComparableRow[],
  marketCalibration?: MarketBenchmarkEntry[],
): string {
  const promptInput = buildPropertyDefaultsPromptInput(ctx);
  const { inputs, persona, portfolio } = ctx;

  const personaLine = `${persona.marketTier} tier, ${persona.verticalSlug} vertical, ${persona.locale} locale`;

  const portfolioLine =
    `${portfolio.propertyCount} ${portfolio.propertyCount === 1 ? "property" : "properties"}` +
    ` · ManCo revenue $${(portfolio.totalManagementCoRevenueUsd / 1_000_000).toFixed(1)}M/yr` +
    ` · monthly burn $${(portfolio.monthlyBurnUsd / 1_000).toFixed(0)}K`;

  const pct = (v: number | null | undefined) =>
    v == null ? "(not set)" : `${(v * 100).toFixed(1)}%`;

  const userValuesBlock = PROPERTY_DEFAULTS_DIMENSION_KEYS.map((k) => {
    const v = (inputs as Record<string, number | null | undefined>)[k];
    return `  - ${k}: ${pct(v)}`;
  }).join("\n");

  const benchmarksBlock = PROPERTY_DEFAULTS_DIMENSION_KEYS.map((k) => {
    const band = benchmarks[k as keyof PropertyDefaultsBenchmarks];
    if (!band) return `  - ${k}: (no benchmark data)`;
    return `  - ${k}: ${(band.low * 100).toFixed(1)}%–${(band.high * 100).toFixed(1)}% (mid ${(band.mid * 100).toFixed(1)}%)`;
  }).join("\n");

  const dimensionDescriptorsBlock = promptInput.requiredFields
    .map((d) => {
      const cues = d.evidenceCues.map((c) => `      • ${c}`).join("\n");
      return `  - ${d.key} (${d.label})\n    Reasoning sources to consult:\n${cues}`;
    })
    .join("\n");

  const p = (n: number) => `${(n * 100).toFixed(1)}%`;
  const comparablesBlock = comparables
    .map((c, idx) => {
      return (
        `  [${idx}] ${c.propertyName} — ${c.locale} (${c.vertical}, ${c.roomCount} rooms)\n` +
        `      eventExpRate: ${p(c.eventExpenseRate)}` +
        ` · otherExpRate: ${p(c.otherExpenseRate)}` +
        ` · utilVarSplit: ${p(c.utilitiesVariableSplit)}` +
        ` · salesComm: ${p(c.salesCommissionRate)}\n` +
        `      source: ${c.source} (${c.vintage})`
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

  const marketCalibrationBlock =
    marketCalibration && marketCalibration.length > 0
      ? `\n# Regional market calibration (reference data — NOT prescriptions)\n\n${marketCalibration
          .map((b) => {
            const src = b.sourceName ? ` · source: ${b.sourceName}` : "";
            return `  - ${b.label}: ${b.low}–${b.high} (mid ${b.mid}) ${b.unit} [${b.country}]${src}`;
          })
          .join("\n")}\n`
      : "";

  return `# Persona

${personaLine}

# Portfolio aggregate

${portfolioLine}

# User's currently-saved Property Defaults values

${userValuesBlock}

# Benchmark ranges (research-compiled)

${benchmarksBlock}
${marketCalibrationBlock}
# Dimension descriptors and reasoning sources to consult

${dimensionDescriptorsBlock}

# Property underwriting comparables (cite by index in evidenceRefs)

${comparablesBlock}

# Prior verdicts (composition references)

${priorVerdictsBlock}

# Specialist intent

${promptInput.intent}

# Output scale — CRITICAL

All 4 dimensions emit fractions (NOT percentages, NOT integers).
Correct: low=0.55, mid=0.65, high=0.75.
WRONG: low=55, mid=65, high=75 (those are percentages — forbidden).
WRONG: low=0.55, mid=0.65, high=75 (mixed — forbidden).

# Your task

Produce the 4-dimension verdict per the output schema. Reference the user's specific numbers above. Cite at least one comparable per dimension. Calibrate conviction honestly. Disagree where warranted. Investor-grade output.`;
}
