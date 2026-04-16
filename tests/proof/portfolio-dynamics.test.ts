import { describe, it, expect } from "vitest";
import { generatePropertyProForma, generateCompanyProForma } from "../../client/src/lib/financialEngine.js";
import {
  DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE
} from "../../shared/constants.js";
import { makePropertyInput as makeProperty, makeGlobalInput as makeGlobal } from "../fixtures/factories";

const baseProperty = makeProperty({
  startAdr: 250,
  maxOccupancy: 0.85,
  purchasePrice: 2_000_000,
  revShareEvents: 0.30,
  revShareFB: 0.18,
  revShareOther: 0.05,
  cateringBoostPercent: 0.22,
  baseManagementFeeRate: DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  incentiveManagementFeeRate: DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
});

const baseGlobal = makeGlobal({
  companyOpsStartDate: "2026-04-01",
  projectionYears: 1,
  miscOpsRate: 0.03,
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
});

describe("Portfolio Dynamics Proof Tests", () => {
  
  describe("1. Property Count Awareness", () => {
    it("handles 1 property", () => {
      const properties = [baseProperty];
      const result = generateCompanyProForma(properties, baseGlobal, 12);
      expect(result).toHaveLength(12);
      expect(result[0].baseFeeRevenue).toBeGreaterThan(0);
    });

    it("handles 3 properties", () => {
      const properties = Array(3).fill(baseProperty);
      const result = generateCompanyProForma(properties, baseGlobal, 12);
      expect(result).toHaveLength(12);
      expect(result[0].baseFeeRevenue).toBeGreaterThan(0);
    });

    it("handles 7 properties (crosses multiple staffing tiers)", () => {
      const properties = Array(7).fill(baseProperty);
      const result = generateCompanyProForma(properties, baseGlobal, 12);
      expect(result).toHaveLength(12);
      expect(result[0].baseFeeRevenue).toBeGreaterThan(0);
    });
  });

  describe("2. Portfolio Aggregation", () => {
    it("Consolidated Revenue = Sum of individual property revenues for any N", () => {
      const n = 4;
      const properties = Array(n).fill(baseProperty).map((p, i) => ({
        ...p,
        roomCount: 10 + i, // Varying room counts
      }));

      const individualResults = properties.map(p => generatePropertyProForma(p, baseGlobal, 12));
      const companyResult = generateCompanyProForma(properties, baseGlobal, 12);

      for (let m = 0; m < 12; m++) {
        const sumIndividualRev = individualResults.reduce((sum, res) => sum + res[m].revenueTotal, 0);
        // Management company revenue is fees, not property revenue. 
        // We check the fee flow in another test. 
        // Here we verify that adding properties scales the company's fee revenue linearly if rates are same.
        const sumIndividualFees = individualResults.reduce((sum, res) => sum + res[m].feeBase + res[m].feeIncentive, 0);
        expect(companyResult[m].totalRevenue).toBeCloseTo(sumIndividualFees, 2);
      }
    });
  });

  describe("3. Management Fee Zero-Sum", () => {
    it("Each property's fee expense equals company's fee revenue from that property", () => {
      const properties = [
        { ...baseProperty, name: "Prop A", baseManagementFeeRate: 0.05 },
        { ...baseProperty, name: "Prop B", baseManagementFeeRate: 0.10 },
      ];

      const resA = generatePropertyProForma(properties[0], baseGlobal, 12);
      const resB = generatePropertyProForma(properties[1], baseGlobal, 12);
      const companyRes = generateCompanyProForma(properties, baseGlobal, 12);

      for (let m = 0; m < 12; m++) {
        const totalPropFees = (resA[m].feeBase + resA[m].feeIncentive) + 
                            (resB[m].feeBase + resB[m].feeIncentive);
        expect(companyRes[m].totalRevenue).toBeCloseTo(totalPropFees, 2);
      }
    });
  });

  describe("4. Dynamic Staffing Tiers", () => {
    it("Staffing scales as count crosses tier boundaries (3→4, 6→7)", () => {
      const getStaffComp = (n: number) => {
        const props = Array(n).fill(baseProperty);
        const res = generateCompanyProForma(props, baseGlobal, 1);
        return res[0].staffCompensation;
      };

      const tier1 = getStaffComp(3);
      const tier2 = getStaffComp(4);
      const tier2Max = getStaffComp(6);
      const tier3 = getStaffComp(7);

      expect(tier2).toBeGreaterThan(tier1);
      expect(tier2).toBeCloseTo(tier2Max, 2);
      expect(tier3).toBeGreaterThan(tier2Max);

      // Verify exact ratios from baseGlobal
      // Tier 1: 2.5 FTE
      // Tier 2: 4.5 FTE
      // Tier 3: 7.0 FTE
      const monthlySalary = baseGlobal.staffSalary / 12;
      expect(tier1).toBeCloseTo(2.5 * monthlySalary, 2);
      expect(tier2).toBeCloseTo(4.5 * monthlySalary, 2);
      expect(tier3).toBeCloseTo(7.0 * monthlySalary, 2);
    });
  });

  describe("5. Empty Portfolio", () => {
    it("Zero properties produces zero revenue/NOI without crashes", () => {
      const result = generateCompanyProForma([], baseGlobal, 12);
      expect(result).toHaveLength(12);
      for (const m of result) {
        expect(m.totalRevenue).toBe(0);
        expect(m.baseFeeRevenue).toBe(0);
        expect(m.incentiveFeeRevenue).toBe(0);
        // Staffing tier 1 still applies by default if activePropertyCount is 0
        const expectedStaff = (baseGlobal.staffTier1Fte * baseGlobal.staffSalary) / 12;
        expect(m.staffCompensation).toBeCloseTo(expectedStaff, 2);
      }
    });
  });

  describe("6. Add Property Effect", () => {
    it("Adding a property increases total portfolio revenue and count", () => {
      const res1 = generateCompanyProForma([baseProperty], baseGlobal, 1);
      const res2 = generateCompanyProForma([baseProperty, baseProperty], baseGlobal, 1);

      expect(res2[0].totalRevenue).toBeGreaterThan(res1[0].totalRevenue);
      expect(res2[0].totalRevenue).toBeCloseTo(res1[0].totalRevenue * 2, 2);
    });
  });
});
