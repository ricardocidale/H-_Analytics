import { describe, it, expect } from "vitest";
import { computeMakeVsBuy } from "./make-vs-buy.js";

// Base fixture shared across tests — a housekeeping department outsourcing decision.
const BASE_INPUT = {
  serviceName: "Housekeeping",
  inHouseLabor: 100_000,
  benefitsRate: 0.30,        // fullyLoadedLabor = 130_000
  trainingAnnual: 5_000,
  suppliesAnnual: 3_000,
  allocatedOverhead: 10_000, // totalInHouseCost = 148_000
  vendorContractPrice: 60_000,
  internalOversightHours: 4,
  managerHourlyRate: 50,     // oversightCost = 10_400 → totalVendorCost = 70_400
  unitCount: 100,
};

describe("computeMakeVsBuy()", () => {
  it("recommends Outsource when vendor cost is substantially lower", () => {
    // annualSavings = 148_000 - 70_400 = 77_600 (57.1%); far above 10% threshold
    const out = computeMakeVsBuy(BASE_INPUT);
    expect(out.recommendation).toBe("Outsource");
    expect(out.totalInHouseCost).toBe(148_000);
    expect(out.totalVendorCost).toBe(70_400);
    expect(out.annualSavings).toBe(77_600);
  });

  it("recommends In-House when in-house cost is substantially lower", () => {
    const out = computeMakeVsBuy({
      ...BASE_INPUT,
      inHouseLabor: 30_000,
      benefitsRate: 0.25,       // fullyLoaded = 37_500
      trainingAnnual: 1_000,
      suppliesAnnual: 500,
      allocatedOverhead: 2_000, // totalInHouseCost = 41_000
      vendorContractPrice: 80_000,
      internalOversightHours: 2,
      managerHourlyRate: 50,    // oversightCost = 5_200 → totalVendorCost = 85_200
    });
    expect(out.recommendation).toBe("In-House");
    expect(out.totalInHouseCost).toBe(41_000);
    expect(out.totalVendorCost).toBe(85_200);
    expect(out.annualSavings).toBeLessThan(0);
  });

  it("recommends Marginal when costs are within the 10% threshold", () => {
    // totalInHouseCost = 48_000; totalVendorCost = 47_000; diff = 1_000 (≈2.1%)
    const out = computeMakeVsBuy({
      ...BASE_INPUT,
      inHouseLabor: 40_000,
      benefitsRate: 0.20,
      trainingAnnual: 0,
      suppliesAnnual: 0,
      allocatedOverhead: 0,    // totalInHouseCost = 48_000
      vendorContractPrice: 47_000,
      internalOversightHours: 0,
      managerHourlyRate: 0,    // totalVendorCost = 47_000
    });
    expect(out.recommendation).toBe("Marginal");
  });

  it("calculates cost per unit correctly", () => {
    // totalInHouseCost = 148_000 / 100 units = 1_480
    // totalVendorCost  =  70_400 / 100 units =   704
    const out = computeMakeVsBuy(BASE_INPUT);
    expect(out.costPerUnitInHouse).toBe(1_480);
    expect(out.costPerUnitVendor).toBe(704);
  });

  it("returns zero cost per unit when unitCount is zero", () => {
    const out = computeMakeVsBuy({ ...BASE_INPUT, unitCount: 0 });
    expect(out.costPerUnitInHouse).toBe(0);
    expect(out.costPerUnitVendor).toBe(0);
  });

  it("preserves serviceName in the output", () => {
    const out = computeMakeVsBuy({ ...BASE_INPUT, serviceName: "F&B Staffing" });
    expect(out.service).toBe("F&B Staffing");
  });

  it("NPV savings move in the same direction as annual savings when using default rates", () => {
    const outOutsource = computeMakeVsBuy(BASE_INPUT);
    // Positive annual savings (outsource cheaper) → positive NPV savings
    expect(outOutsource.npv_savings).toBeGreaterThan(0);
    expect(outOutsource.npv_inhouse).toBeGreaterThan(outOutsource.npv_vendor);

    const outInHouse = computeMakeVsBuy({
      ...BASE_INPUT,
      vendorContractPrice: 200_000,
    });
    // Negative annual savings (in-house cheaper) → negative NPV savings
    expect(outInHouse.npv_savings).toBeLessThan(0);
    expect(outInHouse.npv_inhouse).toBeLessThan(outInHouse.npv_vendor);
  });

  it("produces higher NPV costs with a lower discount rate (present value effect)", () => {
    const highDiscount = computeMakeVsBuy({ ...BASE_INPUT, discount_rate: 0.20 });
    const lowDiscount  = computeMakeVsBuy({ ...BASE_INPUT, discount_rate: 0.05 });
    // Lower discount rate → higher NPV (less discounting of future costs)
    expect(lowDiscount.npv_inhouse).toBeGreaterThan(highDiscount.npv_inhouse);
  });
});
