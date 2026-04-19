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
    },
    generatedAt,
  });
}

// Silence unused-import warnings if TS eagerly prunes nothing from the
// contract re-exports.
export type { AnalystVerdict };
