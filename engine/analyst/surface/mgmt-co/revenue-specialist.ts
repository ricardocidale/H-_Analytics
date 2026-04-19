/**
 * Revenue Surface Specialist (mgmt-co.revenue) — Phase 3b backfill that
 * wraps the legacy `evaluateRevenue` watchdog into the AnalystVerdict
 * contract. Same shape as funding-specialist.ts; see that file's header
 * for the full action-mapping rationale.
 */
import type { RevenueBenchmarks } from "@shared/constants-revenue-benchmarks";
import {
  evaluateRevenue,
  type RevenueInputs,
} from "../../../watchdog/revenueEvaluator";
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

const RAW_QUALITY_SEED = 70;
const BENCHMARK_SOURCE_LABEL = "L+B Revenue Benchmarks v1";

const DIMENSION_META = {
  marketingRate: {
    field: "defaultCostRateMarketing",
    isNumericField: true,
    unit: "%",
    benchmarkKey: "marketingRate",
    inputKey: "marketingRate",
  },
  fbRevenueShare: {
    field: "defaultRevShareFb",
    isNumericField: true,
    unit: "%",
    benchmarkKey: "fbRevenueShare",
    inputKey: "fbRevenueShare",
  },
  eventsRevenueShare: {
    field: "defaultRevShareEvents",
    isNumericField: true,
    unit: "%",
    benchmarkKey: "eventsRevenueShare",
    inputKey: "eventsRevenueShare",
  },
  otherRevenueShare: {
    field: "defaultRevShareOther",
    isNumericField: true,
    unit: "%",
    benchmarkKey: "otherRevenueShare",
    inputKey: "otherRevenueShare",
  },
  cateringBoostPct: {
    field: "defaultCateringBoostPct",
    isNumericField: true,
    unit: "%",
    benchmarkKey: "cateringBoostPct",
    inputKey: "cateringBoostPct",
  },
} as const;

type DimensionKey = keyof typeof DIMENSION_META;
const DIMENSION_KEYS: readonly DimensionKey[] = Object.keys(DIMENSION_META) as DimensionKey[];

function rangeFor(key: DimensionKey, benchmarks: RevenueBenchmarks): VerdictRange {
  const meta = DIMENSION_META[key];
  const band = (benchmarks as unknown as Record<string, { low: number; high: number } | undefined>)[
    meta.benchmarkKey
  ];
  const lo = band && Number.isFinite(band.low) ? band.low : 0;
  const hi = band && Number.isFinite(band.high) ? band.high : lo;
  return { low: lo, mid: (lo + hi) / 2, high: hi, unit: meta.unit };
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
  inputs: RevenueInputs,
  benchmarks: RevenueBenchmarks,
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

export interface RevenueSpecialistOptions {
  evidenceAsOf?: string;
}

export function createRevenueSpecialist(
  benchmarks: RevenueBenchmarks,
  options: RevenueSpecialistOptions = {},
): SpecialistFn {
  const evidenceAsOf = options.evidenceAsOf ?? new Date().toISOString().slice(0, 10);

  return (payload, _context): SpecialistOutput => {
    const inputs = (payload ?? {}) as RevenueInputs;
    const watchdog = evaluateRevenue(inputs, benchmarks);
    const dimensions = buildDimensions(inputs, benchmarks, watchdog, evidenceAsOf);
    return { dimensions, tier: 0 };
  };
}
