import { describe, it, expect } from "vitest";
import { computeCapexReserve } from "../../calc/analysis/capex-reserve.js";
import type { CapexReserveInput } from "../../calc/analysis/capex-reserve.js";
import {
  DEFAULT_COST_RATE_FFE,
  CAPEX_INDUSTRY_BENCHMARK_PER_KEY,
  CAPEX_SOFT_GOODS_PER_KEY,
  CAPEX_CASE_GOODS_PER_KEY,
  CAPEX_HVAC_PER_KEY,
  CAPEX_TECH_PER_KEY,
  CAPEX_ELEVATOR_MECHANICAL_COST,
  CAPEX_ROOF_EXTERIOR_COST,
  CAPEX_FB_EQUIPMENT_COST,
  CAPEX_SPA_EQUIPMENT_COST,
} from "../../shared/constants.js";

const rounding = { precision: 2, bankers_rounding: false };

function makeInput(overrides: Partial<CapexReserveInput> = {}): CapexReserveInput {
  return {
    room_count: 30,
    annual_revenue: 2000000,
    hold_period_years: 7,
    rounding_policy: rounding,
    ...overrides,
  };
}

describe("CapEx Reserve Calculator", () => {
  it("uses default FFE rate from constants", () => {
    const result = computeCapexReserve(makeInput());
    expect(result.annual_reserve_rate).toBe(DEFAULT_COST_RATE_FFE);
    expect(result.annual_reserve_rate).toBe(0.04);
  });

  it("computes annual reserve amount", () => {
    const result = computeCapexReserve(makeInput());
    expect(result.annual_reserve_amount).toBe(80000);
  });

  it("computes reserve per key per year", () => {
    const result = computeCapexReserve(makeInput());
    expect(result.reserve_per_key_per_year).toBeCloseTo(2666.67, 0);
  });

  it("projects yearly reserve balances", () => {
    const result = computeCapexReserve(makeInput());
    expect(result.yearly_projections.length).toBe(7);
    for (const proj of result.yearly_projections) {
      expect(proj.year).toBeGreaterThan(0);
      expect(proj.reserve_contribution).toBeGreaterThan(0);
    }
  });

  it("revenue grows each year", () => {
    const result = computeCapexReserve(makeInput());
    const revenues = result.yearly_projections.map(p => p.revenue);
    for (let i = 1; i < revenues.length; i++) {
      expect(revenues[i]).toBeGreaterThan(revenues[i - 1]);
    }
  });

  it("generates default capex categories for hotel", () => {
    const result = computeCapexReserve(makeInput());
    expect(result.category_status.length).toBeGreaterThan(0);
    const labels = result.category_status.map(c => c.label);
    expect(labels).toContain("Soft Goods (bedding, drapes, carpet)");
    expect(labels).toContain("HVAC Systems");
    expect(labels).toContain("Spa/Wellness Equipment");
  });

  it("tracks replacement years for aging equipment", () => {
    const result = computeCapexReserve(makeInput());
    const softGoods = result.category_status.find(c => c.label.includes("Soft Goods"));
    expect(softGoods).toBeDefined();
    expect(softGoods!.remaining_life).toBe(3);
    expect(softGoods!.replacement_year).toBe(3);
  });

  it("inflates replacement costs", () => {
    const result = computeCapexReserve(makeInput());
    for (const cat of result.category_status) {
      expect(cat.inflated_replacement_cost).toBeGreaterThanOrEqual(cat.replacement_cost);
    }
  });

  it("computes total contributions and replacements", () => {
    const result = computeCapexReserve(makeInput());
    expect(result.total_contributions_over_hold).toBeGreaterThan(0);
    expect(result.total_replacements_over_hold).toBeGreaterThanOrEqual(0);
  });

  it("assesses underfunding risk", () => {
    const result = computeCapexReserve(makeInput());
    expect(["adequate", "marginal", "underfunded", "critical"]).toContain(result.underfunding_risk);
  });

  it("provides minimum recommended rate", () => {
    const result = computeCapexReserve(makeInput());
    expect(result.minimum_recommended_rate).toBeGreaterThan(0);
  });

  it("industry benchmark is $5,000 per key (from shared constants)", () => {
    const result = computeCapexReserve(makeInput());
    expect(result.industry_benchmark_per_key).toBe(CAPEX_INDUSTRY_BENCHMARK_PER_KEY);
    expect(result.industry_benchmark_per_key).toBe(5000);
  });

  it("default categories use shared constants for costs", () => {
    const result = computeCapexReserve(makeInput());
    const roomCount = 30;
    const softGoods = result.category_status.find(c => c.label.includes("Soft Goods"))!;
    expect(softGoods.replacement_cost).toBe(roomCount * CAPEX_SOFT_GOODS_PER_KEY);
    const caseGoods = result.category_status.find(c => c.label.includes("Case Goods"))!;
    expect(caseGoods.replacement_cost).toBe(roomCount * CAPEX_CASE_GOODS_PER_KEY);
    const hvac = result.category_status.find(c => c.label.includes("HVAC"))!;
    expect(hvac.replacement_cost).toBe(roomCount * CAPEX_HVAC_PER_KEY);
    const tech = result.category_status.find(c => c.label.includes("Technology"))!;
    expect(tech.replacement_cost).toBe(roomCount * CAPEX_TECH_PER_KEY);
    const elevator = result.category_status.find(c => c.label.includes("Elevator"))!;
    expect(elevator.replacement_cost).toBe(CAPEX_ELEVATOR_MECHANICAL_COST);
    const roof = result.category_status.find(c => c.label.includes("Roof"))!;
    expect(roof.replacement_cost).toBe(CAPEX_ROOF_EXTERIOR_COST);
    const fb = result.category_status.find(c => c.label.includes("F&B"))!;
    expect(fb.replacement_cost).toBe(CAPEX_FB_EQUIPMENT_COST);
    const spa = result.category_status.find(c => c.label.includes("Spa"))!;
    expect(spa.replacement_cost).toBe(CAPEX_SPA_EQUIPMENT_COST);
  });

  it("supports custom categories", () => {
    const result = computeCapexReserve(makeInput({
      capex_categories: [
        { label: "Pool Renovation", useful_life_years: 10, replacement_cost: 200000, age_years: 8 },
      ],
    }));
    expect(result.category_status.length).toBe(1);
    expect(result.category_status[0].label).toBe("Pool Renovation");
    expect(result.category_status[0].replacement_year).toBe(2);
  });

  it("handles custom reserve rate", () => {
    const result = computeCapexReserve(makeInput({ ffe_reserve_rate: 0.05 }));
    expect(result.annual_reserve_rate).toBe(0.05);
    expect(result.annual_reserve_amount).toBe(100000);
  });

  it("replacement items show in yearly projections", () => {
    const result = computeCapexReserve(makeInput());
    const yearsWithReplacements = result.yearly_projections.filter(p => p.replacement_items.length > 0);
    expect(yearsWithReplacements.length).toBeGreaterThan(0);
  });
});
