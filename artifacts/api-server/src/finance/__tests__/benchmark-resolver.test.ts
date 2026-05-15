/**
 * Task #1644 — Fallback tests for benchmark-resolver.ts
 *
 * Verifies that each resolve*() function in benchmark-resolver.ts:
 *  (a) returns the TS factory default when the DB has no rows (empty canonicals + empty overrides)
 *  (b) returns the DB canonical value when a canonical row is present
 *  (c) returns the manual override value when an override row is present (override wins)
 *
 * Storage classes are mocked to avoid any real DB connection, making these
 * safe to run in CI without a Postgres instance.
 */

import { vi, describe, it, expect, beforeEach } from "vitest";
import type { ModelConstant } from "@shared/schema/model-canonicals";
import type { ModelConstantOverride } from "@shared/schema/model-constants";

// ── Hoisted mock fns (must be declared before vi.mock calls) ──────────────

const { mockListCanonicals, mockListOverrides } = vi.hoisted(() => ({
  mockListCanonicals: vi.fn<() => Promise<ModelConstant[]>>(),
  mockListOverrides: vi.fn<() => Promise<ModelConstantOverride[]>>(),
}));

vi.mock("../../storage/model-canonicals", () => ({
  ModelCanonicalsStorage: vi.fn().mockImplementation(() => ({
    listCanonicals: mockListCanonicals,
  })),
}));

vi.mock("../../storage/model-constants", () => ({
  ModelConstantsStorage: vi.fn().mockImplementation(() => ({
    listModelConstantOverrides: mockListOverrides,
  })),
}));

// ── Imports that depend on the mocked modules ─────────────────────────────

import { getFactoryNumber } from "@shared/model-constants-registry";
import {
  resolveCompensationBenchmarks,
  resolveRevenueBenchmarks,
  resolveOverheadBenchmarks,
  resolvePropertyDefaultsBenchmarks,
  resolveCompanyBenchmarks,
  resolveStressThresholds,
  resolveStaffingDefaults,
} from "../benchmark-resolver";

// ── Helpers ───────────────────────────────────────────────────────────────

/** Build the minimal canonical row shape consumed by getEffectiveConstant. */
function makeCanonical(constantKey: string, value: number): ModelConstant {
  return {
    id: 1,
    constantKey,
    country: null,
    countrySubdivision: null,
    value,
    authoritySource: "test-authority",
    authorityRef: null,
    effectiveFrom: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as ModelConstant;
}

/** Build the minimal override row shape consumed by getEffectiveConstant. */
function makeOverride(constantKey: string, value: number): ModelConstantOverride {
  return {
    id: 1,
    constantKey,
    country: null,
    countrySubdivision: null,
    value,
    source: "manual",
    authority: null,
    referenceUrl: null,
    overrideNote: "test override",
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as ModelConstantOverride;
}

// ── Setup ─────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockListCanonicals.mockResolvedValue([]);
  mockListOverrides.mockResolvedValue([]);
});

// ── resolveCompensationBenchmarks ─────────────────────────────────────────

describe("resolveCompensationBenchmarks — empty DB", () => {
  it("returns TS factory defaults for staffSalary band", async () => {
    const result = await resolveCompensationBenchmarks();
    expect(result.staffSalary.low).toBe(getFactoryNumber("benchmarkCompStaffSalaryLow"));
    expect(result.staffSalary.mid).toBe(getFactoryNumber("benchmarkCompStaffSalaryMid"));
    expect(result.staffSalary.high).toBe(getFactoryNumber("benchmarkCompStaffSalaryHigh"));
  });

  it("returns TS factory defaults for partnerCompYear1 band", async () => {
    const result = await resolveCompensationBenchmarks();
    expect(result.partnerCompYear1.low).toBe(getFactoryNumber("benchmarkCompPartnerCompYear1Low"));
    expect(result.partnerCompYear1.mid).toBe(getFactoryNumber("benchmarkCompPartnerCompYear1Mid"));
    expect(result.partnerCompYear1.high).toBe(getFactoryNumber("benchmarkCompPartnerCompYear1High"));
  });

  it("returns only finite numbers (no NaN / Infinity)", async () => {
    const result = await resolveCompensationBenchmarks();
    for (const band of Object.values(result)) {
      expect(Number.isFinite(band.low)).toBe(true);
      expect(Number.isFinite(band.mid)).toBe(true);
      expect(Number.isFinite(band.high)).toBe(true);
    }
  });
});

describe("resolveCompensationBenchmarks — canonical row present", () => {
  it("returns the DB canonical value for staffSalary.low when a row exists", async () => {
    const canonicalValue = 55_000;
    mockListCanonicals.mockResolvedValue([
      makeCanonical("benchmarkCompStaffSalaryLow", canonicalValue),
    ]);
    const result = await resolveCompensationBenchmarks();
    expect(result.staffSalary.low).toBe(canonicalValue);
    expect(result.staffSalary.mid).toBe(getFactoryNumber("benchmarkCompStaffSalaryMid"));
  });
});

describe("resolveCompensationBenchmarks — manual override wins", () => {
  it("uses the override value for staffSalary.low over any canonical or TS default", async () => {
    const overrideValue = 99_000;
    mockListOverrides.mockResolvedValue([
      makeOverride("benchmarkCompStaffSalaryLow", overrideValue),
    ]);
    const result = await resolveCompensationBenchmarks();
    expect(result.staffSalary.low).toBe(overrideValue);
  });

  it("override wins even when a canonical row is also present for the same key", async () => {
    const canonicalValue = 55_000;
    const overrideValue = 99_000;
    mockListCanonicals.mockResolvedValue([
      makeCanonical("benchmarkCompStaffSalaryLow", canonicalValue),
    ]);
    mockListOverrides.mockResolvedValue([
      makeOverride("benchmarkCompStaffSalaryLow", overrideValue),
    ]);
    const result = await resolveCompensationBenchmarks();
    expect(result.staffSalary.low).toBe(overrideValue);
  });
});

// ── resolveRevenueBenchmarks ──────────────────────────────────────────────

describe("resolveRevenueBenchmarks — empty DB", () => {
  it("returns TS factory defaults for marketingRate band", async () => {
    const result = await resolveRevenueBenchmarks();
    expect(result.marketingRate.low).toBe(getFactoryNumber("benchmarkRevMarketingRateLow"));
    expect(result.marketingRate.mid).toBe(getFactoryNumber("benchmarkRevMarketingRateMid"));
    expect(result.marketingRate.high).toBe(getFactoryNumber("benchmarkRevMarketingRateHigh"));
  });

  it("returns TS factory defaults for fbRevenueShare band", async () => {
    const result = await resolveRevenueBenchmarks();
    expect(result.fbRevenueShare.low).toBe(getFactoryNumber("benchmarkRevFbRevenueShareLow"));
    expect(result.fbRevenueShare.mid).toBe(getFactoryNumber("benchmarkRevFbRevenueShareMid"));
    expect(result.fbRevenueShare.high).toBe(getFactoryNumber("benchmarkRevFbRevenueShareHigh"));
  });

  it("returns only finite numbers for all bands", async () => {
    const result = await resolveRevenueBenchmarks();
    for (const band of Object.values(result)) {
      expect(Number.isFinite(band.low)).toBe(true);
      expect(Number.isFinite(band.mid)).toBe(true);
      expect(Number.isFinite(band.high)).toBe(true);
    }
  });
});

describe("resolveRevenueBenchmarks — canonical row present", () => {
  it("returns the DB canonical value for marketingRate.mid when a row exists", async () => {
    const canonicalValue = 0.075;
    mockListCanonicals.mockResolvedValue([
      makeCanonical("benchmarkRevMarketingRateMid", canonicalValue),
    ]);
    const result = await resolveRevenueBenchmarks();
    expect(result.marketingRate.mid).toBe(canonicalValue);
    expect(result.marketingRate.low).toBe(getFactoryNumber("benchmarkRevMarketingRateLow"));
  });
});

describe("resolveRevenueBenchmarks — manual override wins", () => {
  it("uses the override value for fbRevenueShare.high over TS default", async () => {
    const overrideValue = 0.45;
    mockListOverrides.mockResolvedValue([
      makeOverride("benchmarkRevFbRevenueShareHigh", overrideValue),
    ]);
    const result = await resolveRevenueBenchmarks();
    expect(result.fbRevenueShare.high).toBe(overrideValue);
    expect(result.fbRevenueShare.low).toBe(getFactoryNumber("benchmarkRevFbRevenueShareLow"));
  });
});

// ── resolveOverheadBenchmarks ─────────────────────────────────────────────

describe("resolveOverheadBenchmarks — empty DB", () => {
  it("returns TS factory defaults for officeLeaseStart band", async () => {
    const result = await resolveOverheadBenchmarks();
    expect(result.officeLeaseStart.low).toBe(getFactoryNumber("benchmarkOverheadOfficeLeaseLow"));
    expect(result.officeLeaseStart.mid).toBe(getFactoryNumber("benchmarkOverheadOfficeLeaseMid"));
    expect(result.officeLeaseStart.high).toBe(getFactoryNumber("benchmarkOverheadOfficeLeaseHigh"));
  });

  it("returns TS factory defaults for travelCostPerClient band", async () => {
    const result = await resolveOverheadBenchmarks();
    expect(result.travelCostPerClient.low).toBe(getFactoryNumber("benchmarkOverheadTravelPerClientLow"));
    expect(result.travelCostPerClient.mid).toBe(getFactoryNumber("benchmarkOverheadTravelPerClientMid"));
    expect(result.travelCostPerClient.high).toBe(getFactoryNumber("benchmarkOverheadTravelPerClientHigh"));
  });

  it("returns only finite numbers for all bands", async () => {
    const result = await resolveOverheadBenchmarks();
    for (const band of Object.values(result)) {
      expect(Number.isFinite(band.low)).toBe(true);
      expect(Number.isFinite(band.mid)).toBe(true);
      expect(Number.isFinite(band.high)).toBe(true);
    }
  });
});

describe("resolveOverheadBenchmarks — canonical row present", () => {
  it("returns the DB canonical value for officeLeaseStart.low when a row exists", async () => {
    const canonicalValue = 18_000;
    mockListCanonicals.mockResolvedValue([
      makeCanonical("benchmarkOverheadOfficeLeaseLow", canonicalValue),
    ]);
    const result = await resolveOverheadBenchmarks();
    expect(result.officeLeaseStart.low).toBe(canonicalValue);
    expect(result.officeLeaseStart.mid).toBe(getFactoryNumber("benchmarkOverheadOfficeLeaseMid"));
  });
});

describe("resolveOverheadBenchmarks — manual override wins", () => {
  it("uses the override value for techInfraStart.mid over TS default", async () => {
    const overrideValue = 25_000;
    mockListOverrides.mockResolvedValue([
      makeOverride("benchmarkOverheadTechInfraMid", overrideValue),
    ]);
    const result = await resolveOverheadBenchmarks();
    expect(result.techInfraStart.mid).toBe(overrideValue);
  });
});

// ── resolvePropertyDefaultsBenchmarks ────────────────────────────────────

describe("resolvePropertyDefaultsBenchmarks — empty DB", () => {
  it("returns TS factory defaults for eventExpenseRate band", async () => {
    const result = await resolvePropertyDefaultsBenchmarks();
    expect(result.eventExpenseRate.low).toBe(getFactoryNumber("benchmarkPropDefaultsEventExpenseRateLow"));
    expect(result.eventExpenseRate.mid).toBe(getFactoryNumber("benchmarkPropDefaultsEventExpenseRateMid"));
    expect(result.eventExpenseRate.high).toBe(getFactoryNumber("benchmarkPropDefaultsEventExpenseRateHigh"));
  });

  it("returns TS factory defaults for salesCommissionRate band", async () => {
    const result = await resolvePropertyDefaultsBenchmarks();
    expect(result.salesCommissionRate.low).toBe(getFactoryNumber("benchmarkPropDefaultsSalesCommissionRateLow"));
    expect(result.salesCommissionRate.mid).toBe(getFactoryNumber("benchmarkPropDefaultsSalesCommissionRateMid"));
    expect(result.salesCommissionRate.high).toBe(getFactoryNumber("benchmarkPropDefaultsSalesCommissionRateHigh"));
  });

  it("returns only finite numbers for all bands", async () => {
    const result = await resolvePropertyDefaultsBenchmarks();
    for (const band of Object.values(result)) {
      expect(Number.isFinite(band.low)).toBe(true);
      expect(Number.isFinite(band.mid)).toBe(true);
      expect(Number.isFinite(band.high)).toBe(true);
    }
  });
});

describe("resolvePropertyDefaultsBenchmarks — canonical row present", () => {
  it("returns the DB canonical value for salesCommissionRate.mid when a row exists", async () => {
    const canonicalValue = 0.17;
    mockListCanonicals.mockResolvedValue([
      makeCanonical("benchmarkPropDefaultsSalesCommissionRateMid", canonicalValue),
    ]);
    const result = await resolvePropertyDefaultsBenchmarks();
    expect(result.salesCommissionRate.mid).toBe(canonicalValue);
    expect(result.salesCommissionRate.low).toBe(getFactoryNumber("benchmarkPropDefaultsSalesCommissionRateLow"));
  });
});

describe("resolvePropertyDefaultsBenchmarks — manual override wins", () => {
  it("uses the override value for utilitiesVariableSplit.low over TS default", async () => {
    const overrideValue = 0.3;
    mockListOverrides.mockResolvedValue([
      makeOverride("benchmarkPropDefaultsUtilitiesVarSplitLow", overrideValue),
    ]);
    const result = await resolvePropertyDefaultsBenchmarks();
    expect(result.utilitiesVariableSplit.low).toBe(overrideValue);
  });
});

// ── resolveCompanyBenchmarks ──────────────────────────────────────────────

describe("resolveCompanyBenchmarks — empty DB", () => {
  it("returns TS factory defaults for baseManagementFee band", async () => {
    const result = await resolveCompanyBenchmarks();
    expect(result.baseManagementFee.low).toBe(getFactoryNumber("benchmarkCompanyBaseMgmtFeeLow"));
    expect(result.baseManagementFee.mid).toBe(getFactoryNumber("benchmarkCompanyBaseMgmtFeeMid"));
    expect(result.baseManagementFee.high).toBe(getFactoryNumber("benchmarkCompanyBaseMgmtFeeHigh"));
  });

  it("returns TS factory defaults for costOfEquity band", async () => {
    const result = await resolveCompanyBenchmarks();
    expect(result.costOfEquity.low).toBe(getFactoryNumber("benchmarkCompanyCostOfEquityLow"));
    expect(result.costOfEquity.mid).toBe(getFactoryNumber("benchmarkCompanyCostOfEquityMid"));
    expect(result.costOfEquity.high).toBe(getFactoryNumber("benchmarkCompanyCostOfEquityHigh"));
  });

  it("returns only finite numbers for all bands", async () => {
    const result = await resolveCompanyBenchmarks();
    for (const band of Object.values(result)) {
      expect(Number.isFinite(band.low)).toBe(true);
      expect(Number.isFinite(band.mid)).toBe(true);
      expect(Number.isFinite(band.high)).toBe(true);
    }
  });
});

describe("resolveCompanyBenchmarks — canonical row present", () => {
  it("returns the DB canonical value for companyTaxRate.high when a row exists", async () => {
    const canonicalValue = 0.32;
    mockListCanonicals.mockResolvedValue([
      makeCanonical("benchmarkCompanyTaxRateHigh", canonicalValue),
    ]);
    const result = await resolveCompanyBenchmarks();
    expect(result.companyTaxRate.high).toBe(canonicalValue);
    expect(result.companyTaxRate.low).toBe(getFactoryNumber("benchmarkCompanyTaxRateLow"));
  });
});

describe("resolveCompanyBenchmarks — manual override wins", () => {
  it("uses the override value for incentiveManagementFee.mid over TS default", async () => {
    const overrideValue = 0.12;
    mockListOverrides.mockResolvedValue([
      makeOverride("benchmarkCompanyIncentiveMgmtFeeMid", overrideValue),
    ]);
    const result = await resolveCompanyBenchmarks();
    expect(result.incentiveManagementFee.mid).toBe(overrideValue);
    expect(result.incentiveManagementFee.low).toBe(getFactoryNumber("benchmarkCompanyIncentiveMgmtFeeLow"));
  });
});

// ── resolveStressThresholds ───────────────────────────────────────────────

describe("resolveStressThresholds — empty DB", () => {
  it("returns TS factory defaults for dscrCovenantStandard", async () => {
    const result = await resolveStressThresholds();
    expect(result.dscrCovenantStandard).toBe(getFactoryNumber("benchmarkDscrCovenantStandard"));
  });

  it("returns TS factory defaults for stressOccupancyShock", async () => {
    const result = await resolveStressThresholds();
    expect(result.stressOccupancyShock).toBe(getFactoryNumber("benchmarkStressOccupancyShock"));
  });

  it("derives stressRateShockBps from stressRateShockDecimal × 10 000", async () => {
    const result = await resolveStressThresholds();
    const decimalRate = getFactoryNumber("benchmarkStressRateShockDecimal");
    expect(result.stressRateShockDecimal).toBe(decimalRate);
    expect(result.stressRateShockBps).toBe(Math.round(decimalRate * 10_000));
  });

  it("returns only finite numbers for all scalar fields", async () => {
    const result = await resolveStressThresholds();
    for (const [key, val] of Object.entries(result)) {
      expect(Number.isFinite(val), `${key} must be finite`).toBe(true);
    }
  });
});

describe("resolveStressThresholds — canonical row present", () => {
  it("returns the DB canonical value for dscrCovenantCritical when a row exists", async () => {
    const canonicalValue = 0.95;
    mockListCanonicals.mockResolvedValue([
      makeCanonical("benchmarkDscrCovenantCritical", canonicalValue),
    ]);
    const result = await resolveStressThresholds();
    expect(result.dscrCovenantCritical).toBe(canonicalValue);
    expect(result.dscrCovenantStandard).toBe(getFactoryNumber("benchmarkDscrCovenantStandard"));
  });

  it("re-derives stressRateShockBps from the canonical stressRateShockDecimal", async () => {
    const canonicalDecimal = 0.03;
    mockListCanonicals.mockResolvedValue([
      makeCanonical("benchmarkStressRateShockDecimal", canonicalDecimal),
    ]);
    const result = await resolveStressThresholds();
    expect(result.stressRateShockDecimal).toBe(canonicalDecimal);
    expect(result.stressRateShockBps).toBe(Math.round(canonicalDecimal * 10_000));
  });
});

describe("resolveStressThresholds — manual override wins", () => {
  it("uses the override value for stressCostShock over TS default", async () => {
    const overrideValue = 1.25;
    mockListOverrides.mockResolvedValue([
      makeOverride("benchmarkStressCostShock", overrideValue),
    ]);
    const result = await resolveStressThresholds();
    expect(result.stressCostShock).toBe(overrideValue);
  });
});

// ── resolveStaffingDefaults ───────────────────────────────────────────────

describe("resolveStaffingDefaults — empty DB", () => {
  it("returns TS factory defaults for staffSalary", async () => {
    const result = await resolveStaffingDefaults();
    expect(result.staffSalary).toBe(getFactoryNumber("benchmarkStaffDefaultSalary"));
  });

  it("returns TS factory defaults for officeLeaseStart", async () => {
    const result = await resolveStaffingDefaults();
    expect(result.officeLeaseStart).toBe(getFactoryNumber("benchmarkStaffDefaultOfficeLease"));
  });

  it("returns only finite numbers for all scalar fields", async () => {
    const result = await resolveStaffingDefaults();
    for (const [key, val] of Object.entries(result)) {
      expect(Number.isFinite(val), `${key} must be finite`).toBe(true);
    }
  });
});

describe("resolveStaffingDefaults — canonical row present", () => {
  it("returns the DB canonical value for techInfraStart when a row exists", async () => {
    const canonicalValue = 30_000;
    mockListCanonicals.mockResolvedValue([
      makeCanonical("benchmarkStaffDefaultTechInfra", canonicalValue),
    ]);
    const result = await resolveStaffingDefaults();
    expect(result.techInfraStart).toBe(canonicalValue);
    expect(result.staffSalary).toBe(getFactoryNumber("benchmarkStaffDefaultSalary"));
  });
});

describe("resolveStaffingDefaults — manual override wins", () => {
  it("uses the override value for itLicensePerClient over TS default", async () => {
    const overrideValue = 1_800;
    mockListOverrides.mockResolvedValue([
      makeOverride("benchmarkStaffDefaultItLicensePerClient", overrideValue),
    ]);
    const result = await resolveStaffingDefaults();
    expect(result.itLicensePerClient).toBe(overrideValue);
    expect(result.staffSalary).toBe(getFactoryNumber("benchmarkStaffDefaultSalary"));
  });
});
