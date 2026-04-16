/**
 * Golden Scenario: Underwater Exit (Negative Equity at Disposition)
 *
 * Tests a highly-leveraged property where the exit value (gross sale price
 * minus commission minus debt outstanding) is NEGATIVE — the property is
 * "underwater" because the loan balance exceeds the net sale proceeds.
 *
 * PROPERTY: 10 rooms, $120 ADR, 50% flat occupancy, $1.5M purchase price
 *           85% LTV @ 9% / 30yr (high leverage, slow amortization)
 *           Exit Year 5, cap rate 12% (distressed), commission 5%
 *           Operating reserve $10,000, tax rate 25%, 0% growth/inflation
 *
 * Key insight: With a 12% exit cap rate on modest NOI, the gross sale value
 * is far less than the ~$1.22M still owed on the 30-year loan after 5 years.
 *
 * Projection: 5 years (60 months) starting 2026-04-01.
 * Model start = ops start = acquisition date.
 */
import { describe, it, expect } from "vitest";
import { generatePropertyProForma } from "../../client/src/lib/financial/property-engine";
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
  DAYS_PER_MONTH, DEPRECIATION_YEARS, DEFAULT_LAND_VALUE_PERCENT,
} from "../../shared/constants";
import type { PropertyInput, GlobalInput } from "../../engine/types";

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO INPUTS
// ═══════════════════════════════════════════════════════════════════════════════

const PROPERTY: PropertyInput = {
  id: 1,
  name: "Underwater Lodge",
  type: "Financed",
  purchasePrice: 1_500_000,
  buildingImprovements: 0,
  preOpeningCosts: 0,
  roomCount: 10,
  startAdr: 120,
  startOccupancy: 0.50,
  maxOccupancy: 0.50,
  occupancyGrowthStep: 0,       // flat occupancy — no ramp
  occupancyRampMonths: 6,
  adrGrowthRate: 0,              // flat ADR — no growth
  inflationRate: 0,              // no inflation
  operationsStartDate: "2026-04-01",
  acquisitionDate: "2026-04-01",
  operatingReserve: 10_000,
  taxRate: 0.25,
  acquisitionLTV: 0.85,
  acquisitionInterestRate: 0.09,
  acquisitionTermYears: 30,
  exitCapRate: 0.12,
  dispositionCommission: 0.05,
  willRefinance: "No",
};

const GLOBAL: GlobalInput = {
  modelStartDate: "2026-04-01",
  projectionYears: 5,
  inflationRate: 0,
  fixedCostEscalationRate: 0,
  companyInflationRate: 0,
  companyTaxRate: 0.30,
  companyOpsStartDate: "2026-04-01",
  safeTranche1Date: "2026-04-01",
  safeTranche1Amount: 800_000,
  safeTranche2Date: null,
  safeTranche2Amount: 0,
};

const MONTHS = 60;

// ═══════════════════════════════════════════════════════════════════════════════
// HAND CALCULATIONS — PROPERTY MONTHLY (all months identical except debt)
// ═══════════════════════════════════════════════════════════════════════════════

// Revenue
const H_AVAIL_ROOMS = 10 * DAYS_PER_MONTH;                              // 305
const H_SOLD_ROOMS = H_AVAIL_ROOMS * 0.50;                              // 152.5
const H_REV_ROOMS = H_SOLD_ROOMS * 120;                                 // 18,300
// Revenue shares are % of TOTAL revenue; room share = 1 - ancillary
const H_ANCILLARY = DEFAULT_REV_SHARE_EVENTS + DEFAULT_REV_SHARE_FB + DEFAULT_REV_SHARE_OTHER;
const H_ROOM_SHARE = Math.max(0.05, 1 - H_ANCILLARY);
const H_REV_TOTAL = H_REV_ROOMS / H_ROOM_SHARE;
const H_REV_EVENTS = H_REV_TOTAL * DEFAULT_REV_SHARE_EVENTS;
const H_REV_FB = H_REV_TOTAL * DEFAULT_REV_SHARE_FB;
const H_REV_OTHER = H_REV_TOTAL * DEFAULT_REV_SHARE_OTHER;

// Variable expenses
const H_EXP_ROOMS = H_REV_ROOMS * DEFAULT_COST_RATE_ROOMS;              // 18300 * 0.20 = 3660
const H_EXP_FB = H_REV_FB * DEFAULT_COST_RATE_FB;                       // 4018.68 * 0.09 = 361.6812
const H_EXP_EVENTS = H_REV_EVENTS * DEFAULT_EVENT_EXPENSE_RATE;         // 5490 * 0.65 = 3568.50
const H_EXP_OTHER = H_REV_OTHER * DEFAULT_OTHER_EXPENSE_RATE;           // 915 * 0.60 = 549
const H_EXP_MARKETING = H_REV_TOTAL * DEFAULT_COST_RATE_MARKETING;      // 28723.68 * 0.01 = 287.2368
const H_EXP_UTIL_VAR = H_REV_TOTAL * (DEFAULT_COST_RATE_UTILITIES * DEFAULT_UTILITIES_VARIABLE_SPLIT); // 28723.68 * 0.03 = 861.7104
const H_EXP_FFE = H_REV_TOTAL * DEFAULT_COST_RATE_FFE;                  // 28723.68 * 0.04 = 1148.9472

// Fixed expenses (0% escalation → factor = 1)
const H_TOTAL_PROP_VALUE = 1_500_000;
const H_BASE_TOTAL_REV = H_REV_TOTAL; // same since 0% growth and occ at target
const H_EXP_ADMIN = H_BASE_TOTAL_REV * DEFAULT_COST_RATE_ADMIN;         // 28723.68 * 0.08 = 2297.8944
const H_EXP_PROP_OPS = H_BASE_TOTAL_REV * DEFAULT_COST_RATE_PROPERTY_OPS; // 28723.68 * 0.04 = 1148.9472
const H_EXP_IT = H_BASE_TOTAL_REV * DEFAULT_COST_RATE_IT;               // 28723.68 * 0.005 = 143.6184
const H_EXP_TAXES = (H_TOTAL_PROP_VALUE / 12) * DEFAULT_COST_RATE_TAXES;         // 125000 * 0.03 = 3750
const H_EXP_UTIL_FIXED = H_BASE_TOTAL_REV * (DEFAULT_COST_RATE_UTILITIES * (1 - DEFAULT_UTILITIES_VARIABLE_SPLIT)); // 28723.68 * 0.02 = 574.4736
const H_EXP_OTHER_COSTS = H_BASE_TOTAL_REV * DEFAULT_COST_RATE_OTHER;   // 28723.68 * 0.05 = 1436.184
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
const H_LOAN = 1_500_000 * 0.85;                                        // 1,275,000
const H_MONTHLY_RATE = 0.09 / 12;                                       // 0.0075
const H_TOTAL_PAYMENTS = 30 * 12;                                        // 360
const H_PMT = pmt(H_LOAN, H_MONTHLY_RATE, H_TOTAL_PAYMENTS);

// Depreciation
const H_LAND_PCT = DEFAULT_LAND_VALUE_PERCENT;                           // 0.25
const H_BUILDING_VALUE = H_TOTAL_PROP_VALUE * (1 - H_LAND_PCT);         // 1,125,000
const H_LAND_VALUE = H_TOTAL_PROP_VALUE * H_LAND_PCT;                   // 375,000
const H_MONTHLY_DEPR = H_BUILDING_VALUE / DEPRECIATION_YEARS / 12;      // 1125000 / 39 / 12

// Equity invested
const H_EQUITY = H_TOTAL_PROP_VALUE - H_LOAN;                           // 225,000

// Build amortization schedule for 60 months
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

// Exit calculations (Year 5)
const H_ANNUAL_NOI = H_NOI * 12;
const H_GROSS_VALUE = H_ANNUAL_NOI / 0.12;
const H_COMMISSION = H_GROSS_VALUE * 0.05;
const H_DEBT_AT_EXIT = H_AMORT[59].balance; // end of month 60 (index 59)
const H_EXIT_VALUE = H_GROSS_VALUE - H_COMMISSION - H_DEBT_AT_EXIT;

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe("Golden Scenario: Underwater Exit (Negative Equity)", () => {
  const propFinancials = generatePropertyProForma(PROPERTY, GLOBAL, MONTHS);
  const yearlyProp = aggregatePropertyByYear(propFinancials, 5);
  const yearlyCF = aggregateCashFlowByYear(
    propFinancials,
    { ...PROPERTY, preOpeningCosts: 0 } as PropertyInput,
    GLOBAL,
    5,
  );

  // ─── Revenue (Month 1 = index 0) ────────────────────────────────────────
  describe("Month 1 Revenue", () => {
    const m0 = propFinancials[0];

    it("room revenue = 10 × 30.5 × $120 × 0.50 = $18,300", () => {
      expect(m0.revenueRooms).toBeCloseTo(18_300, 2);
      expect(m0.revenueRooms).toBeCloseTo(H_REV_ROOMS, 2);
    });

    it("events, F&B, other revenue match hand calculation", () => {
      expect(m0.revenueEvents).toBeCloseTo(H_REV_EVENTS, 2);
      expect(m0.revenueFB).toBeCloseTo(H_REV_FB, 2);
      expect(m0.revenueOther).toBeCloseTo(H_REV_OTHER, 2);
    });

    it("total revenue ≈ $28,723.68", () => {
      expect(m0.revenueTotal).toBeCloseTo(H_REV_TOTAL, 2);
    });
  });

  // ─── Debt Service (Month 1) ─────────────────────────────────────────────
  describe("Month 1 Debt Service", () => {
    const m0 = propFinancials[0];
    const h0 = handMonth(0);

    it("loan amount = $1,275,000 (85% of $1.5M)", () => {
      // First month interest = balance × monthly rate = 1,275,000 × 0.0075 = 9,562.50
      expect(m0.interestExpense).toBeCloseTo(1_275_000 * 0.0075, 2);
      expect(m0.interestExpense).toBeCloseTo(h0.interest, 2);
    });

    it("PMT is constant every month", () => {
      expect(m0.debtPayment).toBeCloseTo(H_PMT, 2);
    });

    it("principal = PMT - interest", () => {
      expect(m0.principalPayment).toBeCloseTo(h0.principal, 2);
    });

    it("outstanding balance after month 1", () => {
      expect(m0.debtOutstanding).toBeCloseTo(h0.debtOutstanding, 0);
    });
  });

  // ─── NOI Calculation ────────────────────────────────────────────────────
  describe("NOI and USALI Waterfall", () => {
    const m0 = propFinancials[0];

    it("GOP = revenue - operating expenses", () => {
      expect(m0.gop).toBeCloseTo(H_GOP, 2);
    });

    it("management fees: base + incentive", () => {
      expect(m0.feeBase).toBeCloseTo(H_FEE_BASE, 2);
      expect(m0.feeIncentive).toBeCloseTo(H_FEE_INCENTIVE, 2);
    });

    it("NOI = AGOP - taxes", () => {
      expect(m0.agop).toBeCloseTo(H_AGOP, 2);
      expect(m0.noi).toBeCloseTo(H_NOI, 2);
    });

    it("ANOI = NOI - FF&E", () => {
      expect(m0.anoi).toBeCloseTo(H_ANOI, 2);
    });
  });

  // ─── Depreciation ───────────────────────────────────────────────────────
  describe("Depreciation", () => {
    it("monthly depreciation = $1,125,000 / 39 / 12", () => {
      expect(propFinancials[0].depreciationExpense).toBeCloseTo(H_MONTHLY_DEPR, 2);
    });

    it("depreciation is constant every month", () => {
      for (let i = 0; i < 60; i++) {
        expect(propFinancials[i].depreciationExpense).toBeCloseTo(H_MONTHLY_DEPR, 2);
      }
    });
  });

  // ─── Income Tax ─────────────────────────────────────────────────────────
  describe("Income Tax", () => {
    const h0 = handMonth(0);

    it("taxable income = ANOI - interest - depreciation", () => {
      expect(h0.taxableIncome).toBeCloseTo(H_ANOI - h0.interest - H_MONTHLY_DEPR, 2);
    });

    it("if taxable income is negative, tax = $0", () => {
      // With high leverage + high interest, taxable income may be negative
      if (h0.taxableIncome <= 0) {
        expect(propFinancials[0].incomeTax).toBe(0);
      } else {
        expect(propFinancials[0].incomeTax).toBeCloseTo(h0.taxableIncome * 0.25, 2);
      }
    });

    it("income tax matches hand calculation for month 1", () => {
      expect(propFinancials[0].incomeTax).toBeCloseTo(h0.incomeTax, 2);
    });
  });

  // ─── Monthly Cash Flow ──────────────────────────────────────────────────
  describe("Monthly Cash Flow", () => {
    it("cash flow = ANOI - PMT - incomeTax", () => {
      for (let i = 0; i < 60; i++) {
        const h = handMonth(i);
        expect(propFinancials[i].cashFlow).toBeCloseTo(h.cashFlow, 2);
      }
    });

    it("ending cash starts with operating reserve ($10,000)", () => {
      // Month 0: endingCash = operatingReserve + cashFlow(month 0)
      const h0 = handMonth(0);
      expect(propFinancials[0].endingCash).toBeCloseTo(10_000 + h0.cashFlow, 2);
    });

    it("ending cash is cumulative sum (reserve + sum of monthly cash flows)", () => {
      let cumCash = 10_000; // operating reserve seeded at acquisition month
      for (let i = 0; i < 60; i++) {
        cumCash += propFinancials[i].cashFlow;
        expect(propFinancials[i].endingCash).toBeCloseTo(cumCash, 2);
      }
    });
  });

  // ─── Year 5 Exit: THE UNDERWATER TEST ───────────────────────────────────
  describe("Year 5 Exit — Underwater (Negative Equity)", () => {
    it("annual NOI = monthly NOI × 12", () => {
      expect(H_ANNUAL_NOI).toBeCloseTo(H_NOI * 12, 2);
    });

    it("gross sale value = annual NOI / 12% cap rate", () => {
      expect(H_GROSS_VALUE).toBeCloseTo(H_ANNUAL_NOI / 0.12, 2);
    });

    it("commission = 5% of gross value", () => {
      expect(H_COMMISSION).toBeCloseTo(H_GROSS_VALUE * 0.05, 2);
    });

    it("debt outstanding after 60 months is still very high (~$1.22M+)", () => {
      // 30-year loan barely pays down in 5 years
      expect(H_DEBT_AT_EXIT).toBeGreaterThan(1_200_000);
    });

    it("exit value is NEGATIVE (underwater)", () => {
      // grossValue - commission - debtOutstanding < 0
      expect(H_EXIT_VALUE).toBeLessThan(0);
    });

    it("engine exit value matches hand calculation", () => {
      // The cashFlowAggregator computes exit in the last year
      const lastYearCF = yearlyCF[4]; // Year 5 (index 4)
      expect(lastYearCF.exitValue).toBeCloseTo(H_EXIT_VALUE, 0);
    });
  });

  // ─── Equity Multiple < 1.0 ──────────────────────────────────────────────
  describe("Equity Multiple", () => {
    it("equity multiple < 1.0 (investor loses money)", () => {
      // Total cash returned = sum of ATCF for 5 years + exit value
      // Equity invested = purchasePrice - loan = 225,000
      const totalATCF = yearlyCF.reduce((sum, y) => sum + y.atcf, 0);
      const totalReturn = totalATCF + yearlyCF[4].exitValue;
      const equityMultiple = (totalReturn + H_EQUITY) / H_EQUITY;
      // With underwater exit, total return is deeply negative
      expect(equityMultiple).toBeLessThan(1.0);
    });
  });

  // ─── Financial Identities ──────────────────────────────────────────────
  describe("Financial Identities", () => {
    it("A = L + E every month (balance sheet identity, within $1)", () => {
      const initialEquity = H_TOTAL_PROP_VALUE - H_LOAN; // 225,000
      let cumNI = 0;
      for (let i = 0; i < 60; i++) {
        const m = propFinancials[i];
        cumNI += m.netIncome;
        const totalAssets = m.endingCash + m.propertyValue;
        const totalLiabilities = m.debtOutstanding;
        // Equity includes operating reserve as part of initial equity contribution
        const derivedEquity = initialEquity + 10_000 + cumNI;
        const gap = Math.abs(totalAssets - totalLiabilities - derivedEquity);
        expect(gap).toBeLessThan(1.0);
      }
    });

    it("OCF = NI + Depreciation every month (ASC 230)", () => {
      for (let i = 0; i < 60; i++) {
        const m = propFinancials[i];
        expect(m.operatingCashFlow).toBeCloseTo(m.netIncome + m.depreciationExpense, 2);
      }
    });

    it("Financing CF = -Principal every month", () => {
      for (let i = 0; i < 60; i++) {
        const m = propFinancials[i];
        expect(m.financingCashFlow).toBeCloseTo(-m.principalPayment, 2);
      }
    });

    it("Cash flow = OCF + FCF (operating + financing)", () => {
      for (let i = 0; i < 60; i++) {
        const m = propFinancials[i];
        expect(m.cashFlow).toBeCloseTo(m.operatingCashFlow + m.financingCashFlow, 2);
      }
    });
  });

  // ─── No NaN or Infinity ─────────────────────────────────────────────────
  describe("Data Integrity — No NaN or Infinity", () => {
    it("no NaN values in any month", () => {
      for (let i = 0; i < 60; i++) {
        const m = propFinancials[i];
        expect(Number.isNaN(m.revenueTotal)).toBe(false);
        expect(Number.isNaN(m.noi)).toBe(false);
        expect(Number.isNaN(m.anoi)).toBe(false);
        expect(Number.isNaN(m.netIncome)).toBe(false);
        expect(Number.isNaN(m.cashFlow)).toBe(false);
        expect(Number.isNaN(m.endingCash)).toBe(false);
        expect(Number.isNaN(m.debtOutstanding)).toBe(false);
        expect(Number.isNaN(m.interestExpense)).toBe(false);
        expect(Number.isNaN(m.principalPayment)).toBe(false);
        expect(Number.isNaN(m.incomeTax)).toBe(false);
        expect(Number.isNaN(m.depreciationExpense)).toBe(false);
        expect(Number.isNaN(m.propertyValue)).toBe(false);
      }
    });

    it("no Infinity values in any month", () => {
      for (let i = 0; i < 60; i++) {
        const m = propFinancials[i];
        expect(Number.isFinite(m.revenueTotal)).toBe(true);
        expect(Number.isFinite(m.noi)).toBe(true);
        expect(Number.isFinite(m.netIncome)).toBe(true);
        expect(Number.isFinite(m.cashFlow)).toBe(true);
        expect(Number.isFinite(m.endingCash)).toBe(true);
        expect(Number.isFinite(m.debtOutstanding)).toBe(true);
      }
    });

    it("ending cash is never NaN in any month", () => {
      for (let i = 0; i < 60; i++) {
        expect(Number.isNaN(propFinancials[i].endingCash)).toBe(false);
      }
    });
  });

  // ─── Monthly Invariants (0% growth) ────────────────────────────────────
  describe("Monthly Invariants (0% growth, flat occupancy)", () => {
    it("revenue is identical every month", () => {
      for (let i = 0; i < 60; i++) {
        expect(propFinancials[i].revenueTotal).toBeCloseTo(H_REV_TOTAL, 2);
      }
    });

    it("NOI and ANOI are identical every month", () => {
      for (let i = 0; i < 60; i++) {
        expect(propFinancials[i].noi).toBeCloseTo(H_NOI, 2);
        expect(propFinancials[i].anoi).toBeCloseTo(H_ANOI, 2);
      }
    });

    it("debt outstanding decreases monotonically", () => {
      for (let i = 1; i < 60; i++) {
        expect(propFinancials[i].debtOutstanding).toBeLessThan(propFinancials[i - 1].debtOutstanding);
      }
    });
  });
});
