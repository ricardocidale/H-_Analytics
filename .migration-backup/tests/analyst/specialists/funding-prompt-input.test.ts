/**
 * Tests for the Funding Specialist's prompt-input builder (S1 of G1).
 *
 * Coverage map (≥6 cases per packet acceptance criterion):
 *   1. pack-shape — buildFundingPromptInput emits the locked shape
 *   2. dimensionInput-roundtrip — mapInputsToDimensionInputs round-trips keys
 *   3. cache-key determinism — same args produce identical hash
 *   4. persona variance — different persona triplet → different cache key
 *   5. intent string non-empty — Specialist intent populates correctly
 *   6. no leakage — legacy CapitalRaiseInputs fields not in candidate list
 *      do not appear in DimensionInput[] output
 *
 * Plus a few catalog-alignment + invariant guards to lock in the cross-check
 * invariants from the packet's S1 spec.
 */
import { describe, expect, it } from "vitest";
import {
  buildFundingCacheKey,
  buildFundingPromptInput,
  computeCacheKey,
  FUNDING_DIMENSION_KEYS,
  mapInputsToDimensionInputs,
  type FundingCacheKeyArgs,
  type FundingPersonaContext,
  type FundingPromptInputContext,
} from "../../../server/ai/specialists/mgmt-co-funding-prompt-input-builder";
import { SPECIALIST_CATALOG } from "../../../engine/analyst/registry/specialist-catalog";
import type { CapitalRaiseInputs } from "../../../engine/watchdog/capitalRaiseEvaluator";

const PERSONA: FundingPersonaContext = {
  verticalSlug: "wellness",
  marketTier: "L+B",
  locale: "US",
};

const PORTFOLIO = {
  propertyCount: 4,
  totalRaiseNeedUsd: 25_000_000,
  runwayNeedMonths: 18,
};

const INPUTS: CapitalRaiseInputs = {
  runwayBufferMonths: 12,
  sizingOvershootPct: 0.15,
  trancheGapMonths: 9,
  revenueRampDelayMonths: 7,
  burnFlexDownPct: 0.2,
};

const CACHE_ARGS: FundingCacheKeyArgs = {
  specialistId: "mgmt-co.funding",
  persona: PERSONA,
  companyInputs: {
    propertyType: "boutique-luxury",
    numProperties: 4,
    region: "US-East",
    country: "US",
    capitalRaise1Amount: 12_000_000,
    capitalRaise2Amount: 13_000_000,
    baseManagementFee: 0.04,
    incentiveManagementFee: 0.1,
  },
  scenarioId: null,
  entityId: 1,
  engineVersion: "v2",
};

function makeCtx(overrides: Partial<FundingPromptInputContext> = {}): FundingPromptInputContext {
  return {
    inputs: INPUTS,
    portfolio: PORTFOLIO,
    persona: PERSONA,
    priorVerdicts: [],
    ...overrides,
  };
}

describe("mgmt-co-funding-prompt-input-builder", () => {
  // ──────────────────────────────────────────────────────────────────────────
  // Cross-check: catalog alignment

  it("FUNDING_DIMENSION_KEYS matches mgmt-co.funding catalog candidateFields verbatim", () => {
    const fundingEntry = SPECIALIST_CATALOG.find((s) => s.id === "mgmt-co.funding");
    expect(fundingEntry, "mgmt-co.funding must exist in catalog").toBeDefined();
    const catalogKeys = (fundingEntry?.candidateFields ?? []).map((c) => c.key);
    expect([...FUNDING_DIMENSION_KEYS]).toEqual(catalogKeys);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. pack-shape

  it("buildFundingPromptInput emits the locked pack shape", () => {
    const pack = buildFundingPromptInput(makeCtx());

    expect(pack.specialistId).toBe("mgmt-co.funding");
    expect(pack.requiredFields).toHaveLength(5);
    expect(pack.requiredFields.map((d) => d.key)).toEqual([...FUNDING_DIMENSION_KEYS]);
    expect(pack.portfolio).toBe(PORTFOLIO);
    expect(pack.persona).toBe(PERSONA);
    expect(Object.keys(pack.currentValues).sort()).toEqual([...FUNDING_DIMENSION_KEYS].sort());
    expect(pack.priorVerdicts).toEqual([]);
    expect(typeof pack.intent).toBe("string");
  });

  it("buildFundingPromptInput preserves null userValues for missing inputs", () => {
    const partial: CapitalRaiseInputs = { runwayBufferMonths: 12 };
    const pack = buildFundingPromptInput(makeCtx({ inputs: partial }));
    expect(pack.currentValues.runwayBufferMonths).toBe(12);
    expect(pack.currentValues.sizingOvershootPct).toBeNull();
    expect(pack.currentValues.trancheGapMonths).toBeNull();
    expect(pack.currentValues.revenueRampDelayMonths).toBeNull();
    expect(pack.currentValues.burnFlexDownPct).toBeNull();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. dimensionInput-roundtrip

  it("mapInputsToDimensionInputs round-trips keys + values", () => {
    const dims = mapInputsToDimensionInputs(INPUTS);
    expect(dims).toHaveLength(5);

    for (const dim of dims) {
      expect(dim.isNumericField).toBe(true);
      expect(["mo", "%"]).toContain(dim.unit);
    }

    const byField = new Map(dims.map((d) => [d.field, d]));
    expect(byField.get("runwayBufferMonths")?.userValue).toBe(12);
    expect(byField.get("sizingOvershootPct")?.userValue).toBe(0.15);
    expect(byField.get("trancheGapMonths")?.userValue).toBe(9);
    expect(byField.get("revenueRampDelayMonths")?.userValue).toBe(7);
    expect(byField.get("burnFlexDownPct")?.userValue).toBe(0.2);
  });

  it("mapInputsToDimensionInputs assigns null when input field is absent", () => {
    const dims = mapInputsToDimensionInputs({});
    for (const dim of dims) {
      expect(dim.userValue).toBeNull();
    }
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. cache-key determinism

  it("buildFundingCacheKey + computeCacheKey is deterministic across identical args", () => {
    const a = computeCacheKey(buildFundingCacheKey(CACHE_ARGS));
    const b = computeCacheKey(buildFundingCacheKey(CACHE_ARGS));
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex
  });

  it("buildFundingCacheKey is order-independent on fieldGroup", () => {
    const sorted = computeCacheKey(
      buildFundingCacheKey({
        ...CACHE_ARGS,
        fieldGroup: ["burnFlexDownPct", "runwayBufferMonths", "sizingOvershootPct"],
      }),
    );
    const reverseOrder = computeCacheKey(
      buildFundingCacheKey({
        ...CACHE_ARGS,
        fieldGroup: ["sizingOvershootPct", "runwayBufferMonths", "burnFlexDownPct"],
      }),
    );
    expect(sorted).toBe(reverseOrder);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. persona variance

  it("different persona triplet produces a different cache key (personaHash drift)", () => {
    const baseHash = computeCacheKey(buildFundingCacheKey(CACHE_ARGS));
    const verticalShift = computeCacheKey(
      buildFundingCacheKey({
        ...CACHE_ARGS,
        persona: { ...PERSONA, verticalSlug: "boutique-luxury" },
      }),
    );
    const tierShift = computeCacheKey(
      buildFundingCacheKey({
        ...CACHE_ARGS,
        persona: { ...PERSONA, marketTier: "luxury" },
      }),
    );
    const localeShift = computeCacheKey(
      buildFundingCacheKey({
        ...CACHE_ARGS,
        persona: { ...PERSONA, locale: "Brazil" },
      }),
    );
    expect(verticalShift).not.toBe(baseHash);
    expect(tierShift).not.toBe(baseHash);
    expect(localeShift).not.toBe(baseHash);
    expect(verticalShift).not.toBe(tierShift);
    expect(tierShift).not.toBe(localeShift);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. intent string non-empty

  it("Specialist intent string is non-empty and includes key concepts", () => {
    const pack = buildFundingPromptInput(makeCtx());
    expect(pack.intent.length).toBeGreaterThan(20);
    // Don't pin exact wording; pin the named domains so a future intent
    // tweak can't silently lose them.
    expect(pack.intent.toLowerCase()).toContain("funding");
    expect(pack.intent.toLowerCase()).toContain("runway");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. no leakage — legacy CapitalRaiseInputs fields not in candidate list
  //    do not appear in DimensionInput[] output

  it("DimensionInput[] keys are exactly the 5 catalog-locked dimension keys", () => {
    // Cast through unknown to inject an extra phantom key the legacy interface
    // doesn't actually expose; the adapter must not surface it.
    const inputsWithPhantomKey = {
      ...INPUTS,
      // Phantom keys that aren't in the candidateFields list:
      capitalRaise1Amount: 5_000_000,
      capitalRaise2Date: "2026-09-01",
      legacyOnlyField: 0.99,
    } as unknown as CapitalRaiseInputs;

    const dims = mapInputsToDimensionInputs(inputsWithPhantomKey);
    const dimFields = dims.map((d) => d.field).sort();
    expect(dimFields).toEqual([...FUNDING_DIMENSION_KEYS].sort());

    // Specifically: phantom keys should not appear as dimension fields.
    expect(dimFields).not.toContain("capitalRaise1Amount");
    expect(dimFields).not.toContain("capitalRaise2Date");
    expect(dimFields).not.toContain("legacyOnlyField");
  });

  it("buildFundingPromptInput.currentValues mirrors only the 5 dimension keys", () => {
    const inputsWithPhantomKey = {
      ...INPUTS,
      capitalRaise1Amount: 5_000_000,
    } as unknown as CapitalRaiseInputs;
    const pack = buildFundingPromptInput(makeCtx({ inputs: inputsWithPhantomKey }));
    const valueKeys = Object.keys(pack.currentValues).sort();
    expect(valueKeys).toEqual([...FUNDING_DIMENSION_KEYS].sort());
    expect(valueKeys).not.toContain("capitalRaise1Amount");
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Field-definitions-no-prescription-hints rule guard

  it("requiredFields evidenceCues never contain typical-range hints", () => {
    const pack = buildFundingPromptInput(makeCtx());
    // Banned patterns from .claude/rules/field-definitions-no-prescription-hints.md
    const TYPICAL_NUMERIC = /typical\s+\$?[\d,.]+\s*[–\-]\s*\$?[\d,.]+/i;
    const EXAMPLE_NUMERIC = /e\.g\.,?\s+\$?[\d,.]+\s*[–\-]\s*\$?[\d,.]+/i;
    const TYPICAL_NUMBER = /typical\s+\d/i;

    for (const dim of pack.requiredFields) {
      for (const cue of dim.evidenceCues) {
        expect(cue, `dim=${dim.key} cue="${cue}"`).not.toMatch(TYPICAL_NUMERIC);
        expect(cue, `dim=${dim.key} cue="${cue}"`).not.toMatch(EXAMPLE_NUMERIC);
        expect(cue, `dim=${dim.key} cue="${cue}"`).not.toMatch(TYPICAL_NUMBER);
      }
    }
  });
});
