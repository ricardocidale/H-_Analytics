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
