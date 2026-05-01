/**
 * Market panel prompt module for the Claude Sonnet qualitative evaluation pass
 * in the Overhead Phase 2 N+1 pipeline.
 *
 * Sonnet's job: LP-perception dynamics, audit-readiness signals, insurance-
 * adequacy sentiment, retainer-discipline signals. Produces sentiment and
 * directional bias signals (increase / decrease / hold) that enrich the
 * Opus synthesis prompt. Does NOT produce numeric ranges — the quant panel
 * owns those.
 */

import type { OverheadPromptInputContext } from "./mgmt-co-overhead-prompt-input-builder";
import { OVERHEAD_DIMENSION_KEYS } from "./mgmt-co-overhead-prompt-input-builder";
import type { OverheadComparableRow } from "./mgmt-co-overhead-orchestrator-adapter";

export function buildMarketPanelSystemPrompt(): string {
  return `You are a market-intelligence panel for boutique-luxury hospitality management company overhead structures.

Your job: produce qualitative market signals for 6 overhead dimensions — LP sentiment, audit-readiness / insurance-adequacy / retainer-discipline risk flags, and directional bias. A separate quantitative panel produces numeric ranges; you do NOT produce numbers.

# Your output per dimension

For each of the 6 overhead keys:
- marketSentiment: overall LP sentiment for this dimension given the operator's vertical + locale ("bullish" | "neutral" | "cautious")
- lpRiskFlags: 0–4 specific risk phrases an LP will raise about this dimension (e.g. "Office lease scale-mismatch — anchor-office spend ahead of property count", "Under-insured D&O leaves partners personally exposed at this stage"). Empty array is valid when no flags apply. Each flag ≤200 chars.
- proposedBias: whether the quantitative range likely needs upward or downward adjustment given LP-perception ("increase" | "decrease" | "hold" | "insufficient-data")
- reasoning: 20–400 chars. Reference the operator's specific context and at least one LP-perception or operator-stage dynamic.

# Focus
- Office lease posture: anchor-office vs. remote-first; scale-mismatch with portfolio size
- Audit-readiness: under-budgeting professional services is the classic early-stage trap; first-audit overruns
- Tech infrastructure: corporate cybersecurity + privacy compliance load growing with portfolio scale
- Insurance adequacy: D&O / E&O / cyber thresholds for partner personal exposure; under-insured stacks
- Travel cadence: operating model signal (remote-first vs. high-touch concierge); LP perception by vertical
- IT licensing posture: tech-stack richness expected for boutique-luxury (PMS, RM, channel manager, accounting integration)

# Forbidden
- Do NOT emit numeric ranges — that is not your job
- Do NOT use "the system" as subject
- Do NOT fabricate operator-comparable data not referenced in the user message`;
}

export function buildMarketPanelUserPrompt(
  ctx: OverheadPromptInputContext,
  comparables: readonly OverheadComparableRow[],
): string {
  const personaLine = `${ctx.persona.marketTier} tier, ${ctx.persona.verticalSlug} vertical, ${ctx.persona.locale} locale`;

  const usdDisplay = (v: number | null | undefined) =>
    v == null ? "(not set)" : `$${Math.round(v).toLocaleString("en-US")}`;

  const userValuesBlock = OVERHEAD_DIMENSION_KEYS.map((k) => {
    const v = (ctx.inputs as Record<string, number | null | undefined>)[k];
    return `  - ${k}: ${usdDisplay(v)}`;
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

  return `# Persona

${personaLine}

# User's currently-saved Overhead-tab values

${userValuesBlock}

# Hospitality ManCo overhead comparables (reference by operator name in reasoning)

${comparablesBlock}

# Your task

Produce exactly 6 market panel dimensions per the output schema. One per overhead key:
${OVERHEAD_DIMENSION_KEYS.map((k) => `  - ${k}`).join("\n")}

Focus on LP-perception, audit-readiness, insurance-adequacy, retainer-discipline, and directional bias signals for this operator's profile.
Do not produce numeric ranges.`;
}
