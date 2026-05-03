import { describe, it, expect } from "vitest";
import { pmt, ioPayment } from "./pmt.js";

describe("pmt() — fixed-rate amortizing payment", () => {
  it("matches Excel PMT for a 30-year mortgage at 6% APR", () => {
    // Excel: PMT(0.06/12, 360, -200000) = $1,199.10
    const monthly = pmt(200_000, 0.06 / 12, 360);
    expect(monthly).toBeCloseTo(1199.1, 1);
  });

  it("matches Excel PMT for a 15-year mortgage at 5% APR", () => {
    // Excel: PMT(0.05/12, 180, -300000) = $2,372.38
    const monthly = pmt(300_000, 0.05 / 12, 180);
    expect(monthly).toBeCloseTo(2372.38, 1);
  });

  it("falls back to simple division when rate is zero", () => {
    expect(pmt(120_000, 0, 120)).toBeCloseTo(1000, 6);
  });

  it("returns 0 when principal is 0", () => {
    expect(pmt(0, 0.05 / 12, 360)).toBe(0);
  });

  it("returns 0 when totalPayments is 0", () => {
    expect(pmt(100_000, 0.05 / 12, 0)).toBe(0);
  });

  it("amortizes to (approximately) zero balance over the full term", () => {
    // Round-trip: starting from a balance, applying N monthly payments at rate r,
    // each time accruing interest then deducting payment, should leave ~0.
    const principal = 250_000;
    const annualRate = 0.065;
    const monthlyRate = annualRate / 12;
    const n = 360;
    const payment = pmt(principal, monthlyRate, n);

    let balance = principal;
    for (let i = 0; i < n; i++) {
      const interest = balance * monthlyRate;
      const principalPaid = payment - interest;
      balance -= principalPaid;
    }
    // Allow $1 of rounding drift over 360 periods.
    expect(Math.abs(balance)).toBeLessThan(1);
  });
});

describe("ioPayment() — interest-only payment", () => {
  it("returns balance × monthlyRate", () => {
    expect(ioPayment(1_000_000, 0.06 / 12)).toBeCloseTo(5000, 6);
  });

  it("returns 0 for zero balance", () => {
    expect(ioPayment(0, 0.06 / 12)).toBe(0);
  });
});
