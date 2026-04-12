import { describe, it, expect } from "vitest";
import { resolvePropertyAssumptions } from "../../engine/property/resolve-assumptions";
import { generatePropertyProForma } from "../../engine/property/property-engine";
import type { PropertyInput, GlobalInput } from "../../engine/types";
import {
  BUSINESS_MODEL_DEFAULTS,
  PLATFORM_FEE_RATES,
  type BusinessModelType,
} from "../../shared/constants";

function makeProperty(overrides: Partial<PropertyInput> = {}): PropertyInput {
  return {
    operationsStartDate: "2026-04-01",
    roomCount: 10,
    startAdr: 200,
    adrGrowthRate: 0.03,
    startOccupancy: 0.60,
    maxOccupancy: 0.80,
    occupancyRampMonths: 6,
    occupancyGrowthStep: 0.05,
    purchasePrice: 1_000_000,
    type: "Full Equity" as const,
    ...overrides,
  };
}

function makeGlobal(overrides: Partial<GlobalInput> = {}): GlobalInput {
  return {
    modelStartDate: "2026-04-01",
    inflationRate: 0.03,
    marketingRate: 0.02,
    ...overrides,
  };
}

describe("BUSINESS_MODEL_DEFAULTS constant map", () => {
  it("contains entries for all three business models", () => {
    expect(BUSINESS_MODEL_DEFAULTS.hotel).toBeDefined();
    expect(BUSINESS_MODEL_DEFAULTS.lodge).toBeDefined();
    expect(BUSINESS_MODEL_DEFAULTS.vrbo).toBeDefined();
  });

  it("hotel has zero platform fee and zero pre-opening burn", () => {
    expect(BUSINESS_MODEL_DEFAULTS.hotel.platformFeeRate).toBe(0);
    expect(BUSINESS_MODEL_DEFAULTS.hotel.preOpeningMonthlyBurn).toBe(0);
  });

  it("lodge has zero platform fee (direct bookings)", () => {
    expect(BUSINESS_MODEL_DEFAULTS.lodge.platformFeeRate).toBe(0);
  });

  it("vrbo has non-zero platform fee (blended 14%)", () => {
    expect(BUSINESS_MODEL_DEFAULTS.vrbo.platformFeeRate).toBe(0.14);
  });

  it("vrbo has non-zero F&B and events revenue shares", () => {
    expect(BUSINESS_MODEL_DEFAULTS.vrbo.revShareFB).toBe(0.08);
    expect(BUSINESS_MODEL_DEFAULTS.vrbo.revShareEvents).toBe(0.04);
    expect(BUSINESS_MODEL_DEFAULTS.vrbo.costRateFB).toBe(0.05);
  });

  it("lodge has higher rooms cost rate than hotel", () => {
    expect(BUSINESS_MODEL_DEFAULTS.lodge.costRateRooms).toBeGreaterThan(
      BUSINESS_MODEL_DEFAULTS.hotel.costRateRooms
    );
  });

  it("vrbo has highest rooms cost rate (per-turnover cleaning)", () => {
    expect(BUSINESS_MODEL_DEFAULTS.vrbo.costRateRooms).toBeGreaterThan(
      BUSINESS_MODEL_DEFAULTS.lodge.costRateRooms
    );
  });

  it("vrbo all-in management fee is higher than hotel", () => {
    expect(BUSINESS_MODEL_DEFAULTS.vrbo.baseMgmtFeeRate).toBeGreaterThan(
      BUSINESS_MODEL_DEFAULTS.hotel.baseMgmtFeeRate
    );
  });

  it("vrbo incentive fee is zero (all-in model)", () => {
    expect(BUSINESS_MODEL_DEFAULTS.vrbo.incentiveMgmtFeeRate).toBe(0);
  });

  it("each model has all required fields", () => {
    const requiredFields: (keyof typeof BUSINESS_MODEL_DEFAULTS.hotel)[] = [
      "costRateRooms", "costRateFB", "costRateAdmin", "costRateMarketing",
      "costRatePropertyOps", "costRateUtilities", "costRateTaxes", "costRateIT",
      "costRateFFE", "costRateOther", "costRateInsurance", "revShareEvents",
      "revShareFB", "revShareOther", "cateringBoostPct", "baseMgmtFeeRate",
      "incentiveMgmtFeeRate", "eventExpenseRate", "otherExpenseRate",
      "platformFeeRate", "preOpeningMonthlyBurn",
    ];
    for (const model of ["hotel", "lodge", "vrbo"] as BusinessModelType[]) {
      for (const field of requiredFields) {
        expect(BUSINESS_MODEL_DEFAULTS[model][field]).toBeDefined();
      }
    }
  });
});

describe("PLATFORM_FEE_RATES", () => {
  it("airbnb > vrbo > direct", () => {
    expect(PLATFORM_FEE_RATES.airbnb).toBeGreaterThan(PLATFORM_FEE_RATES.vrbo);
    expect(PLATFORM_FEE_RATES.vrbo).toBeGreaterThan(PLATFORM_FEE_RATES.direct);
  });

  it("direct is zero", () => {
    expect(PLATFORM_FEE_RATES.direct).toBe(0);
  });

  it("blended rate is 14%", () => {
    expect(PLATFORM_FEE_RATES.blended).toBe(0.14);
  });
});

describe("resolvePropertyAssumptions — business model defaults", () => {
  it("defaults to hotel when businessModel is not set", () => {
    const ctx = resolvePropertyAssumptions(makeProperty(), makeGlobal(), 24);
    expect(ctx.platformFeeRate).toBe(0);
    expect(ctx.preOpeningMonthlyBurn).toBe(0);
    expect(ctx.costRateRooms).toBe(BUSINESS_MODEL_DEFAULTS.hotel.costRateRooms);
  });

  it("resolves vrbo defaults when businessModel is vrbo", () => {
    const ctx = resolvePropertyAssumptions(
      makeProperty({ businessModel: "vrbo" }),
      makeGlobal(),
      24
    );
    expect(ctx.platformFeeRate).toBe(0.14);
    expect(ctx.costRateRooms).toBe(BUSINESS_MODEL_DEFAULTS.vrbo.costRateRooms);
    expect(ctx.revShareFB).toBe(0.08);
    expect(ctx.revShareEvents).toBe(0.04);
    expect(ctx.incentiveFeeRate).toBe(0);
    expect(ctx.baseMgmtFeeRate).toBe(0.25);
  });

  it("resolves lodge defaults when businessModel is lodge", () => {
    const ctx = resolvePropertyAssumptions(
      makeProperty({ businessModel: "lodge" }),
      makeGlobal(),
      24
    );
    expect(ctx.platformFeeRate).toBe(0);
    expect(ctx.costRateRooms).toBe(BUSINESS_MODEL_DEFAULTS.lodge.costRateRooms);
    expect(ctx.revShareEvents).toBe(0);
    expect(ctx.revShareFB).toBe(0.20);
    expect(ctx.baseMgmtFeeRate).toBe(0.18);
  });

  it("property override takes precedence over model defaults", () => {
    const ctx = resolvePropertyAssumptions(
      makeProperty({
        businessModel: "vrbo",
        platformFeeRate: 0.08,
        costRateRooms: 0.22,
      }),
      makeGlobal(),
      24
    );
    expect(ctx.platformFeeRate).toBe(0.08);
    expect(ctx.costRateRooms).toBe(0.22);
  });

  it("pre-opening monthly burn resolves from model defaults", () => {
    const ctx = resolvePropertyAssumptions(
      makeProperty({ preOpeningMonthlyBurn: 5000 }),
      makeGlobal(),
      24
    );
    expect(ctx.preOpeningMonthlyBurn).toBe(5000);
  });
});

describe("property engine — platform fees", () => {
  it("vrbo property has non-zero expensePlatformFees", () => {
    const prop = makeProperty({
      businessModel: "vrbo",
      occupancyRampMonths: 1,
    });
    const result = generatePropertyProForma(prop, makeGlobal(), 12);
    const operational = result.filter(m => m.revenueRooms > 0);
    expect(operational.length).toBeGreaterThan(0);
    for (const m of operational) {
      expect(m.expensePlatformFees).toBeGreaterThan(0);
      expect(m.expensePlatformFees).toBeCloseTo(m.revenueRooms * 0.14, 2);
    }
  });

  it("hotel property has zero expensePlatformFees", () => {
    const prop = makeProperty({ businessModel: "hotel" });
    const result = generatePropertyProForma(prop, makeGlobal(), 12);
    for (const m of result) {
      expect(m.expensePlatformFees).toBe(0);
    }
  });

  it("custom platformFeeRate overrides model default", () => {
    const prop = makeProperty({
      businessModel: "vrbo",
      platformFeeRate: 0.10,
      occupancyRampMonths: 1,
    });
    const result = generatePropertyProForma(prop, makeGlobal(), 12);
    const operational = result.filter(m => m.revenueRooms > 0);
    for (const m of operational) {
      expect(m.expensePlatformFees).toBeCloseTo(m.revenueRooms * 0.10, 2);
    }
  });

  it("management fees computed on net revenue after platform fees", () => {
    const prop = makeProperty({
      businessModel: "vrbo",
      occupancyRampMonths: 1,
    });
    const result = generatePropertyProForma(prop, makeGlobal(), 12);
    const m = result.find(r => r.revenueRooms > 0)!;
    const expectedNetRevenue = m.revenueTotal - m.expensePlatformFees;
    expect(m.feeBase).toBeCloseTo(expectedNetRevenue * BUSINESS_MODEL_DEFAULTS.vrbo.baseMgmtFeeRate, 2);
  });
});

describe("property engine — pre-opening costs", () => {
  it("applies pre-opening burn during ramp months only", () => {
    const rampMonths = 4;
    const burn = 3000;
    const prop = makeProperty({
      occupancyRampMonths: rampMonths,
      preOpeningMonthlyBurn: burn,
    });
    const result = generatePropertyProForma(prop, makeGlobal(), 12);
    const operational = result.filter(m => m.revenueRooms > 0);
    const preOpMonths = operational.filter(m => m.expensePreOpening > 0);
    const postOpMonths = operational.filter(m => m.expensePreOpening === 0);
    expect(preOpMonths.length).toBe(rampMonths);
    for (const m of preOpMonths) {
      expect(m.expensePreOpening).toBe(burn);
    }
    expect(postOpMonths.length).toBeGreaterThan(0);
  });

  it("zero pre-opening burn means zero expensePreOpening", () => {
    const prop = makeProperty({ occupancyRampMonths: 6 });
    const result = generatePropertyProForma(prop, makeGlobal(), 12);
    for (const m of result) {
      expect(m.expensePreOpening).toBe(0);
    }
  });
});

describe("platform fees deducted before management fees", () => {
  it("vrbo management fee base is net of platform fees", () => {
    const prop = makeProperty({
      businessModel: "vrbo",
      occupancyRampMonths: 1,
    });
    const result = generatePropertyProForma(prop, makeGlobal(), 12);
    const m = result.find(r => r.revenueRooms > 0)!;
    expect(m.expensePlatformFees).toBeGreaterThan(0);
    const grossFee = m.revenueTotal * BUSINESS_MODEL_DEFAULTS.vrbo.baseMgmtFeeRate;
    expect(m.feeBase).toBeLessThan(grossFee);
  });
});
