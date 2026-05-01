import { describe, it, expect } from "vitest";
import {
  totalPropertyCost,
  acquisitionLoanAmount,
  propertyEquityInvested,
  acqMonthsFromModelStart,
  acquisitionYearIndex,
  EquityPropertyInput,
} from "@/lib/financial/equityCalculations.js";
import { DEFAULT_LTV } from "@/lib/constants.js";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

/** Full Equity property: $2M purchase, extras included. */
const fullEquityProperty: EquityPropertyInput = {
  purchasePrice: 2_000_000,
  buildingImprovements: 100_000,
  preOpeningCosts: 50_000,
  operatingReserve: 30_000,
  type: "Full Equity",
  acquisitionLTV: null,
  acquisitionDate: "2026-04-01",
  operationsStartDate: "2026-06-01",
};

/** Financed property: 75% LTV, with extras. */
const financedProperty: EquityPropertyInput = {
  purchasePrice: 2_000_000,
  buildingImprovements: 100_000,
  preOpeningCosts: 50_000,
  operatingReserve: 30_000,
  type: "Financed",
  acquisitionLTV: 0.75,
  acquisitionDate: "2026-04-01",
  operationsStartDate: "2026-06-01",
};

/** Minimal property with only required fields. */
const minimalProperty: EquityPropertyInput = {
  purchasePrice: 1_000_000,
  type: "Full Equity",
};

// ---------------------------------------------------------------------------
// 1. totalPropertyCost
// ---------------------------------------------------------------------------

describe("totalPropertyCost", () => {
  it("sums purchasePrice + improvements + preOpeningCosts + operatingReserve", () => {
    const cost = totalPropertyCost(fullEquityProperty);
    // 2,000,000 + 100,000 + 50,000 + 30,000 = 2,180,000
    expect(cost).toBe(2_180_000);
  });

  it("handles null optional fields (improvements, preOpeningCosts, reserve)", () => {
    const prop: EquityPropertyInput = {
      purchasePrice: 1_500_000,
      buildingImprovements: null,
      preOpeningCosts: null,
      operatingReserve: null,
      type: "Full Equity",
    };
    expect(totalPropertyCost(prop)).toBe(1_500_000);
  });

  it("handles undefined optional fields", () => {
    const prop: EquityPropertyInput = {
      purchasePrice: 1_500_000,
      type: "Full Equity",
      // buildingImprovements, preOpeningCosts, operatingReserve all undefined
    };
    expect(totalPropertyCost(prop)).toBe(1_500_000);
  });

  it("handles mixed null and undefined optional fields", () => {
    const prop: EquityPropertyInput = {
      purchasePrice: 1_000_000,
      buildingImprovements: 200_000,
      preOpeningCosts: null,
      // operatingReserve is undefined
      type: "Financed",
    };
    expect(totalPropertyCost(prop)).toBe(1_200_000);
  });

  it("returns 0 when purchasePrice is 0 and all optionals are absent", () => {
    const prop: EquityPropertyInput = {
      purchasePrice: 0,
      type: "Full Equity",
    };
    expect(totalPropertyCost(prop)).toBe(0);
  });

  it("returns only purchasePrice when extras are all zero", () => {
    const prop: EquityPropertyInput = {
      purchasePrice: 3_000_000,
      buildingImprovements: 0,
      preOpeningCosts: 0,
      operatingReserve: 0,
      type: "Full Equity",
    };
    expect(totalPropertyCost(prop)).toBe(3_000_000);
  });

  it("works with large values", () => {
    const prop: EquityPropertyInput = {
      purchasePrice: 50_000_000,
      buildingImprovements: 5_000_000,
      preOpeningCosts: 1_000_000,
      operatingReserve: 500_000,
      type: "Financed",
    };
    expect(totalPropertyCost(prop)).toBe(56_500_000);
  });
});

// ---------------------------------------------------------------------------
// 2. acquisitionLoanAmount
// ---------------------------------------------------------------------------

describe("acquisitionLoanAmount", () => {
  it("Full Equity property returns 0 regardless of LTV", () => {
    expect(acquisitionLoanAmount(fullEquityProperty)).toBe(0);
  });

  it("Financed property uses purchasePrice + improvements * LTV", () => {
    const loan = acquisitionLoanAmount(financedProperty);
    expect(loan).toBe(1_575_000);
  });

  it("uses property acquisitionLTV when available", () => {
    const prop: EquityPropertyInput = {
      purchasePrice: 1_000_000,
      buildingImprovements: 0,
      type: "Financed",
      acquisitionLTV: 0.60,
    };
    expect(acquisitionLoanAmount(prop)).toBe(600_000);
  });

  it("falls back to DEFAULT_LTV when property acquisitionLTV is null", () => {
    const prop: EquityPropertyInput = {
      purchasePrice: 1_000_000,
      buildingImprovements: 0,
      type: "Financed",
      acquisitionLTV: null,
    };
    expect(acquisitionLoanAmount(prop)).toBe(1_000_000 * DEFAULT_LTV);
  });

  it("LTV fallback: property -> DEFAULT_LTV (no global)", () => {
    const propWithLTV: EquityPropertyInput = {
      purchasePrice: 1_000_000,
      buildingImprovements: 0,
      type: "Financed",
      acquisitionLTV: 0.50,
    };
    const propNoLTV: EquityPropertyInput = {
      purchasePrice: 1_000_000,
      buildingImprovements: 0,
      type: "Financed",
      acquisitionLTV: null,
    };

    expect(acquisitionLoanAmount(propWithLTV)).toBe(500_000);
    expect(acquisitionLoanAmount(propNoLTV)).toBe(1_000_000 * DEFAULT_LTV);
  });

  it("includes buildingImprovements in the property value for loan sizing", () => {
    const prop: EquityPropertyInput = {
      purchasePrice: 1_000_000,
      buildingImprovements: 500_000,
      type: "Financed",
      acquisitionLTV: 0.75,
    };
    // loanAmount = (1,000,000 + 500,000) * 0.75 = 1,125,000
    expect(acquisitionLoanAmount(prop)).toBe(1_125_000);
  });

  it("null buildingImprovements treated as 0 in loan sizing", () => {
    const prop: EquityPropertyInput = {
      purchasePrice: 1_000_000,
      buildingImprovements: null,
      type: "Financed",
      acquisitionLTV: 0.75,
    };
    // loanAmount = (1,000,000 + 0) * 0.75 = 750,000
    expect(acquisitionLoanAmount(prop)).toBe(750_000);
  });

  it("returns 0 when purchasePrice is 0 for Financed property", () => {
    const prop: EquityPropertyInput = {
      purchasePrice: 0,
      buildingImprovements: 0,
      type: "Financed",
      acquisitionLTV: 0.75,
    };
    expect(acquisitionLoanAmount(prop)).toBe(0);
  });

  it("only recognizes 'Financed' type (case-sensitive)", () => {
    const prop: EquityPropertyInput = {
      purchasePrice: 1_000_000,
      type: "financed", // lowercase
      acquisitionLTV: 0.75,
    };
    // Should return 0 because type !== "Financed"
    expect(acquisitionLoanAmount(prop)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. propertyEquityInvested
// ---------------------------------------------------------------------------

describe("propertyEquityInvested", () => {
  it("Full Equity: equity = totalPropertyCost (no loan deducted)", () => {
    const equity = propertyEquityInvested(fullEquityProperty);
    const cost = totalPropertyCost(fullEquityProperty);
    expect(equity).toBe(cost);
    expect(equity).toBe(2_180_000);
  });

  it("Financed: equity = totalCost - loanAmount", () => {
    const equity = propertyEquityInvested(financedProperty);
    const cost = totalPropertyCost(financedProperty); // 2,180,000
    const loan = acquisitionLoanAmount(financedProperty); // 1,575,000
    expect(equity).toBe(cost - loan);
    expect(equity).toBe(605_000);
  });

  it("uses DEFAULT_LTV when property acquisitionLTV is null", () => {
    const prop: EquityPropertyInput = {
      purchasePrice: 1_000_000,
      buildingImprovements: 0,
      preOpeningCosts: 0,
      operatingReserve: 0,
      type: "Financed",
      acquisitionLTV: null,
    };
    expect(propertyEquityInvested(prop)).toBe(1_000_000 * (1 - DEFAULT_LTV));
  });

  it("uses DEFAULT_LTV fallback when no LTV provided", () => {
    const prop: EquityPropertyInput = {
      purchasePrice: 1_000_000,
      buildingImprovements: 0,
      preOpeningCosts: 0,
      operatingReserve: 0,
      type: "Financed",
      acquisitionLTV: null,
    };
    // DEFAULT_LTV = 0.75, loanAmount = 1,000,000 * 0.75 = 750,000
    // equity = 1,000,000 - 750,000 = 250,000
    expect(propertyEquityInvested(prop)).toBe(250_000);
  });

  it("includes all cost components in total before deducting loan", () => {
    const prop: EquityPropertyInput = {
      purchasePrice: 1_000_000,
      buildingImprovements: 200_000,
      preOpeningCosts: 50_000,
      operatingReserve: 25_000,
      type: "Financed",
      acquisitionLTV: 0.75,
    };
    // totalCost = 1,000,000 + 200,000 + 50,000 + 25,000 = 1,275,000
    // loanAmount = (1,000,000 + 200,000) * 0.75 = 900,000
    // equity = 1,275,000 - 900,000 = 375,000
    expect(propertyEquityInvested(prop)).toBe(375_000);
  });

  it("Full Equity with minimal fields (no extras)", () => {
    const equity = propertyEquityInvested(minimalProperty);
    expect(equity).toBe(1_000_000);
  });
});

// ---------------------------------------------------------------------------
// 4. acqMonthsFromModelStart
// ---------------------------------------------------------------------------

describe("acqMonthsFromModelStart", () => {
  const modelStart = "2026-04-01";

  it("same month returns 0", () => {
    expect(acqMonthsFromModelStart("2026-04-01", null, modelStart)).toBe(0);
  });

  it("12 months difference returns 12", () => {
    expect(acqMonthsFromModelStart("2027-04-01", null, modelStart)).toBe(12);
  });

  it("6 months difference returns 6", () => {
    expect(acqMonthsFromModelStart("2026-10-01", null, modelStart)).toBe(6);
  });

  it("24 months difference returns 24", () => {
    expect(acqMonthsFromModelStart("2028-04-01", null, modelStart)).toBe(24);
  });

  it("1 month difference returns 1", () => {
    expect(acqMonthsFromModelStart("2026-05-01", null, modelStart)).toBe(1);
  });

  it("acquisition before model start clamps to 0", () => {
    // 3 months before model start -> should clamp to 0
    expect(acqMonthsFromModelStart("2026-01-01", null, modelStart)).toBe(0);
    // 1 year before model start
    expect(acqMonthsFromModelStart("2025-04-01", null, modelStart)).toBe(0);
  });

  it("uses fallbackDate when acquisitionDate is null", () => {
    expect(acqMonthsFromModelStart(null, "2027-04-01", modelStart)).toBe(12);
  });

  it("uses fallbackDate when acquisitionDate is undefined", () => {
    expect(acqMonthsFromModelStart(undefined, "2027-04-01", modelStart)).toBe(12);
  });

  it("uses fallbackDate when acquisitionDate is empty string", () => {
    // empty string is falsy, so falls back to fallbackDate
    expect(acqMonthsFromModelStart("", "2027-04-01", modelStart)).toBe(12);
  });

  it("falls back to modelStartDate when both dates are null", () => {
    // Both null -> uses modelStartDate itself -> 0 months difference
    expect(acqMonthsFromModelStart(null, null, modelStart)).toBe(0);
  });

  it("falls back to modelStartDate when both dates are undefined", () => {
    expect(acqMonthsFromModelStart(undefined, undefined, modelStart)).toBe(0);
  });

  it("acquisitionDate takes priority over fallbackDate", () => {
    // acquisitionDate = 6 months, fallbackDate = 12 months
    expect(acqMonthsFromModelStart("2026-10-01", "2027-04-01", modelStart)).toBe(6);
  });

  it("handles cross-year boundaries", () => {
    // April 2026 to January 2027 = 9 months
    expect(acqMonthsFromModelStart("2027-01-01", null, modelStart)).toBe(9);
    // April 2026 to December 2026 = 8 months
    expect(acqMonthsFromModelStart("2026-12-01", null, modelStart)).toBe(8);
  });

  it("handles multi-year spans", () => {
    // April 2026 to April 2036 = 120 months
    expect(acqMonthsFromModelStart("2036-04-01", null, modelStart)).toBe(120);
  });
});

// ---------------------------------------------------------------------------
// 5. acquisitionYearIndex
// ---------------------------------------------------------------------------

describe("acquisitionYearIndex", () => {
  const modelStart = "2026-04-01";

  it("month 0 (same month) -> year index 0", () => {
    expect(acquisitionYearIndex("2026-04-01", null, modelStart)).toBe(0);
  });

  it("month 1-11 -> year index 0", () => {
    // 6 months -> floor(6/12) = 0
    expect(acquisitionYearIndex("2026-10-01", null, modelStart)).toBe(0);
    // 11 months -> floor(11/12) = 0
    expect(acquisitionYearIndex("2027-03-01", null, modelStart)).toBe(0);
  });

  it("month 12 -> year index 1", () => {
    expect(acquisitionYearIndex("2027-04-01", null, modelStart)).toBe(1);
  });

  it("month 12-23 -> year index 1", () => {
    // 18 months -> floor(18/12) = 1
    expect(acquisitionYearIndex("2027-10-01", null, modelStart)).toBe(1);
  });

  it("month 24 -> year index 2", () => {
    expect(acquisitionYearIndex("2028-04-01", null, modelStart)).toBe(2);
  });

  it("null acquisition date uses fallback", () => {
    // fallbackDate = 2027-04-01 -> 12 months -> year 1
    expect(acquisitionYearIndex(null, "2027-04-01", modelStart)).toBe(1);
  });

  it("undefined acquisition date uses fallback", () => {
    expect(acquisitionYearIndex(undefined, "2028-04-01", modelStart)).toBe(2);
  });

  it("both dates null -> year index 0 (falls back to model start)", () => {
    expect(acquisitionYearIndex(null, null, modelStart)).toBe(0);
  });

  it("acquisition before model start clamps to year index 0", () => {
    expect(acquisitionYearIndex("2025-01-01", null, modelStart)).toBe(0);
  });

  it("large month offset -> correct year index", () => {
    // 120 months = 10 years -> year index 10
    expect(acquisitionYearIndex("2036-04-01", null, modelStart)).toBe(10);
  });

  it("month 5 -> year index 0 (mid-first-year)", () => {
    expect(acquisitionYearIndex("2026-09-01", null, modelStart)).toBe(0);
  });

  it("month 13 -> year index 1 (one month into second year)", () => {
    expect(acquisitionYearIndex("2027-05-01", null, modelStart)).toBe(1);
  });
});
