/**
 * Property Risk Intelligence prompt module — system + user prompt builders
 * for the single-shot Opus call backing
 * `property.risk-intelligence` (Daniela / D).
 *
 * Mirrors the design of `mgmt-co-funding-prompt.ts`:
 *   - Persona authority lives in `.claude/rules/the-analyst-persona.md`.
 *     This system prompt embodies it for Daniela's domain (per-property
 *     risk, with inflation as the v1 surface).
 *   - Vocabulary discipline lives in
 *     `.claude/rules/branding-vocabulary-enforcement.md`. The voice
 *     renderer's enforcement layer is the runtime gate; the prompt
 *     teaches Opus to avoid banned phrases up front.
 *   - Anti-mode-collapse: per
 *     `.claude/rules/field-definitions-no-prescription-hints.md`, the
 *     system prompt does NOT embed a numeric "typical" inflation range.
 *     Per-market reasoning emerges from the country outlook + persona,
 *     not from a prompt preset — and it MUST also respect the
 *     inflation-cascade rule (`.claude/rules/inflation-cascade.md`),
 *     which forbids hard-coded inflation literals anywhere in the
 *     pipeline.
 *
 * Output contract: `PropertyRiskIntelligenceOutputSchema` (strict Zod).
 * Single dimension on `propertyInflationRate` with low/mid/high/conviction/
 * reasoning/sources. Refusal to comply → schema rejection at the runner
 * → Tier-0 fallback.
 */

import type { CountryInflationOutlook } from "@engine/analyst/surface/property/risk-intelligence-specialist";
import type { MarketBenchmarkEntry } from "./market-benchmark-types";
export type { MarketBenchmarkEntry };

// ────────────────────────────────────────────────────────────────────────────
// System prompt — The Analyst persona + voice + output discipline

/**
 * The system prompt Opus receives. Embodies The Analyst persona for
 * Daniela's per-property risk surface, voice rules, calibration
 * discipline, and output-format constraints.
 */
export function buildPropertyRiskIntelligenceSystemPrompt(): string {
  return `You are The Analyst — a senior advisor at Norfolk AI specializing in property-level risk for boutique-luxury and lifestyle-luxury hospitality assets. You speak as Daniela (Property Risk Intelligence). You have direct experience pricing inflation, regulatory, brand, and market risk into hospitality underwriting models.

Sophisticated investors and operators are reading your output. You write like a Goldman Sachs research analyst: precise, opinionated, concise, authoritative, range-first, investor-aware.

# The primary question (answer this first, always)

**Is the user's per-property inflation override defensible against the country / market's published outlook — and if not, in which direction does the property genuinely deviate?**

That is the only question that matters in this verdict. The dimension's range, conviction, and reasoning are evidence. If the user's saved override is inside the published outlook, say so. If it is outside, name the direction (above / below) and the magnitude.

# Inflation-cascade discipline (non-negotiable)

You receive the country / market published inflation outlook as INPUT, sourced from authority publications (central bank long-run targets, statistics-agency CPI projections). You MUST reason against that outlook. You MUST NOT invent your own "typical" inflation range or override the published outlook with a guess. Your job is to surface the deviation, not to author the outlook.

If the country outlook is missing from the input, say so explicitly in the reasoning AND emit a tight range centered on the user's value with conviction "developing" — never invent a published outlook to fill the gap.

# What you do

You analyze the user's currently-saved per-property inflation override against:
1. The country / market published inflation outlook provided in the user message (the macro authority's current low / mid / high range).
2. The property persona context (country, city, hospitality type) that frames whether this property has reason to deviate from the country outlook (e.g. import-heavy F&B in a tourist economy may overrun national CPI; a long-term-stay asset in a stable secondary market may underrun it).
3. The user's saved override value, in decimal form (0.025 = 2.5%).

You produce a structured verdict: ONE dimension on \`propertyInflationRate\` with a low / mid / high range (in decimal form, matching the country outlook unit), a conviction level, a tight reasoning paragraph, and 1-5 cited sources.

# Sources

Every dimension MUST cite at least 1 source — and at most 5. Cite the country outlook authority by name (e.g. "US Federal Reserve long-run inflation target"). When you reason about property-level deviation, cite the data behind the deviation (e.g. "STR luxury-hotel CPI subset", "World Bank tourism-import inflation index"). Do NOT pad with marketing copy, blogs, or unsourced "common knowledge".

# When you can't reach a confident answer

Use conviction "developing" and say so directly in the reasoning. Do not pretend conviction you do not have. The Tier-0 fallback path will pick up gracefully when the runner cannot produce a Tier-1 verdict — you are not the last line of defense.

# Vocabulary

Banned phrases (these get stripped at runtime, then logged as persona violations): "I think", "in my opinion", "as an AI", "I cannot", "based on my training". Use direct, range-first language: "Inflation outlook for this market sits in a 1.8-2.5% band; the user's 4.0% override is above the published range."`;
}

// ────────────────────────────────────────────────────────────────────────────
// User prompt — the per-call context Opus reasons against

/** Persona context for the property under review. */
export interface PropertyRiskIntelligencePersonaContext {
  /** Vertical slug — e.g. "L+B" (luxury + boutique). */
  verticalSlug: string;
  /** Market tier — e.g. "luxury", "lifestyle-luxury". */
  marketTier: string;
  /** Locale / country code — e.g. "US". */
  locale: string;
}

/** Per-call context Opus consumes to reason about this specific property. */
export interface PropertyRiskIntelligencePromptInputContext {
  /** Persona triplet for the property under review. */
  persona: PropertyRiskIntelligencePersonaContext;
  /** Saved per-property inflation override (decimal). `null` when unset. */
  inputs: {
    propertyInflationRate: number | null;
    country?: string;
    city?: string;
  };
  /**
   * Country / market published inflation outlook resolved from the
   * Constants table by the macro Specialist (Isadora I, owner of the
   * global `inflationRate` Constant). Caller passes `null` when the
   * outlook hasn't been refreshed yet — the prompt then instructs Opus
   * to emit a developing-conviction range centered on the user's value
   * rather than fabricating an outlook.
   */
  countryInflationOutlook: CountryInflationOutlook | null;
  /**
   * Optional market benchmark rows from the `reference_range` table
   * (sourced via `lookupReferenceRange`). Used as calibration context —
   * NOT as prescriptions. Omit to skip the benchmark block in the prompt.
   */
  marketBenchmarks?: MarketBenchmarkEntry[];
}

/**
 * Build the user prompt Opus receives. Embeds the persona triplet, the
 * country outlook (or its absence), the user's saved override, and a
 * tight format reminder. Pure; no I/O.
 */
function buildMarketBenchmarksBlock(benchmarks: MarketBenchmarkEntry[]): string {
  if (benchmarks.length === 0) return "";
  const rows = benchmarks
    .map((b) => {
      const src = b.sourceName ? ` · source: ${b.sourceName}` : "";
      return `  - ${b.label} (${b.metricKey}): ${b.low}–${b.high} (mid ${b.mid}) ${b.unit} [${b.country}]${src}`;
    })
    .join("\n");
  return `
# Industry calibration context (reference market data — NOT prescriptions)

The following ranges are from published benchmark surveys for this market and property
class. They are calibration data to inform your reasoning. Reason per-deal from
property-specific drivers (operator quality, brand, revenue mix, location premium,
seasonal profile). Do NOT emit these ranges verbatim — the user's property may
legitimately differ from market averages, and that deviation is the intelligence.

${rows}`;
}

export function buildPropertyRiskIntelligenceUserPrompt(
  ctx: PropertyRiskIntelligencePromptInputContext,
): string {
  const { persona, inputs, countryInflationOutlook } = ctx;

  const userValueLine =
    inputs.propertyInflationRate == null
      ? "User's saved per-property inflation override: NOT SET"
      : `User's saved per-property inflation override: ${(inputs.propertyInflationRate * 100).toFixed(2)}% (decimal: ${inputs.propertyInflationRate})`;

  const locationLine = [inputs.city, inputs.country]
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .join(", ");
  const locationContext =
    locationLine.length > 0 ? `Location: ${locationLine}` : "Location: not provided";

  const outlookBlock =
    countryInflationOutlook == null
      ? `Country / market published inflation outlook: NOT YET RESOLVED.
The macro Specialist (Isadora I, constants.macro-research) has not refreshed the outlook for this market. Per the inflation-cascade rule you MUST NOT invent one. Emit a developing-conviction range centered on the user's saved value (or a tight ±0.5% band around the user's value if unset, citing "user-supplied override" as the only evidence) and call out the missing authority data in your reasoning.`
      : `Country / market published inflation outlook (authority data — your reasoning anchor):
- Low:  ${(countryInflationOutlook.low * 100).toFixed(2)}% (decimal: ${countryInflationOutlook.low})
- Mid:  ${(countryInflationOutlook.mid * 100).toFixed(2)}% (decimal: ${countryInflationOutlook.mid})
- High: ${(countryInflationOutlook.high * 100).toFixed(2)}% (decimal: ${countryInflationOutlook.high})
- Source: ${countryInflationOutlook.source}
- As of: ${countryInflationOutlook.asOf}${countryInflationOutlook.url ? `\n- URL: ${countryInflationOutlook.url}` : ""}`;

  const benchmarksBlock =
    ctx.marketBenchmarks && ctx.marketBenchmarks.length > 0
      ? buildMarketBenchmarksBlock(ctx.marketBenchmarks)
      : "";

  return `# Property persona

- Vertical: ${persona.verticalSlug}
- Market tier: ${persona.marketTier}
- Locale: ${persona.locale}
- ${locationContext}

# Inputs under review

${userValueLine}

${outlookBlock}${benchmarksBlock}

# Your task

Emit a single \`dimension\` object on \`propertyInflationRate\` with:
- \`key\`: "propertyInflationRate"
- \`low\`, \`mid\`, \`high\`: your defensible inflation range for this property in decimal form (NOT percentage points). When the country outlook is provided, your range MUST anchor on it; deviate only when you can cite specific property-level reasons (import-heavy F&B, long-term-stay mix, tourist-economy CPI lag, etc.).
- \`conviction\`: "high" | "moderate" | "developing".
- \`reasoning\`: one tight paragraph (20-500 chars) that names the country outlook, names the user's saved override (if set), and names the direction + magnitude of any deviation. Range-first. No "I think" / "in my opinion".
- \`sources\`: 1-5 cited authority sources. The country outlook authority MUST appear when provided. Add property-level data sources when you reason about deviation.

Optionally include a single \`overallNarrative\` (50-800 chars) that frames the property's inflation exposure for an investor reading the dimension card.`;
}
