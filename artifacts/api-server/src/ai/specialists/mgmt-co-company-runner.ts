/**
 * runCompanySpecialist — N+1 pipeline producing a complete AnalystVerdict
 * for the Company tab (Phase 2 graduation).
 *
 * Mirrors mgmt-co-overhead-runner.ts — same N+1 architecture, same regress
 * loop, same vendor breadth. Company-specific:
 *   - Persona: management fee structure + effective tax rate + cost-of-equity
 *     defensibility (not corporate overhead structure)
 *   - Comparables: ManCo financial rows (CompanyComparableRow)
 *   - All 4 dimensions emit fractions (0.08 = 8%), not USD integers
 *
 * Phase 2 architecture (mirrors Overhead / Compensation / Revenue):
 *   0. Prompt Engineer (Gemini Flash): adapts panel system prompts to
 *      operator-stage context → quantAddendum + marketAddendum (IB req #8)
 *   1. Parallel panels:
 *      - Gemini Flash (quantitative): low/mid/high fraction ranges +
 *        conviction grounded in ManCo financial comparables
 *      - Claude Sonnet (market): LP-perception sentiment + fee-alignment /
 *        tax-scrutiny / DCF-hurdle risk flags + bias
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
 *   - Same convergence threshold as Funding/Revenue/Compensation/Overhead (55).
 *     The 12-comp dataset spans founder-led / expansion / institutional ×
 *     US / Latam / Med-Europe — same distribution shape.
 *   - No verdict cache yet (ADR-004 / G6-P3c equivalent for Company).
 *   - No live CBRE/HVS/Damodaran API yet — uses canned CompanyComparableRow set.
 *   - Public function signature matches Overhead runner; route handler
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
} from "./mgmt-co-company-prompt-engineer";
import { validateSynthesisOutput } from "./mgmt-co-company-synthesis-validator";
import { AI_GENERATION_TIMEOUT_MS } from "../../constants";
import {
  buildCompanySystemPrompt,
  buildCompanyUserPrompt,
} from "./mgmt-co-company-prompt";
import { lookupReferenceRange } from "../../storage/reference-range";
import {
  CompanySpecialistOutputSchema,
  type CompanySpecialistOutput,
} from "./mgmt-co-company-output-schema";
import {
  QuantPanelOutputSchema,
  type QuantPanelOutput,
} from "./mgmt-co-company-quant-panel-schema";
import {
  MarketPanelOutputSchema,
  type MarketPanelOutput,
} from "./mgmt-co-company-market-panel-schema";
import {
  buildQuantPanelSystemPrompt,
  buildQuantPanelUserPrompt,
} from "./mgmt-co-company-quant-panel-prompt";
import {
  buildMarketPanelSystemPrompt,
  buildMarketPanelUserPrompt,
} from "./mgmt-co-company-market-panel-prompt";
import {
  type CompanyComparableRow,
  companyComparableToEvidence,
} from "./mgmt-co-company-orchestrator-adapter";
import {
  type CompanyPromptInputContext,
  type CompanyDimensionKey,
  COMPANY_DIMENSION_KEYS,
} from "./mgmt-co-company-prompt-input-builder";
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
import type { CompanyBenchmarks } from "@shared/constants-company-benchmarks";
import { getFieldRegistryEntry } from "@engine/analyst/registry/field-registry";
import type { MarketBenchmarkEntry } from "./market-benchmark-types";

// ── Token budgets ────────────────────────────────────────────────────────────

const COMPANY_MAX_OUTPUT_TOKENS = 3_500;
const PANEL_MAX_OUTPUT_TOKENS = 1_800;
const MARKET_PANEL_MAX_OUTPUT_TOKENS = 1_400;
const PROMPT_ENGINEER_MAX_OUTPUT_TOKENS = 600;

// ── Convergence policy ───────────────────────────────────────────────────────

/**
 * Same threshold as Funding/Revenue/Compensation/Overhead (55). Company's
 * 12-comp dataset spans founder/expansion/institutional × US/Latam/Med-Europe
 * — same distribution shape. Revisit if telemetry shows persistent
 * mode-collapse on the convergence side.
 */
const CONVERGENCE_MIN_QUANT_CONVICTION = 55;

/** Maximum synthesis regress iterations. 0 = first-pass success, 2 = exhausted. */
const MAX_SYNTHESIS_REGRESSES = 2;

/**
 * Per-key form-field id the Company tab's `<input data-field="...">` dialog
 * scrolls to. Dimension display units resolved from FIELD_REGISTRY via
 * `unitFor`.
 */
const COMPANY_DIMENSION_FIELDS: Readonly<Record<CompanyDimensionKey, { field: string }>> = {
  baseManagementFee: { field: "baseManagementFee" },
  incentiveManagementFee: { field: "incentiveManagementFee" },
  companyTaxRate: { field: "companyTaxRate" },
  costOfEquity: { field: "costOfEquity" },
};

// ── Pure helpers ─────────────────────────────────────────────────────────────

function unitFor(field: string): string {
  const entry = getFieldRegistryEntry(field);
  if (!entry) {
    throw new Error(
      `Company runner: no FIELD_REGISTRY entry for field "${field}". Add one to engine/analyst/registry/field-registry.ts.`,
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
  comparables: readonly CompanyComparableRow[],
): Evidence[] {
  return evidenceRefs
    .filter((idx) => idx >= 0 && idx < comparables.length)
    .map((idx) => companyComparableToEvidence(comparables[idx]));
}

function llmDimensionToRaw(
  llmDim: CompanySpecialistOutput["dimensions"][number],
  inputs: CompanyPromptInputContext["inputs"],
  comparables: readonly CompanyComparableRow[],
): RawVerdictDimension {
  const meta = COMPANY_DIMENSION_FIELDS[llmDim.key];
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

function asPersonaContext(persona: CompanyPromptInputContext["persona"]): PersonaContext {
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
          ? `\n      LP / fee-alignment / tax / DCF flags: ${d.lpRiskFlags.map((f) => `"${f}"`).join(", ")}`
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

export interface RunCompanySpecialistDeps {
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
 * Provides ManCo fee-share grounding (GOP margin) so the synthesis prompt
 * can reason about fee share at scale. Failures silently swallowed.
 */
async function resolveCompanyMarketBenchmarks(
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
  ctx: CompanyPromptInputContext,
  comparables: readonly CompanyComparableRow[],
  deps: RunCompanySpecialistDeps,
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

  const runId = `pe-company-p2-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return { output: object, runId };
}

async function runQuantPanel(
  ctx: CompanyPromptInputContext,
  benchmarks: CompanyBenchmarks,
  comparables: readonly CompanyComparableRow[],
  marketCalibration: MarketBenchmarkEntry[],
  deps: RunCompanySpecialistDeps,
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
  ctx: CompanyPromptInputContext,
  comparables: readonly CompanyComparableRow[],
  deps: RunCompanySpecialistDeps,
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
  ctx: CompanyPromptInputContext,
  benchmarks: CompanyBenchmarks,
  comparables: readonly CompanyComparableRow[],
  marketCalibration: MarketBenchmarkEntry[],
  marketContext: MarketPanelOutput,
  deps: RunCompanySpecialistDeps,
  abortSignal: AbortSignal,
): Promise<{ output: CompanySpecialistOutput; cognitiveRunId: string }> {
  const systemPrompt = buildCompanySystemPrompt();
  const baseUserPrompt = buildCompanyUserPrompt(ctx, benchmarks, comparables, marketCalibration);
  const enrichedUserPrompt = `${baseUserPrompt}\n\n${buildMarketEnrichmentBlock(marketContext)}`;

  const { modelId: specialistModelId } = await resolveLlmFor("specialist-primary");
  const anthropicFactory = deps.getAnthropicModel ?? createAnthropic();
  const result = streamObject({
    model: anthropicFactory(specialistModelId),
    schema: CompanySpecialistOutputSchema,
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
    maxOutputTokens: COMPANY_MAX_OUTPUT_TOKENS,
    abortSignal,
  });

  for await (const _partial of result.partialObjectStream) {
    void _partial;
  }
  const output = await result.object;
  const cognitiveRunId = `company-p2-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return { output, cognitiveRunId };
}

// ── Honest-fail verdict builder ──────────────────────────────────────────────

function buildHonestFailVerdict(
  quantOutput: QuantPanelOutput,
  comparables: readonly CompanyComparableRow[],
  ctx: CompanyPromptInputContext,
  persona: PersonaContext,
  deps: RunCompanySpecialistDeps,
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

  const dimensions: VerdictDimension[] = COMPANY_DIMENSION_KEYS.map((key) => {
    const meta = COMPANY_DIMENSION_FIELDS[key];
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
  const cognitiveRunId = `company-p2-hf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  return buildAnalystVerdict({
    specialistId: "mgmt-co.company",
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
 * Run the Phase 2 Company Specialist N+1 pipeline end-to-end.
 *
 * Returns a complete AnalystVerdict ready for the route handler. Throws
 * Tier1UnavailableError on any failure; caller degrades to Tier-0.
 */
export async function runCompanySpecialist(
  ctx: CompanyPromptInputContext,
  benchmarks: CompanyBenchmarks,
  comparables: readonly CompanyComparableRow[],
  deps: RunCompanySpecialistDeps = {},
): Promise<AnalystVerdict> {
  const startMs = Date.now();
  const marketCalibration = await resolveCompanyMarketBenchmarks(ctx.persona.locale);
  const persona = asPersonaContext(ctx.persona);

  // ── Phase 0: Prompt Engineer pre-stage (IB req #8) ──────────────────────
  const peAbort = new AbortController();
  const peTimer = setTimeout(
    () =>
      peAbort.abort(
        new Error(`Company Phase 2 PE timed out after ${AI_GENERATION_TIMEOUT_MS / 1000}s`),
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
      `Company Phase 2 prompt engineer failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  // ── Phase 1: parallel panels ────────────────────────────────────────────
  const panelAbort = new AbortController();
  const panelTimer = setTimeout(
    () =>
      panelAbort.abort(
        new Error(`Company Phase 2 panels timed out after ${AI_GENERATION_TIMEOUT_MS / 1000}s`),
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
      `Company Phase 2 panel phase failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  // ── Phase 2: convergence check (quant-conviction-only) ──────────────────
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

  // ── Phase 3: synthesis + quality regress loop (IB req #9) ───────────────

  let regressCount = 0;
  let currentPeOutput = peOutput;
  let currentQuantOutput = quantOutput;
  let currentMarketOutput = marketOutput;

  let output!: CompanySpecialistOutput;
  let cognitiveRunId = "";

  while (true) {
    const opusAbort = new AbortController();
    const opusTimer = setTimeout(
      () =>
        opusAbort.abort(
          new Error(`Company Phase 2 synthesis timed out after ${AI_GENERATION_TIMEOUT_MS / 1000}s`),
        ),
      AI_GENERATION_TIMEOUT_MS,
    );

    let loopOutput: CompanySpecialistOutput;
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
        `Company Phase 2 synthesis failed: ${err instanceof Error ? err.message : String(err)}`,
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
            `Company Phase 2 regress ${regressCount} timed out after ${AI_GENERATION_TIMEOUT_MS / 1000}s`,
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
        `Company Phase 2 regress ${regressCount} phase failed: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  // ── Phase 4: assemble verdict ────────────────────────────────────────────
  try {
    const voiceRenderer = createVoiceRenderer();
    const rawByKey = new Map<CompanyDimensionKey, RawVerdictDimension>();
    const reasoningByKey = new Map<CompanyDimensionKey, string>();

    for (const llmDim of output.dimensions) {
      rawByKey.set(llmDim.key, llmDimensionToRaw(llmDim, ctx.inputs, comparables));
      reasoningByKey.set(llmDim.key, llmDim.reasoning);
    }

    const dimensions: VerdictDimension[] = COMPANY_DIMENSION_KEYS.map((key) => {
      const raw = rawByKey.get(key);
      const reasoning = reasoningByKey.get(key);
      if (!raw) {
        throw new Tier1UnavailableError(
          `Company Phase 2 missing dimension after schema parse: ${key}`,
          null,
        );
      }
      if (raw.evidence.length === 0) {
        throw new Tier1UnavailableError(
          `Company Phase 2 dimension ${key} emitted zero evidenceRefs; degrading to Tier-0`,
          null,
        );
      }
      return rawWithVoice(raw, reasoning ?? "", persona, voiceRenderer);
    });

    const surfaceVoice = voiceRenderer.renderSurface(dimensions);

    return buildAnalystVerdict({
      specialistId: "mgmt-co.company",
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
      `Company Phase 2 verdict assembly failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }
}
