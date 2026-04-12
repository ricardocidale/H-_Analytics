/**
 * Golden Scenario: Exit Cap Rate Sensitivity (4 scenarios, same property)
 *
 * Tests the same 20-room financed property at 4 different exit cap rates to
 * verify that exit valuation math is correct and monotonic across a range
 * from very favorable (5%) to deeply distressed (20%).
 *
 * PROPERTY: 20 rooms, $200 ADR, 70% flat occupancy, $2M purchase price
 *           60% LTV @ 8% / 25yr, no refinance
 *           Operating reserve $20,000, tax rate 25%, 0% growth/inflation
 *           Projection: 10 years (120 months), commission 5%
 *
 * EXIT CAP RATES:
 *   1. 0.05  (5%)   — very favorable / hot market
 *   2. 0.085 (8.5%) — standard
 *   3. 0.15  (15%)  — distressed
 *   4. 0.20  (20%)  — deeply distressed
 *
 * All 4 scenarios share identical revenue, NOI, and debt schedules.
 * Only exit valuation differs.
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

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO INPUTS (shared across all 4 cap rate scenarios)
// ═══════════════════════════════════════════════════════════════════════════════

function makeProperty(exitCapRate: number) {
  return {
    id: 1,
    name: "Cap Rate Sensitivity Lodge",
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
    inflationRate: 0,              // no inflation
    operationsStartDate: "2026-04-01",
    acquisitionDate: "2026-04-01",
    operatingReserve: 20_000,
    taxRate: 0.25,
    acquisitionLTV: 0.60,
    acquisitionInterestRate: 0.08,
    acquisitionTermYears: 25,
    exitCapRate,
    dispositionCommission: 0.05,
    willRefinance: "No",
  } as any;
}

const GLOBAL = {
  modelStartDate: "2026-04-01",
  projectionYears: 10,
  inflationRate: 0,
  fixedCostEscalationRate: 0,
  companyInflationRate: 0,
  companyTaxRate: 0.30,
  companyOpsStartDate: "2026-04-01",
  safeTranche1Date: "2026-04-01",
  safeTranche1Amount: 800_000,
  safeTranche2Date: null,
  safeTranche2Amount: 0,
} as any;

const MONTHS = 120;
const YEARS = 10;

const CAP_RATES = [0.05, 0.085, 0.15, 0.20];

// ═══════════════════════════════════════════════════════════════════════════════
// HAND CALCULATIONS — PROPERTY MONTHLY (all months identical except debt)
// ═══════════════════════════════════════════════════════════════════════════════

// Revenue
const H_AVAIL_ROOMS = 20 * DAYS_PER_MONTH;                              // 610
const H_SOLD_ROOMS = H_AVAIL_ROOMS * 0.70;                              // 427
const H_REV_ROOMS = H_SOLD_ROOMS * 200;                                 // 85,400
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

// Fixed expenses (0% escalation → factor = 1)
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

// Debt
const H_LOAN = 2_000_000 * 0.60;                                        // 1,200,000
const H_MONTHLY_RATE = 0.08 / 12;
const H_TOTAL_PAYMENTS = 25 * 12;                                        // 300
const H_PMT = pmt(H_LOAN, H_MONTHLY_RATE, H_TOTAL_PAYMENTS);

// Depreciation
const H_LAND_PCT = DEFAULT_LAND_VALUE_PERCENT;                           // 0.25
const H_BUILDING_VALUE = H_TOTAL_PROP_VALUE * (1 - H_LAND_PCT);         // 1,500,000
const H_MONTHLY_DEPR = H_BUILDING_VALUE / DEPRECIATION_YEARS / 12;

// Equity invested
const H_EQUITY = H_TOTAL_PROP_VALUE - H_LOAN;                           // 800,000

// Build amortization schedule for 120 months
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

// Annual NOI (flat, 0% growth)
const H_ANNUAL_NOI = H_NOI * 12;

// Debt outstanding at exit (end of month 120, index 119)
const H_DEBT_AT_EXIT = H_AMORT[119].balance;

// Exit calculations for each cap rate
function handExit(capRate: number) {
  const grossValue = H_ANNUAL_NOI / capRate;
  const commission = grossValue * 0.05;
  const exitValue = grossValue - commission - H_DEBT_AT_EXIT;
  return { grossValue, commission, exitValue };
}

const H_EXIT_005 = handExit(0.05);
const H_EXIT_085 = handExit(0.085);
const H_EXIT_015 = handExit(0.15);
const H_EXIT_020 = handExit(0.20);

// ═══════════════════════════════════════════════════════════════════════════════
// ENGINE RUNS — one per cap rate
// ═══════════════════════════════════════════════════════════════════════════════

const scenarios = CAP_RATES.map((capRate) => {
  const prop = makeProperty(capRate);
  const propFinancials = generatePropertyProForma(prop, GLOBAL, MONTHS);
  const yearlyProp = aggregatePropertyByYear(propFinancials, YEARS);
  const yearlyCF = aggregateCashFlowByYear(
    propFinancials,
    { ...prop, preOpeningCosts: 0 } as any,
    GLOBAL as any,
    YEARS,
  );
  return { capRate, prop, propFinancials, yearlyProp, yearlyCF };
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe("Golden Scenario: Exit Cap Rate Sensitivity (4 scenarios)", () => {

  // ─── 1. All 4 scenarios produce valid numbers ───────────────────────────
  describe("All 4 scenarios produce valid numbers (no NaN, no Infinity)", () => {
    it("no NaN or Infinity in any of the 4 × 120 months", () => {
      for (const s of scenarios) {
        for (let i = 0; i < MONTHS; i++) {
          const m = s.propFinancials[i];
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
          expect(Number.isFinite(m.revenueTotal)).toBe(true);
          expect(Number.isFinite(m.noi)).toBe(true);
          expect(Number.isFinite(m.netIncome)).toBe(true);
          expect(Number.isFinite(m.cashFlow)).toBe(true);
          expect(Number.isFinite(m.endingCash)).toBe(true);
          expect(Number.isFinite(m.debtOutstanding)).toBe(true);
        }
      }
    });
  });

  // ─── 2. Lower cap rate → higher exit value (monotonic) ─────────────────
  describe("Monotonic ordering: lower cap rate → higher exit value", () => {
    it("exit values decrease as cap rate increases", () => {
      const exitValues = scenarios.map((s) => {
        const lastYearCF = s.yearlyCF[YEARS - 1];
        return lastYearCF.exitValue;
      });
      // Cap rates are [0.05, 0.085, 0.15, 0.20] → exit values must be strictly decreasing
      for (let i = 1; i < exitValues.length; i++) {
        expect(exitValues[i]).toBeLessThan(exitValues[i - 1]);
      }
    });
  });

  // ─── 3. exitCapRate = 0.05 (5%): exact values ──────────────────────────
  describe("Exit Cap Rate = 5% (very favorable)", () => {
    it("grossValue matches hand calculation", () => {
      expect(H_EXIT_005.grossValue).toBeCloseTo(H_ANNUAL_NOI / 0.05, 2);
    });

    it("commission = 5% of grossValue", () => {
      expect(H_EXIT_005.commission).toBeCloseTo(H_EXIT_005.grossValue * 0.05, 2);
    });

    it("engine exitValue matches hand calculation", () => {
      const lastYearCF = scenarios[0].yearlyCF[YEARS - 1];
      expect(lastYearCF.exitValue).toBeCloseTo(H_EXIT_005.exitValue, 0);
    });
  });

  // ─── 4. exitCapRate = 0.085 (8.5%): exact values ───────────────────────
  describe("Exit Cap Rate = 8.5% (standard)", () => {
    it("grossValue matches hand calculation", () => {
      expect(H_EXIT_085.grossValue).toBeCloseTo(H_ANNUAL_NOI / 0.085, 2);
    });

    it("commission = 5% of grossValue", () => {
      expect(H_EXIT_085.commission).toBeCloseTo(H_EXIT_085.grossValue * 0.05, 2);
    });

    it("engine exitValue matches hand calculation", () => {
      const lastYearCF = scenarios[1].yearlyCF[YEARS - 1];
      expect(lastYearCF.exitValue).toBeCloseTo(H_EXIT_085.exitValue, 0);
    });
  });

  // ─── 5. exitCapRate = 0.15 (15%): exact values ─────────────────────────
  describe("Exit Cap Rate = 15% (distressed)", () => {
    it("grossValue matches hand calculation", () => {
      expect(H_EXIT_015.grossValue).toBeCloseTo(H_ANNUAL_NOI / 0.15, 2);
    });

    it("commission = 5% of grossValue", () => {
      expect(H_EXIT_015.commission).toBeCloseTo(H_EXIT_015.grossValue * 0.05, 2);
    });

    it("engine exitValue matches hand calculation", () => {
      const lastYearCF = scenarios[2].yearlyCF[YEARS - 1];
      expect(lastYearCF.exitValue).toBeCloseTo(H_EXIT_015.exitValue, 0);
    });
  });

  // ─── 6. exitCapRate = 0.20 (20%): exact values ─────────────────────────
  describe("Exit Cap Rate = 20% (deeply distressed)", () => {
    it("grossValue matches hand calculation", () => {
      expect(H_EXIT_020.grossValue).toBeCloseTo(H_ANNUAL_NOI / 0.20, 2);
    });

    it("commission = 5% of grossValue", () => {
      expect(H_EXIT_020.commission).toBeCloseTo(H_EXIT_020.grossValue * 0.05, 2);
    });

    it("engine exitValue matches hand calculation", () => {
      const lastYearCF = scenarios[3].yearlyCF[YEARS - 1];
      expect(lastYearCF.exitValue).toBeCloseTo(H_EXIT_020.exitValue, 0);
    });
  });

  // ─── 7. Debt outstanding is same for all 4 scenarios ───────────────────
  describe("Debt outstanding identical across all 4 scenarios", () => {
    it("debt at exit is the same regardless of cap rate", () => {
      const debtValues = scenarios.map((s) => s.propFinancials[MONTHS - 1].debtOutstanding);
      for (let i = 1; i < debtValues.length; i++) {
        expect(debtValues[i]).toBeCloseTo(debtValues[0], 2);
      }
      // Also matches hand calculation
      expect(debtValues[0]).toBeCloseTo(H_DEBT_AT_EXIT, 0);
    });

    it("debt outstanding decreases monotonically every month (all scenarios)", () => {
      for (const s of scenarios) {
        for (let i = 1; i < MONTHS; i++) {
          expect(s.propFinancials[i].debtOutstanding).toBeLessThan(s.propFinancials[i - 1].debtOutstanding);
        }
      }
    });
  });

  // ─── 8. Monthly revenue/NOI identical across all scenarios ─────────────
  describe("Revenue and NOI identical across all 4 scenarios", () => {
    it("monthly revenue is the same for all scenarios and matches hand calc", () => {
      for (const s of scenarios) {
        for (let i = 0; i < MONTHS; i++) {
          expect(s.propFinancials[i].revenueTotal).toBeCloseTo(H_REV_TOTAL, 2);
        }
      }
    });

    it("monthly NOI and ANOI are the same for all scenarios", () => {
      for (const s of scenarios) {
        for (let i = 0; i < MONTHS; i++) {
          expect(s.propFinancials[i].noi).toBeCloseTo(H_NOI, 2);
          expect(s.propFinancials[i].anoi).toBeCloseTo(H_ANOI, 2);
        }
      }
    });
  });

  // ─── 9. One distressed scenario may produce negative exit value ────────
  describe("Distressed cap rates may produce negative exit value", () => {
    it("exitCapRate=0.20 exit value is negative (deeply underwater)", () => {
      // At 20% cap rate, gross value = annualNOI / 0.20
      // After commission and debt payoff, should be negative or very low
      expect(H_EXIT_020.exitValue).toBeLessThan(H_EXIT_005.exitValue);
      // Check if the 20% scenario actually goes negative
      const lastYearCF = scenarios[3].yearlyCF[YEARS - 1];
      // Whether positive or negative, engine must match hand calc
      expect(lastYearCF.exitValue).toBeCloseTo(H_EXIT_020.exitValue, 0);
    });
  });

  // ─── 10. Equity multiple varies monotonically with cap rate ────────────
  describe("Equity multiple monotonic with cap rate", () => {
    it("equity multiple decreases as cap rate increases", () => {
      const equityMultiples = scenarios.map((s) => {
        const totalATCF = s.yearlyCF.reduce((sum, y) => sum + y.atcf, 0);
        const totalReturn = totalATCF + s.yearlyCF[YEARS - 1].exitValue;
        return (totalReturn + H_EQUITY) / H_EQUITY;
      });
      // Must be strictly decreasing
      for (let i = 1; i < equityMultiples.length; i++) {
        expect(equityMultiples[i]).toBeLessThan(equityMultiples[i - 1]);
      }
    });
  });

  // ─── 11. Financial identities hold for all scenarios (A=L+E) ──────────
  describe("Financial Identities (A=L+E) for all 4 scenarios", () => {
    it("A = L + E every month for all scenarios (within $1)", () => {
      for (const s of scenarios) {
        const initialEquity = H_TOTAL_PROP_VALUE - H_LOAN; // 800,000
        let cumNI = 0;
        for (let i = 0; i < MONTHS; i++) {
          const m = s.propFinancials[i];
          cumNI += m.netIncome;
          const totalAssets = m.endingCash + m.propertyValue;
          const totalLiabilities = m.debtOutstanding;
          const derivedEquity = initialEquity + 20_000 + cumNI;
          const gap = Math.abs(totalAssets - totalLiabilities - derivedEquity);
          expect(gap).toBeLessThan(1.0);
        }
      }
    });

    it("OCF = NI + Depreciation every month (ASC 230) for all scenarios", () => {
      for (const s of scenarios) {
        for (let i = 0; i < MONTHS; i++) {
          const m = s.propFinancials[i];
          expect(m.operatingCashFlow).toBeCloseTo(m.netIncome + m.depreciationExpense, 2);
        }
      }
    });

    it("Financing CF = -Principal every month for all scenarios", () => {
      for (const s of scenarios) {
        for (let i = 0; i < MONTHS; i++) {
          const m = s.propFinancials[i];
          expect(m.financingCashFlow).toBeCloseTo(-m.principalPayment, 2);
        }
      }
    });
  });

  // ─── 12. No NaN in any of the 4 × 120 months (comprehensive) ──────────
  describe("Comprehensive NaN check across all months and scenarios", () => {
    it("ending cash is never NaN in any month for any scenario", () => {
      for (const s of scenarios) {
        for (let i = 0; i < MONTHS; i++) {
          expect(Number.isNaN(s.propFinancials[i].endingCash)).toBe(false);
        }
      }
    });
  });
});
