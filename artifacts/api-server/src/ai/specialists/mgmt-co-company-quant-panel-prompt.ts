/**
 * Quant panel prompt module for the Gemini Flash quantitative evaluation pass
 * in the Company Phase 2 N+1 pipeline.
 *
 * Gemini Flash's job: numeric calibration. Produce low/mid/high ranges
 * grounded in the comparables and benchmark data provided. No investor-voice
 * narration — that is Opus synthesis's responsibility.
 *
 * Anti-mode-collapse: no typical-range hints per
 * .claude/rules/field-definitions-no-prescription-hints.md. Reason per-market
 * from the operator's specific profile and the comparable set provided.
 *
 * Output scale: fractions (0.08 = 8%) for all 4 dimensions. The system
 * prompt is explicit to prevent integer/percentage emission.
 */

import type { CompanyPromptInputContext } from "./mgmt-co-company-prompt-input-builder";
import { COMPANY_DIMENSION_KEYS } from "./mgmt-co-company-prompt-input-builder";
import type { CompanyComparableRow } from "./mgmt-co-company-orchestrator-adapter";
import type { CompanyBenchmarks } from "@shared/constants-company-benchmarks";
import type { MarketBenchmarkEntry } from "./market-benchmark-types";

export function buildQuantPanelSystemPrompt(): string {
  return `You are a quantitative calibration engine for boutique-luxury hospitality management company fee structures and financial defaults.

Your only job: produce accurate numeric low/mid/high ranges for 4 company dimensions. Range-first. Per-market. Evidence-cited.

# Rules

- Reason from the comparables and benchmarks in the user message. Do NOT emit generic textbook ranges.
- For each dimension: derive low, mid, high from the comparable set's actual distribution. Mid is your best estimate; the range captures what you do not know.
- Conviction: "high" when ≥2 comparables agree AND benchmark range supports. "moderate" when one signal supports. "developing" when data is sparse.
- evidenceRefs: cite 1–5 indexes from the comparables array. At least one ref per dimension.
- reasoning: 20–500 chars. Reference the user's specific values and at least one comparable operator.

# Output scale (binding — CRITICAL)

All 4 dimensions emit FRACTIONS (NOT percentages, NOT integers):
  - \`baseManagementFee\`      — fraction of total property revenue (e.g. 0.08 = 8%)
  - \`incentiveManagementFee\` — fraction of Gross Operating Profit (e.g. 0.10 = 10%)
  - \`companyTaxRate\`         — effective combined tax rate as fraction (e.g. 0.26 = 26%)
  - \`costOfEquity\`           — DCF hurdle / WACC Re as fraction (e.g. 0.18 = 18%)

Correct: low=0.06, mid=0.08, high=0.10.
WRONG: low=6, mid=8, high=10 (integers — forbidden).
WRONG: low=6%, mid=8%, high=10% (percentage strings — forbidden).

# Forbidden
- Do NOT emit textbook ranges as justification. Reason from the data provided.
- Do NOT emit an overallNarrative field. Synthesis is not your role.
- Do NOT emit integer percentages (6, 8, 10) — always emit decimal fractions (0.06, 0.08, 0.10).`;
}

export function buildQuantPanelUserPrompt(
  ctx: CompanyPromptInputContext,
  benchmarks: CompanyBenchmarks,
  comparables: readonly CompanyComparableRow[],
  marketCalibration?: MarketBenchmarkEntry[],
): string {
  const personaLine = `${ctx.persona.marketTier} tier, ${ctx.persona.verticalSlug} vertical, ${ctx.persona.locale} locale`;
  const portfolioLine =
    `${ctx.portfolio.propertyCount} ${ctx.portfolio.propertyCount === 1 ? "property" : "properties"} ` +
    `· ManCo revenue $${(ctx.portfolio.totalManagementCoRevenueUsd / 1_000_000).toFixed(1)}M/yr ` +
    `· monthly burn $${(ctx.portfolio.monthlyBurnUsd / 1_000).toFixed(0)}K`;

  const pct = (v: number | null | undefined) =>
    v == null ? "(not set)" : `${(v * 100).toFixed(1)}%`;

  const userValuesBlock = COMPANY_DIMENSION_KEYS.map((k) => {
    const v = (ctx.inputs as Record<string, number | null | undefined>)[k];
    return `  - ${k}: ${pct(v)}`;
  }).join("\n");

  const benchmarksBlock = COMPANY_DIMENSION_KEYS.map((k) => {
    const band = benchmarks[k as keyof CompanyBenchmarks];
    if (!band) return `  - ${k}: (no benchmark data)`;
    return `  - ${k}: ${(band.low * 100).toFixed(1)}%–${(band.high * 100).toFixed(1)}% (mid ${(band.mid * 100).toFixed(1)}%)`;
  }).join("\n");

  const p = (n: number) => `${(n * 100).toFixed(1)}%`;
  const comparablesBlock = comparables
    .map((c, idx) => {
      return (
        `  [${idx}] ${c.operator} — ${c.locale} (${c.vertical}, ${c.propertyCount} props)\n` +
        `      baseFee ${p(c.baseManagementFee)}` +
        ` · incentiveFee ${p(c.incentiveManagementFee)}` +
        ` · taxRate ${p(c.companyTaxRate)}` +
        ` · Re ${p(c.costOfEquity)}\n` +
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

# User's currently-saved Company-tab values

${userValuesBlock}

# Benchmark ranges

${benchmarksBlock}
${marketCalibrationBlock}
# Hospitality ManCo financial comparables (cite by index in evidenceRefs)

${comparablesBlock}

# Your task

Produce exactly 4 dimensions per the output schema. One per company key:
${COMPANY_DIMENSION_KEYS.map((k) => `  - ${k}`).join("\n")}

Ground each range in the comparable set. No textbook ranges. FRACTIONS for all dimensions (not integers, not % strings).`;
}
