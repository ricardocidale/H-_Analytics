/**
 * slot-readiness.ts
 *
 * Evaluates per-slot authoring status across all authored slots in a
 * DeckPayloadV2:
 *   - 11 LLM-draft slots (can be auto-generated via draft-slot / draft-all)
 *   - 5 human-only slots (narrative text + photo captions only a human can fill)
 *   - 2 deterministic slide markers (slides 4 and 6 are 100% computed)
 *
 * Status semantics:
 *   complete      — slot has authored content with provenance newer than property
 *   stale         — slot has content but it predates the last property update
 *   missing       — slot has no content
 *   deterministic — slide is 100% computed at render time (slides 4 and 6)
 */

import type { DeckPayloadV2 } from "@shared/deck-payload-v2";
import type { DraftSlotKey } from "./slot-context-map";

export type SlotStatus = "complete" | "stale" | "missing" | "deterministic";

type DeterministicSlotKey = "slide4" | "slide6";

/**
 * Human-only authored slots — text that only a person can provide
 * (descriptive subtitles, taglines, and photo captions the admin writes
 * after seeing the actual photos). These appear in readiness reports so
 * the editor knows they need attention, but they cannot be auto-drafted.
 */
export type HumanSlotKey =
  | "slide1.propertySubtitle"
  | "slide1.closingTagline"
  | "slide1.photoCaptions.hero"
  | "slide1.photoCaptions.secondary"
  | "slide1.photoCaptions.inset";

export type AllAuthoredSlotKey = DraftSlotKey | HumanSlotKey;

export type SlotReadinessReport = Record<
  AllAuthoredSlotKey | DeterministicSlotKey,
  SlotStatus
>;

const DETERMINISTIC_SLOTS: DeterministicSlotKey[] = ["slide4", "slide6"];

const DRAFT_SLOT_KEYS: DraftSlotKey[] = [
  "slide1.headerSubtitle",
  "slide1.visionBullets",
  "slide2.operationalModelText",
  "slide2.revenueBullet",
  "slide2.programmingBullet",
  "slide3.conceptParagraph",
  "slide3.marketRationale",
  "slide3.reasons",
  "slide3.closingLine",
  "slide5.transformationDescription",
  "slide5.transformationRows",
];

const HUMAN_SLOT_KEYS: HumanSlotKey[] = [
  "slide1.propertySubtitle",
  "slide1.closingTagline",
  "slide1.photoCaptions.hero",
  "slide1.photoCaptions.secondary",
  "slide1.photoCaptions.inset",
];

// ── Provenance extraction ─────────────────────────────────────────────────
// AuthoredString shape: { text: string; provenance: { source, updatedAt, model? } }
// Arrays carry provenance on each element or on nested label/detail/feature keys.

function extractProvenanceDates(value: unknown): Date[] {
  if (value == null) return [];

  if (Array.isArray(value)) {
    return value.flatMap(extractProvenanceDates);
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;

    // Direct AuthoredString: { text, provenance: { updatedAt } }
    if (
      typeof obj.provenance === "object" &&
      obj.provenance !== null &&
      typeof (obj.provenance as Record<string, unknown>).updatedAt === "string"
    ) {
      const d = new Date((obj.provenance as Record<string, unknown>).updatedAt as string);
      return isNaN(d.getTime()) ? [] : [d];
    }

    // Nested objects (reasons: [{label, detail}], transformationRows: [{feature, existing, proposed}])
    return Object.values(obj).flatMap(extractProvenanceDates);
  }

  return [];
}

function getOldestDate(value: unknown): Date | null {
  const dates = extractProvenanceDates(value);
  if (dates.length === 0) return null;
  return new Date(Math.min(...dates.map(d => d.getTime())));
}

function slotStatus(raw: unknown, propertyUpdatedAt: Date): SlotStatus {
  if (raw == null) return "missing";
  const oldest = getOldestDate(raw);
  if (!oldest) return "missing";
  return oldest < propertyUpdatedAt ? "stale" : "complete";
}

function getDraftSlotRawValue(payload: DeckPayloadV2, slot: DraftSlotKey): unknown {
  switch (slot) {
    case "slide1.headerSubtitle":    return payload.slide1?.headerSubtitle ?? null;
    case "slide1.visionBullets":     return payload.slide1?.visionBullets?.length ? payload.slide1.visionBullets : null;
    case "slide2.operationalModelText": return payload.slide2?.operationalModelText ?? null;
    case "slide2.revenueBullet":     return payload.slide2?.revenueBullet ?? null;
    case "slide2.programmingBullet": return payload.slide2?.programmingBullet ?? null;
    case "slide3.conceptParagraph":  return payload.slide3?.conceptParagraph ?? null;
    case "slide3.marketRationale":   return payload.slide3?.marketRationale ?? null;
    case "slide3.reasons":           return payload.slide3?.reasons?.length ? payload.slide3.reasons : null;
    case "slide3.closingLine":       return payload.slide3?.closingLine ?? null;
    case "slide5.transformationDescription": return payload.slide5?.transformationDescription ?? null;
    case "slide5.transformationRows": return payload.slide5?.transformationRows?.length ? payload.slide5.transformationRows : null;
    default:                         return null;
  }
}

function getHumanSlotRawValue(payload: DeckPayloadV2, slot: HumanSlotKey): unknown {
  switch (slot) {
    case "slide1.propertySubtitle":        return payload.slide1?.propertySubtitle ?? null;
    case "slide1.closingTagline":          return payload.slide1?.closingTagline ?? null;
    case "slide1.photoCaptions.hero":      return payload.slide1?.photoCaptions?.hero ?? null;
    case "slide1.photoCaptions.secondary": return payload.slide1?.photoCaptions?.secondary ?? null;
    case "slide1.photoCaptions.inset":     return payload.slide1?.photoCaptions?.inset ?? null;
    default:                               return null;
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Evaluate readiness for all authored slots in a DeckPayloadV2.
 * Covers 11 LLM-draft slots, 5 human-only slots, and 2 deterministic slides.
 *
 * @param deckPayload        The current persisted payload for the property.
 * @param propertyUpdatedAt  The last time the property record itself changed.
 */
export function getSlotReadiness(
  deckPayload: DeckPayloadV2,
  propertyUpdatedAt: Date,
): SlotReadinessReport {
  const report = {} as SlotReadinessReport;

  for (const slot of DRAFT_SLOT_KEYS) {
    report[slot] = slotStatus(getDraftSlotRawValue(deckPayload, slot), propertyUpdatedAt);
  }

  for (const slot of HUMAN_SLOT_KEYS) {
    report[slot] = slotStatus(getHumanSlotRawValue(deckPayload, slot), propertyUpdatedAt);
  }

  for (const key of DETERMINISTIC_SLOTS) {
    report[key] = "deterministic";
  }

  return report;
}

/**
 * Returns the subset of draft slot keys that need (re)drafting.
 * Human-only slots are intentionally excluded — they cannot be auto-drafted.
 * Used by the draft-all endpoint to decide which slots to enqueue.
 */
export function getStaleMissingSlots(report: SlotReadinessReport): DraftSlotKey[] {
  return DRAFT_SLOT_KEYS.filter(
    slot => report[slot] === "missing" || report[slot] === "stale",
  );
}
