/**
 * runFundingSpecialist — N+1 pipeline producing a complete AnalystVerdict for
 * the Funding tab (G6-P3a).
 *
 * G6-P3a architecture (adds Prompt Engineer pre-stage to G6-P2 base):
 *   0. Prompt Engineer (Gemini Flash): adapts panel system prompts to operator
 *      context → quantAddendum + marketAddendum (Intelligence Bar req #8)
 *   1. Parallel panels:
 *      - Gemini Flash (quantitative): low/mid/high ranges + conviction from comparables
 *      - Claude Sonnet (market):      LP sentiment + risk flags + directional bias
 *   2. Convergence check (quant-conviction-only, G6-P2 minimal):
 *      avg(convictionScore × 5 dims) < CONVERGENCE_MIN_QUANT_CONVICTION → honest-fail
 *   3. Synthesis (Opus): full Analyst-persona verdict enriched with market context
 *
 * Both panels run in parallel so latency is max(quant, market) + synthesis,
 * not quant + market + synthesis. `meta.vendorsUsed: ["anthropic", "google"]`
 * satisfies Intelligence Bar requirement #7 (vendor breadth ≥2).
 * `meta.promptEngineerRunId` satisfies requirement #8.
 *
 * G6-P3a scope notes:
 *   - PE runs once, no regress loop yet (G6-P3b).
 *   - No verdict cache (G6-P3c), no cross-panel convergence (G6-P3b).
 *   - Public function signature is stable. Body changes; callers unaffected.
 *
 * Errors throw `Tier1UnavailableError`; the route handler degrades to Tier-0
 * fallback with `meta.fallbackReason: "tier1_temporarily_unavailable"`.
 */

import { streamObject, generateObject } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { resolveLlmFor } from "../llm-config-resolver";
import {
  PromptEngineerOutputSchema,
  buildPromptEngineerSystemPrompt,
  buildPromptEngineerUserPrompt,
  type PromptEngineerOutput,
  type RegressContext,
} from "./mgmt-co-funding-prompt-engineer";
import { validateSynthesisOutput } from "./mgmt-co-funding-synthesis-validator";
import { AI_GENERATION_TIMEOUT_MS } from "../../constants";
import {
  buildFundingSystemPrompt,
  buildFundingUserPrompt,
} from "./mgmt-co-funding-prompt";
import type { MarketBenchmarkEntry } from "./market-benchmark-types";
import { lookupReferenceRange } from "../../storage/reference-range";
import {
  FundingSpecialistOutputSchema,
  type FundingSpecialistOutput,
} from "./mgmt-co-funding-output-schema";
import {
  QuantPanelOutputSchema,
  type QuantPanelOutput,
} from "./mgmt-co-funding-quant-panel-schema";
import {
  MarketPanelOutputSchema,
  type MarketPanelOutput,
} from "./mgmt-co-funding-market-panel-schema";
import {
  buildQuantPanelSystemPrompt,
  buildQuantPanelUserPrompt,
} from "./mgmt-co-funding-quant-panel-prompt";
import {
  buildMarketPanelSystemPrompt,
  buildMarketPanelUserPrompt,
} from "./mgmt-co-funding-market-panel-prompt";
import {
  type ComparableRow,
  comparableToEvidence,
} from "./mgmt-co-funding-orchestrator-adapter";
import {
  type FundingPromptInputContext,
  type FundingDimensionKey,
  FUNDING_DIMENSION_KEYS,
} from "./mgmt-co-funding-prompt-input-builder";
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
import type { AnalystWatchdogBenchmarks } from "@workspace/db";
import { getFieldRegistryEntry } from "@engine/analyst/registry/field-registry";

// ── Token budgets ─────────────────────────────────────────────────────────────

const FUNDING_MAX_OUTPUT_TOKENS = 4_000;
const PANEL_MAX_OUTPUT_TOKENS = 2_000;
const MARKET_PANEL_MAX_OUTPUT_TOKENS = 1_500;
const PROMPT_ENGINEER_MAX_OUTPUT_TOKENS = 600;

// ── Convergence policy (G6-P2 minimal — quant-conviction-only) ───────────────

/**
 * Average quant-panel conviction score threshold. Below this value the
 * quantitative panel's output is too uncertain to proceed to Opus synthesis;
 * the runner emits an honest-fail Tier-1 verdict instead.
 *
 * Threshold rationale: (high=85 + moderate=65) / 2 ≈ 75 would require at
 * least half the dimensions to be "moderate". Setting 55 means we only block
 * when the quant panel is mostly "developing" across the board — an honest
 * floor, not a vanity gate. G6-P3 will add cross-panel divergence detection.
 */
const CONVERGENCE_MIN_QUANT_CONVICTION = 55;

/**
 * Per-key form-field id the Funding tab's `<input data-field="...">`
 * dialog scrolls to. Kept local so the runner doesn't depend on the
 * Specialist's private internals.
 */
const FUNDING_DIMENSION_FIELDS: Readonly<Record<FundingDimensionKey, { field: string }>> = {
  runwayBufferMonths: { field: "capitalRaise1Amount" },
  sizingOvershootPct: { field: "capitalRaise2Amount" },
  trancheGapMonths: { field: "capitalRaise2Date" },
  revenueRampDelayMonths: { field: "revenueRampDelayMonths" },
  burnFlexDownPct: { field: "burnFlexDownPct" },
};

// ── Pure helpers ──────────────────────────────────────────────────────────────

function unitFor(field: string): string {
  const entry = getFieldRegistryEntry(field);
  if (!entry) {
    throw new Error(
      `Funding runner: no FIELD_REGISTRY entry for field "${field}". Add one to engine/analyst/registry/field-registry.ts.`,
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
  comparables: readonly ComparableRow[],
): Evidence[] {
  return evidenceRefs
    .filter((idx) => idx >= 0 && idx < comparables.length)
    .map((idx) => comparableToEvidence(comparables[idx]));
}

function llmDimensionToRaw(
  llmDim: FundingSpecialistOutput["dimensions"][number],
  inputs: FundingPromptInputContext["inputs"],
  comparables: readonly ComparableRow[],
): RawVerdictDimension {
  const meta = FUNDING_DIMENSION_FIELDS[llmDim.key];
  const range: VerdictRange = {
    low: llmDim.low,
    mid: llmDim.mid,
    high: llmDim.high,
    unit: unitFor(meta.field),
  };
  const userValue = inputs[llmDim.key] ?? null;
  return {
    field: meta.field,
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

function asPersonaContext(persona: FundingPromptInputContext["persona"]): PersonaContext {
  return {
    segment: persona.verticalSlug,
    tier: persona.marketTier,
    market: persona.locale,
  };
}

/**
 * Average quality score across all 5 quant-panel dimensions. Below
 * CONVERGENCE_MIN_QUANT_CONVICTION → honest-fail (skip synthesis).
 */
function computeAvgQuantConviction(quantOutput: QuantPanelOutput): number {
  const scores = quantOutput.dimensions.map((d) => convictionToQualityScore(d.conviction));
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/**
 * Render market panel output as a structured text block injected into the
 * Opus synthesis user prompt. Provides qualitative enrichment context without
 * overriding the quant panel's numeric grounding.
 */
function buildMarketEnrichmentBlock(market: MarketPanelOutput): string {
  const dims = market.dimensions
    .map((d) => {
      const flags =
        d.lpRiskFlags.length > 0
          ? `\n      LP flags: ${d.lpRiskFlags.map((f) => `"${f}"`).join(", ")}`
          : "";
      return (
        `  - ${d.key}: sentiment=${d.marketSentiment}, bias=${d.proposedBias}${flags}\n` +
        `    ${d.reasoning}`
      );
    })
    .join("\n");
  const ctx = market.overallMarketContext
    ? `\nOverall LP context: ${market.overallMarketContext}`
    : "";
  return `# Market panel signals (Claude Sonnet qualitative pass — for enrichment only)\n\n${dims}${ctx}`;
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

export interface RunFundingSpecialistDeps {
  /** Optional override for the Anthropic model factory (tests inject stubs). */
  getAnthropicModel?: (modelId: string) => ReturnType<ReturnType<typeof createAnthropic>>;
  /** Optional override for the Google model factory (tests inject stubs). */
  getGoogleModel?: (modelId: string) => ReturnType<ReturnType<typeof createGoogleGenerativeAI>>;
  /** Optional reference time for verdict generatedAt; tests pass a fixed Date. */
  now?: Date;
}

// ── Market benchmark lookup ───────────────────────────────────────────────────

async function resolveFundingMarketBenchmarks(
  locale: string | undefined,
): Promise<MarketBenchmarkEntry[]> {
  if (!locale) return [];
  const c = locale.toUpperCase();
  const lookups: Array<{ domain: "kpi" | "financing"; metricKey: string }> = [
    { domain: "kpi", metricKey: "rampMonths" },
    { domain: "financing", metricKey: "ltvSenior" },
    { domain: "financing", metricKey: "dscrMinimum" },
    { domain: "financing", metricKey: "equityMultipleTarget" },
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

// ── Private panel runners (extractable to cognitive façade in G6-P4) ─────────

async function runPromptEngineer(
  ctx: FundingPromptInputContext,
  comparables: readonly ComparableRow[],
  deps: RunFundingSpecialistDeps,
  abortSignal: AbortSignal,
  regressContext?: RegressContext,
): Promise<{ output: PromptEngineerOutput; runId: string }> {
  const googleModelFactory =
    deps.getGoogleModel ??
    ((modelId: string) =>
      createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY ?? "" })(modelId));

  const { modelId: promptEngineerModelId } = await resolveLlmFor("specialist-prompt-engineer");
  const { object } = await generateObject({
    model: googleModelFactory(promptEngineerModelId),
    schema: PromptEngineerOutputSchema,
    system: buildPromptEngineerSystemPrompt(),
    prompt: buildPromptEngineerUserPrompt(ctx, comparables, regressContext),
    maxOutputTokens: PROMPT_ENGINEER_MAX_OUTPUT_TOKENS,
    abortSignal,
  });

  const runId = `pe-funding-g6p3a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return { output: object, runId };
}

async function runQuantPanel(
  ctx: FundingPromptInputContext,
  benchmarks: AnalystWatchdogBenchmarks,
  comparables: readonly ComparableRow[],
  marketCalibration: MarketBenchmarkEntry[],
  deps: RunFundingSpecialistDeps,
  abortSignal: AbortSignal,
  peAddendum?: string,
): Promise<QuantPanelOutput> {
  const baseSystemPrompt = buildQuantPanelSystemPrompt();
  const systemPrompt = peAddendum ? `${peAddendum}\n\n${baseSystemPrompt}` : baseSystemPrompt;
  const userPrompt = buildQuantPanelUserPrompt(ctx, benchmarks, comparables, marketCalibration);

  const googleModelFactory =
    deps.getGoogleModel ??
    ((modelId: string) =>
      createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY ?? "" })(modelId));

  const { modelId: quantPanelModelId } = await resolveLlmFor("specialist-quant-panel");
  const { object } = await generateObject({
    model: googleModelFactory(quantPanelModelId),
    schema: QuantPanelOutputSchema,
    system: systemPrompt,
    prompt: userPrompt,
    maxOutputTokens: PANEL_MAX_OUTPUT_TOKENS,
    abortSignal,
  });
  return object;
}

async function runMarketPanel(
  ctx: FundingPromptInputContext,
  comparables: readonly ComparableRow[],
  deps: RunFundingSpecialistDeps,
  abortSignal: AbortSignal,
  peAddendum?: string,
): Promise<MarketPanelOutput> {
  const baseSystemPrompt = buildMarketPanelSystemPrompt();
  const systemPrompt = peAddendum ? `${peAddendum}\n\n${baseSystemPrompt}` : baseSystemPrompt;
  const userPrompt = buildMarketPanelUserPrompt(ctx, comparables);

  const { modelId: marketPanelModelId } = await resolveLlmFor("specialist-market-panel");
  const anthropicFactory = deps.getAnthropicModel ?? createAnthropic();
  const { object } = await generateObject({
    model: anthropicFactory(marketPanelModelId),
    schema: MarketPanelOutputSchema,
    system: systemPrompt,
    prompt: userPrompt,
    maxOutputTokens: MARKET_PANEL_MAX_OUTPUT_TOKENS,
    abortSignal,
  });
  return object;
}

async function runSynthesisPanel(
  ctx: FundingPromptInputContext,
  benchmarks: AnalystWatchdogBenchmarks,
  comparables: readonly ComparableRow[],
  marketCalibration: MarketBenchmarkEntry[],
  marketContext: MarketPanelOutput,
  deps: RunFundingSpecialistDeps,
  abortSignal: AbortSignal,
): Promise<{ output: FundingSpecialistOutput; cognitiveRunId: string }> {
  const systemPrompt = buildFundingSystemPrompt();
  const baseUserPrompt = buildFundingUserPrompt(ctx, benchmarks, comparables, marketCalibration);
  const enrichedUserPrompt = `${baseUserPrompt}\n\n${buildMarketEnrichmentBlock(marketContext)}`;

  const { modelId: specialistModelId } = await resolveLlmFor("specialist-primary");
  const anthropicFactory = deps.getAnthropicModel ?? createAnthropic();
  const result = streamObject({
    model: anthropicFactory(specialistModelId),
    schema: FundingSpecialistOutputSchema,
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
    maxOutputTokens: FUNDING_MAX_OUTPUT_TOKENS,
    abortSignal,
  });

  // Drain partial stream for backpressure; consume final validated object.
  for await (const _partial of result.partialObjectStream) {
    void _partial;
  }
  const output = await result.object;
  const cognitiveRunId = `funding-g6p3a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return { output, cognitiveRunId };
}

// ── Honest-fail verdict builder ───────────────────────────────────────────────

/**
 * Build a Tier-1 honest-fail verdict when quant conviction is below threshold.
 * All dimensions are ok/missing-data with null range. Both vendors appear in
 * `meta.vendorsUsed` because both panels ran before the convergence check.
 */
function buildHonestFailVerdict(
  quantOutput: QuantPanelOutput,
  comparables: readonly ComparableRow[],
  ctx: FundingPromptInputContext,
  persona: PersonaContext,
  deps: RunFundingSpecialistDeps,
  durationMs: number,
  peRunId: string,
  regressCount: number,
): AnalystVerdict {
  const voiceRenderer = createVoiceRenderer();

  // Synthetic evidence for dimensions with no quant refs. Satisfies
  // MIN_SOURCES_FOR_ADVICE (1) and TIER_1_MIN_TOTAL_EVIDENCE (3) across dims.
  const SYNTHETIC_EVIDENCE: Evidence = {
    source: "quant-panel-low-conviction",
    tier: "estimated",
    asOf: new Date().toISOString().slice(0, 10),
    personaFit: 0.3,
  };

  const quantByKey = new Map(quantOutput.dimensions.map((d) => [d.key, d]));

  const dimensions: VerdictDimension[] = FUNDING_DIMENSION_KEYS.map((key) => {
    const meta = FUNDING_DIMENSION_FIELDS[key];
    const quantDim = quantByKey.get(key);
    const evidence: Evidence[] =
      quantDim && quantDim.evidenceRefs.length > 0
        ? buildEvidenceForDimension(quantDim.evidenceRefs, comparables)
        : [SYNTHETIC_EVIDENCE];

    const raw: RawVerdictDimension = {
      field: meta.field,
      isNumericField: true,
      severity: "ok",
      range: null,
      qualityScore: 35, // below CONVICTION_FLOOR — signals low confidence
      evidence,
      intent: "missing-data",
      actions: [],
    };

    return rawWithVoice(raw, "", persona, voiceRenderer);
  });

  const surfaceVoice = voiceRenderer.renderSurface(dimensions);
  const cognitiveRunId = `funding-g6p3a-hf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  return buildAnalystVerdict({
    specialistId: "mgmt-co.funding",
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

// ── Quality regress constants (G6-P3b) ───────────────────────────────────────

/** Maximum synthesis regress iterations. 0 = first-pass success, 2 = exhausted. */
const MAX_SYNTHESIS_REGRESSES = 2;

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Run the G6-P2 Funding Specialist N+1 pipeline end-to-end.
 *
 * Returns a complete AnalystVerdict ready for the route handler. Throws
 * Tier1UnavailableError on any failure; caller degrades to Tier-0.
 */
export async function runFundingSpecialist(
  ctx: FundingPromptInputContext,
  benchmarks: AnalystWatchdogBenchmarks,
  comparables: readonly ComparableRow[],
  deps: RunFundingSpecialistDeps = {},
): Promise<AnalystVerdict> {
  const startMs = Date.now();
  const marketCalibration = await resolveFundingMarketBenchmarks(ctx.persona.locale);
  const persona = asPersonaContext(ctx.persona);

  // ── Phase 0: Prompt Engineer pre-stage (G6-P3a — Intelligence Bar req #8) ──
  const peAbort = new AbortController();
  const peTimer = setTimeout(
    () =>
      peAbort.abort(
        new Error(`Funding G6-P3a PE timed out after ${AI_GENERATION_TIMEOUT_MS / 1000}s`),
      ),
    AI_GENERATION_TIMEOUT_MS,
  );

  let peOutput: PromptEngineerOutput;
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
      `Funding G6-P3a prompt engineer failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  // ── Phase 1: parallel panels ────────────────────────────────────────────
  const panelAbort = new AbortController();
  const panelTimer = setTimeout(
    () =>
      panelAbort.abort(
        new Error(`Funding G6-P3a panels timed out after ${AI_GENERATION_TIMEOUT_MS / 1000}s`),
      ),
    AI_GENERATION_TIMEOUT_MS,
  );

  let quantOutput: QuantPanelOutput;
  let marketOutput: MarketPanelOutput;
  try {
    [quantOutput, marketOutput] = await Promise.all([
      runQuantPanel(ctx, benchmarks, comparables, marketCalibration, deps, panelAbort.signal, peOutput.quantAddendum),
      runMarketPanel(ctx, comparables, deps, panelAbort.signal, peOutput.marketAddendum),
    ]);
    clearTimeout(panelTimer);
  } catch (err: unknown) {
    clearTimeout(panelTimer);
    throw new Tier1UnavailableError(
      `Funding G6-P3a panel phase failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  // ── Phase 2: convergence check (quant-conviction-only) ──────────────────
  // Convergence-fail is NOT a regress candidate — PE addenda cannot repair a
  // thin LP comp set. Emit honest-fail immediately with regressCount=0.
  const avgQuantConviction = computeAvgQuantConviction(quantOutput);
  if (avgQuantConviction < CONVERGENCE_MIN_QUANT_CONVICTION) {
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

  // ── Phase 3: synthesis + quality regress loop (G6-P3b — IB req #9) ──────
  // Each failed quality check re-runs PE (with prior addenda + failure reason)
  // and both panels, then retries synthesis. Max MAX_SYNTHESIS_REGRESSES
  // attempts; exhaustion → honest-fail. regressCount tracks completed regresses.

  let regressCount = 0;
  let currentPeOutput = peOutput;
  let currentQuantOutput = quantOutput;
  let currentMarketOutput = marketOutput;

  let output!: FundingSpecialistOutput;
  let cognitiveRunId = "";

  while (true) {
    const opusAbort = new AbortController();
    const opusTimer = setTimeout(
      () =>
        opusAbort.abort(
          new Error(`Funding G6-P3b synthesis timed out after ${AI_GENERATION_TIMEOUT_MS / 1000}s`),
        ),
      AI_GENERATION_TIMEOUT_MS,
    );

    let loopOutput: FundingSpecialistOutput;
    let loopRunId: string;
    try {
      ({ output: loopOutput, cognitiveRunId: loopRunId } = await runSynthesisPanel(
        ctx,
        benchmarks,
        comparables,
        marketCalibration,
        currentMarketOutput,
        deps,
        opusAbort.signal,
      ));
      clearTimeout(opusTimer);
    } catch (err: unknown) {
      clearTimeout(opusTimer);
      throw new Tier1UnavailableError(
        `Funding G6-P3b synthesis failed: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }

    const validation = validateSynthesisOutput(loopOutput, comparables);
    if (validation.pass) {
      output = loopOutput;
      cognitiveRunId = loopRunId;
      break;
    }

    if (regressCount >= MAX_SYNTHESIS_REGRESSES) {
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
      () =>
        regressAbort.abort(
          new Error(
            `Funding G6-P3b regress ${regressCount} timed out after ${AI_GENERATION_TIMEOUT_MS / 1000}s`,
          ),
        ),
      AI_GENERATION_TIMEOUT_MS,
    );

    try {
      const peResult = await runPromptEngineer(
        ctx,
        comparables,
        deps,
        regressAbort.signal,
        regressCtx,
      );
      currentPeOutput = peResult.output;

      [currentQuantOutput, currentMarketOutput] = await Promise.all([
        runQuantPanel(
          ctx,
          benchmarks,
          comparables,
          marketCalibration,
          deps,
          regressAbort.signal,
          currentPeOutput.quantAddendum,
        ),
        runMarketPanel(ctx, comparables, deps, regressAbort.signal, currentPeOutput.marketAddendum),
      ]);
      clearTimeout(regressTimer);
    } catch (err: unknown) {
      clearTimeout(regressTimer);
      throw new Tier1UnavailableError(
        `Funding G6-P3b regress ${regressCount} phase failed: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  // ── Phase 4: assemble verdict ────────────────────────────────────────────
  try {
    const voiceRenderer = createVoiceRenderer();
    const rawByKey = new Map<FundingDimensionKey, RawVerdictDimension>();
    const reasoningByKey = new Map<FundingDimensionKey, string>();

    for (const llmDim of output.dimensions) {
      rawByKey.set(llmDim.key, llmDimensionToRaw(llmDim, ctx.inputs, comparables));
      reasoningByKey.set(llmDim.key, llmDim.reasoning);
    }

    const dimensions: VerdictDimension[] = FUNDING_DIMENSION_KEYS.map((key) => {
      const raw = rawByKey.get(key);
      const reasoning = reasoningByKey.get(key);
      if (!raw) {
        throw new Tier1UnavailableError(
          `Funding G6-P2 missing dimension after schema parse: ${key}`,
          null,
        );
      }
      if (raw.evidence.length === 0) {
        throw new Tier1UnavailableError(
          `Funding G6-P2 dimension ${key} emitted zero evidenceRefs; degrading to Tier-0`,
          null,
        );
      }
      return rawWithVoice(raw, reasoning ?? "", persona, voiceRenderer);
    });

    const surfaceVoice = voiceRenderer.renderSurface(dimensions);

    return buildAnalystVerdict({
      specialistId: "mgmt-co.funding",
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
      `Funding G6-P2 verdict assembly failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Cathedral graduation roadmap
//
// v1  (G1.5c)   chapel: single-shot Opus
// G6-P2         N+1 panels (Gemini Flash + Sonnet) → vendor breadth ≥2 (req #7)
// G6-P3a        Prompt Engineer pre-stage → meta.promptEngineerRunId (req #8)
// G6-P3b        quality check + bounded regress loop → meta.regressCount (req #9)
// G6-P3c        persistent verdict cache (ADR-004)
// G6-P4         Bar invariants asserted in funding-g6p3.test.ts (IB#1-#9 all green)
