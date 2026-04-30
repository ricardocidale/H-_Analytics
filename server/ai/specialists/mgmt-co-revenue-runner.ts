/**
 * runRevenueSpecialist — single-shot Opus call producing a complete
 * AnalystVerdict for the Revenue tab (G2-v1).
 *
 * Mirrors mgmt-co-funding-runner.ts (G1.5c-v1) — same v1 architecture,
 * same error handling, same verdict assembly pattern.
 *
 * v1 architecture:
 *   1. Build system + user prompts via mgmt-co-revenue-prompt
 *   2. Call Opus via Vercel AI SDK streamObject with RevenueSpecialistOutputSchema
 *   3. Map structured output → RawVerdictDimension[] (one per revenue key)
 *   4. Run Voice Renderer per dimension + surface
 *   5. Build AnalystVerdict via buildAnalystVerdict (invariant-checked)
 *   6. Return verdict; route handler returns it as 200 response body
 *
 * v1 deferrals:
 *   - N+1 cross-vendor synthesis (G6-P2)
 *   - Verdict cache (G6-P3)
 *   - Regress loop on quality fail (G6-P3)
 *   - Live STR / HVS comparables (G6-P3)
 *   - Persona resolution (G6-P3)
 *
 * Errors throw `Tier1UnavailableError`; the route handler catches and
 * degrades to Tier-0 fallback per ADR-008.
 */

import { streamObject } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { DEFAULT_FUNDING_SPECIALIST_MODEL } from "@shared/constants";
import { AI_GENERATION_TIMEOUT_MS } from "../../constants";
import {
  buildRevenueSystemPrompt,
  buildRevenueUserPrompt,
} from "./mgmt-co-revenue-prompt";
import { lookupReferenceRange } from "../../storage/reference-range";
import {
  RevenueSpecialistOutputSchema,
  type RevenueSpecialistOutput,
} from "./mgmt-co-revenue-output-schema";
import {
  type RevenueComparableRow,
  revenueComparableToEvidence,
} from "./mgmt-co-revenue-orchestrator-adapter";
import {
  type RevenuePromptInputContext,
  type RevenueDimensionKey,
  REVENUE_DIMENSION_KEYS,
} from "./mgmt-co-revenue-prompt-input-builder";
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
} from "../../../engine/analyst/contracts/verdict";
import { createVoiceRenderer } from "../../../engine/analyst/voice/voice-renderer";
import type { RevenueBenchmarks } from "@shared/constants-revenue-benchmarks";
import { getFieldRegistryEntry } from "../../../engine/analyst/registry/field-registry";
import type { MarketBenchmarkEntry } from "./market-benchmark-types";

// Revenue v1 uses the same Opus model as Funding v1 per the LLM vendor roster
// (Opus 4.7 for synthesis/verdict-final). Alias avoids a separate constant.
const REVENUE_MODEL_ID = DEFAULT_FUNDING_SPECIALIST_MODEL;
const REVENUE_MAX_OUTPUT_TOKENS = 4_000;

/**
 * Per-key form-field id the Revenue tab's `<input data-field="...">` dialog
 * scrolls to. Dimension display units resolved from FIELD_REGISTRY via
 * `unitFor` — same discipline as funding-runner.ts and revenue-specialist.ts.
 */
const REVENUE_DIMENSION_FIELDS: Readonly<Record<RevenueDimensionKey, { field: string }>> = {
  marketingRate: { field: "defaultCostRateMarketing" },
  fbRevenueShare: { field: "defaultRevShareFb" },
  eventsRevenueShare: { field: "defaultRevShareEvents" },
  otherRevenueShare: { field: "defaultRevShareOther" },
  cateringBoostPct: { field: "defaultCateringBoostPct" },
};

function unitFor(field: string): string {
  const entry = getFieldRegistryEntry(field);
  if (!entry) {
    throw new Error(
      `Revenue v1 runner: no FIELD_REGISTRY entry for field "${field}". Add one to engine/analyst/registry/field-registry.ts so the Voice Renderer formats this dimension consistently.`,
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
  comparables: readonly RevenueComparableRow[],
): Evidence[] {
  return evidenceRefs
    .filter((idx) => idx >= 0 && idx < comparables.length)
    .map((idx) => revenueComparableToEvidence(comparables[idx]));
}

function llmDimensionToRaw(
  llmDim: RevenueSpecialistOutput["dimensions"][number],
  inputs: RevenuePromptInputContext["inputs"],
  comparables: readonly RevenueComparableRow[],
): RawVerdictDimension {
  const meta = REVENUE_DIMENSION_FIELDS[llmDim.key];
  const range: VerdictRange = {
    low: llmDim.low,
    mid: llmDim.mid,
    high: llmDim.high,
    unit: unitFor(meta.field),
  };
  const userValue =
    (inputs as Record<string, number | null | undefined>)[llmDim.key] ?? null;
  const severity = deriveSeverity(userValue, range);
  const intent = deriveIntent(userValue, range);
  const evidence = buildEvidenceForDimension(llmDim.evidenceRefs, comparables);
  const qualityScore = convictionToQualityScore(llmDim.conviction);

  return {
    field: meta.field,
    isNumericField: true,
    severity,
    range,
    qualityScore,
    evidence,
    intent,
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

function asPersonaContext(persona: RevenuePromptInputContext["persona"]): PersonaContext {
  return {
    segment: persona.verticalSlug,
    tier: persona.marketTier,
    market: persona.locale,
  };
}

/**
 * Typed error thrown when the v1 runner cannot produce a Tier-1 verdict.
 * Route handler catches and degrades to Tier-0 fallback per ADR-008.
 */
export class Tier1UnavailableError extends Error {
  readonly cause: unknown;
  constructor(message: string, cause: unknown) {
    super(message);
    this.name = "Tier1UnavailableError";
    this.cause = cause;
  }
}

export interface RunRevenueSpecialistDeps {
  /** Optional override for the Anthropic model factory (tests inject stubs). */
  getAnthropicModel?: (modelId: string) => ReturnType<ReturnType<typeof createAnthropic>>;
  /** Optional reference time for verdict generatedAt; tests pass a fixed Date. */
  now?: Date;
}

/**
 * Look up KPI and demand benchmarks from `reference_range` for the operator's
 * locale. Provides market calibration context to the Revenue prompt (ADR, RevPAR,
 * demand seasonality). Failures silently swallowed — missing benchmarks should
 * not block the verdict.
 */
async function resolveRevenueMarketBenchmarks(
  locale: string | undefined,
): Promise<MarketBenchmarkEntry[]> {
  if (!locale) return [];
  const c = locale.toUpperCase();
  const lookups: Array<{ domain: "kpi" | "demand"; metricKey: string }> = [
    { domain: "kpi", metricKey: "gopMargin" },
    { domain: "kpi", metricKey: "revpar" },
    { domain: "demand", metricKey: "revpar-seasonality" },
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

/**
 * Run the v1 Revenue Specialist end-to-end.
 *
 * Returns a complete AnalystVerdict ready for the route handler to send
 * back to the client. Throws Tier1UnavailableError on any failure;
 * caller is responsible for degrading to Tier-0.
 */
export async function runRevenueSpecialist(
  ctx: RevenuePromptInputContext,
  benchmarks: RevenueBenchmarks,
  comparables: readonly RevenueComparableRow[],
  deps: RunRevenueSpecialistDeps = {},
): Promise<AnalystVerdict> {
  const marketCalibration = await resolveRevenueMarketBenchmarks(ctx.persona.locale);
  const systemPrompt = buildRevenueSystemPrompt();
  const userPrompt = buildRevenueUserPrompt(ctx, benchmarks, comparables, marketCalibration);
  const persona = asPersonaContext(ctx.persona);

  const modelFactory = deps.getAnthropicModel ?? createAnthropic();

  let output: RevenueSpecialistOutput;
  let cognitiveRunId: string;
  const opusAbort = new AbortController();
  const opusTimer = setTimeout(
    () => opusAbort.abort(new Error(`Revenue v1 Opus timed out after ${AI_GENERATION_TIMEOUT_MS / 1000}s`)),
    AI_GENERATION_TIMEOUT_MS,
  );
  try {
    // TODO (Revenue N+1 graduation — phase TBD, see phases.md; G6-P2 was Funding-only)
    const result = streamObject({
      model: modelFactory(REVENUE_MODEL_ID),
      schema: RevenueSpecialistOutputSchema,
      messages: [
        {
          role: "system",
          content: systemPrompt,
          providerOptions: {
            anthropic: { cacheControl: { type: "ephemeral" } },
          },
        },
        { role: "user", content: userPrompt },
      ],
      maxOutputTokens: REVENUE_MAX_OUTPUT_TOKENS,
      abortSignal: opusAbort.signal,
    });

    for await (const _partial of result.partialObjectStream) {
      void _partial;
    }
    output = await result.object;
    clearTimeout(opusTimer);

    // TODO (Revenue N+1 graduation — phase TBD) replace with real orchestrator cognitiveRunId
    cognitiveRunId = `revenue-v1-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  } catch (err: unknown) {
    clearTimeout(opusTimer);
    throw new Tier1UnavailableError(
      `Revenue v1 cognitive call failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  try {
    const voiceRenderer = createVoiceRenderer();
    const rawByKey = new Map<RevenueDimensionKey, RawVerdictDimension>();
    const reasoningByKey = new Map<RevenueDimensionKey, string>();

    for (const llmDim of output.dimensions) {
      const raw = llmDimensionToRaw(llmDim, ctx.inputs, comparables);
      rawByKey.set(llmDim.key, raw);
      reasoningByKey.set(llmDim.key, llmDim.reasoning);
    }

    const dimensions: VerdictDimension[] = REVENUE_DIMENSION_KEYS.map((key) => {
      const raw = rawByKey.get(key);
      const reasoning = reasoningByKey.get(key);
      if (!raw) {
        throw new Tier1UnavailableError(
          `Revenue v1 missing dimension after schema parse: ${key}`,
          null,
        );
      }
      if (raw.evidence.length === 0) {
        throw new Tier1UnavailableError(
          `Revenue v1 dimension ${key} emitted zero evidenceRefs; degrading to Tier-0`,
          null,
        );
      }
      return rawWithVoice(raw, reasoning ?? "", persona, voiceRenderer);
    });

    const surfaceVoice = voiceRenderer.renderSurface(dimensions);

    return buildAnalystVerdict({
      specialistId: "mgmt-co.revenue",
      dimensions,
      surfaceVoice,
      meta: {
        tier: 1,
        durationMs: 0,
        cognitiveRunId,
        // TODO (Revenue N+1 graduation — phase TBD) populate vendorsUsed once
        // N+1 panels land. Omit in v1 (single-vendor Anthropic Opus) to avoid
        // violating the ≥2-vendor invariant that fires when vendorsUsed is set.
        // vendorsUsed: omitted in v1
        // TODO G6-P3 — cacheState becomes "hit" | "miss" once verdict cache
        // read path is wired (ADR-004 §4). v1 honestly emits "miss".
        cacheState: "miss",
      },
      generatedAt: deps.now ? deps.now.toISOString() : undefined,
    });
  } catch (err: unknown) {
    if (err instanceof Tier1UnavailableError) throw err;
    throw new Tier1UnavailableError(
      `Revenue v1 post-stream assembly failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }
}
