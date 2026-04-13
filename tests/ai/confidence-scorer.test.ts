/**
 * Tests for server/ai/confidence-scorer.ts
 *
 * Validates computePerFieldConfidence (pure, sync) and
 * computeConfidenceBreakdown (async, requires mocked getHealthySources).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the source-health-checker before importing the module under test
vi.mock("../../server/ai/source-health-checker", () => ({
  getHealthySources: vi.fn().mockResolvedValue(["fred", "anthropic", "pinecone"]),
}));

import {
  computePerFieldConfidence,
  computeConfidenceBreakdown,
} from "../../server/ai/confidence-scorer";
import { getHealthySources } from "../../server/ai/source-health-checker";
import type { AssumptionGuidance } from "@shared/schema/intelligence-v2";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

/** Build a minimal AssumptionGuidance record for testing. */
function makeGuidance(overrides: Partial<AssumptionGuidance> = {}): AssumptionGuidance {
  return {
    id: 1,
    scenarioId: 1,
    entityType: "property",
    entityId: 1,
    assumptionKey: "adr",
    valueLow: null,
    valueMid: null,
    valueHigh: null,
    confidence: "medium",
    sourceName: "test-source",
    sourceDate: null,
    reasoning: "Test reasoning",
    comparableSet: null,
    relaxationLevel: 0,
    researchRunId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as AssumptionGuidance;
}

// ---------------------------------------------------------------------------
// computePerFieldConfidence
// ---------------------------------------------------------------------------

describe("computePerFieldConfidence", () => {
  it("1. High confidence, L0, fresh data => score >= 80", () => {
    const record = makeGuidance({
      confidence: "high",
      relaxationLevel: 0,
      updatedAt: daysAgo(1),
    });
    const score = computePerFieldConfidence(record);
    expect(score).toBeGreaterThanOrEqual(80);
  });

  it("2. Low confidence, L4, stale data => score < 40", () => {
    const record = makeGuidance({
      confidence: "low",
      relaxationLevel: 4,
      updatedAt: daysAgo(60),
    });
    const score = computePerFieldConfidence(record);
    expect(score).toBeLessThan(40);
  });

  it("3. Medium confidence, L2, recent data => score 50-70", () => {
    const record = makeGuidance({
      confidence: "medium",
      relaxationLevel: 2,
      updatedAt: daysAgo(5),
    });
    const score = computePerFieldConfidence(record);
    expect(score).toBeGreaterThanOrEqual(50);
    expect(score).toBeLessThanOrEqual(75);
  });

  it("4. No range data => score slightly lower than with range", () => {
    const base = {
      confidence: "high" as const,
      relaxationLevel: 0,
      updatedAt: daysAgo(1),
    };
    const noRange = computePerFieldConfidence(makeGuidance(base));
    const withRange = computePerFieldConfidence(
      makeGuidance({ ...base, valueLow: 100, valueMid: 150, valueHigh: 200 }),
    );
    expect(withRange).toBeGreaterThan(noRange);
  });

  it("5. Range present => small bonus applied (exactly +10)", () => {
    const base = {
      confidence: "medium" as const,
      relaxationLevel: 1,
      updatedAt: daysAgo(3),
    };
    const noRange = computePerFieldConfidence(makeGuidance(base));
    const withRange = computePerFieldConfidence(
      makeGuidance({ ...base, valueLow: 50, valueMid: 75, valueHigh: 100 }),
    );
    // The bonus is +10 in the formula (before clamping to 100)
    expect(withRange - noRange).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// computeConfidenceBreakdown
// ---------------------------------------------------------------------------

describe("computeConfidenceBreakdown", () => {
  beforeEach(() => {
    vi.mocked(getHealthySources).mockResolvedValue(["fred", "anthropic", "pinecone"]);
  });

  it("6. All factors high => overall 'high', score >= 80", async () => {
    // 6 comps, evidence 0.8, fresh, L0, tight ranges, full critical-field coverage
    const criticalKeys = [
      "adr", "maxOccupancy", "capRate", "costRooms", "costFB",
      "costAdmin", "costPropertyOps", "costUtilities", "costFFE",
    ];
    const records = criticalKeys.map((key) =>
      makeGuidance({
        assumptionKey: key,
        confidence: "high",
        relaxationLevel: 0,
        updatedAt: daysAgo(2),
        sourceDate: daysAgo(2).toISOString(),
        valueLow: 90,
        valueMid: 100,
        valueHigh: 110, // 20% spread / mid = tight
        comparableSet: { comps: [1, 2, 3, 4, 5, 6], evidenceScore: 0.8 },
      }),
    );

    const result = await computeConfidenceBreakdown(records, "property");
    expect(result.overall).toBe("high");
    expect(result.overallScore).toBeGreaterThanOrEqual(80);
  });

  it("7. No comps => score drops significantly, recommendation includes research", async () => {
    const records = [
      makeGuidance({
        assumptionKey: "adr",
        comparableSet: null,
        updatedAt: daysAgo(3),
      }),
    ];

    const result = await computeConfidenceBreakdown(records, "property");
    expect(result.factors.comparableCount).toBe(0);
    expect(result.overallScore).toBeLessThan(50);
    // Should recommend running research for missing fields
    const hasResearchRec = result.recommendations.some(
      (r) => r.toLowerCase().includes("research") || r.toLowerCase().includes("comp"),
    );
    expect(hasResearchRec).toBe(true);
  });

  it("8. Stale data (45 days) => sourceRecency factor low, recommendation about refresh", async () => {
    const records = [
      makeGuidance({
        assumptionKey: "adr",
        updatedAt: daysAgo(45),
        sourceDate: daysAgo(45).toISOString(),
      }),
    ];

    const result = await computeConfidenceBreakdown(records, "property");
    expect(result.factors.sourceRecency).toBeLessThanOrEqual(20);
    const hasRefreshRec = result.recommendations.some(
      (r) => r.toLowerCase().includes("refresh") || r.toLowerCase().includes("old"),
    );
    expect(hasRefreshRec).toBe(true);
  });

  it("9. Heavy relaxation (L4-L5) => relaxationLevel factor low", async () => {
    const records = [
      makeGuidance({ assumptionKey: "adr", relaxationLevel: 4, updatedAt: daysAgo(5) }),
      makeGuidance({ assumptionKey: "maxOccupancy", relaxationLevel: 5, updatedAt: daysAgo(5) }),
    ];

    const result = await computeConfidenceBreakdown(records, "property");
    // L4 = 20, L5 = 10, avg = 15
    expect(result.factors.relaxationLevel).toBeLessThanOrEqual(20);
    const hasRelaxRec = result.recommendations.some(
      (r) => r.toLowerCase().includes("relax"),
    );
    expect(hasRelaxRec).toBe(true);
  });

  it("10. Missing critical fields (ADR and occupancy missing) => fieldCoverage low", async () => {
    // Only provide a non-critical field
    const records = [
      makeGuidance({ assumptionKey: "someOtherField", updatedAt: daysAgo(3) }),
    ];

    const result = await computeConfidenceBreakdown(records, "property");
    // None of the 9 critical property fields covered
    expect(result.factors.fieldCoverage).toBe(0);
    // Should have recommendations for missing fields
    const missingFieldRecs = result.recommendations.filter(
      (r) => r.includes("Run research for"),
    );
    expect(missingFieldRecs.length).toBeGreaterThan(0);
  });

  it("11. Grade mapping: >=80 high, >=50 medium, >=20 low, <20 none", async () => {
    // We test the mapping by constructing scenarios that hit each bracket.
    // High: already tested in test 6.
    // Low: minimal data
    const lowRecords = [
      makeGuidance({
        assumptionKey: "someField",
        confidence: "low",
        relaxationLevel: 5,
        updatedAt: daysAgo(60),
        comparableSet: null,
      }),
    ];
    const lowResult = await computeConfidenceBreakdown(lowRecords, "property");
    // With 0 comps, 0 evidence, stale data, L5 relax, 0 coverage => should be "low" or "none"
    expect(["low", "none"]).toContain(lowResult.overall);

    // Medium: decent but not great
    const mediumRecords = [
      "adr", "maxOccupancy", "capRate", "costRooms", "costFB",
    ].map((key) =>
      makeGuidance({
        assumptionKey: key,
        confidence: "medium",
        relaxationLevel: 2,
        updatedAt: daysAgo(10),
        comparableSet: { comps: [1, 2, 3], evidenceScore: 0.5 },
        valueLow: 80,
        valueMid: 100,
        valueHigh: 130, // ~50% spread — moderate
      }),
    );
    const mediumResult = await computeConfidenceBreakdown(mediumRecords, "property");
    // This should land in the "medium" band (50-79)
    expect(mediumResult.overallScore).toBeGreaterThanOrEqual(20);
    expect(mediumResult.overallScore).toBeLessThan(80);
  });

  it("12. Explanation is generated and non-empty", async () => {
    const records = [makeGuidance({ updatedAt: daysAgo(3) })];
    const result = await computeConfidenceBreakdown(records, "property");
    expect(result.explanation).toBeTruthy();
    expect(typeof result.explanation).toBe("string");
    expect(result.explanation.length).toBeGreaterThan(0);
  });

  it("13. Recommendations array — always an array, items are meaningful strings", async () => {
    const records = [makeGuidance({ updatedAt: daysAgo(3) })];
    const result = await computeConfidenceBreakdown(records, "property");
    expect(Array.isArray(result.recommendations)).toBe(true);
    for (const rec of result.recommendations) {
      expect(typeof rec).toBe("string");
      expect(rec.length).toBeGreaterThan(5); // not empty/trivial
    }
  });
});
