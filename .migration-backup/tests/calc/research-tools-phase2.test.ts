import { describe, it, expect } from "vitest";
import { computeOccupancyRamp } from "../../calc/research/occupancy-ramp";
import { computeADRProjection } from "../../calc/research/adr-projection";
import { computeCapRateValuation } from "../../calc/research/cap-rate-valuation";
import { computeCostBenchmarks } from "../../calc/research/cost-benchmarks";
import { executeComputationTool } from "../../calc/dispatch";

describe("computeOccupancyRamp", () => {
  it("ramps from 55% to 85% in steps", () => {
    const result = computeOccupancyRamp({
      start_occupancy: 0.55,
      max_occupancy: 0.85,
      ramp_months: 6,
      growth_step: 0.05,
      stabilization_months: 36,
    });
    expect(result.stabilized_occupancy).toBe(0.85);
    expect(result.months_to_stabilize).toBeGreaterThan(0);
    expect(result.stages.length).toBeGreaterThan(0);
    expect(result.stages[0].occupancy).toBe(0.55);
  });

  it("includes RevPAR when ADR provided", () => {
    const result = computeOccupancyRamp({
      start_occupancy: 0.55,
      max_occupancy: 0.85,
      ramp_months: 6,
      growth_step: 0.05,
      stabilization_months: 36,
      adr: 330,
    });
    expect(result.stages[0].revpar).toBeCloseTo(330 * 0.55, 0);
  });

  it("includes room revenue when room_count provided", () => {
    const result = computeOccupancyRamp({
      start_occupancy: 0.55,
      max_occupancy: 0.85,
      ramp_months: 6,
      growth_step: 0.05,
      stabilization_months: 36,
      adr: 330,
      room_count: 20,
    });
    expect(result.stages[0].monthly_room_revenue).toBeGreaterThan(0);
  });

  it("produces yearly averages", () => {
    const result = computeOccupancyRamp({
      start_occupancy: 0.55,
      max_occupancy: 0.85,
      ramp_months: 6,
      growth_step: 0.05,
      stabilization_months: 36,
    });
    expect(result.yearly_avg_occupancy.length).toBeGreaterThan(0);
    expect(result.yearly_avg_occupancy[0].year).toBe(1);
  });

  it("handles already-stabilized occupancy", () => {
    const result = computeOccupancyRamp({
      start_occupancy: 0.85,
      max_occupancy: 0.85,
      ramp_months: 6,
      growth_step: 0.05,
      stabilization_months: 36,
    });
    expect(result.months_to_stabilize).toBe(1);
  });
});

describe("computeADRProjection", () => {
  it("projects ADR growth over 10 years", () => {
    const result = computeADRProjection({
      start_adr: 330,
      growth_rate: 0.03,
      projection_years: 10,
    });
    expect(result.projections.length).toBe(10);
    expect(result.end_adr).toBeGreaterThan(330);
    expect(result.start_adr).toBe(330);
  });

  it("compounds growth correctly", () => {
    const result = computeADRProjection({
      start_adr: 100,
      growth_rate: 0.10,
      projection_years: 1,
    });
    expect(result.projections[0].adr).toBeCloseTo(110, 0);
  });

  it("adds inflation to growth", () => {
    const withInflation = computeADRProjection({
      start_adr: 330,
      growth_rate: 0.03,
      inflation_rate: 0.02,
      projection_years: 5,
    });
    const withoutInflation = computeADRProjection({
      start_adr: 330,
      growth_rate: 0.03,
      projection_years: 5,
    });
    expect(withInflation.end_adr).toBeGreaterThan(withoutInflation.end_adr);
  });

  it("includes RevPAR when occupancy provided", () => {
    const result = computeADRProjection({
      start_adr: 330,
      growth_rate: 0.03,
      projection_years: 5,
      occupancy: 0.85,
    });
    expect(result.projections[0].revpar).toBeDefined();
    expect(result.projections[0].revpar).toBeGreaterThan(0);
  });

  it("includes room revenue when both occupancy and room_count provided", () => {
    const result = computeADRProjection({
      start_adr: 330,
      growth_rate: 0.03,
      projection_years: 5,
      occupancy: 0.85,
      room_count: 20,
    });
    expect(result.projections[0].annual_room_revenue).toBeGreaterThan(0);
  });
});

describe("computeCapRateValuation", () => {
  it("computes implied value from NOI and cap rate", () => {
    const result = computeCapRateValuation({
      annual_noi: 850000,
      cap_rate: 0.085,
    });
    expect(result.implied_value).toBe(10000000);
    expect(result.cap_rate_pct).toBe("8.5%");
  });

  it("produces sensitivity table", () => {
    const result = computeCapRateValuation({
      annual_noi: 850000,
      cap_rate: 0.085,
    });
    expect(result.sensitivity.length).toBe(9); // 4 below + base + 4 above
    const baseRow = result.sensitivity.find(r => r.cap_rate === 0.09);
    expect(baseRow).toBeDefined();
  });

  it("computes spread when purchase_price provided", () => {
    const result = computeCapRateValuation({
      annual_noi: 850000,
      cap_rate: 0.085,
      purchase_price: 9000000,
    });
    expect(result.spread_to_purchase).toBe(1000000);
  });

  it("throws on zero cap rate", () => {
    expect(() => computeCapRateValuation({
      annual_noi: 850000,
      cap_rate: 0,
    })).toThrow("must be positive");
  });

  it("respects custom sensitivity steps", () => {
    const result = computeCapRateValuation({
      annual_noi: 850000,
      cap_rate: 0.085,
      sensitivity_steps: 2,
    });
    expect(result.sensitivity.length).toBe(5); // 2 below + base + 2 above
  });
});

describe("computeCostBenchmarks", () => {
  it("converts rates to dollar amounts", () => {
    const result = computeCostBenchmarks({
      annual_room_revenue: 2000000,
      annual_total_revenue: 3000000,
      purchase_price: 10000000,
    });
    expect(result.department_costs.length).toBe(2);
    expect(result.undistributed_costs.length).toBe(7);
    expect(result.property_value_costs.length).toBe(2); // Property Taxes + Insurance
    expect(result.total_operating_costs).toBeGreaterThan(0);
  });

  it("rooms cost uses room revenue base", () => {
    const result = computeCostBenchmarks({
      annual_room_revenue: 2000000,
      annual_total_revenue: 3000000,
      cost_rate_rooms: 0.36,
    });
    const roomsCost = result.department_costs.find(c => c.category === "Rooms");
    expect(roomsCost?.annual_amount).toBeCloseTo(720000, 0);
    expect(roomsCost?.base).toBe("Room Revenue");
  });

  it("admin cost uses total revenue base", () => {
    const result = computeCostBenchmarks({
      annual_room_revenue: 2000000,
      annual_total_revenue: 3000000,
      cost_rate_admin: 0.08,
    });
    const adminCost = result.undistributed_costs.find(c => c.category === "Admin & General");
    expect(adminCost?.annual_amount).toBeCloseTo(240000, 0);
    expect(adminCost?.base).toBe("Total Revenue");
  });

  it("property taxes use property value base", () => {
    const result = computeCostBenchmarks({
      annual_room_revenue: 2000000,
      annual_total_revenue: 3000000,
      purchase_price: 10000000,
      cost_rate_taxes: 0.02,
    });
    const taxes = result.property_value_costs.find(c => c.category === "Property Taxes");
    expect(taxes?.annual_amount).toBeCloseTo(200000, 0);
    expect(taxes?.base).toBe("Property Value");
  });

  it("computes operating cost ratio", () => {
    const result = computeCostBenchmarks({
      annual_room_revenue: 2000000,
      annual_total_revenue: 3000000,
    });
    expect(result.operating_cost_ratio).toMatch(/%$/);
  });
});

describe("dispatch integration", () => {
  it("dispatches compute_occupancy_ramp", () => {
    const result = executeComputationTool("compute_occupancy_ramp", {
      start_occupancy: 0.55, max_occupancy: 0.85, ramp_months: 6, growth_step: 0.05, stabilization_months: 36,
    });
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed.stabilized_occupancy).toBe(0.85);
  });

  it("dispatches compute_adr_projection", () => {
    const result = executeComputationTool("compute_adr_projection", {
      start_adr: 330, growth_rate: 0.03, projection_years: 5,
    });
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed.projections.length).toBe(5);
  });

  it("dispatches compute_cap_rate_valuation", () => {
    const result = executeComputationTool("compute_cap_rate_valuation", {
      annual_noi: 850000, cap_rate: 0.085,
    });
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed.implied_value).toBe(10000000);
  });

  it("dispatches compute_cost_benchmarks", () => {
    const result = executeComputationTool("compute_cost_benchmarks", {
      annual_room_revenue: 2000000, annual_total_revenue: 3000000,
    });
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed.total_operating_costs).toBeGreaterThan(0);
  });
});
