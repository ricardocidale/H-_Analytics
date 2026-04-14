/**
 * Tests for server/ai/research-data-injector.ts — formats verified API data
 * for LLM prompt injection.
 *
 * Tests cover:
 * - buildVerifiedDataBlock separation of verified vs unverified
 * - Grouping by relaxation level
 * - buildPromptInjectionBlock output formatting
 * - Confidence badges, currency/percentage formatting
 * - Edge cases (empty results, all verified, all unverified)
 */
import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — same pattern as other ai/ tests
// ---------------------------------------------------------------------------

vi.mock("../../server/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../server/storage", () => ({
  storage: {
    getIntegrationEnabledMap: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("@shared/countryDefaults", () => ({
  getCountryDefaults: vi.fn().mockReturnValue(null),
}));

vi.mock("../../shared/regulatory-data", () => ({
  getRegulatoryProfile: vi.fn().mockReturnValue(null),
}));

// Mock all service constructors (needed because data-routing.ts is imported transitively).
// Must use `function` keyword for constructors, not arrow functions.
vi.mock("../../server/services/AmadeusService", () => ({
  AmadeusService: function(this: any) { this.isAvailable = () => false; },
}));
vi.mock("../../server/services/CoStarService", () => ({
  CoStarService: function(this: any) { this.isAvailable = () => false; },
}));
vi.mock("../../server/services/HospitalityBenchmarkService", () => ({
  HospitalityBenchmarkService: function(this: any) { this.isAvailable = () => false; },
}));
vi.mock("../../server/services/FREDService", () => ({
  FREDService: function(this: any) { this.isAvailable = () => false; },
}));
vi.mock("../../server/services/GroundedResearchService", () => ({
  GroundedResearchService: function(this: any) { this.isAvailable = () => false; },
}));
vi.mock("../../server/services/XoteloService", () => ({
  XoteloService: function(this: any) { this.isAvailable = () => false; },
}));
vi.mock("../../server/services/ApifyService", () => ({
  ApifyService: function(this: any) { this.isAvailable = () => false; },
}));
vi.mock("../../server/services/RapidApiHospitalityService", () => ({
  RapidApiHospitalityService: function(this: any) { this.isAvailable = () => false; },
}));
vi.mock("../../server/services/WeatherService", () => ({
  WeatherService: function(this: any) { this.isAvailable = () => false; },
}));
vi.mock("../../server/services/WorldBankService", () => ({
  WorldBankService: function(this: any) { this.isAvailable = () => false; },
}));
vi.mock("../../server/services/AlphaVantageService", () => ({
  AlphaVantageService: function(this: any) { this.isAvailable = () => false; },
}));
vi.mock("../../server/services/WalkScoreService", () => ({
  WalkScoreService: function(this: any) { this.isAvailable = () => false; },
}));
vi.mock("../../server/services/RealtyService", () => ({
  RealtyService: function(this: any) { this.isAvailable = () => false; },
}));
vi.mock("../../server/services/USRealEstateService", () => ({
  USRealEstateService: function(this: any) { this.isAvailable = () => false; },
}));

// ---------------------------------------------------------------------------
// Import module under test AFTER mocks
// ---------------------------------------------------------------------------
import {
  buildVerifiedDataBlock,
  buildPromptInjectionBlock,
} from "../../server/ai/research-data-injector";
import type { DataRouteResult } from "../../server/ai/data-routing";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResult(overrides: Partial<DataRouteResult> = {}): DataRouteResult {
  return {
    field: "startAdr",
    value: 285,
    source: "amadeus",
    relaxationLevel: 0,
    confidence: "high",
    provenance: "Amadeus Live Hotels, Medellín, L0",
    fetchedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeResultMap(results: DataRouteResult[]): Map<string, DataRouteResult> {
  const map = new Map<string, DataRouteResult>();
  for (const r of results) {
    map.set(r.field, r);
  }
  return map;
}

// ═══════════════════════════════════════════════════════════════════════════
// buildVerifiedDataBlock
// ═══════════════════════════════════════════════════════════════════════════

describe("buildVerifiedDataBlock", () => {
  // Test 23: Separates verified from unverified
  it("separates verified (has value) from unverified (null value or missing)", () => {
    const results = makeResultMap([
      makeResult({ field: "startAdr", value: 285 }),
      makeResult({ field: "startOccupancy", value: 0.72 }),
      makeResult({ field: "exitCapRate", value: 7.5 }),
      makeResult({ field: "walkScore", value: null }),          // null value = unverified
      // "taxRate" not in the map at all = unverified
    ]);

    const block = buildVerifiedDataBlock(results, [
      "startAdr", "startOccupancy", "exitCapRate", "walkScore", "taxRate",
    ]);

    expect(block.verifiedCount).toBe(3);
    expect(block.unverifiedFields).toContain("walkScore");
    expect(block.unverifiedFields).toContain("taxRate");
    expect(block.unverifiedFields.length).toBe(2);
  });

  // Test 24: Groups verified results by relaxation level
  it("groups verified results by relaxation level in output", () => {
    const results = makeResultMap([
      makeResult({ field: "startAdr", value: 285, relaxationLevel: 0, confidence: "high" }),
      makeResult({ field: "taxRate", value: 0.35, relaxationLevel: 0, confidence: "high" }),
      makeResult({ field: "exitCapRate", value: 8.0, relaxationLevel: 3, confidence: "medium" }),
    ]);

    const block = buildVerifiedDataBlock(results, ["startAdr", "taxRate", "exitCapRate"]);

    // The verified text should contain level headers
    expect(block.verified).toContain("L0");
    expect(block.verified).toContain("L3");
  });

  // Test 25: Unverified list includes human-readable field names
  it("unverified list includes human-readable field names", () => {
    const results = makeResultMap([]); // empty — all fields unverified

    const block = buildVerifiedDataBlock(results, ["startAdr", "exitCapRate"]);

    expect(block.unverifiedFields).toContain("startAdr");
    expect(block.unverifiedFields).toContain("exitCapRate");
    // The unverified block text should have human-readable labels
    expect(block.unverifiedBlock).toContain("Average Daily Rate");
    expect(block.unverifiedBlock).toContain("Exit Cap Rate");
  });

  // Test 26: Summary statistics
  it("computes correct summary statistics", () => {
    const results = makeResultMap([
      makeResult({ field: "startAdr", value: 285, relaxationLevel: 0, confidence: "high" }),
      makeResult({ field: "startOccupancy", value: 0.72, relaxationLevel: 0, confidence: "high" }),
      makeResult({ field: "exitCapRate", value: 8.0, relaxationLevel: 3, confidence: "medium" }),
      makeResult({ field: "taxRate", value: 0.35, relaxationLevel: 5, confidence: "low" }),
    ]);

    const block = buildVerifiedDataBlock(results, [
      "startAdr", "startOccupancy", "exitCapRate", "taxRate", "walkScore",
    ]);

    expect(block.summary.highConfidence).toBe(2);
    expect(block.summary.mediumConfidence).toBe(1);
    expect(block.summary.lowConfidence).toBe(1);
    expect(block.totalFields).toBe(5);
    expect(block.verifiedCount).toBe(4);
    // avgRelaxationLevel = (0 + 0 + 3 + 5) / 4 = 2.0
    expect(block.summary.avgRelaxationLevel).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// buildPromptInjectionBlock
// ═══════════════════════════════════════════════════════════════════════════

describe("buildPromptInjectionBlock", () => {
  // Test 27: Produces non-empty string with mixed results
  it("produces non-empty string with mixed verified/unverified results", () => {
    const results = makeResultMap([
      makeResult({ field: "startAdr", value: 285 }),
    ]);

    const output = buildPromptInjectionBlock(results, ["startAdr", "taxRate"]);

    expect(output.length).toBeGreaterThan(0);
  });

  // Test 28: Includes VERIFIED DATA header
  it("includes VERIFIED DATA header", () => {
    const results = makeResultMap([
      makeResult({ field: "startAdr", value: 285 }),
    ]);

    const output = buildPromptInjectionBlock(results, ["startAdr"]);

    expect(output).toContain("VERIFIED DATA");
  });

  // Test 29: Includes UNVERIFIED section for missing fields
  it("includes UNVERIFIED section for fields without data", () => {
    const results = makeResultMap([
      makeResult({ field: "startAdr", value: 285 }),
    ]);

    const output = buildPromptInjectionBlock(results, [
      "startAdr", "taxRate", "exitCapRate",
    ]);

    expect(output).toContain("UNVERIFIED");
    expect(output).toContain("LLM research needed");
  });

  // Test 30: Includes synthesis instructions
  it("includes synthesis instructions for LLM", () => {
    const results = makeResultMap([
      makeResult({ field: "startAdr", value: 285 }),
    ]);

    const output = buildPromptInjectionBlock(results, ["startAdr", "taxRate"]);

    expect(output).toContain("SYNTHESIS INSTRUCTIONS");
    expect(output).toContain("anchor");
  });

  // Test 31: Empty results produce empty string
  it("empty results with no requested fields produce empty string", () => {
    const results = makeResultMap([]);
    const output = buildPromptInjectionBlock(results, []);

    expect(output).toBe("");
  });

  // Test 32: Confidence badges appear in output
  it("confidence badges appear in output for verified data", () => {
    const results = makeResultMap([
      makeResult({ field: "startAdr", value: 285, confidence: "high" }),
      makeResult({ field: "exitCapRate", value: 8.0, confidence: "medium" }),
      makeResult({ field: "taxRate", value: 0.35, confidence: "low" }),
    ]);

    const output = buildPromptInjectionBlock(results, [
      "startAdr", "exitCapRate", "taxRate",
    ]);

    expect(output).toContain("[HIGH CONF]");
    expect(output).toContain("[MED CONF]");
    expect(output).toContain("[LOW CONF]");
  });

  // Test 33: Currency values formatted with dollar sign
  it("currency values are formatted with dollar sign", () => {
    const results = makeResultMap([
      makeResult({
        field: "startAdr",
        value: 285,
        range: { low: 242, mid: 285, high: 328 },
        confidence: "high",
      }),
    ]);

    const output = buildPromptInjectionBlock(results, ["startAdr"]);

    expect(output).toContain("$");
    expect(output).toContain("285");
  });

  // Test 34: Percentage values formatted with percent sign
  it("percentage values are formatted with percent sign", () => {
    const results = makeResultMap([
      makeResult({
        field: "startOccupancy",
        value: 0.72,
        confidence: "high",
      }),
    ]);

    const output = buildPromptInjectionBlock(results, ["startOccupancy"]);

    // 0.72 should be displayed as 72.0% (decimal form * 100)
    expect(output).toContain("%");
    expect(output).toContain("72");
  });

  // Test 35: Range values in prompt output
  it("range values include low, mid, and high in output", () => {
    const results = makeResultMap([
      makeResult({
        field: "startAdr",
        value: 285,
        range: { low: 242, mid: 285, high: 328 },
        confidence: "high",
      }),
    ]);

    const output = buildPromptInjectionBlock(results, ["startAdr"]);

    expect(output).toContain("242");
    expect(output).toContain("285");
    expect(output).toContain("328");
  });

  // Test 36: Provenance/source appears in output
  it("provenance from source appears in verified data block", () => {
    const results = makeResultMap([
      makeResult({
        field: "startAdr",
        value: 285,
        provenance: "Amadeus Live Hotels, Medellín, L0",
      }),
    ]);

    const output = buildPromptInjectionBlock(results, ["startAdr"]);

    expect(output).toContain("Amadeus Live Hotels");
    expect(output).toContain("Source:");
  });

  // Test 37: All fields unverified — no VERIFIED header, only UNVERIFIED
  it("all unverified fields produce UNVERIFIED block but no VERIFIED block", () => {
    const results = makeResultMap([]);

    const output = buildPromptInjectionBlock(results, ["startAdr", "taxRate"]);

    expect(output).toContain("UNVERIFIED");
    expect(output).not.toContain("=== VERIFIED DATA");
  });

  // Test 38: All fields verified — VERIFIED header, no UNVERIFIED block
  it("all verified fields produce VERIFIED block but no UNVERIFIED block", () => {
    const results = makeResultMap([
      makeResult({ field: "startAdr", value: 285 }),
      makeResult({ field: "taxRate", value: 0.35 }),
    ]);

    const output = buildPromptInjectionBlock(results, ["startAdr", "taxRate"]);

    expect(output).toContain("VERIFIED DATA");
    expect(output).not.toContain("UNVERIFIED FIELDS");
  });

  // Test 39: Uses all DATA_ROUTING_TABLE fields when requestedFields not provided
  it("uses all DATA_ROUTING_TABLE fields when requestedFields is not provided", () => {
    const results = makeResultMap([
      makeResult({ field: "startAdr", value: 285 }),
    ]);

    // Don't pass requestedFields — should default to all routing table fields
    const block = buildVerifiedDataBlock(results);

    // Should have many unverified fields (all except startAdr)
    expect(block.unverifiedFields.length).toBeGreaterThan(15);
    expect(block.verifiedCount).toBe(1);
  });
});
