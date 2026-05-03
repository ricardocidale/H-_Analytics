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
 *                                           askingPrice.headline, propertySpecs
 *   - Human-only                          : propertySubtitle, photoCaptions,
 *                                           closingTagline
 *   - LLM-draft + human-approved          : visionBullets, headerSubtitle
 *
 * Provenance per slide-deck-spec rule #10: every authored value carries
 * `source` and `updatedAt` so a regeneration can reason about whether a slot
 * is human-locked, LLM-suggested-and-approved, or stale.
 *
 * Slides 2–6 are intentionally schemas-as-records for now — they will be
 * fleshed out when their renderers land in T005/T006.
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

// ── Slides 2–6 (placeholder shape, to be filled in T005/T006) ──────────────
const slidePlaceholderSchema = z.record(z.string(), z.unknown());
export type SlidePlaceholderPayload = z.infer<typeof slidePlaceholderSchema>;

// ── Top-level deck payload ─────────────────────────────────────────────────
export const deckPayloadV2Schema = z.object({
  schemaVersion: z.literal(DECK_PAYLOAD_SCHEMA_VERSION),
  slide1: slide1PayloadSchema.optional(),
  slide2: slidePlaceholderSchema.optional(),
  slide3: slidePlaceholderSchema.optional(),
  slide4: slidePlaceholderSchema.optional(),
  slide5: slidePlaceholderSchema.optional(),
  slide6: slidePlaceholderSchema.optional(),
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

// ── PATCH input — partial Slide 1 update from the editor ───────────────────
// The admin PATCH endpoint accepts a partial DeckPayloadV2 and merges it
// into the existing row. We validate the partial here so a typo in the
// editor cannot persist garbage. Shallow-merge per slide is the
// expected semantics — sending `{ slide1: { propertySubtitle: ... } }`
// replaces only that one slot, never the whole `slide1`.
export const deckPayloadV2PatchSchema = deckPayloadV2Schema.partial().extend({
  schemaVersion: z.literal(DECK_PAYLOAD_SCHEMA_VERSION).optional(),
});
export type DeckPayloadV2Patch = z.infer<typeof deckPayloadV2PatchSchema>;
