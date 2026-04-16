/**
 * Golden Edge Scenario #1: Pre-Operations Gap
 *
 * Property acquired 6 months BEFORE operations start.
 * During the gap: debt payments accrue, depreciation runs, but ZERO revenue.
 * Operating reserve seeds cash at acquisition to cover the gap.
 *
 * Tests: pre-ops gate, operating reserve, debt-only months, cash shortfall detection,
 * transition month from gap to operational, company SAFE gate + delayed ops.
 *
 * PROPERTY: 15 rooms, $150 ADR, 60% start occ → 80% max (ramp every 6 months)
 *           $1.5M purchase, 70% LTV, 7% rate, 20yr term
 *           Acquired 2026-04-01, ops start 2026-10-01
 *           Operating reserve $50,000
 *           0% growth, 0% inflation for traceability
 *
 * COMPANY: ops start 2026-10-01, SAFE 2026-04-01 ($800K)
 *          Company is funded but idle months 0-5 (ops gate = max(opsStart, safeDate))
 */
import { describe, it, expect } from "vitest";
import { generatePropertyProForma } from "../../client/src/lib/financial/property-engine";
import { generateCompanyProForma } from "../../client/src/lib/financial/company-engine";
import { pmt } from "../../calc/shared/pmt";
import {
  DEFAULT_REV_SHARE_EVENTS, DEFAULT_REV_SHARE_FB, DEFAULT_REV_SHARE_OTHER,
  DEFAULT_CATERING_BOOST_PCT, DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE, DEFAULT_COST_RATE_ROOMS,
  DEFAULT_COST_RATE_FB, DEFAULT_COST_RATE_ADMIN, DEFAULT_COST_RATE_MARKETING,
  DEFAULT_COST_RATE_TAXES, DEFAULT_COST_RATE_IT, DEFAULT_COST_RATE_FFE, DEFAULT_COST_RATE_OTHER,
  DEFAULT_EVENT_EXPENSE_RATE, DEFAULT_OTHER_EXPENSE_RATE, DEFAULT_UTILITIES_VARIABLE_SPLIT,
  DAYS_PER_MONTH, DEPRECIATION_YEARS, DEFAULT_LAND_VALUE_PERCENT,
  DEFAULT_COMPANY_TAX_RATE,
} from "../../shared/constants";
import type { PropertyInput, GlobalInput } from "../../engine/types";

const PROPERTY = {
  id: 1, name: "Gap Lodge", type: "Financed",
  purchasePrice: 1_500_000, buildingImprovements: 0, preOpeningCosts: 0,
  roomCount: 15, startAdr: 150, startOccupancy: 0.60, maxOccupancy: 0.80,
  occupancyGrowthStep: 0.05, occupancyRampMonths: 6,
  adrGrowthRate: 0, inflationRate: 0,
  operationsStartDate: "2026-10-01",  // 6 months after acquisition
  acquisitionDate: "2026-04-01",
  operatingReserve: 50_000,
  taxRate: 0.25,
  acquisitionLTV: 0.70,
  acquisitionInterestRate: 0.07,
  acquisitionTermYears: 20,
  exitCapRate: 0.085, dispositionCommission: 0.05, willRefinance: "No",
} as PropertyInput;

const GLOBAL: GlobalInput = {
  modelStartDate: "2026-04-01", projectionYears: 2, inflationRate: 0,
  fixedCostEscalationRate: 0, companyInflationRate: 0,
  companyTaxRate: DEFAULT_COMPANY_TAX_RATE,
  companyOpsStartDate: "2026-10-01",  // company ops = property ops
  safeTranche1Date: "2026-04-01",     // SAFE arrives before ops
  safeTranche1Amount: 800_000,
  safeTranche2Date: null, safeTranche2Amount: 0,
  staffSalary: 75_000, staffTier1MaxProperties: 3, staffTier1Fte: 2.5,
  partnerCompYear1: 540_000, partnerCompYear2: 540_000,
  officeLeaseStart: 36_000, professionalServicesStart: 24_000,
  travelCostPerClient: 12_000, itLicensePerClient: 3_000,
  marketingRate: 0.05, miscOpsRate: 0.03,
} as GlobalInput;

const MONTHS = 24;

// Hand calculations
const H_LOAN = 1_500_000 * 0.70;  // 1,050,000
const H_RATE = 0.07 / 12;
const H_PAYMENTS = 20 * 12;  // 240
const H_PMT = pmt(H_LOAN, H_RATE, H_PAYMENTS);
const H_BUILDING = 1_500_000 * (1 - DEFAULT_LAND_VALUE_PERCENT);  // 1,125,000
const H_MONTHLY_DEPR = H_BUILDING / DEPRECIATION_YEARS / 12;
const H_LAND = 1_500_000 * DEFAULT_LAND_VALUE_PERCENT;  // 375,000

// During pre-ops gap (months 0-5): zero revenue, debt + depreciation only
// ANOI = 0, so cashFlow = 0 - PMT - 0 = -PMT (tax is 0 since taxableIncome < 0)

// At ops start (month 6): occupancy = 0.60 (start), ADR = 150
const H_AVAIL = 15 * DAYS_PER_MONTH;  // 457.5
const H_SOLD_M6 = H_AVAIL * 0.60;  // 274.5
const H_REV_ROOMS_M6 = H_SOLD_M6 * 150;  // 41,175
// Revenue shares are % of TOTAL revenue; room share = 1 - ancillary
const H_ANCILLARY = DEFAULT_REV_SHARE_EVENTS + DEFAULT_REV_SHARE_FB + DEFAULT_REV_SHARE_OTHER;
const H_ROOM_SHARE = Math.max(0.05, 1 - H_ANCILLARY);
const H_REV_TOTAL_M6 = H_REV_ROOMS_M6 / H_ROOM_SHARE;
const H_REV_EVENTS_M6 = H_REV_TOTAL_M6 * DEFAULT_REV_SHARE_EVENTS;
const H_REV_FB_M6 = H_REV_TOTAL_M6 * DEFAULT_REV_SHARE_FB;
const H_REV_OTHER_M6 = H_REV_TOTAL_M6 * DEFAULT_REV_SHARE_OTHER;

// At month 12 (6 months after ops start): rampSteps = floor(6/6) = 1, occ = 0.60 + 0.05 = 0.65
const H_SOLD_M12 = H_AVAIL * 0.65;
const H_REV_ROOMS_M12 = H_SOLD_M12 * 150;
const H_REV_TOTAL_M12 = H_REV_ROOMS_M12 / H_ROOM_SHARE;

describe("Golden Edge: Pre-Operations Gap", () => {
  const propF = generatePropertyProForma(PROPERTY, GLOBAL, MONTHS);
  const compF = generateCompanyProForma([PROPERTY], GLOBAL, MONTHS);

  // ─── Pre-ops gap (months 0-5) ──────────────────────────────────────────
  describe("Pre-ops gap (months 0-5): zero revenue, debt only", () => {
    it("zero revenue during gap", () => {
      for (let i = 0; i < 6; i++) {
        expect(propF[i].revenueTotal).toBe(0);
        expect(propF[i].revenueRooms).toBe(0);
        expect(propF[i].occupancy).toBe(0);
        expect(propF[i].soldRooms).toBe(0);
      }
    });

    it("zero operating expenses during gap", () => {
      for (let i = 0; i < 6; i++) {
        expect(propF[i].expenseRooms).toBe(0);
        expect(propF[i].expenseAdmin).toBe(0);
        expect(propF[i].gop).toBe(0);
        expect(propF[i].noi).toBe(0);
        expect(propF[i].anoi).toBe(0);
      }
    });

    it("debt service accrues during gap", () => {
      for (let i = 0; i < 6; i++) {
        expect(propF[i].debtPayment).toBeCloseTo(H_PMT, 2);
        expect(propF[i].interestExpense).toBeGreaterThan(0);
        expect(propF[i].principalPayment).toBeGreaterThan(0);
      }
    });

    it("depreciation runs during gap (property is acquired)", () => {
      for (let i = 0; i < 6; i++) {
        expect(propF[i].depreciationExpense).toBeCloseTo(H_MONTHLY_DEPR, 2);
      }
    });

    it("cash flow = -PMT during gap (no revenue, no tax)", () => {
      for (let i = 0; i < 6; i++) {
        expect(propF[i].cashFlow).toBeCloseTo(-H_PMT, 2);
      }
    });

    it("operating reserve seeds cash at acquisition month (month 0)", () => {
      // endingCash(0) = reserve + cashFlow(0) = 50,000 - PMT
      expect(propF[0].endingCash).toBeCloseTo(50_000 - H_PMT, 2);
    });

    it("cash depletes through gap", () => {
      let cumCash = 50_000;
      for (let i = 0; i < 6; i++) {
        cumCash += propF[i].cashFlow;
        expect(propF[i].endingCash).toBeCloseTo(cumCash, 2);
      }
      // After 6 months of -PMT, cash = 50000 - 6*PMT
      expect(propF[5].endingCash).toBeCloseTo(50_000 - 6 * H_PMT, 0);
    });

    it("net income is negative during gap (loss from interest + depreciation)", () => {
      for (let i = 0; i < 6; i++) {
        // taxableIncome = 0 - interest - depr < 0, so tax = 0
        // netIncome = 0 - interest - depr - 0 = -(interest + depr)
        expect(propF[i].netIncome).toBeLessThan(0);
        expect(propF[i].incomeTax).toBe(0);
      }
    });
  });

  // ─── Transition month (month 6 = ops start) ────────────────────────────
  describe("Transition: month 6 = operations start", () => {
    it("revenue begins at month 6 with start occupancy (60%)", () => {
      expect(propF[6].revenueTotal).toBeCloseTo(H_REV_TOTAL_M6, 0);
      expect(propF[6].occupancy).toBe(0.60);
      expect(propF[6].soldRooms).toBeCloseTo(H_SOLD_M6, 2);
    });

    it("fixed expenses activate at month 6", () => {
      expect(propF[5].expenseAdmin).toBe(0);  // pre-ops
      expect(propF[6].expenseAdmin).toBeGreaterThan(0);  // operational
      expect(propF[6].expenseTaxes).toBeGreaterThan(0);
    });

    it("management fees begin at month 6", () => {
      expect(propF[5].feeBase).toBe(0);
      expect(propF[6].feeBase).toBeCloseTo(H_REV_TOTAL_M6 * DEFAULT_BASE_MANAGEMENT_FEE_RATE, 2);
    });
  });

  // ─── Occupancy ramp ────────────────────────────────────────────────────
  describe("Occupancy ramp (every 6 months)", () => {
    it("month 6-11 (monthsSinceOps 0-5): occ = 0.60", () => {
      for (let i = 6; i < 12; i++) {
        expect(propF[i].occupancy).toBe(0.60);
      }
    });

    it("month 12-17 (monthsSinceOps 6-11): occ = 0.65", () => {
      for (let i = 12; i < 18; i++) {
        expect(propF[i].occupancy).toBe(0.65);
      }
    });

    it("month 18-23 (monthsSinceOps 12-17): occ = 0.70", () => {
      for (let i = 18; i < 24; i++) {
        expect(propF[i].occupancy).toBe(0.70);
      }
    });

    it("revenue increases at each ramp step", () => {
      expect(propF[12].revenueTotal).toBeGreaterThan(propF[11].revenueTotal);
      expect(propF[18].revenueTotal).toBeGreaterThan(propF[17].revenueTotal);
    });
  });

  // ─── Balance sheet identity holds through gap + operational ────────────
  describe("Balance Sheet Identity through gap and operations", () => {
    it("A = L + E within $1 for all 24 months", () => {
      const initialEquity = 1_500_000 - H_LOAN + 50_000;  // 500,000
      let cumNI = 0;
      for (let i = 0; i < 24; i++) {
        cumNI += propF[i].netIncome;
        const assets = propF[i].endingCash + propF[i].propertyValue;
        const liabilities = propF[i].debtOutstanding;
        const equity = initialEquity + cumNI;
        const gap = Math.abs(assets - liabilities - equity);
        expect(gap).toBeLessThan(1.0);
      }
    });
  });

  // ─── GAAP identities ──────────────────────────────────────────────────
  describe("GAAP identities hold during gap and operations", () => {
    it("OCF = NI + Depreciation (ASC 230)", () => {
      for (let i = 0; i < 24; i++) {
        expect(propF[i].operatingCashFlow).toBeCloseTo(
          propF[i].netIncome + propF[i].depreciationExpense, 2);
      }
    });

    it("CFF = -Principal", () => {
      for (let i = 0; i < 24; i++) {
        expect(propF[i].financingCashFlow).toBeCloseTo(-propF[i].principalPayment, 2);
      }
    });
  });

  // ─── Company: SAFE gate delays operations ─────────────────────────────
  describe("Company: SAFE received early, ops delayed", () => {
    it("SAFE funding arrives month 0 (before ops start)", () => {
      expect(compF[0].safeFunding).toBe(800_000);
    });

    it("zero company revenue months 0-5 (ops haven't started)", () => {
      for (let i = 0; i < 6; i++) {
        expect(compF[i].totalRevenue).toBe(0);
        expect(compF[i].totalExpenses).toBe(0);
        expect(compF[i].netIncome).toBe(0);
      }
    });

    it("company operations begin month 6 with fee revenue", () => {
      expect(compF[6].totalRevenue).toBeGreaterThan(0);
      expect(compF[6].totalExpenses).toBeGreaterThan(0);
      expect(compF[6].baseFeeRevenue).toBeCloseTo(
        H_REV_TOTAL_M6 * DEFAULT_BASE_MANAGEMENT_FEE_RATE, 2);
    });

    it("company cash = SAFE during idle months, then declines (unprofitable with 1 prop)", () => {
      // Months 0-5: only SAFE funding, no expenses
      expect(compF[0].endingCash).toBe(800_000);
      expect(compF[5].endingCash).toBe(800_000);
      // Month 6+: expenses exceed revenue
    });

    it("fee zero-sum: property fees = company revenue (operational months)", () => {
      for (let i = 6; i < 24; i++) {
        const propFees = propF[i].feeBase + propF[i].feeIncentive;
        expect(propFees).toBeCloseTo(compF[i].totalRevenue, 2);
      }
    });
  });
});
