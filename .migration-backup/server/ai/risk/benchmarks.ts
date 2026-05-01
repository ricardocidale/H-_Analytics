/**
 * Hospitality industry benchmarks used by deterministic risk insight
 * generators. Sourced from USALI, CBRE, STR, and HVS publications; kept
 * in one module so updating a benchmark propagates everywhere consistently.
 */

export const BENCHMARKS = {
  luxuryADR: 396.40,
  boutiqueADR: 245.00,
  luxuryOccupancy: 0.682,
  boutiqueOccupancy: 0.705,
  avgCostRateRooms: 0.36,
  avgCostRateFB: 0.32,
  avgCostRateAdmin: 0.09,
  avgCostRateMarketing: 0.06,
  avgCostRatePropertyOps: 0.05,
  avgCostRateUtilities: 0.04,
  avgFFEReserve: 0.04,
  ltv75Threshold: 0.75,
  ltv85Threshold: 0.85,
  dscr125Threshold: 1.25,
  dscr150Threshold: 1.50,
  concentrationThreshold: 0.40,
  highOccupancyThreshold: 0.85,
} as const;
