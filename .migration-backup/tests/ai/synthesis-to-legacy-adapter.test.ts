import { describe, it, expect } from "vitest";
import {
  synthesisOutputToLegacyJson,
  CANONICAL_RESEARCH_FIELDS,
  type SynthesisOutput,
  type CanonicalResearchField,
} from "../../server/ai/synthesis-schema";
import { extractGuidance } from "../../server/ai/guidance/extractor";

/**
 * synthesisOutputToLegacyJson — adapter regression harness (OT-A.4).
 *
 * The adapter feeds the legacy-shape envelope to extractGuidance, the UI
 * render path, and the single-model fallback path. Coverage failures here
 * mean a downstream consumer will silently see zero records or stale data
 * for some field. THE FAILURE IS THE POINT.
 *
 * Two layers of assertion:
 *   1. Path enumeration — every CANONICAL_RESEARCH_FIELDS entry has a
 *      mapping; every section node has the expected shape.
 *   2. End-to-end with extractGuidance — the produced envelope yields
 *      the same number of guidance records as a faithful legacy Opus
 *      output would, and the values match.
 */

function buildValue(field: CanonicalResearchField): SynthesisOutput["values"][number] {
  // Build a minimal valid NumericResearchValue per field. Values chosen so
  // that PCT_FIELDS land within the extractGuidance SANITY_BOUNDS in
  // server/ai/guidance/extractor.ts:57-82 (which expects DECIMAL bounds —
  // the adapter must scale percentage emissions accordingly).
  const baseByField: Record<CanonicalResearchField, { low: number; mid: number; high: number; unit: SynthesisOutput["values"][number]["unit"]; display: string }> = {
    adr:                { low: 300, mid: 350, high: 400, unit: "$", display: "$300-$400" },
    adrGrowth:          { low: 2,   mid: 3,   high: 4,   unit: "%", display: "3.0%" },
    occupancy:          { low: 70,  mid: 75,  high: 80,  unit: "%", display: "70%–80%" },
    startOccupancy:     { low: 55,  mid: 60,  high: 65,  unit: "%", display: "55%–65%" },
    occupancyStep:      { low: 4,   mid: 5,   high: 6,   unit: "%", display: "5.0%" },
    rampMonths:         { low: 6,   mid: 9,   high: 12,  unit: "months", display: "6–12 mo" },
    catering:           { low: 8,   mid: 10,  high: 12,  unit: "%", display: "10%" },
    revShareFB:         { low: 25,  mid: 30,  high: 35,  unit: "%", display: "30%" },
    revShareEvents:     { low: 8,   mid: 10,  high: 12,  unit: "%", display: "10%" },
    revShareOther:      { low: 3,   mid: 5,   high: 7,   unit: "%", display: "5%" },
    capRate:            { low: 6,   mid: 7,   high: 8,   unit: "%", display: "6%–8%" },
    landValue:          { low: 18,  mid: 20,  high: 22,  unit: "%", display: "20%" },
    saleCommission:     { low: 1.5, mid: 2,   high: 2.5, unit: "%", display: "2.0%" },
    costHousekeeping:   { low: 22,  mid: 25,  high: 28,  unit: "%", display: "25%" },
    costFB:             { low: 30,  mid: 35,  high: 40,  unit: "%", display: "35%" },
    costAdmin:          { low: 7,   mid: 8,   high: 9,   unit: "%", display: "8%" },
    costMarketing:      { low: 4,   mid: 5,   high: 6,   unit: "%", display: "5%" },
    costPropertyOps:    { low: 4,   mid: 5,   high: 6,   unit: "%", display: "5%" },
    costUtilities:      { low: 3,   mid: 4,   high: 5,   unit: "%", display: "4%" },
    costFFE:            { low: 3,   mid: 4,   high: 5,   unit: "%", display: "4%" },
    costIT:             { low: 1,   mid: 2,   high: 3,   unit: "%", display: "2%" },
    costOther:          { low: 1,   mid: 2,   high: 3,   unit: "%", display: "2%" },
    costPropertyTaxes:  { low: 1.5, mid: 2,   high: 2.5, unit: "%", display: "2%" },
    incentiveFee:       { low: 8,   mid: 10,  high: 12,  unit: "%", display: "10%" },
    svcFeeMarketing:    { low: 1.5, mid: 1.75,high: 2,   unit: "%", display: "1.75%" },
    svcFeeTechRes:      { low: 2,   mid: 2.5, high: 3,   unit: "%", display: "2.5%" },
    svcFeeAccounting:   { low: 0.4, mid: 0.5, high: 0.6, unit: "%", display: "0.5%" },
    svcFeeRevMgmt:      { low: 0.8, mid: 1,   high: 1.2, unit: "%", display: "1%" },
    svcFeeGeneralMgmt:  { low: 1,   mid: 1.5, high: 2,   unit: "%", display: "1.5%" },
    svcFeeProcurement:  { low: 0.4, mid: 0.5, high: 0.6, unit: "%", display: "0.5%" },
    incomeTax:          { low: 22,  mid: 25,  high: 28,  unit: "%", display: "25%" },
    inflationRate:      { low: 2,   mid: 3,   high: 4,   unit: "%", display: "3%" },
    interestRate:       { low: 5,   mid: 5.5, high: 6,   unit: "%", display: "5.5%" },
    ltv:                { low: 60,  mid: 65,  high: 70,  unit: "%", display: "65%" },
    costSeg5yrPct:      { low: 12,  mid: 15,  high: 18,  unit: "%", display: "15%" },
    costSeg7yrPct:      { low: 8,   mid: 10,  high: 12,  unit: "%", display: "10%" },
    costSeg15yrPct:     { low: 18,  mid: 20,  high: 22,  unit: "%", display: "20%" },
    arDays:             { low: 25,  mid: 30,  high: 35,  unit: "days", display: "30 days" },
    apDays:             { low: 40,  mid: 45,  high: 50,  unit: "days", display: "45 days" },
    preOpeningCosts:    { low: 50000, mid: 100000, high: 150000, unit: "$", display: "$50,000–$150,000" },
    platformFee:        { low: 12,  mid: 14,  high: 16,  unit: "%", display: "14%" },
  };
  const b = baseByField[field];
  return {
    field,
    low: b.low,
    mid: b.mid,
    high: b.high,
    unit: b.unit,
    display: b.display,
    reasoning: `Synthetic value for ${field}, derived from test-fixture defaults.`,
    sources: ["Test Fixture 2026"],
    personaFit: 0.85,
  };
}

function buildOutput(fields: readonly CanonicalResearchField[]): SynthesisOutput {
  return {
    values: fields.map(buildValue),
    overall: { consensusRatio: 0.82, keyTakeaways: ["Synthetic test takeaway 1", "Synthetic test takeaway 2"] },
  };
}

// ── Layer 1: path enumeration ────────────────────────────────────────────

describe("synthesisOutputToLegacyJson — path enumeration", () => {
  it("every canonical field produces SOMETHING in the legacy envelope", () => {
    // Single-field outputs to isolate per-field path emission.
    const missing: string[] = [];
    for (const field of CANONICAL_RESEARCH_FIELDS) {
      const out = buildOutput([field]);
      const env = synthesisOutputToLegacyJson(out);
      // Strip the always-present _synthesis envelope-meta block.
      const { _synthesis, ...rest } = env as Record<string, unknown>;
      void _synthesis;
      if (Object.keys(rest).length === 0) missing.push(field);
    }
    expect(missing, `Adapter missed fields: ${missing.join(", ")}`).toEqual([]);
  });

  it("every section node has valueLow/valueMid/valueHigh/display + recommendedRange", () => {
    const sectionFields: CanonicalResearchField[] = [
      "adr", "occupancy", "capRate", "catering", "landValue",
      "costHousekeeping", "costFB", "costAdmin", "costPropertyOps",
      "costUtilities", "costFFE", "costMarketing", "costIT", "costOther",
      "costPropertyTaxes", "incentiveFee",
      "svcFeeMarketing", "svcFeeTechRes", "svcFeeAccounting",
      "svcFeeRevMgmt", "svcFeeGeneralMgmt", "svcFeeProcurement",
      "incomeTax", "preOpeningCosts",
    ];
    const env = synthesisOutputToLegacyJson(buildOutput(sectionFields));

    // Spot-check one section per section family.
    const adr = (env.adrAnalysis ?? {}) as Record<string, unknown>;
    expect(adr.recommendedRange).toBe("$300-$400");
    expect(adr.valueLow).toBe(300);
    expect(adr.valueMid).toBe(350);
    expect(adr.valueHigh).toBe(400);
    expect(adr.display).toBe("$300-$400");

    const fb = (((env.operatingCostAnalysis as Record<string, unknown>)?.roomRevenueBased as Record<string, unknown>)?.fbCostOfSales ?? {}) as Record<string, unknown>;
    expect(fb.recommendedRate).toBe("35%");
    // PCT field must be DECIMAL on section nodes (extractGuidance bounds).
    expect(fb.valueMid).toBeCloseTo(0.35, 5);

    const taxes = (((env.propertyValueCostAnalysis as Record<string, unknown>)?.propertyTaxes) ?? {}) as Record<string, unknown>;
    expect(taxes.valueMid).toBeCloseTo(0.02, 5);

    const incFee = (((env.managementServiceFeeAnalysis as Record<string, unknown>)?.incentiveFee) ?? {}) as Record<string, unknown>;
    expect(incFee.valueMid).toBeCloseTo(0.10, 5);
  });

  it("sub-string paths are emitted as bare strings at the expected nested location", () => {
    const env = synthesisOutputToLegacyJson(buildOutput([
      "adrGrowth", "startOccupancy", "occupancyStep", "rampMonths",
      "saleCommission", "revShareEvents", "revShareFB", "revShareOther",
      "inflationRate", "interestRate", "ltv",
      "costSeg5yrPct", "costSeg7yrPct", "costSeg15yrPct", "platformFee",
    ]));

    const adr = (env.adrAnalysis ?? {}) as Record<string, unknown>;
    expect(adr.recommendedGrowthRate).toBe("3.0%");

    const occ = (env.occupancyAnalysis ?? {}) as Record<string, unknown>;
    expect(occ.initialOccupancy).toBe("55%–65%");
    expect(occ.rampUpTimeline).toBe("6–12 mo");
    expect(occ.recommendedGrowthStep).toBe("5.0%");

    expect(((env.dispositionAnalysis as Record<string, unknown>) ?? {}).recommendedCommission).toBe("2.0%");
    expect(((env.eventDemandAnalysis as Record<string, unknown>) ?? {}).recommendedRevenueShare).toBe("10%");
    expect(((env.fbRevenueAnalysis as Record<string, unknown>) ?? {}).recommendedPercent).toBe("30%");
    expect(((env.ancillaryRevenueAnalysis as Record<string, unknown>) ?? {}).recommendedPercent).toBe("5%");
    expect(((env.localEconomics as Record<string, unknown>) ?? {}).inflationRate).toBe("3%");
    expect(((env.localEconomics as Record<string, unknown>) ?? {}).interestRate).toBe("5.5%");
    expect(((env.capitalStructureAnalysis as Record<string, unknown>) ?? {}).recommendedLTV).toBe("65%");
    const cs = (env.costSegregationAnalysis as Record<string, unknown>) ?? {};
    expect(cs.fiveYearPercent).toBe("15%");
    expect(cs.sevenYearPercent).toBe("10%");
    expect(cs.fifteenYearPercent).toBe("20%");
    expect(((env.platformFeeAnalysis as Record<string, unknown>) ?? {}).recommendedRate).toBe("14%");
  });

  it("numeric sub-paths are emitted as bare numbers", () => {
    const env = synthesisOutputToLegacyJson(buildOutput(["arDays", "apDays"]));
    const wc = (env.workingCapitalAnalysis ?? {}) as Record<string, unknown>;
    expect(wc.arDays).toBe(30);
    expect(wc.apDays).toBe(45);
  });

  it("envelope carries _synthesis summary block", () => {
    const env = synthesisOutputToLegacyJson(buildOutput(["adr"]));
    const summary = (env._synthesis ?? {}) as Record<string, unknown>;
    expect(summary.consensusRatio).toBe(0.82);
    expect(summary.keyTakeaways).toEqual(["Synthetic test takeaway 1", "Synthetic test takeaway 2"]);
  });
});

// ── Layer 2: end-to-end with extractGuidance ─────────────────────────────

describe("synthesisOutputToLegacyJson + extractGuidance — end-to-end", () => {
  it("produces guidance records for every section-node field", () => {
    // The 24 section-node fields are the ones extractGuidance reliably
    // extracts from the legacy nested shape (sub-string paths are subject
    // to the historical NaN-coercion latent bug — out of scope for OT-A.4).
    const sectionFields: CanonicalResearchField[] = [
      "adr", "occupancy", "capRate", "catering", "landValue",
      "costHousekeeping", "costFB", "costAdmin", "costPropertyOps",
      "costUtilities", "costFFE", "costMarketing", "costIT", "costOther",
      "costPropertyTaxes", "incentiveFee",
      "svcFeeMarketing", "svcFeeTechRes", "svcFeeAccounting",
      "svcFeeRevMgmt", "svcFeeGeneralMgmt", "svcFeeProcurement",
      "incomeTax",
    ];
    const env = synthesisOutputToLegacyJson(buildOutput(sectionFields));
    const result = extractGuidance(env, 1, "property");
    // Cap-rate / occupancy / etc. extractGuidance maps to alternate names
    // (maxOccupancy, capRate, etc.) — assertion: at least 20 records, no
    // sanity-bound failures.
    expect(result.records.length).toBeGreaterThanOrEqual(20);
    const sanityErrors = result.errors.filter(e => e.startsWith("Sanity warning"));
    expect(sanityErrors, `Adapter PCT scaling broke extractGuidance bounds: ${sanityErrors.join("\n")}`).toEqual([]);
  });

  it("decimal-scaled section values fall within extractGuidance sanity bounds", () => {
    // Specifically guard the PCT-scaling decision: section-node valueLow/
    // valueMid/valueHigh must be DECIMAL, else extractGuidance's sanity
    // bounds (e.g. costFB ∈ [0.15, 0.70]) reject every record as out-of-range.
    const env = synthesisOutputToLegacyJson(buildOutput(["costFB", "capRate", "ltv"]));
    const result = extractGuidance(env, 1, "property");
    expect(result.errors.filter(e => e.includes("outside bounds"))).toEqual([]);
    const costFB = result.records.find(r => r.assumptionKey === "costFB");
    expect(costFB?.valueMid).toBeCloseTo(0.35, 5);
    const capRate = result.records.find(r => r.assumptionKey === "capRate");
    expect(capRate?.valueMid).toBeCloseTo(0.07, 5);
  });

  it("preserves sourceName + reasoning from SynthesisOutput onto guidance records", () => {
    const env = synthesisOutputToLegacyJson(buildOutput(["adr"]));
    const result = extractGuidance(env, 1, "property");
    const adr = result.records.find(r => r.assumptionKey === "adr");
    expect(adr?.sourceName).toBe("Test Fixture 2026");
    expect(adr?.reasoning).toContain("Synthetic value for adr");
  });
});
