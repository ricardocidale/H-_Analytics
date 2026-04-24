/**
 * property-metrics.ts — Deterministic Property Financial Metrics
 *
 * Computes key financial metrics from property inputs so the research LLM
 * can validate its recommendations against exact math instead of estimating.
 *
 * Used by the AI research tool `compute_property_metrics` during property
 * research generation.
 */
import { roundCents } from "../shared/utils.js";
import { getFactoryNumber } from "../../shared/model-constants-registry.js";
import {
  DEFAULT_COST_RATE_ADMIN,
  DEFAULT_COST_RATE_PROPERTY_OPS,
  DEFAULT_COST_RATE_UTILITIES,
  DEFAULT_COST_RATE_FFE,
  DEFAULT_COST_RATE_OTHER,
  DEFAULT_EVENT_EXPENSE_RATE,
  MONTHS_PER_YEAR,
} from "../../shared/constants.js";

// Research-specific defaults that intentionally differ from shared constants.
// These represent typical industry benchmarks for AI research context, not the
// app's configurable defaults.
const RESEARCH_COST_RATE_ROOMS = 0.36;
const RESEARCH_COST_RATE_FB = 0.32;
const RESEARCH_COST_RATE_MARKETING = 0.05;
const RESEARCH_REV_SHARE_EVENTS = 0.43;
const RESEARCH_REV_SHARE_FB = 0.22;
const RESEARCH_REV_SHARE_OTHER = 0.07;
const RESEARCH_CATERING_BOOST_PCT = 0.30;
const RESEARCH_BASE_MGMT_FEE_RATE = 0.05;
const RESEARCH_INCENTIVE_MGMT_FEE_RATE = 0.15;

interface PropertyMetricsInput {
  room_count: number;
  adr: number;
  occupancy: number; // 0-1 decimal
  cost_rate_rooms?: number;
  cost_rate_fb?: number;
  cost_rate_admin?: number;
  cost_rate_marketing?: number;
  cost_rate_property_ops?: number;
  cost_rate_utilities?: number;
  cost_rate_ffe?: number;
  cost_rate_other?: number;
  rev_share_events?: number;
  rev_share_fb?: number;
  rev_share_other?: number;
  catering_boost_pct?: number;
  base_management_fee_rate?: number;
  incentive_management_fee_rate?: number;
  days_per_month?: number;
}

interface PropertyMetricsOutput {
  revpar: number;
  monthly_room_revenue: number;
  annual_room_revenue: number;
  monthly_total_revenue: number;
  annual_total_revenue: number;
  revenue_breakdown: {
    rooms: number;
    events: number;
    fb: number;
    other: number;
  };
  annual_gop: number;
  gop_margin_pct: number;
  annual_noi: number;
  noi_margin_pct: number;
  revenue_per_room: number;
  cost_per_room: number;
}

export function computePropertyMetrics(input: PropertyMetricsInput): PropertyMetricsOutput {
  const {
    room_count,
    adr,
    occupancy,
    cost_rate_rooms = RESEARCH_COST_RATE_ROOMS,
    cost_rate_fb = RESEARCH_COST_RATE_FB,
    cost_rate_admin = DEFAULT_COST_RATE_ADMIN,
    cost_rate_marketing = RESEARCH_COST_RATE_MARKETING,
    cost_rate_property_ops = DEFAULT_COST_RATE_PROPERTY_OPS,
    cost_rate_utilities = DEFAULT_COST_RATE_UTILITIES,
    cost_rate_ffe = DEFAULT_COST_RATE_FFE,
    cost_rate_other = DEFAULT_COST_RATE_OTHER,
    rev_share_events = RESEARCH_REV_SHARE_EVENTS,
    rev_share_fb = RESEARCH_REV_SHARE_FB,
    rev_share_other = RESEARCH_REV_SHARE_OTHER,
    catering_boost_pct = RESEARCH_CATERING_BOOST_PCT,
    base_management_fee_rate = RESEARCH_BASE_MGMT_FEE_RATE,
    incentive_management_fee_rate = RESEARCH_INCENTIVE_MGMT_FEE_RATE,
  } = input;

  // Audit #319 R4: registry-backed factory baseline.
  const days = input.days_per_month ?? getFactoryNumber('daysPerMonth');

  // RevPAR
  const revpar = roundCents(adr * occupancy);

  // Monthly room revenue
  const monthlyRoomRevenue = roundCents(room_count * adr * occupancy * days);
  const annualRoomRevenue = roundCents(monthlyRoomRevenue * MONTHS_PER_YEAR);

  // Revenue streams (all based on room revenue)
  const monthlyEvents = roundCents(monthlyRoomRevenue * rev_share_events);
  const monthlyFB = roundCents(monthlyRoomRevenue * rev_share_fb * (1 + catering_boost_pct));
  const monthlyOther = roundCents(monthlyRoomRevenue * rev_share_other);
  const monthlyTotal = roundCents(monthlyRoomRevenue + monthlyEvents + monthlyFB + monthlyOther);
  const annualTotal = roundCents(monthlyTotal * MONTHS_PER_YEAR);

  // Department expenses
  const roomCosts = roundCents(monthlyRoomRevenue * cost_rate_rooms);
  const fbCosts = roundCents(monthlyFB * cost_rate_fb);
  const eventCosts = roundCents(monthlyEvents * DEFAULT_EVENT_EXPENSE_RATE);

  // GOP = Revenue - Department Costs
  const departmentCosts = roundCents(roomCosts + fbCosts + eventCosts);
  const monthlyGOP = roundCents(monthlyTotal - departmentCosts);

  // Undistributed expenses (% of total revenue)
  const adminCosts = roundCents(monthlyTotal * cost_rate_admin);
  const marketingCosts = roundCents(monthlyTotal * cost_rate_marketing);
  const propOpsCosts = roundCents(monthlyTotal * cost_rate_property_ops);
  const utilitiesCosts = roundCents(monthlyTotal * cost_rate_utilities);
  const ffeCosts = roundCents(monthlyTotal * cost_rate_ffe);
  const otherCosts = roundCents(monthlyTotal * cost_rate_other);
  const undistributed = roundCents(adminCosts + marketingCosts + propOpsCosts + utilitiesCosts + ffeCosts + otherCosts);

  // Management fees
  const baseFee = monthlyTotal * base_management_fee_rate;
  // M14: Incentive fee applies to all positive GOP without a hurdle threshold.
  // This is intentional for research/proforma estimates — actual contracts vary.
  const incentiveFee = monthlyGOP > 0 ? monthlyGOP * incentive_management_fee_rate : 0;

  // ANOI = GOP - Undistributed - Management Fees - Fixed Charges - FF&E
  const monthlyNOI = monthlyGOP - undistributed - baseFee - incentiveFee;
  const annualNOI = roundCents(monthlyNOI * MONTHS_PER_YEAR);
  const annualGOP = roundCents(monthlyGOP * MONTHS_PER_YEAR);

  const gopMargin = annualTotal > 0 ? roundCents((annualGOP / annualTotal) * 100) : 0;
  const noiMargin = annualTotal > 0 ? roundCents((annualNOI / annualTotal) * 100) : 0;

  return {
    revpar,
    monthly_room_revenue: monthlyRoomRevenue,
    annual_room_revenue: annualRoomRevenue,
    monthly_total_revenue: monthlyTotal,
    annual_total_revenue: annualTotal,
    revenue_breakdown: {
      rooms: roundCents(annualRoomRevenue),
      events: roundCents(monthlyEvents * MONTHS_PER_YEAR),
      fb: roundCents(monthlyFB * MONTHS_PER_YEAR),
      other: roundCents(monthlyOther * MONTHS_PER_YEAR),
    },
    annual_gop: annualGOP,
    gop_margin_pct: gopMargin,
    annual_noi: annualNOI,
    noi_margin_pct: noiMargin,
    revenue_per_room: roundCents(annualTotal / room_count),
    cost_per_room: roundCents((annualTotal - annualNOI) / room_count),
  };
}
