import { z } from "zod";
import { storage } from "../storage";
import type { PropertyInput, GlobalInput } from "@engine/types";
import type { ComputedResultsSnapshot } from "@shared/schema";
import type {
  ScenarioGlobalAssumptionsSnapshot,
  ScenarioPropertySnapshot,
  ScenarioFeeCategorySnapshot,
  ScenarioPhotoSnapshot,
  ScenarioServiceTemplateSnapshot,
} from "@shared/schema";
import { computeFullDiff, reconstructScenarioProperties } from "../scenarios/diff-engine";
import { computePortfolioProjection } from "../finance/service";
import { logger } from "../logger";

export function requireScenarioPermission(req: any, res: any, next: any) {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  if (!req.user.canManageScenarios) {
    return res.status(403).json({ error: "Scenario management is disabled for your account" });
  }
  next();
}

export const importScenarioSchema = z.object({
  name: z.string().min(1).max(60),
  description: z.string().max(1000).nullable().optional(),
  globalAssumptions: z.record(z.unknown()),
  properties: z.array(z.record(z.unknown())),
  feeCategories: z.record(z.array(z.record(z.unknown()))).optional(),
});

export const shareScenarioSchema = z.object({
  recipientEmail: z.string().email(),
  mode: z.enum(["single", "all"]),
  scenarioId: z.number().optional(),
});

export const crossQuerySchema = z.object({
  field: z.string().min(1),
});

export const recomputeBodySchema = z.object({
  projectionYears: z.number().int().min(1).max(30).optional(),
}).optional();

export const scenarioIdSchema = z.coerce.number().int().positive();

export async function checkScenarioAccess(scenarioId: number, userId: number, scenario: { userId: number }): Promise<boolean> {
  if (scenario.userId === userId) return true;
  const user = await storage.getUserById(userId);
  if (!user) return false;

  // Check legacy scenarioShares table
  const shares = await storage.getScenarioSharesForScenario(scenarioId);
  const hasLegacyAccess = shares.some(s =>
    (s.targetType === "user" && s.targetId === userId) ||
    (s.targetType === "company" && user.companyId != null && s.targetId === user.companyId)
  );
  if (hasLegacyAccess) return true;

  // Check new scenarioAccess table (specific + all grants)
  const sharedViaAccess = await storage.getScenariosSharedViaAccess(userId);
  return sharedViaAccess.some(s => s.id === scenarioId);
}

export function extractScenarioComputeInputs(scenario: { globalAssumptions: unknown; properties: unknown }, projectionYearsOverride?: number) {
  const scenarioGA = scenario.globalAssumptions as Record<string, unknown> | null;
  const scenarioProps = (scenario.properties || []) as Array<Record<string, unknown>>;

  const propertyInputs: PropertyInput[] = scenarioProps.map((p, i) => ({
    ...p,
    id: (p.id as number) ?? undefined,
    name: (p.name as string) ?? `Property_${i + 1}`,
  } as PropertyInput));

  const dbDebt = (scenarioGA?.debtAssumptions ?? null) as Record<string, unknown> | null;
  const projYears = projectionYearsOverride ?? Number(scenarioGA?.projectionYears ?? 10);

  const globalInput: GlobalInput = {
    modelStartDate: (scenarioGA?.modelStartDate as string) ?? new Date().toISOString().slice(0, 10),
    inflationRate: Number(scenarioGA?.inflationRate ?? 0.03),
    marketingRate: Number(scenarioGA?.marketingRate ?? 0.01),
    debtAssumptions: {
      interestRate: Number(dbDebt?.interestRate ?? 0.065),
      amortizationYears: Number(dbDebt?.amortizationYears ?? 25),
    },
    projectionYears: projYears,
  };

  return { propertyInputs, globalInput, projYears, scenarioProps, scenarioGA };
}

export async function ensureDefaultScenario(userId: number): Promise<void> {
  const existing = await storage.getDefaultScenario(userId);
  if (existing) return;

  const user = await storage.getUserById(userId);
  if (!user) return;

  const fi = (user.firstName || "")[0]?.toUpperCase() || "";
  const li = (user.lastName || "")[0]?.toUpperCase() || "";
  const initials = (fi + li) || user.email.split("@")[0].slice(0, 2).toUpperCase();
  const name = `${initials} Default Scenario`;

  const { scenarioGA, scenarioProps, propertyFeeCategories, propertyPhotos, serviceTemplates, diffResult } = await buildCreateSnapshotData(userId);
  const { computedResults, computeHash } = tryComputeResults(scenarioGA, scenarioProps);

  try {
    const scenario = await storage.createScenario({
      userId,
      name,
      description: "Automatically created baseline scenario",
      globalAssumptions: scenarioGA,
      properties: scenarioProps,
      feeCategories: propertyFeeCategories,
      propertyPhotos,
      serviceTemplates,
      computedResults,
      computeHash,
      kind: "default",
      isLocked: true,
    });

    if (diffResult.propertyDiffs.length > 0) {
      await storage.writePropertyOverrides(scenario.id, diffResult.propertyDiffs);
    }

    logger.info(`Created default scenario "${name}" (id=${scenario.id}) for userId=${userId}`, "scenario");
  } catch (err: unknown) {
    if ((err as Record<string, unknown>)?.code === "23505") {
      logger.info(`Default scenario already exists for userId=${userId} (concurrent creation)`, "scenario");
      return;
    }
    throw err;
  }
}

export function computeGhostName(manualCount: number, user: { firstName?: string | null; lastName?: string | null; email: string }): string {
  const fi = (user.firstName || "")[0]?.toUpperCase() || "";
  const li = (user.lastName || "")[0]?.toUpperCase() || "";
  const initials = (fi + li) || user.email.split("@")[0].slice(0, 2).toUpperCase();
  const num = String(manualCount + 1).padStart(2, "0");
  return `Scenario ${num} - ${initials}`;
}

export async function buildCreateSnapshotData(userId: number) {
  const assumptions = await storage.getGlobalAssumptions(userId);
  const properties = await storage.getAllProperties(userId);

  const propertyIds = properties.map(p => p.id);
  const feeCatsByPropId = await storage.getFeeCategoriesByProperties(propertyIds);

  const propertyFeeCategories: Record<string, ScenarioFeeCategorySnapshot[]> = {};
  const propertyPhotos: Record<string, ScenarioPhotoSnapshot[]> = {};
  for (const p of properties) {
    const feeKey = p.stableKey || p.name;
    propertyFeeCategories[feeKey] = (feeCatsByPropId[p.id] || []) as ScenarioFeeCategorySnapshot[];
  }

  const allTemplates = await storage.getAllServiceTemplates();
  const serviceTemplates: ScenarioServiceTemplateSnapshot[] = allTemplates.map(t => ({
    id: t.id,
    name: t.name,
    defaultRate: t.defaultRate,
    serviceModel: t.serviceModel,
    serviceMarkup: t.serviceMarkup,
    isActive: t.isActive,
    sortOrder: t.sortOrder,
  }));

  const scenarioGA: ScenarioGlobalAssumptionsSnapshot = (assumptions || {}) as ScenarioGlobalAssumptionsSnapshot;
  const scenarioProps: ScenarioPropertySnapshot[] = (properties || []) as ScenarioPropertySnapshot[];
  const diffResult = computeFullDiff(
    scenarioGA,
    scenarioProps,
    scenarioGA,
    scenarioProps
  );

  return { scenarioGA, scenarioProps, propertyFeeCategories, propertyPhotos, serviceTemplates, diffResult };
}

export function tryComputeResults(
  scenarioGA: ScenarioGlobalAssumptionsSnapshot,
  scenarioProps: ScenarioPropertySnapshot[]
): { computedResults: ComputedResultsSnapshot | null; computeHash: string | null } {
  try {
    const { propertyInputs, globalInput, projYears } = extractScenarioComputeInputs(
      { globalAssumptions: scenarioGA, properties: scenarioProps }
    );
    const computeResult = computePortfolioProjection({
      properties: propertyInputs,
      globalAssumptions: globalInput,
      projectionYears: projYears,
    });
    return {
      computedResults: {
        engineVersion: computeResult.engineVersion,
        computedAt: computeResult.computedAt,
        outputHash: computeResult.outputHash,
        projectionYears: computeResult.projectionYears,
        propertyCount: computeResult.propertyCount,
        auditOpinion: computeResult.validationSummary.opinion,
        consolidatedYearly: computeResult.consolidatedYearly,
      },
      computeHash: computeResult.outputHash,
    };
  } catch (computeErr: unknown) {
    logger.warn(`[scenario] Failed to compute results on save: ${computeErr}`, "scenarios");
    return { computedResults: null, computeHash: null };
  }
}

export interface LoadValidationResult {
  error?: { status: number; message: string };
  snapshotProps: ScenarioPropertySnapshot[];
  snapshotPropNames: string[];
  orphanedFeeCategories: string[];
  orphanedPhotos: string[];
}

export function validateLoadSnapshot(
  scenario: { properties: unknown; feeCategories: Record<string, unknown[]> | null | undefined; propertyPhotos: Record<string, unknown[]> | null | undefined },
): LoadValidationResult {
  const snapshotProps: ScenarioPropertySnapshot[] = (scenario.properties || []) as ScenarioPropertySnapshot[];
  const snapshotPropNames = snapshotProps.map(p => p.name).filter(Boolean);
  const snapshotFeeCats = scenario.feeCategories;

  if (snapshotProps.length === 0) {
    return { error: { status: 422, message: "Scenario snapshot contains no properties" }, snapshotProps, snapshotPropNames, orphanedFeeCategories: [], orphanedPhotos: [] };
  }

  const invalidProps = snapshotProps.filter(p => !p.name || typeof p.name !== "string");
  if (invalidProps.length > 0) {
    return { error: { status: 422, message: `Scenario snapshot contains ${invalidProps.length} property(ies) without a valid name` }, snapshotProps, snapshotPropNames, orphanedFeeCategories: [], orphanedPhotos: [] };
  }

  const validFeeKeys = new Set<string>([
    ...snapshotPropNames,
    ...snapshotProps.map(p => (p as Record<string, unknown>).stableKey as string).filter(Boolean),
  ]);
  const orphanedFeeCategories = snapshotFeeCats
    ? Object.keys(snapshotFeeCats).filter(key => !validFeeKeys.has(key))
    : [];

  return { snapshotProps, snapshotPropNames, orphanedFeeCategories, orphanedPhotos: [] };
}

export async function checkSharedPropertyAccess(
  scenarioId: number,
  userId: number,
  snapshotProps: ScenarioPropertySnapshot[]
): Promise<string | null> {
  const snapshotPropertyIds = snapshotProps
    .map(p => p.id)
    .filter((pid): pid is number => typeof pid === "number");

  if (snapshotPropertyIds.length > 0) {
    const requesterProperties = await storage.getAllProperties(userId);
    const requesterPropertyIds = new Set(requesterProperties.map(p => p.id));
    const unauthorizedIds = snapshotPropertyIds.filter(pid => !requesterPropertyIds.has(pid));
    if (unauthorizedIds.length > 0) {
      logger.warn(`[scenario-load] Scenario ${scenarioId}: user ${userId} lacks access to ${unauthorizedIds.length} property ID(s): ${unauthorizedIds.join(", ")}`, "scenarios");
      return "Scenario contains properties you do not have access to";
    }
  }
  return null;
}

export function buildPreviewData(
  overrides: Array<{ propertyId: number | null; propertyName: string; changeType: string; overrides: unknown; basePropertySnapshot: unknown }>,
  liveProperties: Array<Record<string, unknown>>,
  scenario: { id: number; name: string; description: string | null; globalAssumptions: unknown; properties: unknown; feeCategories: unknown; version: number | null }
) {
  const propertyDiffs = overrides.map(o => ({
    propertyId: o.propertyId ?? null,
    propertyName: o.propertyName,
    changeType: o.changeType as "added" | "removed" | "modified" | "unchanged",
    overrides: (o.overrides || {}) as Record<string, unknown>,
    baseSnapshot: (o.basePropertySnapshot || null) as Record<string, unknown> | null,
  }));

  const previewProperties = propertyDiffs.length > 0
    ? reconstructScenarioProperties(liveProperties, propertyDiffs)
    : scenario.properties;

  const changedFields = overrides.flatMap(o => {
    const ov = (o.overrides || {}) as Record<string, unknown>;
    return Object.keys(ov).map(field => ({
      propertyName: o.propertyName,
      field,
      scenarioValue: ov[field],
      changeType: o.changeType,
    }));
  });

  return {
    id: scenario.id,
    name: scenario.name,
    description: scenario.description,
    globalAssumptions: scenario.globalAssumptions,
    properties: previewProperties,
    feeCategories: scenario.feeCategories,
    changedFields,
    version: scenario.version,
    hasOverrides: overrides.length > 0,
  };
}

export function buildCrossQueryResult(
  userScenarios: Array<{ id: number; name: string; properties: unknown }>,
  field: string
): Array<{ scenarioId: number; scenarioName: string; properties: Array<{ propertyName: string; value: unknown }> }> {
  const scenarioBaseValues: Array<{
    scenarioId: number;
    scenarioName: string;
    properties: Array<{ propertyName: string; value: unknown }>;
  }> = [];

  for (const scenario of userScenarios) {
    const props = (scenario.properties || []) as Array<Record<string, unknown>>;
    const propValues = props
      .filter(p => field in p)
      .map(p => ({ propertyName: p.name as string, value: p[field] }));
    if (propValues.length > 0) {
      scenarioBaseValues.push({
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        properties: propValues,
      });
    }
  }

  return scenarioBaseValues;
}

export function buildDriftCheckResponse(
  stored: { outputHash: string; engineVersion: string; computedAt: unknown },
  currentOutputHash: string,
  currentEngineVersion: string
) {
  const hashMatch = stored.outputHash === currentOutputHash;
  let status: "match" | "input_changed" | "engine_changed" = "match";
  let details = "Current computation matches stored result";

  if (!hashMatch) {
    if (stored.engineVersion !== currentEngineVersion) {
      status = "engine_changed";
      details = `Engine version changed: ${stored.engineVersion} → ${currentEngineVersion}`;
    } else {
      status = "input_changed";
      details = "Inputs have changed since last computation";
    }
  }

  return {
    drift: !hashMatch,
    status,
    details,
    storedHash: stored.outputHash,
    currentHash: currentOutputHash,
    storedEngineVersion: stored.engineVersion,
    currentEngineVersion,
    storedAt: stored.computedAt,
  };
}

export function determineDriftStatus(
  stored: { outputHash: string; engineVersion: string } | null,
  currentOutputHash: string,
  currentEngineVersion: string
): { drift: boolean; status: "match" | "input_changed" | "engine_changed" | "first_compute" } {
  if (!stored) return { drift: true, status: "first_compute" };
  if (stored.outputHash === currentOutputHash) return { drift: false, status: "match" };
  if (stored.engineVersion !== currentEngineVersion) return { drift: true, status: "engine_changed" };
  return { drift: true, status: "input_changed" };
}
