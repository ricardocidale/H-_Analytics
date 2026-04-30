/**
 * Company Surface Specialist (mgmt-co.company) — Phase 3b-style Tier-0
 * wrapper around the deterministic `evaluateCompany` watchdog. Same shape
 * as `overhead-specialist.ts` and `compensation-specialist.ts`; see those
 * files' headers for the action-mapping rationale.
 *
 * Phase 1 of P7-B Company: Tier-0 only. The Tier-1 N+1 graduation lands
 * in Phase 2 (mirrors Compensation G3 / Revenue G2 / Funding G6-P3b).
 */
import type { CompanyBenchmarks } from "@shared/constants-company-benchmarks";
import {
  evaluateCompany,
  type CompanyInputs,
} from "../../../watchdog/companyEvaluator";
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

const RAW_QUALITY_SEED = 70;
const BENCHMARK_SOURCE_LABEL = "L+B Company Benchmarks v1";

const DIMENSION_META = {
  baseManagementFee: {
    field: "baseManagementFee",
    isNumericField: true,
    benchmarkKey: "baseManagementFee",
    inputKey: "baseManagementFee",
  },
  incentiveManagementFee: {
    field: "incentiveManagementFee",
    isNumericField: true,
    benchmarkKey: "incentiveManagementFee",
    inputKey: "incentiveManagementFee",
  },
  companyTaxRate: {
    field: "companyTaxRate",
    isNumericField: true,
    benchmarkKey: "companyTaxRate",
    inputKey: "companyTaxRate",
  },
  costOfEquity: {
    field: "costOfEquity",
    isNumericField: true,
    benchmarkKey: "costOfEquity",
    inputKey: "costOfEquity",
  },
} as const;

type DimensionKey = keyof typeof DIMENSION_META;
const DIMENSION_KEYS: readonly DimensionKey[] = Object.keys(DIMENSION_META) as DimensionKey[];

export const COMPANY_SPECIALIST_TRACKED_FIELDS: readonly string[] =
  DIMENSION_KEYS.map((key) => DIMENSION_META[key].field);

function unitFor(fieldId: string): string {
  return getFieldRegistryEntry(fieldId)?.unit ?? "";
}

function rangeFor(key: DimensionKey, benchmarks: CompanyBenchmarks): VerdictRange {
  const band = benchmarks[DIMENSION_META[key].benchmarkKey];
  const unit = unitFor(DIMENSION_META[key].field);
  return { low: band.low, mid: band.mid, high: band.high, unit };
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
  inputs: CompanyInputs,
  benchmarks: CompanyBenchmarks,
  watchdog: WatchdogResult,
  evidenceAsOf: string,
): RawVerdictDimension[] {
  const evidence = buildEvidence(evidenceAsOf);

  const targetSeverityByField = new Map<string, WatchdogSeverity>();
  for (const action of watchdog.suggestedActions) {
    if (action.kind === "adjust" && action.targetField) {
      targetSeverityByField.set(action.targetField, watchdog.severity);
    }
  }

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
        ? "Within the L+B boutique-luxury range The Analyst expects."
        : bulletByIndex[idx] ?? "Outside the L+B boutique-luxury range The Analyst expects.";

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

export interface CompanySpecialistOptions {
  evidenceAsOf?: string;
  promptTemplate?: string;
  modelResourceId?: number | null;
}

export function createCompanySpecialist(
  benchmarks: CompanyBenchmarks,
  options: CompanySpecialistOptions = {},
): SpecialistFn {
  const evidenceAsOf = options.evidenceAsOf ?? new Date().toISOString().slice(0, 10);

  return (payload, _context): SpecialistOutput => {
    const inputs = (payload ?? {}) as CompanyInputs;
    const watchdog = evaluateCompany(inputs, benchmarks);
    const dimensions = buildDimensions(inputs, benchmarks, watchdog, evidenceAsOf);
    return { dimensions, tier: 0 };
  };
}
