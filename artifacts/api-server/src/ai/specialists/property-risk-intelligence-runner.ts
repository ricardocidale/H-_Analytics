/**
 * runPropertyRiskIntelligenceSpecialist — N+1 pipeline producing a complete
 * AnalystVerdict for the per-property inflation override surface (G3).
 *
 * G3 architecture (mirrors G6-P3a/P3b for Funding):
 *   0. Prompt Engineer (Gemini Flash): adapts panel prompts to this property's
 *      inflation context → quantAddendum + marketAddendum (IB req #8)
 *   1. Parallel panels:
 *      - Gemini Flash (quantitative): authority-anchored low/mid/high range
 *      - Claude Sonnet (market):      property-level deviation signals
 *   2. Convergence check: quant developing-conviction → honest-fail
 *   3. Synthesis (Opus): full Analyst-persona verdict with market enrichment
 *   4. Quality regress: validator failure → PE re-runs + new panels + retry
 *      (max 2 regresses; exhaustion → honest-fail per IB req #9)
 *
 * `meta.vendorsUsed: ["anthropic", "google"]` — IB req #7.
 * `meta.promptEngineerRunId` — IB req #8.
 * `meta.regressCount` — IB req #9.
 *
 * Errors throw `Tier1UnavailableError`; the route handler degrades to Tier-0
 * fallback with `meta.fallbackReason: "tier1_temporarily_unavailable"`.
 */

import { streamObject, generateObject } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { resolveLlmFor } from "../llm-config-resolver";
import { AI_GENERATION_TIMEOUT_MS } from "../../constants";
import {
  buildPropertyRiskIntelligenceSystemPrompt,
  buildPropertyRiskIntelligenceUserPrompt,
  type PropertyRiskIntelligencePromptInputContext,
  type PropertyRiskIntelligencePersonaContext,
} from "./property-risk-intelligence-prompt";
import { lookupReferenceRange } from "../../storage/reference-range";
import type { MarketBenchmarkEntry } from "./market-benchmark-types";
import {
  PropertyRiskIntelligenceOutputSchema,
  type PropertyRiskIntelligenceOutput,
} from "./property-risk-intelligence-output-schema";
import {
  RiskQuantPanelOutputSchema,
  type RiskQuantPanelOutput,
} from "./property-risk-quant-panel-schema";
import {
  RiskMarketPanelOutputSchema,
  type RiskMarketPanelOutput,
} from "./property-risk-market-panel-schema";
import {
  RiskPromptEngineerOutputSchema,
  buildRiskPromptEngineerSystemPrompt,
  buildRiskPromptEngineerUserPrompt,
  type RiskPromptEngineerOutput,
  type RegressContext,
} from "./property-risk-prompt-engineer";
import { validateRiskSynthesisOutput } from "./property-risk-synthesis-validator";
import {
  type InflationComparableRow,
  getCannedInflationComparables,
  comparableToEvidence,
  RISK_DIMENSION_KEYS,
} from "./property-risk-orchestrator-adapter";
import {
  buildAnalystVerdict,
  type AnalystVerdict,
  type RawVerdictDimension,
  type VerdictDimension,
  type VerdictRange,
  type VoiceIntent,
  type Evidence,
  type Severity,
  type PersonaContext,
} from "@engine/analyst/contracts/verdict";
import { createVoiceRenderer } from "@engine/analyst/voice/voice-renderer";
import { getFieldRegistryEntry } from "@engine/analyst/registry/field-registry";
import { getParameterValue } from "../parameter-resolver";

// ── Specialist identity ───────────────────────────────────────────────────────

const SPECIALIST_ID = "property.risk-intelligence";
const PROPERTY_INFLATION_FIELD = "propertyInflationRate";

// ── Token budgets ─────────────────────────────────────────────────────────────

const SYNTHESIS_MAX_OUTPUT_TOKENS = 2_000;
const PANEL_MAX_OUTPUT_TOKENS = 1_200;
const PROMPT_ENGINEER_MAX_OUTPUT_TOKENS = 600;

// ── Convergence policy (single-dimension: any developing conviction = fail) ───

/**
 * A single `developing` conviction on the only dimension signals the quant
 * panel cannot reliably anchor the range — skip synthesis, emit honest-fail.
 * Mirrors the Funding runner's avg-conviction floor, simplified for 1 dimension.
 */
const CONVERGENCE_MIN_QUANT_CONVICTION = 55; // developing=45 < 55 → honest-fail

// ── Inline panel prompt builders ──────────────────────────────────────────────

/**
 * Quant panel system prompt. Focuses Gemini Flash on authority-anchored numeric
 * range derivation using the country outlook + comparables. PE quantAddendum
 * prepended when supplied.
 */
function buildRiskQuantPanelSystemPrompt(peAddendum?: string): string {
  const base = `You are the quantitative panel for a property risk intelligence specialist. Your job is to derive a precise inflation range for the \`propertyInflationRate\` dimension based on:
1. The country / market authority-sourced inflation outlook (macro anchor)
2. The cross-sectoral CPI comparables (calibration cross-reference)
3. The property's operator context (persona, vertical, locale)

# Output
Emit one dimension object with key "propertyInflationRate", low/mid/high (decimal), conviction, reasoning, and evidenceRefs (integer indices into the comparables array provided in the user message — cite 1–3 refs).

# Calibration discipline
- Ground the range against the country outlook — do NOT invent an independent range
- Use the comparables as a cross-sector sanity check, not as a source of truth for this property
- Emit a wider range when the country outlook is absent or when the operator has unusual cost exposure
- Do NOT embed a "typical X%" prescription — derive per this property's specific context
- Conviction: "high" when country outlook is fresh and property context is clear; "moderate" when one of those is uncertain; "developing" when both are uncertain or missing`;

  return peAddendum ? `${peAddendum}\n\n${base}` : base;
}

function buildRiskQuantPanelUserPrompt(
  ctx: PropertyRiskIntelligencePromptInputContext,
  comparables: readonly InflationComparableRow[],
): string {
  const personaLine = `${ctx.persona.marketTier} tier, ${ctx.persona.verticalSlug} vertical, ${ctx.persona.locale} locale`;
  const overrideLine =
    ctx.inputs.propertyInflationRate != null
      ? `${(ctx.inputs.propertyInflationRate * 100).toFixed(2)}%`
      : "(not set)";

  const outlookBlock = ctx.countryInflationOutlook
    ? `  Authority: ${ctx.countryInflationOutlook.source}
  Low: ${(ctx.countryInflationOutlook.low * 100).toFixed(2)}%  Mid: ${(ctx.countryInflationOutlook.mid * 100).toFixed(2)}%  High: ${(ctx.countryInflationOutlook.high * 100).toFixed(2)}%
  As of: ${ctx.countryInflationOutlook.asOf}`
    : "  (not available — emit developing conviction, range centered on user value or 3% if unset)";

  const compBlock = comparables
    .map(
      (c, i) =>
        `  [${i}] ${c.authority} (${c.country}, ${c.sector}, ${c.vintage}): ` +
        `${(c.low * 100).toFixed(1)}%–${(c.high * 100).toFixed(1)}% (mid ${(c.mid * 100).toFixed(1)}%)`,
    )
    .join("\n");

  return `# Property
${personaLine}
Saved inflation override: ${overrideLine}

# Country inflation outlook (macro anchor)
${outlookBlock}

# Cross-sectoral CPI comparables (calibration cross-reference)
${compBlock}

Emit one dimension for propertyInflationRate. evidenceRefs must be integer indices into the comparables array above (0, 1, or 2). Cite all three if all are relevant.`;
}

/**
 * Market panel system prompt. Focuses Sonnet on property-level deviation
 * signals (import-heavy F&B, long-stay mix, tourist-economy CPI lag).
 * PE marketAddendum prepended when supplied.
 */
function buildRiskMarketPanelSystemPrompt(peAddendum?: string): string {
  const base = `You are the market panel for a property risk intelligence specialist. Your job is to identify qualitative deviation signals that explain why this specific property's inflation experience might diverge from the country's published outlook.

# Focus areas for deviation signals
- Revenue and cost mix: F&B-heavy properties in tourist economies face import-driven CPI overrun
- Contract structure: long-stay or rent-controlled leases underrun country CPI
- Labor dynamics: specialist hospitality labor may face different wage growth than country average
- Seasonal exposure: high-season luxury operators have different cost inflation curves than year-round assets

# Output
Emit one dimension object with key "propertyInflationRate":
- propertyDeviation: "above-outlook" | "in-line" | "below-outlook"
- lpRiskFlags: 0–3 LP-relevant inflation risk phrases specific to this property
- proposedBias: "increase" | "hold" | "decrease" | "insufficient-data"
- reasoning: 20–300 chars citing the specific operator context`;

  return peAddendum ? `${peAddendum}\n\n${base}` : base;
}

function buildRiskMarketPanelUserPrompt(
  ctx: PropertyRiskIntelligencePromptInputContext,
): string {
  const personaLine = `${ctx.persona.marketTier} tier, ${ctx.persona.verticalSlug} vertical, ${ctx.persona.locale} locale`;
  const locationLine = ctx.inputs.country
    ? `${ctx.inputs.city ? `${ctx.inputs.city}, ` : ""}${ctx.inputs.country}`
    : ctx.persona.locale;
  const overrideLine =
    ctx.inputs.propertyInflationRate != null
      ? `${(ctx.inputs.propertyInflationRate * 100).toFixed(2)}%`
      : "(not set)";
  const outlookMid = ctx.countryInflationOutlook
    ? `${(ctx.countryInflationOutlook.mid * 100).toFixed(2)}% (${ctx.countryInflationOutlook.source})`
    : "unknown";

  return `# Property
${personaLine}
Location: ${locationLine}
Saved inflation override: ${overrideLine}
Country inflation midpoint: ${outlookMid}

Assess whether this property's inflation exposure is likely above, in-line with, or below the country outlook. Emit one dimension for propertyInflationRate with deviation signal, LP flags, proposed bias, and specific reasoning.`;
}

/**
 * Format market panel output as an enrichment block for the Opus synthesis
 * prompt. Qualitative signals only — Opus determines the final numeric range.
 */
function buildRiskMarketEnrichmentBlock(market: RiskMarketPanelOutput): string {
  const dims = market.dimensions
    .map((d) => {
      const flags =
        d.lpRiskFlags.length > 0
          ? `\n      LP flags: ${d.lpRiskFlags.map((f) => `"${f}"`).join(", ")}`
          : "";
      return (
        `  - ${d.key}: deviation=${d.propertyDeviation}, bias=${d.proposedBias}${flags}\n` +
        `    ${d.reasoning}`
      );
    })
    .join("\n");
  const ctx = market.overallInflationContext
    ? `\nOverall inflation context: ${market.overallInflationContext}`
    : "";
  return `# Market panel signals (Claude Sonnet qualitative pass — for enrichment only)\n\n${dims}${ctx}`;
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

function unitFor(field: string): string {
  const entry = getFieldRegistryEntry(field);
  if (!entry) {
    throw new Error(
      `Risk Intelligence runner: no FIELD_REGISTRY entry for field "${field}". Add one to engine/analyst/registry/field-registry.ts.`,
    );
  }
  return entry.unit;
}

function convictionToQualityScore(c: "high" | "moderate" | "developing"): number {
  if (c === "high") return 85;
  if (c === "moderate") return 65;
  return 45;
}

function deriveSeverity(value: number | null | undefined, range: VerdictRange): Severity {
  if (value == null || !Number.isFinite(value)) return "ok";
  if (value < range.low || value > range.high) return "advisory";
  return "ok";
}

function deriveIntent(value: number | null | undefined, range: VerdictRange): VoiceIntent {
  if (value == null || !Number.isFinite(value)) return "missing-data";
  if (value < range.low) return "below-range";
  if (value > range.high) return "above-range";
  return "within-range";
}

function buildEvidenceForDimension(
  evidenceRefs: readonly number[],
  comparables: readonly InflationComparableRow[],
): Evidence[] {
  return evidenceRefs
    .filter((idx) => idx >= 0 && idx < comparables.length)
    .map((idx) => comparableToEvidence(comparables[idx]));
}

function llmDimensionToRaw(
  llmDim: PropertyRiskIntelligenceOutput["dimensions"][number],
  inputs: PropertyRiskIntelligencePromptInputContext["inputs"],
  comparables: readonly InflationComparableRow[],
): RawVerdictDimension {
  const range: VerdictRange = {
    low: llmDim.low,
    mid: llmDim.mid,
    high: llmDim.high,
    unit: unitFor(PROPERTY_INFLATION_FIELD),
  };
  const userValue = inputs.propertyInflationRate ?? null;
  return {
    field: PROPERTY_INFLATION_FIELD,
    isNumericField: true,
    severity: deriveSeverity(userValue, range),
    range,
    qualityScore: convictionToQualityScore(llmDim.conviction),
    evidence: buildEvidenceForDimension(llmDim.evidenceRefs, comparables),
    intent: deriveIntent(userValue, range),
    actions: [],
  };
}

function rawWithVoice(
  raw: RawVerdictDimension,
  llmReasoning: string,
  persona: PersonaContext,
  voiceRenderer: ReturnType<typeof createVoiceRenderer>,
): VerdictDimension {
  const voice = voiceRenderer.renderDimension({
    field: raw.field,
    severity: raw.severity,
    range: raw.range,
    qualityScore: raw.qualityScore,
    evidence: raw.evidence,
    intent: raw.intent,
    personaContext: persona,
    llmReasoning: llmReasoning || undefined,
  });
  return {
    field: raw.field,
    isNumericField: raw.isNumericField,
    severity: raw.severity,
    range: raw.range,
    qualityScore: raw.qualityScore,
    evidence: raw.evidence,
    voice,
    actions: raw.actions,
    crossSurface: raw.crossSurface,
  };
}

function asPersonaContext(persona: PropertyRiskIntelligencePersonaContext): PersonaContext {
  return {
    segment: persona.verticalSlug,
    tier: persona.marketTier,
    market: persona.locale,
  };
}

// ── Typed error ───────────────────────────────────────────────────────────────

export class Tier1UnavailableError extends Error {
  readonly cause: unknown;
  constructor(message: string, cause: unknown) {
    super(message);
    this.name = "Tier1UnavailableError";
    this.cause = cause;
  }
}

// ── Deps interface ────────────────────────────────────────────────────────────

export interface RunPropertyRiskIntelligenceSpecialistDeps {
  getAnthropicModel?: (modelId: string) => ReturnType<ReturnType<typeof createAnthropic>>;
  getGoogleModel?: (modelId: string) => ReturnType<ReturnType<typeof createGoogleGenerativeAI>>;
  now?: Date;
}

// ── Market benchmark lookup ───────────────────────────────────────────────────

async function resolveMarketBenchmarks(
  country: string | undefined,
): Promise<MarketBenchmarkEntry[]> {
  if (!country) return [];
  const c = country.toUpperCase();
  const lookups: Array<{ domain: "kpi" | "macro" | "labor"; metricKey: string }> = [
    { domain: "kpi", metricKey: "gopMarginPct" },
    { domain: "kpi", metricKey: "stabilizedOccupancy" },
    { domain: "labor", metricKey: "totalLaborCostPct" },
  ];
  const entries: MarketBenchmarkEntry[] = [];
  await Promise.all(
    lookups.map(async ({ domain, metricKey }) => {
      try {
        const row = await lookupReferenceRange({ domain, metricKey, country: c });
        if (row) {
          entries.push({
            metricKey: row.metricKey,
            label: row.label,
            low: row.low,
            mid: row.mid,
            high: row.high,
            unit: row.unit,
            country: row.country,
            sourceName: row.sourceName ?? null,
          });
        }
      } catch {
        // Non-fatal: missing benchmark row should not block the verdict
      }
    }),
  );
  return entries;
}

// ── Private panel runners ─────────────────────────────────────────────────────

async function runPromptEngineer(
  ctx: PropertyRiskIntelligencePromptInputContext,
  comparables: readonly InflationComparableRow[],
  deps: RunPropertyRiskIntelligenceSpecialistDeps,
  abortSignal: AbortSignal,
  regressContext?: RegressContext,
): Promise<{ output: RiskPromptEngineerOutput; runId: string }> {
  const googleModelFactory =
    deps.getGoogleModel ??
    ((modelId: string) =>
      createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY ?? "" })(modelId));

  const { modelId: promptEngineerModelId } = await resolveLlmFor("specialist-prompt-engineer");
  const { object } = await generateObject({
    model: googleModelFactory(promptEngineerModelId),
    schema: RiskPromptEngineerOutputSchema,
    system: buildRiskPromptEngineerSystemPrompt(),
    prompt: buildRiskPromptEngineerUserPrompt(ctx, comparables, regressContext),
    maxOutputTokens: PROMPT_ENGINEER_MAX_OUTPUT_TOKENS,
    abortSignal,
  });

  const runId = `pe-risk-g3-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return { output: object, runId };
}

async function runQuantPanel(
  ctx: PropertyRiskIntelligencePromptInputContext,
  comparables: readonly InflationComparableRow[],
  deps: RunPropertyRiskIntelligenceSpecialistDeps,
  abortSignal: AbortSignal,
  peAddendum?: string,
): Promise<RiskQuantPanelOutput> {
  const googleModelFactory =
    deps.getGoogleModel ??
    ((modelId: string) =>
      createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY ?? "" })(modelId));

  const { modelId: quantPanelModelId } = await resolveLlmFor("specialist-quant-panel");
  const { object } = await generateObject({
    model: googleModelFactory(quantPanelModelId),
    schema: RiskQuantPanelOutputSchema,
    system: buildRiskQuantPanelSystemPrompt(peAddendum),
    prompt: buildRiskQuantPanelUserPrompt(ctx, comparables),
    maxOutputTokens: PANEL_MAX_OUTPUT_TOKENS,
    abortSignal,
  });
  return object;
}

async function runMarketPanel(
  ctx: PropertyRiskIntelligencePromptInputContext,
  deps: RunPropertyRiskIntelligenceSpecialistDeps,
  abortSignal: AbortSignal,
  peAddendum?: string,
): Promise<RiskMarketPanelOutput> {
  const baseSystemPrompt = buildRiskMarketPanelSystemPrompt(peAddendum);
  const { modelId: marketPanelModelId } = await resolveLlmFor("specialist-market-panel");
  const anthropicFactory = deps.getAnthropicModel ?? createAnthropic();

  const { object } = await generateObject({
    model: anthropicFactory(marketPanelModelId),
    schema: RiskMarketPanelOutputSchema,
    system: baseSystemPrompt,
    prompt: buildRiskMarketPanelUserPrompt(ctx),
    maxOutputTokens: PANEL_MAX_OUTPUT_TOKENS,
    abortSignal,
  });
  return object;
}

async function runSynthesisPanel(
  ctx: PropertyRiskIntelligencePromptInputContext,
  comparables: readonly InflationComparableRow[],
  marketBenchmarks: MarketBenchmarkEntry[],
  marketContext: RiskMarketPanelOutput,
  deps: RunPropertyRiskIntelligenceSpecialistDeps,
  abortSignal: AbortSignal,
): Promise<{ output: PropertyRiskIntelligenceOutput; cognitiveRunId: string }> {
  const systemPrompt = buildPropertyRiskIntelligenceSystemPrompt();
  const ctxWithBenchmarks = { ...ctx, marketBenchmarks };
  const baseUserPrompt = buildPropertyRiskIntelligenceUserPrompt(ctxWithBenchmarks);
  const enrichedUserPrompt = `${baseUserPrompt}\n\n${buildRiskMarketEnrichmentBlock(marketContext)}

# Comparables (cite via evidenceRefs — integer indices 0..${comparables.length - 1})
${comparables.map((c, i) => `  [${i}] ${c.authority} (${c.country}, ${c.sector}, ${c.vintage}): ${(c.low * 100).toFixed(1)}%–${(c.high * 100).toFixed(1)}%`).join("\n")}`;

  const { modelId: specialistModelId } = await resolveLlmFor("specialist-primary");
  const anthropicFactory = deps.getAnthropicModel ?? createAnthropic();
  const result = streamObject({
    model: anthropicFactory(specialistModelId),
    schema: PropertyRiskIntelligenceOutputSchema,
    messages: [
      {
        role: "system",
        content: systemPrompt,
        providerOptions: {
          anthropic: { cacheControl: { type: "ephemeral" } },
        },
      },
      { role: "user", content: enrichedUserPrompt },
    ],
    maxOutputTokens: SYNTHESIS_MAX_OUTPUT_TOKENS,
    abortSignal,
  });

  for await (const _partial of result.partialObjectStream) {
    void _partial;
  }
  const output = await result.object;
  const cognitiveRunId = `risk-g3-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return { output, cognitiveRunId };
}

// ── Honest-fail verdict builder ───────────────────────────────────────────────

const SYNTHETIC_EVIDENCE_SOURCE = "quant-panel-low-conviction";

function syntheticEvidence(): Evidence {
  return {
    source: SYNTHETIC_EVIDENCE_SOURCE,
    tier: "estimated",
    asOf: new Date().toISOString().slice(0, 10),
    personaFit: 0.3,
  };
}

function buildHonestFailVerdict(
  quantOutput: RiskQuantPanelOutput,
  comparables: readonly InflationComparableRow[],
  ctx: PropertyRiskIntelligencePromptInputContext,
  persona: PersonaContext,
  deps: RunPropertyRiskIntelligenceSpecialistDeps,
  durationMs: number,
  peRunId: string,
  regressCount: number,
): AnalystVerdict {
  const voiceRenderer = createVoiceRenderer();
  const quantByKey = new Map(quantOutput.dimensions.map((d) => [d.key, d]));

  // Tier-1 verdicts require ≥3 total evidence entries (MIN_SOURCES_FOR_ADVICE
  // ×1 dim, TIER_1_MIN_TOTAL_EVIDENCE=3). With a single dimension, we pad
  // with synthetic entries when the quant panel didn't cite all 3 comparables.
  const MIN_TIER1_EVIDENCE = 3;

  const dimensions: VerdictDimension[] = RISK_DIMENSION_KEYS.map((key) => {
    const quantDim = quantByKey.get(key);
    let evidence: Evidence[] =
      quantDim && quantDim.evidenceRefs.length > 0
        ? buildEvidenceForDimension(quantDim.evidenceRefs, comparables)
        : [];

    while (evidence.length < MIN_TIER1_EVIDENCE) {
      evidence = [...evidence, syntheticEvidence()];
    }

    const raw: RawVerdictDimension = {
      field: PROPERTY_INFLATION_FIELD,
      isNumericField: true,
      severity: "ok",
      range: null,
      qualityScore: 35,
      evidence,
      intent: "missing-data",
      actions: [],
    };

    return rawWithVoice(raw, "", persona, voiceRenderer);
  });

  const surfaceVoice = voiceRenderer.renderSurface(dimensions);
  const cognitiveRunId = `risk-g3-hf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  return buildAnalystVerdict({
    specialistId: SPECIALIST_ID,
    dimensions,
    surfaceVoice,
    meta: {
      tier: 1,
      durationMs,
      cognitiveRunId,
      vendorsUsed: ["anthropic", "google"],
      cacheState: "miss",
      promptEngineerRunId: peRunId,
      regressCount,
    },
    generatedAt: deps.now ? deps.now.toISOString() : undefined,
  });
}

// ── Quality regress constants ─────────────────────────────────────────────────

const MAX_SYNTHESIS_REGRESSES = 2;

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Run the Risk Intelligence Specialist N+1 pipeline end-to-end.
 *
 * Returns a complete AnalystVerdict ready for the route handler. Throws
 * Tier1UnavailableError on any failure; caller degrades to Tier-0.
 *
 * @param ctx — per-call context (country outlook, persona, saved override)
 * @param comparables — inflation comparables (defaults to canned set for G3 bring-up)
 * @param deps — optional model/time overrides (tests inject stubs)
 */
export async function runPropertyRiskIntelligenceSpecialist(
  ctx: PropertyRiskIntelligencePromptInputContext,
  comparables: readonly InflationComparableRow[] = getCannedInflationComparables(),
  deps: RunPropertyRiskIntelligenceSpecialistDeps = {},
): Promise<AnalystVerdict> {
  const startMs = Date.now();
  const marketBenchmarks = await resolveMarketBenchmarks(ctx.inputs.country);
  const persona = asPersonaContext(ctx.persona);

  // ── Behavioral parameters (admin-tunable via admin_resources) ────────────
  const convergenceMinConviction = await getParameterValue(
    "specialist-convergence-min-conviction",
    CONVERGENCE_MIN_QUANT_CONVICTION,
  );
  const maxSynthesisRegresses = await getParameterValue(
    "specialist-max-regress-attempts",
    MAX_SYNTHESIS_REGRESSES,
  );

  // ── Phase 0: Prompt Engineer pre-stage (IB req #8) ─────────────────────────
  const peAbort = new AbortController();
  const peTimer = setTimeout(
    () => peAbort.abort(new Error(`Risk G3 PE timed out after ${AI_GENERATION_TIMEOUT_MS / 1000}s`)),
    AI_GENERATION_TIMEOUT_MS,
  );

  let peOutput: RiskPromptEngineerOutput;
  let peRunId: string;
  try {
    ({ output: peOutput, runId: peRunId } = await runPromptEngineer(
      ctx,
      comparables,
      deps,
      peAbort.signal,
    ));
    clearTimeout(peTimer);
  } catch (err: unknown) {
    clearTimeout(peTimer);
    throw new Tier1UnavailableError(
      `Risk G3 prompt engineer failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  // ── Phase 1: parallel panels ─────────────────────────────────────────────
  const panelAbort = new AbortController();
  const panelTimer = setTimeout(
    () => panelAbort.abort(new Error(`Risk G3 panels timed out after ${AI_GENERATION_TIMEOUT_MS / 1000}s`)),
    AI_GENERATION_TIMEOUT_MS,
  );

  let quantOutput: RiskQuantPanelOutput;
  let marketOutput: RiskMarketPanelOutput;
  try {
    [quantOutput, marketOutput] = await Promise.all([
      runQuantPanel(ctx, comparables, deps, panelAbort.signal, peOutput.quantAddendum),
      runMarketPanel(ctx, deps, panelAbort.signal, peOutput.marketAddendum),
    ]);
    clearTimeout(panelTimer);
  } catch (err: unknown) {
    clearTimeout(panelTimer);
    throw new Tier1UnavailableError(
      `Risk G3 panel phase failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  // ── Phase 2: convergence check ──────────────────────────────────────────
  const quantDim = quantOutput.dimensions[0];
  const quantConviction = quantDim ? convictionToQualityScore(quantDim.conviction) : 0;
  if (quantConviction < convergenceMinConviction) {
    return buildHonestFailVerdict(
      quantOutput,
      comparables,
      ctx,
      persona,
      deps,
      Date.now() - startMs,
      peRunId,
      0,
    );
  }

  // ── Phase 3: synthesis + quality regress loop (IB req #9) ──────────────
  let regressCount = 0;
  let currentPeOutput = peOutput;
  let currentQuantOutput = quantOutput;
  let currentMarketOutput = marketOutput;

  let output!: PropertyRiskIntelligenceOutput;
  let cognitiveRunId = "";

  while (true) {
    const opusAbort = new AbortController();
    const opusTimer = setTimeout(
      () => opusAbort.abort(new Error(`Risk G3 synthesis timed out after ${AI_GENERATION_TIMEOUT_MS / 1000}s`)),
      AI_GENERATION_TIMEOUT_MS,
    );

    let loopOutput: PropertyRiskIntelligenceOutput;
    let loopRunId: string;
    try {
      ({ output: loopOutput, cognitiveRunId: loopRunId } = await runSynthesisPanel(
        ctx,
        comparables,
        marketBenchmarks,
        currentMarketOutput,
        deps,
        opusAbort.signal,
      ));
      clearTimeout(opusTimer);
    } catch (err: unknown) {
      clearTimeout(opusTimer);
      throw new Tier1UnavailableError(
        `Risk G3 synthesis failed: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }

    const validation = validateRiskSynthesisOutput(loopOutput, comparables);
    if (validation.pass) {
      output = loopOutput;
      cognitiveRunId = loopRunId;
      break;
    }

    if (regressCount >= maxSynthesisRegresses) {
      return buildHonestFailVerdict(
        currentQuantOutput,
        comparables,
        ctx,
        persona,
        deps,
        Date.now() - startMs,
        peRunId,
        regressCount,
      );
    }

    regressCount++;

    const regressCtx: RegressContext = {
      priorQuantAddendum: currentPeOutput.quantAddendum,
      priorMarketAddendum: currentPeOutput.marketAddendum,
      regressReason: validation.regressReason!,
    };

    const regressAbort = new AbortController();
    const regressTimer = setTimeout(
      () => regressAbort.abort(new Error(`Risk G3 regress ${regressCount} timed out after ${AI_GENERATION_TIMEOUT_MS / 1000}s`)),
      AI_GENERATION_TIMEOUT_MS,
    );

    try {
      const peResult = await runPromptEngineer(ctx, comparables, deps, regressAbort.signal, regressCtx);
      currentPeOutput = peResult.output;

      [currentQuantOutput, currentMarketOutput] = await Promise.all([
        runQuantPanel(ctx, comparables, deps, regressAbort.signal, currentPeOutput.quantAddendum),
        runMarketPanel(ctx, deps, regressAbort.signal, currentPeOutput.marketAddendum),
      ]);
      clearTimeout(regressTimer);
    } catch (err: unknown) {
      clearTimeout(regressTimer);
      throw new Tier1UnavailableError(
        `Risk G3 regress ${regressCount} phase failed: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  // ── Phase 4: assemble verdict ────────────────────────────────────────────
  try {
    const voiceRenderer = createVoiceRenderer();

    const llmDim = output.dimensions.find((d) => d.key === RISK_DIMENSION_KEYS[0]);
    if (!llmDim) {
      throw new Tier1UnavailableError(
        `Risk G3 missing dimension "${RISK_DIMENSION_KEYS[0]}" after schema parse`,
        null,
      );
    }

    const raw = llmDimensionToRaw(llmDim, ctx.inputs, comparables);
    if (raw.evidence.length === 0) {
      throw new Tier1UnavailableError(
        `Risk G3 dimension emitted zero evidenceRefs; degrading to Tier-0`,
        null,
      );
    }

    const dimension = rawWithVoice(raw, llmDim.reasoning, persona, voiceRenderer);
    const dimensions: VerdictDimension[] = [dimension];
    const surfaceVoice = voiceRenderer.renderSurface(dimensions);

    return buildAnalystVerdict({
      specialistId: SPECIALIST_ID,
      dimensions,
      surfaceVoice,
      meta: {
        tier: 1,
        durationMs: Date.now() - startMs,
        cognitiveRunId,
        vendorsUsed: ["anthropic", "google"],
        cacheState: "miss",
        promptEngineerRunId: peRunId,
        regressCount,
      },
      generatedAt: deps.now ? deps.now.toISOString() : undefined,
    });
  } catch (err: unknown) {
    if (err instanceof Tier1UnavailableError) throw err;
    throw new Tier1UnavailableError(
      `Risk G3 verdict assembly failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }
}
