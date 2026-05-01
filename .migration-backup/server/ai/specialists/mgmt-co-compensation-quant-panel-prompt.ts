/**
 * Quant panel prompt module for the Gemini Flash quantitative evaluation pass
 * in the Compensation G3 N+1 pipeline.
 *
 * Gemini Flash's job: numeric calibration. Produce low/mid/high ranges
 * grounded in the comparables and benchmark data provided. No
 * investor-voice narration — that is Opus synthesis's responsibility.
 *
 * Anti-mode-collapse: no typical-range hints per
 * .claude/rules/field-definitions-no-prescription-hints.md. Reason per-market
 * from the operator's specific profile and the comparable set provided.
 *
 * Output scale: USD for partner-comp / staff-salary, whole-number counts
 * for partner-count / Tier-3 FTE. Distinct from Revenue's
 * decimal-fraction-only convention; the system prompt names the per-key scale.
 */

import type { CompensationPromptInputContext } from "./mgmt-co-compensation-prompt-input-builder";
import { COMPENSATION_DIMENSION_KEYS } from "./mgmt-co-compensation-prompt-input-builder";
import type { CompensationComparableRow } from "./mgmt-co-compensation-orchestrator-adapter";
import type { CompensationBenchmarks } from "@shared/constants-compensation-benchmarks";
import type { MarketBenchmarkEntry } from "./market-benchmark-types";

export function buildQuantPanelSystemPrompt(): string {
  return `You are a quantitative calibration engine for boutique-luxury hospitality management company compensation plans.

Your only job: produce accurate numeric low/mid/high ranges for 5 compensation dimensions. Range-first. Per-market. Evidence-cited.

# Rules

- Reason from the comparables and benchmarks in the user message. Do NOT emit generic textbook ranges.
- For each dimension: derive low, mid, high from the comparable set's actual distribution. Mid is your best estimate; the range captures what you do not know.
- Conviction: "high" when ≥2 comparables agree AND benchmark range supports. "moderate" when one signal supports. "developing" when data is sparse.
- evidenceRefs: cite 1–5 indexes from the comparables array. At least one ref per dimension.
- reasoning: 20–500 chars. Reference the user's specific values and at least one comparable operator.

# Output scale (binding)

Per-dimension numeric scale:
  - \`partnerCompYear1\`, \`partnerCompYear10\`, \`staffSalary\` — whole-USD integers (e.g. 540000, not 540 or 540K)
  - \`partnerCountYear1\` — integer count (e.g. 3, not 3.5)
  - \`staffTier3Fte\` — whole-number FTE count (e.g. 7; .5 increments are NOT used at the synthesis level)

# Forbidden
- Do NOT emit textbook ranges as justification. Reason from the data provided.
- Do NOT emit an overallNarrative field. Synthesis is not your role.
- Do NOT emit fractional headcount or fractional FTE; whole numbers only.`;
}

export function buildQuantPanelUserPrompt(
  ctx: CompensationPromptInputContext,
  benchmarks: CompensationBenchmarks,
  comparables: readonly CompensationComparableRow[],
  marketCalibration?: MarketBenchmarkEntry[],
): string {
  const personaLine = `${ctx.persona.marketTier} tier, ${ctx.persona.verticalSlug} vertical, ${ctx.persona.locale} locale`;
  const portfolioLine =
    `${ctx.portfolio.propertyCount} ${ctx.portfolio.propertyCount === 1 ? "property" : "properties"} ` +
    `· ManCo revenue $${(ctx.portfolio.totalManagementCoRevenueUsd / 1_000_000).toFixed(1)}M/yr ` +
    `· monthly burn $${(ctx.portfolio.monthlyBurnUsd / 1_000).toFixed(0)}K`;

  const usdDisplay = (v: number | null | undefined) =>
    v == null ? "(not set)" : `$${Math.round(v).toLocaleString("en-US")}`;
  const countDisplay = (v: number | null | undefined) =>
    v == null ? "(not set)" : `${v.toFixed(0)}`;

  const userValuesBlock = COMPENSATION_DIMENSION_KEYS.map((k) => {
    const v = (ctx.inputs as Record<string, number | null | undefined>)[k];
    const display =
      k === "partnerCountYear1" || k === "staffTier3Fte" ? countDisplay(v) : usdDisplay(v);
    return `  - ${k}: ${display}`;
  }).join("\n");

  const benchmarksBlock = COMPENSATION_DIMENSION_KEYS.map((k) => {
    const band = benchmarks[k as keyof CompensationBenchmarks];
    if (!band) return `  - ${k}: (no benchmark data)`;
    const display =
      k === "partnerCountYear1" || k === "staffTier3Fte"
        ? `${band.low.toFixed(0)}–${band.high.toFixed(0)} (mid ${band.mid.toFixed(0)})`
        : `$${Math.round(band.low).toLocaleString("en-US")}–$${Math.round(band.high).toLocaleString("en-US")}` +
          ` (mid $${Math.round(band.mid).toLocaleString("en-US")})`;
    return `  - ${k}: ${display}`;
  }).join("\n");

  const comparablesBlock = comparables
    .map((c, idx) => {
      return (
        `  [${idx}] ${c.operator} — ${c.locale} (${c.vertical}, ${c.propertyCount} props)\n` +
        `      Y1 mgmt comp $${Math.round(c.partnerCompYear1Usd).toLocaleString("en-US")}` +
        ` · Y10 $${Math.round(c.partnerCompYear10Usd).toLocaleString("en-US")}` +
        ` · ${c.partnerCountYear1}p` +
        ` · staff $${Math.round(c.staffSalaryUsd).toLocaleString("en-US")}` +
        ` · T3 ${c.staffTier3Fte} FTE\n` +
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

# User's currently-saved Compensation-tab values

${userValuesBlock}

# Benchmark ranges

${benchmarksBlock}
${marketCalibrationBlock}
# Hospitality ManCo compensation comparables (cite by index in evidenceRefs)

${comparablesBlock}

# Your task

Produce exactly 5 dimensions per the output schema. One per compensation key:
${COMPENSATION_DIMENSION_KEYS.map((k) => `  - ${k}`).join("\n")}

Ground each range in the comparable set. No textbook ranges. USD integers for compensation/salary; whole-number counts for headcount/FTE.`;
}
