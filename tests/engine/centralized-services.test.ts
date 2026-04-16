import { describe, it, expect } from "vitest";
import {
  generateCompanyProForma,
} from "../../client/src/lib/financialEngine.js";
import {
  DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
} from "../../shared/constants.js";
import { vendorCostFromFee } from "../../calc/services/margin-calculator.js";
import type { ServiceTemplate } from "../../calc/services/types.js";
import { makeProperty, makeGlobal } from "../fixtures";

const baseProperty = {
  ...makeProperty({
    startAdr: 250,
    maxOccupancy: 0.85,
    purchasePrice: 2_000_000,
  }),
  id: 1,
  baseManagementFeeRate: DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  incentiveManagementFeeRate: DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  feeCategories: [
    { name: "Marketing & Brand", rate: 0.02, isActive: true },
    { name: "Technology & Reservations", rate: 0.025, isActive: true },
    { name: "General Management", rate: 0.015, isActive: true },
  ],
};

const baseGlobal = {
  ...makeGlobal({ projectionYears: 1 }),
  companyOpsStartDate: "2026-04-01",
  baseManagementFee: 0.05,
  incentiveManagementFee: 0.15,
  miscOpsRate: 0.03,
  safeTranche1Date: "2026-04-01",
  safeTranche1Amount: 1_000_000,
  safeTranche2Date: undefined as string | undefined,
  safeTranche2Amount: 0,
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
};

const serviceTemplates: ServiceTemplate[] = [
  { id: 1, name: "Marketing & Brand", defaultRate: 0.02, serviceModel: "centralized", serviceMarkup: 0.20, isActive: true, sortOrder: 1 },
  { id: 2, name: "Technology & Reservations", defaultRate: 0.025, serviceModel: "centralized", serviceMarkup: 0.20, isActive: true, sortOrder: 2 },
  { id: 3, name: "General Management", defaultRate: 0.015, serviceModel: "direct", serviceMarkup: 0.20, isActive: true, sortOrder: 3 },
];

describe("Centralized Services — Engine Integration", () => {
  describe("without service templates (backward compatibility)", () => {
    const result = generateCompanyProForma([baseProperty], baseGlobal, 12);

    it("totalVendorCost is 0 when no templates passed", () => {
      for (const m of result) {
        expect(m.totalVendorCost).toBe(0);
      }
    });

    it("grossProfit equals totalRevenue when no templates passed", () => {
      for (const m of result) {
        expect(m.grossProfit).toBeCloseTo(m.totalRevenue, 6);
      }
    });

    it("costOfCentralizedServices is null when no templates passed", () => {
      for (const m of result) {
        expect(m.costOfCentralizedServices).toBeNull();
      }
    });
  });

  describe("with service templates", () => {
    const result = generateCompanyProForma([baseProperty], baseGlobal, 12, serviceTemplates);

    it("costOfCentralizedServices is populated", () => {
      const operational = result.filter(m => m.totalRevenue > 0);
      expect(operational.length).toBeGreaterThan(0);
      for (const m of operational) {
        expect(m.costOfCentralizedServices).not.toBeNull();
      }
    });

    it("totalVendorCost > 0 in operational months", () => {
      const operational = result.filter(m => m.totalRevenue > 0);
      for (const m of operational) {
        expect(m.totalVendorCost).toBeGreaterThan(0);
      }
    });

    it("grossProfit = totalRevenue - totalVendorCost", () => {
      for (const m of result) {
        expect(m.grossProfit).toBeCloseTo(m.totalRevenue - m.totalVendorCost, 6);
      }
    });

    it("netIncome = totalRevenue - totalVendorCost - totalExpenses", () => {
      for (const m of result) {
        expect(m.netIncome).toBeCloseTo(m.totalRevenue - m.totalVendorCost - m.totalExpenses, 4);
      }
    });

    it("centralized categories have vendor costs derived from markup", () => {
      const operational = result.filter(m => m.totalRevenue > 0);
      for (const m of operational) {
        const costs = m.costOfCentralizedServices!;
        const marketing = costs.byCategory["Marketing & Brand"];
        expect(marketing).toBeDefined();
        expect(marketing.serviceModel).toBe("centralized");
        expect(marketing.vendorCost).toBeCloseTo(
          vendorCostFromFee(marketing.revenue, 0.20), 2
        );
      }
    });

    it("direct categories have zero vendor cost", () => {
      const operational = result.filter(m => m.totalRevenue > 0);
      for (const m of operational) {
        const costs = m.costOfCentralizedServices!;
        const gm = costs.byCategory["General Management"];
        expect(gm).toBeDefined();
        expect(gm.serviceModel).toBe("direct");
        expect(gm.vendorCost).toBe(0);
        expect(gm.grossProfit).toBeCloseTo(gm.revenue, 6);
      }
    });

    it("vendor cost + gross profit = total revenue (per category)", () => {
      const operational = result.filter(m => m.totalRevenue > 0);
      for (const m of operational) {
        const costs = m.costOfCentralizedServices!;
        for (const cat of Object.values(costs.byCategory)) {
          expect(cat.vendorCost + cat.grossProfit).toBeCloseTo(cat.revenue, 6);
        }
      }
    });
  });

  describe("net income impact", () => {
    const withoutTemplates = generateCompanyProForma([baseProperty], baseGlobal, 12);
    const withTemplates = generateCompanyProForma([baseProperty], baseGlobal, 12, serviceTemplates);

    it("net income is lower with centralized services (vendor costs reduce income)", () => {
      const operational = withoutTemplates.filter(m => m.totalRevenue > 0);
      for (let i = 0; i < operational.length; i++) {
        const mWithout = withoutTemplates.find(m => m.monthIndex === operational[i].monthIndex)!;
        const mWith = withTemplates.find(m => m.monthIndex === operational[i].monthIndex)!;
        // Revenue is the same, but vendor costs reduce net income
        expect(mWith.totalRevenue).toBeCloseTo(mWithout.totalRevenue, 4);
        expect(mWith.netIncome).toBeLessThan(mWithout.netIncome + 0.01);
      }
    });

    it("difference in net income equals total vendor cost", () => {
      for (let m = 0; m < 12; m++) {
        const diff = withoutTemplates[m].netIncome - withTemplates[m].netIncome;
        expect(diff).toBeCloseTo(withTemplates[m].totalVendorCost, 4);
      }
    });
  });

  describe("cash flow impact", () => {
    const withTemplates = generateCompanyProForma([baseProperty], baseGlobal, 12, serviceTemplates);

    it("cashFlow = netIncome + safeFunding", () => {
      for (const m of withTemplates) {
        expect(m.cashFlow).toBeCloseTo(m.netIncome + m.safeFunding, 4);
      }
    });

    it("endingCash is cumulative cashFlow", () => {
      let cumCash = 0;
      for (const m of withTemplates) {
        cumCash += m.cashFlow;
        expect(m.endingCash).toBeCloseTo(cumCash, 4);
      }
    });
  });

  describe("empty templates array", () => {
    const result = generateCompanyProForma([baseProperty], baseGlobal, 12, []);

    it("behaves same as no templates (empty array)", () => {
      for (const m of result) {
        expect(m.totalVendorCost).toBe(0);
        expect(m.grossProfit).toBeCloseTo(m.totalRevenue, 6);
      }
    });
  });
});
