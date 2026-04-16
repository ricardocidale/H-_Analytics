/**
 * Golden Scenario: Full Financial Statements (Property + Company + Consolidated)
 *
 * Single property "Golden Lodge" → Management Company → Consolidated elimination.
 * All values hand-calculated to the penny. 0% growth/inflation for traceability.
 *
 * PROPERTY: 20 rooms, $200 ADR, 70% occ (flat), $2M purchase, 60% LTV, 8% rate, 25yr term
 * COMPANY:  Receives base + incentive fees, pays staffing/overhead, 30% corporate tax
 * CONSOLIDATED: Intercompany fee elimination → $0 net
 *
 * Projection: 2 years (24 months) starting 2026-04-01.
 * Model start = ops start = acquisition date = SAFE tranche 1 date = company ops start.
 */
import { describe, it, expect } from "vitest";
import { generatePropertyProForma } from "../../client/src/lib/financial/property-engine";
import { generateCompanyProForma } from "../../client/src/lib/financial/company-engine";
import { aggregatePropertyByYear } from "../../client/src/lib/financial/yearlyAggregator";
import { aggregateCashFlowByYear } from "../../client/src/lib/financial/cashFlowAggregator";
import { pmt } from "../../calc/shared/pmt";
import {
  DEFAULT_COST_RATE_ROOMS, DEFAULT_COST_RATE_FB, DEFAULT_COST_RATE_ADMIN,
  DEFAULT_COST_RATE_MARKETING, DEFAULT_COST_RATE_PROPERTY_OPS, DEFAULT_COST_RATE_UTILITIES,
  DEFAULT_COST_RATE_TAXES, DEFAULT_COST_RATE_IT,
  DEFAULT_COST_RATE_FFE, DEFAULT_COST_RATE_OTHER, DEFAULT_COST_RATE_INSURANCE,
  DEFAULT_EVENT_EXPENSE_RATE, DEFAULT_OTHER_EXPENSE_RATE, DEFAULT_UTILITIES_VARIABLE_SPLIT,
  DEFAULT_REV_SHARE_EVENTS, DEFAULT_REV_SHARE_FB, DEFAULT_REV_SHARE_OTHER,
  DEFAULT_CATERING_BOOST_PCT, DEFAULT_BASE_MANAGEMENT_FEE_RATE, DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  DEFAULT_COMPANY_TAX_RATE, DEFAULT_EXIT_CAP_RATE, DEFAULT_COMMISSION_RATE,
  DAYS_PER_MONTH, DEPRECIATION_YEARS, DEFAULT_LAND_VALUE_PERCENT,
  DEFAULT_BUSINESS_INSURANCE_START,
} from "../../shared/constants";
import type { PropertyInput, GlobalInput } from "../../engine/types";

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO INPUTS
// ═══════════════════════════════════════════════════════════════════════════════

const PROPERTY: PropertyInput = {
  id: 1,
  name: "Golden Lodge",
  type: "Financed",
  purchasePrice: 2_000_000,
  buildingImprovements: 0,
  preOpeningCosts: 0,
  roomCount: 20,
  startAdr: 200,
  startOccupancy: 0.70,
  maxOccupancy: 0.70,
  occupancyGrowthStep: 0,       // flat occupancy — no ramp
  occupancyRampMonths: 6,
  adrGrowthRate: 0,              // flat ADR — no growth
  inflationRate: 0,              // no inflation on this property
  operationsStartDate: "2026-04-01",
  acquisitionDate: "2026-04-01",
  operatingReserve: 0,
  taxRate: 0.25,
  acquisitionLTV: 0.60,
  acquisitionInterestRate: 0.08,
  acquisitionTermYears: 25,
  exitCapRate: DEFAULT_EXIT_CAP_RATE,
  dispositionCommission: DEFAULT_COMMISSION_RATE,
  willRefinance: "No",
};

const GLOBAL: GlobalInput = {
  modelStartDate: "2026-04-01",
  projectionYears: 2,
  inflationRate: 0,
  fixedCostEscalationRate: 0,
  companyInflationRate: 0,
  companyTaxRate: DEFAULT_COMPANY_TAX_RATE,
  companyOpsStartDate: "2026-04-01",
  safeTranche1Date: "2026-04-01",
  safeTranche1Amount: 800_000,
  safeTranche2Date: null,
  safeTranche2Amount: 0,
  // Explicitly set all company cost fields to defaults for hand-calc traceability
  staffSalary: 75_000,
  staffTier1MaxProperties: 3,
  staffTier1Fte: 2.5,
  staffTier2MaxProperties: 6,
  staffTier2Fte: 4.5,
  staffTier3Fte: 7.0,
  partnerCompYear1: 540_000,
  partnerCompYear2: 540_000,
  officeLeaseStart: 36_000,
  professionalServicesStart: 24_000,
  techInfraStart: 18_000,
  travelCostPerClient: 12_000,
  itLicensePerClient: 3_000,
  marketingRate: 0.05,
  miscOpsRate: 0.03,
};

const MONTHS = 24;

// ═══════════════════════════════════════════════════════════════════════════════
// HAND CALCULATIONS — PROPERTY MONTHLY (all months identical except debt)
// ═══════════════════════════════════════════════════════════════════════════════

// Revenue
const H_AVAIL_ROOMS = 20 * DAYS_PER_MONTH;                          // 610
const H_SOLD_ROOMS = H_AVAIL_ROOMS * 0.70;                          // 427
const H_REV_ROOMS = H_SOLD_ROOMS * 200;                             // 85,400
// Revenue shares are % of TOTAL revenue; room share = 1 - ancillary
const H_ANCILLARY = DEFAULT_REV_SHARE_EVENTS + DEFAULT_REV_SHARE_FB + DEFAULT_REV_SHARE_OTHER;
const H_ROOM_SHARE = Math.max(0.05, 1 - H_ANCILLARY);
const H_REV_TOTAL = H_REV_ROOMS / H_ROOM_SHARE;
const H_REV_EVENTS = H_REV_TOTAL * DEFAULT_REV_SHARE_EVENTS;
const H_REV_FB = H_REV_TOTAL * DEFAULT_REV_SHARE_FB;
const H_REV_OTHER = H_REV_TOTAL * DEFAULT_REV_SHARE_OTHER;

// Variable expenses
const H_EXP_ROOMS = H_REV_ROOMS * DEFAULT_COST_RATE_ROOMS;
const H_EXP_FB = H_REV_FB * DEFAULT_COST_RATE_FB;
const H_EXP_EVENTS = H_REV_EVENTS * DEFAULT_EVENT_EXPENSE_RATE;
const H_EXP_OTHER = H_REV_OTHER * DEFAULT_OTHER_EXPENSE_RATE;
const H_EXP_MARKETING = H_REV_TOTAL * DEFAULT_COST_RATE_MARKETING;
const H_EXP_UTIL_VAR = H_REV_TOTAL * (DEFAULT_COST_RATE_UTILITIES * DEFAULT_UTILITIES_VARIABLE_SPLIT);
const H_EXP_FFE = H_REV_TOTAL * DEFAULT_COST_RATE_FFE;

// Fixed expenses (0% escalation → factor = 1, base = actual since flat occ/ADR)
const H_TOTAL_PROP_VALUE = 2_000_000;
const H_BASE_TOTAL_REV = H_REV_TOTAL; // same since 0% growth and occ at target
const H_EXP_ADMIN = H_BASE_TOTAL_REV * DEFAULT_COST_RATE_ADMIN;
const H_EXP_PROP_OPS = H_BASE_TOTAL_REV * DEFAULT_COST_RATE_PROPERTY_OPS;
const H_EXP_IT = H_BASE_TOTAL_REV * DEFAULT_COST_RATE_IT;
const H_EXP_TAXES = (H_TOTAL_PROP_VALUE / 12) * DEFAULT_COST_RATE_TAXES;
const H_EXP_UTIL_FIXED = H_BASE_TOTAL_REV * (DEFAULT_COST_RATE_UTILITIES * (1 - DEFAULT_UTILITIES_VARIABLE_SPLIT));
const H_EXP_OTHER_COSTS = H_BASE_TOTAL_REV * DEFAULT_COST_RATE_OTHER;
const H_EXP_INSURANCE = (H_TOTAL_PROP_VALUE / 12) * DEFAULT_COST_RATE_INSURANCE;

// USALI waterfall
const H_TOTAL_OP_EXP = H_EXP_ROOMS + H_EXP_FB + H_EXP_EVENTS + H_EXP_OTHER +
  H_EXP_MARKETING + H_EXP_PROP_OPS + H_EXP_UTIL_VAR +
  H_EXP_ADMIN + H_EXP_IT + H_EXP_UTIL_FIXED + H_EXP_INSURANCE + H_EXP_OTHER_COSTS;
const H_GOP = H_REV_TOTAL - H_TOTAL_OP_EXP;
const H_FEE_BASE = H_REV_TOTAL * DEFAULT_BASE_MANAGEMENT_FEE_RATE;
const H_FEE_INCENTIVE = Math.max(0, H_GOP * DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE);
const H_AGOP = H_GOP - H_FEE_BASE - H_FEE_INCENTIVE;
const H_NOI = H_AGOP - H_EXP_TAXES;
const H_ANOI = H_NOI - H_EXP_FFE;

// Debt
const H_LOAN = 2_000_000 * 0.60;                                    // 1,200,000
const H_MONTHLY_RATE = 0.08 / 12;
const H_TOTAL_PAYMENTS = 25 * 12;                                    // 300
const H_PMT = pmt(H_LOAN, H_MONTHLY_RATE, H_TOTAL_PAYMENTS);

// Depreciation
const H_BUILDING_VALUE = 2_000_000 * (1 - DEFAULT_LAND_VALUE_PERCENT); // 1,500,000
const H_MONTHLY_DEPR = H_BUILDING_VALUE / DEPRECIATION_YEARS / 12;
const H_LAND_VALUE = 2_000_000 * DEFAULT_LAND_VALUE_PERCENT;         // 500,000

// Build amortization schedule for 24 months
function buildAmortSchedule(months: number) {
  let balance = H_LOAN;
  const schedule: { interest: number; principal: number; balance: number }[] = [];
  for (let m = 0; m < months; m++) {
    const interest = balance * H_MONTHLY_RATE;
    const principal = H_PMT - interest;
    balance = Math.max(0, balance - principal);
    schedule.push({ interest, principal, balance });
  }
  return schedule;
}
const H_AMORT = buildAmortSchedule(MONTHS);

// Monthly income/cash flow (varies only by debt amortization)
function handMonth(m: number) {
  const interest = H_AMORT[m].interest;
  const principal = H_AMORT[m].principal;
  const debtOutstanding = H_AMORT[m].balance;
  const depr = H_MONTHLY_DEPR;
  const taxableIncome = H_ANOI - interest - depr;
  const incomeTax = taxableIncome > 0 ? taxableIncome * 0.25 : 0;
  const netIncome = H_ANOI - interest - depr - incomeTax;
  const cashFlow = H_ANOI - H_PMT - incomeTax;
  const operatingCF = netIncome + depr;
  const financingCF = -principal;
  const accDepr = Math.min(depr * (m + 1), H_BUILDING_VALUE);
  const propertyValue = H_LAND_VALUE + H_BUILDING_VALUE - accDepr;
  return {
    interest, principal, debtOutstanding, depr, taxableIncome,
    incomeTax, netIncome, cashFlow, operatingCF, financingCF,
    accDepr, propertyValue,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HAND CALCULATIONS — MANAGEMENT COMPANY MONTHLY
// ═══════════════════════════════════════════════════════════════════════════════

// Revenue = property fees
const H_CO_BASE_FEE = H_FEE_BASE;                                   // same as property expense
const H_CO_INCENTIVE_FEE = H_FEE_INCENTIVE;
const H_CO_TOTAL_REV = H_CO_BASE_FEE + H_CO_INCENTIVE_FEE;

// Expenses (1 active property → tier 1 = 2.5 FTE, 0% escalation → factor=1)
const H_CO_PARTNER_COMP = 540_000 / 12;                             // 45,000
const H_CO_STAFF_COMP = (2.5 * 75_000 * 1) / 12;                   // 15,625
const H_CO_OFFICE = (36_000 * 1) / 12;                              // 3,000
const H_CO_PROF_SERV = (24_000 * 1) / 12;                           // 2,000
const H_CO_TECH = (18_000 * 1) / 12;                                // 1,500
const H_CO_TRAVEL = (1 * 12_000 * 1) / 12;                          // 1,000
const H_CO_IT_LIC = (1 * 3_000 * 1) / 12;                           // 250
const H_CO_MARKETING = H_CO_TOTAL_REV * 0.05;
const H_CO_MISC = H_CO_TOTAL_REV * 0.03;
const H_CO_INSURANCE = DEFAULT_BUSINESS_INSURANCE_START / 12;

const H_CO_TOTAL_EXP = H_CO_PARTNER_COMP + H_CO_STAFF_COMP + H_CO_OFFICE +
  H_CO_PROF_SERV + H_CO_TECH + H_CO_INSURANCE + H_CO_TRAVEL +
  H_CO_IT_LIC + H_CO_MARKETING + H_CO_MISC;

const H_CO_PRE_TAX = H_CO_TOTAL_REV - H_CO_TOTAL_EXP;              // no vendor costs
const H_CO_TAX = H_CO_PRE_TAX > 0 ? H_CO_PRE_TAX * DEFAULT_COMPANY_TAX_RATE : 0;
const H_CO_NET_INCOME = H_CO_PRE_TAX - H_CO_TAX;

// Month 0 gets SAFE funding
const H_CO_CF_MONTH0 = H_CO_NET_INCOME + 800_000;
const H_CO_CF_NORMAL = H_CO_NET_INCOME;

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe("Golden Scenario: Full Financial Statements", () => {
  const propFinancials = generatePropertyProForma(PROPERTY, GLOBAL, MONTHS);
  const companyFinancials = generateCompanyProForma([PROPERTY], GLOBAL, MONTHS);
  const yearlyProp = aggregatePropertyByYear(propFinancials, 2);
  const yearlyCF = aggregateCashFlowByYear(
    propFinancials,
    { ...PROPERTY, preOpeningCosts: 0 } as PropertyInput,
    GLOBAL,
    2,
  );

  // ─── PROPERTY: Month 1 (index 0) Revenue ─────────────────────────────────
  describe("Property Income Statement — Month 1", () => {
    const m0 = propFinancials[0];

    it("revenue lines match hand calculation", () => {
      expect(m0.revenueRooms).toBeCloseTo(H_REV_ROOMS, 2);
      expect(m0.revenueEvents).toBeCloseTo(H_REV_EVENTS, 2);
      expect(m0.revenueFB).toBeCloseTo(H_REV_FB, 2);
      expect(m0.revenueOther).toBeCloseTo(H_REV_OTHER, 2);
      expect(m0.revenueTotal).toBeCloseTo(H_REV_TOTAL, 2);
    });

    it("variable expense lines match", () => {
      expect(m0.expenseRooms).toBeCloseTo(H_EXP_ROOMS, 2);
      expect(m0.expenseFB).toBeCloseTo(H_EXP_FB, 2);
      expect(m0.expenseEvents).toBeCloseTo(H_EXP_EVENTS, 2);
      expect(m0.expenseOther).toBeCloseTo(H_EXP_OTHER, 2);
      expect(m0.expenseMarketing).toBeCloseTo(H_EXP_MARKETING, 2);
      expect(m0.expenseUtilitiesVar).toBeCloseTo(H_EXP_UTIL_VAR, 2);
      expect(m0.expenseFFE).toBeCloseTo(H_EXP_FFE, 2);
    });

    it("fixed expense lines match", () => {
      expect(m0.expenseAdmin).toBeCloseTo(H_EXP_ADMIN, 2);
      expect(m0.expensePropertyOps).toBeCloseTo(H_EXP_PROP_OPS, 2);
      expect(m0.expenseIT).toBeCloseTo(H_EXP_IT, 2);
      expect(m0.expenseTaxes).toBeCloseTo(H_EXP_TAXES, 2);
      expect(m0.expenseUtilitiesFixed).toBeCloseTo(H_EXP_UTIL_FIXED, 2);
      expect(m0.expenseOtherCosts).toBeCloseTo(H_EXP_OTHER_COSTS, 2);
    });

    it("USALI waterfall: GOP → AGOP → NOI → ANOI", () => {
      expect(m0.gop).toBeCloseTo(H_GOP, 2);
      expect(m0.feeBase).toBeCloseTo(H_FEE_BASE, 2);
      expect(m0.feeIncentive).toBeCloseTo(H_FEE_INCENTIVE, 2);
      expect(m0.agop).toBeCloseTo(H_AGOP, 2);
      expect(m0.noi).toBeCloseTo(H_NOI, 2);
      expect(m0.anoi).toBeCloseTo(H_ANOI, 2);
    });

    it("debt service: PMT, interest, principal, outstanding", () => {
      const h = handMonth(0);
      expect(m0.debtPayment).toBeCloseTo(H_PMT, 2);
      expect(m0.interestExpense).toBeCloseTo(h.interest, 2);
      expect(m0.principalPayment).toBeCloseTo(h.principal, 2);
      expect(m0.debtOutstanding).toBeCloseTo(h.debtOutstanding, 0);
    });

    it("income statement: depreciation, tax, net income", () => {
      const h = handMonth(0);
      expect(m0.depreciationExpense).toBeCloseTo(h.depr, 2);
      expect(m0.incomeTax).toBeCloseTo(h.incomeTax, 2);
      expect(m0.netIncome).toBeCloseTo(h.netIncome, 2);
    });

    it("cash flow statement: OCF, FCF, ending cash", () => {
      const h = handMonth(0);
      expect(m0.cashFlow).toBeCloseTo(h.cashFlow, 2);
      expect(m0.operatingCashFlow).toBeCloseTo(h.operatingCF, 2);
      expect(m0.financingCashFlow).toBeCloseTo(h.financingCF, 2);
      expect(m0.endingCash).toBeCloseTo(h.cashFlow, 2); // month 0, no prior balance
    });

    it("balance sheet: property value, debt outstanding", () => {
      const h = handMonth(0);
      expect(m0.propertyValue).toBeCloseTo(h.propertyValue, 0);
      expect(m0.debtOutstanding).toBeCloseTo(h.debtOutstanding, 0);
    });
  });

  // ─── PROPERTY: Month 12 = Month 1 (except debt amortization) ─────────────
  describe("Property Month Invariant (0% growth)", () => {
    it("revenue is identical month 1 through month 24", () => {
      for (let i = 0; i < 24; i++) {
        expect(propFinancials[i].revenueTotal).toBeCloseTo(H_REV_TOTAL, 2);
      }
    });

    it("GOP and NOI are identical every month", () => {
      for (let i = 0; i < 24; i++) {
        expect(propFinancials[i].gop).toBeCloseTo(H_GOP, 2);
        expect(propFinancials[i].noi).toBeCloseTo(H_NOI, 2);
        expect(propFinancials[i].anoi).toBeCloseTo(H_ANOI, 2);
      }
    });

    it("debt outstanding decreases monotonically", () => {
      for (let i = 1; i < 24; i++) {
        expect(propFinancials[i].debtOutstanding).toBeLessThan(propFinancials[i - 1].debtOutstanding);
      }
    });

    it("interest decreases while principal increases each month", () => {
      for (let i = 1; i < 24; i++) {
        expect(propFinancials[i].interestExpense).toBeLessThan(propFinancials[i - 1].interestExpense);
        expect(propFinancials[i].principalPayment).toBeGreaterThan(propFinancials[i - 1].principalPayment);
      }
    });
  });

  // ─── PROPERTY: Yearly Aggregation ─────────────────────────────────────────
  describe("Property Yearly Income Statement", () => {
    it("Year 1 revenue = 12 × monthly", () => {
      expect(yearlyProp[0].revenueTotal).toBeCloseTo(H_REV_TOTAL * 12, 0);
      expect(yearlyProp[0].revenueRooms).toBeCloseTo(H_REV_ROOMS * 12, 0);
      expect(yearlyProp[0].revenueEvents).toBeCloseTo(H_REV_EVENTS * 12, 0);
      expect(yearlyProp[0].revenueFB).toBeCloseTo(H_REV_FB * 12, 0);
      expect(yearlyProp[0].revenueOther).toBeCloseTo(H_REV_OTHER * 12, 0);
    });

    it("Year 1 GOP and NOI = 12 × monthly", () => {
      expect(yearlyProp[0].gop).toBeCloseTo(H_GOP * 12, 0);
      expect(yearlyProp[0].noi).toBeCloseTo(H_NOI * 12, 0);
      expect(yearlyProp[0].anoi).toBeCloseTo(H_ANOI * 12, 0);
    });

    it("Year 1 fees = 12 × monthly", () => {
      expect(yearlyProp[0].feeBase).toBeCloseTo(H_FEE_BASE * 12, 0);
      expect(yearlyProp[0].feeIncentive).toBeCloseTo(H_FEE_INCENTIVE * 12, 0);
    });

    it("Year 1 debt service = sum of 12 monthly PMTs", () => {
      expect(yearlyProp[0].debtPayment).toBeCloseTo(H_PMT * 12, 0);
    });

    it("Year 1 interest = sum of months 0-11 interest", () => {
      const y1Interest = H_AMORT.slice(0, 12).reduce((s, m) => s + m.interest, 0);
      expect(yearlyProp[0].interestExpense).toBeCloseTo(y1Interest, 0);
    });

    it("Year 1 depreciation = 12 × monthly depreciation", () => {
      expect(yearlyProp[0].depreciationExpense).toBeCloseTo(H_MONTHLY_DEPR * 12, 0);
    });

    it("Year 1 net income = sum of 12 monthly net incomes", () => {
      const y1NI = Array.from({ length: 12 }, (_, i) => handMonth(i).netIncome).reduce((a, b) => a + b, 0);
      expect(yearlyProp[0].netIncome).toBeCloseTo(y1NI, 0);
    });

    it("Year 1 ending cash = month 12 ending cash (PICK_LAST)", () => {
      expect(yearlyProp[0].endingCash).toBeCloseTo(propFinancials[11].endingCash, 2);
    });

    it("Year 2 revenue = Year 1 revenue (0% growth)", () => {
      expect(yearlyProp[1].revenueTotal).toBeCloseTo(yearlyProp[0].revenueTotal, 0);
    });
  });

  // ─── PROPERTY: Cash Flow Statement (yearly) ──────────────────────────────
  describe("Property Yearly Cash Flow Statement", () => {
    it("Year 1 operating cash flow = net income + depreciation", () => {
      const y1NI = Array.from({ length: 12 }, (_, i) => handMonth(i).netIncome).reduce((a, b) => a + b, 0);
      const y1Depr = H_MONTHLY_DEPR * 12;
      expect(yearlyCF[0].operatingCashFlow).toBeCloseTo(y1NI + y1Depr, 0);
    });

    it("Year 1 FCFE = CFO - maintenanceCapex - principal payments", () => {
      const y1Principal = H_AMORT.slice(0, 12).reduce((s, m) => s + m.principal, 0);
      expect(yearlyCF[0].freeCashFlowToEquity).toBeCloseTo(yearlyCF[0].cashFromOperations - yearlyCF[0].maintenanceCapex - y1Principal, 0);
    });

    it("Year 1 BTCF = ANOI - debt service", () => {
      expect(yearlyCF[0].btcf).toBeCloseTo(H_ANOI * 12 - H_PMT * 12, 0);
    });

    it("Year 1 ATCF = BTCF - tax liability", () => {
      expect(yearlyCF[0].atcf).toBeCloseTo(yearlyCF[0].btcf - yearlyCF[0].taxLiability, 2);
    });

    it("Year 2 (last year) has exit value", () => {
      const annualNOI = H_NOI * 12;
      const grossValue = annualNOI / DEFAULT_EXIT_CAP_RATE;
      const commission = grossValue * DEFAULT_COMMISSION_RATE;
      const debtAtExit = propFinancials[23].debtOutstanding;
      const expectedExit = grossValue - commission - debtAtExit;
      expect(yearlyCF[1].exitValue).toBeCloseTo(expectedExit, 0);
    });
  });

  // ─── PROPERTY: Balance Sheet Identity (A = L + E) ────────────────────────
  describe("Property Balance Sheet Identity (ASC 210)", () => {
    it("A = L + E every month (within $1)", () => {
      const initialEquity = H_TOTAL_PROP_VALUE - H_LOAN; // 800,000
      let cumNI = 0;
      for (let i = 0; i < 24; i++) {
        const m = propFinancials[i];
        cumNI += m.netIncome;
        const totalAssets = m.endingCash + m.propertyValue;
        const totalLiabilities = m.debtOutstanding;
        const derivedEquity = initialEquity + cumNI;
        const gap = Math.abs(totalAssets - totalLiabilities - derivedEquity);
        expect(gap).toBeLessThan(1.0);
      }
    });
  });

  // ─── PROPERTY: GAAP Cash Flow Identity ────────────────────────────────────
  describe("Property GAAP Identities", () => {
    it("OCF = NI + Depreciation every month (ASC 230)", () => {
      for (let i = 0; i < 24; i++) {
        const m = propFinancials[i];
        expect(m.operatingCashFlow).toBeCloseTo(m.netIncome + m.depreciationExpense, 2);
      }
    });

    it("Financing CF = -Principal every month", () => {
      for (let i = 0; i < 24; i++) {
        const m = propFinancials[i];
        expect(m.financingCashFlow).toBeCloseTo(-m.principalPayment, 2);
      }
    });

    it("Cash flow = OCF + FCF (operating + financing)", () => {
      for (let i = 0; i < 24; i++) {
        const m = propFinancials[i];
        // cashFlow = anoi - debtPayment - incomeTax
        // OCF + FCF = (NI + depr) + (-principal) = (anoi - interest - depr - tax) + depr - principal
        //           = anoi - interest - tax - principal = anoi - (interest + principal) - tax = anoi - PMT - tax
        expect(m.cashFlow).toBeCloseTo(m.operatingCashFlow + m.financingCashFlow, 2);
      }
    });

    it("ending cash is cumulative sum of monthly cash flows", () => {
      let cumCash = 0;
      for (let i = 0; i < 24; i++) {
        cumCash += propFinancials[i].cashFlow;
        expect(propFinancials[i].endingCash).toBeCloseTo(cumCash, 2);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MANAGEMENT COMPANY
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Company Income Statement — Month 1", () => {
    const c0 = companyFinancials[0];

    it("fee revenue matches property fee expense", () => {
      expect(c0.baseFeeRevenue).toBeCloseTo(H_FEE_BASE, 2);
      expect(c0.incentiveFeeRevenue).toBeCloseTo(H_FEE_INCENTIVE, 2);
      expect(c0.totalRevenue).toBeCloseTo(H_CO_TOTAL_REV, 2);
    });

    it("operating expenses match hand calculation", () => {
      expect(c0.partnerCompensation).toBeCloseTo(H_CO_PARTNER_COMP, 2);
      expect(c0.staffCompensation).toBeCloseTo(H_CO_STAFF_COMP, 2);
      expect(c0.officeLease).toBeCloseTo(H_CO_OFFICE, 2);
      expect(c0.professionalServices).toBeCloseTo(H_CO_PROF_SERV, 2);
      expect(c0.techInfrastructure).toBeCloseTo(H_CO_TECH, 2);
      expect(c0.travelCosts).toBeCloseTo(H_CO_TRAVEL, 2);
      expect(c0.itLicensing).toBeCloseTo(H_CO_IT_LIC, 2);
      expect(c0.marketing).toBeCloseTo(H_CO_MARKETING, 2);
      expect(c0.miscOps).toBeCloseTo(H_CO_MISC, 2);
      expect(c0.totalExpenses).toBeCloseTo(H_CO_TOTAL_EXP, 2);
    });

    it("profitability: pre-tax, tax, net income", () => {
      expect(c0.preTaxIncome).toBeCloseTo(H_CO_PRE_TAX, 2);
      expect(c0.companyIncomeTax).toBeCloseTo(H_CO_TAX, 2);
      expect(c0.netIncome).toBeCloseTo(H_CO_NET_INCOME, 2);
    });

    it("SAFE funding arrives in month 0", () => {
      expect(c0.safeFunding).toBe(800_000);
      expect(c0.cashFlow).toBeCloseTo(H_CO_CF_MONTH0, 2);
    });
  });

  describe("Company Monthly Invariants (0% inflation)", () => {
    it("fee revenue identical every month (same property output)", () => {
      for (let i = 0; i < 24; i++) {
        expect(companyFinancials[i].totalRevenue).toBeCloseTo(H_CO_TOTAL_REV, 2);
      }
    });

    it("total expenses identical every month (0% escalation, 1 active prop)", () => {
      for (let i = 0; i < 24; i++) {
        expect(companyFinancials[i].totalExpenses).toBeCloseTo(H_CO_TOTAL_EXP, 2);
      }
    });

    it("net income identical every month", () => {
      for (let i = 0; i < 24; i++) {
        expect(companyFinancials[i].netIncome).toBeCloseTo(H_CO_NET_INCOME, 2);
      }
    });

    it("ending cash decreases monotonically (company is unprofitable with 1 property)", () => {
      // With 1 small property: fee revenue ~$19K/month but expenses ~$71K/month
      // (partner comp $45K alone exceeds total revenue). SAFE funding covers losses.
      expect(H_CO_NET_INCOME).toBeLessThan(0); // confirm company is unprofitable
      for (let i = 1; i < 24; i++) {
        expect(companyFinancials[i].endingCash).toBeLessThan(companyFinancials[i - 1].endingCash);
      }
    });
  });

  describe("Company Yearly Aggregation", () => {
    it("Year 1 total revenue = 12 × monthly fee", () => {
      const y1Rev = companyFinancials.slice(0, 12).reduce((s, m) => s + m.totalRevenue, 0);
      expect(y1Rev).toBeCloseTo(H_CO_TOTAL_REV * 12, 0);
    });

    it("Year 1 net income = 12 × monthly net income", () => {
      const y1NI = companyFinancials.slice(0, 12).reduce((s, m) => s + m.netIncome, 0);
      expect(y1NI).toBeCloseTo(H_CO_NET_INCOME * 12, 0);
    });

    it("Year 1 ending cash = SAFE + 12 × monthly NI", () => {
      expect(companyFinancials[11].endingCash).toBeCloseTo(800_000 + H_CO_NET_INCOME * 12, 0);
    });

    it("Year 2 ending cash = Year 1 ending + 12 × monthly NI", () => {
      expect(companyFinancials[23].endingCash).toBeCloseTo(800_000 + H_CO_NET_INCOME * 24, 0);
    });
  });

  describe("Company Cash Balance Continuity", () => {
    it("ending cash = cumulative sum of all monthly cash flows", () => {
      let cumCash = 0;
      for (let i = 0; i < 24; i++) {
        cumCash += companyFinancials[i].cashFlow;
        expect(companyFinancials[i].endingCash).toBeCloseTo(cumCash, 2);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CONSOLIDATED: INTERCOMPANY ELIMINATION (Fee Zero-Sum)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Consolidated: Intercompany Fee Elimination", () => {
    it("property fee expense = company fee revenue every month", () => {
      for (let i = 0; i < 24; i++) {
        const propFees = propFinancials[i].feeBase + propFinancials[i].feeIncentive;
        const coFees = companyFinancials[i].totalRevenue;
        expect(propFees).toBeCloseTo(coFees, 2);
      }
    });

    it("Year 1 property fees = Year 1 company revenue", () => {
      const y1PropFees = yearlyProp[0].feeBase + yearlyProp[0].feeIncentive;
      const y1CoRev = companyFinancials.slice(0, 12).reduce((s, m) => s + m.totalRevenue, 0);
      expect(y1PropFees).toBeCloseTo(y1CoRev, 0);
    });

    it("elimination nets to $0", () => {
      for (let i = 0; i < 24; i++) {
        const propFeeExpense = propFinancials[i].feeBase + propFinancials[i].feeIncentive;
        const coFeeRevenue = companyFinancials[i].totalRevenue;
        const elimination = propFeeExpense - coFeeRevenue;
        expect(Math.abs(elimination)).toBeLessThan(0.01);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CONSOLIDATED: Combined Cash Position
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Consolidated: Combined Metrics", () => {
    it("consolidated revenue = property revenue (company fees are intercompany)", () => {
      // In a full consolidation, company fee revenue is eliminated
      // Net consolidated revenue = property revenueTotal (external revenue only)
      for (let i = 0; i < 24; i++) {
        const consolidatedExternalRevenue = propFinancials[i].revenueTotal;
        expect(consolidatedExternalRevenue).toBeCloseTo(H_REV_TOTAL, 2);
      }
    });

    it("combined cash = property cash + company cash", () => {
      const totalCash = propFinancials[23].endingCash + companyFinancials[23].endingCash;
      const propCash24 = Array.from({ length: 24 }, (_, i) => handMonth(i).cashFlow).reduce((a, b) => a + b, 0);
      const coCash24 = 800_000 + H_CO_NET_INCOME * 24;
      expect(totalCash).toBeCloseTo(propCash24 + coCash24, 0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // HAND-CALCULATED REFERENCE VALUES (spot checks)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Exact Hand-Calculated Values", () => {
    it("revenueTotal = roomRevenue / roomShareOfTotal", () => {
      // 85,400 / 0.49 = 174,285.714285...
      expect(H_REV_TOTAL).toBeCloseTo(85400 / 0.49, 2);
      expect(propFinancials[0].revenueTotal).toBeCloseTo(H_REV_TOTAL, 2);
    });

    it("Month 1 interest = $8,000.00 (1,200,000 × 0.08/12)", () => {
      expect(propFinancials[0].interestExpense).toBeCloseTo(8000, 2);
    });

    it("monthly depreciation = building / DEPRECIATION_YEARS / 12", () => {
      expect(propFinancials[0].depreciationExpense).toBeCloseTo(1_500_000 / DEPRECIATION_YEARS / 12, 2);
    });

    it("company monthly partner comp = $45,000", () => {
      expect(companyFinancials[0].partnerCompensation).toBeCloseTo(45000, 2);
    });

    it("company monthly staff comp = $15,625", () => {
      expect(companyFinancials[0].staffCompensation).toBeCloseTo(15625, 2);
    });

    it("SAFE tranche 1 = $800,000 in month 0 only", () => {
      expect(companyFinancials[0].safeFunding).toBe(800_000);
      expect(companyFinancials[1].safeFunding).toBe(0);
    });
  });
});
