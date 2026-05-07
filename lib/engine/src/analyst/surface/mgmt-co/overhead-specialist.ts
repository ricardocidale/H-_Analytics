/**
 * Overhead Surface Specialist (mgmt-co.overhead) — Phase 3b-style Tier-0
 * wrapper around the deterministic `evaluateOverhead` watchdog. Same shape
 * as `compensation-specialist.ts` and `revenue-specialist.ts`; see those
 * files' headers for the action-mapping rationale.
 *
 * Phase 1 of P7-B Overhead: Tier-0 only. The Tier-1 N+1 graduation lands
 * in Phase 2 (mirrors Compensation G3 / Revenue G2 / Funding G6-P3b).
 */
import type { OverheadBenchmarks } from "@norfolk/shared/constants-overhead-benchmarks";
import {
  evaluateOverhead,
  type OverheadInputs,
} from "../../../watchdog/overheadEvaluator";
import type {
  WatchdogResult,
  WatchdogSeverity,
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
import { getFieldRegistryEntry } from "../../registry/field-registry";
import { SPECIALIST_RAW_QUALITY_SEED } from "@norfolk/shared/analyst-conviction";

const RAW_QUALITY_SEED = SPECIALIST_RAW_QUALITY_SEED;
const BENCHMARK_SOURCE_LABEL = "L+B Overhead Benchmarks v1";

/** Field-id metadata used to assemble per-dimension ranges + intents.
 *  The dimension's display unit is intentionally NOT carried here —
 *  `unitFor` looks it up in `FIELD_REGISTRY` so the registry stays the
 *  single source of truth. */
const DIMENSION_META = {
  officeLeaseStart: {
    field: "officeLeaseStart",
    isNumericField: true,
    benchmarkKey: "officeLeaseStart",
    inputKey: "officeLeaseStart",
  },
  professionalServicesStart: {
    field: "professionalServicesStart",
    isNumericField: true,
    benchmarkKey: "professionalServicesStart",
    inputKey: "professionalServicesStart",
  },
  techInfraStart: {
    field: "techInfraStart",
    isNumericField: true,
    benchmarkKey: "techInfraStart",
    inputKey: "techInfraStart",
  },
  businessInsuranceStart: {
    field: "businessInsuranceStart",
    isNumericField: true,
    benchmarkKey: "businessInsuranceStart",
    inputKey: "businessInsuranceStart",
  },
  travelCostPerClient: {
    field: "travelCostPerClient",
    isNumericField: true,
    benchmarkKey: "travelCostPerClient",
    inputKey: "travelCostPerClient",
  },
  itLicensePerClient: {
    field: "itLicensePerClient",
    isNumericField: true,
    benchmarkKey: "itLicensePerClient",
    inputKey: "itLicensePerClient",
  },
} as const;

/**
 * Resolve a dimension's display unit from the field registry. Throws on
 * miss so a missing registry entry surfaces as a parity-test failure
 * rather than a silently-wrong `range.unit` in production.
 */
function unitFor(field: string): string {
  const entry = getFieldRegistryEntry(field);
  if (!entry) {
    throw new Error(
      `Overhead Specialist: no FIELD_REGISTRY entry for field "${field}". Add one to engine/analyst/registry/field-registry.ts so the Voice Renderer formats this dimension consistently.`,
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
 */
export const OVERHEAD_SPECIALIST_TRACKED_FIELDS: readonly string[] =
  DIMENSION_KEYS.map((key) => DIMENSION_META[key].field);

function rangeFor(key: DimensionKey, benchmarks: OverheadBenchmarks): VerdictRange {
  const meta = DIMENSION_META[key];
  const band = (benchmarks as unknown as Record<string, { low: number; high: number } | undefined>)[
    meta.benchmarkKey
  ];
  const lo = band && Number.isFinite(band.low) ? band.low : 0;
  const hi = band && Number.isFinite(band.high) ? band.high : lo;
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
    { source: BENCHMARK_SOURCE_LABEL, tier: "db_table", asOf, personaFit: 1 },
  ];
}

function buildDimensions(
  inputs: OverheadInputs,
  benchmarks: OverheadBenchmarks,
  watchdog: WatchdogResult,
  evidenceAsOf: string,
): RawVerdictDimension[] {
  const evidence = buildEvidence(evidenceAsOf);

  // Per-dimension severity from the legacy adjust action's targetField if
  // present; otherwise the surface-level severity for any flagged bullet.
  const targetSeverityByField = new Map<string, WatchdogSeverity>();
  for (const action of watchdog.suggestedActions) {
    if (action.kind === "adjust" && action.targetField) {
      targetSeverityByField.set(action.targetField, watchdog.severity);
    }
  }

  // Map flagged bullets to dimensions in declared order (legacy evaluator
  // appends bullets in DIMENSION_KEYS order).
  const bulletByIndex = watchdog.reasoning;

  return DIMENSION_KEYS.map((key, idx) => {
    const meta = DIMENSION_META[key];
    const range = rangeFor(key, benchmarks);
    const value = inputs[meta.inputKey] ?? null;
    const intent = classifyIntent(value, range);

    const targetSev = targetSeverityByField.get(meta.field);
    const legacySev: WatchdogSeverity =
      intent === "within-range" || intent === "missing-data"
        ? "ok"
        : targetSev ?? (bulletByIndex[idx] ? watchdog.severity : "warn");
    const severity: Severity = fromLegacySeverity(legacySev);

    const reasonText =
      severity === "ok"
        ? "Within the L+B luxury range The Analyst expects."
        : bulletByIndex[idx] ?? "Outside the L+B luxury range The Analyst expects.";

    const actions: VerdictAction[] = [];
    if (severity !== "ok") {
      actions.push({
        kind: "consult-cognitive",
        label: "Adjust",
        payload: { field: meta.field, reason: reasonText },
      });
      actions.push({ kind: "dismiss", label: "Got it" });
    }

    return {
      field: meta.field,
      isNumericField: meta.isNumericField,
      severity,
      range: severity === "ok" ? null : range,
      qualityScore: RAW_QUALITY_SEED,
      evidence,
      intent,
      actions,
    } satisfies RawVerdictDimension;
  });
}

export interface OverheadSpecialistOptions {
  evidenceAsOf?: string;
  /** Admin-edited prompt template (P5). Threaded through so the upcoming
   *  Tier-1 graduation can pick it up without changing the factory contract.
   *  Empty string means "no admin override". */
  promptTemplate?: string;
  /** admin_resources.id of the model resource the admin selected for this
   *  Specialist (P5). Same TODO note as promptTemplate. */
  modelResourceId?: number | null;
}

export function createOverheadSpecialist(
  benchmarks: OverheadBenchmarks,
  options: OverheadSpecialistOptions = {},
): SpecialistFn {
  const evidenceAsOf = options.evidenceAsOf ?? new Date().toISOString().slice(0, 10);

  return (payload, _context): SpecialistOutput => {
    const inputs = (payload ?? {}) as OverheadInputs;
    const watchdog = evaluateOverhead(inputs, benchmarks);
    const dimensions = buildDimensions(inputs, benchmarks, watchdog, evidenceAsOf);
    return { dimensions, tier: 0 };
  };
}
