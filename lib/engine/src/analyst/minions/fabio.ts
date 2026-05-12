/**
 * Fabio — deterministic range-quality validator minion.
 *
 * Per the range-badge quality contract memorized in `replit.md`
 * (2026-05-11) and `analyst-intelligence-display`: every range badge
 * surfaced in the UI carries a small green / yellow / red **range-quality
 * dot** that reports whether the *range itself* is plausible per the
 * guardrails stored in the `assumption_guardrails` table.
 *
 * Fabio owns that dot. He is a pure, deterministic minion — no LLM,
 * no DB writes, no judgement. He exposes two complementary entry points:
 *
 *   - {@link runFabio}            — validate a candidate `[low, high]`
 *                                    range against a guardrail envelope.
 *                                    Returns `green | yellow | red`.
 *   - {@link classifyRangeQuality} — classify a single numeric value
 *                                    (e.g. a benchmark mid) against the
 *                                    same guardrail row. Returns
 *                                    `green | yellow | red | grey`.
 *   - {@link isOutOfRange}         — decide whether a user-entered value
 *                                    falls outside the guardrail bounds,
 *                                    so the front-of-app can render the
 *                                    terse "out of range" chip.
 *
 * Guardrail rows live in the codebase-seeded `assumption_guardrails`
 * table; the actual lookup happens in the caller. Fabio is intentionally
 * decoupled from the row source so the same code path serves the
 * Analyst pipeline, the slide factory, the self-test scheduler
 * (Task #1460), and the national-benchmarks API (Task #1414) — it just
 * needs the numbers handed to it.
 */

/** Output dot color. `grey` means "no guardrail or no value to classify". */
export type RangeQualityDot = "green" | "yellow" | "red" | "grey";

// ────────────────────────────────────────────────────────────────────────────
// Range-vs-envelope API (range badges with explicit low/high)
// ────────────────────────────────────────────────────────────────────────────

export interface FabioInput {
  /** Inclusive lower bound of the candidate range (e.g. cost-of-equity low). */
  rangeLow: number;
  /** Inclusive upper bound of the candidate range. Must be >= rangeLow. */
  rangeHigh: number;
  /** Inclusive lower bound of the guardrail envelope. */
  guardrailMin: number;
  /** Inclusive upper bound of the guardrail envelope. Must be >= guardrailMin. */
  guardrailMax: number;
}

export interface FabioResult {
  /** `green | yellow | red` — `runFabio` never returns `grey`. */
  dot: Exclude<RangeQualityDot, "grey">;
  /** Short, deterministic message suitable for tooltips and audit logs. */
  reason: string;
}

/**
 * Validate a candidate `[rangeLow, rangeHigh]` against a guardrail
 * `[guardrailMin, guardrailMax]` envelope.
 *
 * Pure function. Throws only on structurally-invalid input (NaN, inverted
 * intervals) so callers can catch mis-wiring early; never throws on a
 * range that simply fails the guardrail — that's a `red` result.
 */
export function runFabio(input: FabioInput): FabioResult {
  const { rangeLow, rangeHigh, guardrailMin, guardrailMax } = input;

  if (
    !Number.isFinite(rangeLow) ||
    !Number.isFinite(rangeHigh) ||
    !Number.isFinite(guardrailMin) ||
    !Number.isFinite(guardrailMax)
  ) {
    throw new Error("[fabio] All inputs must be finite numbers.");
  }
  if (rangeHigh < rangeLow) {
    throw new Error(`[fabio] rangeHigh (${rangeHigh}) < rangeLow (${rangeLow}).`);
  }
  if (guardrailMax < guardrailMin) {
    throw new Error(
      `[fabio] guardrailMax (${guardrailMax}) < guardrailMin (${guardrailMin}).`,
    );
  }

  if (rangeHigh < guardrailMin || rangeLow > guardrailMax) {
    return {
      dot: "red",
      reason: `Range [${rangeLow}, ${rangeHigh}] is outside guardrail envelope [${guardrailMin}, ${guardrailMax}].`,
    };
  }
  if (rangeLow < guardrailMin || rangeHigh > guardrailMax) {
    return {
      dot: "yellow",
      reason: `Range [${rangeLow}, ${rangeHigh}] grazes guardrail envelope [${guardrailMin}, ${guardrailMax}].`,
    };
  }
  return {
    dot: "green",
    reason: `Range [${rangeLow}, ${rangeHigh}] fits guardrail envelope [${guardrailMin}, ${guardrailMax}].`,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Single-value API (benchmark mid / user value vs guardrail row)
// ────────────────────────────────────────────────────────────────────────────

/**
 * When a guardrail row does not specify an explicit `target_low` /
 * `target_high` "in-band" sub-range, Fabio derives the green band as the
 * central 50% of [low, high] — i.e. the inter-quartile slice of the
 * plausibility band. These two constants name the lower and upper
 * quantiles of that derived band.
 */
const INNER_BAND_LOW_QUANTILE = 0.25;
const INNER_BAND_HIGH_QUANTILE = 0.75;

export interface AssumptionGuardrail {
  assumptionKey: string;
  low: number;
  high: number;
  targetLow: number | null;
  targetHigh: number | null;
}

/**
 * Compute the green/yellow/red range-quality dot for a single numeric
 * value (typically a benchmark mid) against the guardrail for its
 * assumption key. Returns "grey" when the value or guardrail is missing.
 *
 * When `targetLow`/`targetHigh` are not set on the guardrail row, Fabio
 * derives an inner band as the central 50% of [low, high].
 */
export function classifyRangeQuality(
  value: number | null | undefined,
  guardrail: AssumptionGuardrail | null | undefined,
): RangeQualityDot {
  if (value == null || !Number.isFinite(value)) return "grey";
  if (!guardrail) return "grey";

  if (value < guardrail.low || value > guardrail.high) return "red";

  const span = guardrail.high - guardrail.low;
  const innerLow =
    guardrail.targetLow ?? guardrail.low + span * INNER_BAND_LOW_QUANTILE;
  const innerHigh =
    guardrail.targetHigh ?? guardrail.low + span * INNER_BAND_HIGH_QUANTILE;

  if (value >= innerLow && value <= innerHigh) return "green";
  return "yellow";
}

/**
 * Decide whether a user-entered value is "out of range" relative to the
 * guardrail bounds. Returns false when either the value or guardrail is
 * missing — the front-of-app renders nothing in that case.
 */
export function isOutOfRange(
  value: number | null | undefined,
  guardrail: AssumptionGuardrail | null | undefined,
): boolean {
  if (value == null || !Number.isFinite(value)) return false;
  if (!guardrail) return false;
  return value < guardrail.low || value > guardrail.high;
}

/**
 * Build the canonical assumption key used in `assumption_guardrails`
 * for a vendor pass-through cost row of a given service line.
 */
export function vendorPassthroughGuardrailKey(serviceLine: string): string {
  return `vendor_passthrough_cost.${serviceLine}`;
}

/**
 * Build the canonical assumption key used in `assumption_guardrails`
 * for a Mgmt Co markup factor row of a given service line.
 */
export function mgmtCoMarkupGuardrailKey(serviceLine: string): string {
  return `mgmt_co_markup_factor.${serviceLine}`;
}
