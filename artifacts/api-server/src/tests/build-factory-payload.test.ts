/**
 * build-factory-payload — U1 tests.
 *
 * Pins the contract that:
 *   1. Slot text comes from `luccaDraft` (canonical-contract source).
 *   2. Property IDs and `agentResults` do NOT influence slot copy — their
 *      absence cannot alter `DeckPayloadV2` output.
 *   3. The output validates against `deckPayloadV2Schema` (integration check).
 *   4. Slots without a draft (or with malformed JSON for reasons / rows /
 *      bullets) are omitted, not populated with placeholders.
 */
import { describe, it, expect } from "vitest";
import { buildFactoryPayload } from "../slides/build-factory-payload";
import {
  deckPayloadV2Schema,
  DECK_PAYLOAD_SCHEMA_VERSION,
  SLIDE1_HEADER_SUBTITLE_MAX,
  SLIDE1_VISION_BULLET_MAX,
  SLIDE1_VISION_BULLETS_COUNT,
  SLIDE3_REASONS_COUNT,
  SLIDE5_TRANSFORMATION_ROWS_COUNT,
} from "@shared/deck-payload-v2";
import type { LuccaSlotDraft, SlideFactoryRun } from "@workspace/db";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeDraft(value: string, approved = true): LuccaSlotDraft {
  return {
    value,
    approved,
    approvedAt: approved ? "2026-05-08T00:00:00.000Z" : null,
    source: "lucca",
  };
}

/**
 * A minimal `complete` run with all six slide drafts populated.
 * Every field that buildFactoryPayload touches is set; everything else is
 * the schema's default-shaped empty state.
 */
function makeCompleteRun(
  overrides: Partial<SlideFactoryRun> = {},
): SlideFactoryRun {
  const now = new Date("2026-05-08T00:00:00.000Z");
  const base: SlideFactoryRun = {
    id: 5,
    userId: 1,
    status: "complete",
    briefR2Key: "factory-runs/5/brief.pdf",
    briefFilename: "brief.pdf",
    briefAccepted: true,
    canonicalSpec: { someStructuralData: true },
    canonicalPngKeys: [],
    slide1PropertyId: 11,
    slide2PropertyId: 12,
    slide3PropertyId: 13,
    slide5PropertyId: 15,
    luccaDraft: {
      "slide1.headerSubtitle": makeDraft("A Catskills Hideaway"),
      "slide1.visionBullets": makeDraft(
        "• Reposition existing inventory\n• Capture upper-tier rate\n• Activate F&B revenue",
      ),
      "slide2.operationalModelText": makeDraft("Owner-operated boutique hotel"),
      "slide2.revenueBullet": makeDraft("Mid-week corporate / weekend leisure mix"),
      "slide2.programmingBullet": makeDraft("Wellness, F&B, and event programming"),
      "slide3.conceptParagraph": makeDraft("Revive a historic duplex into a luxury micro-hotel."),
      "slide3.marketRationale": makeDraft("Cartagena's Old City sustains premium ADRs."),
      "slide3.reasons": makeDraft(
        JSON.stringify([
          { label: "Location", detail: "Heart of San Diego barrio." },
          { label: "Heritage", detail: "Period-listed structure with character." },
          { label: "Cap rate", detail: "Outsized exit multiple in tight comp set." },
        ]),
      ),
      "slide3.closingLine": makeDraft("A jewel in a constrained-supply market."),
      "slide4.sectionSubtitle": makeDraft("Five active hospitality acquisitions"),
      "slide5.transformationDescription": makeDraft(
        "We modernize while preserving the asset's authentic story.",
      ),
      "slide5.transformationRows": makeDraft(
        JSON.stringify([
          { feature: "Rooms", existing: "12 keys", proposed: "16 keys" },
          { feature: "F&B", existing: "Cafe only", proposed: "All-day restaurant + bar" },
          { feature: "Spa", existing: "None", proposed: "Treatment rooms + sauna" },
          { feature: "Brand", existing: "Independent", proposed: "Boutique soft brand" },
        ]),
      ),
      "slide6.disclaimer": makeDraft("Projections are illustrative; not investment advice."),
    },
    agentResults: {
      slide1: {
        status: "approved",
        pixelDiffPct: 0.5,
        mayaVerdict: "ok",
        mayaNotes: null,
        approvedAt: "2026-05-08T00:00:00.000Z",
        errorMessage: null,
      },
      slide2: {
        status: "approved",
        pixelDiffPct: 0.4,
        mayaVerdict: "ok",
        mayaNotes: null,
        approvedAt: "2026-05-08T00:00:00.000Z",
        errorMessage: null,
      },
      slide3: {
        status: "approved",
        pixelDiffPct: 0.3,
        mayaVerdict: "ok",
        mayaNotes: null,
        approvedAt: "2026-05-08T00:00:00.000Z",
        errorMessage: null,
      },
      slide4: {
        status: "approved",
        pixelDiffPct: 0.2,
        mayaVerdict: "ok",
        mayaNotes: null,
        approvedAt: "2026-05-08T00:00:00.000Z",
        errorMessage: null,
      },
      slide5: {
        status: "approved",
        pixelDiffPct: 0.6,
        mayaVerdict: "ok",
        mayaNotes: null,
        approvedAt: "2026-05-08T00:00:00.000Z",
        errorMessage: null,
      },
      slide6: {
        status: "approved",
        pixelDiffPct: 0.1,
        mayaVerdict: "ok",
        mayaNotes: null,
        approvedAt: "2026-05-08T00:00:00.000Z",
        errorMessage: null,
      },
    },
    deckR2Key: null,
    startedAt: now,
    completedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  return { ...base, ...overrides };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("buildFactoryPayload — happy path", () => {
  it("produces a 6-slot DeckPayloadV2 with all slot text fields populated", () => {
    const run = makeCompleteRun();
    const payload = buildFactoryPayload(run);

    expect(payload.schemaVersion).toBe(DECK_PAYLOAD_SCHEMA_VERSION);

    // Slide 1
    expect(payload.slide1?.headerSubtitle?.text).toBe("A Catskills Hideaway");
    expect(payload.slide1?.headerSubtitle?.provenance.source).toBe("llm");
    expect(payload.slide1?.visionBullets).toHaveLength(SLIDE1_VISION_BULLETS_COUNT);
    expect(payload.slide1?.visionBullets?.[0]?.text).toBe("Reposition existing inventory");

    // Slide 2
    expect(payload.slide2?.operationalModelText?.text).toBe("Owner-operated boutique hotel");
    expect(payload.slide2?.revenueBullet?.text).toBe("Mid-week corporate / weekend leisure mix");
    expect(payload.slide2?.programmingBullet?.text).toBe("Wellness, F&B, and event programming");

    // Slide 3
    expect(payload.slide3?.conceptParagraph?.text).toBe(
      "Revive a historic duplex into a luxury micro-hotel.",
    );
    expect(payload.slide3?.marketRationale?.text).toBe(
      "Cartagena's Old City sustains premium ADRs.",
    );
    expect(payload.slide3?.reasons).toHaveLength(SLIDE3_REASONS_COUNT);
    expect(payload.slide3?.reasons?.[0]?.label.text).toBe("Location");
    expect(payload.slide3?.reasons?.[0]?.detail.text).toBe("Heart of San Diego barrio.");
    expect(payload.slide3?.closingLine?.text).toBe("A jewel in a constrained-supply market.");

    // Slide 4
    expect(payload.slide4?.sectionSubtitle?.text).toBe("Five active hospitality acquisitions");

    // Slide 5
    expect(payload.slide5?.transformationDescription?.text).toBe(
      "We modernize while preserving the asset's authentic story.",
    );
    expect(payload.slide5?.transformationRows).toHaveLength(SLIDE5_TRANSFORMATION_ROWS_COUNT);
    expect(payload.slide5?.transformationRows?.[0]?.feature.text).toBe("Rooms");
    expect(payload.slide5?.transformationRows?.[0]?.proposed.text).toBe("16 keys");

    // Slide 6
    expect(payload.slide6?.disclaimer?.text).toBe(
      "Projections are illustrative; not investment advice.",
    );
  });

  it("output validates against deckPayloadV2Schema (integration check)", () => {
    const run = makeCompleteRun();
    const payload = buildFactoryPayload(run);
    const result = deckPayloadV2Schema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("stamps provenance.source from each draft (lucca → llm, admin → user)", () => {
    const run = makeCompleteRun({
      luccaDraft: {
        "slide1.headerSubtitle": {
          value: "Admin-edited tagline",
          approved: true,
          approvedAt: "2026-05-08T00:00:00.000Z",
          source: "admin",
        },
      },
    });
    const payload = buildFactoryPayload(run);
    expect(payload.slide1?.headerSubtitle?.provenance.source).toBe("user");
  });

  it("clamps text fields to the slot's character budget", () => {
    const longText = "x".repeat(SLIDE1_HEADER_SUBTITLE_MAX + 100);
    const run = makeCompleteRun({
      luccaDraft: {
        "slide1.headerSubtitle": makeDraft(longText),
      },
    });
    const payload = buildFactoryPayload(run);
    expect(payload.slide1?.headerSubtitle?.text.length).toBe(SLIDE1_HEADER_SUBTITLE_MAX);
  });
});

describe("buildFactoryPayload — slot-omission edge cases", () => {
  it("omits slots whose draft is missing", () => {
    const run = makeCompleteRun({
      luccaDraft: {
        // only slide 1 header is drafted
        "slide1.headerSubtitle": makeDraft("Just a header"),
      },
    });
    const payload = buildFactoryPayload(run);
    expect(payload.slide1?.headerSubtitle?.text).toBe("Just a header");
    expect(payload.slide1?.visionBullets).toBeUndefined();
    expect(payload.slide2?.operationalModelText).toBeUndefined();
    expect(payload.slide2?.revenueBullet).toBeUndefined();
    expect(payload.slide3?.conceptParagraph).toBeUndefined();
    expect(payload.slide3?.reasons).toBeUndefined();
    expect(payload.slide4?.sectionSubtitle).toBeUndefined();
    expect(payload.slide5?.transformationDescription).toBeUndefined();
    expect(payload.slide5?.transformationRows).toBeUndefined();
    expect(payload.slide6?.disclaimer).toBeUndefined();
  });

  it("returns the empty default-shaped payload when luccaDraft is null", () => {
    const run = makeCompleteRun({ luccaDraft: null });
    const payload = buildFactoryPayload(run);
    expect(payload.schemaVersion).toBe(DECK_PAYLOAD_SCHEMA_VERSION);
    expect(payload.slide1).toEqual({});
    expect(payload.slide2).toEqual({});
    expect(payload.slide3).toEqual({});
    expect(payload.slide4).toEqual({});
    expect(payload.slide5).toEqual({});
    expect(payload.slide6).toEqual({});
    // schema validates the empty shape too
    expect(deckPayloadV2Schema.safeParse(payload).success).toBe(true);
  });

  it("omits visionBullets when the bullet serialization is empty", () => {
    const run = makeCompleteRun({
      luccaDraft: { "slide1.visionBullets": makeDraft("") },
    });
    const payload = buildFactoryPayload(run);
    expect(payload.slide1?.visionBullets).toBeUndefined();
  });

  it("omits reasons when JSON is malformed", () => {
    const run = makeCompleteRun({
      luccaDraft: { "slide3.reasons": makeDraft("{not valid json") },
    });
    const payload = buildFactoryPayload(run);
    expect(payload.slide3?.reasons).toBeUndefined();
  });

  it("omits transformationRows when JSON is malformed", () => {
    const run = makeCompleteRun({
      luccaDraft: { "slide5.transformationRows": makeDraft("not an array") },
    });
    const payload = buildFactoryPayload(run);
    expect(payload.slide5?.transformationRows).toBeUndefined();
  });

  it("clamps visionBullets to the count cap", () => {
    const tooMany = Array.from({ length: SLIDE1_VISION_BULLETS_COUNT + 2 }, (_, i) => `• Bullet ${i + 1}`).join("\n");
    const run = makeCompleteRun({
      luccaDraft: { "slide1.visionBullets": makeDraft(tooMany) },
    });
    const payload = buildFactoryPayload(run);
    expect(payload.slide1?.visionBullets).toHaveLength(SLIDE1_VISION_BULLETS_COUNT);
  });

  it("clamps long bullet text to the per-bullet budget", () => {
    const longBullet = "y".repeat(SLIDE1_VISION_BULLET_MAX + 50);
    const raw = `• ${longBullet}\n• short\n• short`;
    const run = makeCompleteRun({
      luccaDraft: { "slide1.visionBullets": makeDraft(raw) },
    });
    const payload = buildFactoryPayload(run);
    expect(payload.slide1?.visionBullets?.[0]?.text.length).toBe(SLIDE1_VISION_BULLET_MAX);
  });
});

describe("buildFactoryPayload — non-slot-copy fields cannot alter output", () => {
  // DeckPayloadV2 is slot-copy-only. Property assignments and agentResults
  // live on SlideFactoryRun but are not part of the output schema. The U4
  // route layer is what stitches property data + financials onto slot copy
  // when serving the internal-deck payload — buildFactoryPayload itself
  // cares only about luccaDraft. These tests pin that contract so a future
  // caller doesn't assume "run is missing slide<N>PropertyId → output
  // changes." It does not.

  it("ignores missing slide<N>PropertyId — output mirrors a fully-assigned run", () => {
    const fullyAssigned = makeCompleteRun();
    const missingProps = makeCompleteRun({
      slide1PropertyId: null,
      slide2PropertyId: null,
      slide3PropertyId: null,
      slide5PropertyId: null,
    });
    expect(buildFactoryPayload(missingProps)).toEqual(buildFactoryPayload(fullyAssigned));
  });

  it("ignores agentResults — output is identical when results are missing or partial", () => {
    // Theoretically `complete` should never have <6 results (Marco's gate
    // rejects), but pinning the behavior here documents that slot copy is
    // not influenced by the agent-result map either way.
    const full = makeCompleteRun();
    const partial = makeCompleteRun({ agentResults: { slide1: full.agentResults!.slide1 } });
    const empty = makeCompleteRun({ agentResults: null });
    const baseline = buildFactoryPayload(full);
    expect(buildFactoryPayload(partial)).toEqual(baseline);
    expect(buildFactoryPayload(empty)).toEqual(baseline);
  });

  it("ignores brief metadata — output is identical regardless of briefR2Key/filename", () => {
    const baseline = buildFactoryPayload(makeCompleteRun());
    const altered = buildFactoryPayload(
      makeCompleteRun({ briefR2Key: null, briefFilename: null, briefAccepted: false }),
    );
    expect(altered).toEqual(baseline);
  });
});
