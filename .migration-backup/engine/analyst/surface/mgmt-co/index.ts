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
  type FundingSpecialistDeps,
} from "./funding-specialist";
export {
  createRevenueSpecialist,
  type RevenueSpecialistOptions,
} from "./revenue-specialist";
export {
  createCompensationSpecialist,
  type CompensationSpecialistOptions,
} from "./compensation-specialist";
export {
  createOverheadSpecialist,
  type OverheadSpecialistOptions,
} from "./overhead-specialist";
export {
  createCompanySpecialist,
  type CompanySpecialistOptions,
} from "./company-specialist";
export {
  createPropertyDefaultsSpecialist,
  type PropertyDefaultsSpecialistOptions,
} from "./property-defaults-specialist";

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

export { evaluateCompensation } from "../../../watchdog/compensationEvaluator";
export type { CompensationInputs } from "../../../watchdog/compensationEvaluator";

export { evaluateOverhead } from "../../../watchdog/overheadEvaluator";
export type { OverheadInputs } from "../../../watchdog/overheadEvaluator";

export { evaluateCompany } from "../../../watchdog/companyEvaluator";
export type { CompanyInputs } from "../../../watchdog/companyEvaluator";

export { evaluatePropertyDefaults } from "../../../watchdog/propertyDefaultsEvaluator";
export type { PropertyDefaultsInputs } from "../../../watchdog/propertyDefaultsEvaluator";

// Specialist ids (single source of truth so the Router registry, the route
// handler, and tests all agree).
export const MGMT_CO_FUNDING_ID = "mgmt-co.funding" as const;
export const MGMT_CO_REVENUE_ID = "mgmt-co.revenue" as const;
export const MGMT_CO_COMPENSATION_ID = "mgmt-co.compensation" as const;
export const MGMT_CO_OVERHEAD_ID = "mgmt-co.overhead" as const;
export const MGMT_CO_COMPANY_ID = "mgmt-co.company" as const;
export const MGMT_CO_PROPERTY_DEFAULTS_ID = "mgmt-co.property-defaults" as const;

import type { AnalystWatchdogBenchmarks } from "@shared/schema";
import type { RevenueBenchmarks } from "@shared/constants-revenue-benchmarks";
import type { CompensationBenchmarks } from "@shared/constants-compensation-benchmarks";
import type { OverheadBenchmarks } from "@shared/constants-overhead-benchmarks";
import type { CompanyBenchmarks } from "@shared/constants-company-benchmarks";
import type { PropertyDefaultsBenchmarks } from "@shared/constants-property-defaults-benchmarks";
import {
  createSurfaceRouter,
  type SpecialistFn,
  type SurfaceRouter,
  type SurfaceRouterDeps,
} from "../../router/surface-router";
import { createFundingSpecialist } from "./funding-specialist";
import type { FundingSpecialistDeps } from "./funding-specialist";
import { createRevenueSpecialist } from "./revenue-specialist";
import { createCompensationSpecialist } from "./compensation-specialist";
import { createOverheadSpecialist } from "./overhead-specialist";
import { createCompanySpecialist } from "./company-specialist";
import { createPropertyDefaultsSpecialist } from "./property-defaults-specialist";

export interface MgmtCoBenchmarks {
  funding: AnalystWatchdogBenchmarks;
  revenue: RevenueBenchmarks;
  compensation: CompensationBenchmarks;
  overhead: OverheadBenchmarks;
  company: CompanyBenchmarks;
  propertyDefaults: PropertyDefaultsBenchmarks;
}

/**
 * P6a: thrown by a Specialist's required-fields pre-check when the inbound
 * payload is missing one or more admin-declared required fields. The route
 * handler catches this and converts it into a 200 response carrying
 * `requiredFieldsMissing` alongside `verdict: null` — the save still
 * succeeds (drafts are always permissive) but the UI gets a deterministic
 * signal that the Specialist did not run.
 */
export class RequiredFieldsMissingError extends Error {
  readonly specialistId: string;
  readonly missingFields: readonly string[];
  constructor(specialistId: string, missingFields: readonly string[]) {
    super(
      `Specialist "${specialistId}" required fields missing: ${missingFields.join(", ")}`,
    );
    this.name = "RequiredFieldsMissingError";
    this.specialistId = specialistId;
    this.missingFields = missingFields;
  }
}

/**
 * Resolve a dot-path inside the Specialist payload. Returns `undefined` if
 * any segment is absent. Treats arrays as plain objects (numeric keys work).
 */
function resolvePath(payload: unknown, path: string): unknown {
  if (payload === null || typeof payload !== "object") return undefined;
  const segments = path.split(".");
  let cur: unknown = payload;
  for (const seg of segments) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
    if (cur === undefined) return undefined;
  }
  return cur;
}

/**
 * Returns the subset of `requiredFields` that resolve to a "missing" value
 * inside the payload. Missing = `null | undefined | "" | NaN`.
 *
 * Field names are dot-paths into the payload object. Bare keys (e.g.
 * `"targetEquityRaiseUsd"`) and namespaced paths (e.g.
 * `"funding.targetEquityRaiseUsd"`) both work — the latter only resolves
 * if the payload itself nests under that key.
 */
export function findMissingRequiredFields(
  payload: unknown,
  requiredFields: readonly string[],
): string[] {
  const missing: string[] = [];
  for (const name of requiredFields) {
    const v = resolvePath(payload, name);
    if (v === null || v === undefined) {
      missing.push(name);
      continue;
    }
    if (typeof v === "string" && v.trim() === "") {
      missing.push(name);
      continue;
    }
    if (typeof v === "number" && Number.isNaN(v)) {
      missing.push(name);
      continue;
    }
  }
  return missing;
}

/**
 * Returns the subset of catalog `candidateFields[].key` entries that are
 * absent from the payload AND not currently required-or-recommended (i.e.
 * the toggle is "off"). The Required Fields tab surfaces these as
 * one-click "promote to Recommended / Hard-required" recommendations.
 *
 * Only "off" candidates are surfaced because "hard" / "recommended" keys
 * are already actioned — they appear in their own UI elsewhere on the tab.
 */
export function findObservedMissingCandidateFields(
  payload: unknown,
  candidateFields: ReadonlyArray<{ key: string }>,
  fieldRequirements: Record<string, "hard" | "recommended" | "off"> | null | undefined,
): string[] {
  const reqs = fieldRequirements ?? {};
  const offKeys = candidateFields
    .map((c) => c.key)
    .filter((k) => (reqs[k] ?? "off") === "off");
  return findMissingRequiredFields(payload, offKeys);
}

/**
 * Wraps a SpecialistFn with a deterministic required-fields pre-check.
 * If `requiredFields` is empty/undefined, the wrapper is a no-op and the
 * inner Specialist is invoked unchanged. Otherwise the wrapper throws
 * `RequiredFieldsMissingError` before the inner Specialist sees the
 * payload.
 */
function withRequiredFieldsGate(
  specialistId: string,
  inner: SpecialistFn,
  requiredFields: readonly string[] | undefined,
): SpecialistFn {
  if (!requiredFields || requiredFields.length === 0) return inner;
  return (payload, context) => {
    const missing = findMissingRequiredFields(payload, requiredFields);
    if (missing.length > 0) {
      throw new RequiredFieldsMissingError(specialistId, missing);
    }
    return inner(payload, context);
  };
}

/**
 * Builds a SurfaceRouter pre-registered with the mgmt-co Specialists.
 * The route handler builds one of these per request (cheap — pure objects)
 * to keep the Router stateless across concurrent requests.
 */
export interface MgmtCoSpecialistConfigs {
  funding?: {
    promptTemplate?: string;
    modelResourceId?: number | null;
    /** P6a: admin-declared required field names; pre-check gates dispatch. */
    requiredFields?: readonly string[];
    /** G1.5c: when provided, the Funding Specialist runs Tier-1 (cognitive
     *  pipeline + cache + comparables). When undefined, falls back to
     *  Tier-0 with `meta.fallbackReason: "tier1_unavailable"` per ADR-008.
     *  Backward-compatible — existing callers that omit `deps` keep the
     *  prior Phase-3b behaviour. */
    deps?: FundingSpecialistDeps;
  };
  revenue?: {
    promptTemplate?: string;
    modelResourceId?: number | null;
    /** P6a: admin-declared required field names; pre-check gates dispatch. */
    requiredFields?: readonly string[];
  };
  compensation?: {
    promptTemplate?: string;
    modelResourceId?: number | null;
    /** P6a: admin-declared required field names; pre-check gates dispatch. */
    requiredFields?: readonly string[];
  };
  overhead?: {
    promptTemplate?: string;
    modelResourceId?: number | null;
    /** P6a: admin-declared required field names; pre-check gates dispatch. */
    requiredFields?: readonly string[];
  };
  company?: {
    promptTemplate?: string;
    modelResourceId?: number | null;
    /** P6a: admin-declared required field names; pre-check gates dispatch. */
    requiredFields?: readonly string[];
  };
  propertyDefaults?: {
    promptTemplate?: string;
    modelResourceId?: number | null;
    /** P6a: admin-declared required field names; pre-check gates dispatch. */
    requiredFields?: readonly string[];
  };
}

export function createMgmtCoRouter(
  deps: SurfaceRouterDeps,
  benchmarks: MgmtCoBenchmarks,
  options: { evidenceAsOf?: string; configs?: MgmtCoSpecialistConfigs } = {},
): SurfaceRouter {
  const router = createSurfaceRouter(deps);
  router.register(
    MGMT_CO_FUNDING_ID,
    withRequiredFieldsGate(
      MGMT_CO_FUNDING_ID,
      createFundingSpecialist(
        benchmarks.funding,
        {
          evidenceAsOf: options.evidenceAsOf,
          promptTemplate: options.configs?.funding?.promptTemplate,
          modelResourceId: options.configs?.funding?.modelResourceId ?? null,
        },
        options.configs?.funding?.deps,
      ),
      options.configs?.funding?.requiredFields,
    ),
  );
  router.register(
    MGMT_CO_REVENUE_ID,
    withRequiredFieldsGate(
      MGMT_CO_REVENUE_ID,
      createRevenueSpecialist(benchmarks.revenue, {
        evidenceAsOf: options.evidenceAsOf,
        promptTemplate: options.configs?.revenue?.promptTemplate,
        modelResourceId: options.configs?.revenue?.modelResourceId ?? null,
      }),
      options.configs?.revenue?.requiredFields,
    ),
  );
  router.register(
    MGMT_CO_COMPENSATION_ID,
    withRequiredFieldsGate(
      MGMT_CO_COMPENSATION_ID,
      createCompensationSpecialist(benchmarks.compensation, {
        evidenceAsOf: options.evidenceAsOf,
        promptTemplate: options.configs?.compensation?.promptTemplate,
        modelResourceId: options.configs?.compensation?.modelResourceId ?? null,
      }),
      options.configs?.compensation?.requiredFields,
    ),
  );
  router.register(
    MGMT_CO_OVERHEAD_ID,
    withRequiredFieldsGate(
      MGMT_CO_OVERHEAD_ID,
      createOverheadSpecialist(benchmarks.overhead, {
        evidenceAsOf: options.evidenceAsOf,
        promptTemplate: options.configs?.overhead?.promptTemplate,
        modelResourceId: options.configs?.overhead?.modelResourceId ?? null,
      }),
      options.configs?.overhead?.requiredFields,
    ),
  );
  router.register(
    MGMT_CO_COMPANY_ID,
    withRequiredFieldsGate(
      MGMT_CO_COMPANY_ID,
      createCompanySpecialist(benchmarks.company, {
        evidenceAsOf: options.evidenceAsOf,
        promptTemplate: options.configs?.company?.promptTemplate,
        modelResourceId: options.configs?.company?.modelResourceId ?? null,
      }),
      options.configs?.company?.requiredFields,
    ),
  );
  router.register(
    MGMT_CO_PROPERTY_DEFAULTS_ID,
    withRequiredFieldsGate(
      MGMT_CO_PROPERTY_DEFAULTS_ID,
      createPropertyDefaultsSpecialist(benchmarks.propertyDefaults, {
        evidenceAsOf: options.evidenceAsOf,
        promptTemplate: options.configs?.propertyDefaults?.promptTemplate,
        modelResourceId: options.configs?.propertyDefaults?.modelResourceId ?? null,
      }),
      options.configs?.propertyDefaults?.requiredFields,
    ),
  );
  return router;
}
