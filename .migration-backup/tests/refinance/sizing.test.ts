import { describe, it, expect } from "vitest";
import { computeSizing, resolvePropertyValue } from "../../calc/refinance/sizing.js";
import type { RoundingPolicy } from "../../domain/types/rounding.js";

const rounding: RoundingPolicy = { precision: 2, bankers_rounding: false };

describe("resolvePropertyValue", () => {
  it("returns direct value", () => {
    expect(
      resolvePropertyValue({ method: "direct", property_value_at_refi: 2_000_000 }),
    ).toBe(2_000_000);
  });

  it("derives value from NOI / cap rate", () => {
    expect(
      resolvePropertyValue({
        method: "noi_cap",
        stabilized_noi: 170_000,
        cap_rate: 0.085,
      }),
    ).toBeCloseTo(2_000_000, 0);
  });
});

describe("computeSizing — LTV only", () => {
  it("sizes loan by LTV when no DSCR", () => {
    const result = computeSizing(
      { method: "direct", property_value_at_refi: 2_000_000 },
      0.65,
      { rate_annual: 0.07, term_months: 300, amortization_months: 300, io_months: 0 },
      undefined,
      undefined,
      rounding,
    );
    expect(result.property_value).toBe(2_000_000);
    expect(result.max_loan_ltv).toBe(1_300_000);
    expect(result.max_loan_dscr).toBeNull();
    expect(result.final_loan_amount).toBe(1_300_000);
    expect(result.ltv_binding).toBe(true);
    expect(result.dscr_binding).toBe(false);
  });
});

describe("computeSizing — DSCR binding", () => {
  it("DSCR constraint reduces loan below LTV max", () => {
    // LTV max = 2M * 0.75 = 1,500,000
    // DSCR: k = r*(1+r)^n / ((1+r)^n-1) at r=0.07/12, n=300
    // max_loan_dscr = 100_000 / (12 * k * 1.25)
    const result = computeSizing(
      { method: "direct", property_value_at_refi: 2_000_000 },
      0.75,
      { rate_annual: 0.07, term_months: 300, amortization_months: 300, io_months: 0 },
      1.25,
      100_000,
      rounding,
    );

    expect(result.max_loan_ltv).toBe(1_500_000);
    expect(result.max_loan_dscr).not.toBeNull();
    expect(result.max_loan_dscr!).toBeLessThan(result.max_loan_ltv);
    expect(result.final_loan_amount).toBe(result.max_loan_dscr!);
    expect(result.dscr_binding).toBe(true);
    expect(result.ltv_binding).toBe(false);

    // Verify DSCR constraint holds: annual_ds = 12 * PMT(L, r, n)
    const r_monthly = 0.07 / 12;
    const factor = Math.pow(1 + r_monthly, 300);
    const k = (r_monthly * factor) / (factor - 1);
    const annual_ds = 12 * result.final_loan_amount * k;
    const dscr = 100_000 / annual_ds;
    expect(dscr).toBeGreaterThanOrEqual(1.25 - 0.01); // within rounding tolerance
  });

  it("DSCR not binding when NOI is high", () => {
    const result = computeSizing(
      { method: "direct", property_value_at_refi: 2_000_000 },
      0.65,
      { rate_annual: 0.07, term_months: 300, amortization_months: 300, io_months: 0 },
      1.10,
      200_000,
      rounding,
    );

    expect(result.max_loan_dscr).not.toBeNull();
    expect(result.max_loan_dscr!).toBeGreaterThan(result.max_loan_ltv);
    expect(result.final_loan_amount).toBe(result.max_loan_ltv);
    expect(result.ltv_binding).toBe(true);
    expect(result.dscr_binding).toBe(false);
  });
});

describe("computeSizing — NOI/cap valuation", () => {
  it("derives property value from NOI and cap rate", () => {
    const result = computeSizing(
      { method: "noi_cap", stabilized_noi: 170_000, cap_rate: 0.085 },
      0.65,
      { rate_annual: 0.07, term_months: 300, amortization_months: 300, io_months: 0 },
      undefined,
      undefined,
      rounding,
    );
    expect(result.property_value).toBe(2_000_000);
    expect(result.max_loan_ltv).toBe(1_300_000);
  });
});

describe("computeSizing — zero interest", () => {
  it("handles zero interest DSCR sizing", () => {
    const result = computeSizing(
      { method: "direct", property_value_at_refi: 2_000_000 },
      0.75,
      { rate_annual: 0, term_months: 300, amortization_months: 300, io_months: 0 },
      1.25,
      100_000,
      rounding,
    );
    // L <= noi * amort / (12 * dscr_min) = 100k * 300 / (12 * 1.25) = 2,000,000
    expect(result.max_loan_dscr).toBe(2_000_000);
    expect(result.max_loan_ltv).toBe(1_500_000);
    expect(result.ltv_binding).toBe(true);
  });
});
