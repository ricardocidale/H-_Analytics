/**
 * calc/analysis/revpar-index.ts — RevPAR competitive positioning index calculator.
 *
 * PURPOSE:
 * Computes STR-style competitive performance indices that measure how a hotel
 * performs relative to its market and competitive set. These metrics are standard
 * in the hospitality industry and are reported by Smith Travel Research (STR).
 *
 * THREE KEY INDICES:
 *
 * 1. MPI — Market Penetration Index (Occupancy Index)
 *    MPI = Property Occupancy / Market Occupancy
 *    An MPI of 1.10 means the hotel captures 10% more than its fair share of
 *    demand. An MPI below 1.00 means the hotel is underperforming on demand.
 *
 * 2. ARI — Average Rate Index (ADR Index)
 *    ARI = Property ADR / Market ADR
 *    An ARI of 1.15 means the hotel charges 15% more than the market average.
 *    This reflects pricing power and brand positioning.
 *
 * 3. RGI — Revenue Generation Index (RevPAR Index)
 *    RGI = Property RevPAR / Market RevPAR
 *    RGI = MPI × ARI. This is the single most important competitive metric.
 *    An RGI > 1.05 = "outperforming", < 0.95 = "underperforming", else "at_market".
 *
 * COMP SET vs. MARKET:
 * The "market" is the broad geographic area (e.g., all hotels in Miami Beach).
 * The "comp set" is a curated group of 5–7 directly competitive hotels. Both
 * sets of indices are computed if comp set data is provided.
 *
 * KEY TERMS:
 *   - RevPAR (Revenue Per Available Room): ADR × Occupancy. The industry's
 *     standard measure of top-line room revenue performance.
 *   - Available Room Nights: Room Count × 365. The denominator for occupancy.
 *   - Sold Room Nights: Available Room Nights × Occupancy.
 *
 * HOW IT FITS THE SYSTEM:
 * Called via the dispatch layer as the "revpar_index" skill. Displayed in the
 * property performance dashboard alongside historical STR data.
 */
import type { RoundingPolicy } from "../../domain/types/rounding.js";
import { roundTo } from "../../domain/types/rounding.js";
import { rounder, RATIO_ROUNDING } from "../shared/utils.js";
import { RGI_OUTPERFORMING_THRESHOLD, RGI_UNDERPERFORMING_THRESHOLD } from "../../shared/constants.js";

export interface RevPARIndexInput {
  property_name?: string;
  room_count: number;
  adr: number;
  occupancy: number;
  market_adr: number;
  market_occupancy: number;
  comp_set_adr?: number;
  comp_set_occupancy?: number;
  rounding_policy: RoundingPolicy;
}

export interface RevPARIndexOutput {
  property_revpar: number;
  market_revpar: number;
  comp_set_revpar: number | null;
  mpi: number;
  ari: number;
  rgi: number;
  comp_mpi: number | null;
  comp_ari: number | null;
  comp_rgi: number | null;
  penetration_assessment: "outperforming" | "at_market" | "underperforming";
  available_room_nights: number;
  sold_room_nights: number;
  room_revenue: number;
}

export function computeRevPARIndex(input: RevPARIndexInput): RevPARIndexOutput {
  const r = rounder(input.rounding_policy);
  const idx = (v: number) => roundTo(v, RATIO_ROUNDING);
  const DAYS_PER_YEAR = 365;
  const days = DAYS_PER_YEAR;

  const property_revpar = r(input.adr * input.occupancy);
  const market_revpar = r(input.market_adr * input.market_occupancy);

  const available_room_nights = input.room_count * days;
  const sold_room_nights = Math.round(available_room_nights * input.occupancy);
  const room_revenue = r(sold_room_nights * input.adr);

  const mpi = input.market_occupancy > 0
    ? idx(input.occupancy / input.market_occupancy)
    : 0;

  const ari = input.market_adr > 0
    ? idx(input.adr / input.market_adr)
    : 0;

  const rgi = market_revpar > 0
    ? idx(property_revpar / market_revpar)
    : 0;

  let comp_set_revpar: number | null = null;
  let comp_mpi: number | null = null;
  let comp_ari: number | null = null;
  let comp_rgi: number | null = null;

  if (input.comp_set_adr !== undefined && input.comp_set_occupancy !== undefined) {
    comp_set_revpar = r(input.comp_set_adr * input.comp_set_occupancy);
    comp_mpi = input.comp_set_occupancy > 0
      ? idx(input.occupancy / input.comp_set_occupancy)
      : 0;
    comp_ari = input.comp_set_adr > 0
      ? idx(input.adr / input.comp_set_adr)
      : 0;
    comp_rgi = comp_set_revpar > 0
      ? idx(property_revpar / comp_set_revpar)
      : 0;
  }

  let penetration_assessment: "outperforming" | "at_market" | "underperforming";
  if (rgi > RGI_OUTPERFORMING_THRESHOLD) penetration_assessment = "outperforming";
  else if (rgi < RGI_UNDERPERFORMING_THRESHOLD) penetration_assessment = "underperforming";
  else penetration_assessment = "at_market";

  return {
    property_revpar,
    market_revpar,
    comp_set_revpar,
    mpi, ari, rgi,
    comp_mpi, comp_ari, comp_rgi,
    penetration_assessment,
    available_room_nights,
    sold_room_nights,
    room_revenue,
  };
}
