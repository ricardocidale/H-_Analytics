/**
 * Golden Scenario: Pre-Operations Gap + Refinance Combo
 *
 * Property with a 6-month pre-ops gap AND a refinance at Month 36.
 * During the gap: debt payments accrue, depreciation runs, ZERO revenue.
 * At month 6, operations begin. At month 36, the original loan is refinanced.
 *
 * All values hand-calculated. 0% growth / 0% inflation for traceability.
 *
 * PROPERTY: 15 rooms, $180 ADR, 65% flat occ, $2M purchase, 60% LTV @ 7.5% / 25yr
 *           Acquired 2025-01-01, ops start 2025-07-01
 *           Refinance: Month 36 (Jan 2028), 55% LTV, 6.5%, 20yr, 3% closing, exit cap 8.5%
 *           Operating reserve: $25,000, tax rate: 25%
 *
 * Projection: 10 years (120 months).
 */
import { describe, it, expect } from "vitest";
import { generatePropertyProForma } from "../../client/src/lib/financial/property-engine";
import { pmt } from "../../calc/shared/pmt";
import {
  DEFAULT_REV_SHARE_EVENTS, DEFAULT_REV_SHARE_FB, DEFAULT_REV_SHARE_OTHER,
  DEFAULT_CATERING_BOOST_PCT, DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE, DEFAULT_COST_RATE_ROOMS,
  DEFAULT_COST_RATE_FB, DEFAULT_COST_RATE_ADMIN, DEFAULT_COST_RATE_MARKETING,
  DEFAULT_COST_RATE_PROPERTY_OPS, DEFAULT_COST_RATE_UTILITIES,
  DEFAULT_COST_RATE_TAXES, DEFAULT_COST_RATE_IT, DEFAULT_COST_RATE_FFE, DEFAULT_COST_RATE_OTHER, DEFAULT_COST_RATE_INSURANCE,
  DEFAULT_EVENT_EXPENSE_RATE, DEFAULT_OTHER_EXPENSE_RATE, DEFAULT_UTILITIES_VARIABLE_SPLIT,
  DAYS_PER_MONTH, DEPRECIATION_YEARS, DEFAULT_LAND_VALUE_PERCENT,
} from "../../shared/constants";

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO INPUTS
// ═══════════════════════════════════════════════════════════════════════════════

const PROPERTY = {
  id: 1,
  name: "PreOps Refi Lodge",
  type: "Financed",
  purchasePrice: 2_000_000,
  buildingImprovements: 0,
  preOpeningCosts: 0,
  roomCount: 15,
  startAdr: 180,
  startOccupancy: 0.65,
  maxOccupancy: 0.65,
  occupancyGrowthStep: 0,       // flat occupancy
  occupancyRampMonths: 6,
  adrGrowthRate: 0,
  inflationRate: 0,
  operationsStartDate: "2025-07-01",  // 6 months after acquisition
  acquisitionDate: "2025-01-01",
  operatingReserve: 25_000,
  taxRate: 0.25,
  acquisitionLTV: 0.60,
  acquisitionInterestRate: 0.075,
  acquisitionTermYears: 25,
  exitCapRate: 0.085,
  dispositionCommission: 0.05,
  willRefinance: "Yes",
  refinanceDate: "2028-01-01",       // Month 36
  refinanceLTV: 0.55,
  refinanceInterestRate: 0.065,
  refinanceTermYears: 20,
  refinanceClosingCostRate: 0.03,
} as any;

const GLOBAL = {
  modelStartDate: "2025-01-01",
  projectionYears: 10,
  inflationRate: 0,
  fixedCostEscalationRate: 0,
  companyInflationRate: 0,
  companyTaxRate: 0.30,
  companyOpsStartDate: "2025-07-01",
  safeTranche1Date: "2025-01-01",
  safeTranche1Amount: 800_000,
  safeTranche2Date: null,
  safeTranche2Amount: 0,
  staffSalary: 75_000,
  staffTier1MaxProperties: 3,
  staffTier1Fte: 2.5,
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

const MONTHS = 120;

// ═══════════════════════════════════════════════════════════════════════════════
// HAND CALCULATIONS — PROPERTY MONTHLY (operational months, all identical)
// ═══════════════════════════════════════════════════════════════════════════════

// Revenue
const H_AVAIL_ROOMS = 15 * DAYS_PER_MONTH;                          // 457.5
const H_SOLD_ROOMS = H_AVAIL_ROOMS * 0.65;                          // 297.375
const H_REV_ROOMS = H_SOLD_ROOMS * 180;                             // 53,527.50
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

// Fixed expenses (0% escalation, based on property value or base revenue)
const H_TOTAL_PROP_VALUE = 2_000_000;
const H_BASE_TOTAL_REV = H_REV_TOTAL;
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

// Original loan
const H_LOAN = 2_000_000 * 0.60;                                    // 1,200,000
const H_MONTHLY_RATE = 0.075 / 12;                                  // 0.00625
const H_TOTAL_PAYMENTS = 25 * 12;                                   // 300
const H_PMT = pmt(H_LOAN, H_MONTHLY_RATE, H_TOTAL_PAYMENTS);

// Depreciation
const H_BUILDING_VALUE = 2_000_000 * (1 - DEFAULT_LAND_VALUE_PERCENT); // 1,500,000
const H_MONTHLY_DEPR = H_BUILDING_VALUE / DEPRECIATION_YEARS / 12;
const H_LAND_VALUE = 2_000_000 * DEFAULT_LAND_VALUE_PERCENT;         // 500,000

// Build original amortization schedule (for months 0-35, before refi)
function buildOrigAmortSchedule(months: number) {
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
const H_ORIG_AMORT = buildOrigAmortSchedule(36); // only need 36 months of original

// Refinance calculations at Month 36
// Existing debt at month 35 (end of month 35 = start of month 36)
const H_EXISTING_DEBT_AT_REFI = H_ORIG_AMORT[35].balance;

// Property valuation uses cost basis (purchase price + building improvements)
const H_REFI_PROPERTY_VALUE = 2_000_000 + 0; // purchasePrice + buildingImprovements

// New loan = min(LTV-based, DSCR-based) — no DSCR constraint in our setup
const H_NEW_LOAN_GROSS = Math.round((H_REFI_PROPERTY_VALUE * 0.55) * 100) / 100;
const H_CLOSING_COSTS = Math.round((H_NEW_LOAN_GROSS * 0.03) * 100) / 100;
const H_NEW_LOAN_NET = Math.round((H_NEW_LOAN_GROSS - H_CLOSING_COSTS) * 100) / 100;

// Cash-out to equity = net proceeds - old loan payoff
const H_PAYOFF = H_EXISTING_DEBT_AT_REFI;
const H_RAW_CASH_OUT = Math.round((H_NEW_LOAN_NET - H_PAYOFF) * 100) / 100;
const H_CASH_OUT = H_RAW_CASH_OUT > 0 ? H_RAW_CASH_OUT : 0;

// New loan debt service
const H_REFI_MONTHLY_RATE = 0.065 / 12;
const H_REFI_TOTAL_PAYMENTS = 20 * 12;  // 240
const H_REFI_PMT = pmt(H_NEW_LOAN_GROSS, H_REFI_MONTHLY_RATE, H_REFI_TOTAL_PAYMENTS);

// Build refi amortization schedule
function buildRefiAmortSchedule(months: number) {
  let balance = H_NEW_LOAN_GROSS;
  const schedule: { interest: number; principal: number; balance: number }[] = [];
  for (let m = 0; m < months; m++) {
    const interest = balance * H_REFI_MONTHLY_RATE;
    const principal = H_REFI_PMT - interest;
    balance = Math.max(0, balance - principal);
    schedule.push({ interest, principal, balance });
  }
  return schedule;
}
const H_REFI_AMORT = buildRefiAmortSchedule(MONTHS - 36);

// Initial equity for BS identity
const H_INITIAL_EQUITY = H_TOTAL_PROP_VALUE - H_LOAN + 25_000; // purchase - loan + reserve = 825,000

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: Compute hand values for any month
// ═══════════════════════════════════════════════════════════════════════════════

function handMonthPreOps(monthIdx: number) {
  // Pre-ops: months 0-5 — zero revenue, debt only
  const amort = H_ORIG_AMORT[monthIdx];
  const interest = amort.interest;
  const principal = amort.principal;
  const depr = H_MONTHLY_DEPR;
  // taxableIncome = 0 - interest - depr < 0 → tax = 0
  const taxableIncome = 0 - interest - depr;
  const incomeTax = 0;
  const netIncome = 0 - interest - depr;  // = -(interest + depr)
  const cashFlow = 0 - H_PMT - 0;         // = -PMT
  const operatingCF = netIncome + depr;    // = -interest
  const financingCF = -principal;
  return { interest, principal, debtOutstanding: amort.balance, depr, taxableIncome, incomeTax, netIncome, cashFlow, operatingCF, financingCF };
}

function handMonthOrigDebt(monthIdx: number) {
  // Operational months with original debt (months 6-35)
  const amort = H_ORIG_AMORT[monthIdx];
  const interest = amort.interest;
  const principal = amort.principal;
  const depr = H_MONTHLY_DEPR;
  const taxableIncome = H_ANOI - interest - depr;
  const incomeTax = taxableIncome > 0 ? taxableIncome * 0.25 : 0;
  const netIncome = H_ANOI - interest - depr - incomeTax;
  const cashFlow = H_ANOI - H_PMT - incomeTax;
  const operatingCF = netIncome + depr;
  const financingCF = -principal;
  return { interest, principal, debtOutstanding: amort.balance, depr, taxableIncome, incomeTax, netIncome, cashFlow, operatingCF, financingCF };
}

function handMonthRefiDebt(monthIdx: number) {
  // Operational months with refi debt (months 36+)
  const monthsSinceRefi = monthIdx - 36;
  const amort = H_REFI_AMORT[monthsSinceRefi];
  const interest = amort.interest;
  const principal = amort.principal;
  const depr = H_MONTHLY_DEPR;
  const debtPayment = H_REFI_PMT;
  const taxableIncome = H_ANOI - interest - depr;
  const incomeTax = taxableIncome > 0 ? taxableIncome * 0.25 : 0;
  const netIncome = H_ANOI - interest - depr - incomeTax;
  const cashFlow = H_ANOI - debtPayment - incomeTax;
  const operatingCF = netIncome + depr;
  const financingCF = -principal;
  return { interest, principal, debtOutstanding: amort.balance, depr, taxableIncome, incomeTax, netIncome, cashFlow, operatingCF, financingCF, debtPayment };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe("Golden Scenario: Pre-Ops Gap + Refinance Combo", () => {
  const propF = generatePropertyProForma(PROPERTY, GLOBAL, MONTHS);

  // ─── 1. Month 0 (acquisition): reserve seeded, debt starts ────────────
  describe("Month 0 (acquisition): reserve seeded, debt starts", () => {
    it("zero revenue during pre-ops", () => {
      expect(propF[0].revenueTotal).toBe(0);
      expect(propF[0].revenueRooms).toBe(0);
      expect(propF[0].occupancy).toBe(0);
    });

    it("debt service accrues from acquisition", () => {
      expect(propF[0].debtPayment).toBeCloseTo(H_PMT, 2);
      expect(propF[0].interestExpense).toBeCloseTo(H_ORIG_AMORT[0].interest, 2);
      expect(propF[0].principalPayment).toBeCloseTo(H_ORIG_AMORT[0].principal, 2);
    });

    it("depreciation runs from acquisition", () => {
      expect(propF[0].depreciationExpense).toBeCloseTo(H_MONTHLY_DEPR, 2);
    });

    it("operating reserve seeds cash at month 0", () => {
      // endingCash(0) = reserve + cashFlow(0) = 25,000 + (-PMT)
      expect(propF[0].endingCash).toBeCloseTo(25_000 + propF[0].cashFlow, 2);
    });

    it("cash flow = -PMT (no revenue, no tax)", () => {
      expect(propF[0].cashFlow).toBeCloseTo(-H_PMT, 2);
    });

    it("net income is negative (loss from interest + depreciation)", () => {
      expect(propF[0].netIncome).toBeLessThan(0);
      expect(propF[0].incomeTax).toBe(0);
    });
  });

  // ─── 2. Month 3 (mid pre-ops): cash depleting, revenue = 0 ───────────
  describe("Month 3 (mid pre-ops): cash depleting", () => {
    it("still zero revenue", () => {
      expect(propF[3].revenueTotal).toBe(0);
      expect(propF[3].gop).toBe(0);
      expect(propF[3].noi).toBe(0);
      expect(propF[3].anoi).toBe(0);
    });

    it("debt outstanding decreasing from original loan", () => {
      expect(propF[3].debtOutstanding).toBeCloseTo(H_ORIG_AMORT[3].balance, 0);
      expect(propF[3].debtOutstanding).toBeLessThan(H_LOAN);
    });

    it("cash is depleting through the gap", () => {
      // Cash = reserve - PMT*4 (months 0,1,2,3)
      let cumCash = 25_000;
      for (let i = 0; i <= 3; i++) {
        cumCash += propF[i].cashFlow;
      }
      expect(propF[3].endingCash).toBeCloseTo(cumCash, 2);
      expect(propF[3].endingCash).toBeLessThan(propF[0].endingCash);
    });
  });

  // ─── 3. Month 6 (ops start): revenue begins ──────────────────────────
  describe("Month 6 (operations start): revenue begins", () => {
    it("revenue starts at month 6", () => {
      expect(propF[5].revenueTotal).toBe(0);  // last pre-ops month
      expect(propF[6].revenueTotal).toBeCloseTo(H_REV_TOTAL, 0);
      expect(propF[6].revenueRooms).toBeCloseTo(H_REV_ROOMS, 2);
    });

    it("occupancy = 65% (flat)", () => {
      expect(propF[6].occupancy).toBe(0.65);
    });

    it("fixed expenses activate at month 6", () => {
      expect(propF[5].expenseAdmin).toBe(0);
      expect(propF[6].expenseAdmin).toBeCloseTo(H_EXP_ADMIN, 2);
      expect(propF[6].expenseTaxes).toBeCloseTo(H_EXP_TAXES, 2);
    });

    it("management fees begin at month 6", () => {
      expect(propF[5].feeBase).toBe(0);
      expect(propF[6].feeBase).toBeCloseTo(H_FEE_BASE, 2);
      expect(propF[6].feeIncentive).toBeCloseTo(H_FEE_INCENTIVE, 2);
    });

    it("USALI waterfall correct at ops start", () => {
      expect(propF[6].gop).toBeCloseTo(H_GOP, 2);
      expect(propF[6].agop).toBeCloseTo(H_AGOP, 2);
      expect(propF[6].noi).toBeCloseTo(H_NOI, 2);
      expect(propF[6].anoi).toBeCloseTo(H_ANOI, 2);
    });
  });

  // ─── 4. Month 12 (Year 1 end): full revenue for 6 months ─────────────
  describe("Month 12 (end of Year 1): 6 operational months", () => {
    it("revenue identical every operational month (0% growth, flat occ)", () => {
      for (let i = 6; i <= 12; i++) {
        expect(propF[i].revenueTotal).toBeCloseTo(H_REV_TOTAL, 2);
      }
    });

    it("original debt schedule still in effect", () => {
      expect(propF[12].debtPayment).toBeCloseTo(H_PMT, 2);
      expect(propF[12].debtOutstanding).toBeCloseTo(H_ORIG_AMORT[12].balance, 0);
    });

    it("debt outstanding monotonically decreasing months 0-12", () => {
      for (let i = 1; i <= 12; i++) {
        expect(propF[i].debtOutstanding).toBeLessThan(propF[i - 1].debtOutstanding);
      }
    });
  });

  // ─── 5. Month 35 (before refi): original debt schedule ───────────────
  describe("Month 35 (just before refinance)", () => {
    it("still on original debt schedule", () => {
      expect(propF[35].debtPayment).toBeCloseTo(H_PMT, 2);
      expect(propF[35].debtOutstanding).toBeCloseTo(H_EXISTING_DEBT_AT_REFI, 0);
    });

    it("revenue still at same level", () => {
      expect(propF[35].revenueTotal).toBeCloseTo(H_REV_TOTAL, 2);
    });
  });

  // ─── 6. Month 36 (refi month): new debt, refi proceeds ───────────────
  describe("Month 36 (refinance month)", () => {
    it("debt payment changes to new refi PMT", () => {
      expect(propF[36].debtPayment).toBeCloseTo(H_REFI_PMT, 2);
      expect(propF[36].debtPayment).not.toBeCloseTo(H_PMT, 2);
    });

    it("new debt outstanding from refi loan", () => {
      expect(propF[36].debtOutstanding).toBeCloseTo(H_REFI_AMORT[0].balance, 0);
    });

    it("refinancing proceeds appear", () => {
      expect(propF[36].refinancingProceeds).toBeDefined();
      // Proceeds = cash out to equity (may be 0 or positive depending on valuation vs debt)
      if (H_CASH_OUT > 0) {
        expect(propF[36].refinancingProceeds).toBeCloseTo(H_CASH_OUT, 0);
      } else {
        expect(propF[36].refinancingProceeds).toBe(0);
      }
    });

    it("revenue unaffected by refinance", () => {
      expect(propF[36].revenueTotal).toBeCloseTo(H_REV_TOTAL, 2);
      expect(propF[36].anoi).toBeCloseTo(H_ANOI, 2);
    });

    it("interest expense reflects new rate", () => {
      // First month of refi: interest = newLoanGross × 0.065/12
      expect(propF[36].interestExpense).toBeCloseTo(H_REFI_AMORT[0].interest, 2);
    });
  });

  // ─── 7. Month 37 (after refi): new PMT applies ───────────────────────
  describe("Month 37 (first full month after refinance)", () => {
    it("new debt schedule in effect", () => {
      expect(propF[37].debtPayment).toBeCloseTo(H_REFI_PMT, 2);
      expect(propF[37].debtOutstanding).toBeCloseTo(H_REFI_AMORT[1].balance, 0);
    });

    it("no refinancing proceeds in subsequent months", () => {
      expect(propF[37].refinancingProceeds ?? 0).toBe(0);
    });

    it("interest less than or equal to refi month interest (amortizing)", () => {
      expect(propF[37].interestExpense).toBeLessThanOrEqual(propF[36].interestExpense + 0.01);
    });
  });

  // ─── 8. Financial identities: A=L+E each month ───────────────────────
  describe("Balance Sheet Identity: A = L + E (ASC 210)", () => {
    it("A = L + E within $1 for pre-refi months (0-35)", () => {
      let cumNI = 0;
      for (let i = 0; i < 36; i++) {
        const m = propF[i];
        cumNI += m.netIncome;
        const totalAssets = m.endingCash + m.propertyValue;
        const totalLiabilities = m.debtOutstanding;
        const derivedEquity = H_INITIAL_EQUITY + cumNI;
        const gap = Math.abs(totalAssets - totalLiabilities - derivedEquity);
        expect(gap).toBeLessThan(1.0);
      }
    });

    it("A = L + E within $1 for post-refi months (36-119), adjusted for closing costs", () => {
      // At refinance: cash (A) increases by refi proceeds, debt (L) increases by
      // (newLoanGross - oldBalance). Since proceeds = newLoanGross - closingCosts - oldBalance,
      // equity drops by closingCosts — a non-income capital transaction.
      // After refi: E = initialEquity + cumNI - closingCosts
      //
      // We derive closing costs from the actual engine data at the refi month:
      // closingCosts = (debtIncrease) - (refiProceeds) where debtIncrease = newDebt - oldDebt
      const oldDebt = propF[35].debtOutstanding;
      const refiProceeds = propF[36].refinancingProceeds ?? 0;
      // newLoanGross = first month refi balance + first month principal
      const firstRefiPrincipal = propF[36].principalPayment;
      const newLoanGross = propF[36].debtOutstanding + firstRefiPrincipal;
      const debtIncrease = newLoanGross - oldDebt;
      const closingCostsActual = debtIncrease - refiProceeds;

      let cumNI = 0;
      let equityAdj = 0;
      for (let i = 0; i < MONTHS; i++) {
        const m = propF[i];
        cumNI += m.netIncome;
        if (i === 36) {
          // Closing costs reduce equity (non-income financing cost)
          equityAdj -= closingCostsActual;
        }
        const totalAssets = m.endingCash + m.propertyValue;
        const totalLiabilities = m.debtOutstanding;
        const derivedEquity = H_INITIAL_EQUITY + cumNI + equityAdj;
        const gap = Math.abs(totalAssets - totalLiabilities - derivedEquity);
        expect(gap).toBeLessThan(1.0);
      }
    });
  });

  // ─── 9. OCF = NI + Depreciation every month ──────────────────────────
  describe("GAAP Identity: OCF = NI + Depreciation (ASC 230)", () => {
    it("holds for all 120 months", () => {
      for (let i = 0; i < MONTHS; i++) {
        const m = propF[i];
        expect(m.operatingCashFlow).toBeCloseTo(m.netIncome + m.depreciationExpense, 2);
      }
    });

    it("CFF = -Principal every month (except refi month adds proceeds)", () => {
      for (let i = 0; i < MONTHS; i++) {
        const m = propF[i];
        const proceeds = m.refinancingProceeds ?? 0;
        expect(m.financingCashFlow).toBeCloseTo(-m.principalPayment + proceeds, 2);
      }
    });

    it("cashFlow = OCF + FCF", () => {
      for (let i = 0; i < MONTHS; i++) {
        const m = propF[i];
        expect(m.cashFlow).toBeCloseTo(m.operatingCashFlow + m.financingCashFlow, 2);
      }
    });
  });

  // ─── 10. Reserve seeded exactly once (not doubled in Pass 2) ──────────
  describe("Operating reserve integrity", () => {
    it("reserve seeded exactly once — ending cash tracks correctly", () => {
      // Reconstruct cumulative cash to verify reserve is only added once
      let cumCash = 25_000; // reserve at month 0
      for (let i = 0; i < MONTHS; i++) {
        cumCash += propF[i].cashFlow;
        expect(propF[i].endingCash).toBeCloseTo(cumCash, 2);
      }
    });
  });

  // ─── 11. Pre-ops months have $0 revenue and $0 fixed expenses ────────
  describe("Pre-ops gate: months 0-5 fully gated", () => {
    it("zero revenue, zero GOP, zero NOI for months 0-5", () => {
      for (let i = 0; i < 6; i++) {
        expect(propF[i].revenueTotal).toBe(0);
        expect(propF[i].gop).toBe(0);
        expect(propF[i].noi).toBe(0);
        expect(propF[i].anoi).toBe(0);
      }
    });

    it("zero fixed expenses during pre-ops", () => {
      for (let i = 0; i < 6; i++) {
        expect(propF[i].expenseAdmin).toBe(0);
        expect(propF[i].expenseTaxes).toBe(0);
        expect(propF[i].expensePropertyOps).toBe(0);
      }
    });

    it("zero management fees during pre-ops", () => {
      for (let i = 0; i < 6; i++) {
        expect(propF[i].feeBase).toBe(0);
        expect(propF[i].feeIncentive).toBe(0);
      }
    });

    it("zero variable expenses during pre-ops", () => {
      for (let i = 0; i < 6; i++) {
        expect(propF[i].expenseRooms).toBe(0);
        expect(propF[i].expenseFB).toBe(0);
        expect(propF[i].expenseEvents ?? 0).toBe(0);
        expect(propF[i].expenseFFE).toBe(0);
      }
    });
  });

  // ─── 12. Debt outstanding continuity across refi ──────────────────────
  describe("Debt continuity across refinance", () => {
    it("debt monotonically decreases pre-refi (months 0-35)", () => {
      for (let i = 1; i < 36; i++) {
        expect(propF[i].debtOutstanding).toBeLessThan(propF[i - 1].debtOutstanding);
      }
    });

    it("debt jumps at refi month (new loan replaces old)", () => {
      // New loan gross should be different from old balance
      expect(propF[36].debtOutstanding).not.toBeCloseTo(propF[35].debtOutstanding, 0);
    });

    it("debt monotonically decreases post-refi (months 36-119)", () => {
      for (let i = 37; i < MONTHS; i++) {
        expect(propF[i].debtOutstanding).toBeLessThan(propF[i - 1].debtOutstanding);
      }
    });

    it("original PMT used for months 0-35, refi PMT for 36+", () => {
      for (let i = 0; i < 36; i++) {
        expect(propF[i].debtPayment).toBeCloseTo(H_PMT, 2);
      }
      for (let i = 36; i < MONTHS; i++) {
        expect(propF[i].debtPayment).toBeCloseTo(H_REFI_PMT, 2);
      }
    });
  });

  // ─── Exact hand-calculated spot values ────────────────────────────────
  describe("Exact hand-calculated reference values", () => {
    it("monthly room revenue = 15 × 30.5 × $180 × 0.65 = $53,527.50", () => {
      expect(H_REV_ROOMS).toBeCloseTo(53527.50, 2);
      expect(propF[6].revenueRooms).toBeCloseTo(53527.50, 2);
    });

    it("Month 0 interest = $7,500 (1,200,000 × 0.075/12)", () => {
      expect(propF[0].interestExpense).toBeCloseTo(7500, 2);
    });

    it("monthly depreciation = building / DEPRECIATION_YEARS / 12", () => {
      expect(propF[0].depreciationExpense).toBeCloseTo(1_500_000 / DEPRECIATION_YEARS / 12, 2);
    });

    it("original loan = $1,200,000", () => {
      // Debt outstanding at month 0 = loan - first month principal
      expect(propF[0].debtOutstanding).toBeCloseTo(H_ORIG_AMORT[0].balance, 0);
    });
  });
});
