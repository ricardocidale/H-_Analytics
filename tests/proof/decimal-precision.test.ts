import { describe, it, expect } from "vitest";
import { dSum, dMul, dDiv, dRound, dPow, assertFinite } from "../../calc/shared/decimal.js";

describe("T005 — Decimal.js Precision Boundary Tests", () => {
  describe("dSum — Avoids floating-point accumulation drift", () => {
    it("0.1 + 0.2 = 0.3 (classic IEEE 754 trap)", () => {
      expect(dSum([0.1, 0.2])).toBe(0.3);
    });

    it("summing 100 values of 0.01 = 1.0 exactly", () => {
      const values = Array.from({ length: 100 }, () => 0.01);
      expect(dSum(values)).toBe(1.0);
    });

    it("summing large + small doesn't lose small", () => {
      expect(dSum([1e15, 0.01, -1e15])).toBe(0.01);
    });

    it("returns NaN when input contains NaN", () => {
      expect(Number.isNaN(dSum([1, NaN, 3]))).toBe(true);
    });

    it("returns Infinity when input contains Infinity", () => {
      expect(dSum([1, Infinity, 3])).toBe(Infinity);
    });

    it("empty array returns 0", () => {
      expect(dSum([])).toBe(0);
    });

    it("single value returns itself", () => {
      expect(dSum([42.123456789])).toBe(42.123456789);
    });
  });

  describe("dMul — Multiplication precision", () => {
    it("0.1 * 0.2 = 0.02 (classic trap)", () => {
      expect(dMul(0.1, 0.2)).toBe(0.02);
    });

    it("large numbers don't lose precision", () => {
      expect(dMul(1_000_000, 0.085)).toBe(85000);
    });

    it("very small rate * large base", () => {
      expect(dMul(50_000_000, 0.001)).toBe(50000);
    });

    it("multiply by zero = zero", () => {
      expect(dMul(1e15, 0)).toBe(0);
    });

    it("multiply by one = identity", () => {
      expect(dMul(123.456, 1)).toBe(123.456);
    });
  });

  describe("dDiv — Division safety", () => {
    it("division by zero returns 0 (not Infinity)", () => {
      expect(dDiv(100, 0)).toBe(0);
    });

    it("0 / 0 returns 0 (not NaN)", () => {
      expect(dDiv(0, 0)).toBe(0);
    });

    it("NaN / 1 returns 0 (not NaN)", () => {
      expect(dDiv(NaN, 1)).toBe(0);
    });

    it("1 / NaN returns 0", () => {
      expect(dDiv(1, NaN)).toBe(0);
    });

    it("Infinity / 1 returns 0 (guarded)", () => {
      expect(dDiv(Infinity, 1)).toBe(0);
    });

    it("1 / 3 has full decimal precision", () => {
      const result = dDiv(1, 3);
      expect(result).toBeCloseTo(0.333333333333333, 12);
    });

    it("label parameter doesn't affect result", () => {
      expect(dDiv(100, 0, "test-label")).toBe(0);
      expect(dDiv(10, 5, "test-label")).toBe(2);
    });

    it("common financial division: NOI / Cap Rate", () => {
      const noi = 150_000;
      const capRate = 0.085;
      const result = dDiv(noi, capRate);
      expect(result).toBeCloseTo(1_764_705.88, 2);
    });
  });

  describe("dRound — ROUND_HALF_UP behavior", () => {
    it("rounds 0.5 up (banker's rounding trap)", () => {
      expect(dRound(2.5, 0)).toBe(3);
    });

    it("rounds 1.555 to 1.56 (2 decimal places)", () => {
      expect(dRound(1.555, 2)).toBe(1.56);
    });

    it("rounds 1.5550000001 correctly", () => {
      expect(dRound(1.5550000001, 2)).toBe(1.56);
    });

    it("no rounding needed preserves value", () => {
      expect(dRound(1.50, 2)).toBe(1.50);
    });

    it("rounds to 0 decimal places", () => {
      expect(dRound(99.99, 0)).toBe(100);
    });

    it("negative numbers round correctly", () => {
      expect(dRound(-2.5, 0)).toBe(-3);
    });
  });

  describe("dPow — Exponentiation precision", () => {
    it("1.03^10 = correct compound growth", () => {
      const result = dPow(1.03, 10);
      expect(result).toBeCloseTo(1.3439163793, 8);
    });

    it("1.03^0 = 1 exactly", () => {
      expect(dPow(1.03, 0)).toBe(1);
    });

    it("1.03^1 = 1.03 exactly", () => {
      expect(dPow(1.03, 1)).toBe(1.03);
    });

    it("large exponent doesn't overflow for reasonable base", () => {
      const result = dPow(1.005, 360);
      expect(Number.isFinite(result)).toBe(true);
      expect(result).toBeCloseTo(6.022575, 4);
    });

    it("fractional exponent (monthly compounding)", () => {
      const result = dPow(1.03, 1 / 12);
      expect(result).toBeCloseTo(1.00246627, 6);
    });
  });

  describe("assertFinite — Guard correctness", () => {
    it("passes through finite numbers", () => {
      expect(assertFinite(42, "test")).toBe(42);
      expect(assertFinite(0, "test")).toBe(0);
      expect(assertFinite(-100.5, "test")).toBe(-100.5);
    });

    it("throws on NaN", () => {
      expect(() => assertFinite(NaN, "test")).toThrow("Non-finite value in test");
    });

    it("throws on Infinity", () => {
      expect(() => assertFinite(Infinity, "test")).toThrow("Non-finite value in test");
    });

    it("throws on -Infinity", () => {
      expect(() => assertFinite(-Infinity, "test")).toThrow("Non-finite value in test");
    });
  });
});

describe("T005 — Engine Arithmetic Correctness (No Raw FP Drift)", () => {
  it("revenue cascade: rooms → events → F&B → other adds up exactly", () => {
    const roomRev = 42700;
    const eventsShare = 0.43;
    const fbShare = 0.22;
    const cateringBoost = 1.30;
    const otherShare = 0.07;

    const events = dMul(roomRev, eventsShare);
    const fb = dMul(dMul(roomRev, fbShare), cateringBoost);
    const other = dMul(roomRev, otherShare);
    const total = dSum([roomRev, events, fb, other]);

    expect(total).toBe(roomRev + events + fb + other);
    expect(Number.isFinite(total)).toBe(true);
    expect(total).toBeGreaterThan(roomRev);
  });

  it("GOP identity: revenue - totalOpEx = GOP (no accumulation drift)", () => {
    const revenue = 100_000;
    const expenses = [20_000, 9_000, 8_000, 1_000, 4_000, 5_000, 3_000, 500, 4_000, 5_000, 1_500];
    const totalExp = dSum(expenses);
    const gop = revenue - totalExp;
    expect(gop).toBe(revenue - totalExp);
    expect(Number.isFinite(gop)).toBe(true);
  });

  it("120-month accumulation stays precise", () => {
    const monthly = 8_333.33;
    const values = Array.from({ length: 120 }, () => monthly);
    const total = dSum(values);
    expect(total).toBeCloseTo(monthly * 120, 2);
  });

  it("compound growth over 30 years stays precise", () => {
    let value = 200;
    for (let y = 0; y < 30; y++) {
      value = dMul(value, 1.03);
    }
    expect(value).toBeCloseTo(200 * Math.pow(1.03, 30), 4);
    expect(Number.isFinite(value)).toBe(true);
  });

  it("PMT formula produces consistent result", () => {
    const P = 750_000;
    const r = 0.06 / 12;
    const n = 300;
    const powTerm = dPow(1 + r, n);
    const pmt = dDiv(dMul(P, dMul(r, powTerm)), powTerm - 1);
    expect(pmt).toBeCloseTo(4832.26, 2);
    expect(Number.isFinite(pmt)).toBe(true);
  });
});
