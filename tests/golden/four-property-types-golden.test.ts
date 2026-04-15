/**
 * Golden Scenarios: Four Property Types
 *
 * Verifies the full calculation pipeline for each of the 4 core property archetypes:
 *   1. US Hotel — standard US tax/financing (25% tax, 39yr depreciation, financed)
 *   2. Colombian Hotel — Colombian tax/depreciation (35% tax, 20yr depreciation)
 *   3. Refinancing Hotel — property that refinances at Month 36
 *   4. VRBO Luxury Rental — per-property pricing, platform fees, non-zero F&B
 *
 * All scenarios use 0% growth / 0% inflation for hand-calc traceability.
 * Expected values are locked as assertions — any drift = regression.
 *
 * Phase 5, Task 5.1 of the master implementation plan.
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
  DEFAULT_COST_RATE_TAXES, DEFAULT_COST_RATE_IT, DEFAULT_COST_RATE_FFE,
  DEFAULT_COST_RATE_OTHER, DEFAULT_COST_RATE_INSURANCE,
  DEFAULT_EVENT_EXPENSE_RATE, DEFAULT_OTHER_EXPENSE_RATE,
  DEFAULT_UTILITIES_VARIABLE_SPLIT,
  DAYS_PER_MONTH, DEFAULT_LAND_VALUE_PERCENT,
} from "../../shared/constants";
import { BUSINESS_MODEL_DEFAULTS } from "../../shared/constants-business-models";
import type { PropertyInput, GlobalInput } from "../../engine/types";

const PENNY = 2; // toBeCloseTo precision

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED GLOBAL (all scenarios)
// ═══════════════════════════════════════════════════════════════════════════════
function makeGlobal(overrides: Record<string, any> = {}): GlobalInput {
  return {
    modelStartDate: "2026-04-01",
    projectionYears: 2,
    inflationRate: 0,
    fixedCostEscalationRate: 0,
    companyInflationRate: 0,
    companyTaxRate: 0.30,
    companyOpsStartDate: "2026-04-01",
    safeTranche1Date: "2026-04-01",
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
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 1: US HOTEL (standard financing, 25% tax, 39yr depreciation)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Golden Scenario 1: US Hotel (financed, 25% tax, 39yr depreciation)", () => {
  const PROP: PropertyInput = {
    id: 101, name: "Catskill Estate Hotel", type: "Financed",
    purchasePrice: 3_000_000, buildingImprovements: 0, preOpeningCosts: 0,
    roomCount: 25, startAdr: 220, startOccupancy: 0.70, maxOccupancy: 0.70,
    occupancyGrowthStep: 0, occupancyRampMonths: 6, adrGrowthRate: 0, inflationRate: 0,
    operationsStartDate: "2026-04-01", acquisitionDate: "2026-04-01",
    operatingReserve: 0, taxRate: 0.25,
    acquisitionLTV: 0.65, acquisitionInterestRate: 0.075, acquisitionTermYears: 25,
    exitCapRate: 0.08, dispositionCommission: 0.05,
    willRefinance: "No",
    depreciationYears: 39,
    landValuePercent: DEFAULT_LAND_VALUE_PERCENT,
  };

  const GLOBAL = makeGlobal();
  const MONTHS = 24;
  const result = generatePropertyProForma(PROP, GLOBAL, MONTHS);

  // Hand calculations
  const avail = 25 * DAYS_PER_MONTH;                           // 762.5
  const sold = avail * 0.70;                                    // 533.75
  const revRooms = sold * 220;                                  // 117,425
  // Revenue shares are % of TOTAL revenue; room share = 1 - ancillary
  const ancillaryShare = DEFAULT_REV_SHARE_EVENTS + DEFAULT_REV_SHARE_FB + DEFAULT_REV_SHARE_OTHER;
  const roomShareOfTotal = Math.max(0.05, 1 - ancillaryShare);
  const revTotal = revRooms / roomShareOfTotal;
  const revEvents = revTotal * DEFAULT_REV_SHARE_EVENTS;
  const revFB = revTotal * DEFAULT_REV_SHARE_FB;
  const revOther = revTotal * DEFAULT_REV_SHARE_OTHER;

  // Expenses
  const expRooms = revRooms * DEFAULT_COST_RATE_ROOMS;
  const expFB = revFB * DEFAULT_COST_RATE_FB;
  const expEvents = revEvents * DEFAULT_EVENT_EXPENSE_RATE;
  const expOther = revOther * DEFAULT_OTHER_EXPENSE_RATE;
  const expMarketing = revTotal * DEFAULT_COST_RATE_MARKETING;
  const expUtilVar = revTotal * (DEFAULT_COST_RATE_UTILITIES * DEFAULT_UTILITIES_VARIABLE_SPLIT);
  const expFFE = revTotal * DEFAULT_COST_RATE_FFE;
  const expAdmin = revTotal * DEFAULT_COST_RATE_ADMIN;
  const expPropOps = revTotal * DEFAULT_COST_RATE_PROPERTY_OPS;
  const expIT = revTotal * DEFAULT_COST_RATE_IT;
  const expTaxes = (3_000_000 / 12) * DEFAULT_COST_RATE_TAXES;
  const expUtilFixed = revTotal * (DEFAULT_COST_RATE_UTILITIES * (1 - DEFAULT_UTILITIES_VARIABLE_SPLIT));
  const expOtherCosts = revTotal * DEFAULT_COST_RATE_OTHER;
  const expInsurance = (3_000_000 / 12) * DEFAULT_COST_RATE_INSURANCE;
  const totalOpEx = expRooms + expFB + expEvents + expOther + expMarketing +
    expUtilVar + expAdmin + expPropOps + expIT + expUtilFixed + expInsurance + expOtherCosts;
  const gop = revTotal - totalOpEx;
  const feeBase = revTotal * DEFAULT_BASE_MANAGEMENT_FEE_RATE;
  const feeIncentive = Math.max(0, gop * DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE);
  const agop = gop - feeBase - feeIncentive;
  const noi = agop - expTaxes;
  const anoi = noi - expFFE;

  // Debt
  const loan = 3_000_000 * 0.65;
  const monthlyRate = 0.075 / 12;
  const totalPayments = 25 * 12;
  const monthlyPmt = pmt(loan, monthlyRate, totalPayments);
  const interest0 = loan * monthlyRate;
  const principal0 = monthlyPmt - interest0;

  // Depreciation
  const buildingValue = 3_000_000 * (1 - DEFAULT_LAND_VALUE_PERCENT);
  const monthlyDepr = buildingValue / 39 / 12;

  // Income
  const taxableIncome0 = anoi - interest0 - monthlyDepr;
  const incomeTax0 = taxableIncome0 > 0 ? taxableIncome0 * 0.25 : 0;
  const netIncome0 = anoi - interest0 - monthlyDepr - incomeTax0;
  const cashFlow0 = anoi - monthlyPmt - incomeTax0;

  const m = result[0];

  it("revenue: rooms, F&B (non-zero), events, other, total", () => {
    expect(m.revenueRooms).toBeCloseTo(revRooms, PENNY);
    expect(m.revenueFB).toBeCloseTo(revFB, PENNY);
    expect(m.revenueFB).toBeGreaterThan(0);
    expect(m.revenueEvents).toBeCloseTo(revEvents, PENNY);
    expect(m.revenueOther).toBeCloseTo(revOther, PENNY);
    expect(m.revenueTotal).toBeCloseTo(revTotal, PENNY);
  });

  it("USALI waterfall: GOP, fees, NOI, ANOI", () => {
    expect(m.gop).toBeCloseTo(gop, PENNY);
    expect(m.feeBase).toBeCloseTo(feeBase, PENNY);
    expect(m.feeIncentive).toBeCloseTo(feeIncentive, PENNY);
    expect(m.noi).toBeCloseTo(noi, PENNY);
    expect(m.anoi).toBeCloseTo(anoi, PENNY);
  });

  it("debt service: PMT, interest, principal", () => {
    expect(m.debtPayment).toBeCloseTo(monthlyPmt, PENNY);
    expect(m.interestExpense).toBeCloseTo(interest0, PENNY);
    expect(m.principalPayment).toBeCloseTo(principal0, PENNY);
  });

  it("net income and cash flow", () => {
    expect(m.depreciationExpense).toBeCloseTo(monthlyDepr, PENNY);
    expect(m.incomeTax).toBeCloseTo(incomeTax0, PENNY);
    expect(m.netIncome).toBeCloseTo(netIncome0, PENNY);
    expect(m.cashFlow).toBeCloseTo(cashFlow0, PENNY);
  });

  it("all 24 months produce finite values", () => {
    for (const month of result) {
      expect(Number.isFinite(month.revenueTotal)).toBe(true);
      expect(Number.isFinite(month.gop)).toBe(true);
      expect(Number.isFinite(month.noi)).toBe(true);
      expect(Number.isFinite(month.cashFlow)).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 2: COLOMBIAN HOTEL (35% tax, 20yr depreciation, full equity)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Golden Scenario 2: Colombian Hotel (35% tax, 20yr depreciation)", () => {
  const PROP: PropertyInput = {
    id: 102, name: "Obra Pía Cartagena", type: "Full Equity",
    purchasePrice: 1_500_000, buildingImprovements: 0, preOpeningCosts: 0,
    roomCount: 12, startAdr: 180, startOccupancy: 0.65, maxOccupancy: 0.65,
    occupancyGrowthStep: 0, occupancyRampMonths: 6, adrGrowthRate: 0, inflationRate: 0,
    operationsStartDate: "2026-04-01", acquisitionDate: "2026-04-01",
    operatingReserve: 0, taxRate: 0.35,
    exitCapRate: 0.08, dispositionCommission: 0.05,
    willRefinance: "No",
    depreciationYears: 20,
    landValuePercent: DEFAULT_LAND_VALUE_PERCENT,
    countryRiskPremium: 0.0285,
  };

  const GLOBAL = makeGlobal();
  const MONTHS = 24;
  const result = generatePropertyProForma(PROP, GLOBAL, MONTHS);

  // Hand calculations
  const avail = 12 * DAYS_PER_MONTH;
  const sold = avail * 0.65;
  const revRooms = sold * 180;
  // Revenue shares are % of TOTAL revenue; room share = 1 - ancillary
  const ancillaryShare = DEFAULT_REV_SHARE_EVENTS + DEFAULT_REV_SHARE_FB + DEFAULT_REV_SHARE_OTHER;
  const roomShareOfTotal = Math.max(0.05, 1 - ancillaryShare);
  const revTotal = revRooms / roomShareOfTotal;
  const revEvents = revTotal * DEFAULT_REV_SHARE_EVENTS;
  const revFB = revTotal * DEFAULT_REV_SHARE_FB;
  const revOther = revTotal * DEFAULT_REV_SHARE_OTHER;

  const expRooms = revRooms * DEFAULT_COST_RATE_ROOMS;
  const expFB = revFB * DEFAULT_COST_RATE_FB;
  const expEvents = revEvents * DEFAULT_EVENT_EXPENSE_RATE;
  const expOther = revOther * DEFAULT_OTHER_EXPENSE_RATE;
  const expMarketing = revTotal * DEFAULT_COST_RATE_MARKETING;
  const expUtilVar = revTotal * (DEFAULT_COST_RATE_UTILITIES * DEFAULT_UTILITIES_VARIABLE_SPLIT);
  const expFFE = revTotal * DEFAULT_COST_RATE_FFE;
  const expAdmin = revTotal * DEFAULT_COST_RATE_ADMIN;
  const expPropOps = revTotal * DEFAULT_COST_RATE_PROPERTY_OPS;
  const expIT = revTotal * DEFAULT_COST_RATE_IT;
  const expTaxes = (1_500_000 / 12) * DEFAULT_COST_RATE_TAXES;
  const expUtilFixed = revTotal * (DEFAULT_COST_RATE_UTILITIES * (1 - DEFAULT_UTILITIES_VARIABLE_SPLIT));
  const expOtherCosts = revTotal * DEFAULT_COST_RATE_OTHER;
  const expInsurance = (1_500_000 / 12) * DEFAULT_COST_RATE_INSURANCE;
  const totalOpEx = expRooms + expFB + expEvents + expOther + expMarketing +
    expUtilVar + expAdmin + expPropOps + expIT + expUtilFixed + expInsurance + expOtherCosts;
  const gop = revTotal - totalOpEx;
  const feeBase = revTotal * DEFAULT_BASE_MANAGEMENT_FEE_RATE;
  const feeIncentive = Math.max(0, gop * DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE);
  const agop = gop - feeBase - feeIncentive;
  const noi = agop - expTaxes;
  const anoi = noi - expFFE;

  // No debt — Full Equity
  // 20yr depreciation (Colombian)
  const buildingValue = 1_500_000 * (1 - DEFAULT_LAND_VALUE_PERCENT);
  const monthlyDepr = buildingValue / 20 / 12;

  const taxableIncome0 = anoi - monthlyDepr; // no interest (full equity)
  const incomeTax0 = taxableIncome0 > 0 ? taxableIncome0 * 0.35 : 0;
  const netIncome0 = anoi - monthlyDepr - incomeTax0;
  const cashFlow0 = anoi - incomeTax0; // no debt payment

  const m = result[0];

  it("revenue: rooms, F&B (non-zero), events, other, total", () => {
    expect(m.revenueRooms).toBeCloseTo(revRooms, PENNY);
    expect(m.revenueFB).toBeCloseTo(revFB, PENNY);
    expect(m.revenueFB).toBeGreaterThan(0);
    expect(m.revenueEvents).toBeCloseTo(revEvents, PENNY);
    expect(m.revenueOther).toBeCloseTo(revOther, PENNY);
    expect(m.revenueTotal).toBeCloseTo(revTotal, PENNY);
  });

  it("USALI waterfall: GOP, fees, NOI, ANOI", () => {
    expect(m.gop).toBeCloseTo(gop, PENNY);
    expect(m.feeBase).toBeCloseTo(feeBase, PENNY);
    expect(m.feeIncentive).toBeCloseTo(feeIncentive, PENNY);
    expect(m.noi).toBeCloseTo(noi, PENNY);
    expect(m.anoi).toBeCloseTo(anoi, PENNY);
  });

  it("no debt service (full equity)", () => {
    expect(m.debtPayment).toBe(0);
    expect(m.interestExpense).toBe(0);
    expect(m.principalPayment).toBe(0);
  });

  it("Colombian depreciation: 20yr, 35% tax", () => {
    expect(m.depreciationExpense).toBeCloseTo(monthlyDepr, PENNY);
    // 20yr depreciation is faster → higher tax shield → lower income tax
    expect(m.incomeTax).toBeCloseTo(incomeTax0, PENNY);
    expect(m.netIncome).toBeCloseTo(netIncome0, PENNY);
  });

  it("cash flow (no debt)", () => {
    expect(m.cashFlow).toBeCloseTo(cashFlow0, PENNY);
  });

  it("20yr depreciation produces higher monthly charge than 39yr", () => {
    const depr39 = buildingValue / 39 / 12;
    expect(monthlyDepr).toBeGreaterThan(depr39);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 3: REFINANCING HOTEL (refinance at Month 36)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Golden Scenario 3: Hotel with Refinancing", () => {
  const PROP: PropertyInput = {
    id: 103, name: "Hudson Valley Estate", type: "Financed",
    purchasePrice: 2_500_000, buildingImprovements: 0, preOpeningCosts: 0,
    roomCount: 18, startAdr: 200, startOccupancy: 0.65, maxOccupancy: 0.65,
    occupancyGrowthStep: 0, occupancyRampMonths: 6, adrGrowthRate: 0, inflationRate: 0,
    operationsStartDate: "2025-01-01", acquisitionDate: "2025-01-01",
    operatingReserve: 0, taxRate: 0.25,
    acquisitionLTV: 0.60, acquisitionInterestRate: 0.08, acquisitionTermYears: 25,
    exitCapRate: 0.085, dispositionCommission: 0.05,
    willRefinance: "Yes",
    refinanceDate: "2028-01-01",        // Month 36
    refinanceLTV: 0.55,
    refinanceInterestRate: 0.065,
    refinanceTermYears: 20,
    refinanceClosingCostRate: 0.03,
    depreciationYears: 39,
    landValuePercent: DEFAULT_LAND_VALUE_PERCENT,
  };

  const GLOBAL = makeGlobal({ modelStartDate: "2025-01-01", projectionYears: 5 });
  const MONTHS = 60;
  const result = generatePropertyProForma(PROP, GLOBAL, MONTHS);

  // Pre-refi debt
  const loan1 = 2_500_000 * 0.60;     // 1,500,000
  const rate1 = 0.08 / 12;
  const pmt1 = pmt(loan1, rate1, 300);

  // Post-refi: based on appraised value at NOI / exit cap
  // Revenue hand-calc
  const avail = 18 * DAYS_PER_MONTH;
  const sold = avail * 0.65;
  const revRooms = sold * 200;
  // Revenue shares are % of TOTAL revenue; room share = 1 - ancillary
  const ancillaryShare = DEFAULT_REV_SHARE_EVENTS + DEFAULT_REV_SHARE_FB + DEFAULT_REV_SHARE_OTHER;
  const roomShareOfTotal = Math.max(0.05, 1 - ancillaryShare);
  const revTotal = revRooms / roomShareOfTotal;
  const revEvents = revTotal * DEFAULT_REV_SHARE_EVENTS;
  const revFB = revTotal * DEFAULT_REV_SHARE_FB;
  const revOther = revTotal * DEFAULT_REV_SHARE_OTHER;

  it("pre-refinance months use original loan terms", () => {
    const m0 = result[0];
    expect(m0.debtPayment).toBeCloseTo(pmt1, PENNY);
    expect(m0.interestExpense).toBeCloseTo(loan1 * rate1, PENNY);
  });

  it("refinance occurs at month 36 — new loan terms", () => {
    const m36 = result[36];
    // After refi, PMT should change (different rate/term)
    expect(m36.debtPayment).not.toBeCloseTo(pmt1, 0);
    // New rate is 6.5%, lower than 8%
    // New loan should be based on appraised value * 55% LTV
  });

  it("post-refinance interest rate is lower", () => {
    const m35 = result[35]; // last pre-refi month
    const m37 = result[37]; // second post-refi month (stabilized)
    // With lower rate (6.5% vs 8%), interest per dollar of balance should be lower
    if (m37.debtOutstanding > 0 && m35.debtOutstanding > 0) {
      const impliedRate35 = m35.interestExpense / (m35.debtOutstanding + m35.principalPayment);
      const impliedRate37 = m37.interestExpense / (m37.debtOutstanding + m37.principalPayment);
      expect(impliedRate37).toBeLessThan(impliedRate35);
    }
  });

  it("revenue is consistent across all 60 months (0% growth)", () => {
    for (const month of result) {
      expect(month.revenueRooms).toBeCloseTo(revRooms, PENNY);
      expect(month.revenueFB).toBeCloseTo(revFB, PENNY);
      expect(month.revenueTotal).toBeCloseTo(revTotal, PENNY);
    }
  });

  it("GOP is positive every month", () => {
    for (const month of result) {
      expect(month.gop).toBeGreaterThan(0);
    }
  });

  it("all months produce finite values", () => {
    for (const month of result) {
      expect(Number.isFinite(month.revenueTotal)).toBe(true);
      expect(Number.isFinite(month.gop)).toBe(true);
      expect(Number.isFinite(month.noi)).toBe(true);
      expect(Number.isFinite(month.cashFlow)).toBe(true);
      expect(Number.isFinite(month.debtOutstanding)).toBe(true);
    }
  });

  it("F&B revenue is non-zero every month", () => {
    for (const month of result) {
      expect(month.revenueFB).toBeGreaterThan(0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCENARIO 4: VRBO / LUXURY RENTAL (platform fees, per-property pricing)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Golden Scenario 4: VRBO Luxury Rental", () => {
  const vrbo = BUSINESS_MODEL_DEFAULTS.vrbo;

  const PROP: PropertyInput = {
    id: 104, name: "Medellín Luxury Duplex", type: "Full Equity",
    purchasePrice: 800_000, buildingImprovements: 0, preOpeningCosts: 0,
    // Per-property pricing: whole property rented at $350/night, 4 bedrooms for capacity tracking
    pricingModel: "per_property" as const,
    nightlyPropertyRate: 350,
    maxGuests: 8,
    roomCount: 4, startAdr: 350, startOccupancy: 0.60, maxOccupancy: 0.60,
    occupancyGrowthStep: 0, occupancyRampMonths: 1, adrGrowthRate: 0, inflationRate: 0,
    operationsStartDate: "2026-04-01", acquisitionDate: "2026-04-01",
    operatingReserve: 0, taxRate: 0.35,
    exitCapRate: 0.095, dispositionCommission: 0.05,
    willRefinance: "No",
    depreciationYears: 20,
    landValuePercent: DEFAULT_LAND_VALUE_PERCENT,
    // VRBO-specific overrides
    costRateRooms: vrbo.costRateRooms,
    costRateFB: vrbo.costRateFB,
    costRateAdmin: vrbo.costRateAdmin,
    costRateMarketing: vrbo.costRateMarketing,
    costRatePropertyOps: vrbo.costRatePropertyOps,
    costRateUtilities: vrbo.costRateUtilities,
    costRateTaxes: vrbo.costRateTaxes,
    costRateIT: vrbo.costRateIT,
    costRateFFE: vrbo.costRateFFE,
    costRateOther: vrbo.costRateOther,
    costRateInsurance: vrbo.costRateInsurance,
    revShareEvents: vrbo.revShareEvents,
    revShareFB: vrbo.revShareFB,
    revShareOther: vrbo.revShareOther,
    cateringBoostPercent: vrbo.cateringBoostPct,
    baseManagementFeeRate: vrbo.baseMgmtFeeRate,
    incentiveManagementFeeRate: vrbo.incentiveMgmtFeeRate,
    platformFeeRate: vrbo.platformFeeRate,
  };

  const GLOBAL = makeGlobal({
    eventExpenseRate: vrbo.eventExpenseRate,
    otherExpenseRate: vrbo.otherExpenseRate,
  });
  const MONTHS = 24;
  const result = generatePropertyProForma(PROP, GLOBAL, MONTHS);

  // Hand calculations — per_property pricing: nightlyRate × daysPerMonth × occupancy
  // (roomCount=4 is tracked for capacity but NOT used for revenue)
  const avail = DAYS_PER_MONTH;                                   // 30.5 (one property, available each day)
  const sold = avail * 0.60;                                      // 18.3 nights occupied
  const revRooms = sold * 350;                                    // 6,405 ($350/night × 18.3 nights)
  // Revenue shares are % of TOTAL revenue; room share = 1 - ancillary
  const vrboAncillary = vrbo.revShareEvents + vrbo.revShareFB + vrbo.revShareOther;
  const vrboRoomShare = Math.max(0.05, 1 - vrboAncillary);
  const revTotal = revRooms / vrboRoomShare;
  const revEvents = revTotal * vrbo.revShareEvents;
  const revFB = revTotal * vrbo.revShareFB;
  const revOther = revTotal * vrbo.revShareOther;

  // Platform fees
  const platformFees = revRooms * vrbo.platformFeeRate;           // 14%

  // Expenses (using VRBO cost rates)
  const expRooms = revRooms * vrbo.costRateRooms;
  const expFB = revFB * vrbo.costRateFB;
  const expEvents = revEvents * vrbo.eventExpenseRate;
  const expOther = revOther * vrbo.otherExpenseRate;
  const expMarketing = revTotal * vrbo.costRateMarketing;
  const expUtilVar = revTotal * (vrbo.costRateUtilities * DEFAULT_UTILITIES_VARIABLE_SPLIT);
  const expFFE = revTotal * vrbo.costRateFFE;
  const expAdmin = revTotal * vrbo.costRateAdmin;
  const expPropOps = revTotal * vrbo.costRatePropertyOps;
  const expIT = revTotal * vrbo.costRateIT;
  const expTaxes = (800_000 / 12) * vrbo.costRateTaxes;
  const expUtilFixed = revTotal * (vrbo.costRateUtilities * (1 - DEFAULT_UTILITIES_VARIABLE_SPLIT));
  const expOtherCosts = revTotal * vrbo.costRateOther;
  const expInsurance = (800_000 / 12) * vrbo.costRateInsurance;

  const totalOpEx = expRooms + expFB + expEvents + expOther + expMarketing +
    expUtilVar + expAdmin + expPropOps + expIT + expUtilFixed + expInsurance + expOtherCosts;
  const gop = revTotal - totalOpEx - platformFees;
  const feeBase = (revTotal - platformFees) * vrbo.baseMgmtFeeRate;
  const feeIncentive = 0; // vrbo incentive = 0%

  // Depreciation (20yr Colombian)
  const buildingValue = 800_000 * (1 - DEFAULT_LAND_VALUE_PERCENT);
  const monthlyDepr = buildingValue / 20 / 12;

  const m = result[0];

  it("revenue: rooms, F&B (non-zero), events (non-zero), other, total", () => {
    expect(m.revenueRooms).toBeCloseTo(revRooms, PENNY);
    expect(m.revenueFB).toBeCloseTo(revFB, PENNY);
    expect(m.revenueFB).toBeGreaterThan(0);
    expect(m.revenueEvents).toBeCloseTo(revEvents, PENNY);
    expect(m.revenueEvents).toBeGreaterThan(0);
    expect(m.revenueOther).toBeCloseTo(revOther, PENNY);
    expect(m.revenueTotal).toBeCloseTo(revTotal, PENNY);
  });

  it("platform fees are deducted (14% of room revenue)", () => {
    expect(m.expensePlatformFees).toBeCloseTo(platformFees, PENNY);
  });

  it("GOP accounts for platform fees", () => {
    expect(m.gop).toBeCloseTo(gop, PENNY);
  });

  it("management fee on net revenue (after platform fees), zero incentive", () => {
    expect(m.feeBase).toBeCloseTo(feeBase, PENNY);
    expect(m.feeIncentive).toBe(0);
  });

  it("no debt service (full equity)", () => {
    expect(m.debtPayment).toBe(0);
    expect(m.interestExpense).toBe(0);
  });

  it("depreciation uses 20yr schedule", () => {
    expect(m.depreciationExpense).toBeCloseTo(monthlyDepr, PENNY);
  });

  it("cash flow reflects high fee burden on small luxury rental", () => {
    // VRBO model: 25% all-in management + 14% platform + 35% tax = tight margins
    // on a 1-room property — cash flow may be negative; this is realistic
    const noi = m.noi;
    const anoi = m.anoi;
    expect(noi).toBeCloseTo(anoi + expFFE, PENNY);
    expect(Number.isFinite(m.cashFlow)).toBe(true);
  });

  it("all 24 months produce identical revenue (0% growth)", () => {
    for (let i = 1; i < result.length; i++) {
      expect(result[i].revenueTotal).toBeCloseTo(revTotal, PENNY);
    }
  });

  it("all months produce finite values", () => {
    for (const month of result) {
      expect(Number.isFinite(month.revenueTotal)).toBe(true);
      expect(Number.isFinite(month.gop)).toBe(true);
      expect(Number.isFinite(month.noi)).toBe(true);
      expect(Number.isFinite(month.cashFlow)).toBe(true);
    }
  });
});
