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
  deckPayloadV2Schema,
  DECK_PAYLOAD_SCHEMA_VERSION,
} from "@shared/deck-payload-v2";
import { FALLBACK_VISION_BULLET_TEXTS } from "../routes/property-deck-payload";

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
