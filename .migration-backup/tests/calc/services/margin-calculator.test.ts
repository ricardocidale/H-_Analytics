import { describe, it, expect } from "vitest";
import {
  vendorCostFromFee,
  grossProfitFromFee,
  feeFromVendorCost,
  effectiveMargin,
} from "../../../calc/services/margin-calculator.js";

describe("Margin Calculator — Cost-Plus Markup Math", () => {
  describe("vendorCostFromFee", () => {
    it("20% markup: $1.20 fee => $1.00 vendor cost", () => {
      expect(vendorCostFromFee(1.20, 0.20)).toBeCloseTo(1.00, 10);
    });

    it("20% markup: $12,000 fee => $10,000 vendor cost", () => {
      expect(vendorCostFromFee(12_000, 0.20)).toBeCloseTo(10_000, 2);
    });

    it("0% markup: fee equals vendor cost", () => {
      expect(vendorCostFromFee(5_000, 0)).toBeCloseTo(5_000, 10);
    });

    it("50% markup: $15,000 fee => $10,000 vendor cost", () => {
      expect(vendorCostFromFee(15_000, 0.50)).toBeCloseTo(10_000, 2);
    });

    it("100% markup: $20,000 fee => $10,000 vendor cost", () => {
      expect(vendorCostFromFee(20_000, 1.0)).toBeCloseTo(10_000, 2);
    });

    it("zero fee returns zero", () => {
      expect(vendorCostFromFee(0, 0.20)).toBe(0);
    });

    it("throws on negative markup", () => {
      expect(() => vendorCostFromFee(100, -0.10)).toThrow("Markup cannot be negative");
    });
  });

  describe("grossProfitFromFee", () => {
    it("20% markup: $1.20 fee => $0.20 gross profit", () => {
      expect(grossProfitFromFee(1.20, 0.20)).toBeCloseTo(0.20, 10);
    });

    it("20% markup: $12,000 fee => $2,000 gross profit", () => {
      expect(grossProfitFromFee(12_000, 0.20)).toBeCloseTo(2_000, 2);
    });

    it("0% markup: zero gross profit", () => {
      expect(grossProfitFromFee(5_000, 0)).toBeCloseTo(0, 10);
    });

    it("grossProfit = fee - vendorCost identity", () => {
      const fee = 15_000;
      const markup = 0.25;
      const vendor = vendorCostFromFee(fee, markup);
      const profit = grossProfitFromFee(fee, markup);
      expect(vendor + profit).toBeCloseTo(fee, 10);
    });
  });

  describe("feeFromVendorCost (forward calculation)", () => {
    it("20% markup: $1.00 vendor cost => $1.20 fee", () => {
      expect(feeFromVendorCost(1.00, 0.20)).toBeCloseTo(1.20, 10);
    });

    it("round-trip: vendorCost -> fee -> vendorCost", () => {
      const originalVendor = 8_500;
      const markup = 0.15;
      const fee = feeFromVendorCost(originalVendor, markup);
      const derivedVendor = vendorCostFromFee(fee, markup);
      expect(derivedVendor).toBeCloseTo(originalVendor, 6);
    });

    it("throws on negative markup", () => {
      expect(() => feeFromVendorCost(100, -0.05)).toThrow("Markup cannot be negative");
    });
  });

  describe("effectiveMargin", () => {
    it("20% markup => 16.67% margin", () => {
      expect(effectiveMargin(0.20)).toBeCloseTo(0.20 / 1.20, 10);
      expect(effectiveMargin(0.20) * 100).toBeCloseTo(16.667, 2);
    });

    it("0% markup => 0% margin", () => {
      expect(effectiveMargin(0)).toBe(0);
    });

    it("100% markup => 50% margin", () => {
      expect(effectiveMargin(1.0)).toBeCloseTo(0.50, 10);
    });

    it("50% markup => 33.33% margin", () => {
      expect(effectiveMargin(0.50)).toBeCloseTo(1 / 3, 6);
    });

    it("throws on negative markup", () => {
      expect(() => effectiveMargin(-0.10)).toThrow("Markup cannot be negative");
    });
  });

  describe("algebraic identities", () => {
    const testCases = [
      { fee: 10_000, markup: 0.20 },
      { fee: 50_000, markup: 0.15 },
      { fee: 1_200, markup: 0.50 },
      { fee: 100_000, markup: 0.05 },
    ];

    for (const { fee, markup } of testCases) {
      it(`fee=${fee}, markup=${markup * 100}%: vendor + profit = fee`, () => {
        const vendor = vendorCostFromFee(fee, markup);
        const profit = grossProfitFromFee(fee, markup);
        expect(vendor + profit).toBeCloseTo(fee, 6);
      });

      it(`fee=${fee}, markup=${markup * 100}%: profit/fee = effectiveMargin`, () => {
        const profit = grossProfitFromFee(fee, markup);
        expect(profit / fee).toBeCloseTo(effectiveMargin(markup), 10);
      });

      it(`fee=${fee}, markup=${markup * 100}%: feeFromVendorCost(vendor, markup) = fee`, () => {
        const vendor = vendorCostFromFee(fee, markup);
        expect(feeFromVendorCost(vendor, markup)).toBeCloseTo(fee, 6);
      });
    }
  });
});
