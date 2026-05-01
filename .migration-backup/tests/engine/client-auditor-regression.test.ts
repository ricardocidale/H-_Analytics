import { describe, it, expect } from "vitest";
import { generatePropertyProForma } from "../../client/src/lib/financialEngine";
import { runFullAudit, PropertyAuditInput, GlobalAuditInput } from "../../client/src/lib/financialAuditor";

const GLOBAL_ASSUMPTIONS = {
  modelStartDate: "2026-04-01",
  inflationRate: 0.03,
  projectionYears: 10,
};

const GLOBAL_AUDIT_INPUT: GlobalAuditInput = {
  modelStartDate: "2026-04-01",
  inflationRate: 0.03,
  debtAssumptions: {
    interestRate: 0.09,
    amortizationYears: 25,
    acqLTV: 0.65,
  },
};

const ALL_PROPERTIES: Record<string, any> = {
  "The Hudson Estate": {
    name: "The Hudson Estate",
    type: "Full Equity",
    purchasePrice: 3800000,
    buildingImprovements: 1200000,
    landValuePercent: 0.25,
    operatingReserve: 250000,
    acquisitionDate: "2026-06-01",
    operationsStartDate: "2026-12-01",
    roomCount: 20,
    startAdr: 385,
    startOccupancy: 0.55,
    maxOccupancy: 0.82,
    occupancyRampMonths: 6,
    occupancyGrowthStep: 0.05,
    adrGrowthRate: 0.025,
    willRefinance: "Yes",
    refinanceDate: "2029-12-01",
    refinanceLTV: 0.75,
    refinanceInterestRate: 0.09,
    refinanceTermYears: 25,
    costRateRooms: 0.2,
    costRateFB: 0.085,
    costRateAdmin: 0.08,
    costRateMarketing: 0.01,
    costRatePropertyOps: 0.04,
    costRateUtilities: 0.05,
    costRateTaxes: 0.03,
    costRateIT: 0.005,
    costRateFFE: 0.04,
    costRateOther: 0.05,
    revShareEvents: 0.3,
    revShareFB: 0.18,
    revShareOther: 0.05,
    baseManagementFeeRate: 0.085,
    incentiveManagementFeeRate: 0.12,
    taxRate: 0.25,
  },
  "Eden Summit Lodge": {
    name: "Eden Summit Lodge",
    type: "Full Equity",
    purchasePrice: 4000000,
    buildingImprovements: 1200000,
    landValuePercent: 0.25,
    operatingReserve: 250000,
    acquisitionDate: "2027-01-01",
    operationsStartDate: "2027-07-01",
    roomCount: 20,
    startAdr: 425,
    startOccupancy: 0.5,
    maxOccupancy: 0.8,
    occupancyRampMonths: 6,
    occupancyGrowthStep: 0.05,
    adrGrowthRate: 0.025,
    willRefinance: "Yes",
    refinanceDate: "2030-07-01",
    refinanceLTV: 0.75,
    refinanceInterestRate: 0.09,
    refinanceTermYears: 25,
    costRateRooms: 0.2,
    costRateFB: 0.085,
    costRateAdmin: 0.08,
    costRateMarketing: 0.01,
    costRatePropertyOps: 0.04,
    costRateUtilities: 0.05,
    costRateTaxes: 0.03,
    costRateIT: 0.005,
    costRateFFE: 0.04,
    costRateOther: 0.05,
    revShareEvents: 0.3,
    revShareFB: 0.18,
    revShareOther: 0.05,
    baseManagementFeeRate: 0.085,
    incentiveManagementFeeRate: 0.12,
    taxRate: 0.25,
  },
  "Austin Hillside": {
    name: "Austin Hillside",
    type: "Full Equity",
    purchasePrice: 3500000,
    buildingImprovements: 1100000,
    landValuePercent: 0.25,
    operatingReserve: 250000,
    acquisitionDate: "2027-04-01",
    operationsStartDate: "2028-01-01",
    roomCount: 20,
    startAdr: 320,
    startOccupancy: 0.55,
    maxOccupancy: 0.82,
    occupancyRampMonths: 6,
    occupancyGrowthStep: 0.05,
    adrGrowthRate: 0.025,
    willRefinance: "Yes",
    refinanceDate: "2031-01-01",
    refinanceLTV: 0.75,
    refinanceInterestRate: 0.09,
    refinanceTermYears: 25,
    costRateRooms: 0.2,
    costRateFB: 0.09,
    costRateAdmin: 0.08,
    costRateMarketing: 0.01,
    costRatePropertyOps: 0.04,
    costRateUtilities: 0.05,
    costRateTaxes: 0.03,
    costRateIT: 0.005,
    costRateFFE: 0.04,
    costRateOther: 0.05,
    revShareEvents: 0.28,
    revShareFB: 0.18,
    revShareOther: 0.05,
    baseManagementFeeRate: 0.085,
    incentiveManagementFeeRate: 0.12,
    taxRate: 0.25,
  },
  "Blue Ridge Manor": {
    name: "Blue Ridge Manor",
    type: "Financed",
    purchasePrice: 6000000,
    buildingImprovements: 1500000,
    landValuePercent: 0.25,
    operatingReserve: 500000,
    acquisitionDate: "2027-07-01",
    operationsStartDate: "2028-07-01",
    roomCount: 30,
    startAdr: 375,
    startOccupancy: 0.5,
    maxOccupancy: 0.8,
    occupancyRampMonths: 6,
    occupancyGrowthStep: 0.05,
    adrGrowthRate: 0.025,
    acquisitionLTV: 0.6,
    acquisitionInterestRate: 0.09,
    acquisitionTermYears: 25,
    costRateRooms: 0.2,
    costRateFB: 0.1,
    costRateAdmin: 0.08,
    costRateMarketing: 0.01,
    costRatePropertyOps: 0.04,
    costRateUtilities: 0.05,
    costRateTaxes: 0.03,
    costRateIT: 0.005,
    costRateFFE: 0.04,
    costRateOther: 0.05,
    revShareEvents: 0.28,
    revShareFB: 0.18,
    revShareOther: 0.05,
    baseManagementFeeRate: 0.085,
    incentiveManagementFeeRate: 0.12,
    taxRate: 0.25,
  },
  "Casa Medellín": {
    name: "Casa Medellín",
    type: "Financed",
    purchasePrice: 3800000,
    buildingImprovements: 1000000,
    landValuePercent: 0.25,
    operatingReserve: 600000,
    acquisitionDate: "2026-09-01",
    operationsStartDate: "2028-07-01",
    roomCount: 30,
    startAdr: 210,
    startOccupancy: 0.5,
    maxOccupancy: 0.78,
    occupancyRampMonths: 6,
    occupancyGrowthStep: 0.05,
    adrGrowthRate: 0.04,
    acquisitionLTV: 0.6,
    acquisitionInterestRate: 0.095,
    acquisitionTermYears: 25,
    costRateRooms: 0.2,
    costRateFB: 0.075,
    costRateAdmin: 0.08,
    costRateMarketing: 0.01,
    costRatePropertyOps: 0.04,
    costRateUtilities: 0.05,
    costRateTaxes: 0.03,
    costRateIT: 0.005,
    costRateFFE: 0.04,
    costRateOther: 0.05,
    revShareEvents: 0.25,
    revShareFB: 0.18,
    revShareOther: 0.05,
    baseManagementFeeRate: 0.085,
    incentiveManagementFeeRate: 0.12,
    taxRate: 0.25,
  },
};

function runAuditForProperty(name: string) {
  const property = ALL_PROPERTIES[name];
  const financials = generatePropertyProForma(property, GLOBAL_ASSUMPTIONS, 120);
  return runFullAudit(property as PropertyAuditInput, GLOBAL_AUDIT_INPUT, financials);
}

describe("Client-Side Auditor Regression — All Properties UNQUALIFIED", () => {
  for (const [name, _prop] of Object.entries(ALL_PROPERTIES)) {
    it(`${name}: UNQUALIFIED opinion`, () => {
      const report = runAuditForProperty(name);
      expect(report.opinion).toBe("UNQUALIFIED");
      expect(report.totalFailed).toBe(0);
      expect(report.criticalIssues).toBe(0);
    });
  }
});

describe("Client-Side Auditor — Blue Ridge Manor (Financed)", () => {
  it("all 7 audit sections pass", () => {
    const report = runAuditForProperty("Blue Ridge Manor");
    for (const section of report.sections) {
      expect(section.failed).toBe(0);
    }
  });

  it("depreciation uses correct basis: (purchasePrice * (1 - landPct)) + buildingImprovements", () => {
    const report = runAuditForProperty("Blue Ridge Manor");
    const depSection = report.sections.find((s) => s.name === "Depreciation Audit");
    expect(depSection).toBeDefined();
    expect(depSection!.failed).toBe(0);
  });

  it("loan amortization matches engine output", () => {
    const report = runAuditForProperty("Blue Ridge Manor");
    const loanSection = report.sections.find((s) => s.name === "Loan Amortization Audit");
    expect(loanSection).toBeDefined();
    expect(loanSection!.failed).toBe(0);
  });

  it("balance sheet identity holds", () => {
    const report = runAuditForProperty("Blue Ridge Manor");
    const bsSection = report.sections.find((s) => s.name === "Balance Sheet Audit");
    expect(bsSection).toBeDefined();
    expect(bsSection!.failed).toBe(0);
  });

  it("cash flow reconciliation holds", () => {
    const report = runAuditForProperty("Blue Ridge Manor");
    const cfSection = report.sections.find((s) => s.name === "Cash Flow Reconciliation Audit");
    expect(cfSection).toBeDefined();
    expect(cfSection!.failed).toBe(0);
  });
});

describe("Client-Side Auditor — Casa Medellín (Financed)", () => {
  it("all 7 audit sections pass", () => {
    const report = runAuditForProperty("Casa Medellín");
    for (const section of report.sections) {
      expect(section.failed).toBe(0);
    }
  });

  it("loan amortization with 9.5% rate matches engine", () => {
    const report = runAuditForProperty("Casa Medellín");
    const loanSection = report.sections.find((s) => s.name === "Loan Amortization Audit");
    expect(loanSection).toBeDefined();
    expect(loanSection!.failed).toBe(0);
  });

  it("balance sheet passes all checks", () => {
    const report = runAuditForProperty("Casa Medellín");
    const bsSection = report.sections.find((s) => s.name === "Balance Sheet Audit");
    expect(bsSection).toBeDefined();
    expect(bsSection!.failed).toBe(0);
  });

  it("long pre-ops period (22 months) does not cause auditor failures", () => {
    const report = runAuditForProperty("Casa Medellín");
    expect(report.opinion).toBe("UNQUALIFIED");
  });
});

describe("Client-Side Auditor — Refinance Properties", () => {
  for (const name of ["The Hudson Estate", "Eden Summit Lodge", "Austin Hillside"]) {
    it(`${name}: all sections pass after refinance`, () => {
      const report = runAuditForProperty(name);
      expect(report.opinion).toBe("UNQUALIFIED");
      for (const section of report.sections) {
        expect(section.failed).toBe(0);
      }
    });
  }
});
