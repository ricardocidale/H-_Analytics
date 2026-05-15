/**
 * runPropertyDefaultsSpecialist — N+1 pipeline producing a complete
 * AnalystVerdict for the Property Defaults tab (Phase 2 graduation).
 *
 * Mirrors mgmt-co-company-runner.ts — same N+1 architecture, same regress
 * loop, same vendor breadth. Property-Defaults-specific:
 *   - Persona: property underwriting defaults adequacy (event expense, other
 *     expense, utilities variable split, blended sales commission)
 *   - Comparables: property expense defaults rows (PropertyDefaultsComparableRow)
 *   - All 4 dimensions emit fractions (0.65 = 65%), not USD integers
 *
 * Phase 2 architecture (mirrors Overhead / Compensation / Revenue / Company):
 *   0. Prompt Engineer (Gemini Flash): adapts panel system prompts to
 *      operator-stage context → quantAddendum + marketAddendum (IB req #8)
 *   1. Parallel panels:
 *      - Gemini Flash (quantitative): low/mid/high fraction ranges +
 *        conviction grounded in property expense comparables
 *      - Claude Sonnet (market): LP-perception sentiment + event-cost /
 *        distribution-cost / utilities-variability risk flags + bias
 *   2. Convergence check (quant-conviction-only):
 *      avg(convictionScore × 4 dims) < CONVERGENCE_MIN_QUANT_CONVICTION → honest-fail
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
 *   - Same convergence threshold as all other mgmt-co P7-B Specialists (55).
 *   - No verdict cache yet.
 *   - No live AHLA/CBRE/Kalibri API yet — uses canned dataset.
 *   - Public function signature matches Company runner; route handler
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
} from "./mgmt-co-property-defaults-prompt-engineer";
import { validateSynthesisOutput } from "./mgmt-co-property-defaults-synthesis-validator";
import { AI_GENERATION_TIMEOUT_MS } from "../../constants";
import {
  buildPropertyDefaultsSystemPrompt,
  buildPropertyDefaultsUserPrompt,
} from "./mgmt-co-property-defaults-prompt";
import { lookupReferenceRange } from "../../storage/reference-range";
import {
  PropertyDefaultsSpecialistOutputSchema,
  type PropertyDefaultsSpecialistOutput,
} from "./mgmt-co-property-defaults-output-schema";
import {
  QuantPanelOutputSchema,
  type QuantPanelOutput,
} from "./mgmt-co-property-defaults-quant-panel-schema";
import {
  MarketPanelOutputSchema,
  type MarketPanelOutput,
} from "./mgmt-co-property-defaults-market-panel-schema";
import {
  buildQuantPanelSystemPrompt,
  buildQuantPanelUserPrompt,
} from "./mgmt-co-property-defaults-quant-panel-prompt";
import {
  buildMarketPanelSystemPrompt,
  buildMarketPanelUserPrompt,
} from "./mgmt-co-property-defaults-market-panel-prompt";
import {
  type PropertyDefaultsComparableRow,
  propertyDefaultsComparableToEvidence,
} from "./mgmt-co-property-defaults-orchestrator-adapter";
import {
  type PropertyDefaultsPromptInputContext,
  type PropertyDefaultsDimensionKey,
  PROPERTY_DEFAULTS_DIMENSION_KEYS,
} from "./mgmt-co-property-defaults-prompt-input-builder";
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
import type { PropertyDefaultsBenchmarks } from "@shared/model-constants-registry";
import { getFieldRegistryEntry } from "@engine/analyst/registry/field-registry";
import type { MarketBenchmarkEntry } from "./market-benchmark-types";
import { getParameterValue } from "../parameter-resolver";

// ── Token budgets ────────────────────────────────────────────────────────────

const PROPERTY_DEFAULTS_MAX_OUTPUT_TOKENS = 3_500;
const PANEL_MAX_OUTPUT_TOKENS = 1_800;
const MARKET_PANEL_MAX_OUTPUT_TOKENS = 1_400;
const PROMPT_ENGINEER_MAX_OUTPUT_TOKENS = 600;

// ── Convergence policy ───────────────────────────────────────────────────────

/**
 * Same threshold as all other mgmt-co P7-B Specialists (55). The 12-comp
 * dataset spans US / Latam / Med-Europe × boutique-luxury / wellness /
 * lifestyle — same distribution shape as Company and Overhead.
 */
const CONVERGENCE_MIN_QUANT_CONVICTION = 55;

/** Maximum synthesis regress iterations. 0 = first-pass success, 2 = exhausted. */
const MAX_SYNTHESIS_REGRESSES = 2;

const PROPERTY_DEFAULTS_DIMENSION_FIELDS: Readonly<
  Record<PropertyDefaultsDimensionKey, { field: string }>
> = {
  eventExpenseRate: { field: "eventExpenseRate" },
  otherExpenseRate: { field: "otherExpenseRate" },
  utilitiesVariableSplit: { field: "utilitiesVariableSplit" },
  salesCommissionRate: { field: "salesCommissionRate" },
};

// ── Pure helpers ─────────────────────────────────────────────────────────────

function unitFor(field: string): string {
  const entry = getFieldRegistryEntry(field);
  if (!entry) {
    throw new Error(
      `PropertyDefaults runner: no FIELD_REGISTRY entry for field "${field}". Add one to engine/analyst/registry/field-registry.ts.`,
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
  comparables: readonly PropertyDefaultsComparableRow[],
): Evidence[] {
  return evidenceRefs
    .filter((idx) => idx >= 0 && idx < comparables.length)
    .map((idx) => propertyDefaultsComparableToEvidence(comparables[idx]));
}

function llmDimensionToRaw(
  llmDim: PropertyDefaultsSpecialistOutput["dimensions"][number],
  inputs: PropertyDefaultsPromptInputContext["inputs"],
  comparables: readonly PropertyDefaultsComparableRow[],
): RawVerdictDimension {
  const meta = PROPERTY_DEFAULTS_DIMENSION_FIELDS[llmDim.key];
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

function asPersonaContext(
  persona: PropertyDefaultsPromptInputContext["persona"],
): PersonaContext {
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

function buildMarketEnrichmentBlock(market: MarketPanelOutput): string {
  const dims = market.dimensions
    .map((d) => {
      const flags =
        d.lpRiskFlags.length > 0
          ? `\n      LP / cost-structure / distribution flags: ${d.lpRiskFlags.map((f) => `"${f}"`).join(", ")}`
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

export interface RunPropertyDefaultsSpecialistDeps {
  getAnthropicModel?: (modelId: string) => ReturnType<ReturnType<typeof createAnthropic>>;
  getGoogleModel?: (modelId: string) => ReturnType<ReturnType<typeof createGoogleGenerativeAI>>;
  now?: Date;
}

// ── Market benchmark lookup ──────────────────────────────────────────────────

async function resolvePropertyDefaultsMarketBenchmarks(
  locale: string | undefined,
): Promise<MarketBenchmarkEntry[]> {
  if (!locale) return [];
  const c = locale.toUpperCase();
  const lookups: Array<{ domain: "kpi"; metricKey: string }> = [
    { domain: "kpi", metricKey: "revpar" },
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
  ctx: PropertyDefaultsPromptInputContext,
  comparables: readonly PropertyDefaultsComparableRow[],
  deps: RunPropertyDefaultsSpecialistDeps,
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

  const runId = `pe-property-defaults-p2-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return { output: object, runId };
}

async function runQuantPanel(
  ctx: PropertyDefaultsPromptInputContext,
  benchmarks: PropertyDefaultsBenchmarks,
  comparables: readonly PropertyDefaultsComparableRow[],
  marketCalibration: MarketBenchmarkEntry[],
  deps: RunPropertyDefaultsSpecialistDeps,
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
  ctx: PropertyDefaultsPromptInputContext,
  comparables: readonly PropertyDefaultsComparableRow[],
  deps: RunPropertyDefaultsSpecialistDeps,
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
  ctx: PropertyDefaultsPromptInputContext,
  benchmarks: PropertyDefaultsBenchmarks,
  comparables: readonly PropertyDefaultsComparableRow[],
  marketCalibration: MarketBenchmarkEntry[],
  marketContext: MarketPanelOutput,
  deps: RunPropertyDefaultsSpecialistDeps,
  abortSignal: AbortSignal,
): Promise<{ output: PropertyDefaultsSpecialistOutput; cognitiveRunId: string }> {
  const systemPrompt = buildPropertyDefaultsSystemPrompt();
  const baseUserPrompt = buildPropertyDefaultsUserPrompt(
    ctx,
    benchmarks,
    comparables,
    marketCalibration,
  );
  const enrichedUserPrompt = `${baseUserPrompt}\n\n${buildMarketEnrichmentBlock(marketContext)}`;

  const { modelId: specialistModelId } = await resolveLlmFor("specialist-primary");
  const anthropicFactory = deps.getAnthropicModel ?? createAnthropic();
  const result = streamObject({
    model: anthropicFactory(specialistModelId),
    schema: PropertyDefaultsSpecialistOutputSchema,
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
    maxOutputTokens: PROPERTY_DEFAULTS_MAX_OUTPUT_TOKENS,
    abortSignal,
  });

  for await (const _partial of result.partialObjectStream) {
    void _partial;
  }
  const output = await result.object;
  const cognitiveRunId = `property-defaults-p2-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return { output, cognitiveRunId };
}

// ── Honest-fail verdict builder ──────────────────────────────────────────────

function buildHonestFailVerdict(
  quantOutput: QuantPanelOutput,
  comparables: readonly PropertyDefaultsComparableRow[],
  ctx: PropertyDefaultsPromptInputContext,
  persona: PersonaContext,
  deps: RunPropertyDefaultsSpecialistDeps,
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

  const dimensions: VerdictDimension[] = PROPERTY_DEFAULTS_DIMENSION_KEYS.map((key) => {
    const meta = PROPERTY_DEFAULTS_DIMENSION_FIELDS[key];
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
      qualityScore: 35,
      evidence,
      intent: "missing-data",
      actions: [],
    };

    return rawWithVoice(raw, "", persona, voiceRenderer);
  });

  const surfaceVoice = voiceRenderer.renderSurface(dimensions);
  const cognitiveRunId = `property-defaults-p2-hf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  return buildAnalystVerdict({
    specialistId: "mgmt-co.property-defaults",
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
 * Run the Phase 2 Property-Defaults Specialist N+1 pipeline end-to-end.
 *
 * Returns a complete AnalystVerdict ready for the route handler. Throws
 * Tier1UnavailableError on any failure; caller degrades to Tier-0.
 */
export async function runPropertyDefaultsSpecialist(
  ctx: PropertyDefaultsPromptInputContext,
  benchmarks: PropertyDefaultsBenchmarks,
  comparables: readonly PropertyDefaultsComparableRow[],
  deps: RunPropertyDefaultsSpecialistDeps = {},
): Promise<AnalystVerdict> {
  const startMs = Date.now();
  const marketCalibration = await resolvePropertyDefaultsMarketBenchmarks(ctx.persona.locale);
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
        new Error(
          `PropertyDefaults Phase 2 PE timed out after ${AI_GENERATION_TIMEOUT_MS / 1000}s`,
        ),
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
      `PropertyDefaults Phase 2 prompt engineer failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  // ── Phase 1: parallel panels ────────────────────────────────────────────
  const panelAbort = new AbortController();
  const panelTimer = setTimeout(
    () =>
      panelAbort.abort(
        new Error(
          `PropertyDefaults Phase 2 panels timed out after ${AI_GENERATION_TIMEOUT_MS / 1000}s`,
        ),
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
      `PropertyDefaults Phase 2 panel phase failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  // ── Phase 2: convergence check (quant-conviction-only) ──────────────────
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

  let output!: PropertyDefaultsSpecialistOutput;
  let cognitiveRunId = "";

  while (true) {
    const opusAbort = new AbortController();
    const opusTimer = setTimeout(
      () =>
        opusAbort.abort(
          new Error(
            `PropertyDefaults Phase 2 synthesis timed out after ${AI_GENERATION_TIMEOUT_MS / 1000}s`,
          ),
        ),
      AI_GENERATION_TIMEOUT_MS,
    );

    let loopOutput: PropertyDefaultsSpecialistOutput;
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
        `PropertyDefaults Phase 2 synthesis failed: ${err instanceof Error ? err.message : String(err)}`,
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
            `PropertyDefaults Phase 2 regress ${regressCount} timed out after ${AI_GENERATION_TIMEOUT_MS / 1000}s`,
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
        `PropertyDefaults Phase 2 regress ${regressCount} phase failed: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  // ── Phase 4: assemble verdict ────────────────────────────────────────────
  try {
    const voiceRenderer = createVoiceRenderer();
    const rawByKey = new Map<PropertyDefaultsDimensionKey, RawVerdictDimension>();
    const reasoningByKey = new Map<PropertyDefaultsDimensionKey, string>();

    for (const llmDim of output.dimensions) {
      rawByKey.set(llmDim.key, llmDimensionToRaw(llmDim, ctx.inputs, comparables));
      reasoningByKey.set(llmDim.key, llmDim.reasoning);
    }

    const dimensions: VerdictDimension[] = PROPERTY_DEFAULTS_DIMENSION_KEYS.map((key) => {
      const raw = rawByKey.get(key);
      const reasoning = reasoningByKey.get(key);
      if (!raw) {
        throw new Tier1UnavailableError(
          `PropertyDefaults Phase 2 missing dimension after schema parse: ${key}`,
          null,
        );
      }
      if (raw.evidence.length === 0) {
        throw new Tier1UnavailableError(
          `PropertyDefaults Phase 2 dimension ${key} emitted zero evidenceRefs; degrading to Tier-0`,
          null,
        );
      }
      return rawWithVoice(raw, reasoning ?? "", persona, voiceRenderer);
    });

    const surfaceVoice = voiceRenderer.renderSurface(dimensions);

    return buildAnalystVerdict({
      specialistId: "mgmt-co.property-defaults",
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
      `PropertyDefaults Phase 2 verdict assembly failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }
}
