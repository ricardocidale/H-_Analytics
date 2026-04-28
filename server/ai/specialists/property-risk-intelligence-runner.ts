/**
 * runPropertyRiskIntelligenceSpecialist — single-shot Opus call producing a
 * complete `AnalystVerdict` for the per-property inflation override surface
 * owned by `property.risk-intelligence` (Daniela / D).
 *
 * Mirrors the architecture of `mgmt-co-funding-runner.ts`:
 *   1. Build system + user prompts via `property-risk-intelligence-prompt`
 *   2. Call Opus via Vercel AI SDK `streamObject` with
 *      `PropertyRiskIntelligenceOutputSchema`
 *   3. Map structured output → `RawVerdictDimension` (single dimension on
 *      `propertyInflationRate`)
 *   4. Run Voice Renderer per dimension + surface
 *   5. Build `AnalystVerdict` via `buildAnalystVerdict` (invariant-checked)
 *   6. Return verdict; route handler returns it as the 200 response body
 *
 * Errors throw `Tier1UnavailableError` typed at this layer; the route
 * handler catches and degrades to the Tier-0 fallback that lives in
 * `engine/analyst/surface/property/risk-intelligence-specialist.ts`.
 *
 * Inflation-cascade discipline (`.claude/rules/inflation-cascade.md`):
 *   - The runner NEVER fabricates a country inflation outlook. The
 *     caller passes the published outlook in via
 *     `PropertyRiskIntelligencePromptInputContext.countryInflationOutlook`,
 *     resolved from the macro Specialist's Constant
 *     (`constants.macro-research`, Isadora I).
 *   - When the outlook is `null` the prompt instructs Opus to emit a
 *     developing-conviction range centered on the user's value rather
 *     than inventing an outlook; the runner does not silently
 *     substitute a default.
 */

import { streamObject } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { DEFAULT_FUNDING_SPECIALIST_MODEL } from "@shared/constants";
import { AI_GENERATION_TIMEOUT_MS } from "../../constants";
import {
  buildPropertyRiskIntelligenceSystemPrompt,
  buildPropertyRiskIntelligenceUserPrompt,
  type PropertyRiskIntelligencePromptInputContext,
  type PropertyRiskIntelligencePersonaContext,
} from "./property-risk-intelligence-prompt";
import type { MarketBenchmarkEntry } from "./market-benchmark-types";
import { lookupReferenceRange } from "../../storage/reference-range";
import {
  PropertyRiskIntelligenceOutputSchema,
  type PropertyRiskIntelligenceOutput,
  type PropertyRiskIntelligenceSource,
} from "./property-risk-intelligence-output-schema";
import {
  buildAnalystVerdict,
  type AnalystVerdict,
  type Evidence,
  type PersonaContext,
  type RawVerdictDimension,
  type Severity,
  type VerdictDimension,
  type VerdictRange,
  type VoiceIntent,
} from "../../../engine/analyst/contracts/verdict";
import { createVoiceRenderer } from "../../../engine/analyst/voice/voice-renderer";
import { getFieldRegistryEntry } from "../../../engine/analyst/registry/field-registry";

/**
 * Specialist id this runner emits. Mirrors the catalog id in
 * `engine/analyst/registry/specialist-catalog.ts`.
 */
const SPECIALIST_ID = "property.risk-intelligence";

/** Verdict-emitting field id Daniela targets. */
const PROPERTY_INFLATION_FIELD = "propertyInflationRate";

/**
 * Default model id. Today reuses the funding Specialist's model id —
 * both run on Opus single-shot; once admins assign Daniela her own
 * model resource via the admin Models registry (ADR-006) this default
 * will be overridden per-call.
 */
const PROPERTY_RISK_INTELLIGENCE_MODEL_ID = DEFAULT_FUNDING_SPECIALIST_MODEL;
const PROPERTY_RISK_INTELLIGENCE_MAX_OUTPUT_TOKENS = 2_000;

/**
 * Resolve the property-inflation field's display unit from FIELD_REGISTRY.
 * Mirrors `unitFor` in the Tier-0 surface specialist + funding runner so
 * Tier-0 and Tier-1 paths emit identical `range.unit` strings. Throws
 * loudly when the registry entry is missing — the parity test
 * (`tests/analyst/voice/field-registry-parity.test.ts`) guards against
 * this drift.
 */
function unitFor(field: string): string {
  const entry = getFieldRegistryEntry(field);
  if (!entry) {
    throw new Error(
      `Property Risk Intelligence runner: no FIELD_REGISTRY entry for field "${field}". Add one to engine/analyst/registry/field-registry.ts so the Voice Renderer formats this dimension consistently.`,
    );
  }
  return entry.unit;
}

/**
 * Map the LLM's three-level conviction signal to a numeric quality score
 * the Quality Scorer will normalize. Above CONVICTION_FLOOR (40) so the
 * verdict-shape invariant accepts ranges with non-ok severities.
 * Identical mapping to `mgmt-co-funding-runner.ts:convictionToQualityScore`.
 */
function convictionToQualityScore(
  c: "high" | "moderate" | "developing",
): number {
  if (c === "high") return 85;
  if (c === "moderate") return 65;
  return 45;
}

/**
 * Severity based on whether the user's saved value falls within the LLM's
 * recommended range. Mirrors the funding runner's mapping: in-range → ok,
 * outside → advisory, missing → ok+missing-data intent.
 */
function deriveSeverity(
  value: number | null | undefined,
  range: VerdictRange,
): Severity {
  if (value == null || !Number.isFinite(value)) return "ok";
  if (value < range.low || value > range.high) return "advisory";
  return "ok";
}

/**
 * Voice intent driven by user value vs LLM range. Mirrors the Tier-0
 * pattern in `engine/analyst/surface/property/risk-intelligence-specialist.ts`
 * so downstream Voice Renderer behaves identically across Tier-0 and
 * Tier-1 paths.
 */
function deriveIntent(
  value: number | null | undefined,
  range: VerdictRange,
): VoiceIntent {
  if (value == null || !Number.isFinite(value)) return "missing-data";
  if (value < range.low) return "below-range";
  if (value > range.high) return "above-range";
  return "within-range";
}

/**
 * Convert one Opus-cited source row into a verdict `Evidence` row. The
 * runner stamps `tier: "web"` and `personaFit: 1` itself rather than
 * letting Opus claim a higher-trust tier — only the macro Specialist
 * (whose authority publications populate `db_table` rows) earns
 * `tier: "db_table"`.
 */
function sourceToEvidence(src: PropertyRiskIntelligenceSource): Evidence {
  return {
    source: src.source,
    tier: "web",
    asOf: src.asOf,
    url: src.url,
    personaFit: 1,
  };
}

/**
 * Map the LLM-emitted dimension to a `RawVerdictDimension`. Pure
 * transform; no business logic beyond the convention mappings above.
 */
function llmDimensionToRaw(
  llmDim: PropertyRiskIntelligenceOutput["dimension"],
  inputs: PropertyRiskIntelligencePromptInputContext["inputs"],
): RawVerdictDimension {
  const range: VerdictRange = {
    low: llmDim.low,
    mid: llmDim.mid,
    high: llmDim.high,
    unit: unitFor(PROPERTY_INFLATION_FIELD),
  };
  const userValue = inputs.propertyInflationRate ?? null;
  const severity = deriveSeverity(userValue, range);
  const intent = deriveIntent(userValue, range);
  const evidence = llmDim.sources.map(sourceToEvidence);
  const qualityScore = convictionToQualityScore(llmDim.conviction);

  return {
    field: PROPERTY_INFLATION_FIELD,
    isNumericField: true,
    severity,
    range,
    qualityScore,
    evidence,
    intent,
    actions: [],
  };
}

/**
 * Promote a `RawVerdictDimension` + reasoning text to a fully-rendered
 * `VerdictDimension`. The LLM's reasoning is passed as `llmReasoning`
 * into the Voice Renderer, which runs it through `enforceOrSanitize`
 * before casting — preserving persona-violation enforcement for
 * Opus-supplied text.
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
 * Map the runner's persona triplet to the verdict contract's
 * `PersonaContext` shape. Field renames only; pure.
 */
function asPersonaContext(
  persona: PropertyRiskIntelligencePersonaContext,
): PersonaContext {
  return {
    segment: persona.verticalSlug,
    tier: persona.marketTier,
    market: persona.locale,
  };
}

/**
 * Typed error thrown when the runner cannot produce a Tier-1 verdict
 * (Opus rate-limited, parse failure, network error). The route handler
 * catches and degrades to Tier-0 fallback with
 * `meta.fallbackReason: "tier1_unavailable"` per ADR-008. Mirrors
 * `mgmt-co-funding-runner.ts:Tier1UnavailableError` so callers can
 * `instanceof`-check both runner errors uniformly.
 */
export class Tier1UnavailableError extends Error {
  readonly cause: unknown;
  constructor(message: string, cause: unknown) {
    super(message);
    this.name = "Tier1UnavailableError";
    this.cause = cause;
  }
}

export interface RunPropertyRiskIntelligenceSpecialistDeps {
  /** Optional override for the Anthropic model factory (tests inject stubs). */
  getAnthropicModel?: (
    modelId: string,
  ) => ReturnType<ReturnType<typeof createAnthropic>>;
  /** Optional reference time for verdict generatedAt; tests pass a fixed Date. */
  now?: Date;
}

/**
 * Look up key KPI + macro benchmarks from the `reference_range` table for
 * the given country. Returns an array ready to pass into the prompt context.
 * Failures are silently swallowed — missing rows mean the benchmark block is
 * simply omitted; the verdict still runs on the inflation outlook alone.
 */
async function resolveMarketBenchmarks(
  country: string | undefined,
): Promise<MarketBenchmarkEntry[]> {
  if (!country) return [];
  const c = country.toUpperCase();
  const lookups: Array<{ domain: "kpi" | "macro" | "labor"; metricKey: string }> = [
    { domain: "kpi", metricKey: "gopMarginPct" },
    { domain: "kpi", metricKey: "stabilizedOccupancy" },
    { domain: "kpi", metricKey: "capRateExitStabilized" },
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

/**
 * Run the Property Risk Intelligence Specialist end-to-end.
 *
 * Returns a complete `AnalystVerdict` ready for the route handler to send
 * back to the client. Throws `Tier1UnavailableError` on any failure;
 * caller is responsible for degrading to Tier-0.
 */
export async function runPropertyRiskIntelligenceSpecialist(
  ctx: PropertyRiskIntelligencePromptInputContext,
  deps: RunPropertyRiskIntelligenceSpecialistDeps = {},
): Promise<AnalystVerdict> {
  const marketBenchmarks = await resolveMarketBenchmarks(ctx.inputs.country);
  const ctxWithBenchmarks: PropertyRiskIntelligencePromptInputContext = {
    ...ctx,
    marketBenchmarks,
  };
  const systemPrompt = buildPropertyRiskIntelligenceSystemPrompt();
  const userPrompt = buildPropertyRiskIntelligenceUserPrompt(ctxWithBenchmarks);
  const persona = asPersonaContext(ctx.persona);

  // Direct @ai-sdk/anthropic provider — uses ANTHROPIC_API_KEY from env.
  // No Vercel AI Gateway needed; works on Replit, Railway, any Node host.
  const modelFactory = deps.getAnthropicModel ?? createAnthropic();

  let output: PropertyRiskIntelligenceOutput;
  let cognitiveRunId: string;
  const opusAbort = new AbortController();
  const opusTimer = setTimeout(
    () =>
      opusAbort.abort(
        new Error(
          `Property Risk Intelligence Opus timed out after ${AI_GENERATION_TIMEOUT_MS / 1000}s`,
        ),
      ),
    AI_GENERATION_TIMEOUT_MS,
  );
  try {
    const result = streamObject({
      model: modelFactory(PROPERTY_RISK_INTELLIGENCE_MODEL_ID),
      schema: PropertyRiskIntelligenceOutputSchema,
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
      maxOutputTokens: PROPERTY_RISK_INTELLIGENCE_MAX_OUTPUT_TOKENS,
      abortSignal: opusAbort.signal,
    });

    // Drain partial stream for backpressure (mirrors funding runner +
    // research-orchestrator pattern); we only consume the final
    // validated object.
    for await (const _partial of result.partialObjectStream) {
      void _partial;
    }
    output = await result.object;
    clearTimeout(opusTimer);

    cognitiveRunId = `property-risk-intelligence-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  } catch (err: unknown) {
    clearTimeout(opusTimer);
    throw new Tier1UnavailableError(
      `Property Risk Intelligence cognitive call failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }

  // Wrap all post-stream operations in a try/catch that converts any
  // non-Tier1UnavailableError (InvalidVerdictError from buildAnalystVerdict,
  // PersonaViolationError from voiceRenderer in dev) into
  // Tier1UnavailableError so the route handler's Tier-0 fallback fires
  // instead of returning HTTP 500 and permanently holding the cooldown.
  try {
    const voiceRenderer = createVoiceRenderer();

    const raw = llmDimensionToRaw(output.dimension, ctx.inputs);

    // Guard: Anthropic structured output cannot enforce minItems on the
    // sources array, so Opus may emit zero sources. An empty Evidence
    // array fails MIN_SOURCES_FOR_ADVICE inside buildAnalystVerdict.
    // Degrade to Tier-0 rather than throwing InvalidVerdictError and
    // holding the cooldown. Mirrors `mgmt-co-funding-runner.ts` guard.
    if (raw.evidence.length === 0) {
      throw new Tier1UnavailableError(
        `Property Risk Intelligence dimension emitted zero sources; degrading to Tier-0`,
        null,
      );
    }

    const dimension = rawWithVoice(
      raw,
      output.dimension.reasoning,
      persona,
      voiceRenderer,
    );
    const dimensions: VerdictDimension[] = [dimension];

    const surfaceVoice = voiceRenderer.renderSurface(dimensions);

    return buildAnalystVerdict({
      specialistId: SPECIALIST_ID,
      dimensions,
      surfaceVoice,
      meta: {
        tier: 1,
        durationMs: 0, // route handler may overwrite from wallclock
        cognitiveRunId,
        // Single-vendor (Anthropic Opus) emission today; the verdict
        // invariant requires ≥2 vendors when `vendorsUsed` is present
        // (Intelligence Bar #7), so we omit the field rather than emit a
        // single-entry array. Honest single-vendor emission lives in the
        // Tier-0 fallback path's meta.fallbackReason, not here.
        // vendorsUsed: omitted
        cacheState: "miss",
      },
      generatedAt: deps.now ? deps.now.toISOString() : undefined,
    });
  } catch (err: unknown) {
    if (err instanceof Tier1UnavailableError) throw err;
    throw new Tier1UnavailableError(
      `Property Risk Intelligence post-stream assembly failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }
}
