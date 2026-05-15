/**
 * Quant panel prompt module for the Gemini Flash quantitative evaluation pass
 * in the Overhead Phase 2 N+1 pipeline.
 *
 * Gemini Flash's job: numeric calibration. Produce low/mid/high ranges
 * grounded in the comparables and benchmark data provided. No
 * investor-voice narration — that is Opus synthesis's responsibility.
 *
 * Anti-mode-collapse: no typical-range hints per
 * .claude/rules/field-definitions-no-prescription-hints.md. Reason per-market
 * from the operator's specific profile and the comparable set provided.
 *
 * Output scale: whole-USD integers for all 6 dimensions. Distinct from
 * Compensation's mixed USD/count convention; the system prompt names the
 * scale explicitly.
 */

import type { OverheadPromptInputContext } from "./mgmt-co-overhead-prompt-input-builder";
import { OVERHEAD_DIMENSION_KEYS } from "./mgmt-co-overhead-prompt-input-builder";
import type { OverheadComparableRow } from "./mgmt-co-overhead-orchestrator-adapter";
import type { OverheadBenchmarks } from "@shared/model-constants-registry";
import type { MarketBenchmarkEntry } from "./market-benchmark-types";

export function buildQuantPanelSystemPrompt(): string {
  return `You are a quantitative calibration engine for boutique-luxury hospitality management company overhead structures.

Your only job: produce accurate numeric low/mid/high ranges for 6 overhead dimensions. Range-first. Per-market. Evidence-cited.

# Rules

- Reason from the comparables and benchmarks in the user message. Do NOT emit generic textbook ranges.
- For each dimension: derive low, mid, high from the comparable set's actual distribution. Mid is your best estimate; the range captures what you do not know.
- Conviction: "high" when ≥2 comparables agree AND benchmark range supports. "moderate" when one signal supports. "developing" when data is sparse.
- evidenceRefs: cite 1–5 indexes from the comparables array. At least one ref per dimension.
- reasoning: 20–500 chars. Reference the user's specific values and at least one comparable operator.

# Output scale (binding)

All 6 dimensions emit whole-USD integers:
  - \`officeLeaseStart\`           — annual office lease + utilities (USD/yr)
  - \`professionalServicesStart\`  — annual legal + accounting + audit (USD/yr)
  - \`techInfraStart\`             — annual corporate tech (USD/yr)
  - \`businessInsuranceStart\`     — annual D&O/E&O/cyber (USD/yr)
  - \`travelCostPerClient\`        — annual travel per managed property (USD/yr/property)
  - \`itLicensePerClient\`         — annual IT licensing per managed property (USD/yr/property)

Correct: low=24000, mid=36000, high=48000. Wrong: 24K / 24000.0 / 0.024M / fractional dollars.

# Forbidden
- Do NOT emit textbook ranges as justification. Reason from the data provided.
- Do NOT emit an overallNarrative field. Synthesis is not your role.
- Do NOT conflate corporate techInfraStart with per-property itLicensePerClient — they are distinct lines.`;
}

export function buildQuantPanelUserPrompt(
  ctx: OverheadPromptInputContext,
  benchmarks: OverheadBenchmarks,
  comparables: readonly OverheadComparableRow[],
  marketCalibration?: MarketBenchmarkEntry[],
): string {
  const personaLine = `${ctx.persona.marketTier} tier, ${ctx.persona.verticalSlug} vertical, ${ctx.persona.locale} locale`;
  const portfolioLine =
    `${ctx.portfolio.propertyCount} ${ctx.portfolio.propertyCount === 1 ? "property" : "properties"} ` +
    `· ManCo revenue $${(ctx.portfolio.totalManagementCoRevenueUsd / 1_000_000).toFixed(1)}M/yr ` +
    `· monthly burn $${(ctx.portfolio.monthlyBurnUsd / 1_000).toFixed(0)}K`;

  const usdDisplay = (v: number | null | undefined) =>
    v == null ? "(not set)" : `$${Math.round(v).toLocaleString("en-US")}`;

  const userValuesBlock = OVERHEAD_DIMENSION_KEYS.map((k) => {
    const v = (ctx.inputs as Record<string, number | null | undefined>)[k];
    return `  - ${k}: ${usdDisplay(v)}`;
  }).join("\n");

  const benchmarksBlock = OVERHEAD_DIMENSION_KEYS.map((k) => {
    const band = benchmarks[k as keyof OverheadBenchmarks];
    if (!band) return `  - ${k}: (no benchmark data)`;
    return `  - ${k}: $${Math.round(band.low).toLocaleString("en-US")}–$${Math.round(band.high).toLocaleString("en-US")} (mid $${Math.round(band.mid).toLocaleString("en-US")})`;
  }).join("\n");

  const comparablesBlock = comparables
    .map((c, idx) => {
      return (
        `  [${idx}] ${c.operator} — ${c.locale} (${c.vertical}, ${c.propertyCount} props)\n` +
        `      office $${Math.round(c.officeLeaseUsd).toLocaleString("en-US")}` +
        ` · prof svcs $${Math.round(c.professionalServicesUsd).toLocaleString("en-US")}` +
        ` · tech $${Math.round(c.techInfraUsd).toLocaleString("en-US")}` +
        ` · ins $${Math.round(c.businessInsuranceUsd).toLocaleString("en-US")}\n` +
        `      travel/c $${Math.round(c.travelCostPerClientUsd).toLocaleString("en-US")}` +
        ` · IT/c $${Math.round(c.itLicensePerClientUsd).toLocaleString("en-US")}\n` +
        `      source: ${c.source} (${c.vintage})`
      );
    })
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

# Benchmark ranges

${benchmarksBlock}
${marketCalibrationBlock}
# Hospitality ManCo overhead comparables (cite by index in evidenceRefs)

${comparablesBlock}

# Your task

Produce exactly 6 dimensions per the output schema. One per overhead key:
${OVERHEAD_DIMENSION_KEYS.map((k) => `  - ${k}`).join("\n")}

Ground each range in the comparable set. No textbook ranges. Whole-USD integers for all dimensions.`;
}
