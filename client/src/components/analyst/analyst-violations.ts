/**
 * Pure helpers for the Save-time Analyst soft-gate.
 *
 * Doctrine (T007, locked):
 *   • A field "violates" the Analyst's known range only when
 *     guidance.confidence === "high" AND the draft value lies more than
 *     20% beyond the nearest band edge (low or high).
 *   • Out-of-band percentage is computed against the nearest band edge,
 *     not the band midpoint or width — this matches a user's intuitive
 *     "how far past the line is it?" reading and works for tiny bands
 *     (e.g. a 5–7% rate) the same as for wide ones.
 *   • We interrupt the Save when:
 *       – 2 or more fields violate (any amount past the 20% threshold), OR
 *       – exactly 1 field violates and does so by more than 40%
 *         (double the single-field threshold).
 *   • We do NOT interrupt on medium/low confidence guidance. The admin
 *     sees an inline range hint; the gate stays out of the way.
 */

import type { AnalystGuidanceRecord } from "./useAnalystRefresh";
import type { AnalystFieldSpec } from "@/components/admin/model-defaults/analyst-fields";

/** Threshold, as a fraction of the nearest band edge, that makes a field a "violation". */
export const ANALYST_VIOLATION_THRESHOLD = 0.2;
/** Threshold at which a single violation is considered blunt enough to interrupt on its own. */
export const ANALYST_SINGLE_FIELD_BLUNT_THRESHOLD = 0.4;

export interface AnalystViolation {
  /** The draft-side key that was out of band (stable per UI context). */
  field: string;
  /** The guidance-side key — useful when the two differ (e.g. salesCommissionRate ↔ dispositionCommission). */
  guidanceKey: string;
  value: number;
  low: number;
  high: number;
  /** Fraction past the nearest band edge (0.25 = 25% outside). */
  outOfBandPct: number;
  direction: "below" | "above";
  reasoning: string | null;
  sourceName: string | null;
  sourceDate: string | null;
}

export interface AnalystViolationResult {
  violations: AnalystViolation[];
  /** True → show the soft-gate modal; False → Save can proceed silently. */
  shouldInterrupt: boolean;
  /** Largest outOfBandPct across all violations (0 if none). */
  maxOutOfBandPct: number;
}

/**
 * Read a numeric field from a draft object without tripping on nested
 * envelope shapes. Admin-defaults uses flat keys; property-underwriting
 * uses nested envelopes (`standardAcqPackage.capRate` etc.) — callers
 * that need nested access should pre-flatten their draft before
 * handing it to this helper.
 */
function readNumeric(draft: Record<string, unknown>, field: string): number | null {
  const raw = draft[field];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function computeAnalystViolations({
  draft,
  guidance,
  fields,
}: {
  draft: Record<string, unknown>;
  guidance: AnalystGuidanceRecord[];
  fields: readonly AnalystFieldSpec[];
}): AnalystViolationResult {
  const byKey = new Map(guidance.map((g) => [g.assumptionKey, g]));
  const violations: AnalystViolation[] = [];

  for (const spec of fields) {
    const g = byKey.get(spec.guidanceKey);
    if (!g) continue;
    if (g.confidence !== "high") continue;
    if (g.valueLow == null || g.valueHigh == null) continue;

    const v = readNumeric(draft, spec.draftKey);
    if (v == null) continue;

    let direction: "below" | "above" | null = null;
    let anchor = 0;
    if (v < g.valueLow) {
      direction = "below";
      anchor = g.valueLow;
    } else if (v > g.valueHigh) {
      direction = "above";
      anchor = g.valueHigh;
    }
    if (direction == null) continue;

    const denom = Math.max(Math.abs(anchor), 1e-9);
    const outOfBandPct = Math.abs(v - anchor) / denom;
    if (outOfBandPct <= ANALYST_VIOLATION_THRESHOLD) continue;

    violations.push({
      field: spec.draftKey,
      guidanceKey: spec.guidanceKey,
      value: v,
      low: g.valueLow,
      high: g.valueHigh,
      outOfBandPct,
      direction,
      reasoning: g.reasoning,
      sourceName: g.sourceName,
      sourceDate: g.sourceDate,
    });
  }

  const maxOutOfBandPct = violations.reduce(
    (m, x) => Math.max(m, x.outOfBandPct),
    0,
  );
  const shouldInterrupt =
    violations.length >= 2 ||
    (violations.length === 1 &&
      violations[0].outOfBandPct > ANALYST_SINGLE_FIELD_BLUNT_THRESHOLD);

  return { violations, shouldInterrupt, maxOutOfBandPct };
}
