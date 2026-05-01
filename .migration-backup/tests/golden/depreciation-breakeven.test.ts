import { describe, it, expect } from "vitest";
import { DEPRECIATION_YEARS } from "../../shared/constants.js";
import { computeDepreciationBasis } from "../../calc/research/depreciation-basis";
import { computeBreakEven } from "../../calc/analysis/break-even";

describe("Golden Depreciation Scenarios", () => {
  /**
   * Scenario 1: Standard Purchase
   * - Purchase Price: $2,000,000
   * - Land Value: 25% ($500,000)
   * - Building Value: $1,500,000
   * - Improvements: $0
   * - Depreciable Basis: $1,500,000
   * - Annual Depreciation: $1,500,000 / 39 = $38,461.54
   * - Monthly Depreciation: $38,461.54 / 12 = $3,205.13
   */
  it("should calculate standard depreciation correctly", () => {
    const result = computeDepreciationBasis({
      purchase_price: 2000000,
      land_value_pct: 0.25,
      building_improvements: 0,
    });

    expect(result.land_value_dollars).toBe(500000);
    expect(result.building_value).toBe(1500000);
    expect(result.depreciable_basis).toBe(1500000);
    expect(result.annual_depreciation).toBeCloseTo(1500000 / DEPRECIATION_YEARS, 2);
    expect(result.monthly_depreciation).toBeCloseTo(1500000 / DEPRECIATION_YEARS / 12, 2);
  });

  /**
   * Scenario 2: With Improvements
   * - Purchase Price: $1,000,000
   * - Land Value: 20% ($200,000)
   * - Building Value: $800,000
   * - Improvements: $200,000
   * - Depreciable Basis: $800,000 + $200,000 = $1,000,000
   * - Annual Depreciation: $1,000,000 / 39 = $25,641.03
   */
  it("should calculate depreciation with improvements correctly", () => {
    const result = computeDepreciationBasis({
      purchase_price: 1000000,
      land_value_pct: 0.20,
      building_improvements: 200000,
    });

    expect(result.land_value_dollars).toBe(200000);
    expect(result.building_value).toBe(800000);
    expect(result.depreciable_basis).toBe(1000000);
    expect(result.annual_depreciation).toBeCloseTo(1000000 / DEPRECIATION_YEARS, 2);
  });

  /**
   * Scenario 3: 100% Land (Edge Case)
   * - Purchase Price: $1,000,000
   * - Land Value: 100% ($1,000,000)
   * - Depreciable Basis: $0
   */
  it("should handle 100% land correctly", () => {
    const result = computeDepreciationBasis({
      purchase_price: 1000000,
      land_value_pct: 1.0,
      building_improvements: 0,
    });

    expect(result.depreciable_basis).toBe(0);
    expect(result.annual_depreciation).toBe(0);
    expect(result.monthly_depreciation).toBe(0);
  });

  /**
   * Scenario 4: Tax Shield Verification
   * - Annual Depreciation: $100,000
   * - Tax Shield at 25%: $25,000
   * - Tax Shield at 30%: $30,000
   */
  it("should calculate tax shields correctly", () => {
    const targetBasis = DEPRECIATION_YEARS * 100000;
    const result = computeDepreciationBasis({
      purchase_price: targetBasis / 0.8,
      land_value_pct: 0.2,
    });

    expect(result.depreciable_basis).toBe(targetBasis);
    expect(result.annual_depreciation).toBe(100000);
    expect(result.tax_shield_at_25pct).toBe(25000);
    expect(result.tax_shield_at_30pct).toBe(30000);
  });
});

describe("Golden Break-Even Scenarios", () => {
  /**
   * Scenario 1: Standard Hotel Break-Even
   * - 50 rooms, ADR=$200, Days=30.5
   * - Variable Cost: 45% (0.45)
   * - Fixed Costs: $80,000/mo
   * - Management Fee: 5% (0.05)
   * - FF&E Reserve: 4% (0.04)
   * - Contribution Margin = 1 - 0.45 - 0.05 - 0.04 = 0.46
   * - Revenue per Month at 100% Occ = 50 * 200 * 30.5 = 305,000
   * - Operating Break-Even Occ = 80,000 / (305,000 * 0.46) = 80,000 / 140,300 ≈ 0.570206
   */
  it("should calculate operating break-even correctly", () => {
    const result = computeBreakEven({
      room_count: 50,
      adr: 200,
      variable_cost_rate: 0.45,
      fixed_costs_monthly: 80000,
      management_fee_rate: 0.05,
      ffe_reserve_rate: 0.04,
      days_per_month: 30.5,
    });

    expect(result.operating_break_even.occupancy).toBeCloseTo(0.5702, 4);
    // RevPAR = ADR * Occ = 200 * 0.5702 = 114.04
    expect(result.operating_break_even.revpar).toBeCloseTo(114.04, 1);
  });

  /**
   * Scenario 2: With Debt Service (Cash Flow Break-Even)
   * - Same as above, but with $30,000/mo debt service
   * - Fixed Total = 80,000 + 30,000 = 110,000
   * - Cash Flow Break-Even Occ = 110,000 / (305,000 * 0.46) = 110,000 / 140,300 ≈ 0.784034
   */
  it("should calculate cash flow break-even correctly", () => {
    const result = computeBreakEven({
      room_count: 50,
      adr: 200,
      variable_cost_rate: 0.45,
      fixed_costs_monthly: 80000,
      management_fee_rate: 0.05,
      ffe_reserve_rate: 0.04,
      monthly_debt_service: 30000,
      days_per_month: 30.5,
    });

    expect(result.cash_flow_break_even.occupancy).toBeCloseTo(0.7840, 4);
  });

  /**
   * Scenario 3: With Ancillary Revenue
   * - Same as Scenario 1, but with 30% ancillary revenue
   * - Revenue per Month at 100% Occ = 305,000 * (1 + 0.30) = 396,500
   * - Operating Break-Even Occ = 80,000 / (396,500 * 0.46) = 80,000 / 182,390 ≈ 0.43862
   */
  it("should calculate break-even with ancillary revenue correctly", () => {
    const result = computeBreakEven({
      room_count: 50,
      adr: 200,
      variable_cost_rate: 0.45,
      fixed_costs_monthly: 80000,
      management_fee_rate: 0.05,
      ffe_reserve_rate: 0.04,
      ancillary_revenue_pct: 0.30,
      days_per_month: 30.5,
    });

    expect(result.operating_break_even.occupancy).toBeCloseTo(0.4386, 4);
  });

  /**
   * Scenario 4: Sensitivity
   * - ADR drop 10%: ADR = 180
   *   - Rev at 100% = 50 * 180 * 30.5 = 274,500
   *   - Fixed Total (inc debt) = 110,000
   *   - Occ = 110,000 / (274,500 * 0.46) = 110,000 / 126,270 ≈ 0.871149
   * - Fixed cost up 10%: Fixed = 80,000 * 1.1 = 88,000
   *   - Fixed Total (inc debt) = 88,000 + 30,000 = 118,000
   *   - Occ = 118,000 / (305,000 * 0.46) = 118,000 / 140,300 ≈ 0.841055
   */
  it("should calculate sensitivities correctly", () => {
    const result = computeBreakEven({
      room_count: 50,
      adr: 200,
      variable_cost_rate: 0.45,
      fixed_costs_monthly: 80000,
      management_fee_rate: 0.05,
      ffe_reserve_rate: 0.04,
      monthly_debt_service: 30000,
      days_per_month: 30.5,
    });

    expect(result.sensitivity.adr_drop_10pct_break_even).toBeCloseTo(0.8711, 4);
    expect(result.sensitivity.fixed_cost_up_10pct_break_even).toBeCloseTo(0.8411, 4);
  });

  /**
   * Scenario 5: Edge Case - Zero Rooms
   */
  it("should handle zero rooms correctly", () => {
    const result = computeBreakEven({
      room_count: 0,
      adr: 200,
      variable_cost_rate: 0.45,
      fixed_costs_monthly: 80000,
    });

    expect(result.operating_break_even.occupancy).toBe(1.0);
  });

  /**
   * Scenario 6: Edge Case - Contribution Margin <= 0
   * - Var Cost = 100%
   */
  it("should handle non-positive contribution margin correctly", () => {
    const result = computeBreakEven({
      room_count: 50,
      adr: 200,
      variable_cost_rate: 1.0,
      fixed_costs_monthly: 80000,
    });

    expect(result.operating_break_even.occupancy).toBe(1.0);
  });
});
