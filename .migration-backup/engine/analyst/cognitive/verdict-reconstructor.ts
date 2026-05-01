/**
 * verdict-reconstructor.ts — Phase 5B v2 of the verdict cache (ADR-004).
 *
 * Pure function that turns cached `GuidanceSlim[]` rows + the user's
 * current input values into `RawVerdictDimension[]`. The output feeds
 * `buildAnalystVerdict()` downstream; this module never invokes the
 * orchestrator and never persists anything.
 *
 * Severity rules (per ADR-003 invariants 3-4 + ADR-007 §1 step 7):
 *   - severityOverride wins when caller passes one
 *   - non-numeric field with no override     → "ok"
 *   - numeric field, userValue null          → "ok" (intent: missing-data)
 *   - numeric field, userValue inside range  → "ok" (intent: within-range)
 *   - numeric field, userValue > range.high  → "warning" (intent: above-range)
 *   - numeric field, userValue < range.low   → "warning" (intent: below-range)
 *   - confidence "low" caps severity at "advisory" (never "warning")
 *
 * QualityScore mapping (confidence → 0-100):
 *   - "high"     → 78  (above CONVICTION_FLOOR)
 *   - "moderate" → 55  (above CONVICTION_FLOOR)
 *   - "low"      → 28  (below CONVICTION_FLOOR; range stays present only
 *                       when severity "ok", per ADR-003 invariant 4)
 *   - null       → 50  (defensive default)
 *
 * Engine boundary: this module reconstructs Specialist commentary
 * (ranges + conviction + evidence) on TOP of values the engine has
 * already computed. It never produces or alters a financial value.
 *
 * See ADR-004 §3-4 (cache contract) + ADR-007 §1 (Tier-1 Pattern).
 */

import {
  CONVICTION_FLOOR,
} from "@shared/analyst-conviction";
import {
  type Evidence,
  type RawVerdictDimension,
  type Severity,
  type VerdictRange,
  type VoiceIntent,
} from "../contracts/verdict";
import type { GuidanceSlim } from "./engine-client";

/**
 * Per-dimension caller input. The user's current value drives severity
 * computation against the cached range; isNumericField + unit drive
 * range presence and voice intent.
 */
export interface DimensionInput {
  /** Matches `GuidanceSlim.assumptionKey`. */
  field: string;
  /** The user's current value for this assumption. Null = nothing entered. */
  userValue: number | null;
  /** Whether the field is numeric (range applies) or categorical. */
  isNumericField: boolean;
  /** Unit string for VerdictRange (e.g. "%", "$", "mo", "rooms"). */
  unit: string;
  /** Caller may force a severity (e.g. block on regulatory violation). */
  severityOverride?: Severity;
}

export interface ReconstructOptions {
  /** Specialist id, used to namespace evidence ids. */
  specialistId: string;
  /** Wall-clock for evidence asOf timestamps. Injectable for tests. */
  now?: () => Date;
  /**
   * Default personaFit (0..1) attached to evidence built from cached
   * GuidanceSlim. Persona-aware caching is honored upstream by the
   * cache-key personaHash; this is a read-time default and the caller
   * may override post-reconstruction.
   */
  defaultPersonaFit?: number;
}

const DEFAULT_PERSONA_FIT = 0.7;

const QUALITY_BY_CONFIDENCE: Record<string, number> = {
  high: 78,
  moderate: 55,
  low: 28,
};
const QUALITY_DEFAULT = 50;

function mapQualityScore(confidence: string | null): number {
  if (!confidence) return QUALITY_DEFAULT;
  const key = confidence.toLowerCase();
  return QUALITY_BY_CONFIDENCE[key] ?? QUALITY_DEFAULT;
}

function buildRange(
  guidance: GuidanceSlim,
  unit: string,
): VerdictRange | null {
  const { valueLow, valueMid, valueHigh } = guidance;
  if (valueLow === null && valueMid === null && valueHigh === null) {
    return null;
  }
  // Coalesce missing endpoints conservatively: missing low takes mid; missing
  // high takes mid; missing mid takes the average of low/high.
  const low = valueLow ?? valueMid ?? valueHigh;
  const high = valueHigh ?? valueMid ?? valueLow;
  const mid =
    valueMid ??
    (valueLow !== null && valueHigh !== null
      ? (valueLow + valueHigh) / 2
      : (low ?? high));
  if (low === null || mid === null || high === null) return null;
  if (![low, mid, high].every(Number.isFinite)) return null;
  // Enforce contract invariant low <= mid <= high — clamp to ordered tuple
  // rather than throwing, since cached rows from older runs may carry minor
  // drift.
  const [orderedLow, orderedMid, orderedHigh] = [low, mid, high].sort(
    (a, b) => a - b,
  );
  return { low: orderedLow, mid: orderedMid, high: orderedHigh, unit };
}

function buildEvidence(
  guidance: GuidanceSlim,
  options: ReconstructOptions,
): Evidence {
  const now = options.now ? options.now() : new Date();
  return {
    source: guidance.sourceName ?? "Cognitive Engine (cached)",
    tier: "web",
    asOf: guidance.sourceDate ?? now.toISOString().slice(0, 10),
    personaFit: options.defaultPersonaFit ?? DEFAULT_PERSONA_FIT,
  };
}

function severityFromRange(
  userValue: number,
  range: VerdictRange,
): { severity: Severity; intent: VoiceIntent } {
  if (userValue > range.high) return { severity: "warning", intent: "above-range" };
  if (userValue < range.low) return { severity: "warning", intent: "below-range" };
  return { severity: "ok", intent: "within-range" };
}

function capSeverityForLowConfidence(
  severity: Severity,
  confidence: string | null,
): Severity {
  if ((confidence ?? "").toLowerCase() !== "low") return severity;
  // Low confidence cannot escalate beyond "advisory" — wider range with
  // honest conviction beats narrow false confidence.
  if (severity === "warning" || severity === "block") return "advisory";
  return severity;
}

/**
 * Reconstructs RawVerdictDimension[] from cached guidance rows + the
 * user's current values. Pure function — no I/O.
 *
 * Inputs whose `field` does not match any guidance row are skipped
 * silently (caller's job to ensure shape alignment).
 */
export function reconstructDimensionsFromGuidance(
  rows: readonly GuidanceSlim[],
  inputs: readonly DimensionInput[],
  options: ReconstructOptions,
): RawVerdictDimension[] {
  const byField = new Map<string, GuidanceSlim>();
  for (const row of rows) {
    byField.set(row.assumptionKey, row);
  }

  const out: RawVerdictDimension[] = [];
  for (const input of inputs) {
    const guidance = byField.get(input.field);
    if (!guidance) continue;

    const range = input.isNumericField
      ? buildRange(guidance, input.unit)
      : null;

    let severity: Severity;
    let intent: VoiceIntent;

    if (input.severityOverride) {
      severity = input.severityOverride;
      intent =
        severity === "block"
          ? "block"
          : severity === "ok"
            ? "within-range"
            : "above-range";
    } else if (!input.isNumericField) {
      severity = "ok";
      intent = "within-range";
    } else if (input.userValue === null) {
      severity = "ok";
      intent = "missing-data";
    } else if (range === null) {
      severity = "ok";
      intent = "missing-data";
    } else {
      const computed = severityFromRange(input.userValue, range);
      severity = computed.severity;
      intent = computed.intent;
    }

    severity = capSeverityForLowConfidence(severity, guidance.confidence);
    if (severity === "advisory" && intent !== "missing-data" && intent !== "block") {
      // Keep the user-facing intent honest: low-confidence advisory still
      // names which side of the range the value sits on.
      // (intent already set above.)
    }

    const qualityScore = mapQualityScore(guidance.confidence);
    // ADR-003 invariant 4: non-ok with range requires qualityScore >= floor.
    // Drop the range when severity is non-ok AND confidence too low to support
    // it; severity then stays at the (capped) value but range goes null.
    const finalRange =
      severity !== "ok" && qualityScore < CONVICTION_FLOOR ? null : range;

    out.push({
      field: input.field,
      isNumericField: input.isNumericField,
      severity,
      range: finalRange,
      qualityScore,
      evidence: [buildEvidence(guidance, options)],
      intent,
      actions: [],
    });
  }
  return out;
}
