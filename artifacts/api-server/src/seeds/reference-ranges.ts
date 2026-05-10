/**
 * Reference Range seeder — populates reference_range from authoritative sources.
 *
 * This file is the thin orchestrator. Per-pass data and functions live in
 * `seeds/reference-ranges/` (helpers, markets, labor, operating, capital,
 * bibliography-2026).
 *
 * Run order: after market-data-tables seed (labor/ADR data already in DB).
 * Safe to re-run (upserts via ON CONFLICT DO UPDATE).
 *
 * Twelve passes, in execution order:
 *   1.  KPI rows from existing market_adr_index seed data (instant, no API)
 *   2.  KPI rows refreshed from AirROI live API (if AIRROI_API_KEY is set)
 *   3.  Labor rows from existing labor_rates seed data
 *   4.  Macro rows from FRED (if FRED_API_KEY is set)
 *   5.  Hospitality KPI benchmarks — margins, cap rates, fees
 *   6.  Financing benchmarks (Table 2)
 *   7.  Operating cost benchmarks (Tables 3, 4)
 *   8.  EWW benchmarks (Table 7) — USALI 12th Ed. Schedule EWW
 *   9.  CAPEX / construction benchmarks (Table 5, Table 8)
 *   10. Fixed costs — property tax, insurance (Table 9)
 *   11. Tax benchmarks (Table 10)
 *   12. 2026 bibliography additions — PwC, Actabl, JLL, RLB/Whitebridge
 *
 * The Admin "Refresh" button in the Reference Ranges tab calls
 * POST /api/admin/reference-ranges/refresh to re-run passes 2 and 4.
 */

import { logger } from "../logger";
import { TAG } from "./reference-ranges/helpers";
import {
  seedKpiRows,
  refreshKpiFromAirROI,
  refreshMacroFromFRED,
} from "./reference-ranges/markets";
import { seedLaborRows } from "./reference-ranges/labor";
import {
  seedHospitalityKpiBenchmarks,
  seedOperatingCostBenchmarks,
  seedEwwBenchmarks,
  seedFixedCostBenchmarks,
  seedTaxBenchmarks,
} from "./reference-ranges/operating";
import {
  seedFinancingBenchmarks,
  seedCapexBenchmarks,
} from "./reference-ranges/capital";
import { seedPass12Updates } from "./reference-ranges/bibliography-2026";

// Re-export the two refresh functions so admin routes that import from
// "./seeds/reference-ranges" continue to resolve.
export { refreshKpiFromAirROI, refreshMacroFromFRED };

// ── Main entry point (called from runSeeds) ───────────────────────────────────

export async function seedReferenceRanges(): Promise<void> {
  logger.info("Seeding reference_range table...", TAG);
  await seedKpiRows();
  await seedLaborRows();
  await refreshMacroFromFRED(); // uses static fallback if no FRED key
  // Tables 1–10: hospitality benchmarks (Americas + Southern Europe)
  await seedHospitalityKpiBenchmarks();
  await seedFinancingBenchmarks();
  await seedOperatingCostBenchmarks();
  await seedEwwBenchmarks();
  await seedCapexBenchmarks();
  await seedFixedCostBenchmarks();
  await seedTaxBenchmarks();
  await seedPass12Updates();
  logger.info("Reference range seeding complete", TAG);
}
