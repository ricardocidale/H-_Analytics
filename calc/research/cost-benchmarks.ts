/**
 * cost-benchmarks.ts — Deterministic Cost Benchmark Calculator
 *
 * Converts percentage cost rates into annual dollar amounts given
 * a property's revenue, producing a full USALI-aligned cost breakdown.
 */
import { roundCents } from "../shared/utils.js";
import {
  DEFAULT_COST_RATE_ROOMS,
  DEFAULT_COST_RATE_FB,
  DEFAULT_COST_RATE_ADMIN,
  DEFAULT_COST_RATE_MARKETING,
  DEFAULT_COST_RATE_PROPERTY_OPS,
  DEFAULT_COST_RATE_UTILITIES,
  DEFAULT_COST_RATE_IT,
  DEFAULT_COST_RATE_FFE,
  DEFAULT_COST_RATE_OTHER,
  DEFAULT_COST_RATE_INSURANCE,
} from "../../shared/constants.js";
import { getFactoryNumber } from "../../shared/model-constants-registry.js";

// Audit #406: stateless benchmark calculator sources US property tax rate from the registry.
// This calculator has no `country` argument; callers needing locality must pass `cost_rate_taxes` explicitly.
const DEFAULT_COST_RATE_TAXES_US = getFactoryNumber("costRateTaxes", "United States");

interface CostBenchmarksInput {
  annual_room_revenue: number;
  annual_total_revenue: number;
  purchase_price?: number;        // for tax calculations
  cost_rate_rooms?: number;
  cost_rate_fb?: number;
  cost_rate_admin?: number;
  cost_rate_marketing?: number;
  cost_rate_property_ops?: number;
  cost_rate_utilities?: number;
  cost_rate_taxes?: number;
  cost_rate_insurance?: number;
  cost_rate_it?: number;
  cost_rate_ffe?: number;
  cost_rate_other?: number;
}

interface CostLine {
  category: string;
  rate: number;
  rate_pct: string;
  base: string;
  annual_amount: number;
}

interface CostBenchmarksOutput {
  department_costs: CostLine[];
  undistributed_costs: CostLine[];
  property_value_costs: CostLine[];
  total_department: number;
  total_undistributed: number;
  total_property_value: number;
  total_operating_costs: number;
  operating_cost_ratio: string;
}

export function computeCostBenchmarks(input: CostBenchmarksInput): CostBenchmarksOutput {
  const {
    annual_room_revenue,
    annual_total_revenue,
    purchase_price = 0,
    cost_rate_rooms = DEFAULT_COST_RATE_ROOMS,
    cost_rate_fb = DEFAULT_COST_RATE_FB,
    cost_rate_admin = DEFAULT_COST_RATE_ADMIN,
    cost_rate_marketing = DEFAULT_COST_RATE_MARKETING,
    cost_rate_property_ops = DEFAULT_COST_RATE_PROPERTY_OPS,
    cost_rate_utilities = DEFAULT_COST_RATE_UTILITIES,
    cost_rate_taxes = DEFAULT_COST_RATE_TAXES_US,
    cost_rate_insurance = DEFAULT_COST_RATE_INSURANCE,
    cost_rate_it = DEFAULT_COST_RATE_IT,
    cost_rate_ffe = DEFAULT_COST_RATE_FFE,
    cost_rate_other = DEFAULT_COST_RATE_OTHER,
  } = input;

  const makeLine = (category: string, rate: number, base: string, baseAmount: number): CostLine => ({
    category,
    rate: roundCents(rate * 100) / 100,
    rate_pct: Math.round(rate * 100) + "%",
    base,
    annual_amount: roundCents(baseAmount * rate),
  });

  const department_costs: CostLine[] = [
    makeLine("Rooms", cost_rate_rooms, "Room Revenue", annual_room_revenue),
    makeLine("F&B", cost_rate_fb, "F&B Revenue", annual_total_revenue - annual_room_revenue),
  ];

  const undistributed_costs: CostLine[] = [
    makeLine("Admin & General", cost_rate_admin, "Total Revenue", annual_total_revenue),
    makeLine("Marketing", cost_rate_marketing, "Total Revenue", annual_total_revenue),
    makeLine("Property Ops", cost_rate_property_ops, "Total Revenue", annual_total_revenue),
    makeLine("Utilities", cost_rate_utilities, "Total Revenue", annual_total_revenue),
    makeLine("IT", cost_rate_it, "Total Revenue", annual_total_revenue),
    makeLine("FF&E Reserve", cost_rate_ffe, "Total Revenue", annual_total_revenue),
    makeLine("Other", cost_rate_other, "Total Revenue", annual_total_revenue),
  ];

  const property_value_costs: CostLine[] = [
    makeLine("Property Taxes", cost_rate_taxes, "Property Value", purchase_price),
    makeLine("Insurance", cost_rate_insurance, "Property Value", purchase_price),
  ];

  const total_department = department_costs.reduce((s, c) => s + c.annual_amount, 0);
  const total_undistributed = undistributed_costs.reduce((s, c) => s + c.annual_amount, 0);
  const total_property_value = property_value_costs.reduce((s, c) => s + c.annual_amount, 0);
  const total_operating_costs = roundCents(total_department + total_undistributed + total_property_value);

  const ratio = annual_total_revenue > 0 ? (total_operating_costs / annual_total_revenue) * 100 : 0;

  return {
    department_costs,
    undistributed_costs,
    property_value_costs,
    total_department: roundCents(total_department),
    total_undistributed: roundCents(total_undistributed),
    total_property_value: roundCents(total_property_value),
    total_operating_costs,
    operating_cost_ratio: Math.round(ratio * 10) / 10 + "%",
  };
}
