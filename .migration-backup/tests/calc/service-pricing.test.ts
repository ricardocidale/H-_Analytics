/**
 * Tests for service-fee.ts and markup-waterfall.ts research tools.
 */
import { describe, it, expect } from "vitest";
import { computeServiceFee } from "../../calc/research/service-fee";
import { computeMarkupWaterfall } from "../../calc/research/markup-waterfall";

describe("computeServiceFee", () => {
  it("returns marketing fee range for $1M property revenue", () => {
    const result = computeServiceFee({ propertyRevenue: 1_000_000, serviceType: "marketing" });
    expect(result.lowRate).toBe(0.015);
    expect(result.midRate).toBe(0.025);
    expect(result.highRate).toBe(0.04);
    expect(result.lowFee).toBe(15_000);
    expect(result.midFee).toBe(25_000);
    expect(result.highFee).toBe(40_000);
  });

  it("returns Technology & Reservations fee range", () => {
    const result = computeServiceFee({ propertyRevenue: 2_000_000, serviceType: "technology_reservations" });
    expect(result.lowRate).toBe(0.02);
    expect(result.midRate).toBe(0.03);
    expect(result.highRate).toBe(0.04);
    expect(result.lowFee).toBe(40_000);
    expect(result.midFee).toBe(60_000);
    expect(result.highFee).toBe(80_000);
  });

  it("resolves legacy 'it' alias to Technology & Reservations", () => {
    const result = computeServiceFee({ propertyRevenue: 2_000_000, serviceType: "it" });
    expect(result.lowFee).toBe(40_000);
    expect(result.midFee).toBe(60_000);
    expect(result.highFee).toBe(80_000);
  });

  it("returns accounting fee range", () => {
    const result = computeServiceFee({ propertyRevenue: 1_500_000, serviceType: "accounting" });
    expect(result.lowRate).toBe(0.01);
    expect(result.midRate).toBe(0.02);
    expect(result.highRate).toBe(0.03);
  });

  it("falls back to generic range for unknown service types", () => {
    const result = computeServiceFee({ propertyRevenue: 1_000_000, serviceType: "concierge" });
    expect(result.lowRate).toBe(0.01);
    expect(result.midRate).toBe(0.02);
    expect(result.highRate).toBe(0.03);
    expect(result.notes).toContain("No specific benchmark");
  });

  it("handles zero revenue", () => {
    const result = computeServiceFee({ propertyRevenue: 0, serviceType: "marketing" });
    expect(result.lowFee).toBe(0);
    expect(result.midFee).toBe(0);
    expect(result.highFee).toBe(0);
  });

  it("normalizes service type with spaces and special chars", () => {
    const result = computeServiceFee({ propertyRevenue: 1_000_000, serviceType: "Revenue Management" });
    expect(result.lowRate).toBe(0.015);
    expect(result.midRate).toBe(0.02);
  });

  it("includes notes for known service types", () => {
    const result = computeServiceFee({ propertyRevenue: 1_000_000, serviceType: "marketing" });
    expect(result.notes).toContain("OTA management");
  });

  it("returns general management fee range", () => {
    const result = computeServiceFee({ propertyRevenue: 3_000_000, serviceType: "general_management" });
    expect(result.lowFee).toBe(90_000);
    expect(result.midFee).toBe(150_000);
    expect(result.highFee).toBe(240_000);
  });
});

describe("computeMarkupWaterfall", () => {
  it("computes correct waterfall for 20% markup", () => {
    const result = computeMarkupWaterfall({ vendorCost: 10_000, markupPct: 0.20 });
    expect(result.feeCharged).toBe(12_000);
    expect(result.grossProfit).toBe(2_000);
    expect(result.effectiveMargin).toBeCloseTo(0.1667, 3);
  });

  it("computes correct waterfall for 0% markup (pass-through)", () => {
    const result = computeMarkupWaterfall({ vendorCost: 10_000, markupPct: 0 });
    expect(result.feeCharged).toBe(10_000);
    expect(result.grossProfit).toBe(0);
    expect(result.effectiveMargin).toBe(0);
  });

  it("computes correct waterfall for 50% markup", () => {
    const result = computeMarkupWaterfall({ vendorCost: 20_000, markupPct: 0.50 });
    expect(result.feeCharged).toBe(30_000);
    expect(result.grossProfit).toBe(10_000);
    expect(result.effectiveMargin).toBeCloseTo(0.3333, 3);
  });

  it("returns industry markup range for marketing", () => {
    const result = computeMarkupWaterfall({ vendorCost: 10_000, markupPct: 0.25, serviceType: "marketing" });
    expect(result.industryMarkupRange).toBeTruthy();
    expect(result.industryMarkupRange!.low).toBe(0.15);
    expect(result.industryMarkupRange!.mid).toBe(0.25);
    expect(result.industryMarkupRange!.high).toBe(0.35);
  });

  it("returns null industry range for unknown service type", () => {
    const result = computeMarkupWaterfall({ vendorCost: 10_000, markupPct: 0.20, serviceType: "valet" });
    expect(result.industryMarkupRange).toBeNull();
  });

  it("returns null industry range when no service type", () => {
    const result = computeMarkupWaterfall({ vendorCost: 10_000, markupPct: 0.20 });
    expect(result.industryMarkupRange).toBeNull();
    expect(result.serviceType).toBeNull();
  });

  it("handles zero vendor cost", () => {
    const result = computeMarkupWaterfall({ vendorCost: 0, markupPct: 0.20 });
    expect(result.feeCharged).toBe(0);
    expect(result.grossProfit).toBe(0);
    expect(result.effectiveMargin).toBe(0);
  });

  it("returns accounting industry markup range", () => {
    const result = computeMarkupWaterfall({ vendorCost: 5_000, markupPct: 0.30, serviceType: "accounting" });
    expect(result.industryMarkupRange!.low).toBe(0.20);
    expect(result.industryMarkupRange!.mid).toBe(0.30);
    expect(result.industryMarkupRange!.high).toBe(0.40);
  });

  it("returns Technology & Reservations industry markup range", () => {
    const result = computeMarkupWaterfall({ vendorCost: 8_000, markupPct: 0.20, serviceType: "technology_reservations" });
    expect(result.industryMarkupRange).toBeTruthy();
    expect(result.industryMarkupRange!.low).toBe(0.10);
    expect(result.industryMarkupRange!.mid).toBe(0.20);
    expect(result.industryMarkupRange!.high).toBe(0.30);
  });

  it("resolves legacy 'it' alias in markup waterfall", () => {
    const result = computeMarkupWaterfall({ vendorCost: 8_000, markupPct: 0.20, serviceType: "it" });
    expect(result.industryMarkupRange).toBeTruthy();
    expect(result.industryMarkupRange!.low).toBe(0.10);
    expect(result.industryMarkupRange!.mid).toBe(0.20);
    expect(result.industryMarkupRange!.high).toBe(0.30);
  });
});
