/**
 * runOverheadSpecialist — N+1 pipeline producing a complete AnalystVerdict
 * for the Overhead tab (Phase 2 graduation).
 *
 * Mirrors mgmt-co-compensation-runner.ts (G3) — same N+1 architecture, same
 * regress loop, same vendor breadth. Overhead-specific:
 *   - Persona: hospitality ManCo overhead defensibility (not LP funding
 *     sizing or compensation share)
 *   - Comparables: ManCo overhead rows (OverheadComparableRow)
 *   - Reference benchmarks: kpi domain (gopMargin) for ManCo cost-share
 *     grounding
 *
 * Phase 2 architecture (mirrors Compensation G3):
 *   0. Prompt Engineer (Gemini Flash): adapts panel system prompts to
 *      operator-stage context → quantAddendum + marketAddendum (IB req #8)
 *   1. Parallel panels:
 *      - Gemini Flash (quantitative): low/mid/high USD ranges +
 *        conviction grounded in ManCo overhead comparables
 *      - Claude Sonnet (market): LP-perception sentiment + audit-readiness /
 *        insurance-adequacy / retainer-discipline risk flags + bias
 *   2. Convergence check (quant-conviction-only):
 *      avg(convictionScore × 6 dims) < CONVERGENCE_MIN_QUANT_CONVICTION → honest-fail
 *   3. Synthesis (Opus): full Analyst-persona verdict enriched with market
 *      context
 *   4. Quality regress (max 2 attempts): on synthesis-validator failure,
 *      re-run PE with regressReason + re-execute panels → retry synthesis.
 *      Exhaustion → honest-fail (IB req #9).
 *
 * Both panels run in parallel so latency is max(quant, market) + synthesis,
 * not quant + market + synthesis. `meta.vendorsUsed: ["anthropic", "google"]`
 * satisfies IB requirement #7. `meta.promptEngineerRunId` satisfies #8.
 * `meta.regressCount` is tracked per #9.
 *
 * Phase 2 scope notes:
 *   - Same convergence threshold as Funding/Revenue/Compensation (55). The
 *     12-comp dataset spans founder-led / expansion / institutional × US /
 *     Latam / Med-Europe — same distribution shape as Compensation.
 *   - No verdict cache yet (ADR-004 / G6-P3c equivalent for Overhead).
 *   - No live AHLA/HFTP/AICPA API yet — uses canned OverheadComparableRow set.
 *   - Public function signature matches Compensation runner; route handler
 *     in server/routes/analyst-admin.ts uses default deps.
 *
 * Errors throw `Tier1UnavailableError`; the route handler degrades to
 * Tier-0 fallback with `meta.fallbackReason: "tier1_temporarily_unavailable"`.
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
} from "./mgmt-co-overhead-prompt-engineer";
import { validateSynthesisOutput } from "./mgmt-co-overhead-synthesis-validator";
import { AI_GENERATION_TIMEOUT_MS } from "../../constants";
import {
  buildOverheadSystemPrompt,
  buildOverheadUserPrompt,
} from "./mgmt-co-overhead-prompt";
import { lookupReferenceRange } from "../../storage/reference-range";
import {
  OverheadSpecialistOutputSchema,
  type OverheadSpecialistOutput,
} from "./mgmt-co-overhead-output-schema";
import {
  QuantPanelOutputSchema,
  type QuantPanelOutput,
} from "./mgmt-co-overhead-quant-panel-schema";
import {
  MarketPanelOutputSchema,
  type MarketPanelOutput,
} from "./mgmt-co-overhead-market-panel-schema";
import {
  buildQuantPanelSystemPrompt,
  buildQuantPanelUserPrompt,
} from "./mgmt-co-overhead-quant-panel-prompt";
import {
  buildMarketPanelSystemPrompt,
  buildMarketPanelUserPrompt,
} from "./mgmt-co-overhead-market-panel-prompt";
import {
  type OverheadComparableRow,
  overheadComparableToEvidence,
} from "./mgmt-co-overhead-orchestrator-adapter";
import {
  type OverheadPromptInputContext,
  type OverheadDimensionKey,
  OVERHEAD_DIMENSION_KEYS,
} from "./mgmt-co-overhead-prompt-input-builder";
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
import type { OverheadBenchmarks } from "@shared/model-constants-registry";
import { getFieldRegistryEntry } from "@engine/analyst/registry/field-registry";
import type { MarketBenchmarkEntry } from "./market-benchmark-types";
import { getParameterValue } from "../parameter-resolver";

// ── Token budgets ────────────────────────────────────────────────────────────

const OVERHEAD_MAX_OUTPUT_TOKENS = 4_000;
const PANEL_MAX_OUTPUT_TOKENS = 2_000;
const MARKET_PANEL_MAX_OUTPUT_TOKENS = 1_500;
const PROMPT_ENGINEER_MAX_OUTPUT_TOKENS = 600;

// ── Convergence policy ───────────────────────────────────────────────────────

/**
 * Same threshold as Funding/Revenue/Compensation (55). Overhead's 12-comp
 * dataset spans founder/expansion/institutional × US/Latam/Med-Europe —
 * same distribution shape as Compensation. Revisit if telemetry shows
 * persistent mode-collapse on the convergence side.
 */
const CONVERGENCE_MIN_QUANT_CONVICTION = 55;

/** Maximum synthesis regress iterations. 0 = first-pass success, 2 = exhausted. */
const MAX_SYNTHESIS_REGRESSES = 2;

/**
 * Per-key form-field id the Overhead tab's `<input data-field="...">`
 * dialog scrolls to. Dimension display units resolved from FIELD_REGISTRY
 * via `unitFor`.
 */
const OVERHEAD_DIMENSION_FIELDS: Readonly<Record<OverheadDimensionKey, { field: string }>> = {
  officeLeaseStart: { field: "officeLeaseStart" },
  professionalServicesStart: { field: "professionalServicesStart" },
  techInfraStart: { field: "techInfraStart" },
  businessInsuranceStart: { field: "businessInsuranceStart" },
  travelCostPerClient: { field: "travelCostPerClient" },
  itLicensePerClient: { field: "itLicensePerClient" },
};

// ── Pure helpers ─────────────────────────────────────────────────────────────

function unitFor(field: string): string {
  const entry = getFieldRegistryEntry(field);
  if (!entry) {
    throw new Error(
      `Overhead runner: no FIELD_REGISTRY entry for field "${field}". Add one to engine/analyst/registry/field-registry.ts.`,
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
  comparables: readonly OverheadComparableRow[],
): Evidence[] {
  return evidenceRefs
    .filter((idx) => idx >= 0 && idx < comparables.length)
    .map((idx) => overheadComparableToEvidence(comparables[idx]));
}

function llmDimensionToRaw(
  llmDim: OverheadSpecialistOutput["dimensions"][number],
  inputs: OverheadPromptInputContext["inputs"],
  comparables: readonly OverheadComparableRow[],
): RawVerdictDimension {
  const meta = OVERHEAD_DIMENSION_FIELDS[llmDim.key];
  const range: VerdictRange = {
    low: llmDim.low,
    mid: llmDim.mid,
    high: llmDim.high,
    unit: unitFor(meta.field),
  };
  const userValue =
    (inputs as Record<string, number | null | undefined>)[llmDim.key] ?? null;
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

function asPersonaContext(persona: OverheadPromptInputContext["persona"]): PersonaContext {
  return {
    segment: persona.verticalSlug,
    tier: persona.marketTier,
    market: persona.locale,
  };
}

function computeAvgQuantConviction(quantOutput: QuantPanelOutput): number {
  const scores = quantOutput.dimensions.map((d) => convictionToQualityScore(d.conviction));
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/**
 * Render market panel output as a structured text block injected into the
 * Opus synthesis user prompt. Provides qualitative enrichment context
 * without overriding the quant panel's numeric grounding.
 */
function buildMarketEnrichmentBlock(market: MarketPanelOutput): string {
  const dims = market.dimensions
    .map((d) => {
      const flags =
        d.lpRiskFlags.length > 0
          ? `\n      LP / audit / insurance flags: ${d.lpRiskFlags.map((f) => `"${f}"`).join(", ")}`
          : "";
      return (
        `  - ${d.key}: sentiment=${d.marketSentiment}, bias=${d.proposedBias}${flags}\n` +
        `    ${d.reasoning}`
      );
    })
    .join("\n");
  const ctx = market.overallMarketContext
    ? `\nOverall LP-perception context: ${market.overallMarketContext}`
    : "";
  return `# Market panel signals (Claude Sonnet qualitative pass — for enrichment only)\n\n${dims}${ctx}`;
}

// ── Typed error ──────────────────────────────────────────────────────────────

export class Tier1UnavailableError extends Error {
  readonly cause: unknown;
  constructor(message: string, cause: unknown) {
    super(message);
    this.name = "Tier1UnavailableError";
    this.cause = cause;
  }
}

// ── Deps interface ───────────────────────────────────────────────────────────

export interface RunOverheadSpecialistDeps {
  /** Optional override for the Anthropic model factory (tests inject stubs). */
  getAnthropicModel?: (modelId: string) => ReturnType<ReturnType<typeof createAnthropic>>;
  /** Optional override for the Google model factory (tests inject stubs). */
  getGoogleModel?: (modelId: string) => ReturnType<ReturnType<typeof createGoogleGenerativeAI>>;
  /** Optional reference time for verdict generatedAt; tests pass a fixed Date. */
  now?: Date;
}

// ── Market benchmark lookup ──────────────────────────────────────────────────

/**
 * Look up KPI benchmarks from `reference_range` for the operator's locale.
 * Provides ManCo cost-share grounding (GOP margin) so the synthesis prompt
 * can reason about overhead share at scale. Failures silently swallowed —
 * missing benchmarks should not block the verdict.
 */
async function resolveOverheadMarketBenchmarks(
  locale: string | undefined,
): Promise<MarketBenchmarkEntry[]> {
  if (!locale) return [];
  const c = locale.toUpperCase();
  const lookups: Array<{ domain: "kpi"; metricKey: string }> = [
    { domain: "kpi", metricKey: "gopMargin" },
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

// ── Private panel runners ────────────────────────────────────────────────────

async function runPromptEngineer(
  ctx: OverheadPromptInputContext,
  comparables: readonly OverheadComparableRow[],
  deps: RunOverheadSpecialistDeps,
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

  const runId = `pe-overhead-p2-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return { output: object, runId };
}

async function runQuantPanel(
  ctx: OverheadPromptInputContext,
  benchmarks: OverheadBenchmarks,
  comparables: readonly OverheadComparableRow[],
  marketCalibration: MarketBenchmarkEntry[],
  deps: RunOverheadSpecialistDeps,
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
  ctx: OverheadPromptInputContext,
  comparables: readonly OverheadComparableRow[],
  deps: RunOverheadSpecialistDeps,
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
  ctx: OverheadPromptInputContext,
  benchmarks: OverheadBenchmarks,
  comparables: readonly OverheadComparableRow[],
  marketCalibration: MarketBenchmarkEntry[],
  marketContext: MarketPanelOutput,
  deps: RunOverheadSpecialistDeps,
  abortSignal: AbortSignal,
): Promise<{ output: OverheadSpecialistOutput; cognitiveRunId: string }> {
  const systemPrompt = buildOverheadSystemPrompt();
  const baseUserPrompt = buildOverheadUserPrompt(ctx, benchmarks, comparables, marketCalibration);
  const enrichedUserPrompt = `${baseUserPrompt}\n\n${buildMarketEnrichmentBlock(marketContext)}`;

  const { modelId: specialistModelId } = await resolveLlmFor("specialist-primary");
  const anthropicFactory = deps.getAnthropicModel ?? createAnthropic();
  const result = streamObject({
    model: anthropicFactory(specialistModelId),
    schema: OverheadSpecialistOutputSchema,
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
    maxOutputTokens: OVERHEAD_MAX_OUTPUT_TOKENS,
    abortSignal,
  });

  // Drain partial stream for backpressure; consume final validated object.
  for await (const _partial of result.partialObjectStream) {
    void _partial;
  }
  const output = await result.object;
  const cognitiveRunId = `overhead-p2-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return { output, cognitiveRunId };
}

// ── Honest-fail verdict builder ──────────────────────────────────────────────

/**
 * Build a Tier-1 honest-fail verdict when quant conviction is below threshold.
 * All dimensions are ok/missing-data with null range. Both vendors appear in
 * `meta.vendorsUsed` because both panels ran before the convergence check.
 */
function buildHonestFailVerdict(
  quantOutput: QuantPanelOutput,
  comparables: readonly OverheadComparableRow[],
  ctx: OverheadPromptInputContext,
  persona: PersonaContext,
  deps: RunOverheadSpecialistDeps,
  durationMs: number,
  peRunId: string,
  regressCount: number,
): AnalystVerdict {
  void ctx;
  const voiceRenderer = createVoiceRenderer();

  const SYNTHETIC_EVIDENCE: Evidence = {
    source: "quant-panel-low-conviction",
    tier: "estimated",
    asOf: new Date().toISOString().slice(0, 10),
    personaFit: 0.3,
  };

  const quantByKey = new Map(quantOutput.dimensions.map((d) => [d.key, d]));

  const dimensions: VerdictDimension[] = OVERHEAD_DIMENSION_KEYS.map((key) => {
    const meta = OVERHEAD_DIMENSION_FIELDS[key];
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
  const cognitiveRunId = `overhead-p2-hf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  return buildAnalystVerdict({
    specialistId: "mgmt-co.overhead",
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

// ── Public entry point ───────────────────────────────────────────────────────

/**
 * Run the Phase 2 Overhead Specialist N+1 pipeline end-to-end.
 *
 * Returns a complete AnalystVerdict ready for the route handler. Throws
 * Tier1UnavailableError on any failure; caller degrades to Tier-0.
 */
export async function runOverheadSpecialist(
  ctx: OverheadPromptInputContext,
  benchmarks: OverheadBenchmarks,
  comparables: readonly OverheadComparableRow[],
  deps: RunOverheadSpecialistDeps = {},
): Promise<AnalystVerdict> {
  const startMs = Date.now();
  const marketCalibration = await resolveOverheadMarketBenchmarks(ctx.persona.locale);
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

  // ── Phase 0: Prompt Engineer pre-stage (IB req #8) ──────────────────────
  const peAbort = new AbortController();
  const peTimer = setTimeout(
    () =>
      peAbort.abort(
        new Error(`Overhead Phase 2 PE timed out after ${AI_GENERATION_TIMEOUT_MS / 1000}s`),
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
      `Overhead Phase 2 prompt engineer failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  // ── Phase 1: parallel panels ────────────────────────────────────────────
  const panelAbort = new AbortController();
  const panelTimer = setTimeout(
    () =>
      panelAbort.abort(
        new Error(`Overhead Phase 2 panels timed out after ${AI_GENERATION_TIMEOUT_MS / 1000}s`),
      ),
    AI_GENERATION_TIMEOUT_MS,
  );

  let quantOutput: QuantPanelOutput;
  let marketOutput: MarketPanelOutput;
  try {
    [quantOutput, marketOutput] = await Promise.all([
      runQuantPanel(
        ctx,
        benchmarks,
        comparables,
        marketCalibration,
        deps,
        panelAbort.signal,
        peOutput.quantAddendum,
      ),
      runMarketPanel(ctx, comparables, deps, panelAbort.signal, peOutput.marketAddendum),
    ]);
    clearTimeout(panelTimer);
  } catch (err: unknown) {
    clearTimeout(panelTimer);
    throw new Tier1UnavailableError(
      `Overhead Phase 2 panel phase failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  // ── Phase 2: convergence check (quant-conviction-only) ──────────────────
  // Convergence-fail is NOT a regress candidate — PE addenda cannot repair a
  // thin overhead comp set. Emit honest-fail immediately with regressCount=0.
  const avgQuantConviction = computeAvgQuantConviction(quantOutput);
  if (avgQuantConviction < convergenceMinConviction) {
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

  // ── Phase 3: synthesis + quality regress loop (IB req #9) ───────────────

  let regressCount = 0;
  let currentPeOutput = peOutput;
  let currentQuantOutput = quantOutput;
  let currentMarketOutput = marketOutput;

  let output!: OverheadSpecialistOutput;
  let cognitiveRunId = "";

  while (true) {
    const opusAbort = new AbortController();
    const opusTimer = setTimeout(
      () =>
        opusAbort.abort(
          new Error(`Overhead Phase 2 synthesis timed out after ${AI_GENERATION_TIMEOUT_MS / 1000}s`),
        ),
      AI_GENERATION_TIMEOUT_MS,
    );

    let loopOutput: OverheadSpecialistOutput;
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
        `Overhead Phase 2 synthesis failed: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }

    const validation = validateSynthesisOutput(loopOutput, comparables);
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
      () =>
        regressAbort.abort(
          new Error(
            `Overhead Phase 2 regress ${regressCount} timed out after ${AI_GENERATION_TIMEOUT_MS / 1000}s`,
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
        runMarketPanel(
          ctx,
          comparables,
          deps,
          regressAbort.signal,
          currentPeOutput.marketAddendum,
        ),
      ]);
      clearTimeout(regressTimer);
    } catch (err: unknown) {
      clearTimeout(regressTimer);
      throw new Tier1UnavailableError(
        `Overhead Phase 2 regress ${regressCount} phase failed: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  // ── Phase 4: assemble verdict ────────────────────────────────────────────
  try {
    const voiceRenderer = createVoiceRenderer();
    const rawByKey = new Map<OverheadDimensionKey, RawVerdictDimension>();
    const reasoningByKey = new Map<OverheadDimensionKey, string>();

    for (const llmDim of output.dimensions) {
      rawByKey.set(llmDim.key, llmDimensionToRaw(llmDim, ctx.inputs, comparables));
      reasoningByKey.set(llmDim.key, llmDim.reasoning);
    }

    const dimensions: VerdictDimension[] = OVERHEAD_DIMENSION_KEYS.map((key) => {
      const raw = rawByKey.get(key);
      const reasoning = reasoningByKey.get(key);
      if (!raw) {
        throw new Tier1UnavailableError(
          `Overhead Phase 2 missing dimension after schema parse: ${key}`,
          null,
        );
      }
      if (raw.evidence.length === 0) {
        throw new Tier1UnavailableError(
          `Overhead Phase 2 dimension ${key} emitted zero evidenceRefs; degrading to Tier-0`,
          null,
        );
      }
      return rawWithVoice(raw, reasoning ?? "", persona, voiceRenderer);
    });

    const surfaceVoice = voiceRenderer.renderSurface(dimensions);

    return buildAnalystVerdict({
      specialistId: "mgmt-co.overhead",
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
      `Overhead Phase 2 verdict assembly failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }
}
