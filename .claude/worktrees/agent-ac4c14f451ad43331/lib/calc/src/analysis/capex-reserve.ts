/**
 * calc/analysis/capex-reserve.ts — Capital Expenditure (CapEx) reserve adequacy analysis.
 *
 * PURPOSE:
 * Projects whether a hotel's FF&E (Furniture, Fixtures & Equipment) reserve fund
 * is adequately funded to cover planned capital replacements over the hold period.
 * Under-reserving for CapEx is one of the most common investor mistakes in hotel
 * acquisitions — this module quantifies that risk.
 *
 * HOW FF&E RESERVES WORK IN HOSPITALITY:
 * Hotels set aside a percentage of gross revenue (typically 3–5%) each year into
 * a reserve fund. This fund pays for cyclical replacements:
 *   - Soft Goods (bedding, carpet, drapes): every 5 years
 *   - Case Goods (furniture): every 10 years
 *   - HVAC Systems: every 15 years
 *   - Roof & Exterior: every 20 years
 *   - Technology/PMS: every 5 years
 *   - F&B and Spa Equipment: every 7–8 years
 *
 * The module tracks each category's age, remaining useful life, and inflation-
 * adjusted replacement cost. When an item's remaining life expires during the
 * hold period, its replacement cost is deducted from the reserve fund.
 *
 * KEY OUTPUTS:
 *   - yearly_projections: Year-by-year reserve balance with contributions and withdrawals.
 *   - underfunding_risk: "adequate" (≥100% funded), "marginal" (75–99%),
 *     "underfunded" (50–74%), "critical" (<50%).
 *   - minimum_recommended_rate: The FF&E reserve rate needed to fully fund all
 *     categories based on their replacement schedules.
 *   - industry_benchmark_per_key: $5,000/key/year, a widely-used industry benchmark
 *     for full-service hotels.
 *   - reserve_per_key: Current reserve balance per room, for benchmarking.
 *
 * GAAP NOTE (ASC 360 — Property, Plant, and Equipment):
 * FF&E reserves are not recognized on the GAAP balance sheet as a separate asset.
 * The reserve is an internal management tool. Actual CapEx is capitalized on the
 * balance sheet and depreciated over the asset's useful life.
 *
 * HOW IT FITS THE SYSTEM:
 * Called via the dispatch layer as the "capex_reserve" skill. The output informs
 * the property analysis dashboard and feeds into the hold-vs-sell decision
 * (underfunded CapEx reduces the property's attractiveness for continued holding).
 */
import type { RoundingPolicy } from "@domain/types/rounding";
import { roundTo } from "@domain/types/rounding";
import { rounder, RATIO_ROUNDING, sumArray } from "../shared/utils.js";
import { getFactoryNumber } from "@shared/model-constants-registry";
import {
  DEFAULT_COST_RATE_FFE,
  CAPEX_ELEVATOR_MECHANICAL_COST,
  CAPEX_ROOF_EXTERIOR_COST,
  CAPEX_FB_EQUIPMENT_COST,
  CAPEX_SPA_EQUIPMENT_COST,
  CAPEX_SOFT_GOODS_PER_KEY,
  CAPEX_CASE_GOODS_PER_KEY,
  CAPEX_HVAC_PER_KEY,
  CAPEX_TECH_PER_KEY,
  CAPEX_SOFT_GOODS_LIFE_YEARS,
  CAPEX_CASE_GOODS_LIFE_YEARS,
  CAPEX_HVAC_LIFE_YEARS,
  CAPEX_STRUCTURAL_LIFE_YEARS,
  CAPEX_TECH_LIFE_YEARS,
  CAPEX_FB_EQUIPMENT_LIFE_YEARS,
  CAPEX_SPA_EQUIPMENT_LIFE_YEARS,
  CAPEX_INDUSTRY_BENCHMARK_PER_KEY,
} from "@shared/constants";
import { dPow } from "../shared/decimal.js";

/** Funded ratio ≥ 100%: reserve contributions fully cover annualized replacement costs */
const FUNDING_RATIO_ADEQUATE = 1.0;
/** Funded ratio 75–99%: reserve is marginally short of full coverage */
const FUNDING_RATIO_MARGINAL = 0.75;
/** Funded ratio 50–74%: reserve is materially underfunded */
const FUNDING_RATIO_UNDERFUNDED = 0.5;

export interface CapexCategory {
  label: string;
  useful_life_years: number;
  replacement_cost: number;
  age_years?: number;
}

export interface CapexReserveInput {
  property_name?: string;
  room_count: number;
  annual_revenue: number;
  ffe_reserve_rate?: number;
  initial_reserve_balance?: number;
  hold_period_years: number;
  revenue_growth_rate?: number;
  capex_categories?: CapexCategory[];
  inflation_rate?: number;
  rounding_policy: RoundingPolicy;
}

export interface CapexYearProjection {
  year: number;
  revenue: number;
  reserve_contribution: number;
  planned_replacements: number;
  replacement_items: string[];
  beginning_balance: number;
  ending_balance: number;
  reserve_per_key: number;
  funded_ratio: number;
}

export interface CapexCategoryStatus {
  label: string;
  useful_life_years: number;
  replacement_cost: number;
  current_age: number;
  remaining_life: number;
  annual_reserve_needed: number;
  replacement_year: number | null;
  inflated_replacement_cost: number;
}

export interface CapexReserveOutput {
  annual_reserve_rate: number;
  annual_reserve_amount: number;
  reserve_per_key_per_year: number;
  total_contributions_over_hold: number;
  total_replacements_over_hold: number;
  net_reserve_at_exit: number;
  category_status: CapexCategoryStatus[];
  yearly_projections: CapexYearProjection[];
  underfunding_risk: "adequate" | "marginal" | "underfunded" | "critical";
  minimum_recommended_rate: number;
  industry_benchmark_per_key: number;
}

export function computeCapexReserve(input: CapexReserveInput): CapexReserveOutput {
  const r = rounder(input.rounding_policy);
  const ratio = (v: number) => roundTo(v, RATIO_ROUNDING);

  const ffeRate = input.ffe_reserve_rate ?? DEFAULT_COST_RATE_FFE;
  // Audit #319 R4: registry-backed factory baseline (US inflation 0.03).
  const inflationFactory = getFactoryNumber('inflationRate');
  const revenueGrowth = input.revenue_growth_rate ?? inflationFactory;
  const inflationRate = input.inflation_rate ?? inflationFactory;
  const initialBalance = input.initial_reserve_balance ?? 0;

  const annual_reserve_amount = r(input.annual_revenue * ffeRate);
  const reserve_per_key_per_year = input.room_count > 0
    ? r(annual_reserve_amount / input.room_count)
    : 0;

  const categories = input.capex_categories ?? DEFAULT_CAPEX_CATEGORIES(input.room_count);
  const category_status: CapexCategoryStatus[] = categories.map(cat => {
    const age = cat.age_years ?? 0;
    const remaining = Math.max(0, cat.useful_life_years - age);
    const annual_reserve_needed = cat.useful_life_years > 0
      ? r(cat.replacement_cost / cat.useful_life_years)
      : 0;
    const replacementYear = remaining >= 0 && remaining <= input.hold_period_years
      ? Math.max(1, remaining)
      : null;
    const inflated_cost = replacementYear !== null
      ? r(cat.replacement_cost * dPow(1 + inflationRate, replacementYear))
      : r(cat.replacement_cost * dPow(1 + inflationRate, cat.useful_life_years));

    return {
      label: cat.label,
      useful_life_years: cat.useful_life_years,
      replacement_cost: cat.replacement_cost,
      current_age: age,
      remaining_life: remaining,
      annual_reserve_needed,
      replacement_year: replacementYear,
      inflated_replacement_cost: inflated_cost,
    };
  });

  const yearly_projections: CapexYearProjection[] = [];
  let balance = initialBalance;
  let revenue = input.annual_revenue;
  let totalContributions = 0;
  let totalReplacements = 0;

  for (let y = 1; y <= input.hold_period_years; y++) {
    if (y > 1) revenue = r(revenue * (1 + revenueGrowth));
    const contribution = r(revenue * ffeRate);
    const beginningBalance = r(balance);

    const dueItems = category_status.filter(c => c.replacement_year === y);
    const replacementCost = r(sumArray(dueItems.map(c => c.inflated_replacement_cost)));
    const replacementLabels = dueItems.map(c => c.label);

    balance = r(beginningBalance + contribution - replacementCost);
    totalContributions += contribution;
    totalReplacements += replacementCost;

    const reserve_per_key = input.room_count > 0 ? r(balance / input.room_count) : 0;
    const totalNeeded = r(sumArray(category_status.map(c => c.annual_reserve_needed)));
    const funded_ratio = totalNeeded > 0 ? ratio(contribution / totalNeeded) : 1;

    yearly_projections.push({
      year: y,
      revenue: r(revenue),
      reserve_contribution: contribution,
      planned_replacements: replacementCost,
      replacement_items: replacementLabels,
      beginning_balance: beginningBalance,
      ending_balance: r(balance),
      reserve_per_key,
      funded_ratio,
    });
  }

  const net_reserve_at_exit = r(balance);
  const totalAnnualNeeded = r(sumArray(category_status.map(c => c.annual_reserve_needed)));
  const minimum_recommended_rate = input.annual_revenue > 0
    ? ratio(totalAnnualNeeded / input.annual_revenue)
    : ffeRate;

  const industry_benchmark_per_key = CAPEX_INDUSTRY_BENCHMARK_PER_KEY;

  let underfunding_risk: "adequate" | "marginal" | "underfunded" | "critical";
  const fundedRatio = totalAnnualNeeded > 0 ? annual_reserve_amount / totalAnnualNeeded : 1;
  if (fundedRatio >= FUNDING_RATIO_ADEQUATE) underfunding_risk = "adequate";
  else if (fundedRatio >= FUNDING_RATIO_MARGINAL) underfunding_risk = "marginal";
  else if (fundedRatio >= FUNDING_RATIO_UNDERFUNDED) underfunding_risk = "underfunded";
  else underfunding_risk = "critical";

  return {
    annual_reserve_rate: ffeRate,
    annual_reserve_amount,
    reserve_per_key_per_year,
    total_contributions_over_hold: r(totalContributions),
    total_replacements_over_hold: r(totalReplacements),
    net_reserve_at_exit,
    category_status,
    yearly_projections,
    underfunding_risk,
    minimum_recommended_rate,
    industry_benchmark_per_key,
  };
}

function DEFAULT_CAPEX_CATEGORIES(roomCount: number): CapexCategory[] {
  return [
    { label: "Soft Goods (bedding, drapes, carpet)", useful_life_years: CAPEX_SOFT_GOODS_LIFE_YEARS, replacement_cost: roomCount * CAPEX_SOFT_GOODS_PER_KEY, age_years: 2 },
    { label: "Case Goods (furniture, fixtures)", useful_life_years: CAPEX_CASE_GOODS_LIFE_YEARS, replacement_cost: roomCount * CAPEX_CASE_GOODS_PER_KEY, age_years: 3 },
    { label: "HVAC Systems", useful_life_years: CAPEX_HVAC_LIFE_YEARS, replacement_cost: roomCount * CAPEX_HVAC_PER_KEY, age_years: 5 },
    { label: "Elevator/Mechanical", useful_life_years: CAPEX_STRUCTURAL_LIFE_YEARS, replacement_cost: CAPEX_ELEVATOR_MECHANICAL_COST, age_years: 8 },
    { label: "Roof & Exterior", useful_life_years: CAPEX_STRUCTURAL_LIFE_YEARS, replacement_cost: CAPEX_ROOF_EXTERIOR_COST, age_years: 7 },
    { label: "Technology & PMS", useful_life_years: CAPEX_TECH_LIFE_YEARS, replacement_cost: roomCount * CAPEX_TECH_PER_KEY, age_years: 1 },
    { label: "F&B Equipment", useful_life_years: CAPEX_FB_EQUIPMENT_LIFE_YEARS, replacement_cost: CAPEX_FB_EQUIPMENT_COST, age_years: 3 },
    { label: "Spa/Wellness Equipment", useful_life_years: CAPEX_SPA_EQUIPMENT_LIFE_YEARS, replacement_cost: CAPEX_SPA_EQUIPMENT_COST, age_years: 2 },
  ];
}
