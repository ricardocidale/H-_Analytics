/**
 * analyst-table-refresh.ts — re-export barrel.
 *
 * Originally a single 1,205-line module. Now split by table domain so each
 * runner can be reviewed independently. Importers resolve via this file
 * unchanged: every public name is re-exported.
 *
 * Design choices (preserved across the split):
 *   • One round-trip — the LLM is asked for both `ranges` and `narration` in
 *     a single JSON response. Costs less than two calls, and the front-end
 *     plays the narration while waiting for the round-trip to finish.
 *   • N+1 evidence — the prompt requires at least N+1 independent sources
 *     (default N=2, so 3 sources). The model is asked to list them.
 *   • Tolerant fallback — if the LLM is unreachable or returns a malformed
 *     payload, we return a best-effort fallback that keeps the existing
 *     ranges and surfaces an explanatory narration. The route still records
 *     this as a successful refresh so the audit log isn't blocked.
 *
 * Implementation lives in ./analyst-refresh/ — split by table domain:
 *   • shared.ts          — shared types, constants, and the refreshLog logger
 *   • capital-raise.ts   — Capital-Raise refresh + watchdog ingestion
 *   • exit-multiples.ts  — Exit-Multiples refresh + watchdog ingestion
 *   • reference-data.ts  — Geography / taxes / fees / cap-rates refreshers
 *   • reference-brands.ts — Reference Brands auto-commit refresh
 */

export type {
  ProposedRange,
  AnalystRefreshResult,
  ReferenceDataRefreshResult,
} from "./analyst-refresh/shared";

export {
  researchCapitalRaiseBenchmarks,
  applyWatchdogCapitalRaiseSnapshot,
} from "./analyst-refresh/capital-raise";
export type {
  WatchdogRaiseObservation,
  WatchdogRaiseSnapshot,
  ApplyWatchdogCapitalRaiseResult,
} from "./analyst-refresh/capital-raise";

export {
  researchExitMultiples,
  applyWatchdogExitMultiplesSnapshot,
} from "./analyst-refresh/exit-multiples";
export type {
  WatchdogExitMultipleObservation,
  WatchdogExitMultiplesSnapshot,
  ApplyWatchdogExitMultiplesResult,
} from "./analyst-refresh/exit-multiples";

export {
  researchGeographyDimension,
  researchJurisdictionalTaxes,
  researchRegulatoryFees,
  researchMarketCapRates,
} from "./analyst-refresh/reference-data";

export {
  researchReferenceBrands,
  commitReferenceBrands,
  evaluateReferenceBrandsCoverage,
  REFERENCE_BRANDS_MIN_COUNT,
} from "./analyst-refresh/reference-brands";
export type {
  ReferenceBrandsRefreshResult,
  ReferenceBrandsDryRunResult,
  ReferenceBrandsCoverageVerdict,
} from "./analyst-refresh/reference-brands";
