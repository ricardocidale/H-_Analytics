import { describe, it, expect } from "vitest";
import { runVerificationWithEngine } from "../../server/calculationChecker.js";

function makeGlobal() {
  return { modelStartDate: "2026-01-01", projectionYears: 2, inflationRate: 0.02, fixedCostEscalationRate: 0.02 };
}

function makeProperty() {
  return {
    name: "Test Hotel",
    type: "AllCash",
    purchasePrice: 1_000_000,
    buildingImprovements: 0,
    roomCount: 10,
    startAdr: 200,
    startOccupancy: 0.50,
    maxOccupancy: 0.70,
    occupancyGrowthStep: 0.05,
    occupancyRampMonths: 12,
    adrGrowthRate: 0.02,
    operationsStartDate: "2026-01-01",
    acquisitionDate: "2026-01-01",
    operatingReserve: 0,
    taxRate: 0.25,
  };
}

describe("debug checker", () => {
  it("produces UNQUALIFIED opinion for well-formed property", () => {
    const report = runVerificationWithEngine([makeProperty()], makeGlobal());
    expect(report.summary.totalChecks).toBeGreaterThan(0);
    expect(report.summary.auditOpinion).toBe("UNQUALIFIED");
    expect(report.summary.criticalIssues).toBe(0);
  });
});
