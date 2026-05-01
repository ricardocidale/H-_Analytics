import { describe, it, expect } from "vitest";
import { extractGuidance } from "../../server/ai/guidance/extractor";
import { normalizeAssumptionKey, PROPERTY_ASSUMPTION_KEYS, COMPANY_ASSUMPTION_KEYS, KEY_ALIASES } from "../../server/ai/guidance/schemas";

describe("normalizeAssumptionKey", () => {
  it("maps known aliases to canonical keys", () => {
    expect(normalizeAssumptionKey("housekeeping")).toBe("costRooms");
    expect(normalizeAssumptionKey("rooms")).toBe("costRooms");
    expect(normalizeAssumptionKey("fbCostOfSales")).toBe("costFB");
    expect(normalizeAssumptionKey("adminGeneral")).toBe("costAdmin");
    expect(normalizeAssumptionKey("propertyOps")).toBe("costPropertyOps");
    expect(normalizeAssumptionKey("utilities")).toBe("costUtilities");
    expect(normalizeAssumptionKey("ffeReserve")).toBe("costFFE");
    expect(normalizeAssumptionKey("insurance")).toBe("costInsurance");
    expect(normalizeAssumptionKey("propertyTaxes")).toBe("costTaxes");
  });

  it("returns canonical keys unchanged", () => {
    expect(normalizeAssumptionKey("adr")).toBe("adr");
    expect(normalizeAssumptionKey("capRate")).toBe("capRate");
    expect(normalizeAssumptionKey("maxOccupancy")).toBe("maxOccupancy");
    expect(normalizeAssumptionKey("costRateRooms")).toBe("costRateRooms");
  });

  it("passes through unknown keys unchanged", () => {
    expect(normalizeAssumptionKey("unknownField")).toBe("unknownField");
    expect(normalizeAssumptionKey("randomKey")).toBe("randomKey");
  });
});

describe("PROPERTY_ASSUMPTION_KEYS", () => {
  it("contains core revenue keys", () => {
    expect(PROPERTY_ASSUMPTION_KEYS.has("adr")).toBe(true);
    expect(PROPERTY_ASSUMPTION_KEYS.has("adrGrowth")).toBe(true);
    expect(PROPERTY_ASSUMPTION_KEYS.has("startOccupancy")).toBe(true);
    expect(PROPERTY_ASSUMPTION_KEYS.has("maxOccupancy")).toBe(true);
  });

  it("contains core cost keys", () => {
    expect(PROPERTY_ASSUMPTION_KEYS.has("costRooms")).toBe(true);
    expect(PROPERTY_ASSUMPTION_KEYS.has("costFB")).toBe(true);
    expect(PROPERTY_ASSUMPTION_KEYS.has("costAdmin")).toBe(true);
    expect(PROPERTY_ASSUMPTION_KEYS.has("costInsurance")).toBe(true);
  });

  it("contains capital structure keys", () => {
    expect(PROPERTY_ASSUMPTION_KEYS.has("capRate")).toBe(true);
    expect(PROPERTY_ASSUMPTION_KEYS.has("exitCapRate")).toBe(true);
    expect(PROPERTY_ASSUMPTION_KEYS.has("interestRate")).toBe(true);
    expect(PROPERTY_ASSUMPTION_KEYS.has("ltv")).toBe(true);
  });

  it("has 38+ keys", () => {
    expect(PROPERTY_ASSUMPTION_KEYS.size).toBeGreaterThanOrEqual(38);
  });
});

describe("COMPANY_ASSUMPTION_KEYS", () => {
  it("contains fee keys", () => {
    expect(COMPANY_ASSUMPTION_KEYS.has("baseManagementFee")).toBe(true);
    expect(COMPANY_ASSUMPTION_KEYS.has("incentiveManagementFee")).toBe(true);
    expect(COMPANY_ASSUMPTION_KEYS.has("acquisitionCommission")).toBe(true);
  });

  it("contains overhead keys", () => {
    expect(COMPANY_ASSUMPTION_KEYS.has("officeLease")).toBe(true);
    expect(COMPANY_ASSUMPTION_KEYS.has("professionalServices")).toBe(true);
    expect(COMPANY_ASSUMPTION_KEYS.has("techInfra")).toBe(true);
  });

  it("has 22+ keys", () => {
    expect(COMPANY_ASSUMPTION_KEYS.size).toBeGreaterThanOrEqual(22);
  });
});

describe("extractGuidance", () => {
  it("extracts property guidance from structured AI output", () => {
    const aiOutput = {
      adr: { valueLow: 300, valueMid: 350, valueHigh: 400, confidence: "high", reasoning: "Based on local comps" },
      capRate: { valueLow: 0.06, valueMid: 0.07, valueHigh: 0.08, confidence: "medium", reasoning: "CBRE survey" },
      maxOccupancy: { valueLow: 0.80, valueMid: 0.85, valueHigh: 0.90, confidence: "high", reasoning: "STR data" },
    };
    const result = extractGuidance(aiOutput, 1, "property");
    expect(result.records.length).toBeGreaterThanOrEqual(3);
    expect(result.entityType).toBe("property");
    expect(result.tier).toBe(1);

    const adrRec = result.records.find(r => r.assumptionKey === "adr");
    expect(adrRec).toBeTruthy();
    expect(adrRec!.valueLow).toBe(300);
    expect(adrRec!.valueMid).toBe(350);
    expect(adrRec!.valueHigh).toBe(400);
    expect(adrRec!.confidence).toBe("high");
  });

  it("normalizes aliased keys", () => {
    const aiOutput = {
      housekeeping: { valueLow: 0.20, valueMid: 0.25, valueHigh: 0.30, confidence: "medium" },
      fbCostOfSales: { valueLow: 0.30, valueMid: 0.35, valueHigh: 0.40, confidence: "low" },
    };
    const result = extractGuidance(aiOutput, 1, "property");
    const costRooms = result.records.find(r => r.assumptionKey === "costRooms");
    const costFB = result.records.find(r => r.assumptionKey === "costFB");
    expect(costRooms).toBeTruthy();
    expect(costFB).toBeTruthy();
  });

  it("filters out keys not in valid set", () => {
    const aiOutput = {
      adr: { valueLow: 300, valueMid: 350, valueHigh: 400, confidence: "high" },
      totallyFakeKey: { valueLow: 1, valueMid: 2, valueHigh: 3, confidence: "low" },
    };
    const result = extractGuidance(aiOutput, 1, "property");
    expect(result.records.find(r => r.assumptionKey === "totallyFakeKey")).toBeUndefined();
    expect(result.records.find(r => r.assumptionKey === "adr")).toBeTruthy();
  });

  it("extracts company guidance keys", () => {
    const aiOutput = {
      baseManagementFee: { valueLow: 0.02, valueMid: 0.03, valueHigh: 0.04, confidence: "high" },
      officeLease: { valueLow: 50000, valueMid: 60000, valueHigh: 75000, confidence: "medium" },
    };
    const result = extractGuidance(aiOutput, 1, "company");
    expect(result.entityType).toBe("company");
    const fee = result.records.find(r => r.assumptionKey === "baseManagementFee");
    expect(fee).toBeTruthy();
    expect(fee!.valueMid).toBe(0.03);
  });

  it("handles empty AI response gracefully", () => {
    const result = extractGuidance({}, 1, "property");
    expect(result.records).toEqual([]);
    expect(result.errors.length).toBe(0);
  });

  it("handles non-object AI response gracefully", () => {
    const result = extractGuidance("raw text response" as unknown as Record<string, unknown>, 1, "property");
    expect(result.records).toEqual([]);
  });

  it("records count matches validKeyCount", () => {
    const aiOutput = {
      adr: { valueLow: 300, valueMid: 350, valueHigh: 400, confidence: "high" },
      capRate: { valueLow: 0.06, valueMid: 0.07, valueHigh: 0.08, confidence: "medium" },
    };
    const result = extractGuidance(aiOutput, 1, "property");
    expect(result.validKeyCount).toBe(result.records.length);
  });

  it("defaults confidence to medium when missing", () => {
    const aiOutput = {
      adr: { valueLow: 300, valueMid: 350, valueHigh: 400 },
    };
    const result = extractGuidance(aiOutput, 1, "property");
    const rec = result.records.find(r => r.assumptionKey === "adr");
    expect(rec?.confidence).toBe("medium");
  });
});
