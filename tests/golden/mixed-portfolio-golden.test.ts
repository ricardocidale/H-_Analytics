/**
 * Golden Scenario: Mixed Portfolio — 1 Active + 1 Inactive Property
 *
 * Tests that the engine correctly handles a portfolio where one property
 * generates revenue and one sits idle (0% occupancy). Verifies that fees,
 * staffing tiers, and consolidated figures only reflect the active property.
 *
 * PROPERTY A: "Sunrise Inn" — 15 rooms, $180 ADR, 70% occupancy, Cash $1.5M
 * PROPERTY B: "Idle Lodge" — 10 rooms, $150 ADR, 0% occupancy, Cash $800K
 *
 * Both: 0% growth/inflation, taxRate 25%, month 0 start, projection = 10 years.
 *
 * COMPANY: ops start month 0, SAFE $800K tranche 1.
 *          Staff $75K/yr, 2.5 FTE (tier 1: activePropertyCount=1 ≤ 3).
 *          Partner comp defaults, baseFee 8.5%, incentiveFee 12%.
 */
import { describe, it, expect } from "vitest";
import { generatePropertyProForma } from "../../client/src/lib/financial/property-engine";
import { generateCompanyProForma } from "../../client/src/lib/financial/company-engine";
import {
  DEFAULT_REV_SHARE_EVENTS, DEFAULT_REV_SHARE_FB, DEFAULT_REV_SHARE_OTHER,
  DEFAULT_CATERING_BOOST_PCT, DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE, DEFAULT_COST_RATE_ROOMS,
  DEFAULT_COST_RATE_FB, DEFAULT_COST_RATE_ADMIN, DEFAULT_COST_RATE_MARKETING,
  DEFAULT_COST_RATE_TAXES, DEFAULT_COST_RATE_IT, DEFAULT_COST_RATE_FFE, DEFAULT_COST_RATE_OTHER,
  DEFAULT_COST_RATE_PROPERTY_OPS, DEFAULT_COST_RATE_UTILITIES,
  DEFAULT_EVENT_EXPENSE_RATE, DEFAULT_OTHER_EXPENSE_RATE, DEFAULT_UTILITIES_VARIABLE_SPLIT,
  DAYS_PER_MONTH, DEPRECIATION_YEARS, DEFAULT_LAND_VALUE_PERCENT,
  DEFAULT_COMPANY_TAX_RATE, DEFAULT_BUSINESS_INSURANCE_START, DEFAULT_COST_RATE_INSURANCE,
} from "../../shared/constants";
import type { PropertyInput, GlobalInput } from "../../engine/types";

// ═══════════════════════════════════════════════════════════════════
// PROPERTY DEFINITIONS
// ═══════════════════════════════════════════════════════════════════

const PROP_A: PropertyInput = {
  id: 1, name: "Sunrise Inn", type: "Cash",
  purchasePrice: 1_500_000, buildingImprovements: 0, preOpeningCosts: 0,
  roomCount: 15, startAdr: 180, startOccupancy: 0.70, maxOccupancy: 0.70,
  occupancyGrowthStep: 0, occupancyRampMonths: 6,
  adrGrowthRate: 0, inflationRate: 0,
  operationsStartDate: "2026-04-01", acquisitionDate: "2026-04-01",
  operatingReserve: 20_000, taxRate: 0.25,
  exitCapRate: 0.085, dispositionCommission: 0.05, willRefinance: "No",
} as PropertyInput;

const PROP_B: PropertyInput = {
  id: 2, name: "Idle Lodge", type: "Cash",
  purchasePrice: 800_000, buildingImprovements: 0, preOpeningCosts: 0,
  roomCount: 10, startAdr: 150, startOccupancy: 0, maxOccupancy: 0,
  occupancyGrowthStep: 0, occupancyRampMonths: 6,
  adrGrowthRate: 0, inflationRate: 0,
  operationsStartDate: "2026-04-01", acquisitionDate: "2026-04-01",
  operatingReserve: 10_000, taxRate: 0.25,
  exitCapRate: 0.085, dispositionCommission: 0.05, willRefinance: "No",
} as PropertyInput;

const GLOBAL: GlobalInput = {
  modelStartDate: "2026-04-01", projectionYears: 10, inflationRate: 0,
  fixedCostEscalationRate: 0, companyInflationRate: 0,
  companyTaxRate: DEFAULT_COMPANY_TAX_RATE,
  companyOpsStartDate: "2026-04-01",
  capitalRaise1Date: "2026-04-01", capitalRaise1Amount: 800_000,
  capitalRaise2Date: null, capitalRaise2Amount: 0,
  baseManagementFeeRate: 0.085,
  incentiveManagementFeeRate: 0.12,
  staffSalary: 75_000, staffTier1MaxProperties: 3, staffTier1Fte: 2.5,
  partnerCompYear1: 540_000, partnerCompYear2: 540_000,
  partnerCompYear3: 540_000, partnerCompYear4: 540_000, partnerCompYear5: 540_000,
  partnerCompYear6: 540_000, partnerCompYear7: 540_000, partnerCompYear8: 540_000,
  partnerCompYear9: 540_000, partnerCompYear10: 540_000,
  officeLeaseStart: 36_000, professionalServicesStart: 24_000,
  travelCostPerClient: 12_000, itLicensePerClient: 3_000,
  marketingRate: 0.05, miscOpsRate: 0.03,
} as GlobalInput;

const MONTHS = 120; // 10 years

// ═══════════════════════════════════════════════════════════════════
// HAND CALCULATIONS — PROPERTY A (Active: 15 rooms, $180 ADR, 70%)
// ═══════════════════════════════════════════════════════════════════

const H_A_AVAIL = 15 * DAYS_PER_MONTH;  // 457.5
const H_A_SOLD = H_A_AVAIL * 0.70;  // 320.25
const H_A_REV_ROOMS = H_A_SOLD * 180;  // 57,645
// Revenue shares are % of TOTAL revenue; room share = 1 - ancillary
const H_A_ANCILLARY = DEFAULT_REV_SHARE_EVENTS + DEFAULT_REV_SHARE_FB + DEFAULT_REV_SHARE_OTHER;
const H_A_ROOM_SHARE = Math.max(0.05, 1 - H_A_ANCILLARY);
const H_A_REV_TOTAL = H_A_REV_ROOMS / H_A_ROOM_SHARE;
const H_A_REV_EVENTS = H_A_REV_TOTAL * DEFAULT_REV_SHARE_EVENTS;
const H_A_REV_FB = H_A_REV_TOTAL * DEFAULT_REV_SHARE_FB;
const H_A_REV_OTHER = H_A_REV_TOTAL * DEFAULT_REV_SHARE_OTHER;

// Expenses (revenue-driven)
const H_A_EXP_ROOMS = H_A_REV_ROOMS * DEFAULT_COST_RATE_ROOMS;
const H_A_EXP_FB = H_A_REV_FB * DEFAULT_COST_RATE_FB;
const H_A_EXP_EVENTS = H_A_REV_EVENTS * DEFAULT_EVENT_EXPENSE_RATE;
const H_A_EXP_OTHER = H_A_REV_OTHER * DEFAULT_OTHER_EXPENSE_RATE;
const H_A_EXP_MARKETING = H_A_REV_TOTAL * DEFAULT_COST_RATE_MARKETING;
const H_A_EXP_UTIL_VAR = H_A_REV_TOTAL * (DEFAULT_COST_RATE_UTILITIES * DEFAULT_UTILITIES_VARIABLE_SPLIT);
const H_A_EXP_FFE = H_A_REV_TOTAL * DEFAULT_COST_RATE_FFE;
const H_A_EXP_ADMIN = H_A_REV_TOTAL * DEFAULT_COST_RATE_ADMIN;
const H_A_EXP_PROP_OPS = H_A_REV_TOTAL * DEFAULT_COST_RATE_PROPERTY_OPS;
const H_A_EXP_IT = H_A_REV_TOTAL * DEFAULT_COST_RATE_IT;
// Fixed expenses (purchase-price-driven)
const H_A_EXP_TAXES = (1_500_000 / 12) * DEFAULT_COST_RATE_TAXES;
const H_A_EXP_UTIL_FIXED = H_A_REV_TOTAL * (DEFAULT_COST_RATE_UTILITIES * (1 - DEFAULT_UTILITIES_VARIABLE_SPLIT));
const H_A_EXP_OTHER_COSTS = H_A_REV_TOTAL * DEFAULT_COST_RATE_OTHER;
const H_A_EXP_INSURANCE = (1_500_000 / 12) * DEFAULT_COST_RATE_INSURANCE;

const H_A_TOTAL_OP_EXP = H_A_EXP_ROOMS + H_A_EXP_FB + H_A_EXP_EVENTS + H_A_EXP_OTHER +
  H_A_EXP_MARKETING + H_A_EXP_PROP_OPS + H_A_EXP_UTIL_VAR +
  H_A_EXP_ADMIN + H_A_EXP_IT + H_A_EXP_UTIL_FIXED + H_A_EXP_INSURANCE + H_A_EXP_OTHER_COSTS;

const H_A_GOP = H_A_REV_TOTAL - H_A_TOTAL_OP_EXP;
const H_A_FEE_BASE = H_A_REV_TOTAL * 0.085;
const H_A_FEE_INCENTIVE = Math.max(0, H_A_GOP * 0.12);
const H_A_AGOP = H_A_GOP - H_A_FEE_BASE - H_A_FEE_INCENTIVE;
const H_A_NOI = H_A_AGOP - H_A_EXP_TAXES;
const H_A_ANOI = H_A_NOI - H_A_EXP_FFE;

// Income statement (Cash property — no debt)
const H_A_BUILDING = 1_500_000 * (1 - DEFAULT_LAND_VALUE_PERCENT);
const H_A_DEPR = H_A_BUILDING / DEPRECIATION_YEARS / 12;
const H_A_TAXABLE = H_A_ANOI - 0 - H_A_DEPR;
const H_A_TAX = H_A_TAXABLE > 0 ? H_A_TAXABLE * 0.25 : 0;
const H_A_NET_INCOME = H_A_ANOI - 0 - H_A_DEPR - H_A_TAX;
const H_A_CASH_FLOW = H_A_ANOI - 0 - H_A_TAX;

// ═══════════════════════════════════════════════════════════════════
// HAND CALCULATIONS — PROPERTY B (Inactive: 0% occupancy)
// ═══════════════════════════════════════════════════════════════════

// Zero occupancy → zero revenue → zero revenue-driven expenses
// Only purchase-price-driven expenses remain: property taxes + insurance
const H_B_REV_TOTAL = 0;
const H_B_EXP_TAXES = (800_000 / 12) * DEFAULT_COST_RATE_TAXES;
const H_B_EXP_INSURANCE = (800_000 / 12) * DEFAULT_COST_RATE_INSURANCE;
// GOP = 0 - insurance (property-value-based expense even at 0% occupancy)
const H_B_GOP = 0 - H_B_EXP_INSURANCE;
const H_B_FEE_BASE = 0;  // 8.5% of $0
const H_B_FEE_INCENTIVE = 0;  // max(0, negative × 12%) = 0
const H_B_NOI = H_B_GOP - H_B_EXP_TAXES;  // NOI = AGOP - Taxes
const H_B_FFE = 0;  // FFE is revenue-based
const H_B_ANOI = H_B_NOI - H_B_FFE;

const H_B_BUILDING = 800_000 * (1 - DEFAULT_LAND_VALUE_PERCENT);
const H_B_DEPR = H_B_BUILDING / DEPRECIATION_YEARS / 12;
// Taxable income is negative → no tax
const H_B_TAXABLE = H_B_ANOI - H_B_DEPR;
const H_B_TAX = H_B_TAXABLE > 0 ? H_B_TAXABLE * 0.25 : 0;
const H_B_NET_INCOME = H_B_ANOI - H_B_DEPR - H_B_TAX;
const H_B_CASH_FLOW = H_B_ANOI - H_B_TAX;  // negative (taxes drain cash)

// ═══════════════════════════════════════════════════════════════════
// HAND CALCULATIONS — COMPANY (only 1 active property)
// ═══════════════════════════════════════════════════════════════════

// Fee revenue = only Property A's fees (B pays $0)
const H_CO_BASE_FEE = H_A_FEE_BASE;  // + 0
const H_CO_INCENTIVE_FEE = H_A_FEE_INCENTIVE;  // + 0
const H_CO_TOTAL_REV = H_CO_BASE_FEE + H_CO_INCENTIVE_FEE;

// Company expenses — activePropertyCount = 1 (only Sunrise Inn)
const H_CO_PARTNER_COMP = 540_000 / 12;  // 45,000
const H_CO_STAFF_COMP = (2.5 * 75_000) / 12;  // 15,625 (tier 1: 1 ≤ 3)
const H_CO_OFFICE = 36_000 / 12;  // 3,000
const H_CO_PROF_SERVICES = 24_000 / 12;  // 2,000
const H_CO_TECH = 18_000 / 12;  // 1,500
// Variable costs scale with activePropertyCount = 1 (not 2!)
const H_CO_TRAVEL = (1 * 12_000) / 12;  // 1,000 (1 active property)
const H_CO_IT_LICENSE = (1 * 3_000) / 12;  // 250 (1 active property)
const H_CO_MARKETING = H_CO_TOTAL_REV * 0.05;
const H_CO_MISC = H_CO_TOTAL_REV * 0.03;
const H_CO_INSURANCE = DEFAULT_BUSINESS_INSURANCE_START / 12;

const H_CO_TOTAL_EXP = H_CO_PARTNER_COMP + H_CO_STAFF_COMP + H_CO_OFFICE +
  H_CO_PROF_SERVICES + H_CO_TECH + H_CO_INSURANCE +
  H_CO_TRAVEL + H_CO_IT_LICENSE + H_CO_MARKETING + H_CO_MISC;

const H_CO_PRE_TAX = H_CO_TOTAL_REV - H_CO_TOTAL_EXP;
const H_CO_TAX = H_CO_PRE_TAX > 0 ? H_CO_PRE_TAX * DEFAULT_COMPANY_TAX_RATE : 0;
const H_CO_NET_INCOME = H_CO_PRE_TAX - H_CO_TAX;

// ═══════════════════════════════════════════════════════════════════
// PORTFOLIO AGGREGATION
// ═══════════════════════════════════════════════════════════════════

const H_PORT_REV_TOTAL = H_A_REV_TOTAL + H_B_REV_TOTAL;  // = A only
const H_PORT_NOI = H_A_NOI + H_B_NOI;

// ═══════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════

describe("Golden: Mixed Portfolio — 1 Active + 1 Inactive Property", () => {
  const propA = generatePropertyProForma(PROP_A, GLOBAL, MONTHS);
  const propB = generatePropertyProForma(PROP_B, GLOBAL, MONTHS);
  const comp = generateCompanyProForma([PROP_A, PROP_B], GLOBAL, MONTHS);

  // ─── 1. Property A revenue > 0 ─────────────────────────────────────
  it("1. Property A: revenue > 0 every month", () => {
    for (let i = 0; i < MONTHS; i++) {
      expect(propA[i].revenueTotal).toBeGreaterThan(0);
      expect(propA[i].revenueTotal).toBeCloseTo(H_A_REV_TOTAL, 2);
    }
  });

  // ─── 2. Property B revenue = $0 ────────────────────────────────────
  it("2. Property B: revenue = $0 every month", () => {
    for (let i = 0; i < MONTHS; i++) {
      expect(propB[i].revenueTotal).toBe(0);
      expect(propB[i].revenueRooms).toBe(0);
    }
  });

  // ─── 3. Property B management fees = $0 ────────────────────────────
  it("3. Property B: management fees = $0 (no revenue to charge on)", () => {
    for (let i = 0; i < MONTHS; i++) {
      expect(propB[i].feeBase).toBe(0);
      expect(propB[i].feeIncentive).toBe(0);
    }
  });

  // ─── 4. Property B taxes still accrue ─────────────────────
  it("4. Property B: property taxes still accrue (purchase-price-based)", () => {
    // Property taxes are embedded in NOI as fixed costs
    // With 0 revenue and 0 revenue-driven expenses, NOI = -(taxes)
    expect(propB[0].noi).toBeCloseTo(H_B_NOI, 2);
    expect(H_B_NOI).toBeLessThan(0);  // must be negative
  });

  // ─── 5. Company baseFeeRevenue = Property A's base fee only ────────
  it("5. Company baseFeeRevenue = Property A's base fee (B pays $0)", () => {
    expect(comp[0].baseFeeRevenue).toBeCloseTo(H_CO_BASE_FEE, 2);
    expect(comp[0].baseFeeRevenue).toBeCloseTo(H_A_FEE_BASE, 2);
  });

  // ─── 6. Company incentiveFeeRevenue = Property A's incentive fee ───
  it("6. Company incentiveFeeRevenue = Property A's incentive fee (B pays $0)", () => {
    expect(comp[0].incentiveFeeRevenue).toBeCloseTo(H_CO_INCENTIVE_FEE, 2);
    expect(comp[0].incentiveFeeRevenue).toBeCloseTo(H_A_FEE_INCENTIVE, 2);
  });

  // ─── 7. activePropertyCount = 1 (verified via travel/IT costs) ─────
  it("7. activePropertyCount = 1: travel/IT costs scale with 1 property (not 2)", () => {
    // Travel = 1 × $12K / 12 = $1,000/mo (not $2,000)
    expect(comp[0].travelCosts).toBeCloseTo(H_CO_TRAVEL, 2);
    expect(comp[0].travelCosts).toBeCloseTo(1_000, 2);
    // IT = 1 × $3K / 12 = $250/mo (not $500)
    expect(comp[0].itLicensing).toBeCloseTo(H_CO_IT_LICENSE, 2);
    expect(comp[0].itLicensing).toBeCloseTo(250, 2);
  });

  // ─── 8. Staffing tier = 1, FTE = 2.5 ──────────────────────────────
  it("8. Staffing tier = 1 (1 active ≤ 3), FTE = 2.5", () => {
    const expectedStaffComp = (2.5 * 75_000) / 12;  // $15,625
    expect(comp[0].staffCompensation).toBeCloseTo(expectedStaffComp, 2);
  });

  // ─── 9. Company staffing cost = $15,625/mo ────────────────────────
  it("9. Company staffing cost = $15,625/mo", () => {
    expect(comp[0].staffCompensation).toBeCloseTo(15_625, 2);
    // Stable every month (0% inflation)
    for (let i = 1; i < MONTHS; i++) {
      expect(comp[i].staffCompensation).toBeCloseTo(15_625, 2);
    }
  });

  // ─── 10. Consolidated revenue = Property A + 0 ─────────────────────
  it("10. Consolidated revenue = Property A revenue (B contributes $0)", () => {
    for (let i = 0; i < MONTHS; i++) {
      const portfolioRev = propA[i].revenueTotal + propB[i].revenueTotal;
      expect(portfolioRev).toBeCloseTo(H_A_REV_TOTAL, 2);
    }
  });

  // ─── 11. Intercompany elimination = A's fees only ──────────────────
  it("11. Intercompany elimination: only Property A's fees flow", () => {
    for (let i = 0; i < MONTHS; i++) {
      const totalPropFees = propA[i].feeBase + propA[i].feeIncentive +
                            propB[i].feeBase + propB[i].feeIncentive;
      // B's fees are $0, so total = A's fees only
      expect(totalPropFees).toBeCloseTo(H_A_FEE_BASE + H_A_FEE_INCENTIVE, 2);
    }
  });

  // ─── 12. Elimination nets to $0 ────────────────────────────────────
  it("12. Intercompany elimination nets to $0", () => {
    for (let i = 0; i < MONTHS; i++) {
      const propFeeExpense = propA[i].feeBase + propA[i].feeIncentive +
                             propB[i].feeBase + propB[i].feeIncentive;
      const compFeeRevenue = comp[i].totalRevenue;
      expect(Math.abs(propFeeExpense - compFeeRevenue)).toBeLessThan(0.01);
    }
  });

  // ─── 13. A=L+E for Property A ──────────────────────────────────────
  it("13. Property A: A = L + E within $1 for all months", () => {
    // Initial equity = purchase price + operating reserve (reserve is equity injection at acquisition)
    const initialEquity = 1_500_000 + 20_000;
    let cumNI = 0;
    for (let i = 0; i < MONTHS; i++) {
      cumNI += propA[i].netIncome;
      const assets = propA[i].endingCash + propA[i].propertyValue;
      const liabilities = propA[i].debtOutstanding;
      const equity = initialEquity + cumNI;
      expect(Math.abs(assets - liabilities - equity)).toBeLessThan(1);
    }
  });

  // ─── 14. A=L+E for Property B ──────────────────────────────────────
  it("14. Property B: A = L + E within $1 for all months", () => {
    // Initial equity = purchase price + operating reserve
    const initialEquity = 800_000 + 10_000;
    let cumNI = 0;
    for (let i = 0; i < MONTHS; i++) {
      cumNI += propB[i].netIncome;
      const assets = propB[i].endingCash + propB[i].propertyValue;
      const liabilities = propB[i].debtOutstanding;
      const equity = initialEquity + cumNI;
      expect(Math.abs(assets - liabilities - equity)).toBeLessThan(1);
    }
  });

  // ─── 15. Company BS identity ───────────────────────────────────────
  it("15. Company BS: A = L + E (Cash = SAFE_Notes + Retained_Earnings)", () => {
    let cumNI = 0;
    for (let i = 0; i < MONTHS; i++) {
      cumNI += comp[i].netIncome;
      const assets = comp[i].endingCash;
      const liabilities = 800_000;  // SAFE notes
      const equity = cumNI;
      expect(Math.abs(assets - liabilities - equity)).toBeLessThan(1);
    }
  });

  // ─── 16. No NaN values anywhere ────────────────────────────────────
  it("16. No NaN values in any property or company output", () => {
    const checkNoNaN = (obj: Record<string, any>, label: string, month: number) => {
      for (const [key, val] of Object.entries(obj)) {
        if (typeof val === "number") {
          expect(isNaN(val)).toBe(false);
        }
      }
    };
    for (let i = 0; i < MONTHS; i++) {
      checkNoNaN(propA[i], "PropA", i);
      checkNoNaN(propB[i], "PropB", i);
      checkNoNaN(comp[i], "Company", i);
    }
  });

  // ─── 17. Portfolio NOI = A's NOI + B's NOI ─────────────────────────
  it("17. Portfolio NOI = sum of A's NOI + B's NOI", () => {
    for (let i = 0; i < MONTHS; i++) {
      const portNOI = propA[i].noi + propB[i].noi;
      expect(portNOI).toBeCloseTo(H_PORT_NOI, 2);
    }
  });

  // ─── 18. Property B NOI is negative ────────────────────────────────
  it("18. Property B: NOI is negative (taxes with no revenue)", () => {
    for (let i = 0; i < MONTHS; i++) {
      expect(propB[i].noi).toBeLessThan(0);
    }
  });

  // ─── 19. Company total expenses include staffing + fixed costs ─────
  it("19. Company total expenses match hand calculation", () => {
    expect(comp[0].totalExpenses).toBeCloseTo(H_CO_TOTAL_EXP, 2);
    // Verify key components
    expect(comp[0].partnerCompensation).toBeCloseTo(H_CO_PARTNER_COMP, 2);
    expect(comp[0].officeLease).toBeCloseTo(H_CO_OFFICE, 2);
    expect(comp[0].professionalServices).toBeCloseTo(H_CO_PROF_SERVICES, 2);
    expect(comp[0].techInfrastructure).toBeCloseTo(H_CO_TECH, 2);
  });

  // ─── 20. Company net income ────────────────────────────────────────
  it("20. Company net income matches hand calculation", () => {
    expect(comp[0].preTaxIncome).toBeCloseTo(H_CO_PRE_TAX, 2);
    expect(comp[0].companyIncomeTax).toBeCloseTo(H_CO_TAX, 2);
    expect(comp[0].netIncome).toBeCloseTo(H_CO_NET_INCOME, 2);
    // Stable every month
    for (let i = 1; i < MONTHS; i++) {
      expect(comp[i].netIncome).toBeCloseTo(H_CO_NET_INCOME, 2);
    }
  });
});
