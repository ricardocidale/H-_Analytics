/**
 * G5 tests for ICP Intelligence specialist (Cecília / mgmt-co.icp-intelligence).
 *
 * Coverage:
 *   G5-shape: output structure and section completeness
 *   - config object has expected numeric fields (rooms, adr, occupancy, etc.)
 *   - descriptive object has all 10 qualitative sections as non-empty strings
 *   - portfolioAnalysis reflects the input property count
 *   - generatedAt is a valid ISO string
 *   - source is "portfolio+ai" when LLM callback succeeds
 *
 *   G5-fallback: portfolio-only path
 *   - source is "portfolio" when no llmCallback provided
 *   - descriptive sections are non-empty even with no LLM
 *   - LLM callback throwing produces valid portfolio-only fallback
 *   - LLM callback returning malformed JSON falls back gracefully
 *
 *   G5-model: model-tier assertion
 *   - ICP_LLM_MODEL constant is the Opus tier
 */

import { describe, expect, it } from "vitest";
import { generateIcp } from "../../../server/ai/icp-intelligence";
import { ICP_LLM_MODEL } from "../../../server/routes/icp-intelligence";
import type { Property } from "@shared/schema";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const STUB_PROPERTY: Property = {
  id: 7,
  userId: null,
  name: "Casa da Serra",
  country: "Brazil",
  city: "Campos do Jordão",
  stateProvince: "SP",
  market: "São Paulo Metro",
  hospitalityType: "boutique",
  qualityTier: "upscale",
  businessModel: "hotel",
  pricingModel: "per_room",
  roomCount: 18,
  startAdr: 220,
  maxOccupancy: 0.70,
  acquisitionPrice: 3_500_000,
  acquisitionLTV: 0.55,
  acquisitionInterestRate: 0.07,
  acquisitionTermYears: 10,
  renovationCost: 600_000,
  operationsStartDate: "2027-03-01",
  acquisitionDate: "2026-09-01",
  projectionYears: 10,
  exitCapRate: 0.075,
  revShareFB: 0.12,
  revShareEvents: 0.04,
  revShareOther: 0.02,
  nightlyPropertyRate: null,
  isActive: true,
} as unknown as Property;

/** A valid JSON response from the LLM callback */
const MOCK_LLM_JSON = JSON.stringify({
  propertyTypes: "Upscale boutique hotel in mountain setting.",
  fbLevel: "Full-service farm-to-table restaurant with local sourcing.",
  locationCharacteristics: "Mountain retreat with panoramic views and privacy.",
  locationDetails: "Brazil: Campos do Jordão, SP",
  conditionNotes: "Good structural condition; cosmetic renovation acceptable.",
  groundsTopography: "Gentle hillside with mature landscaping and viewpoints.",
  vendorServices: "IT/PMS, housekeeping, grounds, F&B purveyors.",
  regulatoryNotes: "Clear zoning for hospitality; fire and ADA compliance required.",
  exclusions: "Urban high-rise properties; chain hotels; properties below 8 rooms.",
  additionalContext: "Mountain tourism market with strong weekend leisure demand.",
  icpEssay: "Casa da Serra exemplifies the Brazilian mountain boutique segment.",
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ICP Intelligence G5 — output shape (LLM success path)", () => {
  it("returns a valid config object with expected numeric fields", async () => {
    const result = await generateIcp([STUB_PROPERTY], null, {
      llmCallback: async () => "```json\n" + MOCK_LLM_JSON + "\n```",
    });

    const c = result.config;
    expect(Number.isFinite(c.roomsMin)).toBe(true);
    expect(Number.isFinite(c.roomsMax)).toBe(true);
    expect(Number.isFinite(c.adrMin)).toBe(true);
    expect(Number.isFinite(c.adrMax)).toBe(true);
    expect(Number.isFinite(c.occupancyMin)).toBe(true);
    expect(Number.isFinite(c.occupancyMax)).toBe(true);
    expect(Number.isFinite(c.acquisitionMin)).toBe(true);
    expect(Number.isFinite(c.acquisitionMax)).toBe(true);
  });

  it("returns all 10 descriptive sections as non-empty strings when LLM succeeds", async () => {
    const result = await generateIcp([STUB_PROPERTY], null, {
      llmCallback: async () => MOCK_LLM_JSON,
    });

    const d = result.descriptive;
    expect(d.propertyTypes.length).toBeGreaterThan(5);
    expect(d.fbLevel.length).toBeGreaterThan(5);
    expect(d.locationCharacteristics.length).toBeGreaterThan(5);
    expect(d.locationDetails.length).toBeGreaterThan(5);
    expect(d.conditionNotes.length).toBeGreaterThan(5);
    expect(d.groundsTopography.length).toBeGreaterThan(5);
    expect(d.vendorServices.length).toBeGreaterThan(5);
    expect(d.regulatoryNotes.length).toBeGreaterThan(5);
    expect(d.exclusions.length).toBeGreaterThan(5);
    // additionalContext may be empty string — that's valid
    expect(typeof d.additionalContext).toBe("string");
  });

  it("portfolioAnalysis reflects the input property count", async () => {
    const result = await generateIcp([STUB_PROPERTY], null, {
      llmCallback: async () => MOCK_LLM_JSON,
    });

    expect(result.portfolioAnalysis.propertyCount).toBe(1);
  });

  it("returns a valid ISO generatedAt timestamp", async () => {
    const result = await generateIcp([STUB_PROPERTY], null, {
      llmCallback: async () => MOCK_LLM_JSON,
    });

    expect(() => new Date(result.generatedAt).toISOString()).not.toThrow();
    expect(Number.isNaN(new Date(result.generatedAt).getTime())).toBe(false);
  });

  it("source is portfolio+ai when llmCallback succeeds", async () => {
    const result = await generateIcp([STUB_PROPERTY], null, {
      llmCallback: async () => MOCK_LLM_JSON,
    });

    expect(result.source).toBe("portfolio+ai");
  });
});

describe("ICP Intelligence G5 — portfolio-only fallback path", () => {
  it("source is portfolio when no llmCallback is provided", async () => {
    const result = await generateIcp([STUB_PROPERTY], null);

    expect(result.source).toBe("portfolio");
    expect(result.fieldsFromAi).toBe(0);
  });

  it("descriptive sections are non-empty even without LLM", async () => {
    const result = await generateIcp([STUB_PROPERTY], null);

    expect(result.descriptive.propertyTypes.length).toBeGreaterThan(5);
    expect(result.descriptive.fbLevel.length).toBeGreaterThan(5);
    expect(result.descriptive.locationCharacteristics.length).toBeGreaterThan(5);
    expect(result.descriptive.exclusions.length).toBeGreaterThan(5);
  });

  it("falls back to portfolio when llmCallback throws", async () => {
    const result = await generateIcp([STUB_PROPERTY], null, {
      llmCallback: async () => { throw new Error("Anthropic unavailable"); },
    });

    expect(result.source).toBe("portfolio");
    expect(result.descriptive.propertyTypes.length).toBeGreaterThan(5);
  });

  it("falls back to portfolio when llmCallback returns malformed JSON", async () => {
    const result = await generateIcp([STUB_PROPERTY], null, {
      llmCallback: async () => "not valid json {{{",
    });

    expect(result.source).toBe("portfolio");
    expect(result.descriptive.propertyTypes.length).toBeGreaterThan(5);
  });
});

describe("ICP Intelligence G5 — model tier", () => {
  it("ICP_LLM_MODEL is the Opus tier (claude-opus-4-6)", () => {
    expect(ICP_LLM_MODEL).toBe("claude-opus-4-6");
  });
});
