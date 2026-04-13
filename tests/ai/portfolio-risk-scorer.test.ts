/**
 * Tests for server/ai/portfolio-risk-scorer.ts
 *
 * computePortfolioRiskScore is a pure function taking Property[] —
 * no mocking required.
 */
import { describe, it, expect } from "vitest";
import { computePortfolioRiskScore } from "../../server/ai/portfolio-risk-scorer";
import type { Property } from "@shared/schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let idSeq = 1;

/**
 * Build a minimal mock Property with sensible defaults.
 * Only the fields consumed by portfolio-risk-scorer are required.
 */
function makeProperty(overrides: Partial<Property> = {}): Property {
  const id = idSeq++;
  return {
    id,
    userId: 1,
    name: `Property ${id}`,
    location: "Test Location",
    streetAddress: null,
    city: "Test City",
    stateProvince: null,
    zipPostalCode: null,
    country: "United States",
    market: "New York",
    imageUrl: "https://example.com/img.jpg",
    status: "active",
    acquisitionDate: "2025-01-01",
    operationsStartDate: "2025-06-01",
    purchasePrice: 2_000_000,
    buildingImprovements: 500_000,
    landValuePercent: 0.20,
    roomCount: 10,
    startAdr: 300,
    maxOccupancy: 0.75,
    pricingModel: "per_room",
    nightlyPropertyRate: null,
    acquisitionLTV: 0.65,
    acquisitionInterestRate: 0.065,
    acquisitionTermYears: 25,
    costRateRooms: 0.12,
    costRateFB: 0.10,
    costRateAdmin: 0.05,
    costRateMarketing: 0.04,
    costRatePropertyOps: 0.04,
    costRateUtilities: 0.03,
    costRateTaxes: 0.012,
    costRateIT: 0.02,
    costRateFFE: 0.03,
    costRateOther: 0.01,
    costRateInsurance: 0.01,
    revShareFB: 0.40,
    revShareEvents: 0.10,
    revShareOther: 0.05,
    exitCapRate: 0.07,
    qualityTier: "upscale",
    yearBuilt: 2015,
    lastRenovationYear: 2022,
    isActive: true,
    // Fields not consumed by the scorer — provide safe defaults
    ...({} as any),
    ...overrides,
  } as Property;
}

// Reset id sequence before each suite
beforeEach(() => {
  idSeq = 1;
});

import { beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("computePortfolioRiskScore", () => {
  it("1. Single property portfolio => high concentration risk (HHI = 1.0), small-portfolio penalty", () => {
    const report = computePortfolioRiskScore([makeProperty()]);
    expect(report.concentrationRisk.herfindahlIndex).toBe(1);
    expect(report.concentrationRisk.propertyCount).toBe(1);
    // Single property: score starts at 20 (HHI > 0.40), then -20 (top > 50%), -15 (count < 3)
    expect(report.concentrationRisk.score).toBeLessThanOrEqual(20);
    // Single geography penalty
    expect(report.geographicRisk.countriesCount).toBe(1);
  });

  it("2. 5 diversified properties — different countries, different tiers => good scores", () => {
    const props = [
      makeProperty({ country: "United States", market: "New York", qualityTier: "luxury", startAdr: 500, roomCount: 10 }),
      makeProperty({ country: "Colombia", market: "Medellin", qualityTier: "upscale", startAdr: 250, roomCount: 8 }),
      makeProperty({ country: "France", market: "Paris", qualityTier: "upper_upscale", startAdr: 400, roomCount: 12 }),
      makeProperty({ country: "Mexico", market: "Tulum", qualityTier: "upper_midscale", startAdr: 200, roomCount: 10 }),
      makeProperty({ country: "United Kingdom", market: "London", qualityTier: "luxury", startAdr: 600, roomCount: 8 }),
    ];
    const report = computePortfolioRiskScore(props);

    expect(report.geographicRisk.countriesCount).toBe(5);
    expect(report.geographicRisk.score).toBeGreaterThanOrEqual(50);
    expect(report.concentrationRisk.herfindahlIndex).toBeLessThan(0.30);
    expect(report.marketTierRisk.score).toBeGreaterThanOrEqual(65); // 4 distinct tiers
  });

  it("3. All luxury, one country => tier concentration + single geography", () => {
    const props = [
      makeProperty({ country: "United States", qualityTier: "luxury", market: "NYC" }),
      makeProperty({ country: "United States", qualityTier: "luxury", market: "LA" }),
      makeProperty({ country: "United States", qualityTier: "luxury", market: "Miami" }),
      makeProperty({ country: "United States", qualityTier: "luxury", market: "Chicago" }),
    ];
    const report = computePortfolioRiskScore(props);

    // All luxury: single tier => base 40, then -10 for luxury > 70%
    expect(report.marketTierRisk.score).toBeLessThanOrEqual(40);
    // Single country
    expect(report.geographicRisk.countriesCount).toBe(1);
    expect(report.geographicRisk.score).toBeLessThanOrEqual(25);
    // Should flag luxury concentration
    const luxuryFinding = report.marketTierRisk.findings.some(
      (f) => f.toLowerCase().includes("luxury"),
    );
    expect(luxuryFinding).toBe(true);
  });

  it("4. High leverage portfolio (LTV 80%) => financial risk elevated", () => {
    const props = [
      makeProperty({ acquisitionLTV: 0.80, name: "Prop A" }),
      makeProperty({ acquisitionLTV: 0.85, name: "Prop B" }),
      makeProperty({ acquisitionLTV: 0.80, name: "Prop C" }),
    ];
    const report = computePortfolioRiskScore(props);

    expect(report.financialRisk.averageLTV).toBeGreaterThanOrEqual(0.80);
    // LTV > 0.75 => ltvScore = 40, but DSCR may still be decent; score < 80
    expect(report.financialRisk.score).toBeLessThanOrEqual(75);
    const leverageFinding = report.financialRisk.findings.some(
      (f) => f.toLowerCase().includes("ltv") || f.toLowerCase().includes("leverage"),
    );
    expect(leverageFinding).toBe(true);
  });

  it("5. All equity portfolio (no debt) => financial risk score excellent", () => {
    const props = [
      makeProperty({ acquisitionLTV: 0, acquisitionInterestRate: 0 }),
      makeProperty({ acquisitionLTV: 0, acquisitionInterestRate: 0 }),
      makeProperty({ acquisitionLTV: 0, acquisitionInterestRate: 0 }),
    ];
    const report = computePortfolioRiskScore(props);

    expect(report.financialRisk.averageLTV).toBe(0);
    // LTV = 0 => ltvScore = 100, DSCR = 99 => dscrScore = 100, avg = 100
    expect(report.financialRisk.score).toBeGreaterThanOrEqual(80);
  });

  it("6. Mixed leverage — blended score between high and no debt", () => {
    const props = [
      makeProperty({ acquisitionLTV: 0 }),
      makeProperty({ acquisitionLTV: 0.70 }),
      makeProperty({ acquisitionLTV: 0.50 }),
    ];
    const report = computePortfolioRiskScore(props);

    // Average LTV = ~0.40 => < 0.60 => ltvScore = 100
    expect(report.financialRisk.averageLTV).toBeCloseTo(0.40, 1);
    expect(report.financialRisk.score).toBeGreaterThanOrEqual(50);
  });

  it("7. Grade assignment — A >= 80, B >= 65, C >= 50, D >= 35, F < 35", () => {
    // Build a portfolio that should produce a known grade range.
    // Well-diversified, low leverage, good occupancy => should be A or B
    const goodProps = [
      makeProperty({ country: "United States", qualityTier: "luxury", acquisitionLTV: 0, market: "NYC" }),
      makeProperty({ country: "Colombia", qualityTier: "upscale", acquisitionLTV: 0, market: "Medellin" }),
      makeProperty({ country: "France", qualityTier: "upper_upscale", acquisitionLTV: 0, market: "Paris" }),
      makeProperty({ country: "Mexico", qualityTier: "midscale", acquisitionLTV: 0, market: "Tulum" }),
      makeProperty({ country: "United Kingdom", qualityTier: "upper_midscale", acquisitionLTV: 0, market: "London" }),
    ];
    const goodReport = computePortfolioRiskScore(goodProps);
    expect(["A", "B"]).toContain(goodReport.riskGrade);

    // Single, high-leverage, single-country, single-tier => should be D or F
    const badProps = [
      makeProperty({ acquisitionLTV: 0.90, country: "Colombia", qualityTier: "economy", maxOccupancy: 0.40 }),
    ];
    const badReport = computePortfolioRiskScore(badProps);
    expect(["D", "F"]).toContain(badReport.riskGrade);
  });

  it("8. Recommendations — single-country should recommend geographic diversification", () => {
    const props = [
      makeProperty({ country: "Colombia", market: "Medellin" }),
      makeProperty({ country: "Colombia", market: "Cartagena" }),
    ];
    const report = computePortfolioRiskScore(props);

    const geoRec = report.recommendations.some(
      (r) => r.toLowerCase().includes("countr") || r.toLowerCase().includes("geographic"),
    );
    expect(geoRec).toBe(true);
  });

  it("9. Empty portfolio => should handle gracefully (not crash)", () => {
    const report = computePortfolioRiskScore([]);

    expect(report.overallScore).toBe(0);
    expect(report.riskGrade).toBe("F");
    expect(report.concentrationRisk.propertyCount).toBe(0);
    expect(report.geographicRisk.countriesCount).toBe(0);
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  it("10. HHI calculation — 2 props 50/50 => HHI = 0.50, 3 props 33/33/33 => HHI ~ 0.33", () => {
    // Two identical properties => each gets 50% revenue => HHI = 0.25 + 0.25 = 0.50
    const twoEqual = [
      makeProperty({ roomCount: 10, startAdr: 300, maxOccupancy: 0.75 }),
      makeProperty({ roomCount: 10, startAdr: 300, maxOccupancy: 0.75 }),
    ];
    const twoReport = computePortfolioRiskScore(twoEqual);
    expect(twoReport.concentrationRisk.herfindahlIndex).toBeCloseTo(0.50, 2);

    // Three identical properties => each 33.3% => HHI = 3 * (1/3)^2 = 0.333
    const threeEqual = [
      makeProperty({ roomCount: 10, startAdr: 300, maxOccupancy: 0.75 }),
      makeProperty({ roomCount: 10, startAdr: 300, maxOccupancy: 0.75 }),
      makeProperty({ roomCount: 10, startAdr: 300, maxOccupancy: 0.75 }),
    ];
    const threeReport = computePortfolioRiskScore(threeEqual);
    expect(threeReport.concentrationRisk.herfindahlIndex).toBeCloseTo(0.3333, 2);
  });
});
