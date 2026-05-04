/**
 * Task #1004 — Deck-slot draft prompt / fallback budget contract
 *
 * Pins the fallback strings in `property-deck-payload.ts` against the shared
 * character budgets defined in `@shared/deck-payload-v2`. If someone changes
 * a shared constant (e.g. tightens SLIDE1_VISION_BULLET_MAX from 180 to 120)
 * without updating the fallback copy, these tests fail immediately instead of
 * letting the Zod patch-validation reject silently-truncated drafts at runtime.
 *
 * Also verifies that the DRAFT_SLOTS list only references paths that exist in
 * the DeckPayloadV2 schema, so a slot rename at the schema level surfaces here.
 */
import { describe, it, expect } from "vitest";
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
  SLIDE5_TRANSFORMATION_ROW_FEATURE_MAX,
  SLIDE5_TRANSFORMATION_ROW_EXISTING_MAX,
  SLIDE5_TRANSFORMATION_ROW_PROPOSED_MAX,
  deckPayloadV2Schema,
  DECK_PAYLOAD_SCHEMA_VERSION,
} from "@shared/deck-payload-v2";
import { FALLBACK_VISION_BULLET_TEXTS, isDraftSlot } from "../routes/property-deck-payload";
import { validateSlotOutput } from "../slides/slot-output-validator";

// ── Fallback bullet contract ───────────────────────────────────────────────

describe("draftVisionBullets — fallback copy budget contract", () => {
  it("provides at least SLIDE1_VISION_BULLETS_COUNT fallback entries", () => {
    expect(FALLBACK_VISION_BULLET_TEXTS.length).toBeGreaterThanOrEqual(
      SLIDE1_VISION_BULLETS_COUNT,
    );
  });

  it("every fallback bullet is within SLIDE1_VISION_BULLET_MAX characters (no silent truncation)", () => {
    for (const text of FALLBACK_VISION_BULLET_TEXTS) {
      expect(text.length).toBeLessThanOrEqual(SLIDE1_VISION_BULLET_MAX);
    }
  });

  it("every fallback bullet is a non-empty string", () => {
    for (const text of FALLBACK_VISION_BULLET_TEXTS) {
      expect(typeof text).toBe("string");
      expect(text.length).toBeGreaterThan(0);
    }
  });
});

// ── headerSubtitle static template budget contract ─────────────────────────
//
// The draftHeaderSubtitle fallback is built dynamically at call time from
// property data, but the static template that drives the "no description"
// branch is the longest it can ever be.  We pin the worst-case template
// length here so a copy edit doesn't accidentally exceed the budget.

describe("draftHeaderSubtitle — fallback template budget contract", () => {
  it("SLIDE1_HEADER_SUBTITLE_MAX is at least 80 characters (enough for one sentence)", () => {
    expect(SLIDE1_HEADER_SUBTITLE_MAX).toBeGreaterThanOrEqual(80);
  });

  it("the static fallback template is within SLIDE1_HEADER_SUBTITLE_MAX when filled with realistic max-length values", () => {
    // Simulate the worst-case fallback string:
    //   "A repositioned boutique property in <city, state> targeting $<adr> ADR across <rooms> keys."
    // Use the longest realistic values so the test catches any template growth.
    const worstCaseLocation = "San Francisco, California"; // 25 chars
    const worstCaseAdr = 9999;
    const worstCaseRooms = 999;
    const template = `A repositioned boutique property in ${worstCaseLocation} targeting $${worstCaseAdr} ADR across ${worstCaseRooms} keys.`;
    expect(template.length).toBeLessThanOrEqual(SLIDE1_HEADER_SUBTITLE_MAX);
  });
});

// ── DRAFT_SLOTS schema alignment ──────────────────────────────────────────
//
// Verify the two draftable slot paths ("slide1.headerSubtitle",
// "slide1.visionBullets") correspond to actual keys in the DeckPayloadV2
// schema.  A slot rename in the schema would fail here before reaching the
// runtime endpoint.

describe("DRAFT_SLOTS — schema alignment", () => {
  it("slide1.headerSubtitle is a recognised key in the slide1 schema", () => {
    const parsed = deckPayloadV2Schema.safeParse({
      schemaVersion: DECK_PAYLOAD_SCHEMA_VERSION,
      slide1: {
        headerSubtitle: {
          text: "Test subtitle",
          provenance: { source: "llm", updatedAt: new Date().toISOString() },
        },
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("slide1.visionBullets is a recognised key in the slide1 schema", () => {
    const parsed = deckPayloadV2Schema.safeParse({
      schemaVersion: DECK_PAYLOAD_SCHEMA_VERSION,
      slide1: {
        visionBullets: [
          {
            text: "Bullet one",
            provenance: { source: "llm", updatedAt: new Date().toISOString() },
          },
        ],
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("slide1.headerSubtitle rejects text exceeding SLIDE1_HEADER_SUBTITLE_MAX", () => {
    const overlong = "x".repeat(SLIDE1_HEADER_SUBTITLE_MAX + 1);
    const parsed = deckPayloadV2Schema.safeParse({
      schemaVersion: DECK_PAYLOAD_SCHEMA_VERSION,
      slide1: {
        headerSubtitle: {
          text: overlong,
          provenance: { source: "llm", updatedAt: new Date().toISOString() },
        },
      },
    });
    expect(parsed.success).toBe(false);
  });

  it("slide1.visionBullets rejects a bullet text exceeding SLIDE1_VISION_BULLET_MAX", () => {
    const overlong = "x".repeat(SLIDE1_VISION_BULLET_MAX + 1);
    const parsed = deckPayloadV2Schema.safeParse({
      schemaVersion: DECK_PAYLOAD_SCHEMA_VERSION,
      slide1: {
        visionBullets: [
          {
            text: overlong,
            provenance: { source: "llm", updatedAt: new Date().toISOString() },
          },
        ],
      },
    });
    expect(parsed.success).toBe(false);
  });

  it("slide1.visionBullets rejects more than SLIDE1_VISION_BULLETS_COUNT entries", () => {
    const bullet = {
      text: "Short bullet",
      provenance: { source: "llm" as const, updatedAt: new Date().toISOString() },
    };
    const parsed = deckPayloadV2Schema.safeParse({
      schemaVersion: DECK_PAYLOAD_SCHEMA_VERSION,
      slide1: {
        visionBullets: Array.from({ length: SLIDE1_VISION_BULLETS_COUNT + 1 }, () => bullet),
      },
    });
    expect(parsed.success).toBe(false);
  });
});

// ── Per-row draft slot contract (Task #1047) ─────────────────────────────
//
// Task #1030 added slide5.transformationRows[0..3] as recognised draft-slot
// keys with their own LLM handler and output validator path.  These tests
// pin:
//   (a) isDraftSlot() accepts all four per-row keys
//   (b) validateSlotOutput rejects over-budget feature/existing/proposed
//   (c) validateSlotOutput accepts a conforming row object

describe("isDraftSlot — per-row transformation keys", () => {
  const perRowKeys = [
    "slide5.transformationRows[0]",
    "slide5.transformationRows[1]",
    "slide5.transformationRows[2]",
    "slide5.transformationRows[3]",
  ] as const;

  for (const key of perRowKeys) {
    it(`recognises "${key}" as a valid draft slot`, () => {
      expect(isDraftSlot(key)).toBe(true);
    });
  }

  it("rejects an out-of-range per-row key", () => {
    expect(isDraftSlot("slide5.transformationRows[4]")).toBe(false);
    expect(isDraftSlot("slide5.transformationRows[-1]")).toBe(false);
  });

  it("rejects a non-string value", () => {
    expect(isDraftSlot(42)).toBe(false);
    expect(isDraftSlot(null)).toBe(false);
    expect(isDraftSlot(undefined)).toBe(false);
  });
});

describe("validateSlotOutput — per-row budget enforcement", () => {
  const conformingRow = {
    feature: "Lobby",
    existing: "Dated décor, no seating",
    proposed: "Redesigned lounge with local art and co-working nooks",
  };

  it("accepts a conforming per-row object for slide5.transformationRows[0]", () => {
    const result = validateSlotOutput("slide5.transformationRows[0]", conformingRow);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(conformingRow);
    }
  });

  it("accepts a conforming per-row object for each index [0..3]", () => {
    const keys = [
      "slide5.transformationRows[0]",
      "slide5.transformationRows[1]",
      "slide5.transformationRows[2]",
      "slide5.transformationRows[3]",
    ] as const;
    for (const key of keys) {
      const result = validateSlotOutput(key, conformingRow);
      expect(result.ok).toBe(true);
    }
  });

  it("rejects feature exceeding SLIDE5_TRANSFORMATION_ROW_FEATURE_MAX", () => {
    const row = {
      ...conformingRow,
      feature: "x".repeat(SLIDE5_TRANSFORMATION_ROW_FEATURE_MAX + 1),
    };
    const result = validateSlotOutput("slide5.transformationRows[0]", row);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors[0]).toContain("feature");
    }
  });

  it("rejects existing exceeding SLIDE5_TRANSFORMATION_ROW_EXISTING_MAX", () => {
    const row = {
      ...conformingRow,
      existing: "x".repeat(SLIDE5_TRANSFORMATION_ROW_EXISTING_MAX + 1),
    };
    const result = validateSlotOutput("slide5.transformationRows[1]", row);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors[0]).toContain("existing");
    }
  });

  it("rejects proposed exceeding SLIDE5_TRANSFORMATION_ROW_PROPOSED_MAX", () => {
    const row = {
      ...conformingRow,
      proposed: "x".repeat(SLIDE5_TRANSFORMATION_ROW_PROPOSED_MAX + 1),
    };
    const result = validateSlotOutput("slide5.transformationRows[2]", row);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors[0]).toContain("proposed");
    }
  });

  it("rejects when all three fields exceed their budgets simultaneously", () => {
    const row = {
      feature: "x".repeat(SLIDE5_TRANSFORMATION_ROW_FEATURE_MAX + 1),
      existing: "x".repeat(SLIDE5_TRANSFORMATION_ROW_EXISTING_MAX + 1),
      proposed: "x".repeat(SLIDE5_TRANSFORMATION_ROW_PROPOSED_MAX + 1),
    };
    const result = validateSlotOutput("slide5.transformationRows[3]", row);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBe(3);
    }
  });

  it("rejects a non-string feature field", () => {
    const row = { feature: 123, existing: "ok", proposed: "ok" };
    const result = validateSlotOutput("slide5.transformationRows[0]", row);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("feature");
      expect(result.errors[0]).toContain("expected string");
    }
  });

  it("accepts fields at exactly their max length", () => {
    const row = {
      feature: "a".repeat(SLIDE5_TRANSFORMATION_ROW_FEATURE_MAX),
      existing: "b".repeat(SLIDE5_TRANSFORMATION_ROW_EXISTING_MAX),
      proposed: "c".repeat(SLIDE5_TRANSFORMATION_ROW_PROPOSED_MAX),
    };
    const result = validateSlotOutput("slide5.transformationRows[0]", row);
    expect(result.ok).toBe(true);
  });
});

// ── Slide 2 draft-slot contract (Task #1055) ─────────────────────────────
//
// slide2 has three draftable text slots: operationalModelText, revenueBullet,
// and programmingBullet. Each follows the { text: string } shape.

describe("isDraftSlot — slide2 keys", () => {
  const slide2Keys = [
    "slide2.operationalModelText",
    "slide2.revenueBullet",
    "slide2.programmingBullet",
  ] as const;

  for (const key of slide2Keys) {
    it(`recognises "${key}" as a valid draft slot`, () => {
      expect(isDraftSlot(key)).toBe(true);
    });
  }
});

describe("validateSlotOutput — slide2.operationalModelText budget enforcement", () => {
  it("accepts a conforming text value", () => {
    const result = validateSlotOutput("slide2.operationalModelText", {
      text: "A vertically integrated boutique hotel model",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ text: "A vertically integrated boutique hotel model" });
    }
  });

  it("accepts text at exactly SLIDE2_OPERATIONAL_MODEL_MAX", () => {
    const result = validateSlotOutput("slide2.operationalModelText", {
      text: "a".repeat(SLIDE2_OPERATIONAL_MODEL_MAX),
    });
    expect(result.ok).toBe(true);
  });

  it("rejects text exceeding SLIDE2_OPERATIONAL_MODEL_MAX", () => {
    const result = validateSlotOutput("slide2.operationalModelText", {
      text: "x".repeat(SLIDE2_OPERATIONAL_MODEL_MAX + 1),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors[0]).toContain("text");
    }
  });

  it("rejects a non-string text field", () => {
    const result = validateSlotOutput("slide2.operationalModelText", { text: 42 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("text");
      expect(result.errors[0]).toContain("expected string");
    }
  });
});

describe("validateSlotOutput — slide2.revenueBullet budget enforcement", () => {
  it("accepts a conforming text value", () => {
    const result = validateSlotOutput("slide2.revenueBullet", {
      text: "Dynamic pricing strategy targeting leisure and corporate segments",
    });
    expect(result.ok).toBe(true);
  });

  it("accepts text at exactly SLIDE2_REVENUE_BULLET_MAX", () => {
    const result = validateSlotOutput("slide2.revenueBullet", {
      text: "b".repeat(SLIDE2_REVENUE_BULLET_MAX),
    });
    expect(result.ok).toBe(true);
  });

  it("rejects text exceeding SLIDE2_REVENUE_BULLET_MAX", () => {
    const result = validateSlotOutput("slide2.revenueBullet", {
      text: "x".repeat(SLIDE2_REVENUE_BULLET_MAX + 1),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors[0]).toContain("text");
    }
  });

  it("rejects a non-string text field", () => {
    const result = validateSlotOutput("slide2.revenueBullet", { text: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("expected string");
    }
  });
});

describe("validateSlotOutput — slide2.programmingBullet budget enforcement", () => {
  it("accepts a conforming text value", () => {
    const result = validateSlotOutput("slide2.programmingBullet", {
      text: "Curated wellness and culinary programming anchored by local partnerships",
    });
    expect(result.ok).toBe(true);
  });

  it("accepts text at exactly SLIDE2_PROGRAMMING_BULLET_MAX", () => {
    const result = validateSlotOutput("slide2.programmingBullet", {
      text: "c".repeat(SLIDE2_PROGRAMMING_BULLET_MAX),
    });
    expect(result.ok).toBe(true);
  });

  it("rejects text exceeding SLIDE2_PROGRAMMING_BULLET_MAX", () => {
    const result = validateSlotOutput("slide2.programmingBullet", {
      text: "x".repeat(SLIDE2_PROGRAMMING_BULLET_MAX + 1),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors[0]).toContain("text");
    }
  });

  it("rejects a non-string text field", () => {
    const result = validateSlotOutput("slide2.programmingBullet", { text: null });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("expected string");
    }
  });
});

// ── Slide 2 schema alignment ──────────────────────────────────────────────

describe("DRAFT_SLOTS — slide2 schema alignment", () => {
  const provenance = { source: "llm", updatedAt: new Date().toISOString() };

  it("slide2.operationalModelText is a recognised key in the slide2 schema", () => {
    const parsed = deckPayloadV2Schema.safeParse({
      schemaVersion: DECK_PAYLOAD_SCHEMA_VERSION,
      slide2: { operationalModelText: { text: "Test model text", provenance } },
    });
    expect(parsed.success).toBe(true);
  });

  it("slide2.operationalModelText rejects text exceeding SLIDE2_OPERATIONAL_MODEL_MAX", () => {
    const parsed = deckPayloadV2Schema.safeParse({
      schemaVersion: DECK_PAYLOAD_SCHEMA_VERSION,
      slide2: {
        operationalModelText: {
          text: "x".repeat(SLIDE2_OPERATIONAL_MODEL_MAX + 1),
          provenance,
        },
      },
    });
    expect(parsed.success).toBe(false);
  });

  it("slide2.revenueBullet is a recognised key in the slide2 schema", () => {
    const parsed = deckPayloadV2Schema.safeParse({
      schemaVersion: DECK_PAYLOAD_SCHEMA_VERSION,
      slide2: { revenueBullet: { text: "Test revenue strategy", provenance } },
    });
    expect(parsed.success).toBe(true);
  });

  it("slide2.revenueBullet rejects text exceeding SLIDE2_REVENUE_BULLET_MAX", () => {
    const parsed = deckPayloadV2Schema.safeParse({
      schemaVersion: DECK_PAYLOAD_SCHEMA_VERSION,
      slide2: {
        revenueBullet: {
          text: "x".repeat(SLIDE2_REVENUE_BULLET_MAX + 1),
          provenance,
        },
      },
    });
    expect(parsed.success).toBe(false);
  });

  it("slide2.programmingBullet is a recognised key in the slide2 schema", () => {
    const parsed = deckPayloadV2Schema.safeParse({
      schemaVersion: DECK_PAYLOAD_SCHEMA_VERSION,
      slide2: { programmingBullet: { text: "Test programming", provenance } },
    });
    expect(parsed.success).toBe(true);
  });

  it("slide2.programmingBullet rejects text exceeding SLIDE2_PROGRAMMING_BULLET_MAX", () => {
    const parsed = deckPayloadV2Schema.safeParse({
      schemaVersion: DECK_PAYLOAD_SCHEMA_VERSION,
      slide2: {
        programmingBullet: {
          text: "x".repeat(SLIDE2_PROGRAMMING_BULLET_MAX + 1),
          provenance,
        },
      },
    });
    expect(parsed.success).toBe(false);
  });
});

// ── Slide 3 draft-slot contract (Task #1055) ─────────────────────────────
//
// slide3 has four draftable slots: conceptParagraph (text), marketRationale
// (text), reasons (array of { label, detail }), and closingLine (text).

describe("isDraftSlot — slide3 keys", () => {
  const slide3Keys = [
    "slide3.conceptParagraph",
    "slide3.marketRationale",
    "slide3.reasons",
    "slide3.closingLine",
  ] as const;

  for (const key of slide3Keys) {
    it(`recognises "${key}" as a valid draft slot`, () => {
      expect(isDraftSlot(key)).toBe(true);
    });
  }
});

describe("validateSlotOutput — slide3.conceptParagraph budget enforcement", () => {
  it("accepts a conforming text value", () => {
    const result = validateSlotOutput("slide3.conceptParagraph", {
      text: "A reimagined 19th-century estate blending heritage architecture with modern amenities",
    });
    expect(result.ok).toBe(true);
  });

  it("accepts text at exactly SLIDE3_CONCEPT_PARAGRAPH_MAX", () => {
    const result = validateSlotOutput("slide3.conceptParagraph", {
      text: "a".repeat(SLIDE3_CONCEPT_PARAGRAPH_MAX),
    });
    expect(result.ok).toBe(true);
  });

  it("rejects text exceeding SLIDE3_CONCEPT_PARAGRAPH_MAX", () => {
    const result = validateSlotOutput("slide3.conceptParagraph", {
      text: "x".repeat(SLIDE3_CONCEPT_PARAGRAPH_MAX + 1),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors[0]).toContain("text");
    }
  });

  it("rejects a non-string text field", () => {
    const result = validateSlotOutput("slide3.conceptParagraph", { text: 99 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("expected string");
    }
  });
});

describe("validateSlotOutput — slide3.marketRationale budget enforcement", () => {
  it("accepts a conforming text value", () => {
    const result = validateSlotOutput("slide3.marketRationale", {
      text: "The Hudson Valley market has seen 22% ADR growth year-over-year",
    });
    expect(result.ok).toBe(true);
  });

  it("accepts text at exactly SLIDE3_MARKET_RATIONALE_MAX", () => {
    const result = validateSlotOutput("slide3.marketRationale", {
      text: "b".repeat(SLIDE3_MARKET_RATIONALE_MAX),
    });
    expect(result.ok).toBe(true);
  });

  it("rejects text exceeding SLIDE3_MARKET_RATIONALE_MAX", () => {
    const result = validateSlotOutput("slide3.marketRationale", {
      text: "x".repeat(SLIDE3_MARKET_RATIONALE_MAX + 1),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors[0]).toContain("text");
    }
  });

  it("rejects a non-string text field", () => {
    const result = validateSlotOutput("slide3.marketRationale", { text: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("expected string");
    }
  });
});

describe("validateSlotOutput — slide3.reasons budget enforcement", () => {
  const conformingReasons = {
    reasons: [
      { label: "Location", detail: "Prime Hudson Valley corridor with metro access" },
      { label: "Market Gap", detail: "No boutique product between $250–$400 ADR" },
      { label: "Upside", detail: "F&B and event revenue diversify beyond rooms" },
    ],
  };

  it("accepts a conforming reasons array", () => {
    const result = validateSlotOutput("slide3.reasons", conformingReasons);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(conformingReasons);
    }
  });

  it("accepts reasons with fields at exactly their max lengths", () => {
    const result = validateSlotOutput("slide3.reasons", {
      reasons: [
        {
          label: "a".repeat(SLIDE3_REASON_LABEL_MAX),
          detail: "b".repeat(SLIDE3_REASON_DETAIL_MAX),
        },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a label exceeding SLIDE3_REASON_LABEL_MAX", () => {
    const result = validateSlotOutput("slide3.reasons", {
      reasons: [
        {
          label: "x".repeat(SLIDE3_REASON_LABEL_MAX + 1),
          detail: "Short detail",
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors[0]).toContain("label");
    }
  });

  it("rejects a detail exceeding SLIDE3_REASON_DETAIL_MAX", () => {
    const result = validateSlotOutput("slide3.reasons", {
      reasons: [
        {
          label: "Location",
          detail: "x".repeat(SLIDE3_REASON_DETAIL_MAX + 1),
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors[0]).toContain("detail");
    }
  });

  it("rejects more than SLIDE3_REASONS_COUNT entries", () => {
    const reason = { label: "Test", detail: "Short detail" };
    const result = validateSlotOutput("slide3.reasons", {
      reasons: Array.from({ length: SLIDE3_REASONS_COUNT + 1 }, () => reason),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors[0]).toContain("reasons");
    }
  });

  it("rejects when both label and detail exceed their budgets", () => {
    const result = validateSlotOutput("slide3.reasons", {
      reasons: [
        {
          label: "x".repeat(SLIDE3_REASON_LABEL_MAX + 1),
          detail: "x".repeat(SLIDE3_REASON_DETAIL_MAX + 1),
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBe(2);
    }
  });

  it("rejects a non-string label field", () => {
    const result = validateSlotOutput("slide3.reasons", {
      reasons: [{ label: 123, detail: "ok" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("label");
      expect(result.errors[0]).toContain("expected string");
    }
  });

  it("rejects a non-array reasons field", () => {
    const result = validateSlotOutput("slide3.reasons", { reasons: "not an array" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("reasons");
      expect(result.errors[0]).toContain("expected array");
    }
  });
});

describe("validateSlotOutput — slide3.closingLine budget enforcement", () => {
  it("accepts a conforming text value", () => {
    const result = validateSlotOutput("slide3.closingLine", {
      text: "Where heritage meets modern hospitality",
    });
    expect(result.ok).toBe(true);
  });

  it("accepts text at exactly SLIDE3_CLOSING_LINE_MAX", () => {
    const result = validateSlotOutput("slide3.closingLine", {
      text: "c".repeat(SLIDE3_CLOSING_LINE_MAX),
    });
    expect(result.ok).toBe(true);
  });

  it("rejects text exceeding SLIDE3_CLOSING_LINE_MAX", () => {
    const result = validateSlotOutput("slide3.closingLine", {
      text: "x".repeat(SLIDE3_CLOSING_LINE_MAX + 1),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors[0]).toContain("text");
    }
  });

  it("rejects a non-string text field", () => {
    const result = validateSlotOutput("slide3.closingLine", { text: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("expected string");
    }
  });
});

// ── Slide 3 schema alignment ──────────────────────────────────────────────

describe("DRAFT_SLOTS — slide3 schema alignment", () => {
  const provenance = { source: "llm", updatedAt: new Date().toISOString() };

  it("slide3.conceptParagraph is a recognised key in the slide3 schema", () => {
    const parsed = deckPayloadV2Schema.safeParse({
      schemaVersion: DECK_PAYLOAD_SCHEMA_VERSION,
      slide3: { conceptParagraph: { text: "Test concept", provenance } },
    });
    expect(parsed.success).toBe(true);
  });

  it("slide3.conceptParagraph rejects text exceeding SLIDE3_CONCEPT_PARAGRAPH_MAX", () => {
    const parsed = deckPayloadV2Schema.safeParse({
      schemaVersion: DECK_PAYLOAD_SCHEMA_VERSION,
      slide3: {
        conceptParagraph: {
          text: "x".repeat(SLIDE3_CONCEPT_PARAGRAPH_MAX + 1),
          provenance,
        },
      },
    });
    expect(parsed.success).toBe(false);
  });

  it("slide3.marketRationale is a recognised key in the slide3 schema", () => {
    const parsed = deckPayloadV2Schema.safeParse({
      schemaVersion: DECK_PAYLOAD_SCHEMA_VERSION,
      slide3: { marketRationale: { text: "Test rationale", provenance } },
    });
    expect(parsed.success).toBe(true);
  });

  it("slide3.marketRationale rejects text exceeding SLIDE3_MARKET_RATIONALE_MAX", () => {
    const parsed = deckPayloadV2Schema.safeParse({
      schemaVersion: DECK_PAYLOAD_SCHEMA_VERSION,
      slide3: {
        marketRationale: {
          text: "x".repeat(SLIDE3_MARKET_RATIONALE_MAX + 1),
          provenance,
        },
      },
    });
    expect(parsed.success).toBe(false);
  });

  it("slide3.reasons is a recognised key in the slide3 schema", () => {
    const parsed = deckPayloadV2Schema.safeParse({
      schemaVersion: DECK_PAYLOAD_SCHEMA_VERSION,
      slide3: {
        reasons: [
          {
            label: { text: "Location", provenance },
            detail: { text: "Near metro access", provenance },
          },
        ],
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("slide3.reasons rejects more than SLIDE3_REASONS_COUNT entries", () => {
    const reason = {
      label: { text: "Test", provenance },
      detail: { text: "Detail", provenance },
    };
    const parsed = deckPayloadV2Schema.safeParse({
      schemaVersion: DECK_PAYLOAD_SCHEMA_VERSION,
      slide3: {
        reasons: Array.from({ length: SLIDE3_REASONS_COUNT + 1 }, () => reason),
      },
    });
    expect(parsed.success).toBe(false);
  });

  it("slide3.reasons rejects a label exceeding SLIDE3_REASON_LABEL_MAX", () => {
    const parsed = deckPayloadV2Schema.safeParse({
      schemaVersion: DECK_PAYLOAD_SCHEMA_VERSION,
      slide3: {
        reasons: [
          {
            label: { text: "x".repeat(SLIDE3_REASON_LABEL_MAX + 1), provenance },
            detail: { text: "ok", provenance },
          },
        ],
      },
    });
    expect(parsed.success).toBe(false);
  });

  it("slide3.closingLine is a recognised key in the slide3 schema", () => {
    const parsed = deckPayloadV2Schema.safeParse({
      schemaVersion: DECK_PAYLOAD_SCHEMA_VERSION,
      slide3: { closingLine: { text: "Test closing line", provenance } },
    });
    expect(parsed.success).toBe(true);
  });

  it("slide3.closingLine rejects text exceeding SLIDE3_CLOSING_LINE_MAX", () => {
    const parsed = deckPayloadV2Schema.safeParse({
      schemaVersion: DECK_PAYLOAD_SCHEMA_VERSION,
      slide3: {
        closingLine: {
          text: "x".repeat(SLIDE3_CLOSING_LINE_MAX + 1),
          provenance,
        },
      },
    });
    expect(parsed.success).toBe(false);
  });
});
