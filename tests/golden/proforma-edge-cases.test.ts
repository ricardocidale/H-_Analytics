import { describe, it, expect } from "vitest";
import { generatePropertyProForma } from "../../client/src/lib/financialEngine";
import { 
  DAYS_PER_MONTH, 
  DEPRECIATION_YEARS, 
  DEFAULT_LAND_VALUE_PERCENT,
  DEFAULT_PROPERTY_TAX_RATE,
  DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE
} from "../../shared/constants";
import { makeProperty, makeGlobal } from "../fixtures";

const PENNY = 2;

describe("Golden Pro-Forma Edge Cases", () => {
  
  describe("Scenario 1: All-Cash Luxury Hotel", () => {
    // $5M purchase, 20 rooms, ADR=350, occ=80%, Full Equity, 10yr.
    const property = makeProperty({
      purchasePrice: 5_000_000,
      roomCount: 20,
      startAdr: 350,
      startOccupancy: 0.80,
      maxOccupancy: 0.80,
      type: "Full Equity",
      adrGrowthRate: 0,
      occupancyGrowthStep: 0,
      baseManagementFeeRate: 0.05,
      incentiveManagementFeeRate: 0.15,
      taxRate: 0.25,
      operatingReserve: 100_000,
    });

    const global = makeGlobal({
      modelStartDate: "2026-04-01",
      inflationRate: 0,
      fixedCostEscalationRate: 0,
    });

    const result = generatePropertyProForma(property, global, 120);

    it("has zero debt fields throughout", () => {
      result.forEach(m => {
        expect(m.debtOutstanding).toBe(0);
        expect(m.interestExpense).toBe(0);
        expect(m.principalPayment).toBe(0);
        expect(m.debtPayment).toBe(0);
      });
    });

    it("calculates NOI correctly: NOI = GOP - MgmtFees - Taxes", () => {
      // Hand-calc for first month:
      // RevRooms = 20 * 30.5 * 350 * 0.8 = 170,800
      // Ancillary: Events(30%)=51,240, FB(18%*1.22)=37,507.68, Other(5%)=8,540
      // TotalRev = 170,800 + 51,240 + 37,507.68 + 8,540 = 268,087.68
      const m = result[0];
      const expectedMgmtFees = m.revenueTotal * 0.05 + Math.max(0, m.gop * 0.15);
      expect(m.noi).toBeCloseTo(m.gop - expectedMgmtFees - m.expenseTaxes, PENNY);
    });

    it("calculates ANOI correctly: ANOI = NOI - FFE", () => {
      const m = result[0];
      expect(m.anoi).toBeCloseTo(m.noi - m.expenseFFE, PENNY);
    });

    it("calculates tax correctly: Tax = max(0, (ANOI - interest - depreciation) * taxRate)", () => {
      const m = result[0];
      const taxable = m.anoi - m.interestExpense - m.depreciationExpense;
      const expectedTax = taxable > 0 ? taxable * 0.25 : 0;
      expect(m.incomeTax).toBeCloseTo(expectedTax, PENNY);
    });

    it("calculates ATCF correctly: ATCF = ANOI - debt - tax", () => {
      result.forEach(m => {
        expect(m.cashFlow).toBeCloseTo(m.anoi - m.debtPayment - m.incomeTax, PENNY);
      });
    });

    it("verifies cumulative cash is monotonically increasing", () => {
      for (let i = 1; i < result.length; i++) {
        expect(result[i].endingCash).toBeGreaterThan(result[i-1].endingCash);
      }
    });
  });

  describe("Scenario 2: High-Leverage Financed", () => {
    // 90% LTV, $2M purchase
    const property = makeProperty({
      purchasePrice: 2_000_000,
      type: "Financed",
      acquisitionLTV: 0.90,
      acquisitionInterestRate: 0.10,
      acquisitionTermYears: 20,
      startAdr: 150,
      roomCount: 20, // Reduced from 50 to 20 to lower revenue
      startOccupancy: 0.20, // Reduced from 0.40 to 0.20 to lower revenue
      maxOccupancy: 0.80,
      occupancyRampMonths: 12,
      occupancyGrowthStep: 0.05,
      costRateAdmin: 0.15, // Increased fixed costs
    });

    const global = makeGlobal({
      modelStartDate: "2026-04-01",
    });

    const result = generatePropertyProForma(property, global, 120);

    it("starts debt outstanding at 90% of purchase price", () => {
      const loanAmount = 2_000_000 * 0.90;
      // In month 0, we pay one month of principal
      expect(result[0].debtOutstanding).toBeLessThan(loanAmount);
      expect(result[0].debtOutstanding).toBeGreaterThan(loanAmount * 0.99);
    });

    it("verifies interest expense is significant", () => {
      const m = result[0];
      expect(m.interestExpense).toBeGreaterThan(m.noi * 0.3); // High leverage -> high interest
    });

    it("may have negative early cash flow", () => {
      const hasNegative = result.slice(0, 12).some(m => m.cashFlow < 0);
      expect(hasNegative).toBe(true);
    });
  });

  describe("Scenario 3: Zero Revenue Month", () => {
    const property = makeProperty({
      startOccupancy: 0,
      maxOccupancy: 0,
      purchasePrice: 1_000_000,
      type: "Financed",
      acquisitionLTV: 0.50,
      acquisitionInterestRate: 0.05,
    });
    const global = makeGlobal();
    const result = generatePropertyProForma(property, global, 12);

    it("verifies zero revenue and variable expenses", () => {
      const m = result[0];
      expect(m.revenueTotal).toBe(0);
      expect(m.expenseRooms).toBe(0);
      expect(m.expenseFB).toBe(0);
      expect(m.expenseMarketing).toBe(0);
    });

    it("verifies debt service continues despite zero revenue", () => {
      const m = result[0];
      expect(m.debtPayment).toBeGreaterThan(0);
      expect(m.interestExpense).toBeGreaterThan(0);
    });
  });

  describe("Scenario 4: Negative Taxable Income", () => {
    const property = makeProperty({
      purchasePrice: 10_000_000, // High purchase price -> high depreciation
      roomCount: 5, // Low room count -> low revenue
      startAdr: 100,
      type: "Financed",
      acquisitionLTV: 0.80,
      acquisitionInterestRate: 0.12, // High interest
      taxRate: 0.25,
    });
    const global = makeGlobal();
    const result = generatePropertyProForma(property, global, 12);

    it("verifies incomeTax is zero when taxable income is negative", () => {
      result.forEach(m => {
        const taxable = m.anoi - m.interestExpense - m.depreciationExpense;
        if (taxable < 0) {
          expect(m.incomeTax).toBe(0);
        }
      });
    });
  });

  describe("Scenario 5: ADR Growth + Inflation", () => {
    const property = makeProperty({
      adrGrowthRate: 0.03,
      purchasePrice: 1_000_000,
      startAdr: 200,
      startOccupancy: 0.80,
      maxOccupancy: 0.80,
    });
    const global = makeGlobal({
      inflationRate: 0.03,
      fixedCostEscalationRate: 0.03,
    });
    const result = generatePropertyProForma(property, global, 36);

    it("verifies year-over-year escalation", () => {
      const year1Rev = result[0].revenueRooms;
      const year2Rev = result[12].revenueRooms;
      const year3Rev = result[24].revenueRooms;

      expect(year2Rev).toBeCloseTo(year1Rev * 1.03, PENNY);
      expect(year3Rev).toBeCloseTo(year1Rev * Math.pow(1.03, 2), PENNY);

      const year1Fixed = result[0].expenseAdmin;
      const year2Fixed = result[12].expenseAdmin;
      expect(year2Fixed).toBeCloseTo(year1Fixed * 1.03, PENNY);
    });
  });

  describe("Scenario 6: Occupancy Ramp", () => {
    const property = makeProperty({
      startOccupancy: 0.30,
      maxOccupancy: 0.90,
      occupancyRampMonths: 12,
      occupancyGrowthStep: 0.10,
    });
    const global = makeGlobal();
    const result = generatePropertyProForma(property, global, 24);

    it("verifies gradual occupancy ramp", () => {
      expect(result[0].occupancy).toBe(0.30);
      // Ramp is step-based: Math.floor(monthsSinceOps / rampMonths)
      expect(result[11].occupancy).toBe(0.30);
      expect(result[12].occupancy).toBe(0.40);
      expect(result[23].occupancy).toBe(0.40);
      // It will take 6 steps of 0.10 to get from 0.30 to 0.90
      // months: 0, 12, 24, 36, 48, 60, 72
      // occ: 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9
    });
  });

  describe("Scenario 7: Refinance Scenario", () => {
    const property = makeProperty({
      type: "Financed",
      acquisitionLTV: 0.50,
      purchasePrice: 2_000_000,
      willRefinance: "Yes",
      refinanceDate: "2028-04-01", // 2 years after 2026-04-01
      refinanceLTV: 0.70,
      refinanceInterestRate: 0.06,
      refinanceTermYears: 20,
    });
    const global = makeGlobal({
      modelStartDate: "2026-04-01",
    });
    const result = generatePropertyProForma(property, global, 60);

    it("verifies debt payment changes at refinance month", () => {
      const beforeRefi = result[23].debtPayment;
      const atRefi = result[24].debtPayment;
      expect(atRefi).not.toBe(beforeRefi);
    });

    it("verifies refiProceeds > 0", () => {
      expect(result[24].refinancingProceeds).toBeGreaterThan(0);
    });
  });
});
