/**
 * Quant panel prompt module for the Gemini Flash quantitative evaluation pass
 * in the G6-P2 N+1 pipeline.
 *
 * Gemini Flash's job: numeric calibration. Produce low/mid/high ranges
 * grounded in the comparables and benchmark data provided. No investor-voice
 * narration — that is Opus synthesis's responsibility.
 *
 * Anti-mode-collapse: no typical-range hints per
 * .claude/rules/field-definitions-no-prescription-hints.md. Reason per-market
 * from the operator's specific profile and the comparable set provided.
 */

import type { FundingPromptInputContext } from "./mgmt-co-funding-prompt-input-builder";
import { FUNDING_DIMENSION_KEYS } from "./mgmt-co-funding-prompt-input-builder";
import type { ComparableRow } from "./mgmt-co-funding-orchestrator-adapter";
import type { AnalystWatchdogBenchmarks } from "@shared/schema";
import type { MarketBenchmarkEntry } from "./market-benchmark-types";

export function buildQuantPanelSystemPrompt(): string {
  return `You are a quantitative calibration engine for boutique-luxury hospitality management company capital raises.

Your only job: produce accurate numeric low/mid/high ranges for 5 funding dimensions. Range-first. Per-market. Evidence-cited.

# Rules

- Reason from the comparables and benchmarks in the user message. Do NOT emit generic textbook ranges.
- For each dimension: derive low, mid, high from the comparable set's actual distribution. Mid is your best estimate; the range captures what you do not know.
- Conviction: "high" when ≥2 comparables agree AND benchmark range supports. "moderate" when one signal supports. "developing" when data is sparse.
- evidenceRefs: cite 1–5 indexes from the comparables array. At least one ref per dimension.
- reasoning: 20–500 chars. Reference the user's specific values and at least one comparable operator.

# Output scale (binding)
- "mo" dimensions (runwayBufferMonths, trancheGapMonths, revenueRampDelayMonths): whole months (e.g. 12, not 0.12)
- "%" dimensions (sizingOvershootPct, burnFlexDownPct): decimal fractions (e.g. 0.18 for 18%, not 18)

# Forbidden
- Do NOT emit textbook ranges as justification. Reason from the data provided.
- Do NOT emit an overallNarrative field. Synthesis is not your role.`;
}

export function buildQuantPanelUserPrompt(
  ctx: FundingPromptInputContext,
  benchmarks: AnalystWatchdogBenchmarks,
  comparables: readonly ComparableRow[],
  marketCalibration?: MarketBenchmarkEntry[],
): string {
  const personaLine = `${ctx.persona.marketTier} tier, ${ctx.persona.verticalSlug} vertical, ${ctx.persona.locale} locale`;
  const portfolioLine =
    `${ctx.portfolio.propertyCount} ${ctx.portfolio.propertyCount === 1 ? "property" : "properties"} ` +
    `· $${(ctx.portfolio.totalRaiseNeedUsd / 1_000_000).toFixed(1)}M total raise need ` +
    `· ${ctx.portfolio.runwayNeedMonths.toFixed(0)}-month modeled runway need`;

  const userValuesBlock = FUNDING_DIMENSION_KEYS.map((k) => {
    const v = ctx.inputs[k];
    return `  - ${k}: ${v == null ? "(not set)" : formatQuantValue(k, v)}`;
  }).join("\n");

  const benchmarksBlock = FUNDING_DIMENSION_KEYS.map((k) => {
    const low = benchmarks[`${k}Low` as keyof AnalystWatchdogBenchmarks];
    const mid = benchmarks[`${k}Mid` as keyof AnalystWatchdogBenchmarks];
    const high = benchmarks[`${k}High` as keyof AnalystWatchdogBenchmarks];
    return `  - ${k}: ${formatQuantValue(k, Number(low))}–${formatQuantValue(k, Number(high))} (mid ${formatQuantValue(k, Number(mid))})`;
  }).join("\n");

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

# User's currently-saved Funding-tab values

${userValuesBlock}

# Benchmark ranges

Source: ${benchmarks.refreshedBy ?? "internal benchmark snapshot"}${benchmarks.lastRefreshedAt ? ` (lastRefreshed ${new Date(benchmarks.lastRefreshedAt).toISOString().slice(0, 10)})` : ""}

${benchmarksBlock}
${marketCalibrationBlock}
# LP comparables (cite by index in evidenceRefs)

${comparablesBlock}

# Your task

Produce exactly 5 dimensions per the output schema. One per funding key:
${FUNDING_DIMENSION_KEYS.map((k) => `  - ${k}`).join("\n")}

Ground each range in the comparable set. No textbook ranges.`;
}

function formatQuantValue(key: string, value: number): string {
  if (
    key === "runwayBufferMonths" ||
    key === "trancheGapMonths" ||
    key === "revenueRampDelayMonths"
  ) {
    return `${value.toFixed(0)}mo`;
  }
  if (key === "sizingOvershootPct" || key === "burnFlexDownPct") {
    return `${(value * 100).toFixed(1)}%`;
  }
  return String(value);
}
