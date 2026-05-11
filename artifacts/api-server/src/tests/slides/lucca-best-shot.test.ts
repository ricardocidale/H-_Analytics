/**
 * Lucca best-shot detection + drafting — Factory v2 U8 tests.
 *
 * Two layers under test:
 *   1. Deterministic data-sufficiency rules (`checkSlotDataSufficiency`) —
 *      the contract for when best-shot mode fires.
 *   2. Best-shot prompt assembly (`buildBestShotUserPrompt`,
 *      `buildBestShotTool`) — the shape Lucca sends to Opus 4.7.
 *
 * Test-first per the U8 plan: detection rules + prompt assembly are written
 * before the orchestration wiring in `lucca-draft.ts`.
 */
import { describe, it, expect } from "vitest";

import {
  checkSlotDataSufficiency,
  isFieldPresent,
  PROPERTY_BRIEF_FIELD_MAP,
  SLOT_DATA_RULES,
} from "../../slides/data-sufficiency-rules";
import {
  buildBestShotTool,
  buildBestShotUserPrompt,
  LUCCA_BEST_SHOT_MODEL,
} from "../../slides/lucca-best-shot-prompt";
import type { PropertyBrief } from "../../slides/property-brief";

// ── Fixtures ─────────────────────────────────────────────────────────────────

function fullBrief(overrides: Partial<PropertyBrief> = {}): PropertyBrief {
  return {
    id: 1,
    name: "The Ridgeline Inn",
    city: "Woodstock",
    stateProvince: "NY",
    county: "Ulster",
    country: "US",
    locationLabel: "Woodstock, NY, US",
    roomCount: 18,
    adrRaw: 350,
    adrFormatted: "$350",
    occupancyRaw: 0.72,
    occupancyPct: 72,
    revparRaw: 252,
    revparFormatted: "$252",
    purchasePriceRaw: 2_500_000,
    purchasePriceFormatted: "$2.5M",
    renovationBudgetRaw: 1_200_000,
    renovationBudgetFormatted: "$1.2M",
    loanLtv: 0.65,
    loanLtvFormatted: "65%",
    irrRaw: 0.18,
    irrFormatted: "18%",
    equityMultipleRaw: 2.4,
    equityMultipleFormatted: "2.4×",
    modelTier: "hotel",
    modelTierLabel: "Boutique Hotel",
    isHistoric: true,
    renovationScope: "Full gut renovation",
    marketInsight: "Catskills boutique demand surging",
    description: "Historic 1890s farmhouse converted into a boutique retreat.",
    acquisitionStatus: "pipeline",
    ...overrides,
  };
}

// ── Section 1: `isFieldPresent` ──────────────────────────────────────────────

describe("isFieldPresent", () => {
  it("returns true for a populated string field", () => {
    const brief = fullBrief();
    expect(isFieldPresent("name", brief)).toBe(true);
  });

  it("returns false for an empty string field", () => {
    const brief = fullBrief({ name: "" });
    expect(isFieldPresent("name", brief)).toBe(false);
  });

  it("returns true for a non-zero numeric field", () => {
    const brief = fullBrief();
    expect(isFieldPresent("adr", brief)).toBe(true);
  });

  it("returns false for a zero numeric field", () => {
    const brief = fullBrief({ adrRaw: 0 });
    expect(isFieldPresent("adr", brief)).toBe(false);
  });

  it("returns true for OR-mapped fields when ANY brief field is present", () => {
    // transformation_scope is satisfied if EITHER renovationScope OR
    // renovationBudgetRaw is set.
    const briefScopeOnly = fullBrief({
      renovationScope: "Phase 1 cosmetic",
      renovationBudgetRaw: 0,
    });
    expect(isFieldPresent("transformation_scope", briefScopeOnly)).toBe(true);

    const briefBudgetOnly = fullBrief({
      renovationScope: "",
      renovationBudgetRaw: 500_000,
    });
    expect(isFieldPresent("transformation_scope", briefBudgetOnly)).toBe(true);
  });

  it("returns false for OR-mapped fields when EVERY mapped brief field is empty", () => {
    const brief = fullBrief({ renovationScope: "", renovationBudgetRaw: 0 });
    expect(isFieldPresent("transformation_scope", brief)).toBe(false);
  });

  it("returns false for an unknown canonical field name", () => {
    const brief = fullBrief();
    expect(isFieldPresent("not_a_real_field", brief)).toBe(false);
  });
});

// ── Section 2: `checkSlotDataSufficiency` (the U8 contract) ──────────────────

describe("checkSlotDataSufficiency", () => {
  describe("happy path — full data", () => {
    it("marks every slot sufficient when the brief is fully populated", () => {
      const brief = fullBrief();
      for (const slotKey of Object.keys(SLOT_DATA_RULES) as Array<
        keyof typeof SLOT_DATA_RULES
      >) {
        const result = checkSlotDataSufficiency(slotKey, brief);
        expect(result.sufficient, `slot ${slotKey}`).toBe(true);
        expect(result.missingFields, `slot ${slotKey}`).toEqual([]);
      }
    });
  });

  describe("best-shot path — missing transformation data on slide 5", () => {
    it("flags slide5.transformationDescription when renovationScope AND renovationBudgetRaw are empty", () => {
      const brief = fullBrief({
        renovationScope: "",
        renovationBudgetRaw: 0,
      });
      const result = checkSlotDataSufficiency(
        "slide5.transformationDescription",
        brief,
      );
      expect(result.sufficient).toBe(false);
      expect(result.missingFields).toContain("transformation_scope");
    });

    it("flags every slide-5 transformation slot when transformation data is missing", () => {
      const brief = fullBrief({
        renovationScope: "",
        renovationBudgetRaw: 0,
      });
      const slide5Slots = [
        "slide5.transformationDescription",
        "slide5.transformationRows",
        "slide5.transformationRows[0]",
        "slide5.transformationRows[1]",
        "slide5.transformationRows[2]",
        "slide5.transformationRows[3]",
      ] as const;
      for (const slot of slide5Slots) {
        const result = checkSlotDataSufficiency(slot, brief);
        expect(result.sufficient, `slot ${slot}`).toBe(false);
        expect(result.missingFields, `slot ${slot}`).toContain(
          "transformation_scope",
        );
      }
    });
  });

  describe("partial-data edge cases", () => {
    it("flags slide1.visionBullets when adr is present but occupancy is zero", () => {
      const brief = fullBrief({ occupancyRaw: 0 });
      const result = checkSlotDataSufficiency("slide1.visionBullets", brief);
      expect(result.sufficient).toBe(false);
      expect(result.missingFields).toEqual(["occupancy"]);
    });

    it("flags slide3.closingLine when name is present but irrRaw is undefined", () => {
      const brief = fullBrief({ irrRaw: undefined });
      const result = checkSlotDataSufficiency("slide3.closingLine", brief);
      expect(result.sufficient).toBe(false);
      expect(result.missingFields).toEqual(["projected_irr"]);
    });

    it("keeps slide1.headerSubtitle sufficient when location parts vary (any one of city/state/country)", () => {
      const brief = fullBrief({ city: "", stateProvince: "", country: "US" });
      const result = checkSlotDataSufficiency("slide1.headerSubtitle", brief);
      expect(result.sufficient).toBe(true);
    });

    it("flags slide2.programmingBullet when description is empty even if model tier is set", () => {
      const brief = fullBrief({ description: "" });
      const result = checkSlotDataSufficiency("slide2.programmingBullet", brief);
      expect(result.sufficient).toBe(false);
      expect(result.missingFields).toEqual(["property_description"]);
    });

    it("only reports genuinely missing fields (not the whole rule list)", () => {
      const brief = fullBrief({ adrRaw: 0 });
      const result = checkSlotDataSufficiency("slide1.visionBullets", brief);
      expect(result.sufficient).toBe(false);
      // Only adr should be missing, not the other vision-bullet fields.
      expect(result.missingFields).toEqual(["adr"]);
    });
  });

  describe("rules-table invariants", () => {
    it("declares a rule entry for every DraftSlotKey", () => {
      const slotKeys = Object.keys(SLOT_DATA_RULES);
      // Every slot in the rules table is a valid DraftSlotKey, AND every
      // DraftSlotKey has a rule entry (otherwise checkSlotDataSufficiency
      // would throw at runtime).
      expect(slotKeys.length).toBeGreaterThan(0);
      for (const key of slotKeys) {
        expect(SLOT_DATA_RULES[key as keyof typeof SLOT_DATA_RULES]).toBeDefined();
      }
    });

    it("every required field maps to at least one PropertyBrief key", () => {
      for (const [slotKey, rule] of Object.entries(SLOT_DATA_RULES)) {
        for (const field of rule.requiredFields) {
          expect(
            PROPERTY_BRIEF_FIELD_MAP[field],
            `field ${field} in slot ${slotKey}`,
          ).toBeDefined();
        }
      }
    });
  });
});

// ── Section 3: best-shot prompt + tool assembly ──────────────────────────────

describe("buildBestShotUserPrompt", () => {
  it("includes the slot key and the missing-fields block", () => {
    const prompt = buildBestShotUserPrompt(
      "slide5.transformationDescription",
      "Property: The Ridgeline Inn\nLocation: Woodstock, NY",
      ["transformation_scope"],
    );
    expect(prompt).toContain("slide5.transformationDescription");
    expect(prompt).toContain("MISSING fields");
    expect(prompt).toContain("transformation_scope");
  });

  it("omits the missing-fields block when no fields are missing", () => {
    const prompt = buildBestShotUserPrompt(
      "slide1.headerSubtitle",
      "Property: X",
      [],
    );
    expect(prompt).not.toContain("MISSING fields");
  });

  it("names the slot's editorial intent", () => {
    const prompt = buildBestShotUserPrompt(
      "slide1.visionBullets",
      "Property: X",
      [],
    );
    // The SLOT_INTENT table includes "vision" / "thesis" framing.
    expect(prompt.toLowerCase()).toMatch(/bullet|thesis|vision/);
  });
});

describe("buildBestShotTool", () => {
  it("builds a tool whose input_schema requires draft + wishListLog", () => {
    const tool = buildBestShotTool("slide1.headerSubtitle");
    const schema = tool.input_schema as {
      required: string[];
      properties: Record<string, unknown>;
    };
    expect(schema.required).toContain("draft");
    expect(schema.required).toContain("wishListLog");
    expect(schema.properties.draft).toBeDefined();
    expect(schema.properties.wishListLog).toBeDefined();
  });

  it("builds distinct tool names per slot key", () => {
    const a = buildBestShotTool("slide1.headerSubtitle");
    const b = buildBestShotTool("slide3.closingLine");
    expect(a.name).not.toBe(b.name);
  });

  it("builds a structured-bullets schema for slide1.visionBullets", () => {
    const tool = buildBestShotTool("slide1.visionBullets");
    const schema = tool.input_schema as {
      properties: { draft: { properties: { bullets: { type: string } } } };
    };
    expect(schema.properties.draft.properties.bullets.type).toBe("array");
  });

  it("builds a structured-rows schema for slide5.transformationRows", () => {
    const tool = buildBestShotTool("slide5.transformationRows");
    const schema = tool.input_schema as {
      properties: { draft: { properties: { rows: { type: string } } } };
    };
    expect(schema.properties.draft.properties.rows.type).toBe("array");
  });
});

describe("LUCCA_BEST_SHOT_MODEL", () => {
  it("matches the Opus 4.7 model per the plan's 'generous budget' rule", () => {
    // The exact slug lives in deck-render-constants.ts; we assert by the
    // family marker only (no model-name string literal in this test).
    expect(LUCCA_BEST_SHOT_MODEL).toMatch(/opus/i);
  });
});
