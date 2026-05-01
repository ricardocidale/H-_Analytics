/**
 * Funding Surface Specialist (mgmt-co.funding) — Tier-1 cognitive Specialist
 * (G1 of ADR-007 graduation pattern).
 *
 * Spec:  docs/architecture/analyst/mgmt-co-specialists.md
 * ADR:   docs/architecture/decisions/ADR-003-analyst-verdict-contract.md
 *        docs/architecture/decisions/ADR-007-specialist-tier1-graduation.md
 * Rule:  .claude/rules/specialist-intelligence-bar.md
 *
 * History:
 *   - Phase 3b: deterministic watchdog wrapper around `evaluateCapitalRaise`.
 *     Single-tier output. Five hard-coded dimensions, single benchmark
 *     evidence per dimension. No `cognitiveRunId`, no comparables, no live
 *     API. Did not clear the Intelligence Bar.
 *   - G1 (this file): adds Tier-1 N+1 cognitive evaluation behind injected
 *     `FundingSpecialistDeps`. When deps are undefined, falls back
 *     immediately to the Phase-3b Tier-0 path — preserves backward
 *     compatibility for the registry binding in `index.ts` and the persona
 *     test bench in `tests/analyst/personas/lb.test.ts` until Replit wires
 *     `deps` from the route handler. When deps are present, executes the
 *     ADR-007 §1 10-step Tier-1 skeleton:
 *
 *     1. Required-fields gate (handled externally by `withRequiredFieldsGate`)
 *     2. Resolve context  → buildFundingPromptInput
 *     3. Resolve cache key → buildFundingCacheKey
 *     4. Cache read       → consultCognitive
 *     5. Cognitive run    → deps.orchestrator.run(input, { regressCount })
 *     6. Comparables      → deps.comparablesFetcher.fetch("funding")
 *     7. Quality check + bounded regress (max 2)
 *     8. Honest-fail      → severity: "ok", intent: "missing-data" if
 *                            regresses exhaust (wider-honest beats narrow-false)
 *     9. Build SpecialistOutput with tier: 1 + cognitiveRunId
 *    10. Voice render is downstream (Surface Router), unchanged.
 *
 * Fallback policy (ADR-007 §3): when `deps` is undefined OR the cognitive
 * path throws (orchestrator outage, rate-limit, network), the Specialist
 * returns a Tier-0 SpecialistOutput built from the legacy `buildDimensions()`
 * helper preserved verbatim from the Phase-3b implementation. Per ADR-008,
 * the Tier-0 fallback also emits `meta.fallbackReason: "tier1_unavailable"`
 * so the downstream UI badge can render the reason.
 *
 * Action mapping (preserved from Phase 3b):
 *   adjust       → "consult-cognitive" (label preserved, payload carries field + reason)
 *   ack          → "dismiss"
 *   save_anyway  → NOT in the contract; rendered by the dialog as a separate
 *                  UX-only "Save Anyway" button outside actions[].
 *
 * Engine boundary: this file imports types only from `server/ai/specialists/`
 * (the adapter contracts). No runtime import of `server/ai/research-orchestrator.ts`
 * or any other server-side concrete. Concrete adapter wiring happens in
 * Replit's route-handler slice per `claude-replit-split.md`.
 */
import type { AnalystWatchdogBenchmarks } from "@workspace/db/schema";
import { CONVICTION_FLOOR, SPECIALIST_RAW_QUALITY_SEED } from "@shared/analyst-conviction";
import {
  evaluateCapitalRaise,
  type CapitalRaiseInputs,
  type WatchdogResult,
  type WatchdogSeverity,
} from "../../../watchdog/capitalRaiseEvaluator";
import {
  fromLegacySeverity,
  type Evidence,
  type RawVerdictDimension,
  type Severity,
  type VerdictAction,
  type VerdictRange,
  type VoiceIntent,
} from "../../contracts/verdict";
import type { SpecialistFn, SpecialistOutput } from "../../router/surface-router";
import type {
  ComparablesFetcher,
  FundingOrchestratorAdapter,
  FundingOrchestratorResult,
} from "@server/ai/specialists/mgmt-co-funding-orchestrator-adapter";
import {
  CONVERGENCE_THRESHOLD,
  comparableToEvidence,
} from "@server/ai/specialists/mgmt-co-funding-orchestrator-adapter";
import {
  buildFundingCacheKey,
  buildFundingPromptInput,
  mapInputsToDimensionInputs,
  type FundingCacheKeyArgs,
  type FundingPersonaContext,
  type FundingPromptInputContext,
} from "@server/ai/specialists/mgmt-co-funding-prompt-input-builder";
import {
  consultCognitive,
  type EngineClientDeps,
} from "../../cognitive/engine-client";
import { getFieldRegistryEntry } from "../../registry/field-registry";

/** Default qualityScore handed to the Router; the Router's QualityScorer
 *  recomputes the authoritative value from evidence/range/persona, so this
 *  is only the Raw-schema seed. Above CONVICTION_FLOOR so the contract
 *  invariants pass even if the scorer is mocked in a test. */
const RAW_QUALITY_SEED = SPECIALIST_RAW_QUALITY_SEED;

/** Synthetic source label for benchmark-driven evidence. */
const BENCHMARK_SOURCE_LABEL = "L+B Capital Raise Benchmarks v1";

/** Maximum regress attempts before honest-fail per ADR-007 §1 step 7. */
const MAX_REGRESS_ATTEMPTS = 2;

/** Field-id metadata used to assemble per-dimension ranges + intents.
 *  Names mirror the form-field ids the dialog scrolls to (consult-cognitive
 *  payload.field). The dimension's display unit is intentionally NOT carried
 *  here — it is sourced from `FIELD_REGISTRY` (see `unitFor` below) so the
 *  registry stays the single source of truth and Specialist + registry
 *  cannot drift on the unit a verdict gets formatted in. */
const DIMENSION_META = {
  runwayBufferMonths: {
    field: "capitalRaise1Amount",
    isNumericField: true,
    lowKey: "runwayBufferMonthsLow",
    highKey: "runwayBufferMonthsHigh",
    inputKey: "runwayBufferMonths",
  },
  sizingOvershootPct: {
    field: "capitalRaise2Amount",
    isNumericField: true,
    lowKey: "sizingOvershootPctLow",
    highKey: "sizingOvershootPctHigh",
    inputKey: "sizingOvershootPct",
  },
  trancheGapMonths: {
    field: "capitalRaise2Date",
    isNumericField: true,
    lowKey: "trancheGapMonthsLow",
    highKey: "trancheGapMonthsHigh",
    inputKey: "trancheGapMonths",
  },
  revenueRampDelayMonths: {
    field: "revenueRampDelayMonths",
    isNumericField: true,
    lowKey: "revenueRampDelayMonthsLow",
    highKey: "revenueRampDelayMonthsHigh",
    inputKey: "revenueRampDelayMonths",
  },
  burnFlexDownPct: {
    field: "burnFlexDownPct",
    isNumericField: true,
    lowKey: "burnFlexDownPctLow",
    highKey: "burnFlexDownPctHigh",
    inputKey: "burnFlexDownPct",
  },
} as const;

/**
 * Resolve a dimension's display unit from the field registry. Throws on
 * miss because the field-registry parity test
 * (`tests/analyst/voice/field-registry-parity.test.ts`) guarantees every
 * field this Specialist emits has a registry entry — a missing entry at
 * runtime would mean the parity check was bypassed and the verdict's
 * `range.unit` would be silently wrong, which is exactly the drift class
 * this lookup eliminates. Failing loud here turns that into a test signal
 * rather than a UI bug.
 */
function unitFor(field: string): string {
  const entry = getFieldRegistryEntry(field);
  if (!entry) {
    throw new Error(
      `Funding Specialist: no FIELD_REGISTRY entry for field "${field}". Add one to engine/analyst/registry/field-registry.ts so the Voice Renderer formats this dimension consistently.`,
    );
  }
  return entry.unit;
}

type DimensionKey = keyof typeof DIMENSION_META;

const DIMENSION_KEYS: readonly DimensionKey[] = Object.keys(DIMENSION_META) as DimensionKey[];

/**
 * Public list of every field id this Specialist may emit as
 * `VerdictDimension.field`. Exported so the field-registry parity test
 * (`tests/analyst/voice/field-registry-parity.test.ts`) can assert each
 * one has a `FIELD_REGISTRY` entry without reaching into the private
 * `DIMENSION_META` table.
 *
 * Stays in lockstep with `DIMENSION_META` by construction (derived from
 * the same source of truth in the same module).
 */
export const FUNDING_SPECIALIST_TRACKED_FIELDS: readonly string[] =
  DIMENSION_KEYS.map((key) => DIMENSION_META[key].field);

function rangeFor(
  key: DimensionKey,
  benchmarks: AnalystWatchdogBenchmarks,
): VerdictRange {
  const meta = DIMENSION_META[key];
  const low = Number(
    (benchmarks as unknown as Record<string, unknown>)[meta.lowKey],
  );
  const high = Number(
    (benchmarks as unknown as Record<string, unknown>)[meta.highKey],
  );
  const lo = Number.isFinite(low) ? low : 0;
  const hi = Number.isFinite(high) ? high : lo;
  return { low: lo, mid: (lo + hi) / 2, high: hi, unit: unitFor(meta.field) };
}

function classifyIntent(
  value: number | null | undefined,
  range: VerdictRange,
): VoiceIntent {
  if (value == null || !Number.isFinite(value)) return "missing-data";
  if (value < range.low) return "below-range";
  if (value > range.high) return "above-range";
  return "within-range";
}

function buildEvidence(asOf: string): Evidence[] {
  return [
    {
      source: BENCHMARK_SOURCE_LABEL,
      tier: "db_table",
      asOf,
      personaFit: 1,
    },
  ];
}

/**
 * Produces the per-dimension RawVerdictDimensions for the Tier-0 fallback
 * path. Preserved verbatim from the Phase-3b implementation per the
 * cross-check invariant: the fallback path's adapter MUST emit the same
 * RawVerdictDimension[] shape it does today (tested by the existing
 * persona test bench).
 */
function buildDimensions(
  inputs: CapitalRaiseInputs,
  benchmarks: AnalystWatchdogBenchmarks,
  watchdog: WatchdogResult,
  evidenceAsOf: string,
): RawVerdictDimension[] {
  const evidence = buildEvidence(evidenceAsOf);

  // Index legacy bullets by targetField so we can pull the matching bullet
  // back out per dimension. Legacy bullets without a targetField (revenue
  // ramp delay, burn flex-down) are matched by inputKey naming convention.
  const bulletsByField = new Map<string, { severity: WatchdogSeverity; bullet: string }>();
  let i = 0;
  for (const bullet of watchdog.reasoning) {
    // The legacy evaluator builds bullets in dimension order. Walk the
    // findings index alongside; this is best-effort but stable because the
    // evaluator preserves order.
    const key = DIMENSION_KEYS[i] ?? null;
    if (key) {
      const meta = DIMENSION_META[key];
      bulletsByField.set(meta.field, {
        severity: watchdog.severity, // surface-level fallback
        bullet,
      });
    }
    i++;
  }
  // Action targetField gives us authoritative per-dimension severity for
  // dimensions that have one.
  const targetSeverityByField = new Map<string, WatchdogSeverity>();
  for (const action of watchdog.suggestedActions) {
    if (action.kind === "adjust" && action.targetField) {
      targetSeverityByField.set(action.targetField, watchdog.severity);
    }
  }

  return DIMENSION_KEYS.map((key) => {
    const meta = DIMENSION_META[key];
    const range = rangeFor(key, benchmarks);
    const value = inputs[meta.inputKey] ?? null;
    const intent = classifyIntent(value, range);

    const flagged = bulletsByField.get(meta.field);
    const targetSev = targetSeverityByField.get(meta.field);
    // A dimension is non-ok iff the legacy classifier produced a finding
    // for its value (i.e. intent is below or above), AND the watchdog
    // severity itself is non-ok.
    const legacySev: WatchdogSeverity =
      intent === "within-range" || intent === "missing-data"
        ? "ok"
        : targetSev ?? (flagged ? watchdog.severity : "warn");
    const severity: Severity = fromLegacySeverity(legacySev);

    const reasonText = flagged?.bullet ?? "Within the L+B luxury range The Analyst expects.";

    const actions: VerdictAction[] = [];
    if (severity !== "ok") {
      actions.push({
        kind: "consult-cognitive",
        label: "Adjust",
        payload: { field: meta.field, reason: reasonText },
      });
      actions.push({ kind: "dismiss", label: "Got it" });
    }

    // Range is held only on non-ok numeric dimensions (to satisfy the
    // schema refine: non-ok numeric → range required). On "ok" we drop the
    // range so the renderer doesn't repeat the band on every dimension.
    const dimensionRange = severity === "ok" ? null : range;

    return {
      field: meta.field,
      isNumericField: meta.isNumericField,
      severity,
      range: dimensionRange,
      qualityScore: RAW_QUALITY_SEED,
      evidence,
      intent,
      actions,
    } satisfies RawVerdictDimension;
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Quality check primitives (pure helpers used by the Tier-1 path)

/**
 * Minimum evidence count per non-ok dimension, mirroring ADR-003 invariant 5
 * (≥ MIN_SOURCES_FOR_ADVICE) but tightened for Tier-1 to the Intelligence
 * Bar requirement of ≥3 cited evidence per non-ok dimension.
 */
const MIN_TIER1_EVIDENCE_PER_DIM = 3;

/**
 * Returns true when the cognitive result is acceptable (no regress needed).
 * Triggers a regress on:
 *   - convergence below threshold, OR
 *   - any non-ok dimension with fewer than MIN_TIER1_EVIDENCE_PER_DIM evidence rows, OR
 *   - any non-ok numeric dimension carrying a range with qualityScore < CONVICTION_FLOOR
 *     (would force the reconstructor to drop the range; we'd rather regress and
 *     get a tighter range than ship a "warning without range" verdict).
 */
function qualityCheckPasses(result: FundingOrchestratorResult): boolean {
  if (result.convergenceScore < CONVERGENCE_THRESHOLD) return false;
  for (const dim of result.dimensions) {
    if (dim.severity === "ok") continue;
    if (dim.evidence.length < MIN_TIER1_EVIDENCE_PER_DIM) return false;
    if (dim.range !== null && dim.qualityScore < CONVICTION_FLOOR) return false;
  }
  return true;
}

/**
 * Builds the honest-fail verdict per ADR-007 §1 step 7 + Intelligence Bar
 * §"Quality preference order": when bounded regress exhausts, emit
 * `severity: "ok"` + `intent: "missing-data"` rather than fabricating
 * intelligence. Wider-honest beats narrow-false.
 */
function honestFailDimensions(
  benchmarks: AnalystWatchdogBenchmarks,
  evidenceAsOf: string,
): RawVerdictDimension[] {
  const evidence = buildEvidence(evidenceAsOf);
  return DIMENSION_KEYS.map((key) => {
    const meta = DIMENSION_META[key];
    return {
      field: meta.field,
      isNumericField: meta.isNumericField,
      severity: "ok" as const,
      range: null,
      qualityScore: RAW_QUALITY_SEED,
      evidence,
      intent: "missing-data" as const,
      actions: [],
    } satisfies RawVerdictDimension;
  });
}

/**
 * Run the cognitive orchestrator with bounded regress. Returns the first
 * result that passes the quality check, or `null` if all attempts exhaust.
 * Errors (rate-limit, network, etc.) propagate up to the caller's catch
 * block — the caller routes those to the Tier-0 fallback.
 */
async function runWithRegress(
  promptInput: ReturnType<typeof buildFundingPromptInput>,
  orchestrator: FundingOrchestratorAdapter,
): Promise<FundingOrchestratorResult | null> {
  for (let attempt = 0; attempt <= MAX_REGRESS_ATTEMPTS; attempt++) {
    const result = await orchestrator.run(promptInput, { regressCount: attempt });
    if (qualityCheckPasses(result)) return result;
  }
  return null;
}

/**
 * Merge per-dimension synthesis evidence with comparables-as-evidence.
 * Every dimension receives the comparables — they apply to the whole
 * Funding picture, not a single metric — so the voice renderer can group
 * them into a table for any dimension that needs to surface them.
 */
function mergeComparablesEvidence(
  dims: readonly RawVerdictDimension[],
  comparablesEvidence: readonly Evidence[],
): RawVerdictDimension[] {
  return dims.map((dim) => ({
    ...dim,
    evidence: [...dim.evidence, ...comparablesEvidence],
  }));
}

// ────────────────────────────────────────────────────────────────────────────
// Public types: deps + options

export interface FundingSpecialistOptions {
  /** ISO date string used as the evidence.asOf for synthesized benchmark
   *  rows. Defaults to today (UTC midnight) for determinism in tests when
   *  Date is mocked. */
  evidenceAsOf?: string;
  /** Admin-edited prompt template (P5). Threaded through to the orchestrator
   *  adapter when a Tier-1 deps bundle is present; ignored on Tier-0
   *  fallback. */
  promptTemplate?: string;
  /** admin_resources.id of the model resource the admin selected for this
   *  Specialist (P5). */
  modelResourceId?: number | null;
}

/**
 * Dependency bundle for the Tier-1 path. When `undefined` (the default the
 * existing `index.ts` registry binding still uses), the Specialist falls
 * back to Tier-0 immediately — preserves Phase-3b backward compatibility.
 */
export interface FundingSpecialistDeps {
  orchestrator: FundingOrchestratorAdapter;
  comparablesFetcher: ComparablesFetcher;
  engineClientDeps: EngineClientDeps;
  /**
   * Per-call cache-key arguments builder. The route handler owns the
   * `companyInputs` + `entityId` + `engineVersion` + `scenarioId` resolution
   * because those come from the request-scoped session — the Specialist body
   * has only the `payload` (form values being saved).
   */
  cacheKeyArgsBuilder: (payload: CapitalRaiseInputs) => Omit<FundingCacheKeyArgs, "fieldGroup">;
  /**
   * Per-call portfolio + persona context resolver. Same rationale as
   * cacheKeyArgsBuilder: request-scoped state lives upstream.
   */
  contextResolver: (payload: CapitalRaiseInputs) => Pick<FundingPromptInputContext, "portfolio" | "persona" | "priorVerdicts">;
}

/**
 * Resolve the persona triplet from the FundingPersonaContext used by the
 * cache-key builder. Pure helper.
 */
function asPersona(persona: FundingPersonaContext): FundingPersonaContext {
  return persona;
}

// ────────────────────────────────────────────────────────────────────────────
// Factory

/**
 * Factory for the mgmt-co.funding Surface Specialist.
 *
 * Closes over the benchmark snapshot + optional Tier-1 deps. The returned
 * SpecialistFn is a pure (payload, context) → SpecialistOutput function the
 * Router can call without further wiring.
 *
 * Backward compat: when `deps` is undefined, the returned SpecialistFn
 * behaves exactly like the Phase-3b version — same dimensions, same
 * Tier-0 SpecialistOutput shape — so the existing registry binding in
 * `index.ts` and the `tests/analyst/personas/lb.test.ts` bench keep
 * passing without change.
 */
export function createFundingSpecialist(
  benchmarks: AnalystWatchdogBenchmarks,
  options: FundingSpecialistOptions = {},
  deps?: FundingSpecialistDeps,
): SpecialistFn {
  const evidenceAsOf = options.evidenceAsOf ?? new Date().toISOString().slice(0, 10);

  // Tier-0 fallback path — used both as the default-when-deps-undefined
  // mode and as the catch-block recovery when Tier-1 throws. Per ADR-008,
  // emits meta.fallbackReason so the UI badge can render it.
  const tier0 = (inputs: CapitalRaiseInputs): SpecialistOutput => {
    const watchdog = evaluateCapitalRaise(inputs, benchmarks);
    const dimensions = buildDimensions(inputs, benchmarks, watchdog, evidenceAsOf);
    return {
      dimensions,
      tier: 0,
      meta: { fallbackReason: "tier1_unavailable" },
    };
  };

  if (!deps) {
    return (payload, _context): SpecialistOutput => {
      const inputs = (payload ?? {}) as CapitalRaiseInputs;
      return tier0(inputs);
    };
  }

  // Tier-1 path with deps — implements ADR-007 §1 10-step skeleton.
  return async (payload, _context): Promise<SpecialistOutput> => {
    const inputs = (payload ?? {}) as CapitalRaiseInputs;

    try {
      // Step 2: resolve context.
      const ctx = deps.contextResolver(inputs);
      const promptInput = buildFundingPromptInput({ inputs, ...ctx });

      // Step 3: resolve cache key.
      const cacheKeyBaseArgs = deps.cacheKeyArgsBuilder(inputs);
      const cacheKey = buildFundingCacheKey(cacheKeyBaseArgs);

      // Step 4: cache read.
      const cacheResult = await consultCognitive(
        {
          cacheKey,
          dimensionInputs: mapInputsToDimensionInputs(inputs),
          specialistId: "mgmt-co.funding",
        },
        deps.engineClientDeps,
      );

      let baseDims: readonly RawVerdictDimension[];
      let cognitiveRunId: string;

      if (cacheResult.hit) {
        // Cache HIT: skip orchestrator; reconstructor already produced
        // RawVerdictDimension[].
        baseDims = cacheResult.dimensions;
        cognitiveRunId = cacheResult.cognitiveRunId;
      } else {
        // Step 5 + 7: cache MISS → cognitive run with bounded regress.
        const result = await runWithRegress(promptInput, deps.orchestrator);
        if (result === null) {
          // Step 8: regress exhausted → honest-fail.
          // The asPersona call retains the persona triplet; in v1 we just
          // emit "ok"+"missing-data" across all dimensions. Persona is
          // available for future per-persona honest-fail messaging.
          asPersona(ctx.persona);
          return {
            dimensions: honestFailDimensions(benchmarks, evidenceAsOf),
            tier: 1,
            cognitiveRunId: "honest-fail",
          };
        }
        baseDims = result.dimensions;
        cognitiveRunId = result.cognitiveRunId;
      }

      // Step 6: comparables fetch (best-effort; errors degrade the
      // dimension's evidence count but don't fail the verdict).
      let comparablesEvidence: Evidence[] = [];
      try {
        const comps = await deps.comparablesFetcher.fetch("funding");
        comparablesEvidence = comps.map(comparableToEvidence);
      } catch {
        comparablesEvidence = [];
      }

      const merged = mergeComparablesEvidence(baseDims, comparablesEvidence);

      // Step 9: build SpecialistOutput. tier: 1 + cognitiveRunId signal
      // Tier-1 success to the Router + downstream voice renderer.
      return {
        dimensions: merged,
        tier: 1,
        cognitiveRunId,
      };
    } catch {
      // Fallback path (orchestrator outage, rate-limit, network, anything
      // unexpected): degrade to Tier-0. The "Tier-1 unavailable" badge UI
      // surfaces this by inspecting tier === 0.
      return tier0(inputs);
    }
  };
}
