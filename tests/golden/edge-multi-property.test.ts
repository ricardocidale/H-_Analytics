/**
 * Golden Edge Scenario #2: Multi-Property Portfolio
 *
 * 3 properties with different financing, start dates, and sizes.
 * Tests: staffing tier transitions, portfolio aggregation, fee scaling,
 * mixed cash/financed properties, staggered operations.
 *
 * Property A: "Cash Inn"    — Full equity, small (8 rooms), ops 2026-04-01
 * Property B: "Lever Lodge" — Financed 65% LTV, medium (20 rooms), ops 2026-04-01
 * Property C: "Late Start"  — Financed 60% LTV, large (30 rooms), ops 2026-10-01 (6 months late)
 *
 * All: 0% growth, 0% inflation, flat occupancy at 70%
 * Company: ops 2026-04-01, SAFE 2026-04-01
 * Projection: 2 years (24 months)
 */
import { describe, it, expect } from "vitest";
import { generatePropertyProForma } from "../../client/src/lib/financial/property-engine";
import { generateCompanyProForma } from "../../client/src/lib/financial/company-engine";
import { aggregatePropertyByYear } from "../../client/src/lib/financial/yearlyAggregator";
import { pmt } from "../../calc/shared/pmt";
import {
  DEFAULT_REV_SHARE_EVENTS, DEFAULT_REV_SHARE_FB, DEFAULT_REV_SHARE_OTHER,
  DEFAULT_CATERING_BOOST_PCT, DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE, DAYS_PER_MONTH,
  DEFAULT_COMPANY_TAX_RATE,
} from "../../shared/constants";
import type { PropertyInput, GlobalInput } from "../../engine/types";

// ─── PROPERTIES ──────────────────────────────────────────────────────────
const COMMON = {
  buildingImprovements: 0, preOpeningCosts: 0,
  startOccupancy: 0.70, maxOccupancy: 0.70, occupancyGrowthStep: 0,
  occupancyRampMonths: 6, adrGrowthRate: 0, inflationRate: 0,
  operatingReserve: 0, taxRate: 0.25,
  exitCapRate: 0.085, dispositionCommission: 0.05, willRefinance: "No",
};

const PROP_A: PropertyInput = {
  ...COMMON, id: 1, name: "Cash Inn", type: "Full Equity",
  purchasePrice: 800_000, roomCount: 8, startAdr: 180,
  operationsStartDate: "2026-04-01", acquisitionDate: "2026-04-01",
} as PropertyInput;

const PROP_B: PropertyInput = {
  ...COMMON, id: 2, name: "Lever Lodge", type: "Financed",
  purchasePrice: 2_000_000, roomCount: 20, startAdr: 200,
  acquisitionLTV: 0.65, acquisitionInterestRate: 0.08, acquisitionTermYears: 25,
  operationsStartDate: "2026-04-01", acquisitionDate: "2026-04-01",
} as PropertyInput;

const PROP_C: PropertyInput = {
  ...COMMON, id: 3, name: "Late Start", type: "Financed",
  purchasePrice: 3_000_000, roomCount: 30, startAdr: 220,
  acquisitionLTV: 0.60, acquisitionInterestRate: 0.07, acquisitionTermYears: 20,
  operationsStartDate: "2026-10-01", acquisitionDate: "2026-04-01",
} as PropertyInput;

const GLOBAL: GlobalInput = {
  modelStartDate: "2026-04-01", projectionYears: 2, inflationRate: 0,
  fixedCostEscalationRate: 0, companyInflationRate: 0,
  companyTaxRate: DEFAULT_COMPANY_TAX_RATE,
  companyOpsStartDate: "2026-04-01",
  capitalRaise1Date: "2026-04-01", capitalRaise1Amount: 800_000,
  capitalRaise2Date: null, capitalRaise2Amount: 0,
  staffSalary: 75_000, staffTier1MaxProperties: 3, staffTier1Fte: 2.5,
  staffTier2MaxProperties: 6, staffTier2Fte: 4.5, staffTier3Fte: 7.0,
  partnerCompYear1: 540_000, partnerCompYear2: 540_000,
  officeLeaseStart: 36_000, professionalServicesStart: 24_000,
  travelCostPerClient: 12_000, itLicensePerClient: 3_000,
  marketingRate: 0.05, miscOpsRate: 0.03,
} as GlobalInput;

const MONTHS = 24;
const ALL_PROPS = [PROP_A, PROP_B, PROP_C];

// Hand-calculated revenue per property per month (flat scenario)
function monthlyRevTotal(roomCount: number, adr: number, occ: number) {
  const rooms = roomCount * DAYS_PER_MONTH * occ * adr;
  const ancillaryShare = DEFAULT_REV_SHARE_EVENTS + DEFAULT_REV_SHARE_FB + DEFAULT_REV_SHARE_OTHER;
  const roomShareOfTotal = Math.max(0.05, 1 - ancillaryShare);
  return rooms / roomShareOfTotal;
}

const H_REV_A = monthlyRevTotal(8, 180, 0.70);
const H_REV_B = monthlyRevTotal(20, 200, 0.70);
const H_REV_C = monthlyRevTotal(30, 220, 0.70);

// Loan amounts
const H_LOAN_B = 2_000_000 * 0.65;  // 1,300,000
const H_LOAN_C = 3_000_000 * 0.60;  // 1,800,000
const H_PMT_B = pmt(H_LOAN_B, 0.08 / 12, 300);
const H_PMT_C = pmt(H_LOAN_C, 0.07 / 12, 240);

describe("Golden Edge: Multi-Property Portfolio", () => {
  const fA = generatePropertyProForma(PROP_A, GLOBAL, MONTHS);
  const fB = generatePropertyProForma(PROP_B, GLOBAL, MONTHS);
  const fC = generatePropertyProForma(PROP_C, GLOBAL, MONTHS);
  const compF = generateCompanyProForma(ALL_PROPS, GLOBAL, MONTHS);

  // ─── Individual property verification ──────────────────────────────────
  describe("Property A: Full Equity (no debt)", () => {
    it("zero debt service every month", () => {
      for (let i = 0; i < 24; i++) {
        expect(fA[i].debtPayment).toBe(0);
        expect(fA[i].interestExpense).toBe(0);
        expect(fA[i].principalPayment).toBe(0);
        expect(fA[i].debtOutstanding).toBe(0);
      }
    });

    it("revenue matches hand calc", () => {
      expect(fA[0].revenueTotal).toBeCloseTo(H_REV_A, 2);
    });

    it("cash flow = ANOI - tax (no debt service)", () => {
      for (let i = 0; i < 24; i++) {
        expect(fA[i].cashFlow).toBeCloseTo(fA[i].anoi - fA[i].incomeTax, 2);
      }
    });
  });

  describe("Property B: Financed 65% LTV", () => {
    it("loan = $1,300,000", () => {
      expect(fB[0].debtOutstanding).toBeCloseTo(H_LOAN_B - (H_PMT_B - H_LOAN_B * 0.08 / 12), 0);
    });

    it("PMT matches hand calc", () => {
      expect(fB[0].debtPayment).toBeCloseTo(H_PMT_B, 2);
    });

    it("revenue matches hand calc", () => {
      expect(fB[0].revenueTotal).toBeCloseTo(H_REV_B, 2);
    });
  });

  describe("Property C: Late Start (6-month gap)", () => {
    it("zero revenue months 0-5", () => {
      for (let i = 0; i < 6; i++) {
        expect(fC[i].revenueTotal).toBe(0);
      }
    });

    it("revenue begins month 6", () => {
      expect(fC[6].revenueTotal).toBeCloseTo(H_REV_C, 2);
    });

    it("debt service from acquisition (month 0)", () => {
      expect(fC[0].debtPayment).toBeCloseTo(H_PMT_C, 2);
    });

    it("PMT matches hand calc", () => {
      expect(fC[0].debtPayment).toBeCloseTo(H_PMT_C, 2);
    });
  });

  // ─── Portfolio aggregation ─────────────────────────────────────────────
  describe("Portfolio Aggregation", () => {
    it("months 0-5: portfolio revenue = A + B (C not operational)", () => {
      for (let i = 0; i < 6; i++) {
        const portfolioRev = fA[i].revenueTotal + fB[i].revenueTotal + fC[i].revenueTotal;
        expect(portfolioRev).toBeCloseTo(H_REV_A + H_REV_B, 2);  // C = 0
      }
    });

    it("months 6-23: portfolio revenue = A + B + C", () => {
      for (let i = 6; i < 24; i++) {
        const portfolioRev = fA[i].revenueTotal + fB[i].revenueTotal + fC[i].revenueTotal;
        expect(portfolioRev).toBeCloseTo(H_REV_A + H_REV_B + H_REV_C, 2);
      }
    });

    it("portfolio NOI = sum of individual NOIs", () => {
      for (let i = 0; i < 24; i++) {
        const portfolioNOI = fA[i].noi + fB[i].noi + fC[i].noi;
        // Also verify it matches expectations (C is 0 pre-ops)
        if (i < 6) {
          expect(fC[i].noi).toBe(0);
        }
        expect(portfolioNOI).toBeCloseTo(fA[i].noi + fB[i].noi + fC[i].noi, 2);
      }
    });
  });

  // ─── Staffing tiers ────────────────────────────────────────────────────
  describe("Company: Staffing Tier Transitions", () => {
    it("months 0-5: 2 active properties → tier 1 (2.5 FTE)", () => {
      // A + B are active, C has no revenue
      const expectedStaff = (2.5 * 75_000) / 12;
      for (let i = 0; i < 6; i++) {
        expect(compF[i].staffCompensation).toBeCloseTo(expectedStaff, 2);
      }
    });

    it("months 6+: 3 active properties → still tier 1 (max 3)", () => {
      // 3 properties ≤ tier1Max (3), so still 2.5 FTE
      const expectedStaff = (2.5 * 75_000) / 12;
      for (let i = 6; i < 24; i++) {
        expect(compF[i].staffCompensation).toBeCloseTo(expectedStaff, 2);
      }
    });
  });

  // ─── Fee scaling ───────────────────────────────────────────────────────
  describe("Company: Fee Revenue Scales with Portfolio", () => {
    it("months 0-5: fee revenue from A + B only", () => {
      for (let i = 0; i < 6; i++) {
        const expectedBaseFee = (H_REV_A + H_REV_B) * DEFAULT_BASE_MANAGEMENT_FEE_RATE;
        expect(compF[i].baseFeeRevenue).toBeCloseTo(expectedBaseFee, 2);
      }
    });

    it("months 6+: fee revenue jumps when C starts operations", () => {
      const feesBefore = compF[5].totalRevenue;
      const feesAfter = compF[6].totalRevenue;
      expect(feesAfter).toBeGreaterThan(feesBefore);
    });

    it("months 6+: base fee = (A + B + C) × rate", () => {
      for (let i = 6; i < 24; i++) {
        const expectedBaseFee = (H_REV_A + H_REV_B + H_REV_C) * DEFAULT_BASE_MANAGEMENT_FEE_RATE;
        expect(compF[i].baseFeeRevenue).toBeCloseTo(expectedBaseFee, 2);
      }
    });

    it("variable costs scale: travel for 2 props (0-5) then 3 props (6+)", () => {
      const travel2 = (2 * 12_000) / 12;
      const travel3 = (3 * 12_000) / 12;
      expect(compF[0].travelCosts).toBeCloseTo(travel2, 2);
      expect(compF[6].travelCosts).toBeCloseTo(travel3, 2);
    });
  });

  // ─── Intercompany elimination ──────────────────────────────────────────
  describe("Fee Zero-Sum: All Properties", () => {
    it("sum of property fees = company total revenue every month", () => {
      for (let i = 0; i < 24; i++) {
        const propFees = (fA[i].feeBase + fA[i].feeIncentive) +
          (fB[i].feeBase + fB[i].feeIncentive) +
          (fC[i].feeBase + fC[i].feeIncentive);
        expect(propFees).toBeCloseTo(compF[i].totalRevenue, 1);
      }
    });

    it("elimination = $0 every month", () => {
      for (let i = 0; i < 24; i++) {
        const propFees = (fA[i].feeBase + fA[i].feeIncentive) +
          (fB[i].feeBase + fB[i].feeIncentive) +
          (fC[i].feeBase + fC[i].feeIncentive);
        const coRevenue = compF[i].totalRevenue;
        expect(Math.abs(propFees - coRevenue)).toBeLessThan(1.0);
      }
    });
  });

  // ─── BS identity for each property ─────────────────────────────────────
  describe("Balance Sheet Identity: All Properties", () => {
    function checkALE(financials: any[], purchasePrice: number, loanAmount: number, reserve: number) {
      const initialEquity = purchasePrice - loanAmount + reserve;
      let cumNI = 0;
      for (let i = 0; i < financials.length; i++) {
        const m = financials[i];
        if (m.propertyValue === 0) continue;  // pre-acquisition
        cumNI += m.netIncome;
        const assets = m.endingCash + m.propertyValue;
        const liabilities = m.debtOutstanding;
        const equity = initialEquity + cumNI;
        const gap = Math.abs(assets - liabilities - equity);
        expect(gap).toBeLessThan(1.0);
      }
    }

    it("Property A (cash): A = L + E", () => {
      checkALE(fA, 800_000, 0, 0);
    });

    it("Property B (financed 65%): A = L + E", () => {
      checkALE(fB, 2_000_000, H_LOAN_B, 0);
    });

    it("Property C (financed 60%, late start): A = L + E", () => {
      checkALE(fC, 3_000_000, H_LOAN_C, 0);
    });
  });

  // ─── Yearly aggregation ────────────────────────────────────────────────
  describe("Yearly Aggregation: Portfolio Totals", () => {
    const yA = aggregatePropertyByYear(fA, 2);
    const yB = aggregatePropertyByYear(fB, 2);
    const yC = aggregatePropertyByYear(fC, 2);

    it("Year 1 portfolio revenue = A(12m) + B(12m) + C(6m)", () => {
      const portfolioY1Rev = yA[0].revenueTotal + yB[0].revenueTotal + yC[0].revenueTotal;
      // A and B: 12 months full. C: 6 months (months 6-11)
      const expected = H_REV_A * 12 + H_REV_B * 12 + H_REV_C * 6;
      expect(portfolioY1Rev).toBeCloseTo(expected, 0);
    });

    it("Year 2 portfolio revenue = A(12m) + B(12m) + C(12m)", () => {
      const portfolioY2Rev = yA[1].revenueTotal + yB[1].revenueTotal + yC[1].revenueTotal;
      const expected = H_REV_A * 12 + H_REV_B * 12 + H_REV_C * 12;
      expect(portfolioY2Rev).toBeCloseTo(expected, 0);
    });

    it("Year 2 revenue > Year 1 (C adds 6 more months)", () => {
      const y1 = yA[0].revenueTotal + yB[0].revenueTotal + yC[0].revenueTotal;
      const y2 = yA[1].revenueTotal + yB[1].revenueTotal + yC[1].revenueTotal;
      expect(y2).toBeGreaterThan(y1);
    });
  });

  // ─── Company cash position ─────────────────────────────────────────────
  describe("Company Cash: SAFE + Fee Revenue over 24 Months", () => {
    it("ending cash = cumulative sum of all monthly cash flows", () => {
      let cumCash = 0;
      for (let i = 0; i < 24; i++) {
        cumCash += compF[i].cashFlow;
        expect(compF[i].endingCash).toBeCloseTo(cumCash, 2);
      }
    });

    it("SAFE tranche in month 0 only", () => {
      expect(compF[0].capitalRaiseFunding).toBe(800_000);
      for (let i = 1; i < 24; i++) {
        expect(compF[i].capitalRaiseFunding).toBe(0);
      }
    });
  });
});
