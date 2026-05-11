/**
 * lucca-best-shot-prompt.ts — Factory v2 U8.
 *
 * Lives in code per Open Question resolution in the U8 plan (the prompt
 * template is a contract — versioning it alongside the detection rules and
 * tests keeps the contract auditable).
 *
 * Lucca's "best-shot" mode fires when a slot needs data the property doesn't
 * have. The detection happens deterministically in `data-sufficiency-rules`;
 * once a slot is marked best-shot, this module's prompt is composed (slot
 * intent + whatever property context IS available) and shipped to Opus 4.7
 * for a plausible narrative draft. The same call returns a structured
 * `wishListLog` rationale (`whyItHelps`) so the gap surfaces in the wish-list
 * slide (R8, owned by U9).
 *
 * Numeric literals (CLAUDE.md §1): no numeric literals in this module —
 * character limits and counts come from `@shared/deck-payload-v2`; the model
 * + token budget come from `deck-render-constants.ts` (LORENZO_VISION_MODEL =
 * Opus 4.7 per the plan's "generous budget" rule for best-shot work).
 */
import type Anthropic from "@anthropic-ai/sdk";
import {
  SLIDE1_HEADER_SUBTITLE_MAX,
  SLIDE1_VISION_BULLET_MAX,
  SLIDE1_VISION_BULLETS_COUNT,
  SLIDE2_OPERATIONAL_MODEL_MAX,
  SLIDE2_REVENUE_BULLET_MAX,
  SLIDE2_PROGRAMMING_BULLET_MAX,
  SLIDE3_CONCEPT_PARAGRAPH_MAX,
  SLIDE3_MARKET_RATIONALE_MAX,
  SLIDE3_REASON_LABEL_MAX,
  SLIDE3_REASON_DETAIL_MAX,
  SLIDE3_REASONS_COUNT,
  SLIDE3_CLOSING_LINE_MAX,
  SLIDE5_TRANSFORMATION_DESCRIPTION_MAX,
  SLIDE5_TRANSFORMATION_ROW_FEATURE_MAX,
  SLIDE5_TRANSFORMATION_ROW_EXISTING_MAX,
  SLIDE5_TRANSFORMATION_ROW_PROPOSED_MAX,
  SLIDE5_TRANSFORMATION_ROWS_COUNT,
} from "@shared/deck-payload-v2";

import { LORENZO_VISION_MODEL, LUCCA_MAX_TOKENS } from "./deck-render-constants";
import type { DraftSlotKey } from "./slot-context-map";

// ── Model + tokens (re-exported for the lucca-draft consumer) ───────────────

/**
 * Opus 4.7 for best-shot drafting — the plan's "generous budget" rule. Reuses
 * LORENZO_VISION_MODEL (Opus 4.7) so the slide-factory model surface stays in
 * one place (CLAUDE.md §1 integration identifier rule).
 */
export const LUCCA_BEST_SHOT_MODEL = LORENZO_VISION_MODEL;

/** max_tokens for a best-shot call — same budget as a normal Lucca draft. */
export const LUCCA_BEST_SHOT_MAX_TOKENS = LUCCA_MAX_TOKENS;

// ── System prompt ───────────────────────────────────────────────────────────

/**
 * Lucca's best-shot mode persona. Two contracts:
 *   1. Produce plausible narrative text for the slot using whatever property
 *      context IS available (do not invent specific numbers).
 *   2. Identify the missing fields and explain — in one sentence each — why
 *      capturing that field would tighten the narrative.
 */
export const LUCCA_BEST_SHOT_SYSTEM_PROMPT =
  "You are Lucca, an investor-deck copy specialist for LB hospitality acquisitions.\n\n" +
  "You are operating in BEST-SHOT mode: the property record is missing data " +
  "the requested slot would normally rely on. Produce the highest-quality " +
  "narrative you can with the data that IS provided, and DO NOT invent " +
  "specific numbers or facts the property record does not contain. Tone: " +
  "confident, professional, investor-grade. Stay strictly within character " +
  "budgets.\n\n" +
  "After drafting, return — in the same tool call — the list of missing data " +
  "fields that would materially improve the draft if available. For each " +
  "missing field, supply a one-sentence 'why this would help' rationale that " +
  "the wish-list slide builder will surface to the admin. Be specific about " +
  "the impact (e.g., 'enables ADR-anchored revenue framing') — generic " +
  "rationales like 'more data is better' are not useful.";

// ── Tool schema (single tool, drafted text + wishListLog entries) ───────────

/**
 * Slot-shape contract for a best-shot call. The shape mirrors the slot key
 * being drafted — most slots return a single text field; the bullet/reason/
 * row aggregates return their structured arrays. The downstream lucca-draft
 * caller serialises the structured outputs the same way `runLuccaDraft` does
 * (see `serializeBullets`/`serializeReasons`/`serializeRows`).
 */
export interface BestShotTextOutput {
  text: string;
}

export interface BestShotBulletsOutput {
  bullets: Array<{ text: string }>;
}

export interface BestShotReasonsOutput {
  reasons: Array<{ label: string; detail: string }>;
}

export interface BestShotRowsOutput {
  rows: Array<{ feature: string; existing: string; proposed: string }>;
}

/** One missing-data field surfaced by the LLM for the wish-list slide. */
export interface BestShotWishListLogEntry {
  /** Canonical missing-data field key (see `data-sufficiency-rules.ts`). */
  field: string;
  /** One-sentence rationale shown on the wish-list slide. */
  whyItHelps: string;
}

/**
 * Combined output of a best-shot LLM call: the slot-shaped draft + the
 * wish-list entries. The draft shape varies per slot, but the wish-list shape
 * is uniform.
 */
export interface BestShotResult<T> {
  draft: T;
  wishListLog: BestShotWishListLogEntry[];
}

/**
 * Build the Anthropic tool schema for a given slot. Each slot key produces a
 * tool whose `input_schema` matches the slot's normal Lucca output PLUS a
 * uniform `wishListLog` array of `{ field, whyItHelps }` entries.
 *
 * Returning a fresh tool per slot (instead of a shared schema with a slot
 * discriminator) keeps the tool-use contract per call tight and lets the LLM
 * exercise the same constraint-fitting it does for normal drafts.
 */
export function buildBestShotTool(slotKey: DraftSlotKey): Anthropic.Tool {
  const wishListLogSchema = {
    type: "array" as const,
    description:
      "List of missing data fields that would tighten this draft. Each " +
      "entry: { field: canonical key, whyItHelps: one-sentence rationale }.",
    items: {
      type: "object" as const,
      required: ["field", "whyItHelps"],
      properties: {
        field: { type: "string" as const },
        whyItHelps: { type: "string" as const },
      },
    },
  };

  const baseProps = {
    wishListLog: wishListLogSchema,
  };

  // Map each slot key to its draft-output shape (same shape as the normal
  // draft path). Switching by `slotKey` so the schema is exact per slot —
  // matches how `lucca-draft.ts` builds its slot tools.
  switch (slotKey) {
    case "slide1.headerSubtitle":
      return {
        name: "emit_best_shot_slide1_header_subtitle",
        description:
          `Emit a best-shot Slide 1 header subtitle (max ${SLIDE1_HEADER_SUBTITLE_MAX} chars) plus the wish-list log.`,
        input_schema: {
          type: "object",
          required: ["draft", "wishListLog"],
          properties: {
            draft: {
              type: "object",
              required: ["text"],
              properties: {
                text: {
                  type: "string",
                  maxLength: SLIDE1_HEADER_SUBTITLE_MAX,
                },
              },
            },
            ...baseProps,
          },
        },
      };
    case "slide1.visionBullets":
      return {
        name: "emit_best_shot_slide1_vision_bullets",
        description:
          `Emit best-shot Slide 1 vision bullets (exactly ${SLIDE1_VISION_BULLETS_COUNT}, each max ${SLIDE1_VISION_BULLET_MAX} chars) plus the wish-list log.`,
        input_schema: {
          type: "object",
          required: ["draft", "wishListLog"],
          properties: {
            draft: {
              type: "object",
              required: ["bullets"],
              properties: {
                bullets: {
                  type: "array",
                  minItems: SLIDE1_VISION_BULLETS_COUNT,
                  maxItems: SLIDE1_VISION_BULLETS_COUNT,
                  items: {
                    type: "object",
                    required: ["text"],
                    properties: {
                      text: {
                        type: "string",
                        maxLength: SLIDE1_VISION_BULLET_MAX,
                      },
                    },
                  },
                },
              },
            },
            ...baseProps,
          },
        },
      };
    case "slide2.operationalModelText":
      return makeSimpleTextTool(
        "emit_best_shot_slide2_operational_model_text",
        SLIDE2_OPERATIONAL_MODEL_MAX,
      );
    case "slide2.revenueBullet":
      return makeSimpleTextTool(
        "emit_best_shot_slide2_revenue_bullet",
        SLIDE2_REVENUE_BULLET_MAX,
      );
    case "slide2.programmingBullet":
      return makeSimpleTextTool(
        "emit_best_shot_slide2_programming_bullet",
        SLIDE2_PROGRAMMING_BULLET_MAX,
      );
    case "slide3.conceptParagraph":
      return makeSimpleTextTool(
        "emit_best_shot_slide3_concept_paragraph",
        SLIDE3_CONCEPT_PARAGRAPH_MAX,
      );
    case "slide3.marketRationale":
      return makeSimpleTextTool(
        "emit_best_shot_slide3_market_rationale",
        SLIDE3_MARKET_RATIONALE_MAX,
      );
    case "slide3.reasons":
      return {
        name: "emit_best_shot_slide3_reasons",
        description:
          `Emit best-shot Slide 3 reasons (exactly ${SLIDE3_REASONS_COUNT}, label max ${SLIDE3_REASON_LABEL_MAX}, detail max ${SLIDE3_REASON_DETAIL_MAX}) plus the wish-list log.`,
        input_schema: {
          type: "object",
          required: ["draft", "wishListLog"],
          properties: {
            draft: {
              type: "object",
              required: ["reasons"],
              properties: {
                reasons: {
                  type: "array",
                  minItems: SLIDE3_REASONS_COUNT,
                  maxItems: SLIDE3_REASONS_COUNT,
                  items: {
                    type: "object",
                    required: ["label", "detail"],
                    properties: {
                      label: {
                        type: "string",
                        maxLength: SLIDE3_REASON_LABEL_MAX,
                      },
                      detail: {
                        type: "string",
                        maxLength: SLIDE3_REASON_DETAIL_MAX,
                      },
                    },
                  },
                },
              },
            },
            ...baseProps,
          },
        },
      };
    case "slide3.closingLine":
      return makeSimpleTextTool(
        "emit_best_shot_slide3_closing_line",
        SLIDE3_CLOSING_LINE_MAX,
      );
    case "slide5.transformationDescription":
      return makeSimpleTextTool(
        "emit_best_shot_slide5_transformation_description",
        SLIDE5_TRANSFORMATION_DESCRIPTION_MAX,
      );
    case "slide5.transformationRows":
    case "slide5.transformationRows[0]":
    case "slide5.transformationRows[1]":
    case "slide5.transformationRows[2]":
    case "slide5.transformationRows[3]":
      return {
        name: "emit_best_shot_slide5_transformation_rows",
        description:
          `Emit best-shot Slide 5 transformation rows (exactly ${SLIDE5_TRANSFORMATION_ROWS_COUNT}, feature max ${SLIDE5_TRANSFORMATION_ROW_FEATURE_MAX}, existing max ${SLIDE5_TRANSFORMATION_ROW_EXISTING_MAX}, proposed max ${SLIDE5_TRANSFORMATION_ROW_PROPOSED_MAX}) plus the wish-list log.`,
        input_schema: {
          type: "object",
          required: ["draft", "wishListLog"],
          properties: {
            draft: {
              type: "object",
              required: ["rows"],
              properties: {
                rows: {
                  type: "array",
                  minItems: SLIDE5_TRANSFORMATION_ROWS_COUNT,
                  maxItems: SLIDE5_TRANSFORMATION_ROWS_COUNT,
                  items: {
                    type: "object",
                    required: ["feature", "existing", "proposed"],
                    properties: {
                      feature: {
                        type: "string",
                        maxLength: SLIDE5_TRANSFORMATION_ROW_FEATURE_MAX,
                      },
                      existing: {
                        type: "string",
                        maxLength: SLIDE5_TRANSFORMATION_ROW_EXISTING_MAX,
                      },
                      proposed: {
                        type: "string",
                        maxLength: SLIDE5_TRANSFORMATION_ROW_PROPOSED_MAX,
                      },
                    },
                  },
                },
              },
            },
            ...baseProps,
          },
        },
      };
    default: {
      // Exhaustiveness check — TS will error here if a new DraftSlotKey is
      // added without a corresponding tool. The runtime cast keeps the
      // function total at the type level.
      const _exhaustive: never = slotKey;
      throw new Error(`buildBestShotTool: unknown slot key ${_exhaustive as string}`);
    }
  }
}

function makeSimpleTextTool(name: string, maxChars: number): Anthropic.Tool {
  return {
    name,
    description: `Emit best-shot text (max ${maxChars} chars) plus the wish-list log.`,
    input_schema: {
      type: "object",
      required: ["draft", "wishListLog"],
      properties: {
        draft: {
          type: "object",
          required: ["text"],
          properties: {
            text: { type: "string", maxLength: maxChars },
          },
        },
        wishListLog: {
          type: "array",
          description:
            "List of missing data fields that would tighten this draft. Each " +
            "entry: { field: canonical key, whyItHelps: one-sentence rationale }.",
          items: {
            type: "object",
            required: ["field", "whyItHelps"],
            properties: {
              field: { type: "string" },
              whyItHelps: { type: "string" },
            },
          },
        },
      },
    },
  };
}

// ── User prompt ─────────────────────────────────────────────────────────────

/**
 * Build the user prompt for a best-shot call. The prompt names the slot,
 * lists the property fields the slot would normally use, and explicitly
 * marks which of those fields are MISSING (so the LLM doesn't try to
 * fabricate them).
 */
export function buildBestShotUserPrompt(
  slotKey: DraftSlotKey,
  availableContext: string,
  missingFields: string[],
): string {
  const slotIntent = SLOT_INTENT[slotKey];
  const missingBlock =
    missingFields.length > 0
      ? `\nMISSING fields (the property record does not have these — do NOT fabricate values for them):\n${missingFields.map((f) => `  - ${f}`).join("\n")}`
      : "";
  return (
    `Slot: ${slotKey}\n` +
    `Intent: ${slotIntent}\n\n` +
    `Property context (only the fields the property actually has):\n${availableContext}` +
    `${missingBlock}\n\n` +
    "Draft a best-shot version of this slot using only the available context. " +
    "Then emit the wish-list log naming each missing field above plus a " +
    "one-sentence 'why this would help' rationale per field."
  );
}

/**
 * One-sentence editorial intent per slot — names what the slot is trying to
 * accomplish in the deck so the LLM can produce content aligned with that
 * intent even when data is sparse. Sourced from the canonical brief.
 */
const SLOT_INTENT: Record<DraftSlotKey, string> = {
  "slide1.headerSubtitle":
    "A one-line tagline that anchors the property's location + concept on the hero slide.",
  "slide1.visionBullets":
    "Three investor-grade bullets capturing the property's strategic thesis.",
  "slide2.operationalModelText":
    "An italic-serif overview of how this property will be operated.",
  "slide2.revenueBullet":
    "One bullet on revenue / rate strategy.",
  "slide2.programmingBullet":
    "One bullet on programming and amenity strategy.",
  "slide3.conceptParagraph":
    "A paragraph framing 'the concept' — what makes this property's investment proposition unique.",
  "slide3.marketRationale":
    "A paragraph explaining why the property's market supports the investment.",
  "slide3.reasons":
    "Three reason/detail pairs answering 'Why this model?' for the property.",
  "slide3.closingLine":
    "An investor call-to-action one-liner closing slide 3.",
  "slide5.transformationDescription":
    "A paragraph describing the renovation / transformation thesis.",
  "slide5.transformationRows":
    "A 4-row before/after comparison table (feature | existing | proposed).",
  "slide5.transformationRows[0]":
    "First row of the before/after table.",
  "slide5.transformationRows[1]":
    "Second row of the before/after table.",
  "slide5.transformationRows[2]":
    "Third row of the before/after table.",
  "slide5.transformationRows[3]":
    "Fourth row of the before/after table.",
};
