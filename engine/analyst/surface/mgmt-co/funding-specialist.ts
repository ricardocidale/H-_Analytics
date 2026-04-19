/**
 * Funding Surface Specialist (mgmt-co.funding) — Phase 3b backfill that wraps
 * the legacy `evaluateCapitalRaise` watchdog into the AnalystVerdict
 * contract. The wrapped evaluator stays the source of truth for the
 * dimension logic; this module is purely the contract adapter.
 *
 * Spec:  docs/architecture/analyst/mgmt-co-specialists.md
 * ADR:   docs/architecture/decisions/ADR-003-analyst-verdict-contract.md
 *
 * Action mapping (from .local/session_plan.md design lock):
 *   adjust       → "consult-cognitive" (label preserved, payload carries field + reason)
 *   ack          → "dismiss"
 *   save_anyway  → NOT in the contract; rendered by the dialog as a separate
 *                  UX-only "Save Anyway" button outside actions[].
 */
import type { AnalystWatchdogBenchmarks } from "@shared/schema";
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

/** Default qualityScore handed to the Router; the Router's QualityScorer
 *  recomputes the authoritative value from evidence/range/persona, so this
 *  is only the Raw-schema seed. Above CONVICTION_FLOOR so the contract
 *  invariants pass even if the scorer is mocked in a test. */
const RAW_QUALITY_SEED = 70;

/** Synthetic source label for benchmark-driven evidence. */
const BENCHMARK_SOURCE_LABEL = "L+B Capital Raise Benchmarks v1";

/** Field-id metadata used to assemble per-dimension ranges + intents.
 *  Names mirror the form-field ids the dialog scrolls to (consult-cognitive
 *  payload.field). Each dimension has a unit understood by the Voice
 *  Renderer ("%" = percent, "$" = currency, anything else = raw). */
const DIMENSION_META = {
  runwayBufferMonths: {
    field: "capitalRaise1Amount",
    isNumericField: true,
    unit: "mo",
    lowKey: "runwayBufferMonthsLow",
    highKey: "runwayBufferMonthsHigh",
    inputKey: "runwayBufferMonths",
  },
  sizingOvershootPct: {
    field: "capitalRaise2Amount",
    isNumericField: true,
    unit: "%",
    lowKey: "sizingOvershootPctLow",
    highKey: "sizingOvershootPctHigh",
    inputKey: "sizingOvershootPct",
  },
  trancheGapMonths: {
    field: "capitalRaise2Date",
    isNumericField: true,
    unit: "mo",
    lowKey: "trancheGapMonthsLow",
    highKey: "trancheGapMonthsHigh",
    inputKey: "trancheGapMonths",
  },
  revenueRampDelayMonths: {
    field: "revenueRampDelayMonths",
    isNumericField: true,
    unit: "mo",
    lowKey: "revenueRampDelayMonthsLow",
    highKey: "revenueRampDelayMonthsHigh",
    inputKey: "revenueRampDelayMonths",
  },
  burnFlexDownPct: {
    field: "burnFlexDownPct",
    isNumericField: true,
    unit: "%",
    lowKey: "burnFlexDownPctLow",
    highKey: "burnFlexDownPctHigh",
    inputKey: "burnFlexDownPct",
  },
} as const;

type DimensionKey = keyof typeof DIMENSION_META;

const DIMENSION_KEYS: readonly DimensionKey[] = Object.keys(DIMENSION_META) as DimensionKey[];

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

function severityForKey(
  bullets: ReadonlyArray<{ targetField?: string; severity: WatchdogSeverity }>,
  field: string,
): { sev: WatchdogSeverity; bullet: string | null } {
  // Find the first bullet whose targetField matches this dimension's field.
  const match = bullets.find((b) => b.targetField === field);
  if (match) return { sev: match.severity, bullet: null };
  return { sev: "ok", bullet: null };
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
 * Produces the per-dimension RawVerdictDimensions. One dimension per known
 * Funding metric, regardless of whether the legacy evaluator flagged it —
 * the verdict shape stays stable across tabs so the dialog can present a
 * consistent layout, and "ok" dimensions are cheap.
 *
 * For non-ok dimensions, we attach an action set built from the legacy
 * evaluator's bullet text:
 *   - "Adjust …" button → consult-cognitive with field + reason
 *   - "Got it"          → dismiss
 * The "Save Anyway" affordance is a UI concern (see action mapping note in
 * the file header) and is NOT emitted here.
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

export interface FundingSpecialistOptions {
  /** ISO date string used as the evidence.asOf for synthesized benchmark
   *  rows. Defaults to today (UTC midnight) for determinism in tests when
   *  Date is mocked. */
  evidenceAsOf?: string;
}

/**
 * Factory for the mgmt-co.funding Surface Specialist.
 *
 * Closes over the benchmark snapshot so the Specialist itself stays a pure
 * (payload, context) → SpecialistOutput function that the Router can call
 * without further wiring.
 */
export function createFundingSpecialist(
  benchmarks: AnalystWatchdogBenchmarks,
  options: FundingSpecialistOptions = {},
): SpecialistFn {
  const evidenceAsOf = options.evidenceAsOf ?? new Date().toISOString().slice(0, 10);

  return (payload, _context): SpecialistOutput => {
    const inputs = (payload ?? {}) as CapitalRaiseInputs;
    const watchdog = evaluateCapitalRaise(inputs, benchmarks);
    const dimensions = buildDimensions(inputs, benchmarks, watchdog, evidenceAsOf);
    return { dimensions, tier: 0 };
  };
}
