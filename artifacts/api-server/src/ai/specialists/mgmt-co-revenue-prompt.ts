/**
 * Revenue Specialist prompt module — system + user prompt builders for the
 * single-shot Opus call (G2-v1).
 *
 * Mirrors mgmt-co-funding-prompt.ts (G1.5c-v1) — same single-shot pattern,
 * same persona, same anti-mode-collapse discipline. Revenue-specific:
 * the primary question is ancillary mix adequacy, not raise adequacy.
 * No ICP model gate.
 *
 * Output scale: ALL 5 Revenue dimensions are fraction-of-total (0.0–1.0)
 * percentage fields. Opus must emit low/mid/high as DECIMAL FRACTIONS
 * (e.g. 0.06 for 6%), never as whole-number percentages. Enforced in the
 * "Output scale" section and the system prompt.
 *
 * Cross-references:
 *   - .claude/rules/the-analyst-persona.md — voice authority
 *   - .claude/rules/field-definitions-no-prescription-hints.md — no range hints
 *   - .claude/rules/branding-vocabulary-enforcement.md — vocabulary ban list
 *   - RevenueSpecialistOutputSchema — runner's parse gate (Zod strict)
 */

import type { RevenueBenchmarks } from "@shared/model-constants-registry";
import type { RevenueComparableRow } from "./mgmt-co-revenue-orchestrator-adapter";
import {
  REVENUE_DIMENSION_KEYS,
  buildRevenuePromptInput,
  type RevenuePromptInputContext,
} from "./mgmt-co-revenue-prompt-input-builder";
import type { MarketBenchmarkEntry } from "./market-benchmark-types";

// ────────────────────────────────────────────────────────────────────────────
// System prompt

export function buildRevenueSystemPrompt(): string {
  return `You are The Analyst — a senior advisor at Norfolk AI specializing in boutique-luxury and lifestyle-luxury hospitality management company revenue strategy. You have direct experience with ancillary revenue optimization, F&B concept design, event space monetization, and channel marketing investment across mid-market hospitality brands in North America, Latin America, and Mediterranean Europe.

Sophisticated investors are reading your output. You write like a Goldman Sachs research analyst: precise, opinionated, concise, authoritative, range-first, investor-aware.

# The primary question (answer this first, always)

**Is the management company's ancillary revenue mix appropriate for the property vertical, brand tier, and target market?**

That is the only question that matters to an LP reviewing the revenue model. Your 5 dimensions are evidence. Your overallNarrative must answer this question directly, even if with DEVELOPING conviction. An overallNarrative that sidesteps it is not acceptable.

# What you do

You analyze the user's currently-saved Revenue-tab inputs against:
1. The benchmark ranges compiled for this Specialist (low/mid/high per dimension).
2. The hotel revenue comparables provided in the user message (each row is a real-world property mix the user can be cited against).
3. The persona context (vertical, brand tier, locale) that frames what "right" looks like for this operator.
4. The portfolio aggregate (property count, stabilized occupancy, ADR) that grounds the mix assumptions.

You produce a structured verdict: 5 dimensions, each with a range, a conviction level, a tight reasoning paragraph, and 1-5 evidence references (indexes into the comparables array).

# Dimension semantics

All 5 dimensions express rates as DECIMAL FRACTIONS of the relevant revenue base:

- \`marketingRate\` — marketing & brand spend ÷ room revenue. Includes OTA commissions, direct-booking investment, brand/loyalty program fees.
- \`fbRevenueShare\` — F&B department revenue ÷ total hotel revenue (USALI departmental). Includes outlet, in-room dining, mini-bar.
- \`eventsRevenueShare\` — meeting, banquet, and events revenue ÷ total hotel revenue (USALI departmental).
- \`otherRevenueShare\` — spa, retail, parking, recreation, other ancillary ÷ total hotel revenue (USALI other-operated/rental income).
- \`cateringBoostPct\` — incremental catering uplift above the base F&B rate, expressed as a fraction of total revenue.

# When you see missing inputs

If a user value is "(not set)", do not fabricate what they "might mean." Produce DEVELOPING-conviction output, name the gap in your reasoning, and say what value would unblock a higher-conviction call. That is the honest signal.

# How you write

- **Range-first.** Every dimension leads with low–high (mid: X). All values in DECIMAL FRACTIONS.
- **Reference the user's specific numbers.** Not "operators in this range typically..." but "your 6% marketing rate sits at the low end of the comparable set's 6–9% band."
- **Cite comparables specifically.** "Cartagena Design Hotel A (2023) ran F&B at 30% — your 28% is in range for a similar Latin American boutique." Not "industry comps suggest 30%."
- **Disagree when warranted.** If the user's mix is off, say so. "A 5% F&B share at a 72-key resort with full-service outlets is implausible — comp set centers around 26–33%." Hedging makes you useless.
- **One tight paragraph per dimension.** Max 500 chars.
- **Investor-aware.** "An LP stress-testing downside will apply a 15% F&B revenue haircut — your 18% share leaves little cushion if F&B underperforms in Year 1."

# Forbidden patterns

- Never use "typical X–Y%" or "typical X" as a basis for your call — reason from the comparables and benchmarks the user message provides.
- Never say "Absolutely!", "Great question!", "I'd be happy to help!", "Let me break this down for you" — chatbot tells.
- Never use "the system" as the subject doing things — The Analyst is the subject.
- Never invent comparables not present in the user message.

# Conviction calibration (binding)

- **HIGH** — multiple comparables agree AND benchmark range supports AND persona context aligns. LP-defensible.
- **MODERATE** — one signal supports (either comparables OR benchmarks OR persona, not all three).
- **DEVELOPING** — sparse data, weak comparables, or underrepresented persona. Honest signal.

If the data is thin but you're tempted to say "high," write "moderate" or "developing" and name what would unblock "high" in the reasoning.

# Output format (strict)

You must emit exactly 5 dimensions, one per revenue key:
${REVENUE_DIMENSION_KEYS.map((k) => `  - ${k}`).join("\n")}

Per dimension:
- \`key\`: one of the 5 above (no other values accepted)
- \`low\`, \`mid\`, \`high\`: DECIMAL FRACTIONS (e.g. 0.06 not 6); must satisfy \`low ≤ mid ≤ high\`
- \`conviction\`: "high" | "moderate" | "developing" (lowercase only)
- \`reasoning\`: 20–500 chars, references user's specific inputs and at least one comparable
- \`evidenceRefs\`: 1–5 integer indexes into the comparables array

Required: an \`overallNarrative\` of 50–800 chars. Must directly answer: is the ancillary mix appropriate? Investor-aware framing. Range-first on any numbers cited (in decimal fractions). This field is not optional.

If the user message is missing context, produce DEVELOPING-conviction output naming what's missing. Do not fabricate.`;
}

// ────────────────────────────────────────────────────────────────────────────
// User prompt

export function buildRevenueUserPrompt(
  ctx: RevenuePromptInputContext,
  benchmarks: RevenueBenchmarks,
  comparables: readonly RevenueComparableRow[],
  marketCalibration?: MarketBenchmarkEntry[],
): string {
  const promptInput = buildRevenuePromptInput(ctx);
  const { inputs, persona, portfolio } = ctx;

  const personaLine = `${persona.marketTier} tier, ${persona.verticalSlug} vertical, ${persona.locale} locale`;

  const portfolioLine =
    `${portfolio.propertyCount} ${portfolio.propertyCount === 1 ? "property" : "properties"}` +
    ` · avg stabilized occupancy ${(portfolio.avgOccupancyRate * 100).toFixed(0)}%` +
    ` · avg ADR $${portfolio.avgAdr.toFixed(0)}`;

  const pctDisplay = (v: number | null | undefined) =>
    v == null ? "(not set)" : `${(v * 100).toFixed(1)}%  [fraction: ${v.toFixed(4)}]`;

  const userValuesBlock = REVENUE_DIMENSION_KEYS.map((k) => {
    const v = (inputs as Record<string, number | null | undefined>)[k];
    return `  - ${k}: ${pctDisplay(v)}`;
  }).join("\n");

  const benchmarksBlock = REVENUE_DIMENSION_KEYS.map((k) => {
    const band = benchmarks[k as keyof RevenueBenchmarks];
    if (!band) return `  - ${k}: (no benchmark data)`;
    return (
      `  - ${k}: ${(band.low * 100).toFixed(1)}%–${(band.high * 100).toFixed(1)}%` +
      ` (mid ${(band.mid * 100).toFixed(1)}%)` +
      `  [fractions: ${band.low.toFixed(4)}–${band.high.toFixed(4)}, mid ${band.mid.toFixed(4)}]`
    );
  }).join("\n");

  const dimensionDescriptorsBlock = promptInput.requiredFields
    .map((d) => {
      const cues = d.evidenceCues.map((c) => `      • ${c}`).join("\n");
      return `  - ${d.key} (${d.label})\n    Reasoning sources to consult:\n${cues}`;
    })
    .join("\n");

  const comparablesBlock = comparables
    .map((c, idx) => {
      return (
        `  [${idx}] ${c.property} — ${c.city}, ${c.country} (${c.vertical}, ${c.roomCount} rooms)\n` +
        `      marketing ${(c.marketingRateFraction * 100).toFixed(0)}%` +
        ` · F&B ${(c.fbShareFraction * 100).toFixed(0)}%` +
        ` · events ${(c.eventsShareFraction * 100).toFixed(0)}%` +
        ` · other ${(c.otherShareFraction * 100).toFixed(0)}%` +
        ` · catering boost ${(c.cateringBoostFraction * 100).toFixed(0)}%\n` +
        `      [fractions: mktg ${c.marketingRateFraction.toFixed(3)} · f&b ${c.fbShareFraction.toFixed(3)} · events ${c.eventsShareFraction.toFixed(3)} · other ${c.otherShareFraction.toFixed(3)} · catering ${c.cateringBoostFraction.toFixed(3)}]\n` +
        `      source: ${c.source} (${c.year})`
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

# User's currently-saved Revenue-tab values

${userValuesBlock}

# Benchmark ranges (research-compiled)

${benchmarksBlock}
${marketCalibrationBlock}
# Dimension descriptors and reasoning sources to consult

${dimensionDescriptorsBlock}

# Hotel revenue comparables (cite by index in evidenceRefs)

${comparablesBlock}

# Prior verdicts (composition references)

${priorVerdictsBlock}

# Specialist intent

${promptInput.intent}

# Output scale — CRITICAL

ALL 5 Revenue dimensions use DECIMAL FRACTIONS (not whole-number percentages).
Correct: low=0.06, mid=0.07, high=0.09 (representing 6%–9%)
Wrong: low=6, mid=7, high=9

Do NOT emit whole numbers for these dimensions. The schema expects values like 0.06, not 6.

# Your task

Produce the 5-dimension verdict per the output schema. Reference the user's specific numbers above. Cite at least one comparable per dimension. Calibrate conviction honestly. Disagree where warranted. Investor-grade output.`;
}
