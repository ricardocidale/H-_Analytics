/**
 * Surface Router — pure dispatcher from (specialistId, inputs) to
 * AnalystVerdict.
 *
 * Spec:  docs/architecture/analyst/surface-router.md
 * Skill: .claude/skills/analyst/orchestrator.md
 *
 * Hard rules:
 *   1. No LLM calls. Ever. The Router dispatches; Specialists reason.
 *   2. Every dispatch passes through Voice Renderer before returning.
 *   3. Conviction floor decisions live HERE, not in Specialists. A Specialist
 *      returns severity "warning" + qualityScore 32 → Router downgrades to
 *      "ok" with developing-data voice.
 *   4. Multi-Specialist aggregation (dispatchMany) is the Router's job:
 *      severityMax across surfaces, weighted-avg qualityScore, concatenated
 *      dimensions, single composed surface voice.
 *   5. Unknown specialistId throws UnknownSpecialistError. Specialist errors
 *      wrap into SpecialistExecutionError and re-throw. Zod validation
 *      failures throw InvalidVerdictError (from contracts/verdict.ts).
 */

import { CONVICTION_FLOOR } from "@shared/analyst-conviction";
import {
  buildAnalystVerdict,
  computeOverallQuality,
  severityMaxOf,
  type AnalystVerdict,
  type AnalystVerdictMeta,
  type FallbackReason,
  type PersonaContext,
  type RawVerdictDimension,
  type Severity,
  type VerdictDimension,
  type VoiceBlock,
} from "../contracts/verdict";
import type { QualityScorer } from "../quality/quality-scorer";
import type { VoiceRenderer } from "../voice/voice-renderer";

// ────────────────────────────────────────────────────────────────────────────
// Errors
// ────────────────────────────────────────────────────────────────────────────

export class UnknownSpecialistError extends Error {
  readonly specialistId: string;
  constructor(specialistId: string, registered: readonly string[]) {
    super(`No Specialist registered for id "${specialistId}". Registered: [${registered.join(", ") || "<none>"}]`);
    this.name = "UnknownSpecialistError";
    this.specialistId = specialistId;
  }
}

export class SpecialistExecutionError extends Error {
  readonly specialistId: string;
  override readonly cause?: unknown;
  constructor(specialistId: string, cause: unknown) {
    super(`Specialist "${specialistId}" threw during execution: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "SpecialistExecutionError";
    this.specialistId = specialistId;
    this.cause = cause;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Specialist contract — what Specialists return
// ────────────────────────────────────────────────────────────────────────────

/**
 * A Specialist returns "raw" dimensions (no voice, no qualityScore that the
 * Router trusts). The Router then:
 *   - asks the Quality Scorer for the authoritative qualityScore
 *   - applies the conviction-floor downgrade
 *   - asks the Voice Renderer to produce voice fields
 *   - computes overall severity / overall quality / meta
 *   - validates and returns the final AnalystVerdict
 *
 * A Specialist that wants to pre-compute its own qualityScore may pass it
 * through; the Router overwrites unless overrideQualityScore is true. The
 * overall intent is that the Scorer is the single source of truth.
 */
export interface SpecialistOutput {
  /** Raw dimensions: structured inputs the renderer + scorer will process. */
  dimensions: RawVerdictDimension[];
  /** Optional: Specialist-supplied tier (Router falls back to 0). */
  tier?: 0 | 1;
  /** Optional: Specialist-supplied cognitive run id (Tier-1 only). */
  cognitiveRunId?: string;
  /** Optional: Specialist-supplied duration (Router falls back to wallclock). */
  durationMs?: number;
  /** Optional: benchmark variance per field for the quality scorer. */
  benchmarkVariancePerField?: Record<string, number>;
  /** Optional: per-dimension cognitive consensus ratio (0..1). */
  consensusPerField?: Record<string, number>;
  /** Optional: ADR-008 meta provenance. Tier-coupling enforced at the Verdict schema. */
  meta?: {
    fallbackReason?: FallbackReason;
    vendorsUsed?: string[];
    cacheState?: "hit" | "miss";
  };
}

export interface SpecialistContext {
  persona: PersonaContext;
  cognitiveRunId?: string;
  /** Reference time for scorer determinism; tests pass a fixed Date. */
  now?: Date;
}

export type SpecialistFn = (
  payload: unknown,
  context: SpecialistContext,
) => SpecialistOutput | Promise<SpecialistOutput>;

// ────────────────────────────────────────────────────────────────────────────
// Router contract
// ────────────────────────────────────────────────────────────────────────────

export interface SurfaceRouterInputs {
  specialistId: string;
  payload: unknown;
  persona: PersonaContext;
  cognitiveRunId?: string;
  /** Reference time for scorer + meta; tests pass a fixed Date. */
  now?: Date;
}

export interface SurfaceRouter {
  register(specialistId: string, specialist: SpecialistFn): void;
  registered(): readonly string[];
  dispatch(inputs: SurfaceRouterInputs): Promise<AnalystVerdict>;
  dispatchMany(inputsList: readonly SurfaceRouterInputs[]): Promise<AnalystVerdict>;
}

export interface SurfaceRouterDeps {
  voiceRenderer: VoiceRenderer;
  qualityScorer: QualityScorer;
}

// ────────────────────────────────────────────────────────────────────────────
// Conviction floor + scoring
// ────────────────────────────────────────────────────────────────────────────

function applyConvictionFloor(
  raw: RawVerdictDimension,
  authoritativeScore: number,
): { severity: Severity; qualityScore: number; downgraded: boolean } {
  if (raw.severity !== "ok" && authoritativeScore < CONVICTION_FLOOR) {
    return { severity: "ok", qualityScore: authoritativeScore, downgraded: true };
  }
  return { severity: raw.severity, qualityScore: authoritativeScore, downgraded: false };
}

// ────────────────────────────────────────────────────────────────────────────
// Per-dimension pipeline: raw → scored → voiced → validated
// ────────────────────────────────────────────────────────────────────────────

function processDimension(
  raw: RawVerdictDimension,
  output: SpecialistOutput,
  context: SpecialistContext,
  deps: SurfaceRouterDeps,
): VerdictDimension {
  const breakdown = deps.qualityScorer.score({
    evidence: raw.evidence,
    range: raw.range,
    benchmarkVariance: output.benchmarkVariancePerField?.[raw.field],
    cognitiveConsensusRatio: output.consensusPerField?.[raw.field],
    persona: context.persona,
    now: context.now,
  });

  const floored = applyConvictionFloor(raw, breakdown.total);

  // When floored (below-floor → ok), voice intent shifts to "missing-data"
  // so the Voice Renderer emits the developing-data headline and no range.
  const effectiveIntent = floored.downgraded ? "missing-data" : raw.intent;

  const voice: VoiceBlock = deps.voiceRenderer.renderDimension({
    field: raw.field,
    severity: floored.severity,
    range: floored.downgraded ? null : raw.range,
    qualityScore: floored.qualityScore,
    evidence: raw.evidence,
    intent: effectiveIntent,
    personaContext: context.persona,
  });

  return {
    field: raw.field,
    isNumericField: raw.isNumericField,
    severity: floored.severity,
    range: floored.downgraded ? null : raw.range,
    qualityScore: floored.qualityScore,
    evidence: raw.evidence,
    voice,
    actions: raw.actions,
    crossSurface: raw.crossSurface,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Verdict assembly
// ────────────────────────────────────────────────────────────────────────────

function assembleVerdict(
  specialistId: string,
  output: SpecialistOutput,
  dimensions: VerdictDimension[],
  context: SpecialistContext,
  deps: SurfaceRouterDeps,
  wallclockStart: number,
  wallclockEnd: number,
): AnalystVerdict {
  const tier: 0 | 1 = output.tier ?? 0;
  const cognitiveRunId = output.cognitiveRunId ?? context.cognitiveRunId;
  const durationMs = output.durationMs ?? wallclockEnd - wallclockStart;

  const meta: AnalystVerdictMeta = {
    tier,
    durationMs: Math.max(0, durationMs),
    ...(cognitiveRunId ? { cognitiveRunId } : {}),
    // ADR-008: forward Specialist-supplied meta provenance. Tier-coupling
    // is enforced by AnalystVerdictSchema.refine — buildAnalystVerdict
    // throws if the Specialist emits a field on the wrong tier.
    ...(tier === 0 && output.meta?.fallbackReason
      ? { fallbackReason: output.meta.fallbackReason }
      : {}),
    ...(tier === 1 && output.meta?.vendorsUsed && output.meta.vendorsUsed.length >= 2
      ? { vendorsUsed: output.meta.vendorsUsed }
      : {}),
    ...(tier === 1 && output.meta?.cacheState
      ? { cacheState: output.meta.cacheState }
      : {}),
  };

  const surfaceVoice = deps.voiceRenderer.renderSurface(dimensions);

  return buildAnalystVerdict({
    specialistId,
    dimensions,
    surfaceVoice,
    meta,
    generatedAt: new Date(wallclockEnd).toISOString(),
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Factory
// ────────────────────────────────────────────────────────────────────────────

export function createSurfaceRouter(deps: SurfaceRouterDeps): SurfaceRouter {
  const registry = new Map<string, SpecialistFn>();

  async function runSingle(inputs: SurfaceRouterInputs): Promise<AnalystVerdict> {
    const specialist = registry.get(inputs.specialistId);
    if (!specialist) {
      throw new UnknownSpecialistError(inputs.specialistId, Array.from(registry.keys()));
    }

    const context: SpecialistContext = {
      persona: inputs.persona,
      cognitiveRunId: inputs.cognitiveRunId,
      now: inputs.now,
    };

    const wallclockStart = Date.now();
    let output: SpecialistOutput;
    try {
      output = await Promise.resolve(specialist(inputs.payload, context));
    } catch (err) {
      throw new SpecialistExecutionError(inputs.specialistId, err);
    }
    const wallclockEnd = Date.now();

    const processed = output.dimensions.map((raw) => processDimension(raw, output, context, deps));

    return assembleVerdict(
      inputs.specialistId,
      output,
      processed,
      context,
      deps,
      wallclockStart,
      wallclockEnd,
    );
  }

  async function runMany(inputsList: readonly SurfaceRouterInputs[]): Promise<AnalystVerdict> {
    if (inputsList.length === 0) {
      throw new Error("SurfaceRouter.dispatchMany called with no inputs");
    }
    const verdicts = await Promise.all(inputsList.map((i) => runSingle(i)));
    return aggregate(verdicts, deps);
  }

  return {
    register(specialistId, specialist) {
      registry.set(specialistId, specialist);
    },
    registered() {
      return Array.from(registry.keys());
    },
    dispatch: runSingle,
    dispatchMany: runMany,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Multi-specialist aggregation
// ────────────────────────────────────────────────────────────────────────────

function aggregate(verdicts: readonly AnalystVerdict[], deps: SurfaceRouterDeps): AnalystVerdict {
  const allDimensions: VerdictDimension[] = verdicts.flatMap((v) => v.dimensions);
  const overallSeverity = severityMaxOf(allDimensions.map((d) => d.severity));
  const overallQualityScore = computeOverallQuality(allDimensions);
  const tier: 0 | 1 = verdicts.some((v) => v.meta.tier === 1) ? 1 : 0;
  const durationMs = verdicts.reduce((acc, v) => acc + v.meta.durationMs, 0);
  const cognitiveRunId = verdicts.find((v) => v.meta.cognitiveRunId !== undefined)?.meta.cognitiveRunId;

  // ADR-008: aggregate meta provenance, honoring tier-coupling invariants.
  // - fallbackReason: only when ALL constituents are Tier-0 with the same
  //   reason (mixed-tier or mixed-reason aggregations drop it).
  // - vendorsUsed: union across Tier-1 constituents; only emitted when
  //   aggregate.tier === 1 and the union has >=2 vendors.
  // - cacheState: aggregate as "miss" if ANY constituent missed; "hit"
  //   only if all hit. Only emitted when aggregate.tier === 1.
  const tier0Reasons = new Set(
    verdicts.filter((v) => v.meta.tier === 0).map((v) => v.meta.fallbackReason).filter((r): r is FallbackReason => r !== undefined),
  );
  const fallbackReason: FallbackReason | undefined =
    tier === 0 && verdicts.every((v) => v.meta.tier === 0) && tier0Reasons.size === 1
      ? Array.from(tier0Reasons)[0]
      : undefined;

  const vendorUnion = Array.from(
    new Set(verdicts.flatMap((v) => v.meta.vendorsUsed ?? [])),
  );
  const vendorsUsed = tier === 1 && vendorUnion.length >= 2 ? vendorUnion : undefined;

  const tier1States = verdicts.filter((v) => v.meta.tier === 1).map((v) => v.meta.cacheState);
  const cacheState: "hit" | "miss" | undefined =
    tier === 1 && tier1States.length > 0 && tier1States.every((s) => s !== undefined)
      ? tier1States.some((s) => s === "miss") ? "miss" : "hit"
      : undefined;

  const surfaceVoice = deps.voiceRenderer.renderSurface(allDimensions);
  const compositeId = verdicts.map((v) => v.specialistId).join("+");
  const generatedAt = verdicts[verdicts.length - 1].generatedAt;

  return buildAnalystVerdict({
    specialistId: compositeId,
    dimensions: allDimensions,
    surfaceVoice,
    meta: {
      tier,
      durationMs,
      ...(cognitiveRunId ? { cognitiveRunId } : {}),
      ...(fallbackReason ? { fallbackReason } : {}),
      ...(vendorsUsed ? { vendorsUsed } : {}),
      ...(cacheState ? { cacheState } : {}),
    },
    generatedAt,
  });
}

// Silence unused-import warnings if TS eagerly prunes nothing from the
// contract re-exports.
export type { AnalystVerdict };
