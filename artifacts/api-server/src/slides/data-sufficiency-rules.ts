/**
 * data-sufficiency-rules.ts — Factory v2 U8.
 *
 * Deterministic check that decides whether a slot has enough data to draft
 * normally or whether Lucca must fall back to best-shot mode.
 *
 * The rules table is the U8 contract. Each slot lists the `PropertyBrief`
 * fields it materially depends on. A field is considered "present" if it is
 * non-null, non-empty-string, and (for numbers) non-zero. Slots whose data
 * needs are entirely structural (e.g., portfolio-level slides 4/6 disclaimer)
 * have an empty `requiredFields` list and are always sufficient.
 *
 * The detection is deliberately deterministic — Lucca does not consult the
 * LLM to decide "is this enough data?". That keeps the wish-list log
 * reproducible across runs.
 *
 * Numeric literals (CLAUDE.md §1): no numeric literals in this file. The
 * presence check uses `0` only as a structural zero-check on number fields
 * (CLAUDE.md §2 structural clamp exception).
 */
import type { PropertyBrief } from "./property-brief";
import type { DraftSlotKey } from "./slot-context-map";

/**
 * Required PropertyBrief fields per slot. The taxonomy mirrors the brief
 * keys in `slot-context-map.ts` so the data-sufficiency rules and the
 * prompt-building stay in sync at the field level.
 *
 * `requiredFields` is the set whose absence forces best-shot mode for the
 * slot. Some slots (e.g., slide1.visionBullets) can degrade gracefully when
 * a subset is missing — the rule says they're sufficient if AT LEAST the
 * minimum named fields are present.
 *
 * Field names use the canonical wishListLog convention (snake-case-ish DB
 * column names), not the PropertyBrief property names, so the wish-list
 * surfaces names admins recognise. The mapping back to PropertyBrief is in
 * `PROPERTY_BRIEF_FIELD_MAP` below.
 */
export interface SlotDataRule {
  /** Canonical missing-data field keys for this slot. */
  requiredFields: string[];
}

/**
 * Map a canonical wish-list field name to the corresponding PropertyBrief
 * property name. Used by the presence check.
 *
 * Some canonical names map to multiple brief fields (e.g.,
 * "transformation_scope" can be satisfied by either `renovationScope` or
 * `renovationBudgetRaw`); the array is OR-semantics — if any brief field is
 * present, the canonical name is satisfied.
 */
export const PROPERTY_BRIEF_FIELD_MAP: Record<string, Array<keyof PropertyBrief>> = {
  name: ["name"],
  location: ["city", "stateProvince", "country"],
  room_count: ["roomCount"],
  adr: ["adrRaw"],
  occupancy: ["occupancyRaw"],
  revpar: ["revparRaw"],
  purchase_price: ["purchasePriceRaw"],
  renovation_budget: ["renovationBudgetRaw"],
  loan_ltv: ["loanLtv"],
  projected_irr: ["irrRaw"],
  equity_multiple: ["equityMultipleRaw"],
  business_model: ["modelTier"],
  property_description: ["description"],
  is_historic: ["isHistoric"],
  renovation_scope: ["renovationScope"],
  transformation_scope: ["renovationScope", "renovationBudgetRaw"],
  market_insight: ["marketInsight"],
};

/**
 * Slot → required-field rules. Empty `requiredFields` means the slot has no
 * intrinsic property-data dependency (e.g., slide-4/6 are portfolio-level
 * and don't pass through Lucca; we still register them with empty rules so
 * the table is exhaustive).
 *
 * Rule rationale (per slot):
 *   - slide1.headerSubtitle: needs name + location for the tagline.
 *   - slide1.visionBullets: needs the operating-economics triad (ADR,
 *     occupancy, room count) AND business model to write a vision; missing
 *     any of those forces best-shot.
 *   - slide2.operationalModelText: needs business model + room count.
 *   - slide2.revenueBullet: needs ADR + occupancy + business model.
 *   - slide2.programmingBullet: needs business model + property description.
 *   - slide3.conceptParagraph: needs name + business model + location.
 *   - slide3.marketRationale: needs location.
 *   - slide3.reasons: needs ADR + occupancy + market_insight + room count.
 *   - slide3.closingLine: needs name + projected IRR.
 *   - slide5.transformationDescription: needs transformation_scope (either
 *     a renovation scope description OR a renovation budget).
 *   - slide5.transformationRows: needs transformation_scope.
 *   - slide5.transformationRows[N]: same as rows.
 */
export const SLOT_DATA_RULES: Record<DraftSlotKey, SlotDataRule> = {
  "slide1.headerSubtitle": {
    requiredFields: ["name", "location"],
  },
  "slide1.visionBullets": {
    requiredFields: ["name", "location", "adr", "occupancy", "room_count", "business_model"],
  },
  "slide2.operationalModelText": {
    requiredFields: ["business_model", "room_count"],
  },
  "slide2.revenueBullet": {
    requiredFields: ["adr", "occupancy", "business_model"],
  },
  "slide2.programmingBullet": {
    requiredFields: ["business_model", "property_description"],
  },
  "slide3.conceptParagraph": {
    requiredFields: ["name", "business_model", "location"],
  },
  "slide3.marketRationale": {
    requiredFields: ["location"],
  },
  "slide3.reasons": {
    requiredFields: ["adr", "occupancy", "room_count"],
  },
  "slide3.closingLine": {
    requiredFields: ["name", "projected_irr"],
  },
  "slide5.transformationDescription": {
    requiredFields: ["transformation_scope"],
  },
  "slide5.transformationRows": {
    requiredFields: ["transformation_scope"],
  },
  "slide5.transformationRows[0]": {
    requiredFields: ["transformation_scope"],
  },
  "slide5.transformationRows[1]": {
    requiredFields: ["transformation_scope"],
  },
  "slide5.transformationRows[2]": {
    requiredFields: ["transformation_scope"],
  },
  "slide5.transformationRows[3]": {
    requiredFields: ["transformation_scope"],
  },
};

/**
 * Check whether a canonical wish-list field name is "present" on a
 * PropertyBrief. OR-semantics across the mapped brief fields. Returns true if
 * any mapped field is non-empty.
 *
 * Presence definition:
 *   - string: non-empty (length > 0)
 *   - number: finite AND non-zero
 *   - boolean: true (false is treated as absent for narrative-purpose
 *     fields like `isHistoric`)
 *   - null/undefined: absent
 */
export function isFieldPresent(field: string, brief: PropertyBrief): boolean {
  const briefKeys = PROPERTY_BRIEF_FIELD_MAP[field];
  if (!briefKeys || briefKeys.length === 0) return false;

  for (const key of briefKeys) {
    const value = brief[key];
    if (value == null) continue;
    if (typeof value === "string" && value.length > 0) return true;
    if (typeof value === "number" && Number.isFinite(value) && value !== 0) return true;
    if (typeof value === "boolean" && value === true) return true;
  }
  return false;
}

/**
 * Result of a data-sufficiency check for one slot.
 */
export interface SlotDataSufficiency {
  /** True when every required field is present on the brief. */
  sufficient: boolean;
  /**
   * Required fields that are absent from the brief. Empty when
   * `sufficient` is true. Used to build the wish-list log + the
   * best-shot prompt's "MISSING fields" block.
   */
  missingFields: string[];
}

/**
 * Per-slot data-sufficiency check. The slot is sufficient when every
 * required field maps to a present PropertyBrief value (per
 * `isFieldPresent`). Otherwise the result names the missing fields so the
 * best-shot path can include them in the prompt + wish-list log.
 */
export function checkSlotDataSufficiency(
  slotKey: DraftSlotKey,
  brief: PropertyBrief,
): SlotDataSufficiency {
  const rule = SLOT_DATA_RULES[slotKey];
  const missingFields: string[] = [];
  for (const field of rule.requiredFields) {
    if (!isFieldPresent(field, brief)) {
      missingFields.push(field);
    }
  }
  return {
    sufficient: missingFields.length === 0,
    missingFields,
  };
}
