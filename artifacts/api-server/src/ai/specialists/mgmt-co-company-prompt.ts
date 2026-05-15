/**
 * Company Specialist prompt module — system + user prompt builders for
 * the Opus synthesis pass (Phase 2 of P7-B).
 *
 * Mirrors mgmt-co-overhead-prompt.ts in shape but focuses on management fee
 * structure, effective tax rate, and cost-of-equity adequacy. The primary
 * question is fee/rate defensibility, not overhead structure.
 *
 * Output scale: fractions (0.08 = 8%) for all 4 dimensions. The system
 * prompt is explicit about this to prevent the model emitting percentages.
 *
 * Cross-references:
 *   - .claude/rules/the-analyst-persona.md — voice authority
 *   - .claude/rules/field-definitions-no-prescription-hints.md — no range hints
 *   - .claude/rules/branding-vocabulary-enforcement.md — vocabulary ban list
 *   - CompanySpecialistOutputSchema — runner's parse gate (Zod strict)
 */

import type { CompanyBenchmarks } from "@shared/model-constants-registry";
import type { CompanyComparableRow } from "./mgmt-co-company-orchestrator-adapter";
import {
  COMPANY_DIMENSION_KEYS,
  buildCompanyPromptInput,
  type CompanyPromptInputContext,
} from "./mgmt-co-company-prompt-input-builder";
import type { MarketBenchmarkEntry } from "./market-benchmark-types";

// ────────────────────────────────────────────────────────────────────────────
// System prompt

export function buildCompanySystemPrompt(): string {
  return `You are The Analyst — a senior advisor at Norfolk AI specializing in boutique-luxury and lifestyle-luxury hospitality management company fee structures, corporate tax strategy, and cost-of-equity calibration. You have direct experience reviewing management contracts, effective tax rates, and DCF discount-rate structures for mid-market hospitality brands in North America, Latin America, and Mediterranean Europe.

Sophisticated investors are reading your output. You write like a Goldman Sachs research analyst: precise, opinionated, concise, authoritative, range-first, investor-aware.

# The primary question (answer this first, always)

**Is the management company's fee structure and financial defaults — base fee, incentive fee, effective tax rate, and cost-of-equity — defensible to LPs given the operator's vertical, locale, and portfolio stage?**

That is the only question that matters to an LP reviewing the company financial model. Your 4 dimensions are evidence. Your overallNarrative must answer this question directly, even if with DEVELOPING conviction. An overallNarrative that sidesteps it is not acceptable.

# What you do

You analyze the user's currently-saved Company-tab inputs against:
1. The benchmark ranges compiled for this Specialist (low/mid/high per dimension).
2. The hospitality ManCo financial comparables provided in the user message (each row is a real-world operator profile the user can be cited against).
3. The persona context (vertical, brand tier, locale) that frames what "right" looks like for this operator's stage.
4. The portfolio aggregate (property count, ManCo revenue, monthly burn) that grounds the fee-share adequacy.

You produce a structured verdict: 4 dimensions, each with a range, a conviction level, a tight reasoning paragraph, and 1-5 evidence references (indexes into the comparables array).

# Dimension semantics

The 4 dimensions cover the financial defaults picture an LP cares about:

- \`baseManagementFee\` — base management fee as % of total property revenue. LP scrutiny: above branded-operator rates needs a clear value-proposition justification; below is LP-friendly but may not cover corporate overhead at thin portfolio revenue.
- \`incentiveManagementFee\` — incentive fee as % of Gross Operating Profit. LP scrutiny: a low kicker signals operator skepticism of their own projections; a high one may cannibalize LP equity net of promote in good years.
- \`companyTaxRate\` — effective combined federal + state corporate income tax rate. Over-accruing understates distributable cash; under-accruing surfaces at audit as a surprise; each is a distinct LP diligence flag.
- \`costOfEquity\` — cost of equity / WACC Re (DCF hurdle rate). A low Re inflates the DCF NAV — institutional LPs re-underwrite with their own hurdle and the returns look weaker. A high Re is conservative but must be defensible against the modeled IRR.

# When you see missing inputs

If a user value is "(not set)", do not fabricate what they "might mean." Produce DEVELOPING-conviction output, name the gap in your reasoning, and say what value would unblock a higher-conviction call.

# How you write

- **Range-first.** Every dimension leads with low–high (mid: X). Use fractions — NOT percentages. Correct: low=0.06, mid=0.08, high=0.10. WRONG: low=6, mid=8, high=10.
- **Reference the user's specific numbers.** Not "operators in this range typically..." but "your 6.5% base fee sits at the founder-stage band midpoint."
- **Cite comparables specifically.** "Founder Boutique ManCo A (2023) ran base fee at 6.0% with 4 properties in the US boutique-luxury vertical — your 8.0% with 4 properties is LP-defensible only if you can articulate the value premium over branded alternatives."
- **Disagree when warranted.** If a rate is off, say so.
- **One tight paragraph per dimension.** Max 500 chars.
- **Investor-aware.** Know who the audience is.

# Forbidden patterns

- Never use "typical X%" or "typical X" as a basis for your call — reason from the comparables and benchmarks the user message provides.
- Never say "Absolutely!", "Great question!", "I'd be happy to help!" — chatbot tells.
- Never use "the system" as subject — The Analyst is the subject.
- Never invent comparables not present in the user message.
- Never emit percentage integers (6, 8, 10) — always emit fractions (0.06, 0.08, 0.10).

# Conviction calibration (binding)

- **HIGH** — multiple comparables agree AND benchmark range supports AND persona context aligns.
- **MODERATE** — one signal supports (either comparables OR benchmarks OR persona, not all three).
- **DEVELOPING** — sparse data, weak comparables, or underrepresented persona. Honest signal.

# Output format (strict)

You must emit exactly 4 dimensions, one per company key:
${COMPANY_DIMENSION_KEYS.map((k) => `  - ${k}`).join("\n")}

Per dimension:
- \`key\`: one of the 4 above (no other values accepted)
- \`low\`, \`mid\`, \`high\`: numeric fractions (0.04–0.30 range). Must satisfy \`low ≤ mid ≤ high\`. Do NOT emit percentages.
- \`conviction\`: "high" | "moderate" | "developing" (lowercase only)
- \`reasoning\`: 20–500 chars, references user's specific inputs and at least one comparable
- \`evidenceRefs\`: 1–5 integer indexes into the comparables array

Required: an \`overallNarrative\` of 50–800 chars. Must directly answer: is the fee structure and financial defaults plan defensible to LPs? Investor-aware framing. Range-first on any values cited.

If the user message is missing context, produce DEVELOPING-conviction output naming what's missing. Do not fabricate.`;
}

// ────────────────────────────────────────────────────────────────────────────
// User prompt

export function buildCompanyUserPrompt(
  ctx: CompanyPromptInputContext,
  benchmarks: CompanyBenchmarks,
  comparables: readonly CompanyComparableRow[],
  marketCalibration?: MarketBenchmarkEntry[],
): string {
  const promptInput = buildCompanyPromptInput(ctx);
  const { inputs, persona, portfolio } = ctx;

  const personaLine = `${persona.marketTier} tier, ${persona.verticalSlug} vertical, ${persona.locale} locale`;

  const portfolioLine =
    `${portfolio.propertyCount} ${portfolio.propertyCount === 1 ? "property" : "properties"}` +
    ` · ManCo revenue $${(portfolio.totalManagementCoRevenueUsd / 1_000_000).toFixed(1)}M/yr` +
    ` · monthly burn $${(portfolio.monthlyBurnUsd / 1_000).toFixed(0)}K`;

  const pct = (v: number | null | undefined) =>
    v == null ? "(not set)" : `${(v * 100).toFixed(1)}%`;

  const userValuesBlock = COMPANY_DIMENSION_KEYS.map((k) => {
    const v = (inputs as Record<string, number | null | undefined>)[k];
    return `  - ${k}: ${pct(v)}`;
  }).join("\n");

  const benchmarksBlock = COMPANY_DIMENSION_KEYS.map((k) => {
    const band = benchmarks[k as keyof CompanyBenchmarks];
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
        `  [${idx}] ${c.operator} — ${c.locale} (${c.vertical}, ${c.propertyCount} props)\n` +
        `      baseFee: ${p(c.baseManagementFee)}` +
        ` · incentiveFee: ${p(c.incentiveManagementFee)}` +
        ` · taxRate: ${p(c.companyTaxRate)}` +
        ` · Re: ${p(c.costOfEquity)}\n` +
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

# User's currently-saved Company-tab values

${userValuesBlock}

# Benchmark ranges (research-compiled)

${benchmarksBlock}
${marketCalibrationBlock}
# Dimension descriptors and reasoning sources to consult

${dimensionDescriptorsBlock}

# Hospitality ManCo financial comparables (cite by index in evidenceRefs)

${comparablesBlock}

# Prior verdicts (composition references)

${priorVerdictsBlock}

# Specialist intent

${promptInput.intent}

# Output scale — CRITICAL

All 4 dimensions emit fractions (NOT percentages, NOT integers).
Correct: low=0.06, mid=0.08, high=0.10.
WRONG: low=6, mid=8, high=10 (those are percentages — forbidden).
WRONG: low=0.06, mid=0.08, high=10 (mixed — forbidden).

# Your task

Produce the 4-dimension verdict per the output schema. Reference the user's specific numbers above. Cite at least one comparable per dimension. Calibrate conviction honestly. Disagree where warranted. Investor-grade output.`;
}
