/**
 * runFundingSpecialist — single-shot Opus call producing a complete
 * AnalystVerdict for the Funding tab (G1.5c-v1).
 *
 * v1 architecture:
 *   1. Build system + user prompts via mgmt-co-funding-prompt
 *   2. Call Opus via Vercel AI SDK streamObject with FundingSpecialistOutputSchema
 *   3. Map structured output → RawVerdictDimension[] (one per funding key)
 *   4. Run Voice Renderer per dimension + surface
 *   5. Build AnalystVerdict via buildAnalystVerdict (invariant-checked)
 *   6. Return verdict; route handler returns it as 200 response body
 *
 * v1 deferrals (per .claude/replit-handoffs/g1.5c-v1-funding-specialist.md):
 *   - N+1 cross-vendor synthesis (G6-P2)
 *   - Verdict cache (G6-P3)
 *   - Regress loop on quality fail (G6-P3)
 *   - Live LP comparables (G6-P3)
 *   - Persona resolution (G6-P3)
 *
 * Errors throw `Tier1UnavailableError` typed at this layer; the route
 * handler catches and degrades to Tier-0 fallback per ADR-008.
 */

import { streamObject } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { DEFAULT_FUNDING_SPECIALIST_MODEL } from "@shared/constants";
import { AI_GENERATION_TIMEOUT_MS } from "../../constants";
import {
  buildFundingSystemPrompt,
  buildFundingUserPrompt,
} from "./mgmt-co-funding-prompt";
import {
  FundingSpecialistOutputSchema,
  type FundingSpecialistOutput,
} from "./mgmt-co-funding-output-schema";
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
} from "../../../engine/analyst/contracts/verdict";
import { createVoiceRenderer } from "../../../engine/analyst/voice/voice-renderer";
import type { AnalystWatchdogBenchmarks } from "@shared/schema";

const FUNDING_MODEL_ID = DEFAULT_FUNDING_SPECIALIST_MODEL;
const FUNDING_MAX_OUTPUT_TOKENS = 4_000;

/**
 * Per-key form-field id (matches the Funding tab's `<input data-field="...">`)
 * and unit. Mirrors `DIMENSION_META` in funding-specialist.ts but kept local
 * so the runner doesn't depend on the Specialist's private internals.
 */
const FUNDING_DIMENSION_FIELDS: Readonly<Record<FundingDimensionKey, { field: string; unit: "mo" | "%" }>> = {
  runwayBufferMonths: { field: "capitalRaise1Amount", unit: "mo" },
  sizingOvershootPct: { field: "capitalRaise2Amount", unit: "%" },
  trancheGapMonths: { field: "capitalRaise2Date", unit: "mo" },
  revenueRampDelayMonths: { field: "revenueRampDelayMonths", unit: "mo" },
  burnFlexDownPct: { field: "burnFlexDownPct", unit: "%" },
};

/**
 * Maps the LLM's three-level conviction signal to a numeric quality score
 * the Quality Scorer will normalize. Above CONVICTION_FLOOR (33 today) so
 * the verdict-shape invariant accepts ranges with non-ok severities.
 */
function convictionToQualityScore(c: "high" | "moderate" | "developing"): number {
  if (c === "high") return 85;
  if (c === "moderate") return 65;
  return 45;
}

/**
 * Severity based on whether the user's saved value falls within the LLM's
 * recommended range. v1 keeps the mapping simple: in-range → ok, outside →
 * advisory, missing → ok+missing-data intent. Future graduation may use
 * conviction × range-width to differentiate advisory vs warning.
 */
function deriveSeverity(value: number | null | undefined, range: VerdictRange): Severity {
  if (value == null || !Number.isFinite(value)) return "ok";
  if (value < range.low || value > range.high) return "advisory";
  return "ok";
}

/**
 * Voice intent driven by user value vs LLM range. Mirrors the Tier-0
 * pattern in funding-specialist.ts so downstream Voice Renderer behaves
 * identically across Tier-0 and Tier-1 paths.
 */
function deriveIntent(value: number | null | undefined, range: VerdictRange): VoiceIntent {
  if (value == null || !Number.isFinite(value)) return "missing-data";
  if (value < range.low) return "below-range";
  if (value > range.high) return "above-range";
  return "within-range";
}

/**
 * Build the Evidence[] for one dimension from the LLM's evidenceRefs
 * (indexes into the comparables array provided in the prompt user message).
 * Each ref → one ComparableRow → one Evidence row via the existing
 * comparableToEvidence helper.
 */
function buildEvidenceForDimension(
  evidenceRefs: readonly number[],
  comparables: readonly ComparableRow[],
): Evidence[] {
  return evidenceRefs
    .filter((idx) => idx >= 0 && idx < comparables.length)
    .map((idx) => comparableToEvidence(comparables[idx]));
}

/**
 * Map one LLM-emitted dimension to a RawVerdictDimension. Pure transform;
 * no business logic beyond the convention mappings above.
 */
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
    unit: meta.unit,
  };
  const userValue = inputs[llmDim.key] ?? null;
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
    actions: [], // v1: no action prompts; future packets may add Adjust/Refine actions
  };
}

/**
 * Promote a RawVerdictDimension + reasoning text to a fully-rendered
 * VerdictDimension. The LLM's reasoning is passed as `llmReasoning` into the
 * Voice Renderer, which runs it through `enforceOrSanitize` before casting —
 * preserving persona-violation enforcement for Opus-supplied text.
 */
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

/**
 * Map the runner's persona triplet (FundingPersonaContext) to the verdict
 * contract's PersonaContext shape. Field renames only; pure.
 */
function asPersonaContext(persona: FundingPromptInputContext["persona"]): PersonaContext {
  return {
    segment: persona.verticalSlug,
    tier: persona.marketTier,
    market: persona.locale,
  };
}

/**
 * Typed error thrown when the v1 runner cannot produce a Tier-1 verdict
 * (Opus rate-limited, parse failure, network error). The route handler
 * catches and degrades to Tier-0 fallback with
 * `meta.fallbackReason: "tier1_temporarily_unavailable"` per ADR-008.
 */
export class Tier1UnavailableError extends Error {
  readonly cause: unknown;
  constructor(message: string, cause: unknown) {
    super(message);
    this.name = "Tier1UnavailableError";
    this.cause = cause;
  }
}

export interface RunFundingSpecialistDeps {
  /** Optional override for the Anthropic model factory (tests inject stubs). */
  getAnthropicModel?: (modelId: string) => ReturnType<ReturnType<typeof createAnthropic>>;
  /** Optional reference time for verdict generatedAt; tests pass a fixed Date. */
  now?: Date;
}

/**
 * Run the v1 Funding Specialist end-to-end.
 *
 * Returns a complete AnalystVerdict ready for the route handler to send
 * back to the client. Throws Tier1UnavailableError on any failure;
 * caller is responsible for degrading to Tier-0.
 */
export async function runFundingSpecialist(
  ctx: FundingPromptInputContext,
  benchmarks: AnalystWatchdogBenchmarks,
  comparables: readonly ComparableRow[],
  deps: RunFundingSpecialistDeps = {},
): Promise<AnalystVerdict> {
  const systemPrompt = buildFundingSystemPrompt();
  const userPrompt = buildFundingUserPrompt(ctx, benchmarks, comparables);
  const persona = asPersonaContext(ctx.persona);

  // Direct @ai-sdk/anthropic provider — uses ANTHROPIC_API_KEY from env.
  // No Vercel AI Gateway needed; works on Replit, Railway, any Node host.
  const modelFactory = deps.getAnthropicModel ?? createAnthropic();

  let output: FundingSpecialistOutput;
  let cognitiveRunId: string;
  const opusAbort = new AbortController();
  const opusTimer = setTimeout(
    () => opusAbort.abort(new Error(`Funding v1 Opus timed out after ${AI_GENERATION_TIMEOUT_MS / 1000}s`)),
    AI_GENERATION_TIMEOUT_MS,
  );
  try {
    // TODO G6-P2 — replace this single-shot Opus call with the N+1 pipeline:
    //   parallel: Gemini Flash (quantitative panel) + Sonnet (market panel)
    //   then:     Opus synthesis with cross-vendor convergence-score
    //   meta.vendorsUsed grows from ["anthropic"] to ≥2 (Intelligence Bar #7).
    //   See `funding_v1_graduation_roadmap.md` memory + ADR-007.
    const result = streamObject({
      model: modelFactory(FUNDING_MODEL_ID),
      schema: FundingSpecialistOutputSchema,
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
      maxOutputTokens: FUNDING_MAX_OUTPUT_TOKENS,
      abortSignal: opusAbort.signal,
    });

    // Drain partial stream for backpressure (mirrors research-orchestrator
    // pattern); we only consume the final validated object.
    for await (const _partial of result.partialObjectStream) {
      void _partial;
    }
    output = await result.object;
    clearTimeout(opusTimer);

    // TODO G6-P2 — replace synthesized id with the N+1 orchestrator's
    // structured cognitiveRunId (the real run id from the synthesis phase
    // that the verdict cache will key on). v1's synthesized tag keeps
    // meta.cognitiveRunId non-null so the ADR-008 invariant doesn't trip.
    cognitiveRunId = `funding-v1-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  } catch (err: unknown) {
    clearTimeout(opusTimer);
    throw new Tier1UnavailableError(
      `Funding v1 cognitive call failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  const voiceRenderer = createVoiceRenderer();
  const rawByKey = new Map<FundingDimensionKey, RawVerdictDimension>();
  const reasoningByKey = new Map<FundingDimensionKey, string>();

  for (const llmDim of output.dimensions) {
    const raw = llmDimensionToRaw(llmDim, ctx.inputs, comparables);
    rawByKey.set(llmDim.key, raw);
    reasoningByKey.set(llmDim.key, llmDim.reasoning);
  }

  // Emit dimensions in the canonical FUNDING_DIMENSION_KEYS order so verdict
  // consumers can rely on a stable iteration order regardless of LLM emission
  // order. The Zod schema already guarantees all 5 keys are present once.
  const dimensions: VerdictDimension[] = FUNDING_DIMENSION_KEYS.map((key) => {
    const raw = rawByKey.get(key);
    const reasoning = reasoningByKey.get(key);
    if (!raw) {
      throw new Tier1UnavailableError(
        `Funding v1 missing dimension after schema parse: ${key}`,
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
      durationMs: 0, // route handler may overwrite from wallclock; v1 not tracked yet
      cognitiveRunId,
      // TODO G6-P2 — populate vendorsUsed once N+1 panels land. The verdict
      // invariant at engine/analyst/contracts/verdict.ts:340 requires ≥2
      // vendors when present (Intelligence Bar #7), so v1 (single-vendor
      // Anthropic Opus) MUST omit this field rather than emit a single-entry
      // array. Honest single-vendor emission lives in the Tier-0 fallback
      // path's meta.fallbackReason, not here.
      // vendorsUsed: omitted in v1
      // TODO G6-P3 — cacheState becomes a real "hit" | "miss" once the
      // verdict cache read path is wired (ADR-004 §4). v1 has no cache, so
      // we honestly emit "miss" — Tier-1 invariant accepts this.
      cacheState: "miss",
    },
    generatedAt: deps.now ? deps.now.toISOString() : undefined,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Cathedral graduation roadmap (DO NOT FORGET — see funding_v1_graduation_roadmap memory)
//
// v1 (this file)                — chapel: shippable, partial Tier-1 (~6/9 Bar)
// G6-P2  N+1 panels             — vendor breadth ≥2; convergence-score
// G6-P3  cache + regress + live — comparables fetch, persona resolution
// G6-P4  Tier-1 fully graduated — all 9 Intelligence Bar requirements green
//
// When you graduate, the runner's PUBLIC CONTRACT (signature + return type)
// stays stable. The body changes. UI, route, integration test untouched.
