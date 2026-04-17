/**
 * Golden Test: Service Fee Flow — Properties to Management Company
 *
 * Verifies the end-to-end flow of service fees from property SPVs through
 * to the management company P&L, including:
 *   - Per-property fee generation (revenue x categoryRate)
 *   - Company fee aggregation (sum of all property service fees)
 *   - Zero-sum intercompany (property fee expense = company fee revenue)
 *   - Vendor cost for centralized vs direct service models
 *   - Company EBITDA, net income, and vendor cost impact
 *
 * Setup: 2 properties with different revenue profiles, 0% growth (flat),
 * both Full Equity, using the 6 default service template categories.
 *
 * Property A: 20 rooms, $250 ADR, 70% occ
 * Property B: 15 rooms, $200 ADR, 65% occ
 */

import { describe, it, expect } from "vitest";
import {
  generatePropertyProForma,
  generateCompanyProForma,
} from "../../client/src/lib/financialEngine.js";
import {
  DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  DEFAULT_SERVICE_TEMPLATES,
  DEFAULT_SERVICE_MARKUP,
  DEFAULT_PROPERTY_TAX_RATE,
  DEFAULT_PROPERTY_INFLATION_RATE,
  DEFAULT_COMPANY_TAX_RATE,
  DAYS_PER_MONTH,
} from "../../shared/constants.js";
import { vendorCostFromFee } from "../../calc/services/margin-calculator.js";
import type { ServiceTemplate } from "../../calc/services/types.js";
import { makePropertyInput as makeProperty, makeGlobalInput as makeGlobal } from "../fixtures/factories.js";

// ── Service templates (all 6 default categories, with IDs) ──────────────
const serviceTemplates: ServiceTemplate[] = DEFAULT_SERVICE_TEMPLATES.map((t, i) => ({
  id: i + 1,
  name: t.name,
  defaultRate: t.defaultRate,
  serviceModel: t.serviceModel,
  serviceMarkup: t.serviceMarkup,
  isActive: true,
  sortOrder: t.sortOrder,
}));

// ── Fee categories for property-level breakdown ─────────────────────────
const feeCategories = DEFAULT_SERVICE_TEMPLATES.map(t => ({
  name: t.name,
  rate: t.defaultRate,
  isActive: true,
}));

// ── Property A: 20 rooms, $250 ADR, 70% occ ────────────────────────────
const propertyA = {
  ...makeProperty({
    roomCount: 20,
    startAdr: 250,
    startOccupancy: 0.70,
    maxOccupancy: 0.70,
    occupancyRampMonths: 0,
    adrGrowthRate: 0,
    purchasePrice: 2_000_000,
  }),
  id: 1,
  baseManagementFeeRate: DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  incentiveManagementFeeRate: DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  feeCategories,
};

// ── Property B: 15 rooms, $200 ADR, 65% occ ────────────────────────────
const propertyB = {
  ...makeProperty({
    roomCount: 15,
    startAdr: 200,
    startOccupancy: 0.65,
    maxOccupancy: 0.65,
    occupancyRampMonths: 0,
    adrGrowthRate: 0,
    purchasePrice: 1_500_000,
  }),
  id: 2,
  baseManagementFeeRate: DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  incentiveManagementFeeRate: DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  feeCategories,
};

// ── Global assumptions: 0% growth, 1-year projection ────────────────────
const baseGlobal = {
  ...makeGlobal({ projectionYears: 1 }),
  inflationRate: 0,
  fixedCostEscalationRate: 0,
  companyOpsStartDate: "2026-04-01",
  baseManagementFee: DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  incentiveManagementFee: DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  miscOpsRate: 0.03,
  capitalRaise1Date: "2026-04-01",
  capitalRaise1Amount: 1_000_000,
  capitalRaise2Date: undefined as string | undefined,
  capitalRaise2Amount: 0,
  staffSalary: 75_000,
  staffTier1MaxProperties: 3,
  staffTier1Fte: 2.5,
  staffTier2MaxProperties: 6,
  staffTier2Fte: 4.5,
  staffTier3Fte: 7.0,
  officeLeaseStart: 36_000,
  professionalServicesStart: 24_000,
  techInfraStart: 18_000,
  travelCostPerClient: 12_000,
  itLicensePerClient: 3_000,
  partnerCompYear1: 540_000,
  companyTaxRate: DEFAULT_COMPANY_TAX_RATE,
};

const MONTHS = 12;

// ── Pre-compute pro formas ──────────────────────────────────────────────
const proFormaA = generatePropertyProForma(propertyA, baseGlobal, MONTHS);
const proFormaB = generatePropertyProForma(propertyB, baseGlobal, MONTHS);
const companyWithTemplates = generateCompanyProForma(
  [propertyA, propertyB],
  baseGlobal,
  MONTHS,
  serviceTemplates,
);
const companyWithoutTemplates = generateCompanyProForma(
  [propertyA, propertyB],
  baseGlobal,
  MONTHS,
);

// ── Golden values (hand-calculated, flat month) ─────────────────────────
// Property A monthly room revenue = 20 rooms * $250 * 70% occ * 30.5 days
// Property B monthly room revenue = 15 rooms * $200 * 65% occ * 30.5 days

describe("Service Fee Company Golden — End-to-End Flow", () => {
  describe("1. Property fee generation — serviceFeesByCategory matches revenue x categoryRate", () => {
    it("Property A: each category fee = revenueTotal * categoryRate", () => {
      for (const m of proFormaA) {
        if (m.revenueTotal === 0) continue;
        for (const cat of feeCategories) {
          const expected = m.revenueTotal * cat.rate;
          expect(m.serviceFeesByCategory[cat.name]).toBeCloseTo(expected, 2);
        }
      }
    });

    it("Property B: each category fee = revenueTotal * categoryRate", () => {
      for (const m of proFormaB) {
        if (m.revenueTotal === 0) continue;
        for (const cat of feeCategories) {
          const expected = m.revenueTotal * cat.rate;
          expect(m.serviceFeesByCategory[cat.name]).toBeCloseTo(expected, 2);
        }
      }
    });

    it("Property A: sum of category fees = feeBase", () => {
      for (const m of proFormaA) {
        const catSum = Object.values(m.serviceFeesByCategory).reduce((s, v) => s + v, 0);
        expect(catSum).toBeCloseTo(m.feeBase, 2);
      }
    });

    it("Property B: sum of category fees = feeBase", () => {
      for (const m of proFormaB) {
        const catSum = Object.values(m.serviceFeesByCategory).reduce((s, v) => s + v, 0);
        expect(catSum).toBeCloseTo(m.feeBase, 2);
      }
    });

    it("all 6 default service categories are present on each property", () => {
      const operational = proFormaA.filter(m => m.revenueTotal > 0);
      expect(operational.length).toBeGreaterThan(0);
      for (const m of operational) {
        for (const cat of feeCategories) {
          expect(m.serviceFeesByCategory).toHaveProperty(cat.name);
        }
      }
    });
  });

  describe("2. Company fee aggregation — baseFeeRevenue = sum of all property service fee totals", () => {
    it("baseFeeRevenue = Property A feeBase + Property B feeBase every month", () => {
      for (let i = 0; i < MONTHS; i++) {
        const expectedBase = proFormaA[i].feeBase + proFormaB[i].feeBase;
        expect(companyWithTemplates[i].baseFeeRevenue).toBeCloseTo(expectedBase, 2);
      }
    });

    it("incentiveFeeRevenue = Property A feeIncentive + Property B feeIncentive every month", () => {
      for (let i = 0; i < MONTHS; i++) {
        const expectedIncentive = proFormaA[i].feeIncentive + proFormaB[i].feeIncentive;
        expect(companyWithTemplates[i].incentiveFeeRevenue).toBeCloseTo(expectedIncentive, 2);
      }
    });

    it("totalRevenue = baseFeeRevenue + incentiveFeeRevenue every month", () => {
      for (const m of companyWithTemplates) {
        expect(m.totalRevenue).toBeCloseTo(m.baseFeeRevenue + m.incentiveFeeRevenue, 2);
      }
    });
  });

  describe("3. Zero-sum intercompany — property fee expense = company fee revenue", () => {
    it("sum of property feeBase = company baseFeeRevenue every month", () => {
      for (let i = 0; i < MONTHS; i++) {
        const sumPropertyFeeBase = proFormaA[i].feeBase + proFormaB[i].feeBase;
        expect(companyWithTemplates[i].baseFeeRevenue).toBeCloseTo(sumPropertyFeeBase, 2);
      }
    });

    it("sum of property feeIncentive = company incentiveFeeRevenue every month", () => {
      for (let i = 0; i < MONTHS; i++) {
        const sumPropertyFeeIncentive = proFormaA[i].feeIncentive + proFormaB[i].feeIncentive;
        expect(companyWithTemplates[i].incentiveFeeRevenue).toBeCloseTo(sumPropertyFeeIncentive, 2);
      }
    });

    it("total fees flow perfectly: sum(prop.feeBase + prop.feeIncentive) = company.totalRevenue", () => {
      for (let i = 0; i < MONTHS; i++) {
        const totalPropFees =
          proFormaA[i].feeBase + proFormaA[i].feeIncentive +
          proFormaB[i].feeBase + proFormaB[i].feeIncentive;
        expect(companyWithTemplates[i].totalRevenue).toBeCloseTo(totalPropFees, 2);
      }
    });
  });

  describe("4. Vendor cost for centralized services", () => {
    it("centralized categories: vendorCost = fee / (1 + markup) where markup = 0.20", () => {
      const operational = companyWithTemplates.filter(m => m.totalRevenue > 0);
      expect(operational.length).toBeGreaterThan(0);
      for (const m of operational) {
        const costs = m.costOfCentralizedServices!;
        expect(costs).not.toBeNull();

        // Check each centralized category
        for (const t of serviceTemplates) {
          if (t.serviceModel !== "centralized") continue;
          const cat = costs.byCategory[t.name];
          expect(cat).toBeDefined();
          expect(cat.serviceModel).toBe("centralized");
          const expectedVendorCost = vendorCostFromFee(cat.revenue, DEFAULT_SERVICE_MARKUP);
          expect(cat.vendorCost).toBeCloseTo(expectedVendorCost, 2);
        }
      }
    });

    it("centralized categories: grossProfit = fee - vendorCost", () => {
      const operational = companyWithTemplates.filter(m => m.totalRevenue > 0);
      for (const m of operational) {
        const costs = m.costOfCentralizedServices!;
        for (const t of serviceTemplates) {
          if (t.serviceModel !== "centralized") continue;
          const cat = costs.byCategory[t.name];
          expect(cat.grossProfit).toBeCloseTo(cat.revenue - cat.vendorCost, 6);
        }
      }
    });

    it("totalVendorCost = sum of all centralized category vendor costs", () => {
      const operational = companyWithTemplates.filter(m => m.totalRevenue > 0);
      for (const m of operational) {
        const costs = m.costOfCentralizedServices!;
        let expectedTotal = 0;
        for (const cat of Object.values(costs.byCategory)) {
          expectedTotal += cat.vendorCost;
        }
        expect(m.totalVendorCost).toBeCloseTo(expectedTotal, 6);
      }
    });
  });

  describe("5. No vendor cost for direct services (General Management)", () => {
    it("General Management has serviceModel = direct", () => {
      const operational = companyWithTemplates.filter(m => m.totalRevenue > 0);
      for (const m of operational) {
        const costs = m.costOfCentralizedServices!;
        const gm = costs.byCategory["General Management"];
        expect(gm).toBeDefined();
        expect(gm.serviceModel).toBe("direct");
      }
    });

    it("General Management: vendorCost = 0", () => {
      const operational = companyWithTemplates.filter(m => m.totalRevenue > 0);
      for (const m of operational) {
        const costs = m.costOfCentralizedServices!;
        const gm = costs.byCategory["General Management"];
        expect(gm.vendorCost).toBe(0);
      }
    });

    it("General Management: grossProfit = fee (full margin)", () => {
      const operational = companyWithTemplates.filter(m => m.totalRevenue > 0);
      for (const m of operational) {
        const costs = m.costOfCentralizedServices!;
        const gm = costs.byCategory["General Management"];
        expect(gm.grossProfit).toBeCloseTo(gm.revenue, 6);
      }
    });
  });

  describe("6. Company EBITDA = totalRevenue - totalVendorCost - totalExpenses", () => {
    it("EBITDA identity holds every month", () => {
      for (const m of companyWithTemplates) {
        // ebitda is not directly exposed; derive from preTaxIncome + fundingInterestExpense
        const ebitda = m.preTaxIncome + m.fundingInterestExpense;
        const expected = m.totalRevenue - m.totalVendorCost - m.totalExpenses;
        expect(ebitda).toBeCloseTo(expected, 4);
      }
    });

    it("grossProfit = totalRevenue - totalVendorCost every month", () => {
      for (const m of companyWithTemplates) {
        expect(m.grossProfit).toBeCloseTo(m.totalRevenue - m.totalVendorCost, 6);
      }
    });
  });

  describe("7. Company net income = ebitda - fundingInterestExpense - companyIncomeTax", () => {
    it("netIncome = preTaxIncome - companyIncomeTax every month", () => {
      for (const m of companyWithTemplates) {
        expect(m.netIncome).toBeCloseTo(m.preTaxIncome - m.companyIncomeTax, 4);
      }
    });

    it("preTaxIncome = ebitda - fundingInterestExpense every month", () => {
      for (const m of companyWithTemplates) {
        const ebitda = m.totalRevenue - m.totalVendorCost - m.totalExpenses;
        expect(m.preTaxIncome).toBeCloseTo(ebitda - m.fundingInterestExpense, 4);
      }
    });

    it("tax is only applied when preTaxIncome > 0", () => {
      for (const m of companyWithTemplates) {
        if (m.preTaxIncome <= 0) {
          expect(m.companyIncomeTax).toBe(0);
        } else {
          expect(m.companyIncomeTax).toBeCloseTo(
            m.preTaxIncome * DEFAULT_COMPANY_TAX_RATE,
            4,
          );
        }
      }
    });
  });

  describe("8. Vendor cost reduces net income — with vs without service templates", () => {
    it("revenue is the same with and without templates", () => {
      for (let i = 0; i < MONTHS; i++) {
        expect(companyWithTemplates[i].totalRevenue).toBeCloseTo(
          companyWithoutTemplates[i].totalRevenue,
          4,
        );
      }
    });

    it("net income is lower with templates (vendor costs reduce income)", () => {
      const operational = companyWithTemplates.filter(m => m.totalRevenue > 0);
      for (const m of operational) {
        const mWithout = companyWithoutTemplates.find(
          w => w.monthIndex === m.monthIndex,
        )!;
        expect(m.netIncome).toBeLessThan(mWithout.netIncome + 0.01);
      }
    });

    it("difference in net income = totalVendorCost * (1 - taxRate) when profitable", () => {
      for (let i = 0; i < MONTHS; i++) {
        const mWith = companyWithTemplates[i];
        const mWithout = companyWithoutTemplates[i];

        // Both must have the same revenue and expenses (except vendor cost)
        expect(mWith.totalExpenses).toBeCloseTo(mWithout.totalExpenses, 4);

        if (mWith.totalVendorCost === 0) {
          expect(mWith.netIncome).toBeCloseTo(mWithout.netIncome, 4);
          continue;
        }

        // Vendor cost reduces pre-tax income by exactly totalVendorCost.
        // If both are profitable, the after-tax difference = vendorCost * (1 - taxRate).
        // If only one is profitable, the difference includes the tax delta.
        const preTaxDiff = mWithout.preTaxIncome - mWith.preTaxIncome;
        expect(preTaxDiff).toBeCloseTo(mWith.totalVendorCost, 4);

        // After-tax: the net income difference accounts for tax savings from the deduction
        if (mWithout.preTaxIncome > 0 && mWith.preTaxIncome > 0) {
          const expectedNetDiff = mWith.totalVendorCost * (1 - DEFAULT_COMPANY_TAX_RATE);
          const actualNetDiff = mWithout.netIncome - mWith.netIncome;
          expect(actualNetDiff).toBeCloseTo(expectedNetDiff, 4);
        }
      }
    });

    it("totalVendorCost is zero when no templates provided", () => {
      for (const m of companyWithoutTemplates) {
        expect(m.totalVendorCost).toBe(0);
      }
    });

    it("grossProfit = totalRevenue when no templates provided", () => {
      for (const m of companyWithoutTemplates) {
        expect(m.grossProfit).toBeCloseTo(m.totalRevenue, 6);
      }
    });
  });
});
