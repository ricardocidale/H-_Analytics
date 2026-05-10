import {
  runFundingSpecialist,
  Tier1UnavailableError,
} from "../ai/specialists/mgmt-co-funding-runner";
import {
  getLpComparables,
  getRevenueComparables,
  getCompensationComparables,
  getOverheadComparables,
  getCompanyComparables,
  getPropertyDefaultsComparables,
} from "../ai/specialists/live-comparables";
import { withFundingDefaults } from "../finance/apply-funding-defaults";
import type {
  FundingPromptInputContext,
  FundingAnalysisSummary,
  ReferenceBrandSummary,
} from "../ai/specialists/mgmt-co-funding-prompt-input-builder";
import {
  buildFundingCacheKey,
  computeCacheKey,
} from "../ai/specialists/mgmt-co-funding-prompt-input-builder";
import { computeCompanyProjection } from "../finance/service";
import { analyzeFundingNeeds } from "@engine/funding/funding-predictor";
import type { PropertyInput } from "@engine/types";
import type { CapitalRaiseInputs } from "@engine/watchdog/capitalRaiseEvaluator";
import { ICP_MODEL_PROFILES, type IcpModelTier } from "@shared/constants-benchmarks";
import { DEFAULT_PROJECTION_YEARS } from "@shared/constants";
import { DEFAULT_RUNWAY_NEED_MONTHS_PLACEHOLDER } from "@shared/constants-funding";
import {
  runRevenueSpecialist,
  Tier1UnavailableError as RevenueTier1UnavailableError,
} from "../ai/specialists/mgmt-co-revenue-runner";
import type { RevenuePromptInputContext } from "../ai/specialists/mgmt-co-revenue-prompt-input-builder";
import { buildRevenueCacheKey } from "../ai/specialists/mgmt-co-revenue-prompt-input-builder";
import type { RevenueInputs } from "@engine/watchdog/revenueEvaluator";
import { DEFAULT_REVENUE_BENCHMARKS } from "@shared/constants-revenue-benchmarks";
import {
  runCompensationSpecialist,
  Tier1UnavailableError as CompensationTier1UnavailableError,
} from "../ai/specialists/mgmt-co-compensation-runner";
import type { CompensationPromptInputContext } from "../ai/specialists/mgmt-co-compensation-prompt-input-builder";
import { buildCompensationCacheKey } from "../ai/specialists/mgmt-co-compensation-prompt-input-builder";
import type { CompensationInputs } from "@engine/watchdog/compensationEvaluator";
import { DEFAULT_COMPENSATION_BENCHMARKS } from "@shared/constants-compensation-benchmarks";
import {
  runOverheadSpecialist,
  Tier1UnavailableError as OverheadTier1UnavailableError,
} from "../ai/specialists/mgmt-co-overhead-runner";
import type { OverheadPromptInputContext } from "../ai/specialists/mgmt-co-overhead-prompt-input-builder";
import { buildOverheadCacheKey } from "../ai/specialists/mgmt-co-overhead-prompt-input-builder";
import type { OverheadInputs } from "@engine/watchdog/overheadEvaluator";
import { DEFAULT_OVERHEAD_BENCHMARKS } from "@shared/constants-overhead-benchmarks";
import {
  runCompanySpecialist,
  Tier1UnavailableError as CompanyTier1UnavailableError,
} from "../ai/specialists/mgmt-co-company-runner";
import type { CompanyPromptInputContext } from "../ai/specialists/mgmt-co-company-prompt-input-builder";
import { buildCompanyCacheKey } from "../ai/specialists/mgmt-co-company-prompt-input-builder";
import type { CompanyInputs } from "@engine/watchdog/companyEvaluator";
import { DEFAULT_COMPANY_BENCHMARKS } from "@shared/constants-company-benchmarks";
import {
  runPropertyDefaultsSpecialist,
  Tier1UnavailableError as PropertyDefaultsTier1UnavailableError,
} from "../ai/specialists/mgmt-co-property-defaults-runner";
import type { PropertyDefaultsPromptInputContext } from "../ai/specialists/mgmt-co-property-defaults-prompt-input-builder";
import { buildPropertyDefaultsCacheKey } from "../ai/specialists/mgmt-co-property-defaults-prompt-input-builder";
import type { PropertyDefaultsInputs } from "@engine/watchdog/propertyDefaultsEvaluator";
import { DEFAULT_PROPERTY_DEFAULTS_BENCHMARKS } from "@shared/constants-property-defaults-benchmarks";
import { storage } from "../storage";
import { logger } from "../logger";
import { ENGINE_VERSION } from "../ai/engine-version";
import { type CompanyCacheInputs } from "@engine/analyst/cognitive/cache-keys";
import { resolveCompanyPersona } from "../ai/specialists/resolve-persona";
import { gaToGlobalInput, deriveTrancheGapMonths } from "./analyst-admin-utils";

// ────────────────────────────────────────────────────────────────────────────
// G1.5c-v1 — Funding Specialist v1 path
// ────────────────────────────────────────────────────────────────────────────

/**
 * Assemble the v1 deps + invoke `runFundingSpecialist`. Pure orchestration:
 * reads saved state via storage facade, builds the FundingPromptInputContext,
 * and calls the runner. Throws Tier1UnavailableError on any failure (the
 * route handler catches and degrades to Tier-0).
 *
 * v1 deferrals: Live LP comparables → G6-P3; Persona resolution → G6-P3;
 * Verdict cache → G6-P3; N+1 panels → G6-P2 (single-shot Opus for v1).
 */
export async function runFundingV1Path(userId: number) {
  const ga = await storage.getGlobalAssumptions(userId);
  if (!ga) throw new Tier1UnavailableError("globalAssumptions row missing for user", null);

  // ICP model gate — require the user to choose a management company scale
  // (A / B / C) before The Analyst can range the Funding tab. Without this,
  // Opus is guessing raise amounts with no anchor. The client renders a
  // model-selection dialog when it sees ICP_MODEL_REQUIRED.
  const icpTier = (ga.icpModelTier ?? null) as IcpModelTier | null;
  if (!icpTier || !ICP_MODEL_PROFILES[icpTier]) {
    return { __icpModelRequired: true, models: ICP_MODEL_PROFILES } as const;
  }
  const icpModel = ICP_MODEL_PROFILES[icpTier];

  // Apply admin-Default overlay (G1.5b cascade) so the runner sees the
  // resolved cascade values, not raw NULLs.
  const overlaidGa = await withFundingDefaults(ga);

  const benchmarks = await storage.getAnalystWatchdogBenchmarks(userId);
  const properties = await storage.getAllProperties(userId);

  // Build CapitalRaiseInputs from the resolved globalAssumptions row.
  const inputs: CapitalRaiseInputs = {
    runwayBufferMonths: overlaidGa.runwayBufferMonths,
    sizingOvershootPct: overlaidGa.sizingOvershootPct,
    trancheGapMonths: deriveTrancheGapMonths(overlaidGa),
    revenueRampDelayMonths: overlaidGa.revenueRampDelayMonths,
    burnFlexDownPct: overlaidGa.burnFlexDownPct,
  };

  const persona = resolveCompanyPersona(properties);

  // Portfolio aggregate — count + raise need from the saved Funding-tab amounts.
  const totalRaiseNeedUsd =
    (overlaidGa.capitalRaise1Amount ?? 0) +
    (overlaidGa.capitalRaise2Amount ?? 0) +
    ((overlaidGa.capitalRaise3Amount as number | null) ?? 0);

  // Engine analysis — non-fatal: computation failure must not block the verdict.
  let engineAnalysis: FundingAnalysisSummary | undefined;
  try {
    if (properties.length > 0) {
      const globalInput = gaToGlobalInput(overlaidGa as unknown as Record<string, unknown>, DEFAULT_PROJECTION_YEARS);
      const { companyMonthly } = computeCompanyProjection({
        properties: properties as unknown as PropertyInput[],
        globalAssumptions: globalInput,
        projectionYears: DEFAULT_PROJECTION_YEARS,
      });
      const analysis = analyzeFundingNeeds(companyMonthly, {
        ...globalInput,
        capitalRaiseValuationCap: (overlaidGa.capitalRaiseValuationCap as number | null) ?? undefined,
        capitalRaiseDiscountRate: (overlaidGa.capitalRaiseDiscountRate as number | null) ?? undefined,
      });
      engineAnalysis = {
        totalRaiseNeeded: analysis.totalRaiseNeeded,
        monthlyBurnRate: analysis.monthlyBurnRate,
        breakevenMonth: analysis.breakevenMonth,
        monthsOfRunway: analysis.monthsOfRunway,
        fundingGap: analysis.fundingGap,
        peakCashDeficit: analysis.peakCashDeficit,
        tranches: analysis.tranches.map((t) => ({ amountUsd: t.amount, monthIndex: t.month })),
      };
    }
  } catch (engineErr: unknown) {
    logger.warn(
      `runFundingV1Path: engine analysis failed for user ${userId}: ${engineErr instanceof Error ? engineErr.message : engineErr}`,
      "analyst-admin",
    );
  }

  const portfolio: FundingPromptInputContext["portfolio"] = {
    propertyCount: properties.length,
    totalRaiseNeedUsd,
    runwayNeedMonths: engineAnalysis?.monthsOfRunway ?? DEFAULT_RUNWAY_NEED_MONTHS_PLACEHOLDER,
  };

  // Fetch reference brands — non-fatal (brand data is orientation-grade only).
  let referenceBrands: ReferenceBrandSummary[] = [];
  try {
    const rawBrands = await storage.getReferenceBrands();
    referenceBrands = rawBrands.map((b) => ({
      brandName: b.brandName,
      niche: b.niche ?? null,
      adrUsd: b.adrUsd ?? null,
      occupancyPct: b.occupancyPct ?? null,
      revparUsd: b.revparUsd ?? null,
      propertyCount: b.propertyCount ?? null,
      geographicFocus: b.geographicFocus ?? null,
    }));
  } catch {
    // Non-fatal: proceed without brand comp-set rather than blocking verdict
  }

  const ctx: FundingPromptInputContext = {
    inputs,
    persona,
    portfolio,
    icpModel,
    priorVerdicts: [], // v1: no composition; G6-P3 wires verdict-cache reads
    referenceBrands: referenceBrands.length > 0 ? referenceBrands : undefined,
    engineAnalysis,
    userTranches: [
      { amountUsd: (overlaidGa.capitalRaise1Amount as number | null) ?? null, dateLabel: (overlaidGa.capitalRaise1Date as string | null) ?? null },
      { amountUsd: (overlaidGa.capitalRaise2Amount as number | null) ?? null, dateLabel: (overlaidGa.capitalRaise2Date as string | null) ?? null },
      { amountUsd: (overlaidGa.capitalRaise3Amount as number | null) ?? null, dateLabel: (overlaidGa.capitalRaise3Date as string | null) ?? null },
    ],
  };

  const comparables = await getLpComparables();
  const startTime = Date.now();
  const result = await runFundingSpecialist(ctx, benchmarks, comparables);

  // ── Phase 5C-task-1 (NAI-27): verdict cache write — non-fatal ──
  try {
    const companyInputs: CompanyCacheInputs = {
      country: ga.companyCountry ?? null,
      capitalRaise1Amount: ga.capitalRaise1Amount ?? null,
      capitalRaise2Amount: ga.capitalRaise2Amount ?? null,
      baseManagementFee: ga.baseManagementFee ?? null,
      incentiveManagementFee: ga.incentiveManagementFee ?? null,
    };
    const verdictKey = buildFundingCacheKey({
      specialistId: "mgmt-co.funding",
      companyInputs,
      persona,
      scenarioId: null,
      entityId: userId,
      engineVersion: ENGINE_VERSION,
    });
    const runRecord = await storage.createResearchRun({
      userId,
      entityType: "company",
      entityId: userId,
      scenarioId: null,
      tier: 1,
      status: "completed",
      completedAt: new Date(),
      durationMs: Date.now() - startTime,
      metadata: { specialist: "mgmt-co.funding" },
    });
    await storage.updateResearchRun(runRecord.id, {
      cacheKey: computeCacheKey(verdictKey),
      cacheInputsHash: verdictKey.inputContextHash,
    });
  } catch (cacheErr: unknown) {
    logger.warn(
      `runFundingV1Path: cache write failed for user ${userId}: ${cacheErr instanceof Error ? cacheErr.message : cacheErr}`,
      "analyst-admin",
    );
  }

  return result;
}

// ────────────────────────────────────────────────────────────────────────────
// G2-v1 — Revenue Specialist v1 path
// ────────────────────────────────────────────────────────────────────────────

/**
 * Assemble the v1 deps + invoke `runRevenueSpecialist`. Reads the user's
 * saved globalAssumptions, builds RevenuePromptInputContext, and calls the
 * runner. Throws RevenueTier1UnavailableError on any failure; the route
 * handler catches and degrades to Tier-0.
 */
export async function runRevenueV1Path(userId: number): Promise<Awaited<ReturnType<typeof runRevenueSpecialist>>> {
  const ga = await storage.getGlobalAssumptions(userId);
  if (!ga) throw new RevenueTier1UnavailableError("globalAssumptions row missing for user", null);

  const properties = await storage.getAllProperties(userId);

  const inputs: RevenueInputs = {
    marketingRate: ga.defaultCostRateMarketing ?? null,
    fbRevenueShare: ga.defaultRevShareFb ?? null,
    eventsRevenueShare: ga.defaultRevShareEvents ?? null,
    otherRevenueShare: ga.defaultRevShareOther ?? null,
    cateringBoostPct: ga.defaultCateringBoostPct ?? null,
  };

  const persona = resolveCompanyPersona(properties);

  const activeProperties = properties.filter((p) => p.roomCount != null && (p.roomCount as number) > 0);
  const avgOccupancyRate =
    activeProperties.length > 0
      ? activeProperties.reduce((s, p) => s + p.startOccupancy, 0) / activeProperties.length
      : 0.65;
  const avgAdr =
    activeProperties.length > 0
      ? activeProperties.reduce((s, p) => s + p.startAdr, 0) / activeProperties.length
      : 350;

  const portfolio: RevenuePromptInputContext["portfolio"] = {
    propertyCount: properties.length,
    avgOccupancyRate,
    avgAdr,
  };

  const ctx: RevenuePromptInputContext = { inputs, persona, portfolio, priorVerdicts: [] };

  const comparables = await getRevenueComparables();
  const startTime = Date.now();
  const result = await runRevenueSpecialist(ctx, DEFAULT_REVENUE_BENCHMARKS, comparables);

  // ── Phase 5C-task-1 (NAI-27): verdict cache write — non-fatal ──
  try {
    const companyInputs: CompanyCacheInputs = {
      country: ga.companyCountry ?? null,
      numProperties: properties.length,
      baseManagementFee: ga.baseManagementFee ?? null,
      incentiveManagementFee: ga.incentiveManagementFee ?? null,
    };
    const verdictKey = buildRevenueCacheKey({ specialistId: "mgmt-co.revenue", companyInputs, persona, scenarioId: null, entityId: userId, engineVersion: ENGINE_VERSION });
    const runRecord = await storage.createResearchRun({ userId, entityType: "company", entityId: userId, scenarioId: null, tier: 1, status: "completed", completedAt: new Date(), durationMs: Date.now() - startTime, metadata: { specialist: "mgmt-co.revenue" } });
    await storage.updateResearchRun(runRecord.id, { cacheKey: computeCacheKey(verdictKey), cacheInputsHash: verdictKey.inputContextHash });
  } catch (cacheErr: unknown) {
    logger.warn(`runRevenueV1Path: cache write failed for user ${userId}: ${cacheErr instanceof Error ? cacheErr.message : cacheErr}`, "analyst-admin");
  }

  return result;
}

// ────────────────────────────────────────────────────────────────────────────
// G3 — Compensation Specialist N+1 path (Mariana / M)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Assemble the G3 deps + invoke `runCompensationSpecialist`. Throws
 * CompensationTier1UnavailableError on any failure; the route handler
 * catches and degrades to Tier-0.
 */
export async function runCompensationV1Path(userId: number): Promise<Awaited<ReturnType<typeof runCompensationSpecialist>>> {
  const ga = await storage.getGlobalAssumptions(userId);
  if (!ga) throw new CompensationTier1UnavailableError("globalAssumptions row missing for user", null);

  const properties = await storage.getAllProperties(userId);

  const inputs: CompensationInputs = {
    partnerCompYear1: ga.partnerCompYear1 ?? null,
    partnerCompYear10: ga.partnerCompYear10 ?? null,
    partnerCountYear1: ga.partnerCountYear1 ?? null,
    staffSalary: ga.staffSalary ?? null,
    staffTier3Fte: ga.staffTier3Fte ?? null,
  };

  const persona = resolveCompanyPersona(properties);

  const icpTier = (ga.icpModelTier as IcpModelTier | null) ?? "B";
  const icpProfile = ICP_MODEL_PROFILES[icpTier];
  const portfolio: CompensationPromptInputContext["portfolio"] = {
    propertyCount: properties.length,
    totalManagementCoRevenueUsd: icpProfile.managementCoRevenueUsd.typical,
    monthlyBurnUsd: icpProfile.monthlyBurnUsd,
  };

  const ctx: CompensationPromptInputContext = { inputs, persona, portfolio, priorVerdicts: [] };

  const comparables = await getCompensationComparables();
  const startTime = Date.now();
  const result = await runCompensationSpecialist(ctx, DEFAULT_COMPENSATION_BENCHMARKS, comparables);

  // ── Phase 5C-task-1 (NAI-27): verdict cache write — non-fatal ──
  try {
    const companyInputs: CompanyCacheInputs = { country: ga.companyCountry ?? null, numProperties: properties.length, baseManagementFee: ga.baseManagementFee ?? null, incentiveManagementFee: ga.incentiveManagementFee ?? null };
    const verdictKey = buildCompensationCacheKey({ specialistId: "mgmt-co.compensation", companyInputs, persona, scenarioId: null, entityId: userId, engineVersion: ENGINE_VERSION });
    const runRecord = await storage.createResearchRun({ userId, entityType: "company", entityId: userId, scenarioId: null, tier: 1, status: "completed", completedAt: new Date(), durationMs: Date.now() - startTime, metadata: { specialist: "mgmt-co.compensation" } });
    await storage.updateResearchRun(runRecord.id, { cacheKey: computeCacheKey(verdictKey), cacheInputsHash: verdictKey.inputContextHash });
  } catch (cacheErr: unknown) {
    logger.warn(`runCompensationV1Path: cache write failed for user ${userId}: ${cacheErr instanceof Error ? cacheErr.message : cacheErr}`, "analyst-admin");
  }

  return result;
}

// ────────────────────────────────────────────────────────────────────────────
// P7-B Phase 2 — Overhead Specialist N+1 path (Natália / N)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Assemble the Phase 2 deps + invoke `runOverheadSpecialist`. Throws
 * OverheadTier1UnavailableError on any failure; the route handler catches
 * and degrades to Tier-0.
 */
export async function runOverheadV1Path(userId: number): Promise<Awaited<ReturnType<typeof runOverheadSpecialist>>> {
  const ga = await storage.getGlobalAssumptions(userId);
  if (!ga) throw new OverheadTier1UnavailableError("globalAssumptions row missing for user", null);

  const properties = await storage.getAllProperties(userId);

  const inputs: OverheadInputs = {
    officeLeaseStart: ga.officeLeaseStart ?? null,
    professionalServicesStart: ga.professionalServicesStart ?? null,
    techInfraStart: ga.techInfraStart ?? null,
    businessInsuranceStart: ga.businessInsuranceStart ?? null,
    travelCostPerClient: ga.travelCostPerClient ?? null,
    itLicensePerClient: ga.itLicensePerClient ?? null,
  };

  const persona = resolveCompanyPersona(properties);

  const icpTier = (ga.icpModelTier as IcpModelTier | null) ?? "B";
  const icpProfile = ICP_MODEL_PROFILES[icpTier];
  const portfolio: OverheadPromptInputContext["portfolio"] = {
    propertyCount: properties.length,
    totalManagementCoRevenueUsd: icpProfile.managementCoRevenueUsd.typical,
    monthlyBurnUsd: icpProfile.monthlyBurnUsd,
  };

  const ctx: OverheadPromptInputContext = { inputs, persona, portfolio, priorVerdicts: [] };

  const comparables = await getOverheadComparables();
  const startTime = Date.now();
  const result = await runOverheadSpecialist(ctx, DEFAULT_OVERHEAD_BENCHMARKS, comparables);

  // ── Phase 5C-task-1 (NAI-27): verdict cache write — non-fatal ──
  try {
    const companyInputs: CompanyCacheInputs = { country: ga.companyCountry ?? null, numProperties: properties.length, baseManagementFee: ga.baseManagementFee ?? null, incentiveManagementFee: ga.incentiveManagementFee ?? null };
    const verdictKey = buildOverheadCacheKey({ specialistId: "mgmt-co.overhead", companyInputs, persona, scenarioId: null, entityId: userId, engineVersion: ENGINE_VERSION });
    const runRecord = await storage.createResearchRun({ userId, entityType: "company", entityId: userId, scenarioId: null, tier: 1, status: "completed", completedAt: new Date(), durationMs: Date.now() - startTime, metadata: { specialist: "mgmt-co.overhead" } });
    await storage.updateResearchRun(runRecord.id, { cacheKey: computeCacheKey(verdictKey), cacheInputsHash: verdictKey.inputContextHash });
  } catch (cacheErr: unknown) {
    logger.warn(`runOverheadV1Path: cache write failed for user ${userId}: ${cacheErr instanceof Error ? cacheErr.message : cacheErr}`, "analyst-admin");
  }

  return result;
}

// ────────────────────────────────────────────────────────────────────────────
// P7-B Phase 2 — Company Specialist N+1 path (Olívia / O)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Assemble the Phase 2 deps + invoke `runCompanySpecialist`. Throws
 * CompanyTier1UnavailableError on any failure; the route handler catches
 * and degrades to Tier-0.
 */
export async function runCompanyV1Path(userId: number): Promise<Awaited<ReturnType<typeof runCompanySpecialist>>> {
  const ga = await storage.getGlobalAssumptions(userId);
  if (!ga) throw new CompanyTier1UnavailableError("globalAssumptions row missing for user", null);

  const properties = await storage.getAllProperties(userId);

  const inputs: CompanyInputs = {
    baseManagementFee: ga.baseManagementFee ?? null,
    incentiveManagementFee: ga.incentiveManagementFee ?? null,
    companyTaxRate: ga.companyTaxRate ?? null,
    costOfEquity: ga.costOfEquity ?? null,
  };

  const persona = resolveCompanyPersona(properties);

  const icpTier = (ga.icpModelTier as IcpModelTier | null) ?? "B";
  const icpProfile = ICP_MODEL_PROFILES[icpTier];
  const portfolio: CompanyPromptInputContext["portfolio"] = {
    propertyCount: properties.length,
    totalManagementCoRevenueUsd: icpProfile.managementCoRevenueUsd.typical,
    monthlyBurnUsd: icpProfile.monthlyBurnUsd,
  };

  const ctx: CompanyPromptInputContext = { inputs, persona, portfolio, priorVerdicts: [] };

  const comparables = await getCompanyComparables();
  const startTime = Date.now();
  const result = await runCompanySpecialist(ctx, DEFAULT_COMPANY_BENCHMARKS, comparables);

  // ── Phase 5C-task-1 (NAI-27): verdict cache write — non-fatal ──
  try {
    const companyInputs: CompanyCacheInputs = { country: ga.companyCountry ?? null, numProperties: properties.length, baseManagementFee: ga.baseManagementFee ?? null, incentiveManagementFee: ga.incentiveManagementFee ?? null };
    const verdictKey = buildCompanyCacheKey({ specialistId: "mgmt-co.company", companyInputs, persona, scenarioId: null, entityId: userId, engineVersion: ENGINE_VERSION });
    const runRecord = await storage.createResearchRun({ userId, entityType: "company", entityId: userId, scenarioId: null, tier: 1, status: "completed", completedAt: new Date(), durationMs: Date.now() - startTime, metadata: { specialist: "mgmt-co.company" } });
    await storage.updateResearchRun(runRecord.id, { cacheKey: computeCacheKey(verdictKey), cacheInputsHash: verdictKey.inputContextHash });
  } catch (cacheErr: unknown) {
    logger.warn(`runCompanyV1Path: cache write failed for user ${userId}: ${cacheErr instanceof Error ? cacheErr.message : cacheErr}`, "analyst-admin");
  }

  return result;
}

// ────────────────────────────────────────────────────────────────────────────
// P7-B Phase 2 — Property-Defaults Specialist N+1 path (Paula / P)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Assemble the Phase 2 deps + invoke `runPropertyDefaultsSpecialist`. Throws
 * PropertyDefaultsTier1UnavailableError on any failure; the route handler
 * catches and degrades to Tier-0.
 */
export async function runPropertyDefaultsV1Path(userId: number): Promise<Awaited<ReturnType<typeof runPropertyDefaultsSpecialist>>> {
  const ga = await storage.getGlobalAssumptions(userId);
  if (!ga) throw new PropertyDefaultsTier1UnavailableError("globalAssumptions row missing for user", null);

  const properties = await storage.getAllProperties(userId);

  const inputs: PropertyDefaultsInputs = {
    eventExpenseRate: ga.eventExpenseRate ?? null,
    otherExpenseRate: ga.otherExpenseRate ?? null,
    utilitiesVariableSplit: ga.utilitiesVariableSplit ?? null,
    salesCommissionRate: ga.salesCommissionRate ?? null,
  };

  const persona = resolveCompanyPersona(properties);

  const icpTier = (ga.icpModelTier as IcpModelTier | null) ?? "B";
  const icpProfile = ICP_MODEL_PROFILES[icpTier];
  const portfolio: PropertyDefaultsPromptInputContext["portfolio"] = {
    propertyCount: properties.length,
    totalManagementCoRevenueUsd: icpProfile.managementCoRevenueUsd.typical,
    monthlyBurnUsd: icpProfile.monthlyBurnUsd,
  };

  const ctx: PropertyDefaultsPromptInputContext = { inputs, persona, portfolio, priorVerdicts: [] };

  const comparables = await getPropertyDefaultsComparables();
  const startTime = Date.now();
  const result = await runPropertyDefaultsSpecialist(ctx, DEFAULT_PROPERTY_DEFAULTS_BENCHMARKS, comparables);

  // ── Phase 5C-task-1 (NAI-27): verdict cache write — non-fatal ──
  try {
    const companyInputs: CompanyCacheInputs = { country: ga.companyCountry ?? null, numProperties: properties.length, baseManagementFee: ga.baseManagementFee ?? null, incentiveManagementFee: ga.incentiveManagementFee ?? null };
    const verdictKey = buildPropertyDefaultsCacheKey({ specialistId: "mgmt-co.property-defaults", companyInputs, persona, scenarioId: null, entityId: userId, engineVersion: ENGINE_VERSION });
    const runRecord = await storage.createResearchRun({ userId, entityType: "company", entityId: userId, scenarioId: null, tier: 1, status: "completed", completedAt: new Date(), durationMs: Date.now() - startTime, metadata: { specialist: "mgmt-co.property-defaults" } });
    await storage.updateResearchRun(runRecord.id, { cacheKey: computeCacheKey(verdictKey), cacheInputsHash: verdictKey.inputContextHash });
  } catch (cacheErr: unknown) {
    logger.warn(`runPropertyDefaultsV1Path: cache write failed for user ${userId}: ${cacheErr instanceof Error ? cacheErr.message : cacheErr}`, "analyst-admin");
  }

  return result;
}
