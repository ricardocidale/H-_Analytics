/**
 * occupancy-ramp.ts — Deterministic Occupancy Ramp Schedule
 *
 * Computes the month-by-month and yearly occupancy schedule from start
 * to stabilization, plus the RevPAR impact at each stage.
 */
import { MONTHS_PER_YEAR } from "../../shared/constants.js";
import { getFactoryNumber } from "../../shared/model-constants-registry.js";
import { roundCents } from "../shared/utils.js";

interface OccupancyRampInput {
  start_occupancy: number;    // 0-1 decimal
  max_occupancy: number;      // 0-1 decimal
  ramp_months: number;        // months between growth steps
  growth_step: number;        // occupancy increment per step (0-1)
  stabilization_months: number;  // total months to model
  adr?: number;               // optional: compute RevPAR at each stage
  room_count?: number;        // optional: compute room revenue at each stage
  days_per_month?: number;
}

interface OccupancyStage {
  month: number;
  occupancy: number;
  occupancy_pct: string;
  revpar?: number;
  monthly_room_revenue?: number;
}

interface OccupancyRampOutput {
  stages: OccupancyStage[];
  months_to_stabilize: number;
  stabilized_occupancy: number;
  stabilized_occupancy_pct: string;
  yearly_avg_occupancy: { year: number; occupancy: number; occupancy_pct: string }[];
}

export function computeOccupancyRamp(input: OccupancyRampInput): OccupancyRampOutput {
  const {
    start_occupancy,
    max_occupancy,
    ramp_months,
    growth_step,
    stabilization_months,
    adr,
    room_count,
  } = input;

  // Audit #319 R4: registry-backed factory baseline.
  const days = input.days_per_month ?? getFactoryNumber('daysPerMonth');
  const stages: OccupancyStage[] = [];
  let currentOcc = start_occupancy;
  let monthsSinceLastStep = 0;
  let stabilizedAt = 0;

  for (let m = 1; m <= stabilization_months; m++) {
    monthsSinceLastStep++;

    if (ramp_months >= 1 && monthsSinceLastStep >= ramp_months && currentOcc < max_occupancy) {
      currentOcc = Math.min(currentOcc + growth_step, max_occupancy);
      monthsSinceLastStep = 0;
    }

    const stage: OccupancyStage = {
      month: m,
      occupancy: roundCents(currentOcc * 100) / 100,
      occupancy_pct: Math.round(currentOcc * 100) + "%",
    };

    if (adr !== undefined) {
      stage.revpar = roundCents(adr * currentOcc);
    }
    if (adr !== undefined && room_count !== undefined) {
      stage.monthly_room_revenue = roundCents(room_count * adr * currentOcc * days);
    }

    stages.push(stage);

    if (currentOcc >= max_occupancy && stabilizedAt === 0) {
      stabilizedAt = m;
    }

    if (m >= stabilization_months && currentOcc >= max_occupancy) break;
  }

  // Yearly averages
  const yearlyMap = new Map<number, number[]>();
  for (const s of stages) {
    const year = Math.ceil(s.month / MONTHS_PER_YEAR);
    if (!yearlyMap.has(year)) yearlyMap.set(year, []);
    const yearArr = yearlyMap.get(year);
    if (yearArr) yearArr.push(s.occupancy);
  }

  const yearly_avg_occupancy = Array.from(yearlyMap.entries()).map(([year, occs]) => {
    const avg = occs.reduce((a, b) => a + b, 0) / occs.length;
    return { year, occupancy: roundCents(avg * 100) / 100, occupancy_pct: Math.round(avg * 100) + "%" };
  });

  return {
    stages,
    months_to_stabilize: stabilizedAt || stages.length,
    stabilized_occupancy: max_occupancy,
    stabilized_occupancy_pct: Math.round(max_occupancy * 100) + "%",
    yearly_avg_occupancy,
  };
}
