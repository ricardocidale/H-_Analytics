import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { dSum, dMul, dDiv, dRound, dPow, assertFinite } from "../../calc/shared/decimal.js";
import { sumArray, sumField } from "../../calc/shared/utils.js";
import { pmt } from "../../calc/shared/pmt.js";
import { computeDCF } from "../../calc/returns/dcf-npv.js";

const TOLERANCE = 0.01;

describe("Precision Hardening — property-based tests", () => {
  describe("assertFinite", () => {
    it("throws on NaN", () => {
      expect(() => assertFinite(NaN, "test")).toThrow("Non-finite value in test");
    });

    it("throws on Infinity", () => {
      expect(() => assertFinite(Infinity, "test")).toThrow("Non-finite value in test");
    });

    it("throws on -Infinity", () => {
      expect(() => assertFinite(-Infinity, "test")).toThrow("Non-finite value in test");
    });

    it("passes through finite numbers", () => {
      fc.assert(
        fc.property(fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e12, max: 1e12 }), (n) => {
          expect(assertFinite(n, "prop")).toBe(n);
        }),
        { numRuns: 1000 },
      );
    });
  });

  describe("dSum — commutativity and accuracy", () => {
    it("sum is independent of order (commutative)", () => {
      fc.assert(
        fc.property(
          fc.array(fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e6, max: 1e6 }), { minLength: 2, maxLength: 50 }),
          (arr) => {
            const forward = dSum(arr);
            const reversed = dSum([...arr].reverse());
            expect(Math.abs(forward - reversed)).toBeLessThan(1e-10);
          },
        ),
        { numRuns: 1000 },
      );
    });

    it("matches naive reduce within tolerance for typical financial values", () => {
      fc.assert(
        fc.property(
          fc.array(fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e8, max: 1e8 }), { minLength: 1, maxLength: 100 }),
          (arr) => {
            const decimalResult = dSum(arr);
            const naiveResult = arr.reduce((s, v) => s + v, 0);
            expect(Math.abs(decimalResult - naiveResult)).toBeLessThan(1);
          },
        ),
        { numRuns: 1000 },
      );
    });
  });

  describe("dMul / dDiv — round-trip", () => {
    it("multiply then divide returns original (non-zero divisor)", () => {
      fc.assert(
        fc.property(
          fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e6, max: 1e6 }),
          fc.double({ noNaN: true, noDefaultInfinity: true, min: 0.001, max: 1e6 }),
          (a, b) => {
            const product = dMul(a, b);
            const result = dDiv(product, b);
            expect(Math.abs(result - a)).toBeLessThan(TOLERANCE);
          },
        ),
        { numRuns: 1000 },
      );
    });

    it("dDiv by zero returns 0", () => {
      expect(dDiv(100, 0)).toBe(0);
      expect(dDiv(-50, 0)).toBe(0);
    });
  });

  describe("dRound — rounding properties", () => {
    it("result has at most N decimal places", () => {
      fc.assert(
        fc.property(
          fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e8, max: 1e8 }),
          fc.integer({ min: 0, max: 6 }),
          (value, decimals) => {
            const rounded = dRound(value, decimals);
            const parts = String(rounded).split(".");
            const actualDecimals = parts.length > 1 ? parts[1].length : 0;
            expect(actualDecimals).toBeLessThanOrEqual(decimals);
          },
        ),
        { numRuns: 1000 },
      );
    });
  });

  describe("sumArray / sumField — wired through dSum", () => {
    it("sumField equivalent to sumArray of mapped values", () => {
      fc.assert(
        fc.property(
          fc.array(fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e6, max: 1e6 }), { minLength: 1, maxLength: 50 }),
          (arr) => {
            const items = arr.map((v) => ({ val: v }));
            const fieldResult = sumField(items, (x) => x.val);
            const arrayResult = sumArray(arr);
            expect(fieldResult).toBe(arrayResult);
          },
        ),
        { numRuns: 1000 },
      );
    });
  });

  describe("PMT — loan payment identity", () => {
    it("sum(interest) + sum(principal) == total payments for amortizing loan", () => {
      fc.assert(
        fc.property(
          fc.double({ noNaN: true, noDefaultInfinity: true, min: 10_000, max: 10_000_000 }),
          fc.double({ noNaN: true, noDefaultInfinity: true, min: 0.001, max: 0.15 }),
          fc.integer({ min: 12, max: 360 }),
          (principal, annualRate, months) => {
            const monthlyRate = annualRate / 12;
            const payment = pmt(principal, monthlyRate, months);

            if (!Number.isFinite(payment) || payment <= 0) return;

            let balance = principal;
            let totalInterest = 0;
            let totalPrincipal = 0;

            for (let m = 0; m < months; m++) {
              const interest = balance * monthlyRate;
              const princ = payment - interest;
              totalInterest += interest;
              totalPrincipal += princ;
              balance -= princ;
            }

            const totalPayments = payment * months;
            expect(Math.abs(totalInterest + totalPrincipal - totalPayments)).toBeLessThan(TOLERANCE);
            expect(Math.abs(balance)).toBeLessThan(TOLERANCE);
          },
        ),
        { numRuns: 500 },
      );
    });
  });

  describe("DCF NPV — discount rate identity", () => {
    it("NPV at 0% discount rate equals sum of cash flows", () => {
      fc.assert(
        fc.property(
          fc.array(fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e6, max: 1e6 }), { minLength: 2, maxLength: 20 }),
          (cashFlows) => {
            const result = computeDCF({
              cash_flows: cashFlows,
              discount_rate: 0,
            });
            const naiveSum = dSum(cashFlows);
            expect(Math.abs(result.npv - dRound(naiveSum, 2))).toBeLessThan(TOLERANCE);
          },
        ),
        { numRuns: 500 },
      );
    });

    it("NPV decreases as discount rate increases for positive cash flows", () => {
      fc.assert(
        fc.property(
          fc.array(fc.double({ noNaN: true, noDefaultInfinity: true, min: 100, max: 1e6 }), { minLength: 3, maxLength: 15 }),
          (cashFlows) => {
            const low = computeDCF({ cash_flows: cashFlows, discount_rate: 0.05 });
            const high = computeDCF({ cash_flows: cashFlows, discount_rate: 0.15 });
            expect(low.npv).toBeGreaterThanOrEqual(high.npv - TOLERANCE);
          },
        ),
        { numRuns: 500 },
      );
    });
  });

  describe("dPow — power properties", () => {
    it("dPow(x, 0) == 1 for any non-zero x", () => {
      fc.assert(
        fc.property(
          fc.double({ noNaN: true, noDefaultInfinity: true, min: 0.01, max: 1e6 }),
          (x) => {
            expect(dPow(x, 0)).toBe(1);
          },
        ),
        { numRuns: 500 },
      );
    });

    it("dPow(x, 1) == x", () => {
      fc.assert(
        fc.property(
          fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e6, max: 1e6 }),
          (x) => {
            expect(Math.abs(dPow(x, 1) - x)).toBeLessThan(1e-10);
          },
        ),
        { numRuns: 500 },
      );
    });
  });
});
