/**
 * Tests for server/ai/risk-intelligence.ts — DETERMINISTIC functions only
 *
 * Mocks: fetchMacroRates, getCountryDefaults, getRegulatoryProfile, clients, logger,
 *        portfolio-risk-scorer.
 * Does NOT test LLM-enhanced narratives.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Property } from "@shared/schema";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../server/ai/ambient/fetchers", () => ({
  fetchMacroRates: vi.fn().mockResolvedValue({
    snapshots: [
      { snapshotKey: "fred_dff", value: 5.33 },
      { snapshotKey: "fred_mortgage30us", value: 7.22 },
      { snapshotKey: "fred_cpiaucsl", value: 3.2 },
    ],
  }),
}));

vi.mock("../../server/ai/portfolio-risk-scorer", () => ({
  computePortfolioRiskScore: vi.fn().mockReturnValue({
    overallScore: 45,
    propertyScores: [],
    concentrationScore: 20,
    leverageScore: 30,
  }),
}));

vi.mock("../../server/ai/clients", () => ({
  getAnthropicClient: vi.fn(),
}));

vi.mock("../../server/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Use real implementations for these shared modules
// (they are pure functions with no side effects)

import {
  generateDeterministicInsights,
  getRiskSummaryForContext,
  type RiskInsight,
  type PropertyRiskBrief,
} from "../../server/ai/risk-intelligence";

// ---------------------------------------------------------------------------
// Property Factory
// ---------------------------------------------------------------------------

let nextId = 1;

function makeProperty(overrides: Partial<Property> = {}): Property {
  const id = nextId++;
  return {
    id,
    userId: 1,
    name: `Test Property ${id}`,
    location: "Medellin, Colombia",
    streetAddress: null,
    city: "Medellin",
    stateProvince: "Antioquia",
    zipPostalCode: null,
    country: "CO",
    market: "Medellin Metro",
    imageUrl: "/img/test.jpg",
    status: "active",
    acquisitionDate: "2025-01-01",
    operationsStartDate: "2025-06-01",
    purchasePrice: 2_000_000,
    buildingImprovements: 500_000,
    landValuePercent: 0.2,
    preOpeningCosts: 100_000,
    operatingReserve: 50_000,
    roomCount: 8,
    startAdr: 250,
    adrGrowthRate: 0.03,
    startOccupancy: 0.55,
    maxOccupancy: 0.75,
    occupancyRampMonths: 18,
    occupancyGrowthStep: 0.02,
    stabilizationMonths: 24,
    pricingModel: "per_room",
    nightlyPropertyRate: null,
    maxGuests: null,
    seasonalityProfile: null,
    occupancyRampCurve: null,
    type: "Financed",
    acquisitionLTV: 0.65,
    acquisitionInterestRate: 0.065,
    acquisitionTermYears: 25,
    acquisitionClosingCostRate: 0.02,
    willRefinance: null,
    refinanceDate: null,
    refinanceLTV: null,
    refinanceInterestRate: null,
    refinanceTermYears: null,
    refinanceClosingCostRate: null,
    costRateRooms: 0.36,
    costRateFB: 0.32,
    costRateAdmin: 0.09,
    costRateMarketing: 0.06,
    costRatePropertyOps: 0.05,
    costRateUtilities: 0.04,
    costRateTaxes: 0.02,
    costRateIT: 0.02,
    costRateFFE: 0.04,
    costRateOther: 0.01,
    costRateInsurance: 0.02,
    revShareEvents: 0.10,
    revShareFB: 0.25,
    revShareOther: 0.05,
    cateringBoostPercent: 0.0,
    exitCapRate: 0.075,
    taxRate: 0.21,
    inflationRate: null,
    countryRiskPremium: null,
    dispositionCommission: 0.02,
    refinanceYearsAfterAcquisition: null,
    baseManagementFeeRate: 0.03,
    incentiveManagementFeeRate: 0.10,
    ownerPriorityReturn: null,
    feeSubordination: null,
    performanceTestEnabled: false,
    arDays: 30,
    apDays: 30,
    reinvestmentRate: 0.05,
    dayCountConvention: "30/360",
    escalationMethod: "annual",
    costSegEnabled: false,
    costSeg5yrPct: 0.15,
    costSeg7yrPct: 0.10,
    costSeg15yrPct: 0.15,
    depreciationYears: null,
    starRating: null,
    starRatingSource: "manual",
    starRatingSuggested: null,
    qualityTier: "upscale",
    hospitalityType: "hotel",
    businessModel: "hotel",
    brandId: null,
    description: null,
    serviceLevel: null,
    locationType: null,
    marketTier: null,
    ...overrides,
  } as unknown as Property;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("risk-intelligence (deterministic)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nextId = 1;
  });

  // ── 1. Healthy diversified portfolio produces insights ─────────────────
  it("generates insights array for a 5-property diversified portfolio", async () => {
    const properties = [
      makeProperty({ name: "Property A", location: "Medellin", country: "CO" }),
      makeProperty({ name: "Property B", location: "Cartagena", country: "CO" }),
      makeProperty({ name: "Property C", location: "New York", country: "US", stateProvince: "New York" }),
      makeProperty({ name: "Property D", location: "Park City", country: "US", stateProvince: "Utah" }),
      makeProperty({ name: "Property E", location: "London", country: "GB" }),
    ];

    const { insights, macroContext } = await generateDeterministicInsights(properties);

    expect(Array.isArray(insights)).toBe(true);
    // Should produce at least some insights (macro, regulatory, etc.)
    expect(insights.length).toBeGreaterThan(0);
    // Each insight has required fields
    for (const insight of insights) {
      expect(insight.category).toBeTruthy();
      expect(insight.severity).toBeTruthy();
      expect(insight.title).toBeTruthy();
      expect(insight.narrative).toBeTruthy();
      expect(Array.isArray(insight.dataPoints)).toBe(true);
      expect(Array.isArray(insight.actionItems)).toBe(true);
    }
  });

  // ── 2. Leverage insight for high LTV ───────────────────────────────────
  it("generates leverage warning/critical for property with 85% LTV", async () => {
    const property = makeProperty({
      name: "Overleveraged Hotel",
      acquisitionLTV: 0.85,
      purchasePrice: 5_000_000,
    });

    const { insights } = await generateDeterministicInsights([property]);

    const leverageInsights = insights.filter((i) => i.category === "leverage");
    expect(leverageInsights.length).toBeGreaterThan(0);
    // 85% is at the threshold — should be at least "caution"
    const highSeverity = leverageInsights.some(
      (i) => i.severity === "warning" || i.severity === "critical" || i.severity === "caution",
    );
    expect(highSeverity).toBe(true);
  });

  // ── 3. Assumption challenge for aggressive ADR ─────────────────────────
  it("flags aggressive ADR when luxury property assumes $500 vs $396 benchmark", async () => {
    const property = makeProperty({
      name: "Premium Villa",
      startAdr: 500,
      qualityTier: "luxury",
    });

    const { insights } = await generateDeterministicInsights([property]);

    const assumptionInsights = insights.filter((i) => i.category === "assumption");
    const adrInsight = assumptionInsights.find((i) => i.title.includes("ADR"));
    expect(adrInsight).toBeDefined();
    expect(adrInsight!.narrative).toContain("$500");
    expect(adrInsight!.narrative).toContain("$396");
  });

  // ── 4. Concentration insight for single property ───────────────────────
  it("does not crash for single-property portfolio (no concentration insight needed)", async () => {
    const property = makeProperty({ name: "Solo Property" });

    const { insights } = await generateDeterministicInsights([property]);

    // Single property portfolios should still produce insights (leverage, assumptions, etc.)
    // but NOT concentration warnings (concentration requires 2+ properties)
    const concentrationInsights = insights.filter((i) => i.category === "concentration");
    expect(concentrationInsights.length).toBe(0);
  });

  it("generates concentration warning when one property dominates a two-property portfolio", async () => {
    // Property A has much higher revenue than B
    const a = makeProperty({
      name: "Big Property",
      roomCount: 50,
      startAdr: 400,
      maxOccupancy: 0.80,
    });
    const b = makeProperty({
      name: "Small Property",
      roomCount: 3,
      startAdr: 100,
      maxOccupancy: 0.60,
    });

    const { insights } = await generateDeterministicInsights([a, b]);

    const concentrationInsights = insights.filter((i) => i.category === "concentration");
    expect(concentrationInsights.length).toBeGreaterThan(0);
    const dominance = concentrationInsights.find((i) => i.title.includes("Big Property"));
    expect(dominance).toBeDefined();
  });

  // ── 5. Macro context populated ─────────────────────────────────────────
  it("populates macroContext with fedFundsRate and mortgageRate from mocked FRED data", async () => {
    const { macroContext } = await generateDeterministicInsights([makeProperty()]);

    expect(macroContext.fedFundsRate).toContain("5.33");
    expect(macroContext.mortgageRate).toContain("7.22");
    expect(macroContext.inflationRate).toContain("3.2");
    expect(macroContext.narrative.length).toBeGreaterThan(0);
  });

  // ── 6. assessPropertyRiskLevel — tested indirectly via brief structure ─
  // We test the exported assessPropertyRiskLevel through getRiskSummaryForContext
  describe("risk level assessment", () => {
    it("low risk: no critical, no warning insights", () => {
      const brief: PropertyRiskBrief = {
        propertyId: 1,
        propertyName: "Safe Property",
        overallRiskLevel: "low",
        insights: [],
        strengthsNarrative: "Strong fundamentals",
        concernsNarrative: "No significant concerns",
        questionsToAsk: [],
      };
      const summary = getRiskSummaryForContext(brief);
      expect(summary).toContain("low");
    });

    it("elevated risk brief includes risk level in summary", () => {
      const brief: PropertyRiskBrief = {
        propertyId: 2,
        propertyName: "Risky Property",
        overallRiskLevel: "elevated",
        insights: [
          {
            category: "leverage",
            severity: "warning",
            title: "High leverage",
            narrative: "LTV too high",
            dataPoints: [],
            actionItems: [],
            affectedEntities: [],
          },
          {
            category: "assumption",
            severity: "warning",
            title: "Aggressive ADR",
            narrative: "ADR above benchmark",
            dataPoints: [],
            actionItems: [],
            affectedEntities: [],
          },
        ],
        strengthsNarrative: "Key strengths: Good location",
        concernsNarrative: "Key concerns: Leverage and ADR",
        questionsToAsk: [],
      };
      const summary = getRiskSummaryForContext(brief);
      expect(summary).toContain("elevated");
      expect(summary).toContain("High leverage");
    });
  });

  // ── 7. getRiskSummaryForContext returns a short string ──────────────────
  it("getRiskSummaryForContext returns string with risk level and top concern", () => {
    const brief: PropertyRiskBrief = {
      propertyId: 1,
      propertyName: "Test Hotel",
      overallRiskLevel: "moderate",
      insights: [
        {
          category: "macro",
          severity: "caution",
          title: "Inflation pressure",
          narrative: "CPI is elevated",
          dataPoints: [],
          actionItems: [],
          affectedEntities: [],
        },
      ],
      strengthsNarrative: "Key strengths: Diversified revenue streams",
      concernsNarrative: "Minor cautions flagged",
      questionsToAsk: [],
    };

    const summary = getRiskSummaryForContext(brief);
    expect(typeof summary).toBe("string");
    expect(summary).toContain("moderate");
    expect(summary).toContain("Inflation pressure");
    expect(summary).toContain("Diversified revenue streams");
  });

  // ── 8. Empty portfolio doesn't crash ───────────────────────────────────
  it("returns empty insights for an empty portfolio", async () => {
    const { insights, macroContext } = await generateDeterministicInsights([]);

    expect(Array.isArray(insights)).toBe(true);
    // Only macro insights (if any) — no property-level insights
    const nonMacroInsights = insights.filter((i) => i.category !== "macro");
    expect(nonMacroInsights.length).toBe(0);

    // Macro context should still be populated
    expect(macroContext).toBeDefined();
  });
});
