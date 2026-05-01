import {
  computePortfolioProjection,
  computePortfolioProjectionWithAudit,
  computeSingleProperty,
  computeCompanyProjection,
  type ComputePortfolioInput,
  type ComputeSinglePropertyInput,
  type ComputeCompanyInput,
  type ComputeResultWithAudit,
} from "./service";
import type { PortfolioComputeResult, SinglePropertyComputeResult } from "./core/types";
import type { CompanyComputeResult } from "./service";
import { storage } from "../storage";

/**
 * Task #442. The Analyst's `all-properties-financials-computed`
 * prerequisite (engine/analyst/registry/prerequisite-registry.ts) reads
 * `properties.financials_computed_at` to decide whether the per-property
 * pro forma is fresh. The truth contract is: "if the engine just
 * recomputed property X successfully, X.financials_computed_at reflects
 * that". Anyone who calls the pure engine (`computeSingleProperty`,
 * `computeCompanyProjection`, `computePortfolioProjection*`) is therefore
 * obligated to stamp that timestamp once the engine returns.
 *
 * The pure engine functions live in `service.ts` and intentionally have
 * zero IO — they don't take a storage handle, they don't await anything,
 * and they fan out into the cache module (also pure / in-memory). This
 * file is the *one* server-side seam where engine output meets the DB:
 * a thin async wrapper around each engine entrypoint that runs the
 * compute, then stamps every property whose ID we know about. Callers
 * that have to talk to the DB after a recompute (HTTP routes, the report
 * builder) MUST go through this module — never call the raw engine
 * functions directly.
 *
 * Why centralize here:
 *   - Single place for the contract. Add a new compute entrypoint, you
 *     get the stamp for free; remove this wrapper, and the prereq breaks
 *     loudly in CI rather than silently in production.
 *   - Atomic-ish with the recompute output. The cache write inside the
 *     engine and the DB stamp here happen back-to-back in the same async
 *     function, so a stale `financials_computed_at` can only be observed
 *     if the DB write itself fails — and we let that error propagate so
 *     the request fails 500 instead of returning numbers labelled
 *     "fresh" against a column that says otherwise.
 *
 * Scenario routes deliberately do NOT use these wrappers (they recompute
 * a saved scenario *snapshot*, not the canonical per-property state, so
 * stamping would be a lie). The verification path also lives outside
 * this module because it goes through `runVerificationWithEngine`, not
 * the cached compute service.
 */

function extractPropertyIds(props: ReadonlyArray<unknown>): number[] {
  const ids: number[] = [];
  for (const p of props) {
    if (p && typeof p === "object") {
      const id = (p as { id?: unknown }).id;
      if (typeof id === "number" && Number.isFinite(id)) ids.push(id);
    }
  }
  return ids;
}

/** Wrapper for `computePortfolioProjectionWithAudit` (used by the audit-aware HTTP route). */
export async function recomputePortfolioWithAuditAndStamp(
  input: ComputePortfolioInput,
  collectAudit: boolean,
): Promise<ComputeResultWithAudit> {
  const out = computePortfolioProjectionWithAudit(input, collectAudit);
  await storage.markPropertiesFinancialsComputed(extractPropertyIds(input.properties));
  return out;
}

/** Wrapper for `computePortfolioProjection` (used by the report builder). */
export async function recomputePortfolioAndStamp(
  input: ComputePortfolioInput,
): Promise<PortfolioComputeResult> {
  const result = computePortfolioProjection(input);
  await storage.markPropertiesFinancialsComputed(extractPropertyIds(input.properties));
  return result;
}

/** Wrapper for `computeSingleProperty`. */
export async function recomputeSinglePropertyAndStamp(
  input: ComputeSinglePropertyInput,
): Promise<SinglePropertyComputeResult> {
  const result = computeSingleProperty(input);
  await storage.markPropertiesFinancialsComputed(extractPropertyIds([input.property]));
  return result;
}

/** Wrapper for `computeCompanyProjection`. */
export async function recomputeCompanyAndStamp(
  input: ComputeCompanyInput,
): Promise<CompanyComputeResult> {
  const result = computeCompanyProjection(input);
  await storage.markPropertiesFinancialsComputed(extractPropertyIds(input.properties));
  return result;
}
