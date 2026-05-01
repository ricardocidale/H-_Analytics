import { describe, it, expect } from "vitest";
import {
  buildPropertyAssumptionsSection,
  buildCompanyAssumptionsSection,
  ASSUMPTIONS_TITLE_PREFIX,
} from "../../server/report/assumption-sections";
import { FIELD_REGISTRY } from "@shared/field-registry";
import type { PropertyInput } from "@engine/types";

/**
 * Completeness invariant for assumption export sections.
 *
 * Catches drift: when a new engine-impactful field is added to FIELD_REGISTRY,
 * or a new tracked ManCo assumption is added to globalAssumptions, the export
 * section must surface it. Otherwise investors read a financial report that
 * silently omits driver assumptions — a trust failure.
 */

const fakeProperty: PropertyInput = {
  id: 1,
  name: "Test Property",
  roomCount: 10,
  acquisitionDate: "2026-01-01",
  operationsStartDate: "2026-04-01",
} as unknown as PropertyInput;

const fakeGlobals: Record<string, unknown> = {
  companyName: "Test Co",
  propertyLabel: "Boutique Hotel",
  modelStartDate: "2026-01-01",
  companyOpsStartDate: "2026-01-01",
  projectionYears: 10,
  fiscalYearStartMonth: 1,
  inflationRate: 0.03,
  fixedCostEscalationRate: 0.025,
  baseManagementFee: 0.04,
  incentiveManagementFee: 0.10,
  fundingSourceLabel: "SAFE",
  capitalRaise1Amount: 1000000,
  capitalRaise1Date: "2026-01-01",
  capitalRaise2Amount: 1000000,
  capitalRaise2Date: "2026-07-01",
  capitalRaiseValuationCap: 2500000,
  capitalRaiseDiscountRate: 0.20,
  fundingInterestRate: 0.05,
  fundingInterestPaymentFrequency: "annual",
  staffSalary: 80000,
  staffTier1MaxProperties: 5,
  staffTier1Fte: 2.5,
  staffTier2MaxProperties: 15,
  staffTier2Fte: 4.5,
  staffTier3Fte: 7.0,
  officeLeaseStart: 36000,
  professionalServicesStart: 24000,
  techInfraStart: 12000,
  businessInsuranceStart: 18000,
  travelCostPerClient: 5000,
  itLicensePerClient: 2400,
  marketingRate: 0.02,
  miscOpsRate: 0.01,
  companyTaxRate: 0.21,
  costOfEquity: 0.18,
  commissionRate: 0.03,
  exitCapRate: 0.08,
  salesCommissionRate: 0.03,
  depreciationYears: 39,
  standardAcqPackage: {
    purchasePrice: 5000000,
    buildingImprovements: 500000,
    preOpeningCosts: 200000,
    operatingReserve: 250000,
    monthsToOps: 4,
  },
  debtAssumptions: {
    interestRate: 0.07,
    amortizationYears: 25,
    refiLTV: 0.65,
    refiClosingCostRate: 0.02,
    acqLTV: 0.65,
    acqClosingCostRate: 0.02,
  },
  partnerCompYear1: 360000,
  partnerCompYear2: 420000,
  partnerCompYear3: 480000,
  partnerCompYear4: 600000,
  partnerCompYear5: 600000,
  partnerCompYear6: 700000,
  partnerCompYear7: 700000,
  partnerCompYear8: 800000,
  partnerCompYear9: 800000,
  partnerCompYear10: 900000,
  partnerCountYear1: 3,
  partnerCountYear2: 3,
  partnerCountYear3: 3,
  partnerCountYear4: 3,
  partnerCountYear5: 3,
  partnerCountYear6: 3,
  partnerCountYear7: 3,
  partnerCountYear8: 3,
  partnerCountYear9: 3,
  partnerCountYear10: 3,
};

describe("assumptions-export completeness", () => {
  describe("property section", () => {
    const section = buildPropertyAssumptionsSection(fakeProperty, fakeGlobals);

    it("uses the canonical title prefix", () => {
      expect(section.title.startsWith(ASSUMPTIONS_TITLE_PREFIX)).toBe(true);
    });

    it("uses single-column 'Value' header (matches profileSection convention)", () => {
      expect(section.years).toEqual(["Value"]);
    });

    it("surfaces every engine-impactful FIELD_REGISTRY field by label", () => {
      const labels = section.rows.map(r => r.category);
      const missing: string[] = [];
      for (const f of FIELD_REGISTRY) {
        if (!f.engineImpact) continue;
        if (!labels.some(l => l === f.label)) {
          missing.push(`${f.propertyField} ("${f.label}")`);
        }
      }
      expect(missing, `Missing fields: ${missing.join(", ")}`).toEqual([]);
    });

    it("renders NULL/undefined values as em-dash", () => {
      const minimal: Record<string, unknown> = {
        companyName: "X",
        propertyLabel: "Hotel",
        modelStartDate: "2026-01-01",
        companyOpsStartDate: "2026-01-01",
        projectionYears: 10,
        fiscalYearStartMonth: 1,
        inflationRate: 0.03,
        fixedCostEscalationRate: 0.025,
      };
      const minProperty: PropertyInput = { id: 1, name: "Sparse", roomCount: 5 } as unknown as PropertyInput;
      const sparse = buildPropertyAssumptionsSection(minProperty, minimal);
      const dashCount = sparse.rows.filter(r => r.values[0] === "—").length;
      expect(dashCount).toBeGreaterThan(0);
    });
  });

  describe("company section", () => {
    const section = buildCompanyAssumptionsSection(fakeGlobals);

    it("uses the canonical title prefix", () => {
      expect(section.title.startsWith(ASSUMPTIONS_TITLE_PREFIX)).toBe(true);
    });

    it("uses single-column 'Value' header", () => {
      expect(section.years).toEqual(["Value"]);
    });

    it("includes every required ManCo assumption category", () => {
      const headers = section.rows.filter(r => r.isHeader).map(r => r.category);
      const requiredCategories = [
        "Company Identity",
        "Macro & Inflation",
        "Management Fees",
        "Funding",
        "Partner Compensation",
        "Staffing",
        "Fixed Overhead (Year 1)",
        "Variable Costs",
        "Tax & Returns",
        "Acquisition (Standard Package)",
        "Debt (Default)",
        "Exit Defaults",
      ];
      for (const cat of requiredCategories) {
        expect(headers, `missing category: ${cat}`).toContain(cat);
      }
    });

    it("renders all 10 partner-comp years", () => {
      const partnerRows = section.rows.filter(r => r.category.startsWith("Year ") && r.category.includes("partners"));
      expect(partnerRows.length).toBe(10);
    });
  });
});
