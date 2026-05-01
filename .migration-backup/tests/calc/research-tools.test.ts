import { describe, it, expect } from "vitest";
import { computePropertyMetrics } from "../../calc/research/property-metrics";
import { computeDepreciationBasis } from "../../calc/research/depreciation-basis";
import { computeDebtCapacity } from "../../calc/research/debt-capacity";
import { DEPRECIATION_YEARS } from "../../shared/constants.js";

describe("Research Deterministic Tools", () => {
  describe("computePropertyMetrics", () => {
    it("computes RevPAR correctly", () => {
      const result = computePropertyMetrics({ room_count: 20, adr: 330, occupancy: 0.70 });
      expect(result.revpar).toBe(231);
    });

    it("computes monthly room revenue = rooms * ADR * occ * 30.5", () => {
      const result = computePropertyMetrics({ room_count: 20, adr: 330, occupancy: 0.70 });
      // 20 * 330 * 0.70 * 30.5 = 140,910
      expect(result.monthly_room_revenue).toBe(140910);
    });

    it("computes annual room revenue = monthly * 12", () => {
      const result = computePropertyMetrics({ room_count: 20, adr: 330, occupancy: 0.70 });
      expect(result.annual_room_revenue).toBe(140910 * 12);
    });

    it("includes all revenue streams in total", () => {
      const result = computePropertyMetrics({ room_count: 20, adr: 330, occupancy: 0.70 });
      const { rooms, events, fb, other } = result.revenue_breakdown;
      expect(rooms + events + fb + other).toBeCloseTo(result.annual_total_revenue, -1);
    });

    it("NOI margin is between 0 and 100% for reasonable inputs", () => {
      const result = computePropertyMetrics({ room_count: 20, adr: 330, occupancy: 0.70 });
      expect(result.noi_margin_pct).toBeGreaterThan(0);
      expect(result.noi_margin_pct).toBeLessThan(100);
    });

    it("GOP margin > NOI margin (undistributed costs reduce NOI)", () => {
      const result = computePropertyMetrics({ room_count: 20, adr: 330, occupancy: 0.70 });
      expect(result.gop_margin_pct).toBeGreaterThan(result.noi_margin_pct);
    });

    it("uses custom cost rates when provided", () => {
      const base = computePropertyMetrics({ room_count: 20, adr: 330, occupancy: 0.70 });
      const expensive = computePropertyMetrics({
        room_count: 20, adr: 330, occupancy: 0.70,
        cost_rate_rooms: 0.50, cost_rate_admin: 0.15,
      });
      expect(expensive.noi_margin_pct).toBeLessThan(base.noi_margin_pct);
    });

    it("revenue_per_room = annual total / room count", () => {
      const result = computePropertyMetrics({ room_count: 20, adr: 330, occupancy: 0.70 });
      expect(result.revenue_per_room).toBeCloseTo(result.annual_total_revenue / 20, 0);
    });

    it("handles zero occupancy gracefully", () => {
      const result = computePropertyMetrics({ room_count: 20, adr: 330, occupancy: 0 });
      expect(result.revpar).toBe(0);
      expect(result.monthly_room_revenue).toBe(0);
      expect(result.annual_total_revenue).toBe(0);
      expect(result.noi_margin_pct).toBe(0);
    });
  });

  describe("computeDepreciationBasis", () => {
    it("computes land value in dollars", () => {
      const result = computeDepreciationBasis({ purchase_price: 2_300_000, land_value_pct: 0.20 });
      expect(result.land_value_dollars).toBe(460_000);
    });

    it("depreciable basis = building value + improvements", () => {
      const result = computeDepreciationBasis({
        purchase_price: 2_300_000,
        land_value_pct: 0.20,
        building_improvements: 200_000,
      });
      expect(result.depreciable_basis).toBe(1_840_000 + 200_000);
    });

    it("annual depreciation = basis / DEPRECIATION_YEARS", () => {
      const result = computeDepreciationBasis({ purchase_price: 2_300_000, land_value_pct: 0.20 });
      const expected = 1_840_000 / DEPRECIATION_YEARS;
      expect(result.annual_depreciation).toBeCloseTo(expected, 0);
    });

    it("monthly depreciation = annual / 12", () => {
      const result = computeDepreciationBasis({ purchase_price: 2_300_000, land_value_pct: 0.20 });
      expect(result.monthly_depreciation).toBeCloseTo(result.annual_depreciation / 12, 0);
    });

    it("higher land % means less depreciation", () => {
      const low = computeDepreciationBasis({ purchase_price: 2_300_000, land_value_pct: 0.15 });
      const high = computeDepreciationBasis({ purchase_price: 2_300_000, land_value_pct: 0.35 });
      expect(high.annual_depreciation).toBeLessThan(low.annual_depreciation);
    });

    it("tax shield = depreciation * tax rate", () => {
      const result = computeDepreciationBasis({ purchase_price: 2_300_000, land_value_pct: 0.20 });
      expect(result.tax_shield_at_25pct).toBeCloseTo(result.annual_depreciation * 0.25, 0);
      expect(result.tax_shield_at_30pct).toBeCloseTo(result.annual_depreciation * 0.30, 0);
    });

    it("uses IRS depreciation period", () => {
      const result = computeDepreciationBasis({ purchase_price: 2_300_000, land_value_pct: 0.20 });
      expect(result.depreciation_years).toBe(DEPRECIATION_YEARS);
    });
  });

  describe("computeDebtCapacity", () => {
    it("max annual debt service = NOI / DSCR", () => {
      const result = computeDebtCapacity({
        annual_noi: 500_000,
        dscr_target: 1.25,
        interest_rate: 0.065,
        term_years: 25,
      });
      expect(result.max_annual_debt_service).toBe(400_000);
    });

    it("max loan reverse-solves PMT correctly", () => {
      const result = computeDebtCapacity({
        annual_noi: 500_000,
        dscr_target: 1.25,
        interest_rate: 0.065,
        term_years: 25,
      });
      // Verify: PMT(maxLoan, 0.065/12, 300) should ≈ max_monthly_payment
      const r = 0.065 / 12;
      const n = 300;
      const factor = Math.pow(1 + r, n);
      const calculatedPMT = (result.max_loan_amount * r * factor) / (factor - 1);
      expect(calculatedPMT).toBeCloseTo(result.max_monthly_payment, 0);
    });

    it("computes implied LTV when property value provided", () => {
      const result = computeDebtCapacity({
        annual_noi: 500_000,
        dscr_target: 1.25,
        interest_rate: 0.065,
        term_years: 25,
        property_value: 5_000_000,
      });
      expect(result.implied_ltv_pct).toBeDefined();
      expect(result.implied_ltv_pct!).toBeGreaterThan(0);
      expect(result.implied_ltv_pct!).toBeLessThan(100);
    });

    it("returns null LTV when no property value", () => {
      const result = computeDebtCapacity({
        annual_noi: 500_000,
        dscr_target: 1.25,
        interest_rate: 0.065,
        term_years: 25,
      });
      expect(result.implied_ltv_pct).toBeNull();
    });

    it("higher DSCR means lower max loan", () => {
      const conservative = computeDebtCapacity({
        annual_noi: 500_000, dscr_target: 1.50, interest_rate: 0.065, term_years: 25,
      });
      const aggressive = computeDebtCapacity({
        annual_noi: 500_000, dscr_target: 1.10, interest_rate: 0.065, term_years: 25,
      });
      expect(conservative.max_loan_amount).toBeLessThan(aggressive.max_loan_amount);
    });

    it("higher interest rate means lower max loan", () => {
      const low = computeDebtCapacity({
        annual_noi: 500_000, dscr_target: 1.25, interest_rate: 0.05, term_years: 25,
      });
      const high = computeDebtCapacity({
        annual_noi: 500_000, dscr_target: 1.25, interest_rate: 0.09, term_years: 25,
      });
      expect(high.max_loan_amount).toBeLessThan(low.max_loan_amount);
    });

    it("handles zero interest rate", () => {
      const result = computeDebtCapacity({
        annual_noi: 500_000, dscr_target: 1.25, interest_rate: 0, term_years: 25,
      });
      // maxMonthly * 300 payments
      expect(result.max_loan_amount).toBeCloseTo(result.max_monthly_payment * 300, 0);
    });
  });
});
