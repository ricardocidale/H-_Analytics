/**
 * extractGuidance — `options.extraValidKeys` widening test.
 *
 * Guards the admin-defaults surface. The admin "global" slice edits a
 * UNION of company- and property-flavored fields (PropertyUnderwriting
 * tab edits `adr`, `ltv`, `maxOccupancy`, etc.). `runAnalystScoped`
 * invokes `extractGuidance(..., "company", { extraValidKeys:
 * PROPERTY_ASSUMPTION_KEYS })` so those keys survive the filter step.
 *
 * Without the widening, property-flavored keys in the LLM envelope would
 * be dropped at `extractFromGenericKeys`, and the admin's
 * PropertyUnderwriting tab would silently never get guidance.
 */
import { describe, it, expect } from "vitest";
import { extractGuidance } from "../../server/ai/guidance/extractor";
import { PROPERTY_ASSUMPTION_KEYS } from "../../server/ai/guidance/schemas";

const envelopeWithPropertyKeys: Record<string, unknown> = {
  // Top-level keys in the shape `extractRecordFromSection` understands:
  // `{ low, mid, high, confidence }`.
  adr: { low: 180, mid: 200, high: 220, confidence: "high" },
  ltv: { low: 0.55, mid: 0.60, high: 0.65, confidence: "medium" },
  maxOccupancy: { low: 0.70, mid: 0.75, high: 0.80, confidence: "high" },
  // Plus a company-scope key as a control.
  costOfEquity: { low: 0.08, mid: 0.09, high: 0.10, confidence: "high" },
};

describe("extractGuidance — admin widening via extraValidKeys", () => {
  it("without widening: property-flavored keys are filtered OUT under company scope", () => {
    const result = extractGuidance(envelopeWithPropertyKeys, 1, "company");
    const keys = new Set(result.records.map(r => r.assumptionKey));
    expect(keys.has("adr")).toBe(false);
    expect(keys.has("ltv")).toBe(false);
    expect(keys.has("maxOccupancy")).toBe(false);
    // Company-scope key still makes it through:
    expect(keys.has("costOfEquity")).toBe(true);
  });

  it("with widening (extraValidKeys = PROPERTY_ASSUMPTION_KEYS): property keys are RETAINED", () => {
    const result = extractGuidance(envelopeWithPropertyKeys, 1, "company", {
      extraValidKeys: PROPERTY_ASSUMPTION_KEYS,
    });
    const keys = new Set(result.records.map(r => r.assumptionKey));
    expect(keys.has("adr")).toBe(true);
    expect(keys.has("ltv")).toBe(true);
    expect(keys.has("maxOccupancy")).toBe(true);
    // Company-scope key still present — union, not replacement:
    expect(keys.has("costOfEquity")).toBe(true);
  });

  it("widening does NOT change the returned entityType (still 'company')", () => {
    // Persistence downstream reads result.entityType and upserts under
    // `entityType="company"`; widening must not flip this flag.
    const result = extractGuidance(envelopeWithPropertyKeys, 1, "company", {
      extraValidKeys: PROPERTY_ASSUMPTION_KEYS,
    });
    expect(result.entityType).toBe("company");
  });

  it("widening does NOT admit arbitrary keys — only those in the union", () => {
    const envelope: Record<string, unknown> = {
      adr: { low: 180, mid: 200, high: 220, confidence: "high" },
      // A garbage key not in either valid set:
      totallyMadeUpKey: { low: 1, mid: 1.5, high: 2, confidence: "high" },
    };
    const result = extractGuidance(envelope, 1, "company", {
      extraValidKeys: PROPERTY_ASSUMPTION_KEYS,
    });
    const keys = new Set(result.records.map(r => r.assumptionKey));
    expect(keys.has("adr")).toBe(true);
    expect(keys.has("totallyMadeUpKey")).toBe(false);
  });
});
