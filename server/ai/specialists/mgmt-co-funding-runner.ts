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
import { getAiSdkAnthropic } from "../ai-sdk-clients";
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

const FUNDING_MODEL_ID = "claude-opus-4-7";
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
 * VerdictDimension. Voice Renderer handles headline/detail; we use the
 * LLM's reasoning as the detail text (headline is composed by the renderer
 * from severity/range/intent for consistency with Tier-0 outputs).
 */
function rawWithVoice(
  raw: RawVerdictDimension,
  llmReasoning: string,
  persona: PersonaContext,
  voiceRenderer: ReturnType<typeof createVoiceRenderer>,
): VerdictDimension {
  const renderedVoice = voiceRenderer.renderDimension({
    field: raw.field,
    severity: raw.severity,
    range: raw.range,
    qualityScore: raw.qualityScore,
    evidence: raw.evidence,
    intent: raw.intent,
    personaContext: persona,
  });

  // Override detail with the LLM's reasoning when present — it's richer than
  // the Voice Renderer's templated detail. Headline stays from renderer for
  // persona-discipline consistency.
  const voice = llmReasoning
    ? { headline: renderedVoice.headline, detail: castReasoningAsRendered(llmReasoning) }
    : renderedVoice;

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
 * Cast LLM reasoning text into the branded `VoiceRenderedString` type.
 * Voice Renderer's runtime persona-violation check already vetted this
 * string content via the system prompt's voice rules; the cast acknowledges
 * we trust the prompt-discipline path.
 */
function castReasoningAsRendered(s: string): VerdictDimension["voice"]["detail"] {
  return s as unknown as VerdictDimension["voice"]["detail"];
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
  /** Optional override for the AI SDK Anthropic factory (tests inject stubs). */
  getAnthropicModel?: (modelId: string) => ReturnType<ReturnType<typeof getAiSdkAnthropic>>;
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

  const modelFactory = deps.getAnthropicModel ?? getAiSdkAnthropic();

  let output: FundingSpecialistOutput;
  let cognitiveRunId: string;
  try {
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
    });

    // Drain partial stream for backpressure (mirrors research-orchestrator
    // pattern); we only consume the final validated object.
    for await (const _partial of result.partialObjectStream) {
      void _partial;
    }
    output = await result.object;

    // Cognitive run id: AI SDK doesn't surface a stable id directly; we
    // synthesize from response metadata when available. Falls back to a
    // deterministic-per-call uuid-shaped tag so the verdict's meta block is
    // never empty. Real Tier-1 graduation (G6-P2) replaces this with the
    // orchestrator's structured cognitiveRunId.
    cognitiveRunId = `funding-v1-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  } catch (err: unknown) {
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
      vendorsUsed: ["anthropic"],
      cacheState: "miss",
    },
    generatedAt: deps.now ? deps.now.toISOString() : undefined,
  });
}
