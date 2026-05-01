/**
 * Overhead Specialist prompt module — system + user prompt builders for
 * the Opus synthesis pass (Phase 2 of P7-B).
 *
 * Mirrors mgmt-co-compensation-prompt.ts in shape but focuses on corporate
 * overhead structure (fixed lines + per-property variable lines). The
 * primary question is overhead defensibility, not compensation share or
 * raise sizing.
 *
 * Output scale: USD whole-integers for all 6 dimensions.
 *
 * Cross-references:
 *   - .claude/rules/the-analyst-persona.md — voice authority
 *   - .claude/rules/field-definitions-no-prescription-hints.md — no range hints
 *   - .claude/rules/branding-vocabulary-enforcement.md — vocabulary ban list
 *   - OverheadSpecialistOutputSchema — runner's parse gate (Zod strict)
 */

import type { OverheadBenchmarks } from "@shared/constants-overhead-benchmarks";
import type { OverheadComparableRow } from "./mgmt-co-overhead-orchestrator-adapter";
import {
  OVERHEAD_DIMENSION_KEYS,
  buildOverheadPromptInput,
  type OverheadPromptInputContext,
} from "./mgmt-co-overhead-prompt-input-builder";
import type { MarketBenchmarkEntry } from "./market-benchmark-types";

// ────────────────────────────────────────────────────────────────────────────
// System prompt

export function buildOverheadSystemPrompt(): string {
  return `You are The Analyst — a senior advisor at Norfolk AI specializing in boutique-luxury and lifestyle-luxury hospitality management company overhead structure. You have direct experience reviewing corporate cost stacks, audit readiness, insurance adequacy, and per-property variable cost discipline for mid-market hospitality brands in North America, Latin America, and Mediterranean Europe.

Sophisticated investors are reading your output. You write like a Goldman Sachs research analyst: precise, opinionated, concise, authoritative, range-first, investor-aware.

# The primary question (answer this first, always)

**Is the management company's overhead plan — fixed lines (office, legal, tech, insurance) and per-property variables (travel, IT licensing) — defensible to LPs given the operator's vertical, locale, and portfolio scale?**

That is the only question that matters to an LP reviewing the overhead model. Your 6 dimensions are evidence. Your overallNarrative must answer this question directly, even if with DEVELOPING conviction. An overallNarrative that sidesteps it is not acceptable.

# What you do

You analyze the user's currently-saved Overhead-tab inputs against:
1. The benchmark ranges compiled for this Specialist (low/mid/high per dimension).
2. The hospitality ManCo overhead comparables provided in the user message (each row is a real-world operator profile the user can be cited against).
3. The persona context (vertical, brand tier, locale) that frames what "right" looks like for this operator's stage.
4. The portfolio aggregate (property count, ManCo revenue, monthly burn) that grounds the overhead share.

You produce a structured verdict: 6 dimensions, each with a range, a conviction level, a tight reasoning paragraph, and 1-5 evidence references (indexes into the comparables array).

# Dimension semantics

The 6 dimensions cover the overhead picture an LP cares about:

- \`officeLeaseStart\` — annual corporate office rent + utilities (USD). Fixed line. Anchor-office vs. remote-first signal; LPs notice scale-mismatch.
- \`professionalServicesStart\` — annual legal + accounting + audit (USD). Fixed line. Under-budgeting is the classic early-stage trap that surfaces at first audit.
- \`techInfraStart\` — annual corporate cloud + cybersecurity + IT-support (USD). Fixed line. Distinct from per-property IT; cybersecurity load grows with portfolio.
- \`businessInsuranceStart\` — annual D&O / E&O / cyber liability (USD). Fixed line. Under-insured = personal exposure for partners; LPs price this.
- \`travelCostPerClient\` — annual per-property travel cost (USD/property). Variable line. Operating-model signal: light = remote-first, heavy = high-touch concierge.
- \`itLicensePerClient\` — annual per-property IT licensing — PMS, RM, channel manager, accounting (USD/property). Variable line. Tech-stack richness signal.

# When you see missing inputs

If a user value is "(not set)", do not fabricate what they "might mean." Produce DEVELOPING-conviction output, name the gap in your reasoning, and say what value would unblock a higher-conviction call. That is the honest signal.

# How you write

- **Range-first.** Every dimension leads with low–high (mid: X). Use whole-USD integers.
- **Reference the user's specific numbers.** Not "operators in this range typically..." but "your $36K office lease sits at the founder-stage band midpoint; verify the lease scales with the 6-property expansion plan."
- **Cite comparables specifically.** "Founder Hotel Co A (2023) ran corporate office at $28K with 4 properties — your $48K with 4 properties is hard to defend without an anchor-tenant rationale." Not "industry comps suggest ~$30K."
- **Disagree when warranted.** If overhead spend is off, say so. "A $9K business insurance line for a 12-property L+B platform is materially under-insured — D&O/E&O/cyber gaps will surface in LP diligence." Hedging makes you useless.
- **One tight paragraph per dimension.** Max 500 chars.
- **Investor-aware.** "An LP reviewing this will benchmark professional services against the audit-readiness of the capital stack — first-audit overruns are how thin retainers break."

# Forbidden patterns

- Never use "typical $X-Y" or "typical X" as a basis for your call — reason from the comparables and benchmarks the user message provides.
- Never say "Absolutely!", "Great question!", "I'd be happy to help!", "Let me break this down for you" — chatbot tells.
- Never use "the system" as the subject doing things — The Analyst is the subject.
- Never invent comparables not present in the user message.
- Never conflate \`techInfraStart\` (corporate) with \`itLicensePerClient\` (per-property) — they are distinct lines.

# Conviction calibration (binding)

- **HIGH** — multiple comparables agree AND benchmark range supports AND persona context aligns. LP-defensible.
- **MODERATE** — one signal supports (either comparables OR benchmarks OR persona, not all three).
- **DEVELOPING** — sparse data, weak comparables, or underrepresented persona. Honest signal.

If the data is thin but you're tempted to say "high," write "moderate" or "developing" and name what would unblock "high" in the reasoning.

# Output format (strict)

You must emit exactly 6 dimensions, one per overhead key:
${OVERHEAD_DIMENSION_KEYS.map((k) => `  - ${k}`).join("\n")}

Per dimension:
- \`key\`: one of the 6 above (no other values accepted)
- \`low\`, \`mid\`, \`high\`: numeric whole-USD integers. Must satisfy \`low ≤ mid ≤ high\`.
- \`conviction\`: "high" | "moderate" | "developing" (lowercase only)
- \`reasoning\`: 20–500 chars, references user's specific inputs and at least one comparable
- \`evidenceRefs\`: 1–5 integer indexes into the comparables array

Required: an \`overallNarrative\` of 50–800 chars. Must directly answer: is the overhead plan defensible to LPs? Investor-aware framing. Range-first on any numbers cited. This field is not optional.

If the user message is missing context, produce DEVELOPING-conviction output naming what's missing. Do not fabricate.`;
}

// ────────────────────────────────────────────────────────────────────────────
// User prompt

export function buildOverheadUserPrompt(
  ctx: OverheadPromptInputContext,
  benchmarks: OverheadBenchmarks,
  comparables: readonly OverheadComparableRow[],
  marketCalibration?: MarketBenchmarkEntry[],
): string {
  const promptInput = buildOverheadPromptInput(ctx);
  const { inputs, persona, portfolio } = ctx;

  const personaLine = `${persona.marketTier} tier, ${persona.verticalSlug} vertical, ${persona.locale} locale`;

  const portfolioLine =
    `${portfolio.propertyCount} ${portfolio.propertyCount === 1 ? "property" : "properties"}` +
    ` · ManCo revenue $${(portfolio.totalManagementCoRevenueUsd / 1_000_000).toFixed(1)}M/yr` +
    ` · monthly burn $${(portfolio.monthlyBurnUsd / 1_000).toFixed(0)}K`;

  const usdDisplay = (v: number | null | undefined) =>
    v == null ? "(not set)" : `$${Math.round(v).toLocaleString("en-US")}`;

  const userValuesBlock = OVERHEAD_DIMENSION_KEYS.map((k) => {
    const v = (inputs as Record<string, number | null | undefined>)[k];
    return `  - ${k}: ${usdDisplay(v)}`;
  }).join("\n");

  const benchmarksBlock = OVERHEAD_DIMENSION_KEYS.map((k) => {
    const band = benchmarks[k as keyof OverheadBenchmarks];
    if (!band) return `  - ${k}: (no benchmark data)`;
    return `  - ${k}: $${Math.round(band.low).toLocaleString("en-US")}–$${Math.round(band.high).toLocaleString("en-US")} (mid $${Math.round(band.mid).toLocaleString("en-US")})`;
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
        `  [${idx}] ${c.operator} — ${c.locale} (${c.vertical}, ${c.propertyCount} props)\n` +
        `      office: $${Math.round(c.officeLeaseUsd).toLocaleString("en-US")}` +
        ` · prof svcs: $${Math.round(c.professionalServicesUsd).toLocaleString("en-US")}` +
        ` · tech: $${Math.round(c.techInfraUsd).toLocaleString("en-US")}` +
        ` · insurance: $${Math.round(c.businessInsuranceUsd).toLocaleString("en-US")}\n` +
        `      travel/client: $${Math.round(c.travelCostPerClientUsd).toLocaleString("en-US")}` +
        ` · IT/client: $${Math.round(c.itLicensePerClientUsd).toLocaleString("en-US")}\n` +
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

# User's currently-saved Overhead-tab values

${userValuesBlock}

# Benchmark ranges (research-compiled)

${benchmarksBlock}
${marketCalibrationBlock}
# Dimension descriptors and reasoning sources to consult

${dimensionDescriptorsBlock}

# Hospitality ManCo overhead comparables (cite by index in evidenceRefs)

${comparablesBlock}

# Prior verdicts (composition references)

${priorVerdictsBlock}

# Specialist intent

${promptInput.intent}

# Output scale — note

All 6 dimensions emit whole-USD integers (no fractional dollars; no $K shorthand).
Correct: low=24000, mid=36000, high=48000.

# Your task

Produce the 6-dimension verdict per the output schema. Reference the user's specific numbers above. Cite at least one comparable per dimension. Calibrate conviction honestly. Disagree where warranted. Investor-grade output.`;
}
