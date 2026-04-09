/**
 * adr-projection.ts — Deterministic ADR Growth Projection
 *
 * Projects ADR forward over N years with annual growth rate and optional
 * inflation overlay. Returns yearly ADR, RevPAR, and room revenue.
 */
import { DAYS_PER_MONTH, MONTHS_PER_YEAR } from "../../shared/constants.js";
import { roundCents } from "../shared/utils.js";
import { dPow } from "../shared/decimal.js";

interface ADRProjectionInput {
  start_adr: number;
  growth_rate: number;        // annual ADR growth (0-1 decimal)
  inflation_rate?: number;    // annual inflation (0-1 decimal, additive to growth)
  projection_years: number;
  occupancy?: number;         // optional: compute RevPAR
  room_count?: number;        // optional: compute annual room revenue
  days_per_month?: number;
}

interface YearProjection {
  year: number;
  adr: number;
  adr_growth_from_start: string;
  revpar?: number;
  annual_room_revenue?: number;
}

interface ADRProjectionOutput {
  projections: YearProjection[];
  start_adr: number;
  end_adr: number;
  total_growth_pct: string;
  cagr: string;
}

export function computeADRProjection(input: ADRProjectionInput): ADRProjectionOutput {
  const {
    start_adr,
    growth_rate,
    inflation_rate = 0,
    projection_years,
    occupancy,
    room_count,
  } = input;

  const days = input.days_per_month ?? DAYS_PER_MONTH;
  const projections: YearProjection[] = [];

  for (let y = 1; y <= projection_years; y++) {
    const adr = roundCents(start_adr * dPow(1 + growth_rate, y) * dPow(1 + inflation_rate, y));
    const growthFromStart = start_adr === 0 ? 0 : ((adr - start_adr) / start_adr) * 100;

    const proj: YearProjection = {
      year: y,
      adr,
      adr_growth_from_start: Math.round(growthFromStart * 10) / 10 + "%",
    };

    if (occupancy !== undefined) {
      proj.revpar = roundCents(adr * occupancy);
    }
    if (occupancy !== undefined && room_count !== undefined) {
      proj.annual_room_revenue = roundCents(room_count * adr * occupancy * days * MONTHS_PER_YEAR);
    }

    projections.push(proj);
  }

  const endAdr = projections[projections.length - 1]?.adr ?? start_adr;
  const totalGrowth = start_adr === 0 ? 0 : ((endAdr - start_adr) / start_adr) * 100;

  return {
    projections,
    start_adr,
    end_adr: endAdr,
    total_growth_pct: Math.round(totalGrowth * 10) / 10 + "%",
    cagr: Math.round(((1 + growth_rate) * (1 + inflation_rate) - 1) * 100 * 10) / 10 + "%",
  };
}
