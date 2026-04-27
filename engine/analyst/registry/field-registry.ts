/**
 * Analyst field registry — single source of truth for the human label, unit,
 * and UI mount point of every field the Analyst tracks.
 *
 * Background:
 * The Voice Renderer's `humanField` formerly derived a display label from
 * the raw field id by string-pattern heuristics (camelCase split, snake_case
 * → spaces, drop trailing "Pct"/"Percent"). That heuristic is fine for
 * fields whose id already reads cleanly, but it cannot:
 *   - know that `defaultCostRateMarketing` should read as "Marketing Cost Rate"
 *     (the id encodes table-column semantics, not a human label)
 *   - know what UI surface a field is mounted on (so deep-link CTAs in the
 *     Analyst's verdicts can target the right page)
 *   - be authored by product copy without a code-edit-and-deploy cycle that
 *     touches the renderer itself.
 *
 * The registry is consulted FIRST by `humanField`. Fields not yet in the
 * registry fall back to the heuristic, so adding the registry is non-breaking
 * for fields the heuristic already handles correctly.
 *
 * Adding a field:
 *   1. Add an entry to FIELD_REGISTRY keyed by the exact field id the
 *      Specialist emits in `VerdictDimension.field`.
 *   2. Provide the human `label`, the display `unit` (matches the unit the
 *      Voice Renderer already uses: "%", "$", "mo", or "" for raw), and a
 *      `mountPoint` string identifying the UI surface (e.g.
 *      "property-edit/capital-raise" or "defaults/revenue").
 *   3. The Voice Renderer will pick up the label automatically.
 *
 * Mount points are deliberately kept as opaque strings rather than an enum so
 * downstream UI code can read them as routing slugs without coupling the
 * registry to a specific router.
 */

export type FieldUnit = "%" | "$" | "mo" | "date" | "";

export interface FieldRegistryEntry {
  /** User-facing label authored by product copy. Title-cased, no unit suffix. */
  readonly label: string;
  /** Display unit matching the Voice Renderer's formatter conventions. */
  readonly unit: FieldUnit;
  /** UI surface where this field is edited. Opaque slug, not a router path. */
  readonly mountPoint: string;
}

export const FIELD_REGISTRY: Readonly<Record<string, FieldRegistryEntry>> = {
  // ─── mgmt-co.funding (Capital Raise Specialist) ─────────────────────────
  capitalRaise1Amount: {
    label: "Capital Raise 1 Amount",
    unit: "$",
    mountPoint: "property-edit/capital-raise",
  },
  capitalRaise2Amount: {
    label: "Capital Raise 2 Amount",
    unit: "$",
    mountPoint: "property-edit/capital-raise",
  },
  capitalRaise2Date: {
    label: "Capital Raise 2 Date",
    unit: "date",
    mountPoint: "property-edit/capital-raise",
  },
  revenueRampDelayMonths: {
    label: "Revenue Ramp Delay",
    unit: "mo",
    mountPoint: "property-edit/capital-raise",
  },
  burnFlexDownPct: {
    label: "Burn Flex Down",
    unit: "%",
    mountPoint: "property-edit/capital-raise",
  },

  // ─── mgmt-co.revenue (Revenue Specialist) ───────────────────────────────
  defaultCostRateMarketing: {
    label: "Marketing Cost Rate",
    unit: "%",
    mountPoint: "defaults/revenue",
  },
  defaultRevShareFb: {
    label: "F&B Revenue Share",
    unit: "%",
    mountPoint: "defaults/revenue",
  },
  defaultRevShareEvents: {
    label: "Events Revenue Share",
    unit: "%",
    mountPoint: "defaults/revenue",
  },
  defaultRevShareOther: {
    label: "Other Revenue Share",
    unit: "%",
    mountPoint: "defaults/revenue",
  },
  defaultCateringBoostPct: {
    label: "Catering Boost",
    unit: "%",
    mountPoint: "defaults/revenue",
  },
};

/**
 * Returns the registered display name for `field`, or `null` when the field
 * is not yet in the registry. Callers (notably the Voice Renderer's
 * `humanField`) fall back to the legacy heuristic on `null`.
 */
export function getFieldDisplayName(field: string): string | null {
  return FIELD_REGISTRY[field]?.label ?? null;
}

/**
 * Returns the full registry entry (label + unit + mountPoint) for `field`,
 * or `null` when the field is not yet registered.
 */
export function getFieldRegistryEntry(
  field: string,
): FieldRegistryEntry | null {
  return FIELD_REGISTRY[field] ?? null;
}
