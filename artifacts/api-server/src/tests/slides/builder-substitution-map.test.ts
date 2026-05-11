/**
 * Builder substitution-map translation — Factory v2 U8.
 *
 * Tests the per-slide translators in `builder-substitution-entries.ts`.
 * Each Builder's `Slide{N}Payload` is converted into a list of
 * `SubstitutionEntry` items addressing the canonical shape ids; the
 * resulting list passes Carlo's substitution-map validator and is in the
 * shape `substituteSlots` expects.
 *
 * The integration assertion the U8 plan calls out:
 *
 *   - "Marco assembles all 6 Builders' outputs into one valid substitution
 *      map; Carlo validates."
 *
 * Marco's actual orchestration test lives in `tests/slides/u8-marco-substitution.test.ts`;
 * here we exercise the pure translators + a portfolio-level assembly that
 * does the same join Marco's `apply_substitutions` tool will do.
 */
import { describe, it, expect } from "vitest";

import {
  buildSlide1SubstitutionEntries,
  buildSlide2SubstitutionEntries,
  buildSlide3SubstitutionEntries,
  buildSlide4SubstitutionEntries,
  buildSlide5SubstitutionEntries,
  buildSlide6SubstitutionEntries,
  DEFAULT_SHAPE_NAMES,
} from "../../slides/builder-substitution-entries";
import {
  runCarloSubstitutionMap,
} from "../../slides/minions/carlo";
import { SubstitutionMapSchema } from "../../slides/pptx-substitution-types";
import type {
  Slide1Payload,
  Slide2Payload,
  Slide3Payload,
  Slide4Payload,
  Slide5Payload,
  Slide6Payload,
} from "@shared/deck-payload-v2";

// ── Provenance fixture — every payload field carries one ────────────────────

const PROVENANCE = {
  source: "llm" as const,
  updatedAt: new Date(0).toISOString(),
};

// ── Per-slide payload fixtures ──────────────────────────────────────────────

const slide1Full: Slide1Payload = {
  headerSubtitle: { text: "Boutique escape in the Catskills", provenance: PROVENANCE },
  visionBullets: [
    { text: "Vision bullet 1", provenance: PROVENANCE },
    { text: "Vision bullet 2", provenance: PROVENANCE },
    { text: "Vision bullet 3", provenance: PROVENANCE },
  ],
};

const slide2Full: Slide2Payload = {
  operationalModelText: { text: "Owner-operated", provenance: PROVENANCE },
  revenueBullet: { text: "ADR $350", provenance: PROVENANCE },
  programmingBullet: { text: "Wellness retreats", provenance: PROVENANCE },
};

const slide3Full: Slide3Payload = {
  conceptParagraph: { text: "Rare repositioning", provenance: PROVENANCE },
  marketRationale: { text: "4.2M visitors", provenance: PROVENANCE },
  reasons: [
    {
      label: { text: "Label A", provenance: PROVENANCE },
      detail: { text: "Detail A", provenance: PROVENANCE },
    },
    {
      label: { text: "Label B", provenance: PROVENANCE },
      detail: { text: "Detail B", provenance: PROVENANCE },
    },
    {
      label: { text: "Label C", provenance: PROVENANCE },
      detail: { text: "Detail C", provenance: PROVENANCE },
    },
  ],
  closingLine: { text: "Closing", provenance: PROVENANCE },
};

const slide4Full: Slide4Payload = {
  sectionSubtitle: { text: "H+ Portfolio Overview", provenance: PROVENANCE },
};

const slide5Full: Slide5Payload = {
  transformationDescription: {
    text: "Full renovation preserving historic character",
    provenance: PROVENANCE,
  },
  transformationRows: [
    {
      feature: { text: "Feature 1", provenance: PROVENANCE },
      existing: { text: "Existing 1", provenance: PROVENANCE },
      proposed: { text: "Proposed 1", provenance: PROVENANCE },
    },
    {
      feature: { text: "Feature 2", provenance: PROVENANCE },
      existing: { text: "Existing 2", provenance: PROVENANCE },
      proposed: { text: "Proposed 2", provenance: PROVENANCE },
    },
    {
      feature: { text: "Feature 3", provenance: PROVENANCE },
      existing: { text: "Existing 3", provenance: PROVENANCE },
      proposed: { text: "Proposed 3", provenance: PROVENANCE },
    },
    {
      feature: { text: "Feature 4", provenance: PROVENANCE },
      existing: { text: "Existing 4", provenance: PROVENANCE },
      proposed: { text: "Proposed 4", provenance: PROVENANCE },
    },
  ],
};

const slide6Full: Slide6Payload = {
  disclaimer: { text: "Projections are estimates", provenance: PROVENANCE },
};

// ── Per-slide translator tests ──────────────────────────────────────────────

describe("buildSlide1SubstitutionEntries", () => {
  it("emits text ops for headerSubtitle + a single text op for visionBullets joined by newlines", () => {
    const entries = buildSlide1SubstitutionEntries(slide1Full);
    expect(entries).toHaveLength(2);
    const subtitle = entries.find((e) => e.slotKey === "slide1.headerSubtitle");
    expect(subtitle?.op).toBe("text");
    expect(subtitle?.shapeId).toBe(DEFAULT_SHAPE_NAMES.slide1HeaderSubtitle);
    const bullets = entries.find((e) => e.slotKey === "slide1.visionBullets");
    expect(bullets?.op).toBe("text");
    const bulletsPayload = bullets?.payload as { text: string };
    expect(bulletsPayload.text.split("\n")).toHaveLength(3);
  });

  it("omits entries for missing fields", () => {
    const entries = buildSlide1SubstitutionEntries({});
    expect(entries).toEqual([]);
  });
});

describe("buildSlide2SubstitutionEntries", () => {
  it("emits one text op per slot", () => {
    const entries = buildSlide2SubstitutionEntries(slide2Full);
    expect(entries).toHaveLength(3);
    for (const entry of entries) {
      expect(entry.op).toBe("text");
    }
  });
});

describe("buildSlide3SubstitutionEntries", () => {
  it("emits text ops for concept/rationale/closing AND table_cell ops for reasons", () => {
    const entries = buildSlide3SubstitutionEntries(slide3Full);
    const textOps = entries.filter((e) => e.op === "text");
    const tableOps = entries.filter((e) => e.op === "table_cell");
    expect(textOps).toHaveLength(3); // concept, rationale, closing
    expect(tableOps).toHaveLength(6); // 3 reasons × 2 cells (label + detail)
    // Every table_cell op uses the same shape id (the reasons table shape).
    const tableShapes = new Set(tableOps.map((e) => e.shapeId));
    expect(tableShapes.size).toBe(1);
  });

  it("addresses reasons by zero-based rowIndex + canonical columnIndex (0=label, 1=detail)", () => {
    const entries = buildSlide3SubstitutionEntries(slide3Full);
    const labelRow0 = entries.find(
      (e) => e.slotKey === "slide3.reasons.row0.label",
    );
    expect(labelRow0?.op).toBe("table_cell");
    const labelPayload = labelRow0?.payload as { rowIndex: number; columnIndex: number; text: string };
    expect(labelPayload.rowIndex).toBe(0);
    expect(labelPayload.columnIndex).toBe(0);
    expect(labelPayload.text).toBe("Label A");

    const detailRow2 = entries.find(
      (e) => e.slotKey === "slide3.reasons.row2.detail",
    );
    const detailPayload = detailRow2?.payload as { rowIndex: number; columnIndex: number; text: string };
    expect(detailPayload.rowIndex).toBe(2);
    expect(detailPayload.columnIndex).toBe(1);
  });
});

describe("buildSlide4SubstitutionEntries", () => {
  it("emits the section subtitle when present", () => {
    const entries = buildSlide4SubstitutionEntries(slide4Full);
    expect(entries).toHaveLength(1);
    expect(entries[0].op).toBe("text");
    expect(entries[0].slotKey).toBe("slide4.sectionSubtitle");
  });

  it("emits nothing when the section subtitle is absent (deterministic-only slide)", () => {
    const entries = buildSlide4SubstitutionEntries({});
    expect(entries).toEqual([]);
  });
});

describe("buildSlide5SubstitutionEntries", () => {
  it("emits a text op for description AND 3-column table_cell ops per row", () => {
    const entries = buildSlide5SubstitutionEntries(slide5Full);
    const textOps = entries.filter((e) => e.op === "text");
    const tableOps = entries.filter((e) => e.op === "table_cell");
    expect(textOps).toHaveLength(1);
    expect(tableOps).toHaveLength(12); // 4 rows × 3 columns
  });

  it("emits canonical column indices (0=feature, 1=existing, 2=proposed)", () => {
    const entries = buildSlide5SubstitutionEntries(slide5Full);
    const feature = entries.find(
      (e) => e.slotKey === "slide5.transformationRows.row0.feature",
    );
    const existing = entries.find(
      (e) => e.slotKey === "slide5.transformationRows.row0.existing",
    );
    const proposed = entries.find(
      (e) => e.slotKey === "slide5.transformationRows.row0.proposed",
    );
    const featurePayload = feature?.payload as { columnIndex: number };
    const existingPayload = existing?.payload as { columnIndex: number };
    const proposedPayload = proposed?.payload as { columnIndex: number };
    expect(featurePayload.columnIndex).toBe(0);
    expect(existingPayload.columnIndex).toBe(1);
    expect(proposedPayload.columnIndex).toBe(2);
  });
});

describe("buildSlide6SubstitutionEntries", () => {
  it("emits a single text op for the disclaimer when present", () => {
    const entries = buildSlide6SubstitutionEntries(slide6Full);
    expect(entries).toHaveLength(1);
    expect(entries[0].slotKey).toBe("slide6.disclaimer");
  });

  it("emits nothing when the disclaimer is absent (the income-statement image is composed separately by U6)", () => {
    const entries = buildSlide6SubstitutionEntries({});
    expect(entries).toEqual([]);
  });
});

// ── Integration: assemble the full map, validate via Carlo + the schema ─────

describe("Marco-style assembly: all 6 Builders → one Carlo-valid SubstitutionMap", () => {
  it("concatenates every Builder's entries into a map that Carlo accepts", () => {
    const map = [
      ...buildSlide1SubstitutionEntries(slide1Full),
      ...buildSlide2SubstitutionEntries(slide2Full),
      ...buildSlide3SubstitutionEntries(slide3Full),
      ...buildSlide4SubstitutionEntries(slide4Full),
      ...buildSlide5SubstitutionEntries(slide5Full),
      ...buildSlide6SubstitutionEntries(slide6Full),
    ];

    // The map is non-empty and addresses every slide.
    expect(map.length).toBeGreaterThan(0);
    const slidesAddressed = new Set(map.map((e) => e.slideNumber));
    expect(slidesAddressed.has(1)).toBe(true);
    expect(slidesAddressed.has(2)).toBe(true);
    expect(slidesAddressed.has(3)).toBe(true);
    expect(slidesAddressed.has(4)).toBe(true);
    expect(slidesAddressed.has(5)).toBe(true);
    expect(slidesAddressed.has(6)).toBe(true);

    // Carlo validates.
    const carlo = runCarloSubstitutionMap(map);
    expect(carlo.valid).toBe(true);
    expect(carlo.blockingErrors).toEqual([]);

    // And the schema parse succeeds (same gate `substituteSlots` runs at I/O).
    const parsed = SubstitutionMapSchema.safeParse(map);
    expect(parsed.success).toBe(true);
  });

  it("Carlo rejects a malformed entry (e.g., text op with non-string payload)", () => {
    const map = [
      ...buildSlide1SubstitutionEntries(slide1Full),
      // Synthetic malformed entry — Zod discriminated union should reject.
      {
        slideNumber: 1,
        shapeId: "BadShape",
        op: "text" as const,
        payload: { text: null },
      },
    ];
    const carlo = runCarloSubstitutionMap(map);
    expect(carlo.valid).toBe(false);
    expect(carlo.blockingErrors.length).toBeGreaterThan(0);
  });

  it("Carlo rejects an entry with a missing shapeId", () => {
    const map = [{ slideNumber: 1, op: "text", payload: { text: "x" } }];
    const carlo = runCarloSubstitutionMap(map);
    expect(carlo.valid).toBe(false);
  });
});
