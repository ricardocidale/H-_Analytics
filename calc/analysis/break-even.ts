/**
 * calc/analysis/break-even.ts — Hotel break-even occupancy analysis.
 *
 * PURPOSE:
 * Computes the minimum occupancy rate a hotel must achieve to cover its costs.
 * Two break-even points are calculated:
 *   1. OPERATING break-even: The occupancy where NOI = 0 (revenue covers all
 *      operating expenses, management fees, and FF&E reserve, but NOT debt service).
 *   2. CASH FLOW break-even: The occupancy where NOI covers debt service AND taxes
 *      in addition to operating costs. This is the "survival" threshold — below
 *      this, the property consumes cash.
 *
 * THE BREAK-EVEN FORMULA:
 *   Total Revenue at occupancy o:
 *     TotalRev = rooms × ADR × days_per_month × o × (1 + ancillary_pct)
 *
 *   Contribution Margin:
 *     CM = 1 − variable_cost_rate − management_fee_rate − ffe_reserve_rate
 *
 *   At break-even (NOI = 0):
 *     TotalRev × CM = Fixed Costs + Additional Fixed (debt service + taxes)
 *     o = Fixed Total / (rooms × ADR × days × (1 + ancillary_pct) × CM)
 *
 * If the contribution margin ≤ 0, the property can never break even (variable
 * costs exceed revenue at every occupancy level), so the function returns 100%.
 *
 * SENSITIVITY OUTPUTS:
 *   - adr_drop_10pct_break_even: Break-even occupancy if ADR falls 10%.
 *   - fixed_cost_up_10pct_break_even: Break-even occupancy if fixed costs rise 10%.
 *   These show how fragile the break-even is to common downside scenarios.
 *
 * KEY TERMS:
 *   - ADR (Average Daily Rate): Mean room rate charged per occupied room per night.
 *   - RevPAR (Revenue Per Available Room): ADR × Occupancy. The break-even RevPAR
 *     is the minimum RevPAR needed to cover costs.
 *   - FF&E Reserve: Furniture, Fixtures & Equipment reserve. A percentage of revenue
 *     set aside for capital replacement (industry standard: 3–5%).
 *   - Contribution Margin: The fraction of each revenue dollar available to cover
 *     fixed costs after variable costs and fee deductions.
 *
 * HOW IT FITS THE SYSTEM:
 * Called via the dispatch layer as the "break_even" skill. Displayed in the property
 * analysis dashboard to help investors understand operating risk and downside exposure.
 */
import { DEFAULT_COST_RATE_FFE } from "../../shared/constants.js";
import { getFactoryNumber } from "../../shared/model-constants-registry.js";

// Audit #319 R4: registry-backed daysPerMonth (universal — same value as legacy).
const DAYS_PER_MONTH = getFactoryNumber('daysPerMonth');

/** Sensitivity factor: ADR drops by 10% (multiplier 0.9) */
const SENSITIVITY_ADR_DROP = 0.9;
/** Sensitivity factor: fixed costs rise by 10% (multiplier 1.1) */
const SENSITIVITY_COST_UP = 1.1;

export interface BreakEvenInput {
  property_name?: string;
  room_count: number;
  adr: number;
  days_per_month?: number;
  variable_cost_rate: number;
  fixed_costs_monthly: number;
  management_fee_rate?: number;
  ffe_reserve_rate?: number;
  monthly_debt_service?: number;
  monthly_income_tax_estimate?: number;
  ancillary_revenue_pct?: number;
}

interface BreakEvenPoint {
  occupancy: number;
  revpar: number;
  monthly_revenue: number;
  sold_rooms_per_month: number;
}

export interface BreakEvenOutput {
  operating_break_even: BreakEvenPoint;
  cash_flow_break_even: BreakEvenPoint;
  margin_of_safety: {
    current_occupancy_cushion: number;
    revenue_cushion_pct: number;
  };
  sensitivity: {
    adr_drop_10pct_break_even: number;
    fixed_cost_up_10pct_break_even: number;
  };
}

function solveBreakEvenOccupancy(
  roomCount: number,
  adr: number,
  daysPerMonth: number,
  variableCostRate: number,
  fixedCostsMonthly: number,
  mgmtFeeRate: number,
  ffeRate: number,
  additionalFixed: number,
  ancillaryPct: number,
): number {
  // Monthly room revenue at occupancy o:
  // RoomRev = rooms * ADR * days * o
  // Total rev = RoomRev * (1 + ancillaryPct)
  // Variable costs = TotalRev * variableCostRate
  // Mgmt fees = TotalRev * mgmtFeeRate
  // FFE = TotalRev * ffeRate
  // NOI = TotalRev - VariableCosts - MgmtFees - FFE - FixedCosts - AdditionalFixed
  // At break-even: NOI = 0
  // TotalRev * (1 - variableCostRate - mgmtFeeRate - ffeRate) = fixedCosts + additionalFixed
  // RoomRev * (1 + ancPct) * contributionMargin = fixedTotal
  // rooms * ADR * days * o * (1 + ancPct) * cMargin = fixedTotal
  // o = fixedTotal / (rooms * ADR * days * (1 + ancPct) * cMargin)

  const contributionMargin = 1 - variableCostRate - mgmtFeeRate - ffeRate;
  if (contributionMargin <= 0) return 1.0; // Cannot break even

  const fixedTotal = fixedCostsMonthly + additionalFixed;
  const revenuePerRoomPerMonth = adr * daysPerMonth;
  const denominator = roomCount * revenuePerRoomPerMonth * (1 + ancillaryPct) * contributionMargin;

  if (denominator <= 0) return 1.0;
  return Math.min(Math.max(fixedTotal / denominator, 0), 1.0);
}

export function computeBreakEven(input: BreakEvenInput): BreakEvenOutput {
  const days = input.days_per_month ?? DAYS_PER_MONTH;
  const mgmtRate = input.management_fee_rate ?? 0;
  const ffeRate = input.ffe_reserve_rate ?? DEFAULT_COST_RATE_FFE;
  const debtService = input.monthly_debt_service ?? 0;
  const tax = input.monthly_income_tax_estimate ?? 0;
  const ancPct = input.ancillary_revenue_pct ?? 0;

  // Operating break-even (NOI = 0, no debt service)
  const opOcc = solveBreakEvenOccupancy(
    input.room_count, input.adr, days,
    input.variable_cost_rate, input.fixed_costs_monthly,
    mgmtRate, ffeRate, 0, ancPct,
  );

  const opRoomRev = input.room_count * input.adr * days * opOcc;
  const opTotalRev = opRoomRev * (1 + ancPct);

  const operating_break_even: BreakEvenPoint = {
    occupancy: Math.round(opOcc * 10000) / 10000,
    revpar: Math.round(input.adr * opOcc * 100) / 100,
    monthly_revenue: Math.round(opTotalRev * 100) / 100,
    sold_rooms_per_month: Math.round(input.room_count * days * opOcc * 100) / 100,
  };

  // Cash flow break-even (including debt service and taxes)
  const cfOcc = solveBreakEvenOccupancy(
    input.room_count, input.adr, days,
    input.variable_cost_rate, input.fixed_costs_monthly,
    mgmtRate, ffeRate, debtService + tax, ancPct,
  );

  const cfRoomRev = input.room_count * input.adr * days * cfOcc;
  const cfTotalRev = cfRoomRev * (1 + ancPct);

  const cash_flow_break_even: BreakEvenPoint = {
    occupancy: Math.round(cfOcc * 10000) / 10000,
    revpar: Math.round(input.adr * cfOcc * 100) / 100,
    monthly_revenue: Math.round(cfTotalRev * 100) / 100,
    sold_rooms_per_month: Math.round(input.room_count * days * cfOcc * 100) / 100,
  };

  // Sensitivity: ADR drop 10%
  const adrDrop = solveBreakEvenOccupancy(
    input.room_count, input.adr * SENSITIVITY_ADR_DROP, days,
    input.variable_cost_rate, input.fixed_costs_monthly,
    mgmtRate, ffeRate, debtService + tax, ancPct,
  );

  // Sensitivity: Fixed costs up 10%
  const fixedUp = solveBreakEvenOccupancy(
    input.room_count, input.adr, days,
    input.variable_cost_rate, input.fixed_costs_monthly * SENSITIVITY_COST_UP,
    mgmtRate, ffeRate, debtService + tax, ancPct,
  );

  return {
    operating_break_even,
    cash_flow_break_even,
    margin_of_safety: {
      current_occupancy_cushion: 0,
      revenue_cushion_pct: 0,
    },
    sensitivity: {
      adr_drop_10pct_break_even: Math.round(adrDrop * 10000) / 10000,
      fixed_cost_up_10pct_break_even: Math.round(fixedUp * 10000) / 10000,
    },
  };
}
