import {
  runPortfolioRaiseSpecialist,
  Tier1UnavailableError as PortfolioRaiseTier1UnavailableError,
} from "../ai/specialists/portfolio-raise-runner";
import type { PortfolioRaisePromptInputContext } from "../ai/specialists/portfolio-raise-prompt-input-builder";
import { getPortfolioRaiseComparables } from "../ai/specialists/portfolio-raise-live-comparables";
import { analyzePortfolioCapitalRaise } from "@engine/funding/portfolio-capital-raise";
import { generatePropertyProForma } from "../finance/core/property-pipeline";
import {
  runPropertyRiskIntelligenceSpecialist,
  Tier1UnavailableError as PropertyTier1UnavailableError,
} from "../ai/specialists/property-risk-intelligence-runner";
import type { PropertyRiskIntelligencePromptInputContext } from "../ai/specialists/property-risk-intelligence-prompt";
import { getInflationComparables } from "../ai/specialists/live-comparables";
import { storage } from "../storage";
import { logger } from "../logger";
import { ENGINE_VERSION } from "../ai/engine-version";
import {
  computeInputContextHash,
  type PropertyCacheInputs,
  type VerdictCacheKey,
} from "@engine/analyst/cognitive/cache-keys";
import { computeCacheKey } from "../ai/specialists/mgmt-co-funding-prompt-input-builder";
import { resolveCompanyPersona, resolvePropertyPersona } from "../ai/specialists/resolve-persona";
import { gaToGlobalInput, modelConstantToCountryInflationOutlook } from "./analyst-admin-utils";
import { DEFAULT_PROJECTION_YEARS } from "@shared/constants";
import type { PropertyInput } from "@engine/types";
import { createHash } from "node:crypto";

export { PortfolioRaiseTier1UnavailableError, PropertyTier1UnavailableError };

/**
 * runPortfolioRaiseV1Path — Portfolio Capital Raise Specialist (v1).
 *
 * Loads all user properties, generates per-property pro formas, runs
 * analyzePortfolioCapitalRaise(), maps to the slim summary type, and
 * invokes runPortfolioRaiseSpecialist (single-shot Opus).
 *
 * Returns { __noProperties: true } when the user has no properties so
 * the route handler can return a structured 400 instead of an error.
 * Throws PortfolioRaiseTier1UnavailableError on specialist failure.
 *
 * v1 deferrals: verdict cache, live LP comparables, ICP model gate.
 */
export async function runPortfolioRaiseV1Path(userId: number) {
  const ga = await storage.getGlobalAssumptions(userId);
  if (!ga) throw new PortfolioRaiseTier1UnavailableError("globalAssumptions row missing for user");

  const properties = await storage.getAllProperties(userId);
  if (properties.length === 0) return { __noProperties: true } as const;

  const globalInput = gaToGlobalInput(ga as unknown as Record<string, unknown>, DEFAULT_PROJECTION_YEARS);

  // Per-property pro formas — non-fatal per property; analysis proceeds with
  // whatever subset succeeds.
  const proFormas: Record<number, ReturnType<typeof generatePropertyProForma>> = {};
  for (let i = 0; i < properties.length; i++) {
    try {
      proFormas[i] = generatePropertyProForma(
        properties[i] as unknown as Parameters<typeof generatePropertyProForma>[0],
        globalInput,
        DEFAULT_PROJECTION_YEARS * 12,
      );
    } catch (propErr) {
      logger.warn(
        `runPortfolioRaiseV1Path: pro-forma failed for property ${i} (user ${userId}): ${propErr instanceof Error ? propErr.message : propErr}`,
        "analyst-admin",
      );
    }
  }

  // Engine analysis — non-fatal; specialist runs with whatever data is available.
  let engineAnalysis: ReturnType<typeof analyzePortfolioCapitalRaise> | undefined;
  try {
    engineAnalysis = analyzePortfolioCapitalRaise(
      properties as unknown as Parameters<typeof analyzePortfolioCapitalRaise>[0],
      proFormas,
      globalInput,
    );
  } catch (engineErr) {
    logger.warn(
      `runPortfolioRaiseV1Path: analyzePortfolioCapitalRaise failed for user ${userId}: ${engineErr instanceof Error ? engineErr.message : engineErr}`,
      "analyst-admin",
    );
  }

  // Map engine output to the slim summary type (route layer owns this mapping per ADR-007).
  const analysis = engineAnalysis ?? {
    perPropertyEquity: [],
    totalEquityRequired: 0,
    firstCloseMinimum: 0,
    rampOverlapWindows: [],
    portfolioDscrBlended: null,
    impliedIrr: null,
    rampCarryUnderstated: true,
  };

  const analysisSummary = {
    totalEquityRequired: analysis.totalEquityRequired,
    firstCloseMinimum: analysis.firstCloseMinimum,
    portfolioDscrBlended: analysis.portfolioDscrBlended,
    rampOverlapWindowCount: analysis.rampOverlapWindows.length,
    peakConcurrentRampCount: analysis.rampOverlapWindows.reduce(
      (max, w) => Math.max(max, w.concurrentCount),
      0,
    ),
    impliedIrr: analysis.impliedIrr,
    rampCarryUnderstated: analysis.rampCarryUnderstated,
    perPropertyEquity: analysis.perPropertyEquity.map((p, i) => ({
      propertyIndex: p.propertyIndex,
      propertyLabel: (properties[i] as { name?: string | null })?.name ?? `Property ${i + 1}`,
      equityRequired: p.equityRequired,
      deploymentMonth: p.deploymentMonth,
      ltv: p.ltv,
      estimatedDscr: p.estimatedDscr,
    })),
  };

  const persona = resolveCompanyPersona(properties);

  const ctx: PortfolioRaisePromptInputContext = {
    analysisSummary,
    persona,
    priorVerdicts: [],
  };

  const comparables = await getPortfolioRaiseComparables();
  return runPortfolioRaiseSpecialist(ctx, comparables);
}

/**
 * runPropertyRiskIntelligenceV1Path — G1.6-v1 Property Risk Intelligence (Daniela / D).
 *
 * Throws `PropertyTier1UnavailableError` on any failure; the route
 * handler catches and returns HTTP 503 (no legacy fallback for property scope).
 *
 * v1 deferrals:
 *   - CountryInflationOutlook: resolved from `model_constants` when
 *     available (requires Isadora / macro-research Specialist to have run);
 *     `null` when no canonical row exists — runner emits developing-conviction.
 *   - Persona: derived from property fields (hospitalityType, marketTier,
 *     country); G6-P3 will enrich with full persona resolution.
 */
export async function runPropertyRiskIntelligenceV1Path(
  propertyId: number,
  userId: number,
) {
  const property = await storage.getProperty(propertyId);
  if (!property) {
    throw new PropertyTier1UnavailableError(
      `Property ${propertyId} not found`,
      null,
    );
  }

  // Resolve CountryInflationOutlook from model_constants (Isadora's domain).
  // Returns null when no canonical row exists — the runner's honest-fail
  // path handles this per the inflation-cascade rule.
  const canonicalRow = await storage.findCanonical(
    "inflationRate",
    property.country ?? null,
    null,
  );
  const countryInflationOutlook = canonicalRow
    ? modelConstantToCountryInflationOutlook(canonicalRow)
    : null;

  const persona = resolvePropertyPersona(property);

  const ctx: PropertyRiskIntelligencePromptInputContext = {
    persona,
    inputs: {
      propertyInflationRate: property.inflationRate ?? null,
      country: property.country ?? undefined,
      city: property.city ?? undefined,
      businessModel: property.businessModel ?? undefined,
    },
    countryInflationOutlook,
  };

  const inflationComparables = await getInflationComparables();
  const startTime = Date.now();
  const result = await runPropertyRiskIntelligenceSpecialist(ctx, inflationComparables);

  // ── Phase 5C-task-1 (NAI-27): verdict cache write — non-fatal ──
  try {
    const propertyInputs: PropertyCacheInputs = {
      type: property.hospitalityType ?? null,
      businessModel: property.businessModel ?? null,
      country: property.country ?? null,
      stateProvince: property.stateProvince ?? null,
      marketTier: property.marketTier ?? null,
    };
    const personaHash = createHash("sha256")
      .update(JSON.stringify(persona))
      .digest("hex");
    const inputContextHash = computeInputContextHash("property", propertyInputs, []);
    const verdictKey: VerdictCacheKey = {
      scenarioId: null,
      entityType: "property",
      entityId: propertyId,
      fieldGroup: [],
      personaHash,
      inputContextHash,
      engineVersion: ENGINE_VERSION,
    };
    const runRecord = await storage.createResearchRun({
      userId,
      entityType: "property",
      entityId: propertyId,
      scenarioId: null,
      tier: 1,
      status: "completed",
      completedAt: new Date(),
      durationMs: Date.now() - startTime,
      metadata: { specialist: "property.risk-intelligence" },
    });
    await storage.updateResearchRun(runRecord.id, {
      cacheKey: computeCacheKey(verdictKey),
      cacheInputsHash: inputContextHash,
    });
  } catch (cacheErr: unknown) {
    logger.warn(
      `runPropertyRiskIntelligenceV1Path: cache write failed for property ${propertyId}: ${cacheErr instanceof Error ? cacheErr.message : cacheErr}`,
      "analyst-admin",
    );
  }

  return result;
}
