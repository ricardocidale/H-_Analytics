/**
 * Golden Scenario: Management Company Aggregation with 2 Properties
 *
 * Tests that the company engine correctly aggregates fees, expenses, and
 * cash flows from two properties with different characteristics. Verifies
 * company IS, CF, BS, intercompany elimination, and portfolio aggregation.
 *
 * PROPERTY A: "Alpine Inn" — 10 rooms, $180 ADR, Cash purchase, $800K
 * PROPERTY B: "Harbor Hotel" — 25 rooms, $220 ADR, Financed 65% LTV, $3M, 7.5%, 20yr
 *
 * Both: 70% flat occupancy, 0% growth/inflation, taxRate 25%, no reserve.
 * Model start = ops start = acq date = 2026-04-01, projection = 24 months.
 *
 * COMPANY: ops start 2026-04-01, SAFE $800K tranche 1 same date.
 *          Partner comp $540K/yr, staff $75K/yr, 2.5 FTE (tier 1: 2 props ≤ 3).
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
  DEFAULT_COST_RATE_PROPERTY_OPS, DEFAULT_COST_RATE_UTILITIES, DEFAULT_COST_RATE_INSURANCE,
  DEFAULT_EVENT_EXPENSE_RATE, DEFAULT_OTHER_EXPENSE_RATE, DEFAULT_UTILITIES_VARIABLE_SPLIT,
  DAYS_PER_MONTH, DEPRECIATION_YEARS, DEFAULT_LAND_VALUE_PERCENT,
  DEFAULT_COMPANY_TAX_RATE, DEFAULT_BUSINESS_INSURANCE_START,
} from "../../shared/constants";

// ═══════════════════════════════════════════════════════════════════
// PROPERTY DEFINITIONS
// ═══════════════════════════════════════════════════════════════════

const PROP_A = {
  id: 1, name: "Alpine Inn", type: "Cash",
  purchasePrice: 800_000, buildingImprovements: 0, preOpeningCosts: 0,
  roomCount: 10, startAdr: 180, startOccupancy: 0.70, maxOccupancy: 0.70,
  occupancyGrowthStep: 0, occupancyRampMonths: 6,
  adrGrowthRate: 0, inflationRate: 0,
  operationsStartDate: "2026-04-01", acquisitionDate: "2026-04-01",
  operatingReserve: 0, taxRate: 0.25,
  exitCapRate: 0.085, dispositionCommission: 0.05, willRefinance: "No",
} as any;

const PROP_B = {
  id: 2, name: "Harbor Hotel", type: "Financed",
  purchasePrice: 3_000_000, buildingImprovements: 0, preOpeningCosts: 0,
  roomCount: 25, startAdr: 220, startOccupancy: 0.70, maxOccupancy: 0.70,
  occupancyGrowthStep: 0, occupancyRampMonths: 6,
  adrGrowthRate: 0, inflationRate: 0,
  operationsStartDate: "2026-04-01", acquisitionDate: "2026-04-01",
  operatingReserve: 0, taxRate: 0.25,
  acquisitionLTV: 0.65, acquisitionInterestRate: 0.075, acquisitionTermYears: 20,
  exitCapRate: 0.085, dispositionCommission: 0.05, willRefinance: "No",
} as any;

const GLOBAL = {
  modelStartDate: "2026-04-01", projectionYears: 2, inflationRate: 0,
  fixedCostEscalationRate: 0, companyInflationRate: 0,
  companyTaxRate: DEFAULT_COMPANY_TAX_RATE,
  companyOpsStartDate: "2026-04-01",
  safeTranche1Date: "2026-04-01", safeTranche1Amount: 800_000,
  safeTranche2Date: null, safeTranche2Amount: 0,
  staffSalary: 75_000, staffTier1MaxProperties: 3, staffTier1Fte: 2.5,
  partnerCompYear1: 540_000, partnerCompYear2: 540_000,
  officeLeaseStart: 36_000, professionalServicesStart: 24_000,
  travelCostPerClient: 12_000, itLicensePerClient: 3_000,
  marketingRate: 0.05, miscOpsRate: 0.03,
} as any;

const MONTHS = 24;

// ═══════════════════════════════════════════════════════════════════
// HAND CALCULATIONS — PROPERTY A (Cash, 10 rooms, $180 ADR)
// ═══════════════════════════════════════════════════════════════════

const H_A_AVAIL = 10 * DAYS_PER_MONTH;  // 305
const H_A_SOLD = H_A_AVAIL * 0.70;  // 213.5
const H_A_REV_ROOMS = H_A_SOLD * 180;  // 38,430
// Revenue shares are % of TOTAL revenue; room share = 1 - ancillary
const H_A_ANCILLARY = DEFAULT_REV_SHARE_EVENTS + DEFAULT_REV_SHARE_FB + DEFAULT_REV_SHARE_OTHER;
const H_A_ROOM_SHARE = Math.max(0.05, 1 - H_A_ANCILLARY);
const H_A_REV_TOTAL = H_A_REV_ROOMS / H_A_ROOM_SHARE;
const H_A_REV_EVENTS = H_A_REV_TOTAL * DEFAULT_REV_SHARE_EVENTS;
const H_A_REV_FB = H_A_REV_TOTAL * DEFAULT_REV_SHARE_FB;
const H_A_REV_OTHER = H_A_REV_TOTAL * DEFAULT_REV_SHARE_OTHER;

// Expenses
const H_A_EXP_ROOMS = H_A_REV_ROOMS * DEFAULT_COST_RATE_ROOMS;
const H_A_EXP_FB = H_A_REV_FB * DEFAULT_COST_RATE_FB;
const H_A_EXP_EVENTS = H_A_REV_EVENTS * DEFAULT_EVENT_EXPENSE_RATE;
const H_A_EXP_OTHER = H_A_REV_OTHER * DEFAULT_OTHER_EXPENSE_RATE;
const H_A_EXP_MARKETING = H_A_REV_TOTAL * DEFAULT_COST_RATE_MARKETING;
const H_A_EXP_UTIL_VAR = H_A_REV_TOTAL * (DEFAULT_COST_RATE_UTILITIES * DEFAULT_UTILITIES_VARIABLE_SPLIT);
const H_A_EXP_FFE = H_A_REV_TOTAL * DEFAULT_COST_RATE_FFE;
const H_A_EXP_ADMIN = H_A_REV_TOTAL * DEFAULT_COST_RATE_ADMIN;  // base=actual since 0% growth
const H_A_EXP_PROP_OPS = H_A_REV_TOTAL * DEFAULT_COST_RATE_PROPERTY_OPS;
const H_A_EXP_IT = H_A_REV_TOTAL * DEFAULT_COST_RATE_IT;
const H_A_EXP_TAXES = (800_000 / 12) * DEFAULT_COST_RATE_TAXES;
const H_A_EXP_UTIL_FIXED = H_A_REV_TOTAL * (DEFAULT_COST_RATE_UTILITIES * (1 - DEFAULT_UTILITIES_VARIABLE_SPLIT));
const H_A_EXP_OTHER_COSTS = H_A_REV_TOTAL * DEFAULT_COST_RATE_OTHER;
const H_A_EXP_INSURANCE = (800_000 / 12) * DEFAULT_COST_RATE_INSURANCE;

const H_A_TOTAL_OP_EXP = H_A_EXP_ROOMS + H_A_EXP_FB + H_A_EXP_EVENTS + H_A_EXP_OTHER +
  H_A_EXP_MARKETING + H_A_EXP_PROP_OPS + H_A_EXP_UTIL_VAR +
  H_A_EXP_ADMIN + H_A_EXP_IT + H_A_EXP_UTIL_FIXED + H_A_EXP_OTHER_COSTS + H_A_EXP_INSURANCE;

const H_A_GOP = H_A_REV_TOTAL - H_A_TOTAL_OP_EXP;
const H_A_FEE_BASE = H_A_REV_TOTAL * DEFAULT_BASE_MANAGEMENT_FEE_RATE;
const H_A_FEE_INCENTIVE = Math.max(0, H_A_GOP * DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE);
const H_A_AGOP = H_A_GOP - H_A_FEE_BASE - H_A_FEE_INCENTIVE;
const H_A_NOI = H_A_AGOP - H_A_EXP_TAXES;
const H_A_ANOI = H_A_NOI - H_A_EXP_FFE;

// No debt for Cash property
const H_A_BUILDING = 800_000 * (1 - DEFAULT_LAND_VALUE_PERCENT);
const H_A_DEPR = H_A_BUILDING / DEPRECIATION_YEARS / 12;
const H_A_TAXABLE = H_A_ANOI - 0 - H_A_DEPR;
const H_A_TAX = H_A_TAXABLE > 0 ? H_A_TAXABLE * 0.25 : 0;
const H_A_NET_INCOME = H_A_ANOI - 0 - H_A_DEPR - H_A_TAX;
const H_A_CASH_FLOW = H_A_ANOI - 0 - H_A_TAX;

// ═══════════════════════════════════════════════════════════════════
// HAND CALCULATIONS — PROPERTY B (Financed, 25 rooms, $220 ADR)
// ═══════════════════════════════════════════════════════════════════

const H_B_AVAIL = 25 * DAYS_PER_MONTH;  // 762.5
const H_B_SOLD = H_B_AVAIL * 0.70;  // 533.75
const H_B_REV_ROOMS = H_B_SOLD * 220;  // 117,425
// Revenue shares are % of TOTAL revenue; room share = 1 - ancillary
const H_B_ANCILLARY = DEFAULT_REV_SHARE_EVENTS + DEFAULT_REV_SHARE_FB + DEFAULT_REV_SHARE_OTHER;
const H_B_ROOM_SHARE = Math.max(0.05, 1 - H_B_ANCILLARY);
const H_B_REV_TOTAL = H_B_REV_ROOMS / H_B_ROOM_SHARE;
const H_B_REV_EVENTS = H_B_REV_TOTAL * DEFAULT_REV_SHARE_EVENTS;
const H_B_REV_FB = H_B_REV_TOTAL * DEFAULT_REV_SHARE_FB;
const H_B_REV_OTHER = H_B_REV_TOTAL * DEFAULT_REV_SHARE_OTHER;

// Expenses
const H_B_EXP_ROOMS = H_B_REV_ROOMS * DEFAULT_COST_RATE_ROOMS;
const H_B_EXP_FB = H_B_REV_FB * DEFAULT_COST_RATE_FB;
const H_B_EXP_EVENTS = H_B_REV_EVENTS * DEFAULT_EVENT_EXPENSE_RATE;
const H_B_EXP_OTHER = H_B_REV_OTHER * DEFAULT_OTHER_EXPENSE_RATE;
const H_B_EXP_MARKETING = H_B_REV_TOTAL * DEFAULT_COST_RATE_MARKETING;
const H_B_EXP_UTIL_VAR = H_B_REV_TOTAL * (DEFAULT_COST_RATE_UTILITIES * DEFAULT_UTILITIES_VARIABLE_SPLIT);
const H_B_EXP_FFE = H_B_REV_TOTAL * DEFAULT_COST_RATE_FFE;
const H_B_EXP_ADMIN = H_B_REV_TOTAL * DEFAULT_COST_RATE_ADMIN;
const H_B_EXP_PROP_OPS = H_B_REV_TOTAL * DEFAULT_COST_RATE_PROPERTY_OPS;
const H_B_EXP_IT = H_B_REV_TOTAL * DEFAULT_COST_RATE_IT;
const H_B_EXP_TAXES = (3_000_000 / 12) * DEFAULT_COST_RATE_TAXES;
const H_B_EXP_UTIL_FIXED = H_B_REV_TOTAL * (DEFAULT_COST_RATE_UTILITIES * (1 - DEFAULT_UTILITIES_VARIABLE_SPLIT));
const H_B_EXP_OTHER_COSTS = H_B_REV_TOTAL * DEFAULT_COST_RATE_OTHER;
const H_B_EXP_INSURANCE = (3_000_000 / 12) * DEFAULT_COST_RATE_INSURANCE;

const H_B_TOTAL_OP_EXP = H_B_EXP_ROOMS + H_B_EXP_FB + H_B_EXP_EVENTS + H_B_EXP_OTHER +
  H_B_EXP_MARKETING + H_B_EXP_PROP_OPS + H_B_EXP_UTIL_VAR +
  H_B_EXP_ADMIN + H_B_EXP_IT + H_B_EXP_UTIL_FIXED + H_B_EXP_OTHER_COSTS + H_B_EXP_INSURANCE;

const H_B_GOP = H_B_REV_TOTAL - H_B_TOTAL_OP_EXP;
const H_B_FEE_BASE = H_B_REV_TOTAL * DEFAULT_BASE_MANAGEMENT_FEE_RATE;
const H_B_FEE_INCENTIVE = Math.max(0, H_B_GOP * DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE);
const H_B_AGOP = H_B_GOP - H_B_FEE_BASE - H_B_FEE_INCENTIVE;
const H_B_NOI = H_B_AGOP - H_B_EXP_TAXES;
const H_B_ANOI = H_B_NOI - H_B_EXP_FFE;

// Debt
const H_B_LOAN = 3_000_000 * 0.65;  // 1,950,000
const H_B_RATE = 0.075 / 12;  // 0.00625
const H_B_PAYMENTS = 20 * 12;  // 240
const H_B_PMT = pmt(H_B_LOAN, H_B_RATE, H_B_PAYMENTS);
const H_B_INTEREST_M0 = H_B_LOAN * H_B_RATE;  // 12,187.50
const H_B_PRINCIPAL_M0 = H_B_PMT - H_B_INTEREST_M0;
const H_B_DEBT_M0 = H_B_LOAN - H_B_PRINCIPAL_M0;

const H_B_BUILDING = 3_000_000 * (1 - DEFAULT_LAND_VALUE_PERCENT);
const H_B_DEPR = H_B_BUILDING / DEPRECIATION_YEARS / 12;
const H_B_TAXABLE = H_B_ANOI - H_B_INTEREST_M0 - H_B_DEPR;
const H_B_TAX = H_B_TAXABLE > 0 ? H_B_TAXABLE * 0.25 : 0;
const H_B_NET_INCOME = H_B_ANOI - H_B_INTEREST_M0 - H_B_DEPR - H_B_TAX;
const H_B_CASH_FLOW = H_B_ANOI - H_B_PMT - H_B_TAX;

// ═══════════════════════════════════════════════════════════════════
// HAND CALCULATIONS — COMPANY (aggregated from both properties)
// ═══════════════════════════════════════════════════════════════════

// Fee revenue = sum of both properties' fees
const H_CO_BASE_FEE = H_A_FEE_BASE + H_B_FEE_BASE;
const H_CO_INCENTIVE_FEE = H_A_FEE_INCENTIVE + H_B_FEE_INCENTIVE;
const H_CO_TOTAL_REV = H_CO_BASE_FEE + H_CO_INCENTIVE_FEE;

// Company expenses (2 active properties, tier 1: ≤3 → 2.5 FTE)
const H_CO_PARTNER_COMP = 540_000 / 12;  // 45,000
const H_CO_STAFF_COMP = (2.5 * 75_000) / 12;  // 15,625
const H_CO_OFFICE = 36_000 / 12;  // 3,000
const H_CO_PROF_SERVICES = 24_000 / 12;  // 2,000
const H_CO_TECH = 18_000 / 12;  // 1,500
const H_CO_TRAVEL = (2 * 12_000) / 12;  // 2,000 (2 properties)
const H_CO_IT_LICENSE = (2 * 3_000) / 12;  // 500 (2 properties)
const H_CO_MARKETING = H_CO_TOTAL_REV * 0.05;
const H_CO_MISC = H_CO_TOTAL_REV * 0.03;
const H_CO_INSURANCE = DEFAULT_BUSINESS_INSURANCE_START / 12;

const H_CO_TOTAL_EXP = H_CO_PARTNER_COMP + H_CO_STAFF_COMP + H_CO_OFFICE +
  H_CO_PROF_SERVICES + H_CO_TECH + H_CO_INSURANCE +
  H_CO_TRAVEL + H_CO_IT_LICENSE + H_CO_MARKETING + H_CO_MISC;

const H_CO_PRE_TAX = H_CO_TOTAL_REV - H_CO_TOTAL_EXP;
const H_CO_TAX = H_CO_PRE_TAX > 0 ? H_CO_PRE_TAX * DEFAULT_COMPANY_TAX_RATE : 0;
const H_CO_NET_INCOME = H_CO_PRE_TAX - H_CO_TAX;

// SAFE funding at month 0
const H_CO_SAFE = 800_000;
const H_CO_CASH_FLOW_M0 = H_CO_NET_INCOME + H_CO_SAFE;
const H_CO_CASH_FLOW_REST = H_CO_NET_INCOME;  // no SAFE after month 0

// ═══════════════════════════════════════════════════════════════════
// PORTFOLIO AGGREGATION
// ═══════════════════════════════════════════════════════════════════

const H_PORT_REV_TOTAL = H_A_REV_TOTAL + H_B_REV_TOTAL;
const H_PORT_NOI = H_A_NOI + H_B_NOI;
const H_PORT_ANOI = H_A_ANOI + H_B_ANOI;
const H_PORT_FEE_BASE = H_A_FEE_BASE + H_B_FEE_BASE;
const H_PORT_FEE_INCENTIVE = H_A_FEE_INCENTIVE + H_B_FEE_INCENTIVE;

// ═══════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════

describe("Golden: Company Aggregation with 2 Properties", () => {
  const propA = generatePropertyProForma(PROP_A, GLOBAL, MONTHS);
  const propB = generatePropertyProForma(PROP_B, GLOBAL, MONTHS);
  const comp = generateCompanyProForma([PROP_A, PROP_B], GLOBAL, MONTHS);

  // ─── Property A: Revenue & USALI Waterfall ─────────────────────────────
  describe("Property A (Alpine Inn, Cash): month 0 verification", () => {
    it("revenue matches hand calculation", () => {
      expect(propA[0].revenueRooms).toBeCloseTo(H_A_REV_ROOMS, 2);
      expect(propA[0].revenueEvents).toBeCloseTo(H_A_REV_EVENTS, 2);
      expect(propA[0].revenueFB).toBeCloseTo(H_A_REV_FB, 2);
      expect(propA[0].revenueOther).toBeCloseTo(H_A_REV_OTHER, 2);
      expect(propA[0].revenueTotal).toBeCloseTo(H_A_REV_TOTAL, 2);
    });

    it("USALI waterfall matches hand calculation", () => {
      expect(propA[0].gop).toBeCloseTo(H_A_GOP, 2);
      expect(propA[0].feeBase).toBeCloseTo(H_A_FEE_BASE, 2);
      expect(propA[0].feeIncentive).toBeCloseTo(H_A_FEE_INCENTIVE, 2);
      expect(propA[0].noi).toBeCloseTo(H_A_NOI, 2);
      expect(propA[0].anoi).toBeCloseTo(H_A_ANOI, 2);
    });

    it("no debt service (cash property)", () => {
      expect(propA[0].debtPayment).toBe(0);
      expect(propA[0].interestExpense).toBe(0);
      expect(propA[0].principalPayment).toBe(0);
      expect(propA[0].debtOutstanding).toBe(0);
    });

    it("income statement matches hand calculation", () => {
      expect(propA[0].depreciationExpense).toBeCloseTo(H_A_DEPR, 2);
      expect(propA[0].incomeTax).toBeCloseTo(H_A_TAX, 2);
      expect(propA[0].netIncome).toBeCloseTo(H_A_NET_INCOME, 2);
    });

    it("cash flow matches hand calculation", () => {
      expect(propA[0].cashFlow).toBeCloseTo(H_A_CASH_FLOW, 2);
      expect(propA[0].endingCash).toBeCloseTo(H_A_CASH_FLOW, 2);  // month 0, no reserve
    });
  });

  // ─── Property B: Revenue & Debt ────────────────────────────────────────
  describe("Property B (Harbor Hotel, Financed): month 0 verification", () => {
    it("revenue matches hand calculation", () => {
      expect(propB[0].revenueRooms).toBeCloseTo(H_B_REV_ROOMS, 2);
      expect(propB[0].revenueEvents).toBeCloseTo(H_B_REV_EVENTS, 2);
      expect(propB[0].revenueFB).toBeCloseTo(H_B_REV_FB, 2);
      expect(propB[0].revenueOther).toBeCloseTo(H_B_REV_OTHER, 2);
      expect(propB[0].revenueTotal).toBeCloseTo(H_B_REV_TOTAL, 2);
    });

    it("USALI waterfall matches hand calculation", () => {
      expect(propB[0].gop).toBeCloseTo(H_B_GOP, 2);
      expect(propB[0].feeBase).toBeCloseTo(H_B_FEE_BASE, 2);
      expect(propB[0].feeIncentive).toBeCloseTo(H_B_FEE_INCENTIVE, 2);
      expect(propB[0].noi).toBeCloseTo(H_B_NOI, 2);
      expect(propB[0].anoi).toBeCloseTo(H_B_ANOI, 2);
    });

    it("debt service matches hand calculation", () => {
      expect(propB[0].debtPayment).toBeCloseTo(H_B_PMT, 2);
      expect(propB[0].interestExpense).toBeCloseTo(H_B_INTEREST_M0, 2);
      expect(propB[0].principalPayment).toBeCloseTo(H_B_PRINCIPAL_M0, 2);
      expect(propB[0].debtOutstanding).toBeCloseTo(H_B_DEBT_M0, 2);
    });

    it("income statement matches hand calculation", () => {
      expect(propB[0].depreciationExpense).toBeCloseTo(H_B_DEPR, 2);
      expect(propB[0].incomeTax).toBeCloseTo(H_B_TAX, 2);
      expect(propB[0].netIncome).toBeCloseTo(H_B_NET_INCOME, 2);
    });

    it("cash flow matches hand calculation", () => {
      expect(propB[0].cashFlow).toBeCloseTo(H_B_CASH_FLOW, 2);
    });
  });

  // ─── Monthly Invariance (0% growth/inflation) ─────────────────────────
  describe("Monthly invariance: all months identical (except debt amortization)", () => {
    it("Property A: revenue and NOI identical every month", () => {
      for (let i = 1; i < 24; i++) {
        expect(propA[i].revenueTotal).toBeCloseTo(H_A_REV_TOTAL, 2);
        expect(propA[i].noi).toBeCloseTo(H_A_NOI, 2);
        expect(propA[i].anoi).toBeCloseTo(H_A_ANOI, 2);
      }
    });

    it("Property B: revenue and NOI identical every month", () => {
      for (let i = 1; i < 24; i++) {
        expect(propB[i].revenueTotal).toBeCloseTo(H_B_REV_TOTAL, 2);
        expect(propB[i].noi).toBeCloseTo(H_B_NOI, 2);
        expect(propB[i].anoi).toBeCloseTo(H_B_ANOI, 2);
      }
    });
  });

  // ─── Company Income Statement ─────────────────────────────────────────
  describe("Company IS: fee revenue aggregation", () => {
    it("base fee revenue = sum of both properties' base fees", () => {
      expect(comp[0].baseFeeRevenue).toBeCloseTo(H_CO_BASE_FEE, 2);
    });

    it("incentive fee revenue = sum of both properties' incentive fees", () => {
      expect(comp[0].incentiveFeeRevenue).toBeCloseTo(H_CO_INCENTIVE_FEE, 2);
    });

    it("total revenue = base + incentive fees", () => {
      expect(comp[0].totalRevenue).toBeCloseTo(H_CO_TOTAL_REV, 2);
    });

    it("company revenue is identical every month (0% growth)", () => {
      for (let i = 1; i < 24; i++) {
        expect(comp[i].totalRevenue).toBeCloseTo(H_CO_TOTAL_REV, 2);
      }
    });
  });

  describe("Company IS: expense categories", () => {
    it("partner compensation = $540K/12 = $45K/month", () => {
      expect(comp[0].partnerCompensation).toBeCloseTo(H_CO_PARTNER_COMP, 2);
    });

    it("staff compensation = 2.5 FTE × $75K/12 (tier 1 for 2 properties)", () => {
      expect(comp[0].staffCompensation).toBeCloseTo(H_CO_STAFF_COMP, 2);
    });

    it("fixed G&A expenses match hand calculation", () => {
      expect(comp[0].officeLease).toBeCloseTo(H_CO_OFFICE, 2);
      expect(comp[0].professionalServices).toBeCloseTo(H_CO_PROF_SERVICES, 2);
      expect(comp[0].techInfrastructure).toBeCloseTo(H_CO_TECH, 2);
    });

    it("variable costs scale with 2 properties", () => {
      expect(comp[0].travelCosts).toBeCloseTo(H_CO_TRAVEL, 2);
      expect(comp[0].itLicensing).toBeCloseTo(H_CO_IT_LICENSE, 2);
    });

    it("marketing and misc are revenue-based", () => {
      expect(comp[0].marketing).toBeCloseTo(H_CO_MARKETING, 2);
      expect(comp[0].miscOps).toBeCloseTo(H_CO_MISC, 2);
    });

    it("total expenses match hand calculation", () => {
      expect(comp[0].totalExpenses).toBeCloseTo(H_CO_TOTAL_EXP, 2);
    });
  });

  describe("Company IS: bottom line", () => {
    it("pre-tax income = revenue - expenses", () => {
      expect(comp[0].preTaxIncome).toBeCloseTo(H_CO_PRE_TAX, 2);
    });

    it("tax = max(0, preTax × 30%)", () => {
      expect(comp[0].companyIncomeTax).toBeCloseTo(H_CO_TAX, 2);
    });

    it("net income matches hand calculation", () => {
      expect(comp[0].netIncome).toBeCloseTo(H_CO_NET_INCOME, 2);
    });

    it("company net income is identical every month (stable revenue/expenses)", () => {
      for (let i = 1; i < 24; i++) {
        expect(comp[i].netIncome).toBeCloseTo(H_CO_NET_INCOME, 2);
      }
    });
  });

  // ─── Company Cash Flow ─────────────────────────────────────────────────
  describe("Company CF: SAFE funding and cash balance", () => {
    it("SAFE $800K arrives at month 0", () => {
      expect(comp[0].safeFunding).toBe(800_000);
    });

    it("no SAFE in subsequent months", () => {
      for (let i = 1; i < 24; i++) {
        expect(comp[i].safeFunding).toBe(0);
      }
    });

    it("month 0 cash flow = net income + SAFE", () => {
      expect(comp[0].cashFlow).toBeCloseTo(H_CO_CASH_FLOW_M0, 2);
    });

    it("month 1+ cash flow = net income only", () => {
      expect(comp[1].cashFlow).toBeCloseTo(H_CO_CASH_FLOW_REST, 2);
    });

    it("ending cash = cumulative cash flow", () => {
      let cumCash = 0;
      for (let i = 0; i < 24; i++) {
        cumCash += comp[i].cashFlow;
        expect(comp[i].endingCash).toBeCloseTo(cumCash, 2);
      }
    });

    it("month 0 ending cash = SAFE + net income", () => {
      expect(comp[0].endingCash).toBeCloseTo(H_CO_CASH_FLOW_M0, 2);
    });
  });

  // ─── Company Balance Sheet Identity ────────────────────────────────────
  describe("Company BS: A = L + E", () => {
    it("cash = cumSAFE + cumNetIncome for all 24 months", () => {
      let cumNI = 0;
      const cumSAFE = 800_000;  // all arrives month 0
      for (let i = 0; i < 24; i++) {
        cumNI += comp[i].netIncome;
        const expectedCash = cumSAFE + cumNI;
        expect(comp[i].endingCash).toBeCloseTo(expectedCash, 2);
      }
    });

    it("A = L + E identity: Cash = SAFE_Notes + Retained_Earnings", () => {
      let cumNI = 0;
      for (let i = 0; i < 24; i++) {
        cumNI += comp[i].netIncome;
        // Assets = Cash = endingCash
        // Liabilities = SAFE notes = 800,000
        // Equity = Retained earnings = cumNI
        const assets = comp[i].endingCash;
        const liabilities = 800_000;
        const equity = cumNI;
        expect(Math.abs(assets - liabilities - equity)).toBeLessThan(1);
      }
    });
  });

  // ─── Intercompany Fee Elimination (Zero-Sum) ──────────────────────────
  describe("Intercompany elimination: property fees = company revenue", () => {
    it("monthly: sum of property fees = company total revenue", () => {
      for (let i = 0; i < 24; i++) {
        const propAFees = propA[i].feeBase + propA[i].feeIncentive;
        const propBFees = propB[i].feeBase + propB[i].feeIncentive;
        const totalPropFees = propAFees + propBFees;
        expect(totalPropFees).toBeCloseTo(comp[i].totalRevenue, 2);
      }
    });

    it("base fees per property match company breakdown", () => {
      expect(comp[0].serviceFeeBreakdown.byPropertyId["1"]).toBeCloseTo(H_A_FEE_BASE, 2);
      expect(comp[0].serviceFeeBreakdown.byPropertyId["2"]).toBeCloseTo(H_B_FEE_BASE, 2);
    });

    it("incentive fees per property match company breakdown", () => {
      expect(comp[0].incentiveFeeByPropertyId["1"]).toBeCloseTo(H_A_FEE_INCENTIVE, 2);
      expect(comp[0].incentiveFeeByPropertyId["2"]).toBeCloseTo(H_B_FEE_INCENTIVE, 2);
    });

    it("elimination: consolidated net intercompany = $0", () => {
      for (let i = 0; i < 24; i++) {
        const propFeeExpense = propA[i].feeBase + propA[i].feeIncentive +
                               propB[i].feeBase + propB[i].feeIncentive;
        const compFeeRevenue = comp[i].totalRevenue;
        expect(Math.abs(propFeeExpense - compFeeRevenue)).toBeLessThan(0.01);
      }
    });
  });

  // ─── Portfolio Aggregation ─────────────────────────────────────────────
  describe("Portfolio aggregation: sum of individual properties", () => {
    it("portfolio revenue = sum of property revenues", () => {
      for (let i = 0; i < 24; i++) {
        const sum = propA[i].revenueTotal + propB[i].revenueTotal;
        expect(sum).toBeCloseTo(H_PORT_REV_TOTAL, 2);
      }
    });

    it("portfolio NOI = sum of property NOIs", () => {
      for (let i = 0; i < 24; i++) {
        const sum = propA[i].noi + propB[i].noi;
        expect(sum).toBeCloseTo(H_PORT_NOI, 2);
      }
    });

    it("portfolio ANOI = sum of property ANOIs", () => {
      for (let i = 0; i < 24; i++) {
        const sum = propA[i].anoi + propB[i].anoi;
        expect(sum).toBeCloseTo(H_PORT_ANOI, 2);
      }
    });

    it("portfolio total fees = sum of individual property fees", () => {
      for (let i = 0; i < 24; i++) {
        const feeA = propA[i].feeBase + propA[i].feeIncentive;
        const feeB = propB[i].feeBase + propB[i].feeIncentive;
        expect(feeA + feeB).toBeCloseTo(H_PORT_FEE_BASE + H_PORT_FEE_INCENTIVE, 2);
      }
    });
  });

  // ─── Property Balance Sheet Identities ─────────────────────────────────
  describe("Property BS: A = L + E for both properties", () => {
    it("Property A: A = L + E within $1 for all months", () => {
      const initialEquity = 800_000;  // cash purchase, no debt, no reserve
      let cumNI = 0;
      for (let i = 0; i < 24; i++) {
        cumNI += propA[i].netIncome;
        const assets = propA[i].endingCash + propA[i].propertyValue;
        const liabilities = propA[i].debtOutstanding;
        const equity = initialEquity + cumNI;
        expect(Math.abs(assets - liabilities - equity)).toBeLessThan(1);
      }
    });

    it("Property B: A = L + E within $1 for all months", () => {
      const initialEquity = 3_000_000 - H_B_LOAN;  // 1,050,000
      let cumNI = 0;
      for (let i = 0; i < 24; i++) {
        cumNI += propB[i].netIncome;
        const assets = propB[i].endingCash + propB[i].propertyValue;
        const liabilities = propB[i].debtOutstanding;
        const equity = initialEquity + cumNI;
        expect(Math.abs(assets - liabilities - equity)).toBeLessThan(1);
      }
    });
  });

  // ─── GAAP Cash Flow Identities ─────────────────────────────────────────
  describe("GAAP identities for both properties", () => {
    it("Property A: OCF = NI + Depreciation (ASC 230)", () => {
      for (let i = 0; i < 24; i++) {
        expect(propA[i].operatingCashFlow).toBeCloseTo(
          propA[i].netIncome + propA[i].depreciationExpense, 2);
      }
    });

    it("Property B: OCF = NI + Depreciation (ASC 230)", () => {
      for (let i = 0; i < 24; i++) {
        expect(propB[i].operatingCashFlow).toBeCloseTo(
          propB[i].netIncome + propB[i].depreciationExpense, 2);
      }
    });

    it("Property B: CFF = -Principal (ASC 230-10-45-15)", () => {
      for (let i = 0; i < 24; i++) {
        expect(propB[i].financingCashFlow).toBeCloseTo(-propB[i].principalPayment, 2);
      }
    });
  });

  // ─── Yearly Aggregation Verification ───────────────────────────────────
  describe("Yearly aggregation: 12-month sums", () => {
    it("Property A: Year 1 revenue = 12 × monthly revenue", () => {
      const year1Rev = propA.slice(0, 12).reduce((s, m) => s + m.revenueTotal, 0);
      expect(year1Rev).toBeCloseTo(H_A_REV_TOTAL * 12, 0);
    });

    it("Property B: Year 1 revenue = 12 × monthly revenue", () => {
      const year1Rev = propB.slice(0, 12).reduce((s, m) => s + m.revenueTotal, 0);
      expect(year1Rev).toBeCloseTo(H_B_REV_TOTAL * 12, 0);
    });

    it("Portfolio: Year 1 total revenue = 12 × (A + B monthly)", () => {
      const year1Port = propA.slice(0, 12).reduce((s, m) => s + m.revenueTotal, 0) +
                        propB.slice(0, 12).reduce((s, m) => s + m.revenueTotal, 0);
      expect(year1Port).toBeCloseTo(H_PORT_REV_TOTAL * 12, 0);
    });

    it("Company: Year 1 total revenue = 12 × monthly company revenue", () => {
      const year1CoRev = comp.slice(0, 12).reduce((s, m) => s + m.totalRevenue, 0);
      expect(year1CoRev).toBeCloseTo(H_CO_TOTAL_REV * 12, 0);
    });

    it("Company: Year 1 net income = 12 × monthly net income", () => {
      const year1CoNI = comp.slice(0, 12).reduce((s, m) => s + m.netIncome, 0);
      expect(year1CoNI).toBeCloseTo(H_CO_NET_INCOME * 12, 0);
    });

    it("Property A: Year 1 ending cash = last month of year", () => {
      expect(propA[11].endingCash).toBeCloseTo(H_A_CASH_FLOW * 12, 0);
    });

    it("Company: Year 2 ending cash matches cumulative", () => {
      const expectedCash = H_CO_SAFE + H_CO_NET_INCOME * 24;
      expect(comp[23].endingCash).toBeCloseTo(expectedCash, 0);
    });
  });

  // ─── Staffing Tier Verification ────────────────────────────────────────
  describe("Staffing tier: 2 properties = tier 1 (2.5 FTE)", () => {
    it("staff comp reflects 2.5 FTE at $75K", () => {
      // 2 properties ≤ tier1Max (3) → 2.5 FTE
      const expected = (2.5 * 75_000) / 12;
      expect(comp[0].staffCompensation).toBeCloseTo(expected, 2);
    });
  });

  // ─── Cross-Entity Revenue Scale Check ──────────────────────────────────
  describe("Revenue scale: Property B is ~3× Property A", () => {
    it("Property B revenue ≈ 3.06× Property A revenue", () => {
      // B: 25 rooms × $220 / A: 10 rooms × $180 = 5500/1800 ≈ 3.056
      const ratio = H_B_REV_TOTAL / H_A_REV_TOTAL;
      expect(ratio).toBeCloseTo(25 * 220 / (10 * 180), 4);
    });

    it("fee revenue split reflects property sizes", () => {
      const feeA = H_A_FEE_BASE + H_A_FEE_INCENTIVE;
      const feeB = H_B_FEE_BASE + H_B_FEE_INCENTIVE;
      // B should contribute ~75% of total fees
      expect(feeB / (feeA + feeB)).toBeGreaterThan(0.74);
      expect(feeB / (feeA + feeB)).toBeLessThan(0.77);
    });
  });

  // ─── Debt Amortization Cross-Check ─────────────────────────────────────
  describe("Property B: debt amortization schedule correctness", () => {
    it("principal increases month-over-month (fixed-rate amortization)", () => {
      for (let i = 1; i < 24; i++) {
        expect(propB[i].principalPayment).toBeGreaterThan(propB[i - 1].principalPayment);
      }
    });

    it("interest decreases month-over-month", () => {
      for (let i = 1; i < 24; i++) {
        expect(propB[i].interestExpense).toBeLessThan(propB[i - 1].interestExpense);
      }
    });

    it("PMT is constant across all months", () => {
      for (let i = 0; i < 24; i++) {
        expect(propB[i].debtPayment).toBeCloseTo(H_B_PMT, 2);
      }
    });

    it("debt outstanding at month 23 = loan - cumulative principal", () => {
      let cumPrincipal = 0;
      for (let i = 0; i < 24; i++) {
        cumPrincipal += propB[i].principalPayment;
      }
      expect(propB[23].debtOutstanding).toBeCloseTo(H_B_LOAN - cumPrincipal, 0);
    });
  });
});
