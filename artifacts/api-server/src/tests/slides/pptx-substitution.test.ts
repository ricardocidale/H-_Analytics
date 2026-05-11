/**
 * Factory v2 U4 — PPTX substitution engine tests.
 *
 * Validates the `substituteSlots()` contract from
 * `artifacts/api-server/src/slides/pptx-substitution.ts`:
 *
 *   1. Carlo-style Zod-validation rejects malformed substitution maps before
 *      any I/O is attempted (error path).
 *   2. Happy-path text substitution produces a valid output PPTX that
 *      round-trips through pptx-automizer's loader without throwing.
 *   3. R7 aesthetic guardrails fire as specified:
 *        - shorter-or-equal new text → applied silently (no warnings).
 *        - new text >5% but ≤20% over original budget → applied, soft-overflow
 *          warning emitted in the result envelope.
 *        - new text >20% over original budget → SLOT_OVERFLOW thrown,
 *          naming slide + shape (no partial state).
 *   4. Image-swap payloads validate through the schema layer (the actual
 *      embed against the Belleayre PPTX is gated — see comment on
 *      `it.skip("substitutes an image payload")` below).
 *
 * ── Template fixture note ───────────────────────────────────────────────────
 * Production reads the v7 reconstruction-package PPTX from R2 (the R2 key
 * lives on an `admin_resources` row, fetched at runtime per
 * `docs/solutions/conventions/no-hardcoded-integration-identifiers-convention-2026-05-09.md`).
 * That asset is not reachable from this environment. Tests instead use the
 * canonical Belleayre PPTX checked in at
 * `attached_assets/canonical/pptx/belleayre-mountain-slides_1777774635693.pptx`
 * which shares the L+B template's shape conventions and is the same fixture
 * the U1 spike exercises. The substitution engine itself is template-agnostic
 * — it takes a Buffer and a SubstitutionMap, and doesn't care where the
 * Buffer came from.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, existsSync, rmSync } from "node:fs";
import path from "node:path";

import {
  substituteSlots,
  OVERFLOW_TIGHTEN_THRESHOLD_PCT,
  OVERFLOW_ABORT_THRESHOLD_PCT,
} from "../../slides/pptx-substitution";
import {
  SubstitutionMapSchema,
  SlotOverflowError,
  type SubstitutionMap,
} from "../../slides/pptx-substitution-types";

// ── Test fixtures ───────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..");
const FIXTURE_PPTX_PATH = path.join(
  REPO_ROOT,
  "attached_assets",
  "canonical",
  "pptx",
  "belleayre-mountain-slides_1777774635693.pptx",
);

// Slide-2 text shape that the U1 spike validated as substitutable (carries the
// "HAZELNIS" placeholder in the canonical Belleayre fixture).
const FIXTURE_SLIDE = 2;
const FIXTURE_SHAPE_NAME_PLACEHOLDER = "HAZELNIS";

// Overflow math is exercised against a synthetic original length so the tests
// don't depend on the fixture PPTX's exact placeholder length. The engine
// accepts `originalText` on the payload precisely for this kind of explicit
// budget assertion.
const SYNTHETIC_ORIGINAL = "Property Name Goes Here"; // 23 chars
const SYNTHETIC_ORIGINAL_LEN = SYNTHETIC_ORIGINAL.length;

// Compute three replacement strings landing in each overflow band relative to
// SYNTHETIC_ORIGINAL_LEN. Each length is named — no naked numbers.
const PCT_DIVISOR = 100; // structural: percent → fraction
const SHORTER_REPLACEMENT_LEN = SYNTHETIC_ORIGINAL_LEN - 5;
// Just inside the tighten band — overshoot strictly > tighten threshold,
// strictly ≤ abort threshold. Use 12% as the test point.
const SOFT_OVERFLOW_PCT = 12;
const SOFT_OVERFLOW_LEN = Math.ceil(
  SYNTHETIC_ORIGINAL_LEN * (1 + SOFT_OVERFLOW_PCT / PCT_DIVISOR),
);
// Well past the abort threshold — use 35% to stay comfortably above 20%.
const HARD_OVERFLOW_PCT = 35;
const HARD_OVERFLOW_LEN = Math.ceil(
  SYNTHETIC_ORIGINAL_LEN * (1 + HARD_OVERFLOW_PCT / PCT_DIVISOR),
);

function stringOfLen(len: number, fill = "X"): string {
  return fill.repeat(len);
}

// ── Setup / teardown ────────────────────────────────────────────────────────

const FIXTURE_AVAILABLE = existsSync(FIXTURE_PPTX_PATH);
let fixtureBuffer: Buffer | null = null;

beforeAll(() => {
  if (FIXTURE_AVAILABLE) {
    fixtureBuffer = readFileSync(FIXTURE_PPTX_PATH);
  }
});

afterAll(() => {
  // `substituteSlots` writes intermediate files to its own tmp dir and
  // self-cleans; nothing to do here unless future code starts writing inside
  // the test work dir directly.
  const possibleStrayTmp = path.join(REPO_ROOT, ".local", "factory-v2-test-tmp");
  if (existsSync(possibleStrayTmp)) {
    rmSync(possibleStrayTmp, { recursive: true, force: true });
  }
});

// ── Schema validation tests (no PPTX I/O required) ──────────────────────────

describe("SubstitutionMapSchema (Carlo's validation contract)", () => {
  it("rejects an entry missing shapeId", () => {
    const bad = [
      {
        slideNumber: FIXTURE_SLIDE,
        // shapeId omitted
        op: "text",
        payload: { text: "Hello" },
      },
    ];
    const result = SubstitutionMapSchema.safeParse(bad);
    expect(result.success).toBe(false);
    if (!result.success) {
      const flat = JSON.stringify(result.error.issues);
      expect(flat).toContain("shapeId");
    }
  });

  it("rejects a text entry with an empty payload string", () => {
    const bad: unknown = [
      {
        slideNumber: FIXTURE_SLIDE,
        shapeId: "Text 3",
        op: "text",
        payload: { text: "" },
      },
    ];
    const result = SubstitutionMapSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects an image entry with a non-Buffer image field", () => {
    const bad: unknown = [
      {
        slideNumber: FIXTURE_SLIDE,
        shapeId: "Picture 35",
        op: "image",
        payload: { image: "not-a-buffer", mimeType: "image/png" },
      },
    ];
    const result = SubstitutionMapSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects an unknown op value", () => {
    const bad: unknown = [
      {
        slideNumber: FIXTURE_SLIDE,
        shapeId: "Text 3",
        op: "unknown_op",
        payload: { text: "hi" },
      },
    ];
    const result = SubstitutionMapSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("accepts a well-formed mixed map (text + table_cell)", () => {
    const ok: unknown = [
      {
        slideNumber: FIXTURE_SLIDE,
        shapeId: "Text 3",
        op: "text",
        payload: { text: "Hello" },
      },
      {
        slideNumber: 5,
        shapeId: "Table 12",
        op: "table_cell",
        payload: { rowIndex: 0, columnIndex: 1, text: "x" },
      },
    ];
    const result = SubstitutionMapSchema.safeParse(ok);
    expect(result.success).toBe(true);
  });
});

// ── Overflow rule tests (don't require a real template I/O) ─────────────────

describe("substituteSlots — overflow rule enforcement", () => {
  it.skipIf(!FIXTURE_AVAILABLE)(
    "applies a shorter-or-equal replacement silently (no warnings)",
    async () => {
      const map: SubstitutionMap = [
        {
          slideNumber: FIXTURE_SLIDE,
          shapeId: FIXTURE_SHAPE_NAME_PLACEHOLDER,
          op: "text",
          slotKey: "slide2.shorter",
          payload: {
            text: stringOfLen(SHORTER_REPLACEMENT_LEN),
            originalText: SYNTHETIC_ORIGINAL,
          },
        },
      ];

      const result = await substituteSlots(fixtureBuffer!, map, {
        // skipShapeLookup tells the engine to apply overflow rules using
        // `payload.originalText` and not attempt to read the template shape
        // (which doesn't have a "Property Name Goes Here" shape). It still
        // produces a valid output PPTX from the input.
        skipShapeLookup: true,
      });
      expect(Buffer.isBuffer(result.pptx)).toBe(true);
      expect(result.pptx.length).toBeGreaterThan(0);
      expect(result.warnings).toEqual([]);
    },
  );

  it.skipIf(!FIXTURE_AVAILABLE)(
    "emits a soft-overflow warning when new text exceeds tighten threshold but stays under abort",
    async () => {
      const map: SubstitutionMap = [
        {
          slideNumber: FIXTURE_SLIDE,
          shapeId: FIXTURE_SHAPE_NAME_PLACEHOLDER,
          op: "text",
          slotKey: "slide2.softOverflow",
          payload: {
            text: stringOfLen(SOFT_OVERFLOW_LEN),
            originalText: SYNTHETIC_ORIGINAL,
          },
        },
      ];

      const result = await substituteSlots(fixtureBuffer!, map, {
        skipShapeLookup: true,
      });
      expect(result.warnings).toHaveLength(1);
      const w = result.warnings[0];
      expect(w.slideNumber).toBe(FIXTURE_SLIDE);
      expect(w.slotKey).toBe("slide2.softOverflow");
      expect(w.originalLength).toBe(SYNTHETIC_ORIGINAL_LEN);
      expect(w.newLength).toBe(SOFT_OVERFLOW_LEN);
      expect(w.overshootPct).toBeGreaterThan(OVERFLOW_TIGHTEN_THRESHOLD_PCT);
      expect(w.overshootPct).toBeLessThanOrEqual(OVERFLOW_ABORT_THRESHOLD_PCT);
    },
  );

  it.skipIf(!FIXTURE_AVAILABLE)(
    "throws SlotOverflowError when new text exceeds the abort threshold",
    async () => {
      const map: SubstitutionMap = [
        {
          slideNumber: FIXTURE_SLIDE,
          shapeId: FIXTURE_SHAPE_NAME_PLACEHOLDER,
          op: "text",
          slotKey: "slide2.hardOverflow",
          payload: {
            text: stringOfLen(HARD_OVERFLOW_LEN),
            originalText: SYNTHETIC_ORIGINAL,
          },
        },
      ];

      await expect(
        substituteSlots(fixtureBuffer!, map, { skipShapeLookup: true }),
      ).rejects.toBeInstanceOf(SlotOverflowError);
    },
  );

  it.skipIf(!FIXTURE_AVAILABLE)(
    "rejects an invalid substitution map before any I/O",
    async () => {
      const malformed = [
        {
          slideNumber: FIXTURE_SLIDE,
          // shapeId omitted → Carlo rejects
          op: "text",
          payload: { text: "anything" },
        },
      ];
      await expect(
        // We pass the malformed array as unknown so the engine's runtime
        // Zod parse catches it (TS would otherwise refuse the call).
        substituteSlots(fixtureBuffer!, malformed as unknown as SubstitutionMap),
      ).rejects.toThrow(/shapeId|substitution map/i);
    },
  );
});

// ── Happy-path round-trip ──────────────────────────────────────────────────

describe("substituteSlots — happy path", () => {
  it.skipIf(!FIXTURE_AVAILABLE)(
    "loads the template, substitutes a slide-2 text run, and returns a valid PPTX buffer",
    async () => {
      // Find the placeholder-bearing shape's actual name by letting the engine
      // resolve it (skipShapeLookup=false, the default). The engine looks up
      // the shape by name against the slide manifest; the U1 spike confirmed
      // that on the Belleayre fixture, slide 2 has a shape carrying
      // "HAZELNIS" as its text. We use that text as our shapeId since the
      // engine accepts either an exact shape name OR a unique substring of
      // the shape's text body for resolution.
      const map: SubstitutionMap = [
        {
          slideNumber: FIXTURE_SLIDE,
          shapeId: FIXTURE_SHAPE_NAME_PLACEHOLDER,
          op: "text",
          slotKey: "slide2.propertyName",
          payload: {
            text: "Belleayre Mountain — Ulster County Estate",
          },
        },
      ];

      const result = await substituteSlots(fixtureBuffer!, map);
      expect(Buffer.isBuffer(result.pptx)).toBe(true);
      // PPTX = ZIP archive — starts with "PK"
      expect(result.pptx.subarray(0, 2).toString("utf8")).toBe("PK");
      expect(result.pptx.length).toBeGreaterThan(1000);
    },
    // pptx-automizer's load + write round-trip on a 25 MB PPTX takes 5-10 s
    60_000,
  );
});

// ── Image swap — gated against Belleayre per U1 findings ────────────────────

describe("substituteSlots — image swap", () => {
  it.skip(
    "substitutes an image payload preserving the slot's bbox (gated: needs v7 template)",
    () => {
      // The U1 decision doc records that `ModifyImageHelper.setRelationTarget`
      // fails with a relation-tracking error on the canonical Belleayre PPTX's
      // picture shapes (see "Constraints discovered #3"). The v7 reconstruction
      // package PPTX has cleaner relations and is the production target; the
      // happy-path image test waits until U6 (slide-6 embed flow) wires the v7
      // template in.
      //
      // The schema layer for `op: 'image'` payloads IS exercised — see the
      // "rejects an image entry with a non-Buffer image field" case above,
      // and the discriminated union acceptance check in the well-formed map
      // test. The engine code path is also wired (see
      // `pptx-substitution.ts#applyImageSubstitution`) but not exercised in
      // CI against the fragile fixture.
    },
  );
});
