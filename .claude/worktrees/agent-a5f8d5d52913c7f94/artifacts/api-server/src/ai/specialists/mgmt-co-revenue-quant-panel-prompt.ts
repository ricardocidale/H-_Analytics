/**
 * Quant panel prompt module for the Gemini Flash quantitative evaluation pass
 * in the Revenue G2 N+1 pipeline.
 *
 * Gemini Flash's job: numeric calibration. Produce decimal-fraction low/mid/
 * high ranges grounded in the comparables and benchmark data provided. No
 * investor-voice narration — that is Opus synthesis's responsibility.
 *
 * Anti-mode-collapse: no typical-range hints per
 * .claude/rules/field-definitions-no-prescription-hints.md. Reason per-market
 * from the operator's specific profile and the comparable set provided.
 *
 * Output scale: all 5 revenue keys are DECIMAL FRACTIONS (e.g. 0.06 for 6%).
 * Gemini Flash is more likely than Opus to emit whole numbers — the system
 * prompt's "Output scale" block reproduces the WRONG/RIGHT examples from the
 * synthesis prompt verbatim to keep the contract identical across panels.
 */

import type { RevenuePromptInputContext } from "./mgmt-co-revenue-prompt-input-builder";
import { REVENUE_DIMENSION_KEYS } from "./mgmt-co-revenue-prompt-input-builder";
import type { RevenueComparableRow } from "./mgmt-co-revenue-orchestrator-adapter";
import type { RevenueBenchmarks } from "@shared/constants-revenue-benchmarks";
import type { MarketBenchmarkEntry } from "./market-benchmark-types";

export function buildQuantPanelSystemPrompt(): string {
  return `You are a quantitative calibration engine for boutique-luxury hospitality management company revenue ancillary mix.

Your only job: produce accurate numeric low/mid/high ranges for 5 revenue dimensions. Range-first. Per-market. Evidence-cited.

# Rules

- Reason from the comparables and benchmarks in the user message. Do NOT emit generic textbook ranges.
- For each dimension: derive low, mid, high from the comparable set's actual distribution. Mid is your best estimate; the range captures what you do not know.
- Conviction: "high" when ≥2 comparables agree AND benchmark range supports. "moderate" when one signal supports. "developing" when data is sparse.
- evidenceRefs: cite 1–5 indexes from the comparables array. At least one ref per dimension.
- reasoning: 20–500 chars. Reference the user's specific values and at least one comparable property.

# Output scale — CRITICAL

ALL 5 revenue dimensions use DECIMAL FRACTIONS (not whole-number percentages).
Correct: low=0.06, mid=0.07, high=0.09 (representing 6%–9%)
Wrong:   low=6, mid=7, high=9

Do NOT emit whole numbers for these dimensions. The schema expects values like 0.06, not 6. Every dimension below this rule:
${REVENUE_DIMENSION_KEYS.map((k) => `  - ${k}`).join("\n")}

# Forbidden
- Do NOT emit textbook ranges as justification. Reason from the data provided.
- Do NOT emit an overallNarrative field. Synthesis is not your role.
- Do NOT emit whole-number percentages. Decimal fractions only.`;
}

export function buildQuantPanelUserPrompt(
  ctx: RevenuePromptInputContext,
  benchmarks: RevenueBenchmarks,
  comparables: readonly RevenueComparableRow[],
  marketCalibration?: MarketBenchmarkEntry[],
): string {
  const personaLine = `${ctx.persona.marketTier} tier, ${ctx.persona.verticalSlug} vertical, ${ctx.persona.locale} locale`;
  const portfolioLine =
    `${ctx.portfolio.propertyCount} ${ctx.portfolio.propertyCount === 1 ? "property" : "properties"} ` +
    `· avg stabilized occupancy ${(ctx.portfolio.avgOccupancyRate * 100).toFixed(0)}% ` +
    `· avg ADR $${ctx.portfolio.avgAdr.toFixed(0)}`;

  const pctDisplay = (v: number | null | undefined) =>
    v == null ? "(not set)" : `${(v * 100).toFixed(1)}%  [fraction: ${v.toFixed(4)}]`;

  const userValuesBlock = REVENUE_DIMENSION_KEYS.map((k) => {
    const v = (ctx.inputs as Record<string, number | null | undefined>)[k];
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

# Benchmark ranges (decimal fractions)

${benchmarksBlock}
${marketCalibrationBlock}
# Hotel revenue comparables (cite by index in evidenceRefs)

${comparablesBlock}

# Your task

Produce exactly 5 dimensions per the output schema. One per revenue key:
${REVENUE_DIMENSION_KEYS.map((k) => `  - ${k}`).join("\n")}

Ground each range in the comparable set. No textbook ranges. Decimal fractions only — never whole-number percentages.`;
}
