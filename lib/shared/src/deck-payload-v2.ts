/**
 * deck-payload-v2 — schema for editor-authored deck slot copy.
 *
 * This is the persisted shape stored in `property_deck_payloads.payload`. It
 * holds ONLY the slots that cannot be derived deterministically — the human-
 * only narrative slots and the LLM-draft-then-human-approved editorial slots.
 * Deterministic slots (property name, asking price, building specs) are not
 * stored; they are computed at render time from `properties` and the finance
 * engine.
 *
 * Slot bucketization per the canonical contract architect (2026-05-03):
 *   - Deterministic (NOT here)            : propertyName, headerTitle,
 *                                           askingPrice.headline, propertySpecs,
 *                                           all financial table cells, portfolio
 *                                           cards, IS/CF rows (slides 4 & 6)
 *   - Human-only                          : propertySubtitle, photoCaptions,
 *                                           closingTagline (slide 1)
 *   - LLM-draft + human-approved          : visionBullets, headerSubtitle,
 *                                           all slide 2/3/5 narrative slots
 *
 * Provenance per slide-deck-spec rule #10: every authored value carries
 * `source` and `updatedAt` so a regeneration can reason about whether a slot
 * is human-locked, LLM-suggested-and-approved, or stale.
 *
 * Slides 4 and 6 are 100% deterministic and carry empty-object schemas for
 * type consistency — slots can be added later without a version bump.
 */

import { z } from "zod/v4";

export const DECK_PAYLOAD_SCHEMA_VERSION = "2.0" as const;

const SLOT_SOURCE = ["user", "llm"] as const;
export const slotProvenanceSchema = z.object({
  source: z.enum(SLOT_SOURCE),
  updatedAt: z.string(),
  model: z.string().optional(),
});
export type SlotProvenance = z.infer<typeof slotProvenanceSchema>;

const authoredString = (max: number) =>
  z.object({
    text: z.string().max(max),
    provenance: slotProvenanceSchema,
  });
export type AuthoredString = z.infer<ReturnType<typeof authoredString>>;

// ── Slide 1 ────────────────────────────────────────────────────────────────
// Per-slot character budgets come from the canonical design-contract.json.
// Adjust here when the contract changes; renderer-side max-length checks
// MUST mirror these values to keep Zod and runtime in lockstep.
export const SLIDE1_PROPERTY_SUBTITLE_MAX = 80;
export const SLIDE1_HEADER_SUBTITLE_MAX = 120;
export const SLIDE1_VISION_BULLET_MAX = 180;
export const SLIDE1_VISION_BULLETS_COUNT = 3;
export const SLIDE1_CLOSING_TAGLINE_MAX = 120;
export const SLIDE1_PHOTO_CAPTION_MAX = 60;

export const slide1PayloadSchema = z.object({
  // Human-only — italic descriptor under the property name.
  propertySubtitle: authoredString(SLIDE1_PROPERTY_SUBTITLE_MAX).optional(),
  // LLM-draft + human-approved — editorial subtitle in the page header.
  headerSubtitle: authoredString(SLIDE1_HEADER_SUBTITLE_MAX).optional(),
  // LLM-draft + human-approved — exactly 3 strategic bullets.
  visionBullets: z
    .array(authoredString(SLIDE1_VISION_BULLET_MAX))
    .max(SLIDE1_VISION_BULLETS_COUNT)
    .optional(),
  // Human-only — closing two-color italic tagline.
  closingTagline: authoredString(SLIDE1_CLOSING_TAGLINE_MAX).optional(),
  // Human-only — only a human knows what the photo actually shows.
  photoCaptions: z
    .object({
      hero: authoredString(SLIDE1_PHOTO_CAPTION_MAX).optional(),
      secondary: authoredString(SLIDE1_PHOTO_CAPTION_MAX).optional(),
      inset: authoredString(SLIDE1_PHOTO_CAPTION_MAX).optional(),
    })
    .optional(),
});
export type Slide1Payload = z.infer<typeof slide1PayloadSchema>;

// ── Slide 2 — Alt View / Photo Gallery ────────────────────────────────────
// Left panel narrative: operational model label + two strategy bullets.
// Photos (2×2 grid) and all financial stats are deterministic.
export const SLIDE2_OPERATIONAL_MODEL_MAX = 180;
export const SLIDE2_REVENUE_BULLET_MAX = 180;
export const SLIDE2_PROGRAMMING_BULLET_MAX = 180;

export const slide2PayloadSchema = z.object({
  // LLM-draft + human-approved — "Operational Model: …" italic serif line.
  operationalModelText: authoredString(SLIDE2_OPERATIONAL_MODEL_MAX).optional(),
  // LLM-draft + human-approved — revenue / rate strategy bullet.
  revenueBullet: authoredString(SLIDE2_REVENUE_BULLET_MAX).optional(),
  // LLM-draft + human-approved — programming / amenity strategy bullet.
  programmingBullet: authoredString(SLIDE2_PROGRAMMING_BULLET_MAX).optional(),
});
export type Slide2Payload = z.infer<typeof slide2PayloadSchema>;

// ── Slide 3 — Investment Model ─────────────────────────────────────────────
// Right panel narrative: concept paragraph, market rationale paragraph,
// three reason/detail pairs, closing pull quote.
// City/state header and photo panels are deterministic.
export const SLIDE3_CONCEPT_PARAGRAPH_MAX = 320;
export const SLIDE3_MARKET_RATIONALE_MAX = 320;
export const SLIDE3_REASON_LABEL_MAX = 60;
export const SLIDE3_REASON_DETAIL_MAX = 200;
export const SLIDE3_REASONS_COUNT = 3;
export const SLIDE3_CLOSING_LINE_MAX = 200;

export const slide3PayloadSchema = z.object({
  // LLM-draft + human-approved — "The Concept" narrative paragraph.
  conceptParagraph: authoredString(SLIDE3_CONCEPT_PARAGRAPH_MAX).optional(),
  // LLM-draft + human-approved — "Why This Property?" narrative paragraph.
  marketRationale: authoredString(SLIDE3_MARKET_RATIONALE_MAX).optional(),
  // LLM-draft + human-approved — up to 3 bold-label + detail pairs.
  reasons: z
    .array(
      z.object({
        label: authoredString(SLIDE3_REASON_LABEL_MAX),
        detail: authoredString(SLIDE3_REASON_DETAIL_MAX),
      })
    )
    .max(SLIDE3_REASONS_COUNT)
    .optional(),
  // LLM-draft + human-approved — closing pull quote in the accent block.
  closingLine: authoredString(SLIDE3_CLOSING_LINE_MAX).optional(),
});
export type Slide3Payload = z.infer<typeof slide3PayloadSchema>;

// ── Slide 4 — Portfolio Overview ───────────────────────────────────────────
// 100% deterministic — property cards, city/state, purchase prices, and
// acquisition statuses all come from live DB queries. The empty-object schema
// is intentional: preserves type consistency and allows future slots to be
// added without a schema-version bump.
export const slide4PayloadSchema = z.object({});
export type Slide4Payload = z.infer<typeof slide4PayloadSchema>;

// ── Slide 5 — Financial Snapshot / Transformation Plan ────────────────────
// Left panel: intro paragraph + transformation comparison table.
// Right panel financial snapshot and financing summary are deterministic.
export const SLIDE5_TRANSFORMATION_DESCRIPTION_MAX = 320;
export const SLIDE5_TRANSFORMATION_ROW_FEATURE_MAX = 60;
export const SLIDE5_TRANSFORMATION_ROW_EXISTING_MAX = 80;
export const SLIDE5_TRANSFORMATION_ROW_PROPOSED_MAX = 100;
export const SLIDE5_TRANSFORMATION_ROWS_COUNT = 4;

export const slide5PayloadSchema = z.object({
  // LLM-draft + human-approved — intro paragraph above the comparison table.
  transformationDescription: authoredString(SLIDE5_TRANSFORMATION_DESCRIPTION_MAX).optional(),
  // LLM-draft + human-approved — up to 4 feature/existing/proposed rows
  // (the header row "Feature · Existing · Proposed" is renderer chrome, not stored).
  transformationRows: z
    .array(
      z.object({
        feature: authoredString(SLIDE5_TRANSFORMATION_ROW_FEATURE_MAX),
        existing: authoredString(SLIDE5_TRANSFORMATION_ROW_EXISTING_MAX),
        proposed: authoredString(SLIDE5_TRANSFORMATION_ROW_PROPOSED_MAX),
      })
    )
    .max(SLIDE5_TRANSFORMATION_ROWS_COUNT)
    .optional(),
});
export type Slide5Payload = z.infer<typeof slide5PayloadSchema>;

// ── Slide 6 — 5-Year Income Statement ─────────────────────────────────────
// 100% deterministic — all IS/CF table cells, investor metrics, and the
// disclaimer copy come from the financial engine. Empty-object schema for
// type consistency (same rationale as slide 4).
export const slide6PayloadSchema = z.object({});
export type Slide6Payload = z.infer<typeof slide6PayloadSchema>;

// ── Top-level deck payload ─────────────────────────────────────────────────
export const deckPayloadV2Schema = z.object({
  schemaVersion: z.literal(DECK_PAYLOAD_SCHEMA_VERSION),
  slide1: slide1PayloadSchema.optional(),
  slide2: slide2PayloadSchema.optional(),
  slide3: slide3PayloadSchema.optional(),
  slide4: slide4PayloadSchema.optional(),
  slide5: slide5PayloadSchema.optional(),
  slide6: slide6PayloadSchema.optional(),
});
export type DeckPayloadV2 = z.infer<typeof deckPayloadV2Schema>;

export const EMPTY_DECK_PAYLOAD_V2: DeckPayloadV2 = {
  schemaVersion: DECK_PAYLOAD_SCHEMA_VERSION,
};

/**
 * Coerce a raw jsonb value (from `property_deck_payloads.payload`) into a
 * validated DeckPayloadV2. Returns `EMPTY_DECK_PAYLOAD_V2` if the value is
 * null/empty or fails validation — the renderer always has a usable shape.
 */
export function parseDeckPayloadV2(raw: unknown): DeckPayloadV2 {
  if (raw == null || (typeof raw === "object" && Object.keys(raw).length === 0)) {
    return EMPTY_DECK_PAYLOAD_V2;
  }
  const parsed = deckPayloadV2Schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  // Schema-version mismatch or stale shape: fall back to empty so renderer
  // uses deterministic templates rather than crashing.
  return EMPTY_DECK_PAYLOAD_V2;
}

// ── PATCH input — partial update from the editor ───────────────────────────
// The admin PATCH endpoint accepts a partial DeckPayloadV2 and merges it
// into the existing row. We validate the partial here so a typo in the
// editor cannot persist garbage. Shallow-merge per slide is the
// expected semantics — sending `{ slide2: { revenueBullet: ... } }`
// replaces only that one slot, never the whole `slide2`.
export const deckPayloadV2PatchSchema = deckPayloadV2Schema.partial().extend({
  schemaVersion: z.literal(DECK_PAYLOAD_SCHEMA_VERSION).optional(),
});
export type DeckPayloadV2Patch = z.infer<typeof deckPayloadV2PatchSchema>;
