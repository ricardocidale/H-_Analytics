import { describe, it, expect } from "vitest";
import { generatePropertyProForma } from "../../client/src/lib/financialEngine.js";
import { baseProperty, makeGlobal } from "../fixtures";
import { DEPRECIATION_YEARS } from "../../shared/constants.js";

/**
 * Edge case tests for generatePropertyProForma().
 *
 * These tests exercise boundary conditions and degenerate inputs
 * to ensure the financial engine handles them gracefully: no NaN,
 * no Infinity, no thrown exceptions, and correct zero-revenue behavior.
 *
 * Base fixtures mirror the golden test structure with reasonable defaults.
 */

// ---------------------------------------------------------------------------
// Base fixtures
// ---------------------------------------------------------------------------

const baseGlobal = makeGlobal({ projectionYears: 1 });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAYS = 30.5;

/** Asserts that no month in the result contains NaN or Infinity in key numeric fields. */
function assertNoNaNOrInfinity(result: ReturnType<typeof generatePropertyProForma>) {
  const numericFields = [
    "revenueTotal",
    "revenueRooms",
    "revenueEvents",
    "revenueFB",
    "revenueOther",
    "gop",
    "noi",
    "cashFlow",
    "debtPayment",
    "interestExpense",
    "principalPayment",
    "netIncome",
    "incomeTax",
    "operatingCashFlow",
    "financingCashFlow",
    "endingCash",
    "depreciationExpense",
    "propertyValue",
    "debtOutstanding",
    "occupancy",
    "adr",
    "availableRooms",
    "soldRooms",
    "totalExpenses",
    "feeBase",
    "feeIncentive",
    "expenseRooms",
    "expenseFB",
    "expenseEvents",
    "expenseOther",
    "expenseMarketing",
    "expensePropertyOps",
    "expenseUtilitiesVar",
    "expenseFFE",
    "expenseAdmin",
    "expenseIT",
    "expenseTaxes",
    "expenseUtilitiesFixed",
    "expenseInsurance",
    "expenseOtherCosts",
    "refinancingProceeds",
  ] as const;

  for (let i = 0; i < result.length; i++) {
    const month = result[i] as Record<string, unknown>;
    for (const field of numericFields) {
      const value = month[field] as number;
      expect(Number.isNaN(value), `Month ${i} field '${field}' is NaN`).toBe(false);
      expect(Number.isFinite(value), `Month ${i} field '${field}' is not finite (value: ${value})`).toBe(true);
    }
  }
}

// ===========================================================================
// 1. Zero Rooms
// ===========================================================================
describe("Edge Case: Zero Rooms (roomCount = 0)", () => {
  const prop = { ...baseProperty, roomCount: 0 };
  const result = generatePropertyProForma(prop, baseGlobal, 12);

  it("does not throw and produces 12 months", () => {
    expect(result).toHaveLength(12);
  });

  it("all revenue is $0 every month", () => {
    for (const m of result) {
      expect(m.revenueRooms).toBe(0);
      expect(m.revenueEvents).toBe(0);
      expect(m.revenueFB).toBe(0);
      expect(m.revenueOther).toBe(0);
      expect(m.revenueTotal).toBe(0);
    }
  });

  it("sold rooms is 0 every month", () => {
    for (const m of result) {
      expect(m.soldRooms).toBe(0);
    }
  });

  it("available rooms is 0 every month", () => {
    for (const m of result) {
      expect(m.availableRooms).toBe(0);
    }
  });

  it("NOI is <= 0 (only fixed costs if any)", () => {
    for (const m of result) {
      expect(m.noi).toBeLessThanOrEqual(0);
    }
  });

  it("contains no NaN or Infinity values", () => {
    assertNoNaNOrInfinity(result);
  });
});

// ===========================================================================
// 2. Zero ADR
// ===========================================================================
describe("Edge Case: Zero ADR (startAdr = 0)", () => {
  const prop = { ...baseProperty, startAdr: 0 };
  const result = generatePropertyProForma(prop, baseGlobal, 12);

  it("does not throw and produces 12 months", () => {
    expect(result).toHaveLength(12);
  });

  it("all revenue is $0 every month", () => {
    for (const m of result) {
      expect(m.revenueRooms).toBe(0);
      expect(m.revenueEvents).toBe(0);
      expect(m.revenueFB).toBe(0);
      expect(m.revenueOther).toBe(0);
      expect(m.revenueTotal).toBe(0);
    }
  });

  it("ADR stays at $0 despite growth rate", () => {
    for (const m of result) {
      expect(m.adr).toBe(0);
    }
  });

  it("NOI is <= 0 (only fixed costs)", () => {
    for (const m of result) {
      expect(m.noi).toBeLessThanOrEqual(0);
    }
  });

  it("contains no NaN or Infinity values", () => {
    assertNoNaNOrInfinity(result);
  });
});

// ===========================================================================
// 3. Zero Occupancy
// ===========================================================================
describe("Edge Case: Zero Occupancy (startOccupancy = 0, maxOccupancy = 0)", () => {
  const prop = { ...baseProperty, startOccupancy: 0, maxOccupancy: 0 };
  const result = generatePropertyProForma(prop, baseGlobal, 12);

  it("does not throw and produces 12 months", () => {
    expect(result).toHaveLength(12);
  });

  it("occupancy is 0 every month", () => {
    for (const m of result) {
      expect(m.occupancy).toBe(0);
    }
  });

  it("sold rooms is 0 every month", () => {
    for (const m of result) {
      expect(m.soldRooms).toBe(0);
    }
  });

  it("all revenue is $0 every month", () => {
    for (const m of result) {
      expect(m.revenueRooms).toBe(0);
      expect(m.revenueTotal).toBe(0);
    }
  });

  it("contains no NaN or Infinity values", () => {
    assertNoNaNOrInfinity(result);
  });
});

// ===========================================================================
// 4. 100% Occupancy
// ===========================================================================
describe("Edge Case: 100% Occupancy (startOccupancy = 1.0, maxOccupancy = 1.0)", () => {
  const prop = { ...baseProperty, startOccupancy: 1.0, maxOccupancy: 1.0 };
  const result = generatePropertyProForma(prop, baseGlobal, 12);

  it("does not throw and produces 12 months", () => {
    expect(result).toHaveLength(12);
  });

  it("occupancy is exactly 1.0 every month", () => {
    for (const m of result) {
      expect(m.occupancy).toBeCloseTo(1.0, 4);
    }
  });

  it("occupancy never exceeds 1.0", () => {
    for (const m of result) {
      expect(m.occupancy).toBeLessThanOrEqual(1.0);
    }
  });

  it("room revenue = rooms x ADR x 1.0 x 30.5 in month 0", () => {
    const expected = baseProperty.roomCount * baseProperty.startAdr * 1.0 * DAYS;
    expect(result[0].revenueRooms).toBeCloseTo(expected, 2);
  });

  it("sold rooms = available rooms every month", () => {
    for (const m of result) {
      expect(m.soldRooms).toBeCloseTo(m.availableRooms, 2);
    }
  });

  it("contains no NaN or Infinity values", () => {
    assertNoNaNOrInfinity(result);
  });
});

// ===========================================================================
// 5. Single Room Property
// ===========================================================================
describe("Edge Case: Single Room Property (roomCount = 1)", () => {
  const prop = { ...baseProperty, roomCount: 1 };
  const result = generatePropertyProForma(prop, baseGlobal, 12);

  it("does not throw and produces 12 months", () => {
    expect(result).toHaveLength(12);
  });

  it("room revenue month 0 = 1 x ADR x occupancy x 30.5", () => {
    const expected = 1 * baseProperty.startAdr * baseProperty.startOccupancy * DAYS;
    expect(result[0].revenueRooms).toBeCloseTo(expected, 2);
  });

  it("available rooms = 30.5 every month", () => {
    for (const m of result) {
      expect(m.availableRooms).toBeCloseTo(DAYS, 2);
    }
  });

  it("revenue is small but positive", () => {
    expect(result[0].revenueTotal).toBeGreaterThan(0);
    expect(result[0].revenueTotal).toBeLessThan(20000);
  });

  it("contains no NaN or Infinity values", () => {
    assertNoNaNOrInfinity(result);
  });
});

// ===========================================================================
// 6. Zero Growth Rates
// ===========================================================================
describe("Edge Case: Zero Growth Rates (adrGrowthRate = 0)", () => {
  const prop = { ...baseProperty, adrGrowthRate: 0 };
  const result = generatePropertyProForma(prop, { ...baseGlobal, projectionYears: 3 }, 36);

  it("does not throw and produces 36 months", () => {
    expect(result).toHaveLength(36);
  });

  it("ADR is the same every month across all years", () => {
    for (const m of result) {
      expect(m.adr).toBeCloseTo(baseProperty.startAdr, 2);
    }
  });

  it("revenue grows only from occupancy ramp, not ADR", () => {
    // Month 0 at 60% occupancy
    const rev0 = result[0].revenueRooms;
    // Month 6 should have higher occupancy but same ADR
    const rev6 = result[6].revenueRooms;
    if (baseProperty.startOccupancy < baseProperty.maxOccupancy) {
      expect(rev6).toBeGreaterThan(rev0);
    }
    // Year 2 same occupancy plateau month should have same ADR-based revenue
    // (once occupancy stabilizes and ADR doesn't grow, room revenue should stay flat)
  });

  it("contains no NaN or Infinity values", () => {
    assertNoNaNOrInfinity(result);
  });
});

// ===========================================================================
// 7. Very Short Projection (1 year / 12 months)
// ===========================================================================
describe("Edge Case: Very Short Projection (12 months)", () => {
  const result = generatePropertyProForma(baseProperty, baseGlobal, 12);

  it("returns exactly 12 monthly records", () => {
    expect(result).toHaveLength(12);
  });

  it("month indices run from 0 to 11", () => {
    for (let i = 0; i < 12; i++) {
      expect(result[i].monthIndex).toBe(i);
    }
  });

  it("no array bounds errors or undefined months", () => {
    for (const m of result) {
      expect(m).toBeDefined();
      expect(m.date).toBeInstanceOf(Date);
    }
  });

  it("contains no NaN or Infinity values", () => {
    assertNoNaNOrInfinity(result);
  });
});

// ===========================================================================
// 7b. Very Short Projection (1 month)
// ===========================================================================
describe("Edge Case: Minimal Projection (1 month)", () => {
  const result = generatePropertyProForma(baseProperty, baseGlobal, 1);

  it("returns exactly 1 monthly record", () => {
    expect(result).toHaveLength(1);
  });

  it("month index is 0", () => {
    expect(result[0].monthIndex).toBe(0);
  });

  it("contains no NaN or Infinity values", () => {
    assertNoNaNOrInfinity(result);
  });
});

// ===========================================================================
// 8. Full Equity vs Financed
// ===========================================================================
describe("Edge Case: Full Equity has zero debt service", () => {
  const prop = { ...baseProperty, type: "Full Equity" };
  const result = generatePropertyProForma(prop, baseGlobal, 12);

  it("debt service is $0 every month", () => {
    for (const m of result) {
      expect(m.debtPayment).toBe(0);
    }
  });

  it("interest expense is $0 every month", () => {
    for (const m of result) {
      expect(m.interestExpense).toBe(0);
    }
  });

  it("principal payment is $0 every month", () => {
    for (const m of result) {
      expect(m.principalPayment).toBe(0);
    }
  });

  it("debt outstanding is $0 every month", () => {
    for (const m of result) {
      expect(m.debtOutstanding).toBe(0);
    }
  });

  it("financing cash flow is $0 every month", () => {
    for (const m of result) {
      expect(m.financingCashFlow).toBeCloseTo(0, 2);
    }
  });
});

describe("Edge Case: Financed has positive debt service", () => {
  const prop = {
    ...baseProperty,
    type: "Financed",
    acquisitionLTV: 0.75,
    acquisitionInterestRate: 0.09,
    acquisitionTermYears: 25,
  };
  const result = generatePropertyProForma(prop, baseGlobal, 12);

  const loanAmount = baseProperty.purchasePrice * 0.75;
  const monthlyRate = 0.09 / 12;
  const numPayments = 25 * 12;
  const expectedPMT =
    (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
    (Math.pow(1 + monthlyRate, numPayments) - 1);

  it("debt service is positive every month", () => {
    for (const m of result) {
      expect(m.debtPayment).toBeGreaterThan(0);
    }
  });

  it("interest + principal = PMT every month", () => {
    for (const m of result) {
      expect(m.interestExpense + m.principalPayment).toBeCloseTo(m.debtPayment, 2);
    }
  });

  it("PMT matches the amortization formula", () => {
    expect(result[0].debtPayment).toBeCloseTo(expectedPMT, 2);
  });

  it("debt outstanding is positive and decreasing", () => {
    expect(result[0].debtOutstanding).toBeGreaterThan(0);
    for (let i = 1; i < 12; i++) {
      expect(result[i].debtOutstanding).toBeLessThan(result[i - 1].debtOutstanding);
    }
  });

  it("financing cash flow equals negative principal", () => {
    for (const m of result) {
      expect(m.financingCashFlow).toBeCloseTo(-m.principalPayment, 2);
    }
  });

  it("contains no NaN or Infinity values", () => {
    assertNoNaNOrInfinity(result);
  });
});

// ===========================================================================
// 9. No Revenue Shares
// ===========================================================================
describe("Edge Case: No Revenue Shares (events, F&B, other = 0)", () => {
  const prop = {
    ...baseProperty,
    revShareEvents: 0,
    revShareFB: 0,
    revShareOther: 0,
  };
  const result = generatePropertyProForma(prop, baseGlobal, 12);

  it("does not throw and produces 12 months", () => {
    expect(result).toHaveLength(12);
  });

  it("event revenue is $0 every month", () => {
    for (const m of result) {
      expect(m.revenueEvents).toBe(0);
    }
  });

  it("F&B revenue is $0 every month", () => {
    for (const m of result) {
      expect(m.revenueFB).toBe(0);
    }
  });

  it("other revenue is $0 every month", () => {
    for (const m of result) {
      expect(m.revenueOther).toBe(0);
    }
  });

  it("total revenue = room revenue only", () => {
    for (const m of result) {
      expect(m.revenueTotal).toBeCloseTo(m.revenueRooms, 2);
    }
  });

  it("room revenue is still positive", () => {
    expect(result[0].revenueRooms).toBeGreaterThan(0);
  });

  it("contains no NaN or Infinity values", () => {
    assertNoNaNOrInfinity(result);
  });
});

// ===========================================================================
// 10. Zero Cost Rates
// ===========================================================================
describe("Edge Case: Zero Cost Rates (all costRate fields = 0)", () => {
  const prop = {
    ...baseProperty,
    costRateRooms: 0,
    costRateFB: 0,
    costRateAdmin: 0,
    costRateMarketing: 0,
    costRatePropertyOps: 0,
    costRateUtilities: 0,
    costRateTaxes: 0,
    costRateIT: 0,
    costRateFFE: 0,
    costRateOther: 0,
    costRateInsurance: 0,
  };
  const result = generatePropertyProForma(prop, baseGlobal, 12);

  it("does not throw and produces 12 months", () => {
    expect(result).toHaveLength(12);
  });

  it("department variable expenses are $0", () => {
    for (const m of result) {
      expect(m.expenseRooms).toBe(0);
      expect(m.expenseFB).toBe(0);
      expect(m.expenseMarketing).toBe(0);
      expect(m.expenseUtilitiesVar).toBe(0);
      expect(m.expenseFFE).toBe(0);
    }
  });

  it("fixed expenses are $0 (since cost rates are 0)", () => {
    for (const m of result) {
      expect(m.expenseAdmin).toBe(0);
      expect(m.expensePropertyOps).toBe(0);
      expect(m.expenseIT).toBe(0);
      expect(m.expenseTaxes).toBe(0);
      expect(m.expenseInsurance).toBe(0);
      expect(m.expenseUtilitiesFixed).toBe(0);
      expect(m.expenseOtherCosts).toBe(0);
    }
  });

  it("GOP = Total Revenue minus event and other expenses (from global rates)", () => {
    // Note: eventExpenseRate and otherExpenseRate come from global assumptions,
    // not from property costRate fields. So even with all property cost rates at 0,
    // event expenses (default 65% of event rev) and other expenses (default 60% of other rev) apply.
    for (const m of result) {
      const eventAndOtherExpenses = m.expenseEvents + m.expenseOther;
      expect(m.gop).toBeCloseTo(m.revenueTotal - eventAndOtherExpenses, 2);
    }
  });

  it("NOI = GOP - management fees - FFE (FFE is 0 here)", () => {
    for (const m of result) {
      expect(m.anoi).toBeCloseTo(m.gop - m.feeBase - m.feeIncentive, 2);
    }
  });

  it("contains no NaN or Infinity values", () => {
    assertNoNaNOrInfinity(result);
  });
});

// ===========================================================================
// 11. Pre-Operations Period
// ===========================================================================
describe("Edge Case: Pre-Operations Period", () => {
  // Operations start 6 months after model start
  const prop = { ...baseProperty, operationsStartDate: "2026-10-01" };
  const result = generatePropertyProForma(prop, baseGlobal, 12);

  it("revenue is $0 for all pre-ops months (months 0-5)", () => {
    for (let i = 0; i < 6; i++) {
      expect(result[i].revenueTotal).toBe(0);
      expect(result[i].revenueRooms).toBe(0);
      expect(result[i].revenueEvents).toBe(0);
      expect(result[i].revenueFB).toBe(0);
      expect(result[i].revenueOther).toBe(0);
    }
  });

  it("occupancy is 0 for all pre-ops months", () => {
    for (let i = 0; i < 6; i++) {
      expect(result[i].occupancy).toBe(0);
    }
  });

  it("variable expenses are $0 for all pre-ops months", () => {
    for (let i = 0; i < 6; i++) {
      expect(result[i].expenseRooms).toBe(0);
      expect(result[i].expenseFB).toBe(0);
      expect(result[i].expenseEvents).toBe(0);
      expect(result[i].expenseOther).toBe(0);
      expect(result[i].expenseMarketing).toBe(0);
      expect(result[i].expenseUtilitiesVar).toBe(0);
      expect(result[i].expenseFFE).toBe(0);
    }
  });

  it("fixed costs are $0 for pre-ops months (gated by isOperational)", () => {
    for (let i = 0; i < 6; i++) {
      expect(result[i].expenseAdmin).toBe(0);
      expect(result[i].expensePropertyOps).toBe(0);
      expect(result[i].expenseIT).toBe(0);
      expect(result[i].expenseTaxes).toBe(0);
      expect(result[i].expenseInsurance).toBe(0);
      expect(result[i].expenseUtilitiesFixed).toBe(0);
      expect(result[i].expenseOtherCosts).toBe(0);
    }
  });

  it("revenue is positive once operations start (month 6+)", () => {
    for (let i = 6; i < 12; i++) {
      expect(result[i].revenueTotal).toBeGreaterThan(0);
    }
  });

  it("occupancy is positive once operations start", () => {
    expect(result[6].occupancy).toBeCloseTo(baseProperty.startOccupancy, 4);
  });

  it("contains no NaN or Infinity values", () => {
    assertNoNaNOrInfinity(result);
  });
});

// ===========================================================================
// 12. NaN/Infinity Cross-Check for All Edge Cases
// ===========================================================================
describe("Edge Case: NaN/Infinity validation across multiple configurations", () => {
  it("zero rooms produces no NaN or Infinity", () => {
    const result = generatePropertyProForma({ ...baseProperty, roomCount: 0 }, baseGlobal, 12);
    assertNoNaNOrInfinity(result);
  });

  it("zero ADR produces no NaN or Infinity", () => {
    const result = generatePropertyProForma({ ...baseProperty, startAdr: 0 }, baseGlobal, 12);
    assertNoNaNOrInfinity(result);
  });

  it("zero occupancy produces no NaN or Infinity", () => {
    const result = generatePropertyProForma(
      { ...baseProperty, startOccupancy: 0, maxOccupancy: 0 },
      baseGlobal,
      12,
    );
    assertNoNaNOrInfinity(result);
  });

  it("zero purchase price produces no NaN or Infinity", () => {
    const result = generatePropertyProForma({ ...baseProperty, purchasePrice: 0 }, baseGlobal, 12);
    assertNoNaNOrInfinity(result);
  });

  it("very high ADR produces no NaN or Infinity", () => {
    const result = generatePropertyProForma({ ...baseProperty, startAdr: 100_000 }, baseGlobal, 12);
    assertNoNaNOrInfinity(result);
  });

  it("very high room count produces no NaN or Infinity", () => {
    const result = generatePropertyProForma({ ...baseProperty, roomCount: 10_000 }, baseGlobal, 12);
    assertNoNaNOrInfinity(result);
  });

  it("100% occupancy produces no NaN or Infinity", () => {
    const result = generatePropertyProForma(
      { ...baseProperty, startOccupancy: 1.0, maxOccupancy: 1.0 },
      baseGlobal,
      12,
    );
    assertNoNaNOrInfinity(result);
  });

  it("all zero cost rates produces no NaN or Infinity", () => {
    const result = generatePropertyProForma(
      {
        ...baseProperty,
        costRateRooms: 0,
        costRateFB: 0,
        costRateAdmin: 0,
        costRateMarketing: 0,
        costRatePropertyOps: 0,
        costRateUtilities: 0,
        costRateTaxes: 0,
        costRateIT: 0,
        costRateFFE: 0,
        costRateOther: 0,
      },
      baseGlobal,
      12,
    );
    assertNoNaNOrInfinity(result);
  });

  it("financed with zero interest rate produces no NaN or Infinity", () => {
    const result = generatePropertyProForma(
      {
        ...baseProperty,
        type: "Financed",
        acquisitionLTV: 0.75,
        acquisitionInterestRate: 0,
        acquisitionTermYears: 25,
      },
      {
        ...baseGlobal,
        debtAssumptions: { interestRate: 0, amortizationYears: 25, acqLTV: 0.75 },
      },
      12,
    );
    assertNoNaNOrInfinity(result);
  });
});

// ===========================================================================
// 13. Occupancy Ramp Boundary
// ===========================================================================
describe("Edge Case: Occupancy ramp stops at maxOccupancy", () => {
  // Start at 75%, max 80%, step 5%, ramp every 6 months
  // After 6 months: 75 + 5 = 80 (capped). After 12 months: still 80.
  const prop = {
    ...baseProperty,
    startOccupancy: 0.75,
    maxOccupancy: 0.80,
    occupancyGrowthStep: 0.05,
    occupancyRampMonths: 6,
  };
  const result = generatePropertyProForma(prop, { ...baseGlobal, projectionYears: 2 }, 24);

  it("occupancy starts at 75%", () => {
    expect(result[0].occupancy).toBeCloseTo(0.75, 4);
  });

  it("occupancy ramps to 80% after 6 months", () => {
    expect(result[6].occupancy).toBeCloseTo(0.80, 4);
  });

  it("occupancy never exceeds maxOccupancy across 24 months", () => {
    for (const m of result) {
      expect(m.occupancy).toBeLessThanOrEqual(0.80 + 1e-9);
    }
  });
});

// ===========================================================================
// 14. Same Start and Max Occupancy (no ramp)
// ===========================================================================
describe("Edge Case: Same start and max occupancy (no ramp)", () => {
  const prop = {
    ...baseProperty,
    startOccupancy: 0.70,
    maxOccupancy: 0.70,
    occupancyGrowthStep: 0.05,
  };
  const result = generatePropertyProForma(prop, baseGlobal, 12);

  it("occupancy is constant at 70% every operational month", () => {
    for (const m of result) {
      expect(m.occupancy).toBeCloseTo(0.70, 4);
    }
  });
});

// ===========================================================================
// 15. Very Large Purchase Price
// ===========================================================================
describe("Edge Case: Very large purchase price ($100M)", () => {
  const prop = { ...baseProperty, purchasePrice: 100_000_000 };
  const result = generatePropertyProForma(prop, baseGlobal, 12);

  it("does not throw and produces 12 months", () => {
    expect(result).toHaveLength(12);
  });

  it("depreciation is proportionally large", () => {
    const depBasis = 100_000_000 * 0.75; // landValuePercent = 0.25
    const expectedMonthlyDep = depBasis / DEPRECIATION_YEARS / 12;
    expect(result[0].depreciationExpense).toBeCloseTo(expectedMonthlyDep, 0);
  });

  it("property value is computed correctly", () => {
    const landValue = 100_000_000 * 0.25;
    const buildingValue = 100_000_000 * 0.75;
    const monthlyDep = buildingValue / DEPRECIATION_YEARS / 12;
    const expected = landValue + buildingValue - monthlyDep;
    expect(result[0].propertyValue).toBeCloseTo(expected, 0);
  });

  it("contains no NaN or Infinity values", () => {
    assertNoNaNOrInfinity(result);
  });
});

// ===========================================================================
// 16. GAAP Invariants Across All Months
// ===========================================================================
describe("Edge Case: GAAP invariants hold for standard property (all months)", () => {
  const result = generatePropertyProForma(baseProperty, { ...baseGlobal, projectionYears: 3 }, 36);

  it("cashFlow = NOI - debtPayment - incomeTax (every month)", () => {
    for (const m of result) {
      expect(m.cashFlow).toBeCloseTo(m.anoi - m.debtPayment - m.incomeTax, 2);
    }
  });

  it("netIncome = NOI - interest - depreciation - tax (every month)", () => {
    for (const m of result) {
      expect(m.netIncome).toBeCloseTo(
        m.anoi - m.interestExpense - m.depreciationExpense - m.incomeTax,
        2,
      );
    }
  });

  it("operatingCashFlow = netIncome + depreciation (every month)", () => {
    for (const m of result) {
      expect(m.operatingCashFlow).toBeCloseTo(m.netIncome + m.depreciationExpense, 2);
    }
  });

  it("financingCashFlow = -principalPayment (every month)", () => {
    for (const m of result) {
      expect(m.financingCashFlow).toBeCloseTo(-m.principalPayment, 2);
    }
  });

  it("endingCash = cumulative cashFlow", () => {
    let cumCash = 0;
    for (const m of result) {
      cumCash += m.cashFlow;
      expect(m.endingCash).toBeCloseTo(cumCash, 2);
    }
  });
});

// ===========================================================================
// 17. Zero Inflation Rate
// ===========================================================================
describe("Edge Case: Zero inflation rate", () => {
  const glob = { ...baseGlobal, inflationRate: 0, fixedCostEscalationRate: 0, projectionYears: 2 };
  const prop = { ...baseProperty, adrGrowthRate: 0 };
  const result = generatePropertyProForma(prop, glob, 24);

  it("fixed costs do not escalate year over year", () => {
    // Compare month 0 and month 12 admin costs (both operational)
    expect(result[0].expenseAdmin).toBeCloseTo(result[12].expenseAdmin, 2);
  });

  it("contains no NaN or Infinity values", () => {
    assertNoNaNOrInfinity(result);
  });
});

// ===========================================================================
// 18. Financed with Zero Interest Rate (straight-line paydown)
// ===========================================================================
describe("Edge Case: Financed with 0% interest rate", () => {
  const prop = {
    ...baseProperty,
    type: "Financed",
    acquisitionLTV: 0.75,
    acquisitionInterestRate: 0,
    acquisitionTermYears: 25,
  };
  const glob = {
    ...baseGlobal,
    debtAssumptions: { interestRate: 0, amortizationYears: 25, acqLTV: 0.75 },
  };
  const result = generatePropertyProForma(prop, glob, 12);

  it("interest expense is $0 every month", () => {
    for (const m of result) {
      expect(m.interestExpense).toBe(0);
    }
  });

  it("debt outstanding decreases every month", () => {
    for (let i = 1; i < 12; i++) {
      expect(result[i].debtOutstanding).toBeLessThan(result[i - 1].debtOutstanding);
    }
  });

  it("principal payment is loanAmount / totalPayments (straight-line)", () => {
    const loanAmount = baseProperty.purchasePrice * 0.75;
    const totalPayments = 25 * 12;
    const expectedPrincipal = loanAmount / totalPayments;
    expect(result[0].principalPayment).toBeCloseTo(expectedPrincipal, 2);
  });

  it("contains no NaN or Infinity values", () => {
    assertNoNaNOrInfinity(result);
  });
});

// ===========================================================================
// 19. Operations Start Before Model Start (past date)
// ===========================================================================
describe("Edge Case: Operations start before model start", () => {
  const prop = { ...baseProperty, operationsStartDate: "2025-01-01", acquisitionDate: "2025-01-01" };
  const glob = { ...baseGlobal, modelStartDate: "2026-04-01" };
  const result = generatePropertyProForma(prop, glob, 12);

  it("does not throw and produces 12 months", () => {
    expect(result).toHaveLength(12);
  });

  it("is operational from the first month (already past ops start)", () => {
    expect(result[0].revenueTotal).toBeGreaterThan(0);
    expect(result[0].occupancy).toBeGreaterThan(0);
  });

  it("occupancy reflects months since actual ops start, not model start", () => {
    // Operations started 15 months before model start, so occupancy should be well ramped
    // startOccupancy=0.60, ramp every 6 months by 0.05, max 0.80
    // After 15 months: 2 ramp steps (floor(15/6)=2), so 0.60 + 0.10 = 0.70
    expect(result[0].occupancy).toBeCloseTo(0.70, 4);
  });

  it("contains no NaN or Infinity values", () => {
    assertNoNaNOrInfinity(result);
  });
});

// ===========================================================================
// 20. Catering Boost Percent = 0 (deprecated — boost never applied to revenue)
// ===========================================================================
describe("Edge Case: Catering boost percent = 0 (no F&B uplift)", () => {
  const prop = { ...baseProperty, cateringBoostPercent: 0 };
  const result = generatePropertyProForma(prop, baseGlobal, 12);

  it("F&B revenue = totalRevenue x revShareFB (new model, no boost)", () => {
    // New model: F&B = revenueTotal * revShareFB, catering boost is NOT applied
    const ancillaryShare = prop.revShareEvents + prop.revShareFB + prop.revShareOther;
    const roomShareOfTotal = Math.max(0.05, 1 - ancillaryShare);
    const expectedTotal = result[0].revenueRooms / roomShareOfTotal;
    const expectedFB = expectedTotal * prop.revShareFB;
    expect(result[0].revenueFB).toBeCloseTo(expectedFB, 2);
  });

  it("contains no NaN or Infinity values", () => {
    assertNoNaNOrInfinity(result);
  });
});

// ===========================================================================
// 21. Very High Catering Boost (deprecated — boost no longer affects revenue)
// ===========================================================================
describe("Edge Case: Very high catering boost (200%) — deprecated, no effect on revenue", () => {
  const prop = { ...baseProperty, cateringBoostPercent: 2.0 };
  const result = generatePropertyProForma(prop, baseGlobal, 12);

  it("F&B revenue = totalRevenue x revShareFB (boost ignored)", () => {
    // New model: catering boost is NOT applied to revenue regardless of value
    const ancillaryShare = prop.revShareEvents + prop.revShareFB + prop.revShareOther;
    const roomShareOfTotal = Math.max(0.05, 1 - ancillaryShare);
    const expectedTotal = result[0].revenueRooms / roomShareOfTotal;
    const expectedFB = expectedTotal * prop.revShareFB;
    expect(result[0].revenueFB).toBeCloseTo(expectedFB, 2);
  });

  it("total revenue is the same regardless of catering boost (deprecated)", () => {
    const defaultResult = generatePropertyProForma(baseProperty, baseGlobal, 12);
    // Since catering boost is no longer applied, total revenue should be the same
    expect(result[0].revenueTotal).toBeCloseTo(defaultResult[0].revenueTotal, 2);
  });

  it("contains no NaN or Infinity values", () => {
    assertNoNaNOrInfinity(result);
  });
});

// ===========================================================================
// 22. Zero Purchase Price
// ===========================================================================
describe("Edge Case: Zero purchase price", () => {
  const prop = { ...baseProperty, purchasePrice: 0 };
  const result = generatePropertyProForma(prop, baseGlobal, 12);

  it("does not throw and produces 12 months", () => {
    expect(result).toHaveLength(12);
  });

  it("depreciation is $0 (no depreciable basis)", () => {
    for (const m of result) {
      expect(m.depreciationExpense).toBe(0);
    }
  });

  it("property tax expenses are $0 (value-based)", () => {
    for (const m of result) {
      expect(m.expenseTaxes).toBe(0);
    }
  });

  it("contains no NaN or Infinity values", () => {
    assertNoNaNOrInfinity(result);
  });
});

// ===========================================================================
// 23. Revenue Stream Proportionality (new "% of total revenue" model)
// ===========================================================================
describe("Edge Case: Revenue stream proportionality is exact", () => {
  const result = generatePropertyProForma(baseProperty, baseGlobal, 12);
  const ancillaryShare = baseProperty.revShareEvents + baseProperty.revShareFB + baseProperty.revShareOther;
  const roomShareOfTotal = Math.max(0.05, 1 - ancillaryShare);

  it("event revenue = totalRevenue x revShareEvents", () => {
    for (const m of result) {
      const expectedTotal = m.revenueRooms / roomShareOfTotal;
      expect(m.revenueEvents).toBeCloseTo(expectedTotal * baseProperty.revShareEvents, 2);
    }
  });

  it("F&B revenue = totalRevenue x revShareFB (no catering boost)", () => {
    for (const m of result) {
      const expectedTotal = m.revenueRooms / roomShareOfTotal;
      expect(m.revenueFB).toBeCloseTo(expectedTotal * baseProperty.revShareFB, 2);
    }
  });

  it("other revenue = totalRevenue x revShareOther", () => {
    for (const m of result) {
      const expectedTotal = m.revenueRooms / roomShareOfTotal;
      expect(m.revenueOther).toBeCloseTo(expectedTotal * baseProperty.revShareOther, 2);
    }
  });

  it("total revenue = sum of all 4 streams", () => {
    for (const m of result) {
      const sum = m.revenueRooms + m.revenueEvents + m.revenueFB + m.revenueOther;
      expect(m.revenueTotal).toBeCloseTo(sum, 2);
    }
  });
});

// ===========================================================================
// 24. Depreciation Only After Acquisition
// ===========================================================================
describe("Edge Case: Depreciation only after acquisition date", () => {
  // Acquisition 3 months after model start
  const prop = {
    ...baseProperty,
    operationsStartDate: "2026-04-01",
    acquisitionDate: "2026-07-01",
  };
  const result = generatePropertyProForma(prop, baseGlobal, 12);

  it("depreciation is $0 before acquisition date (months 0-2)", () => {
    for (let i = 0; i < 3; i++) {
      expect(result[i].depreciationExpense).toBe(0);
    }
  });

  it("depreciation is positive from acquisition month onward", () => {
    for (let i = 3; i < 12; i++) {
      expect(result[i].depreciationExpense).toBeGreaterThan(0);
    }
  });

  it("property value is 0 before acquisition", () => {
    for (let i = 0; i < 3; i++) {
      expect(result[i].propertyValue).toBe(0);
    }
  });

  it("property value is positive from acquisition onward", () => {
    for (let i = 3; i < 12; i++) {
      expect(result[i].propertyValue).toBeGreaterThan(0);
    }
  });
});

// ===========================================================================
// 25. Long Projection (10 years)
// ===========================================================================
describe("Edge Case: Long projection (120 months / 10 years)", () => {
  const glob = { ...baseGlobal, projectionYears: 10 };
  const result = generatePropertyProForma(baseProperty, glob, 120);

  it("returns exactly 120 monthly records", () => {
    expect(result).toHaveLength(120);
  });

  it("month indices run from 0 to 119", () => {
    expect(result[0].monthIndex).toBe(0);
    expect(result[119].monthIndex).toBe(119);
  });

  it("ADR grows over 10 years with compounding", () => {
    // Year 9 ADR = 200 * (1.03)^9
    const expectedAdrYear9 = 200 * Math.pow(1.03, 9);
    // Month 108 is in year 9
    expect(result[108].adr).toBeCloseTo(expectedAdrYear9, 2);
  });

  it("property value decreases due to accumulated depreciation", () => {
    expect(result[119].propertyValue).toBeLessThan(result[0].propertyValue);
  });

  it("cumulative endingCash at month 119 matches sum of all cashFlows", () => {
    let cumCash = 0;
    for (const m of result) {
      cumCash += m.cashFlow;
    }
    expect(result[119].endingCash).toBeCloseTo(cumCash, 2);
  });

  it("contains no NaN or Infinity values", () => {
    assertNoNaNOrInfinity(result);
  });
});

// ===========================================================================
// 26. Building Improvements Affect Depreciation
// ===========================================================================
describe("Edge Case: Building improvements increase depreciable basis", () => {
  const prop = { ...baseProperty, buildingImprovements: 500_000 };
  const result = generatePropertyProForma(prop, baseGlobal, 12);

  it("depreciation includes building improvements", () => {
    // depreciableBasis = purchasePrice * (1 - landPct) + improvements
    // = 1,000,000 * 0.75 + 500,000 = 1,250,000
    const depBasis = 1_000_000 * 0.75 + 500_000;
    const expectedMonthlyDep = depBasis / DEPRECIATION_YEARS / 12;
    expect(result[0].depreciationExpense).toBeCloseTo(expectedMonthlyDep, 2);
  });

  it("depreciation is higher than base property without improvements", () => {
    const baseResult = generatePropertyProForma(baseProperty, baseGlobal, 12);
    expect(result[0].depreciationExpense).toBeGreaterThan(baseResult[0].depreciationExpense);
  });
});

// ===========================================================================
// 27. GOP and NOI Relationships
// ===========================================================================
describe("Edge Case: GOP and NOI accounting identity", () => {
  const result = generatePropertyProForma(baseProperty, baseGlobal, 12);

  it("GOP = revenueTotal - totalOperatingExpenses (before fees and FFE)", () => {
    for (const m of result) {
      const operatingExpenses =
        m.expenseRooms +
        m.expenseFB +
        m.expenseEvents +
        m.expenseOther +
        m.expenseMarketing +
        m.expensePropertyOps +
        m.expenseUtilitiesVar +
        m.expenseAdmin +
        m.expenseIT +
        m.expenseUtilitiesFixed +
        m.expenseInsurance +
        m.expenseOtherCosts;
      expect(m.gop).toBeCloseTo(m.revenueTotal - operatingExpenses, 2);
    }
  });

  it("NOI = GOP - feeBase - feeIncentive - FFE", () => {
    for (const m of result) {
      const agop = m.gop - m.feeBase - m.feeIncentive;
      const noi = agop - m.expenseTaxes;
      const anoi = noi - m.expenseFFE;
      expect(m.noi).toBeCloseTo(noi, 2);
      expect(m.anoi).toBeCloseTo(anoi, 2);
    }
  });

  it("totalExpenses = operatingExpenses + feeBase + feeIncentive + FFE", () => {
    for (const m of result) {
      expect(m.totalExpenses).toBeCloseTo(
        m.revenueTotal - m.anoi,
        2,
      );
    }
  });
});

// ===========================================================================
// 28. Income Tax Is Never Negative
// ===========================================================================
describe("Edge Case: Income tax is never negative", () => {
  // Zero rooms = negative taxable income, tax should be 0
  const propZero = { ...baseProperty, roomCount: 0 };
  const resultZero = generatePropertyProForma(propZero, baseGlobal, 12);

  it("income tax is 0 when taxable income is negative (zero rooms)", () => {
    for (const m of resultZero) {
      expect(m.incomeTax).toBeGreaterThanOrEqual(0);
    }
  });

  it("income tax is non-negative for standard property too", () => {
    const resultStd = generatePropertyProForma(baseProperty, baseGlobal, 12);
    for (const m of resultStd) {
      expect(m.incomeTax).toBeGreaterThanOrEqual(0);
    }
  });
});

// ===========================================================================
// 29. Cash Shortfall Detection
// ===========================================================================
describe("Edge Case: Cash shortfall detection", () => {
  it("profitable Full Equity property has no cash shortfall", () => {
    const result = generatePropertyProForma(baseProperty, baseGlobal, 12);
    for (const m of result) {
      expect(m.cashShortfall).toBe(false);
    }
  });

  it("zero-revenue financed property may signal cash shortfall", () => {
    const prop = {
      ...baseProperty,
      roomCount: 0,
      type: "Financed",
      acquisitionLTV: 0.75,
      acquisitionInterestRate: 0.09,
      acquisitionTermYears: 25,
    };
    const result = generatePropertyProForma(prop, baseGlobal, 12);
    // With no revenue but debt service, cumulative cash should go negative
    const hasShortfall = result.some((m) => m.cashShortfall);
    expect(hasShortfall).toBe(true);
  });
});

// ===========================================================================
// 30. Occupancy Growth Step of Zero
// ===========================================================================
describe("Edge Case: Occupancy growth step = 0 (no ramp)", () => {
  const prop = {
    ...baseProperty,
    startOccupancy: 0.55,
    maxOccupancy: 0.85,
    occupancyGrowthStep: 0,
    occupancyRampMonths: 6,
  };
  const result = generatePropertyProForma(prop, { ...baseGlobal, projectionYears: 2 }, 24);

  it("occupancy stays at startOccupancy forever", () => {
    for (const m of result) {
      expect(m.occupancy).toBeCloseTo(0.55, 4);
    }
  });
});
