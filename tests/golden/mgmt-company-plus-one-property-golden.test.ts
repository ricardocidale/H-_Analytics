/**
 * Golden Scenario: Clearwater Inn — Management Company + 1 Property (Cash Purchase)
 *
 * Single property "Clearwater Inn" → Management Company → Consolidated elimination.
 * All values hand-calculated. 0% growth/inflation for traceability.
 *
 * PROPERTY: 15 rooms, $175 ADR, 68% occ (flat), $1.5M cash purchase (no debt)
 *   Purchase price: $1,500,000, building improvements: $200,000,
 *   pre-opening costs: $50,000, operating reserve: $75,000
 *   Exit cap: 0.08, commission: 0.02, tax rate: 0.30
 *
 * COMPANY: Receives base (8.5%) + incentive (12% GOP) fees, pays staffing/overhead
 *   SAFE $800K, partner comp $540K/yr, staff $75K/yr, 2.5 FTE (tier 1: 1 prop ≤ 3)
 *
 * Projection: 2 years (24 months) starting 2026-01-01.
 * Model start = ops start = acquisition date = SAFE tranche 1 date = company ops start.
 */
import { describe, it, expect } from "vitest";
import { generatePropertyProForma } from "../../client/src/lib/financial/property-engine";
import { generateCompanyProForma } from "../../client/src/lib/financial/company-engine";
import { aggregatePropertyByYear } from "../../client/src/lib/financial/yearlyAggregator";
import { aggregateCashFlowByYear } from "../../client/src/lib/financial/cashFlowAggregator";
import {
  DEFAULT_COST_RATE_ROOMS, DEFAULT_COST_RATE_FB, DEFAULT_COST_RATE_ADMIN,
  DEFAULT_COST_RATE_MARKETING, DEFAULT_COST_RATE_PROPERTY_OPS, DEFAULT_COST_RATE_UTILITIES,
  DEFAULT_COST_RATE_TAXES, DEFAULT_COST_RATE_IT,
  DEFAULT_COST_RATE_FFE, DEFAULT_COST_RATE_OTHER, DEFAULT_COST_RATE_INSURANCE,
  DEFAULT_EVENT_EXPENSE_RATE, DEFAULT_OTHER_EXPENSE_RATE, DEFAULT_UTILITIES_VARIABLE_SPLIT,
  DEFAULT_REV_SHARE_EVENTS, DEFAULT_REV_SHARE_FB, DEFAULT_REV_SHARE_OTHER,
  DEFAULT_CATERING_BOOST_PCT, DEFAULT_BASE_MANAGEMENT_FEE_RATE, DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  DEFAULT_COMPANY_TAX_RATE, DEFAULT_BUSINESS_INSURANCE_START,
  DAYS_PER_MONTH, DEPRECIATION_YEARS, DEFAULT_LAND_VALUE_PERCENT,
} from "../../shared/constants";

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO INPUTS
// ═══════════════════════════════════════════════════════════════════════════════

const PROPERTY = {
  id: 1,
  name: "Clearwater Inn",
  type: "Cash",
  purchasePrice: 1_500_000,
  buildingImprovements: 200_000,
  preOpeningCosts: 50_000,
  roomCount: 15,
  startAdr: 175,
  startOccupancy: 0.68,
  maxOccupancy: 0.68,
  occupancyGrowthStep: 0,       // flat occupancy — no ramp
  occupancyRampMonths: 6,
  adrGrowthRate: 0,              // flat ADR — no growth
  inflationRate: 0,              // no inflation
  operationsStartDate: "2026-01-01",
  acquisitionDate: "2026-01-01",
  operatingReserve: 75_000,
  taxRate: 0.30,
  exitCapRate: 0.08,
  dispositionCommission: 0.02,
  willRefinance: "No",
} as any;

const GLOBAL = {
  modelStartDate: "2026-01-01",
  projectionYears: 2,
  inflationRate: 0,
  fixedCostEscalationRate: 0,
  companyInflationRate: 0,
  companyTaxRate: DEFAULT_COMPANY_TAX_RATE,
  companyOpsStartDate: "2026-01-01",
  safeTranche1Date: "2026-01-01",
  safeTranche1Amount: 800_000,
  safeTranche2Date: null,
  safeTranche2Amount: 0,
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
} as any;

const MONTHS = 24;

// ═══════════════════════════════════════════════════════════════════════════════
// HAND CALCULATIONS — PROPERTY MONTHLY (all months identical, no debt)
// ═══════════════════════════════════════════════════════════════════════════════

// Step 1: Available rooms = 15 × 30.5 = 457.5
const H_AVAIL_ROOMS = 15 * DAYS_PER_MONTH;                          // 457.5
// Step 2: Sold rooms = 457.5 × 0.68 = 311.1
const H_SOLD_ROOMS = H_AVAIL_ROOMS * 0.68;                          // 311.1
// Step 3: Room revenue = 311.1 × 175 = 54,442.50
const H_REV_ROOMS = H_SOLD_ROOMS * 175;                             // 54,442.50
// Revenue shares are % of TOTAL revenue; room share = 1 - ancillary
const H_ANCILLARY = DEFAULT_REV_SHARE_EVENTS + DEFAULT_REV_SHARE_FB + DEFAULT_REV_SHARE_OTHER;
const H_ROOM_SHARE = Math.max(0.05, 1 - H_ANCILLARY);
const H_REV_TOTAL = H_REV_ROOMS / H_ROOM_SHARE;
const H_REV_EVENTS = H_REV_TOTAL * DEFAULT_REV_SHARE_EVENTS;
const H_REV_FB = H_REV_TOTAL * DEFAULT_REV_SHARE_FB;
const H_REV_OTHER = H_REV_TOTAL * DEFAULT_REV_SHARE_OTHER;

// Step 8: Department costs
const H_EXP_ROOMS = H_REV_ROOMS * DEFAULT_COST_RATE_ROOMS;          // rooms cost = room_rev × 0.20
const H_EXP_FB = H_REV_FB * DEFAULT_COST_RATE_FB;                   // fb cost = fb_rev × 0.09
const H_EXP_EVENTS = H_REV_EVENTS * DEFAULT_EVENT_EXPENSE_RATE;     // events cost = events_rev × 0.65
const H_EXP_OTHER = H_REV_OTHER * DEFAULT_OTHER_EXPENSE_RATE;       // other cost = other_rev × 0.60

// Variable undistributed expenses
const H_EXP_MARKETING = H_REV_TOTAL * DEFAULT_COST_RATE_MARKETING;
const H_EXP_UTIL_VAR = H_REV_TOTAL * (DEFAULT_COST_RATE_UTILITIES * DEFAULT_UTILITIES_VARIABLE_SPLIT);
const H_EXP_FFE = H_REV_TOTAL * DEFAULT_COST_RATE_FFE;

// Step 10: Fixed expenses (0% escalation → factor = 1)
const H_TOTAL_PROP_VALUE = 1_500_000 + 200_000; // purchasePrice + buildingImprovements = 1,700,000
const H_BASE_TOTAL_REV = H_REV_TOTAL; // same since 0% growth
const H_EXP_ADMIN = H_BASE_TOTAL_REV * DEFAULT_COST_RATE_ADMIN;
const H_EXP_PROP_OPS = H_BASE_TOTAL_REV * DEFAULT_COST_RATE_PROPERTY_OPS;
const H_EXP_IT = H_BASE_TOTAL_REV * DEFAULT_COST_RATE_IT;
const H_EXP_TAXES = (H_TOTAL_PROP_VALUE / 12) * DEFAULT_COST_RATE_TAXES;
const H_EXP_UTIL_FIXED = H_BASE_TOTAL_REV * (DEFAULT_COST_RATE_UTILITIES * (1 - DEFAULT_UTILITIES_VARIABLE_SPLIT));
const H_EXP_OTHER_COSTS = H_BASE_TOTAL_REV * DEFAULT_COST_RATE_OTHER;
const H_EXP_INSURANCE = (H_TOTAL_PROP_VALUE / 12) * DEFAULT_COST_RATE_INSURANCE;

// Step 9: GOP = total_rev - dept_costs - undistributed operating expenses
const H_TOTAL_OP_EXP = H_EXP_ROOMS + H_EXP_FB + H_EXP_EVENTS + H_EXP_OTHER +
  H_EXP_MARKETING + H_EXP_PROP_OPS + H_EXP_UTIL_VAR +
  H_EXP_ADMIN + H_EXP_IT + H_EXP_UTIL_FIXED + H_EXP_INSURANCE + H_EXP_OTHER_COSTS;
const H_GOP = H_REV_TOTAL - H_TOTAL_OP_EXP;

// Step 11: Management fees
const H_FEE_BASE = H_REV_TOTAL * DEFAULT_BASE_MANAGEMENT_FEE_RATE;            // 8.5% of total rev
const H_FEE_INCENTIVE = Math.max(0, H_GOP * DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE); // 12% of GOP

// Step 12: AGOP, NOI, ANOI
const H_AGOP = H_GOP - H_FEE_BASE - H_FEE_INCENTIVE;
const H_NOI = H_AGOP - H_EXP_TAXES;
const H_ANOI = H_NOI - H_EXP_FFE;

// Depreciation (building portion only)
// Engine: buildingValue = purchasePrice * (1 - landPct) + buildingImprovements
const H_BUILDING_VALUE = 1_500_000 * (1 - DEFAULT_LAND_VALUE_PERCENT) + 200_000; // 1,325,000
const H_MONTHLY_DEPR = H_BUILDING_VALUE / DEPRECIATION_YEARS / 12;
// Engine: landValue = purchasePrice * landPct
const H_LAND_VALUE = 1_500_000 * DEFAULT_LAND_VALUE_PERCENT;                    // 375,000

// Income statement (no debt → interest = 0)
const H_TAXABLE_INCOME = H_ANOI - 0 - H_MONTHLY_DEPR;
const H_INCOME_TAX = H_TAXABLE_INCOME > 0 ? H_TAXABLE_INCOME * 0.30 : 0;
const H_NET_INCOME = H_ANOI - 0 - H_MONTHLY_DEPR - H_INCOME_TAX;

// Cash flow (no debt service)
const H_CASH_FLOW = H_ANOI - 0 - H_INCOME_TAX;
const H_OPERATING_CF = H_NET_INCOME + H_MONTHLY_DEPR;
const H_FINANCING_CF = 0; // no debt

// ═══════════════════════════════════════════════════════════════════════════════
// HAND CALCULATIONS — MANAGEMENT COMPANY MONTHLY
// ═══════════════════════════════════════════════════════════════════════════════

// Revenue = property fees
const H_CO_BASE_FEE = H_FEE_BASE;
const H_CO_INCENTIVE_FEE = H_FEE_INCENTIVE;
const H_CO_TOTAL_REV = H_CO_BASE_FEE + H_CO_INCENTIVE_FEE;

// Expenses (1 active property → tier 1 = 2.5 FTE, 0% escalation)
const H_CO_PARTNER_COMP = 540_000 / 12;                             // 45,000
const H_CO_STAFF_COMP = (2.5 * 75_000 * 1) / 12;                   // 15,625
const H_CO_OFFICE = (36_000 * 1) / 12;                              // 3,000
const H_CO_PROF_SERV = (24_000 * 1) / 12;                           // 2,000
const H_CO_TECH = (18_000 * 1) / 12;                                // 1,500
const H_CO_TRAVEL = (1 * 12_000 * 1) / 12;                          // 1,000 (1 property)
const H_CO_IT_LIC = (1 * 3_000 * 1) / 12;                           // 250
const H_CO_MARKETING = H_CO_TOTAL_REV * 0.05;
const H_CO_MISC = H_CO_TOTAL_REV * 0.03;
const H_CO_INSURANCE = DEFAULT_BUSINESS_INSURANCE_START / 12;

const H_CO_TOTAL_EXP = H_CO_PARTNER_COMP + H_CO_STAFF_COMP + H_CO_OFFICE +
  H_CO_PROF_SERV + H_CO_TECH + H_CO_INSURANCE + H_CO_TRAVEL +
  H_CO_IT_LIC + H_CO_MARKETING + H_CO_MISC;

const H_CO_PRE_TAX = H_CO_TOTAL_REV - H_CO_TOTAL_EXP;
const H_CO_TAX = H_CO_PRE_TAX > 0 ? H_CO_PRE_TAX * DEFAULT_COMPANY_TAX_RATE : 0;
const H_CO_NET_INCOME = H_CO_PRE_TAX - H_CO_TAX;

// Month 0 gets SAFE funding
const H_CO_CF_MONTH0 = H_CO_NET_INCOME + 800_000;
const H_CO_CF_NORMAL = H_CO_NET_INCOME;

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS (~70 assertions)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Golden Scenario: Clearwater Inn — Mgmt Co + 1 Property", () => {
  const propFinancials = generatePropertyProForma(PROPERTY, GLOBAL, MONTHS);
  const companyFinancials = generateCompanyProForma([PROPERTY], GLOBAL, MONTHS);
  const yearlyProp = aggregatePropertyByYear(propFinancials, 2);
  const yearlyCF = aggregateCashFlowByYear(
    propFinancials,
    { ...PROPERTY, preOpeningCosts: 50_000 } as any,
    GLOBAL as any,
    2,
  );

  // ─── PROPERTY: Month 1 (index 0) Revenue ─────────────────────────────────
  describe("Property Income Statement — Month 1", () => {
    const m0 = propFinancials[0];

    it("revenue lines match hand calculation", () => {
      expect(m0.revenueRooms).toBeCloseTo(H_REV_ROOMS, 0);
      expect(m0.revenueEvents).toBeCloseTo(H_REV_EVENTS, 0);
      expect(m0.revenueFB).toBeCloseTo(H_REV_FB, 0);
      expect(m0.revenueOther).toBeCloseTo(H_REV_OTHER, 0);
      expect(m0.revenueTotal).toBeCloseTo(H_REV_TOTAL, 0);
    });

    it("variable expense lines match", () => {
      expect(m0.expenseRooms).toBeCloseTo(H_EXP_ROOMS, 0);
      expect(m0.expenseFB).toBeCloseTo(H_EXP_FB, 0);
      expect(m0.expenseEvents).toBeCloseTo(H_EXP_EVENTS, 0);
      expect(m0.expenseOther).toBeCloseTo(H_EXP_OTHER, 0);
      expect(m0.expenseMarketing).toBeCloseTo(H_EXP_MARKETING, 0);
      expect(m0.expenseUtilitiesVar).toBeCloseTo(H_EXP_UTIL_VAR, 0);
      expect(m0.expenseFFE).toBeCloseTo(H_EXP_FFE, 0);
    });

    it("fixed expense lines match", () => {
      expect(m0.expenseAdmin).toBeCloseTo(H_EXP_ADMIN, 0);
      expect(m0.expensePropertyOps).toBeCloseTo(H_EXP_PROP_OPS, 0);
      expect(m0.expenseIT).toBeCloseTo(H_EXP_IT, 0);
      expect(m0.expenseTaxes).toBeCloseTo(H_EXP_TAXES, 0);
      expect(m0.expenseUtilitiesFixed).toBeCloseTo(H_EXP_UTIL_FIXED, 0);
      expect(m0.expenseOtherCosts).toBeCloseTo(H_EXP_OTHER_COSTS, 0);
    });

    it("USALI waterfall: GOP → fees → AGOP → NOI → ANOI", () => {
      expect(m0.gop).toBeCloseTo(H_GOP, 0);
      expect(m0.feeBase).toBeCloseTo(H_FEE_BASE, 0);
      expect(m0.feeIncentive).toBeCloseTo(H_FEE_INCENTIVE, 0);
      expect(m0.agop).toBeCloseTo(H_AGOP, 0);
      expect(m0.noi).toBeCloseTo(H_NOI, 0);
      expect(m0.anoi).toBeCloseTo(H_ANOI, 0);
    });

    it("no debt service (cash purchase)", () => {
      expect(m0.debtPayment).toBe(0);
      expect(m0.interestExpense).toBe(0);
      expect(m0.principalPayment).toBe(0);
      expect(m0.debtOutstanding).toBe(0);
    });

    it("income statement: depreciation, tax, net income", () => {
      expect(m0.depreciationExpense).toBeCloseTo(H_MONTHLY_DEPR, 0);
      expect(m0.incomeTax).toBeCloseTo(H_INCOME_TAX, 0);
      expect(m0.netIncome).toBeCloseTo(H_NET_INCOME, 0);
    });

    it("cash flow statement: OCF, FCF, ending cash", () => {
      expect(m0.cashFlow).toBeCloseTo(H_CASH_FLOW, 0);
      expect(m0.operatingCashFlow).toBeCloseTo(H_OPERATING_CF, 0);
      expect(m0.financingCashFlow).toBeCloseTo(0, 0);
    });
  });

  // ─── PROPERTY: Monthly Invariance (0% growth) ─────────────────────────────
  describe("Property Monthly Invariance (0% growth)", () => {
    it("revenue is identical month 1 through month 24", () => {
      for (let i = 0; i < 24; i++) {
        expect(propFinancials[i].revenueTotal).toBeCloseTo(H_REV_TOTAL, 0);
      }
    });

    it("GOP, NOI, and ANOI are identical every month", () => {
      for (let i = 0; i < 24; i++) {
        expect(propFinancials[i].gop).toBeCloseTo(H_GOP, 0);
        expect(propFinancials[i].noi).toBeCloseTo(H_NOI, 0);
        expect(propFinancials[i].anoi).toBeCloseTo(H_ANOI, 0);
      }
    });

    it("net income is identical every month (no debt amortization variation)", () => {
      for (let i = 0; i < 24; i++) {
        expect(propFinancials[i].netIncome).toBeCloseTo(H_NET_INCOME, 0);
      }
    });

    it("cash flow is identical every month", () => {
      for (let i = 0; i < 24; i++) {
        expect(propFinancials[i].cashFlow).toBeCloseTo(H_CASH_FLOW, 0);
      }
    });
  });

  // ─── PROPERTY: Yearly Income Statement ─────────────────────────────────────
  describe("Property Yearly Income Statement", () => {
    it("Year 1 revenue = 12 × monthly", () => {
      expect(yearlyProp[0].revenueTotal).toBeCloseTo(H_REV_TOTAL * 12, 0);
      expect(yearlyProp[0].revenueRooms).toBeCloseTo(H_REV_ROOMS * 12, 0);
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

    it("Year 1 depreciation = 12 × monthly depreciation", () => {
      expect(yearlyProp[0].depreciationExpense).toBeCloseTo(H_MONTHLY_DEPR * 12, 0);
    });

    it("Year 1 net income = 12 × monthly net income", () => {
      expect(yearlyProp[0].netIncome).toBeCloseTo(H_NET_INCOME * 12, 0);
    });

    it("Year 1 ending cash = month 12 ending cash (PICK_LAST)", () => {
      expect(yearlyProp[0].endingCash).toBeCloseTo(propFinancials[11].endingCash, 0);
    });

    it("Year 2 revenue = Year 1 revenue (0% growth)", () => {
      expect(yearlyProp[1].revenueTotal).toBeCloseTo(yearlyProp[0].revenueTotal, 0);
    });
  });

  // ─── PROPERTY: Cash Flow Statement (yearly) ──────────────────────────────
  describe("Property Yearly Cash Flow Statement", () => {
    it("Year 1 operating cash flow = net income + depreciation", () => {
      const y1NI = H_NET_INCOME * 12;
      const y1Depr = H_MONTHLY_DEPR * 12;
      expect(yearlyCF[0].operatingCashFlow).toBeCloseTo(y1NI + y1Depr, 0);
    });

    it("Year 1 BTCF = ANOI (no debt service)", () => {
      expect(yearlyCF[0].btcf).toBeCloseTo(H_ANOI * 12, 0);
    });

    it("Year 1 ATCF = BTCF - tax liability", () => {
      expect(yearlyCF[0].atcf).toBeCloseTo(yearlyCF[0].btcf - yearlyCF[0].taxLiability, 0);
    });

    it("Year 2 (last year) has exit value", () => {
      const annualNOI = H_NOI * 12;
      const grossValue = annualNOI / 0.08;  // exitCapRate
      const commission = grossValue * 0.02;  // dispositionCommission
      const debtAtExit = 0; // no debt
      const expectedExit = grossValue - commission - debtAtExit;
      expect(yearlyCF[1].exitValue).toBeCloseTo(expectedExit, 0);
    });
  });

  // ─── PROPERTY: Balance Sheet Identity (A = L + E) ────────────────────────
  describe("Property Balance Sheet Identity (ASC 210)", () => {
    it("A = L + E every month (within $1)", () => {
      // For balance sheet: Assets = endingCash + propertyValue
      // Liabilities = debtOutstanding (0 for cash purchase)
      // Equity = initialEquity + cumulative net income
      // initialEquity = totalPropertyValue (purchase + improvements)
      // Reserve is included in endingCash, and must also be in initialEquity
      const initialEquity = H_TOTAL_PROP_VALUE + 75_000; // property value + operating reserve
      let cumNI = 0;
      for (let i = 0; i < 24; i++) {
        const m = propFinancials[i];
        cumNI += m.netIncome;
        const totalAssets = m.endingCash + m.propertyValue;
        const totalLiabilities = m.debtOutstanding; // 0 for cash purchase
        const derivedEquity = initialEquity + cumNI;
        const gap = Math.abs(totalAssets - totalLiabilities - derivedEquity);
        expect(gap).toBeLessThan(1.0);
      }
    });
  });

  // ─── PROPERTY: GAAP Cash Flow Identities ────────────────────────────────
  describe("Property GAAP Identities", () => {
    it("OCF = NI + Depreciation every month (ASC 230)", () => {
      for (let i = 0; i < 24; i++) {
        const m = propFinancials[i];
        expect(m.operatingCashFlow).toBeCloseTo(m.netIncome + m.depreciationExpense, 0);
      }
    });

    it("Financing CF = 0 every month (no debt)", () => {
      for (let i = 0; i < 24; i++) {
        expect(propFinancials[i].financingCashFlow).toBeCloseTo(0, 0);
      }
    });

    it("Cash flow = OCF + FCF (operating + financing)", () => {
      for (let i = 0; i < 24; i++) {
        const m = propFinancials[i];
        expect(m.cashFlow).toBeCloseTo(m.operatingCashFlow + m.financingCashFlow, 0);
      }
    });

    it("ending cash is cumulative sum of monthly cash flows (starting from reserve)", () => {
      let cumCash = 75_000; // operating reserve seeds ending cash
      for (let i = 0; i < 24; i++) {
        cumCash += propFinancials[i].cashFlow;
        expect(propFinancials[i].endingCash).toBeCloseTo(cumCash, 0);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MANAGEMENT COMPANY
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Company Income Statement — Month 1", () => {
    const c0 = companyFinancials[0];

    it("fee revenue matches property fee expense", () => {
      expect(c0.baseFeeRevenue).toBeCloseTo(H_FEE_BASE, 0);
      expect(c0.incentiveFeeRevenue).toBeCloseTo(H_FEE_INCENTIVE, 0);
      expect(c0.totalRevenue).toBeCloseTo(H_CO_TOTAL_REV, 0);
    });

    it("operating expenses match hand calculation", () => {
      expect(c0.partnerCompensation).toBeCloseTo(H_CO_PARTNER_COMP, 0);
      expect(c0.staffCompensation).toBeCloseTo(H_CO_STAFF_COMP, 0);
      expect(c0.officeLease).toBeCloseTo(H_CO_OFFICE, 0);
      expect(c0.professionalServices).toBeCloseTo(H_CO_PROF_SERV, 0);
      expect(c0.techInfrastructure).toBeCloseTo(H_CO_TECH, 0);
      expect(c0.travelCosts).toBeCloseTo(H_CO_TRAVEL, 0);
      expect(c0.itLicensing).toBeCloseTo(H_CO_IT_LIC, 0);
      expect(c0.marketing).toBeCloseTo(H_CO_MARKETING, 0);
      expect(c0.miscOps).toBeCloseTo(H_CO_MISC, 0);
      expect(c0.totalExpenses).toBeCloseTo(H_CO_TOTAL_EXP, 0);
    });

    it("profitability: pre-tax, tax, net income", () => {
      expect(c0.preTaxIncome).toBeCloseTo(H_CO_PRE_TAX, 0);
      expect(c0.companyIncomeTax).toBeCloseTo(H_CO_TAX, 0);
      expect(c0.netIncome).toBeCloseTo(H_CO_NET_INCOME, 0);
    });

    it("SAFE funding arrives in month 0", () => {
      expect(c0.safeFunding).toBe(800_000);
      expect(c0.cashFlow).toBeCloseTo(H_CO_CF_MONTH0, 0);
    });
  });

  describe("Company Monthly Invariants (0% inflation)", () => {
    it("fee revenue identical every month (same property output)", () => {
      for (let i = 0; i < 24; i++) {
        expect(companyFinancials[i].totalRevenue).toBeCloseTo(H_CO_TOTAL_REV, 0);
      }
    });

    it("total expenses identical every month (0% escalation, 1 active prop)", () => {
      for (let i = 0; i < 24; i++) {
        expect(companyFinancials[i].totalExpenses).toBeCloseTo(H_CO_TOTAL_EXP, 0);
      }
    });

    it("net income identical every month", () => {
      for (let i = 0; i < 24; i++) {
        expect(companyFinancials[i].netIncome).toBeCloseTo(H_CO_NET_INCOME, 0);
      }
    });

    it("ending cash decreases monotonically (company is unprofitable with 1 small property)", () => {
      // With 1 small property: fee revenue is much less than expenses
      // (partner comp $45K alone exceeds total fee revenue). SAFE funding covers losses.
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

  // ─── Company Staffing Tier ───────────────────────────────────────────────
  describe("Company Staffing: 1 property = tier 1 (2.5 FTE)", () => {
    it("staff comp reflects 2.5 FTE at $75K", () => {
      const expected = (2.5 * 75_000) / 12; // 15,625
      expect(companyFinancials[0].staffCompensation).toBeCloseTo(expected, 0);
    });

    it("travel cost scales with 1 property", () => {
      expect(companyFinancials[0].travelCosts).toBeCloseTo((1 * 12_000) / 12, 0);
    });

    it("IT licensing scales with 1 property", () => {
      expect(companyFinancials[0].itLicensing).toBeCloseTo((1 * 3_000) / 12, 0);
    });
  });

  // ─── Company Cash Balance Continuity ─────────────────────────────────────
  describe("Company Cash Balance Continuity", () => {
    it("ending cash = cumulative sum of all monthly cash flows", () => {
      let cumCash = 0;
      for (let i = 0; i < 24; i++) {
        cumCash += companyFinancials[i].cashFlow;
        expect(companyFinancials[i].endingCash).toBeCloseTo(cumCash, 0);
      }
    });

    it("SAFE tranche 1 = $800,000 in month 0 only", () => {
      expect(companyFinancials[0].safeFunding).toBe(800_000);
      expect(companyFinancials[1].safeFunding).toBe(0);
    });
  });

  // ─── Company Balance Sheet Identity ──────────────────────────────────────
  describe("Company BS: A = L + E", () => {
    it("A = L + E identity: Cash = SAFE_Notes + Retained_Earnings", () => {
      let cumNI = 0;
      for (let i = 0; i < 24; i++) {
        cumNI += companyFinancials[i].netIncome;
        const assets = companyFinancials[i].endingCash;
        const liabilities = 800_000; // SAFE notes
        const equity = cumNI;
        expect(Math.abs(assets - liabilities - equity)).toBeLessThan(1);
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
        expect(propFees).toBeCloseTo(coFees, 0);
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
    it("consolidated external revenue = property revenue (company fees are intercompany)", () => {
      for (let i = 0; i < 24; i++) {
        expect(propFinancials[i].revenueTotal).toBeCloseTo(H_REV_TOTAL, 0);
      }
    });

    it("combined cash = property cash + company cash at month 24", () => {
      const totalCash = propFinancials[23].endingCash + companyFinancials[23].endingCash;
      const propCash24 = 75_000 + H_CASH_FLOW * 24; // reserve + 24 months of cash flow
      const coCash24 = 800_000 + H_CO_NET_INCOME * 24;
      expect(totalCash).toBeCloseTo(propCash24 + coCash24, 0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PORTFOLIO: Sum of Parts Identity (1 property = trivial)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Portfolio: sum of parts identity (single property)", () => {
    it("portfolio revenue = single property revenue", () => {
      for (let i = 0; i < 24; i++) {
        expect(propFinancials[i].revenueTotal).toBeCloseTo(H_REV_TOTAL, 0);
      }
    });

    it("portfolio NOI = single property NOI", () => {
      for (let i = 0; i < 24; i++) {
        expect(propFinancials[i].noi).toBeCloseTo(H_NOI, 0);
      }
    });

    it("portfolio total fees = company total revenue", () => {
      for (let i = 0; i < 24; i++) {
        const propFees = propFinancials[i].feeBase + propFinancials[i].feeIncentive;
        expect(propFees).toBeCloseTo(companyFinancials[i].totalRevenue, 0);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // EXACT HAND-CALCULATED REFERENCE VALUES (spot checks)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Exact Hand-Calculated Values", () => {
    it("available rooms = 457.5", () => {
      expect(H_AVAIL_ROOMS).toBe(457.5);
    });

    it("sold rooms = 311.1", () => {
      expect(H_SOLD_ROOMS).toBeCloseTo(311.1, 1);
    });

    it("room revenue = $54,442.50", () => {
      expect(H_REV_ROOMS).toBeCloseTo(54442.50, 2);
      expect(propFinancials[0].revenueRooms).toBeCloseTo(54442.50, 0);
    });

    it("monthly depreciation = building_value / DEPRECIATION_YEARS / 12", () => {
      const expected = 1_325_000 / DEPRECIATION_YEARS / 12;
      expect(propFinancials[0].depreciationExpense).toBeCloseTo(expected, 0);
    });

    it("company monthly partner comp = $45,000", () => {
      expect(companyFinancials[0].partnerCompensation).toBeCloseTo(45000, 0);
    });

    it("company monthly staff comp = $15,625", () => {
      expect(companyFinancials[0].staffCompensation).toBeCloseTo(15625, 0);
    });

    it("SAFE tranche 1 = $800,000 in month 0 only", () => {
      expect(companyFinancials[0].safeFunding).toBe(800_000);
      expect(companyFinancials[1].safeFunding).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PROPERTY VALUE TRACKING (depreciation schedule)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Property Value Tracking (depreciation schedule)", () => {
    it("property value decreases by depreciation each month", () => {
      for (let i = 1; i < 24; i++) {
        const decrease = propFinancials[i - 1].propertyValue - propFinancials[i].propertyValue;
        expect(decrease).toBeCloseTo(H_MONTHLY_DEPR, 0);
      }
    });

    it("month 0 property value = land + building - 1 month depreciation", () => {
      const expected = H_LAND_VALUE + H_BUILDING_VALUE - H_MONTHLY_DEPR;
      expect(propFinancials[0].propertyValue).toBeCloseTo(expected, 0);
    });

    it("month 23 property value = land + building - 24 months depreciation", () => {
      const expected = H_LAND_VALUE + H_BUILDING_VALUE - H_MONTHLY_DEPR * 24;
      expect(propFinancials[23].propertyValue).toBeCloseTo(expected, 0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // OPERATING RESERVE HANDLING
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Operating Reserve", () => {
    it("operating reserve seeds into ending cash at acquisition month", () => {
      // Month 0 endingCash = reserve + cashFlow
      expect(propFinancials[0].endingCash).toBeCloseTo(75_000 + H_CASH_FLOW, 0);
    });

    it("month 12 ending cash = reserve + 12 x cash flow", () => {
      expect(propFinancials[11].endingCash).toBeCloseTo(75_000 + H_CASH_FLOW * 12, 0);
    });

    it("month 24 ending cash = reserve + 24 x cash flow", () => {
      expect(propFinancials[23].endingCash).toBeCloseTo(75_000 + H_CASH_FLOW * 24, 0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // REVENUE COMPONENT RATIOS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("Revenue Component Ratios", () => {
    it("events revenue = 18% of total revenue", () => {
      expect(propFinancials[0].revenueEvents / propFinancials[0].revenueTotal)
        .toBeCloseTo(DEFAULT_REV_SHARE_EVENTS, 6);
    });

    it("F&B revenue = 30% of total revenue", () => {
      expect(propFinancials[0].revenueFB / propFinancials[0].revenueTotal)
        .toBeCloseTo(DEFAULT_REV_SHARE_FB, 6);
    });

    it("other revenue = 3% of total revenue", () => {
      expect(propFinancials[0].revenueOther / propFinancials[0].revenueTotal)
        .toBeCloseTo(DEFAULT_REV_SHARE_OTHER, 6);
    });

    it("base fee = 8.5% of total revenue", () => {
      expect(propFinancials[0].feeBase / propFinancials[0].revenueTotal)
        .toBeCloseTo(DEFAULT_BASE_MANAGEMENT_FEE_RATE, 6);
    });
  });
});
