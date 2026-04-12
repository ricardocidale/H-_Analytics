/**
 * Golden Scenario: Phase 3 Features — Seasonality, Ramp Curve, Priority Return, Fee Subordination
 *
 * Tests the four new engine features added in Phase 3 (Tasks 3.3-3.6).
 * All properties start 2026-01-01 with 0% growth/inflation for traceability.
 *
 * Feature 1: Seasonality Profile (Task 3.3)
 *   - seasonalityProfile[calendarMonth] multiplies BOTH occupancy and ADR
 *   - Occupancy capped at 100%, ADR NOT capped
 *
 * Feature 2: Occupancy Ramp Curve (Task 3.4)
 *   - occupancyRampCurve[opsYear] x maxOccupancy overrides step function
 *   - Falls back to step function when null
 *
 * Feature 3: Owner's Priority Return (Task 3.5)
 *   - Incentive fee = 0 until cumulativeOwnerCashFlow >= hurdle
 *   - hurdle = ownerPriorityReturn x equityInvested
 *
 * Feature 4: Fee Subordination (Task 3.6)
 *   - "full": defer ALL fees when preliminary cash < debt service
 *   - "partial": defer only incentive fee
 */
import { describe, it, expect } from "vitest";
import { generatePropertyProForma } from "../../client/src/lib/financial/property-engine";
import { BUSINESS_MODEL_DEFAULTS } from "../../shared/constants-business-models";
import { DAYS_PER_MONTH, DEFAULT_LAND_VALUE_PERCENT, MONTHS_PER_YEAR } from "../../shared/constants";

// ═══════════════════════════════════════════════════════════════════════════════
// BASE TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════════

const BASE_PROPERTY = {
  id: 200, name: "Test Property", type: "Full Equity",
  purchasePrice: 2_000_000, buildingImprovements: 0, preOpeningCosts: 0,
  roomCount: 20, startAdr: 300, startOccupancy: 0.70, maxOccupancy: 0.70,
  occupancyGrowthStep: 0, occupancyRampMonths: 6, adrGrowthRate: 0, inflationRate: 0,
  operationsStartDate: "2026-01-01", acquisitionDate: "2026-01-01",
  operatingReserve: 0, taxRate: 0.25, exitCapRate: 0.09, dispositionCommission: 0.05,
  willRefinance: "No", landValuePercent: 0.25, depreciationYears: 39,
  // Hotel defaults
  costRateRooms: 0.20, costRateFB: 0.09, costRateAdmin: 0.08,
  costRateMarketing: 0.01, costRatePropertyOps: 0.04, costRateUtilities: 0.05,
  costRateTaxes: 0.03, costRateIT: 0.005, costRateFFE: 0.04,
  costRateOther: 0.05, costRateInsurance: 0.015,
  revShareEvents: 0.18, revShareFB: 0.30, revShareOther: 0.03,
  cateringBoostPercent: 0,
};

const BASE_GLOBAL = {
  modelStartDate: "2026-01-01", projectionYears: 2, inflationRate: 0,
  fixedCostEscalationRate: 0, companyInflationRate: 0, companyTaxRate: 0.21,
  marketingRate: 0.01,
  debtAssumptions: { interestRate: 0.08, amortizationYears: 25 },
};

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 1: SEASONALITY (Task 3.3)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Feature 1: Seasonality Profile (Task 3.3)", () => {
  const FLAT_PROFILE = [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
  const PEAK_TROUGH_PROFILE = [1.4, 1.3, 1.2, 1.0, 0.8, 0.6, 0.5, 0.5, 0.6, 0.8, 1.0, 1.2];

  it("1.1 Flat profile (all 1.0) produces identical results to no profile", () => {
    const propFlat = { ...BASE_PROPERTY, seasonalityProfile: FLAT_PROFILE } as any;
    const propNull = { ...BASE_PROPERTY } as any; // no seasonalityProfile
    const flat = generatePropertyProForma(propFlat, BASE_GLOBAL as any, 24);
    const noProfile = generatePropertyProForma(propNull, BASE_GLOBAL as any, 24);

    // Every month's revenue should be identical
    for (let i = 0; i < 24; i++) {
      expect(flat[i].revenueRooms).toBeCloseTo(noProfile[i].revenueRooms, 2);
      expect(flat[i].revenueTotal).toBeCloseTo(noProfile[i].revenueTotal, 2);
      expect(flat[i].occupancy).toBeCloseTo(noProfile[i].occupancy, 4);
      expect(flat[i].adr).toBeCloseTo(noProfile[i].adr, 2);
    }

    // All months should have same revenue (flat occ + flat ADR + flat season)
    for (let i = 1; i < 12; i++) {
      expect(flat[i].revenueRooms).toBeCloseTo(flat[0].revenueRooms, 2);
    }
  });

  it("1.2 Peak/trough profile — January peak vs July trough", () => {
    const prop = { ...BASE_PROPERTY, seasonalityProfile: PEAK_TROUGH_PROFILE } as any;
    const result = generatePropertyProForma(prop, BASE_GLOBAL as any, 24);

    // January (month 0): factor = 1.4
    // seasonalOccupancy = min(1, 0.70 * 1.4) = min(1, 0.98) = 0.98
    // seasonalAdr = 300 * 1.4 = 420
    // availableRooms = 20 * 30.5 = 610
    // soldRooms = 610 * 0.98 = 597.8
    // revenueRooms = 597.8 * 420 = 251,076
    expect(result[0].occupancy).toBeCloseTo(0.98, 2);
    expect(result[0].adr).toBeCloseTo(420, 2);
    expect(result[0].soldRooms).toBeCloseTo(610 * 0.98, 1);
    expect(result[0].revenueRooms).toBeCloseTo(610 * 0.98 * 420, 0);

    // July (month 6): factor = 0.5
    // seasonalOccupancy = min(1, 0.70 * 0.5) = 0.35
    // seasonalAdr = 300 * 0.5 = 150
    // soldRooms = 610 * 0.35 = 213.5
    // revenueRooms = 213.5 * 150 = 32,025
    expect(result[6].occupancy).toBeCloseTo(0.35, 2);
    expect(result[6].adr).toBeCloseTo(150, 2);
    expect(result[6].soldRooms).toBeCloseTo(610 * 0.35, 1);
    expect(result[6].revenueRooms).toBeCloseTo(610 * 0.35 * 150, 0);

    // January revenue should be roughly 8x July (1.4/0.5 squared effect on occ*ADR)
    // Exact ratio: (0.98 * 420) / (0.35 * 150) = 411.6 / 52.5 = 7.84x
    expect(result[0].revenueRooms / result[6].revenueRooms).toBeCloseTo(
      (0.98 * 420) / (0.35 * 150), 1
    );
  });

  it("1.3 Occupancy capped at 100% but ADR NOT capped", () => {
    // Factor = 2.0: occ = 0.70 * 2.0 = 1.4 -> capped at 1.0; ADR = 300 * 2.0 = 600
    const highProfile = [2.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
    const prop = { ...BASE_PROPERTY, seasonalityProfile: highProfile } as any;
    const result = generatePropertyProForma(prop, BASE_GLOBAL as any, 24);

    // January: occ capped at 1.0, ADR = 600
    expect(result[0].occupancy).toBeCloseTo(1.0, 4);
    expect(result[0].adr).toBeCloseTo(600, 2);
    // soldRooms = 610 * 1.0 = 610
    expect(result[0].soldRooms).toBeCloseTo(610, 1);
    // revenueRooms = 610 * 600 = 366,000
    expect(result[0].revenueRooms).toBeCloseTo(610 * 600, 0);

    // February (factor 1.0): normal behavior
    expect(result[1].occupancy).toBeCloseTo(0.70, 4);
    expect(result[1].adr).toBeCloseTo(300, 2);
  });

  it("1.4 Annual total with seasonal profile differs from flat", () => {
    const propSeasonal = { ...BASE_PROPERTY, seasonalityProfile: PEAK_TROUGH_PROFILE } as any;
    const propFlat = { ...BASE_PROPERTY } as any;
    const seasonal = generatePropertyProForma(propSeasonal, BASE_GLOBAL as any, 24);
    const flat = generatePropertyProForma(propFlat, BASE_GLOBAL as any, 24);

    // Sum year 1 revenue (months 0-11)
    const seasonalYear1 = seasonal.slice(0, 12).reduce((s, m) => s + m.revenueRooms, 0);
    const flatYear1 = flat.slice(0, 12).reduce((s, m) => s + m.revenueRooms, 0);

    // Seasonal redistribution: due to occ cap and compounding, totals differ
    // The seasonal total will differ from flat because occ*ADR is multiplicative
    expect(seasonalYear1).not.toBeCloseTo(flatYear1, 0);

    // Winter months (Jan, Feb, Dec) should be higher than flat
    expect(seasonal[0].revenueRooms).toBeGreaterThan(flat[0].revenueRooms);
    // Summer months (Jul, Aug) should be lower than flat
    expect(seasonal[6].revenueRooms).toBeLessThan(flat[6].revenueRooms);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 2: OCCUPANCY RAMP CURVE (Task 3.4)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Feature 2: Occupancy Ramp Curve (Task 3.4)", () => {

  it("2.1 Ramp curve [0.50, 0.75, 0.90, 1.0] — occupancy follows annual fractions of maxOcc", () => {
    const prop = {
      ...BASE_PROPERTY,
      occupancyRampCurve: [0.50, 0.75, 0.90, 1.0],
    } as any;
    const result = generatePropertyProForma(prop, BASE_GLOBAL as any, 24);

    // Year 0 (months 0-11): occupancy = 0.70 * 0.50 = 0.35
    expect(result[0].occupancy).toBeCloseTo(0.35, 4);
    expect(result[11].occupancy).toBeCloseTo(0.35, 4);

    // Year 1 (months 12-23): occupancy = 0.70 * 0.75 = 0.525
    expect(result[12].occupancy).toBeCloseTo(0.525, 4);
    expect(result[23].occupancy).toBeCloseTo(0.525, 4);

    // Revenue should increase year-over-year
    const year0Rev = result.slice(0, 12).reduce((s, m) => s + m.revenueRooms, 0);
    const year1Rev = result.slice(12, 24).reduce((s, m) => s + m.revenueRooms, 0);
    expect(year1Rev).toBeGreaterThan(year0Rev);

    // Ratio should be 0.525/0.35 = 1.5x (since ADR is flat)
    expect(year1Rev / year0Rev).toBeCloseTo(0.525 / 0.35, 2);
  });

  it("2.2 Ramp curve overrides step function", () => {
    const prop = {
      ...BASE_PROPERTY,
      startOccupancy: 0.50,
      maxOccupancy: 0.80,
      occupancyGrowthStep: 0.05,
      occupancyRampMonths: 6,
      occupancyRampCurve: [0.60, 0.80, 1.0], // curve should win
    } as any;
    const result = generatePropertyProForma(prop, BASE_GLOBAL as any, 24);

    // With curve: year 0 occ = 0.80 * 0.60 = 0.48
    // Without curve (step): month 0 = 0.50, month 6 = 0.55
    // Curve wins: month 0 should be 0.48, not 0.50
    expect(result[0].occupancy).toBeCloseTo(0.80 * 0.60, 4);
    // Month 6 should still be 0.48 (curve is annual, not monthly step)
    expect(result[6].occupancy).toBeCloseTo(0.80 * 0.60, 4);

    // Year 1: 0.80 * 0.80 = 0.64
    expect(result[12].occupancy).toBeCloseTo(0.80 * 0.80, 4);
  });

  it("2.3 Curve shorter than projection — uses last element for remaining years", () => {
    const prop = {
      ...BASE_PROPERTY,
      occupancyRampCurve: [0.60, 0.80], // only 2 elements, projection is 3 years
    } as any;
    // 3 years = 36 months
    const result = generatePropertyProForma(prop, BASE_GLOBAL as any, 36);

    // Year 0: 0.70 * 0.60 = 0.42
    expect(result[0].occupancy).toBeCloseTo(0.70 * 0.60, 4);
    // Year 1: 0.70 * 0.80 = 0.56
    expect(result[12].occupancy).toBeCloseTo(0.70 * 0.80, 4);
    // Year 2: clamps to last element (0.80) → 0.70 * 0.80 = 0.56
    expect(result[24].occupancy).toBeCloseTo(0.70 * 0.80, 4);
    expect(result[35].occupancy).toBeCloseTo(0.70 * 0.80, 4);
  });

  it("2.4 Null curve = step function fallback", () => {
    const prop = {
      ...BASE_PROPERTY,
      startOccupancy: 0.50,
      maxOccupancy: 0.70,
      occupancyGrowthStep: 0.05,
      occupancyRampMonths: 6,
      // No occupancyRampCurve — step function applies
    } as any;
    const result = generatePropertyProForma(prop, BASE_GLOBAL as any, 24);

    // Step function: starts at 0.50, steps up by 0.05 every 6 months, capped at 0.70
    // month 0: 0.50 (rampSteps = floor(0/6) = 0 → 0.50 + 0*0.05 = 0.50)
    expect(result[0].occupancy).toBeCloseTo(0.50, 4);
    // month 5: still 0.50 (rampSteps = floor(5/6) = 0)
    expect(result[5].occupancy).toBeCloseTo(0.50, 4);
    // month 6: 0.55 (rampSteps = floor(6/6) = 1 → 0.50 + 1*0.05 = 0.55)
    expect(result[6].occupancy).toBeCloseTo(0.55, 4);
    // month 12: 0.60 (rampSteps = floor(12/6) = 2 → 0.50 + 2*0.05 = 0.60)
    expect(result[12].occupancy).toBeCloseTo(0.60, 4);
    // month 18: 0.65 (rampSteps = floor(18/6) = 3 → 0.50 + 3*0.05 = 0.65)
    expect(result[18].occupancy).toBeCloseTo(0.65, 4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 3: OWNER'S PRIORITY RETURN (Task 3.5)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Feature 3: Owner's Priority Return (Task 3.5)", () => {

  it("3.1 No priority return (default) — incentive fee active from month 1", () => {
    const prop = { ...BASE_PROPERTY } as any; // ownerPriorityReturn defaults to 0
    const result = generatePropertyProForma(prop, BASE_GLOBAL as any, 24);

    // Incentive fee = GOP * 0.12 (hotel default), should be > 0 for profitable property
    expect(result[0].feeIncentive).toBeGreaterThan(0);
    expect(result[0].gop).toBeGreaterThan(0);

    // Verify incentive rate: feeIncentive = gop * 0.12
    const expectedIncentive = result[0].gop * BUSINESS_MODEL_DEFAULTS.hotel.incentiveMgmtFeeRate;
    expect(result[0].feeIncentive).toBeCloseTo(expectedIncentive, 2);
  });

  it("3.2 8% priority return — incentive fee deferred until cumulative cash >= hurdle", () => {
    const prop = { ...BASE_PROPERTY, ownerPriorityReturn: 0.08 } as any;
    const result = generatePropertyProForma(prop, BASE_GLOBAL as any, 24);

    // Hurdle = 0.08 * equityInvested
    // equityInvested = totalPropertyValue - loanAmount = $2M - $0 (Full Equity) = $2M
    // hurdle = 0.08 * 2,000,000 = $160,000
    const hurdle = 0.08 * 2_000_000;

    // Before hurdle: feeIncentive = 0
    // Find the crossover month: track cumulative cash flow
    let cumulativeCash = 0;
    let crossoverMonth = -1;
    for (let i = 0; i < 24; i++) {
      if (crossoverMonth === -1 && cumulativeCash >= hurdle) {
        crossoverMonth = i;
      }
      cumulativeCash += result[i].cashFlow;
    }

    // Verify early months have no incentive fee
    expect(result[0].feeIncentive).toBeCloseTo(0, 2);
    expect(result[1].feeIncentive).toBeCloseTo(0, 2);

    // Verify crossover exists within 24 months and incentive fee activates after
    expect(crossoverMonth).toBeGreaterThan(0);
    expect(crossoverMonth).toBeLessThan(24);

    // The month BEFORE crossover should have 0 incentive fee
    if (crossoverMonth > 0) {
      expect(result[crossoverMonth - 1].feeIncentive).toBeCloseTo(0, 2);
    }
    // The crossover month should have incentive fee > 0
    expect(result[crossoverMonth].feeIncentive).toBeGreaterThan(0);
  });

  it("3.3 Very high priority return (50%) — incentive fee deferred for early months, kicks in after hurdle", () => {
    const prop = { ...BASE_PROPERTY, ownerPriorityReturn: 0.50 } as any;
    const result = generatePropertyProForma(prop, BASE_GLOBAL as any, 24);

    // Hurdle = 0.50 * $2M = $1,000,000
    // Monthly cash flow (no incentive) ~ $69,683/month → crosses $1M around month 14-15
    // Months 0-14: cumulativeOwnerCashFlow < $1M → incentive = 0
    // Month 15+: cumulative >= $1M → incentive kicks in
    for (let i = 0; i < 14; i++) {
      expect(result[i].feeIncentive).toBeCloseTo(0, 2);
    }

    // GOP should still be > 0 (property is profitable)
    expect(result[0].gop).toBeGreaterThan(0);

    // After hurdle is met, incentive fee should activate
    // Monthly cash flow without incentive ~ $69,683 → 15 months = ~$1,045K > $1M hurdle
    // So by month 15 the incentive fee should be active
    expect(result[15].feeIncentive).toBeGreaterThan(0);

    // Verify incentive fee = GOP * 0.12 once active
    const expectedIncentive = result[15].gop * BUSINESS_MODEL_DEFAULTS.hotel.incentiveMgmtFeeRate;
    expect(result[15].feeIncentive).toBeCloseTo(expectedIncentive, 2);
  });

  it("3.4 Priority return = 0 vs absent — both produce identical results", () => {
    const propZero = { ...BASE_PROPERTY, ownerPriorityReturn: 0 } as any;
    const propAbsent = { ...BASE_PROPERTY } as any; // no ownerPriorityReturn field
    const resultZero = generatePropertyProForma(propZero, BASE_GLOBAL as any, 24);
    const resultAbsent = generatePropertyProForma(propAbsent, BASE_GLOBAL as any, 24);

    for (let i = 0; i < 24; i++) {
      expect(resultZero[i].feeIncentive).toBeCloseTo(resultAbsent[i].feeIncentive, 2);
      expect(resultZero[i].cashFlow).toBeCloseTo(resultAbsent[i].cashFlow, 2);
      expect(resultZero[i].gop).toBeCloseTo(resultAbsent[i].gop, 2);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 4: FEE SUBORDINATION (Task 3.6)
// ═══════════════════════════════════════════════════════════════════════════════

describe("Feature 4: Fee Subordination (Task 3.6)", () => {
  // Financed property for debt service tests
  const FINANCED_PROPERTY = {
    ...BASE_PROPERTY,
    type: "Financed",
    acquisitionLTV: 0.65,
    acquisitionInterestRate: 0.08,
    acquisitionTermYears: 25,
  };

  it("4.1 No subordination (default) — fees always charged, deferredFees = 0", () => {
    const prop = { ...FINANCED_PROPERTY } as any; // feeSubordination defaults to "none"
    const result = generatePropertyProForma(prop, BASE_GLOBAL as any, 24);

    for (let i = 0; i < 24; i++) {
      expect(result[i].deferredFees).toBeCloseTo(0, 2);
      expect(result[i].cumulativeDeferredFees).toBeCloseTo(0, 2);
    }

    // Fees should be active
    expect(result[0].feeBase).toBeGreaterThan(0);
  });

  it("4.2 Full subordination on profitable property — no fees deferred", () => {
    const prop = { ...FINANCED_PROPERTY, feeSubordination: "full" } as any;
    const result = generatePropertyProForma(prop, BASE_GLOBAL as any, 24);

    // Property at $300 ADR, 70% occ should easily cover debt service
    // Verify no fees deferred
    for (let i = 0; i < 24; i++) {
      expect(result[i].deferredFees).toBeCloseTo(0, 2);
      expect(result[i].cumulativeDeferredFees).toBeCloseTo(0, 2);
    }

    // Fees should still be charged normally
    expect(result[0].feeBase).toBeGreaterThan(0);
    expect(result[0].feeIncentive).toBeGreaterThan(0);
  });

  it("4.3 Full subordination on stressed property — fees deferred when cash < debt", () => {
    // Very low ADR so preliminary cash (gop - taxes - ffe) < debt service
    // At ADR $80 prelimAnoi ~$25K > payment ~$10K, so not stressed enough
    // At ADR $30 prelimAnoi ~$7K < payment ~$10K → subordination triggers
    const prop = {
      ...FINANCED_PROPERTY,
      startAdr: 30, // extremely low ADR = stressed property
      feeSubordination: "full",
    } as any;
    const result = generatePropertyProForma(prop, BASE_GLOBAL as any, 24);

    // Check that some months have deferred fees
    const deferredMonths = result.filter(m => m.deferredFees > 0);
    expect(deferredMonths.length).toBeGreaterThan(0);

    // In deferred months: both feeBase and feeIncentive should be 0
    for (const m of deferredMonths) {
      expect(m.feeBase).toBeCloseTo(0, 2);
      expect(m.feeIncentive).toBeCloseTo(0, 2);
    }

    // cumulativeDeferredFees should accumulate
    const lastMonth = result[23];
    if (deferredMonths.length > 0) {
      expect(lastMonth.cumulativeDeferredFees).toBeGreaterThan(0);
    }

    // Verify cumulative deferred fees is monotonically non-decreasing
    for (let i = 1; i < 24; i++) {
      expect(result[i].cumulativeDeferredFees).toBeGreaterThanOrEqual(
        result[i - 1].cumulativeDeferredFees - 0.01 // small tolerance
      );
    }
  });

  it("4.4 Partial subordination — only incentive fee deferred, base fee still charged", () => {
    const prop = {
      ...FINANCED_PROPERTY,
      startAdr: 30, // stressed property (same as 4.3)
      feeSubordination: "partial",
    } as any;
    const result = generatePropertyProForma(prop, BASE_GLOBAL as any, 24);

    // In stressed months where subordination kicks in:
    const deferredMonths = result.filter(m => m.deferredFees > 0);

    // Partial subordination should defer some fees
    expect(deferredMonths.length).toBeGreaterThan(0);

    // In deferred months: base fee should still be charged, incentive deferred
    for (const m of deferredMonths) {
      expect(m.feeBase).toBeGreaterThan(0); // base fee still charged
      expect(m.feeIncentive).toBeCloseTo(0, 2); // incentive deferred
    }

    // Compare with full subordination — partial should defer LESS
    const propFull = {
      ...FINANCED_PROPERTY,
      startAdr: 30,
      feeSubordination: "full",
    } as any;
    const resultFull = generatePropertyProForma(propFull, BASE_GLOBAL as any, 24);

    const partialDeferred = result[23].cumulativeDeferredFees;
    const fullDeferred = resultFull[23].cumulativeDeferredFees;

    // Full subordination defers more (base + incentive) than partial (incentive only)
    expect(fullDeferred).toBeGreaterThanOrEqual(partialDeferred - 0.01);
  });
});
