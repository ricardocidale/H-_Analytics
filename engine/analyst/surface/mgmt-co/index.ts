// engine/analyst/surface/mgmt-co — Surface Specialists for Management
// Company tabs (Funding, Revenue, Compensation, Overhead, Company, ...).
//
// Phase 3b (current): the Funding + Revenue tabs ship as real Specialists
// returning AnalystVerdict via the Surface Router. Legacy evaluator
// re-exports stay in place so non-verdict call sites keep compiling
// during the migration cycle.
//
// Spec: docs/architecture/analyst/mgmt-co-specialists.md

// Phase 3b Specialists (AnalystVerdict-shaped).
export {
  createFundingSpecialist,
  type FundingSpecialistOptions,
} from "./funding-specialist";
export {
  createRevenueSpecialist,
  type RevenueSpecialistOptions,
} from "./revenue-specialist";

// Legacy re-exports — kept for back-compat with any caller that hasn't
// migrated to the verdict contract yet (currently: nothing on the read
// path; the /save-tab handler now uses Specialists). Will be removed once
// the dialog + tests are off WatchdogResult.
export {
  evaluateCapitalRaise,
  evaluateStub as evaluateCapitalRaiseStub,
} from "../../../watchdog/capitalRaiseEvaluator";
export type {
  WatchdogSeverity,
  WatchdogActionKind,
  WatchdogAction,
  WatchdogResult,
  CapitalRaiseInputs,
} from "../../../watchdog/capitalRaiseEvaluator";

export { evaluateRevenue } from "../../../watchdog/revenueEvaluator";
export type { RevenueInputs } from "../../../watchdog/revenueEvaluator";

// Specialist ids (single source of truth so the Router registry, the route
// handler, and tests all agree).
export const MGMT_CO_FUNDING_ID = "mgmt-co.funding" as const;
export const MGMT_CO_REVENUE_ID = "mgmt-co.revenue" as const;

import type { AnalystWatchdogBenchmarks } from "@shared/schema";
import type { RevenueBenchmarks } from "@shared/constants-revenue-benchmarks";
import {
  createSurfaceRouter,
  type SurfaceRouter,
  type SurfaceRouterDeps,
} from "../../router/surface-router";
import { createFundingSpecialist } from "./funding-specialist";
import { createRevenueSpecialist } from "./revenue-specialist";

export interface MgmtCoBenchmarks {
  funding: AnalystWatchdogBenchmarks;
  revenue: RevenueBenchmarks;
}

/**
 * Builds a SurfaceRouter pre-registered with the mgmt-co Specialists.
 * The route handler builds one of these per request (cheap — pure objects)
 * to keep the Router stateless across concurrent requests.
 */
export function createMgmtCoRouter(
  deps: SurfaceRouterDeps,
  benchmarks: MgmtCoBenchmarks,
  options: { evidenceAsOf?: string } = {},
): SurfaceRouter {
  const router = createSurfaceRouter(deps);
  router.register(
    MGMT_CO_FUNDING_ID,
    createFundingSpecialist(benchmarks.funding, { evidenceAsOf: options.evidenceAsOf }),
  );
  router.register(
    MGMT_CO_REVENUE_ID,
    createRevenueSpecialist(benchmarks.revenue, { evidenceAsOf: options.evidenceAsOf }),
  );
  return router;
}
