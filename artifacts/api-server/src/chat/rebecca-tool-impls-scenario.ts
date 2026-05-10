import { storage } from "../storage";
import { logger } from "../logger";
import { isAdminRole } from "@shared/constants";
import type { Scenario, UpdateScenario } from "@workspace/db";
import { sendScenarioShareNotification, sendAdminShareNotification } from "../integrations/resend";
import { getAppUrl } from "../providers/config";
import { fullName } from "../routes/helpers";
import type { DataChangedEntry, ToolContext } from "./rebecca-tool-types";
import { requireNumericArg, requireObjectArg } from "./rebecca-tool-types";

// ---------------------------------------------------------------------------
// list_scenarios / get_scenario
// ---------------------------------------------------------------------------

export async function toolListScenarios(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const allScenarios = await storage.getScenariosByUser(ctx.userId);
  const propertyId = args.propertyId as number | undefined;

  const filtered = propertyId != null
    ? allScenarios.filter((s: Scenario) =>
        Array.isArray(s.properties) &&
        (s.properties as Array<{ id?: number }>).some((p) => p.id === propertyId)
      )
    : allScenarios;

  return {
    result: {
      scenarios: filtered.map((s: Scenario) => ({
        id: s.id,
        name: s.name,
        isLocked: s.isLocked,
        kind: s.kind,
      })),
    },
  };
}

export async function toolGetScenario(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const id = args.id as number;
  const sc = await storage.getScenario(id);
  if (!sc || sc.userId !== ctx.userId) {
    return { result: { error: "Not found" } };
  }
  return {
    result: {
      scenario: {
        id: sc.id,
        name: sc.name,
        isLocked: sc.isLocked,
        kind: sc.kind,
        globalAssumptions: sc.globalAssumptions,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// create_scenario
// ---------------------------------------------------------------------------

export async function toolCreateScenario(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const propertyId = args.propertyId as number;
  const name = args.name as string;
  const cloneFromId = args.cloneFromId as number | undefined;

  let sourceId: number;

  if (cloneFromId != null) {
    const sourceSc = await storage.getScenario(cloneFromId);
    if (!sourceSc || sourceSc.userId !== ctx.userId) {
      return { result: { error: "Not found" } };
    }
    sourceId = cloneFromId;
  } else {
    const allScenarios = await storage.getScenariosByUser(ctx.userId);
    const matchesProperty = (s: Scenario): boolean =>
      Array.isArray(s.properties)
      && (s.properties as Array<{ id?: number }>).some((p) => p.id === propertyId);
    const sourceSc =
      allScenarios.find((s: Scenario) => s.kind === "default" && matchesProperty(s))
      ?? allScenarios.find(matchesProperty);
    if (!sourceSc) {
      return {
        result: {
          error: `Cannot create scenario — no existing scenario covers property ${propertyId}`,
        },
      };
    }
    sourceId = sourceSc.id;
  }

  const clone = await storage.cloneScenario(sourceId, ctx.userId);

  let finalScenario = clone;
  if (clone.name !== name) {
    const updated = await storage.updateScenario(clone.id, { name } as UpdateScenario);
    if (updated) finalScenario = updated;
  }

  return {
    result: { scenario: { id: finalScenario.id, name: finalScenario.name } },
    dataChanged: { entityType: "scenario", entityId: finalScenario.id },
  };
}

// ---------------------------------------------------------------------------
// update_scenario / update_scenario_assumptions
// ---------------------------------------------------------------------------

const REBECCA_SCENARIO_UPDATE_KEYS = ["name", "description", "tags"] as const;

export async function toolUpdateScenario(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const id = args.id as number;
  const rawFields = args.fields as Record<string, unknown>;

  const sc = await storage.getScenario(id);
  if (!sc || sc.userId !== ctx.userId) {
    return { result: { error: "Not found" } };
  }

  const allowed = new Set<string>(REBECCA_SCENARIO_UPDATE_KEYS);
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawFields)) {
    if (allowed.has(k)) fields[k] = v;
  }

  await storage.updateScenario(id, fields as UpdateScenario);

  return {
    result: { success: true, updated: Object.keys(fields) },
    dataChanged: { entityType: "scenario", entityId: id },
  };
}

const PROJECTION_YEARS_MAX = 50;
const SCENARIO_ASSUMPTION_VALIDATORS: Record<string, (v: unknown) => boolean> = {
  modelStartDate: (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v).getTime()),
  baseManagementFeePercent: (v) => typeof v === "number" && v >= 0 && v <= 1,
  projectionYears: (v) => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= PROJECTION_YEARS_MAX,
};

export async function toolUpdateScenarioAssumptions(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const idResult = requireNumericArg(args, "id");
  if (!idResult.ok) return idResult.result;
  const id = idResult.value;
  const patchesResult = requireObjectArg(args, "patches");
  if (!patchesResult.ok) return patchesResult.result;
  const rawPatches = patchesResult.value;

  const sc = await storage.getScenario(id);
  if (!sc || sc.userId !== ctx.userId) {
    return { result: { error: "Not found" } };
  }
  if (sc.isLocked) {
    return { result: { error: "Scenario is locked and cannot be edited" } };
  }

  const validated: Record<string, unknown> = {};
  const rejected: string[] = [];
  for (const [key, value] of Object.entries(rawPatches)) {
    const validate = SCENARIO_ASSUMPTION_VALIDATORS[key];
    if (!validate) {
      rejected.push(`unknown key: ${key}`);
      continue;
    }
    if (!validate(value)) {
      rejected.push(`invalid value for ${key}`);
      continue;
    }
    validated[key] = value;
  }

  if (Object.keys(validated).length === 0) {
    return { result: { error: `No valid patches supplied. ${rejected.join("; ")}` } };
  }

  const mergedGA = {
    ...(sc.globalAssumptions as Record<string, unknown>),
    ...validated,
  };

  await storage.updateScenarioSnapshot(id, {
    globalAssumptions: mergedGA,
    properties: sc.properties,
    feeCategories: sc.feeCategories ?? undefined,
    propertyPhotos: sc.propertyPhotos ?? undefined,
    serviceTemplates: sc.serviceTemplates ?? undefined,
    computedResults: null,
    computeHash: null,
  });

  return {
    result: {
      success: true,
      updated: Object.keys(validated),
      ...(rejected.length > 0 ? { rejected } : {}),
    },
    dataChanged: { entityType: "scenario", entityId: id },
  };
}

// ---------------------------------------------------------------------------
// lock_scenario / delete_scenario
// ---------------------------------------------------------------------------

export async function toolLockScenario(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const id = args.id as number;

  const sc = await storage.getScenario(id);
  if (!sc || sc.userId !== ctx.userId) {
    return { result: { error: "Not found" } };
  }

  await storage.updateScenario(id, { isLocked: true } as unknown as UpdateScenario);

  return {
    result: { success: true },
    dataChanged: { entityType: "scenario", entityId: id },
  };
}

export async function toolDeleteScenario(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const id = args.id as number;

  const sc = await storage.getScenario(id);
  if (!sc || sc.userId !== ctx.userId) {
    return { result: { error: "Not found" } };
  }

  await storage.softDeleteScenario(id, ctx.userId);

  return {
    result: { success: true },
    dataChanged: { entityType: "scenario", entityId: id },
  };
}

// ---------------------------------------------------------------------------
// share_scenario / compare_scenarios / list_scenario_shares / revoke_share
// ---------------------------------------------------------------------------

export async function toolShareScenario(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const scenarioId = typeof args.scenarioId === "number" ? args.scenarioId : Number(args.scenarioId);
  const recipientEmail = typeof args.recipientEmail === "string" ? args.recipientEmail.trim() : "";
  if (!scenarioId || isNaN(scenarioId)) return { result: { error: "scenarioId must be a positive integer" } };
  if (!recipientEmail) return { result: { error: "recipientEmail is required" } };

  const sharer = await storage.getUserById(ctx.userId);
  if (!sharer) return { result: { error: "Authenticated user not found" } };

  if (recipientEmail === sharer.email) {
    return { result: { error: "You cannot share scenarios with yourself" } };
  }

  const scenario = await storage.getScenario(scenarioId);
  if (!scenario || scenario.userId !== ctx.userId) {
    return { result: { error: "Not found" } };
  }

  const recipient = await storage.getUserByEmail(recipientEmail);
  if (!recipient) {
    return { result: { shares: [], recipientName: null } };
  }

  const share = await storage.shareScenarioWithUser(scenarioId, recipient.id, ctx.userId);
  if (!share) {
    return { result: { shares: [], recipientName: null } };
  }

  const sharerDisplayName = fullName(sharer) || sharer.email;
  const recipientDisplayName = fullName(recipient) || recipient.email;
  const portalUrl = `${getAppUrl()}/scenarios`;

  sendScenarioShareNotification({
    to: recipient.email,
    recipientName: recipientDisplayName,
    sharerName: sharerDisplayName,
    sharerEmail: sharer.email,
    scenarioNames: [scenario.name],
    mode: "single",
    portalUrl,
  }).catch(err => logger.warn(`Failed to send share notification: ${err instanceof Error ? err.message : String(err)}`, "rebecca"));

  if (!isAdminRole(sharer.role)) {
    const allUsers = await storage.getAllUsers();
    const admins = allUsers.filter(u => isAdminRole(u.role) && u.email !== sharer.email);
    for (const admin of admins) {
      sendAdminShareNotification({
        to: admin.email,
        sharerName: sharerDisplayName,
        sharerEmail: sharer.email,
        recipientName: recipientDisplayName,
        recipientEmail: recipient.email,
        scenarioNames: [scenario.name],
        mode: "single",
      }).catch(err => logger.warn(`Failed to send admin share notification: ${err instanceof Error ? err.message : String(err)}`, "rebecca"));
    }
  }

  return {
    result: { shares: [share], recipientName: recipientDisplayName },
    dataChanged: { entityType: "scenario", entityId: scenarioId },
  };
}

export async function toolCompareScenarios(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown }> {
  const id1Result = requireNumericArg(args, "scenarioId1");
  if (!id1Result.ok) return id1Result.result;
  const id2Result = requireNumericArg(args, "scenarioId2");
  if (!id2Result.ok) return id2Result.result;

  const [s1, s2] = await Promise.all([
    storage.getScenario(id1Result.value),
    storage.getScenario(id2Result.value),
  ]);

  if (!s1 || s1.userId !== ctx.userId) {
    return { result: { error: `Scenario ${id1Result.value} not found` } };
  }
  if (!s2 || s2.userId !== ctx.userId) {
    return { result: { error: `Scenario ${id2Result.value} not found` } };
  }

  const comparison = storage.compareScenarios(s1, s2);
  return { result: comparison };
}

export async function toolListScenarioShares(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown }> {
  const scenarioIdResult = requireNumericArg(args, "scenarioId");
  if (!scenarioIdResult.ok) return scenarioIdResult.result;
  const scenarioId = scenarioIdResult.value;

  const user = await storage.getUserById(ctx.userId);
  if (!user) return { result: { error: "User not found" } };

  const scenario = await storage.getScenario(scenarioId);
  if (!scenario || (scenario.userId !== ctx.userId && !isAdminRole(user.role))) {
    return { result: { error: "Not found" } };
  }

  const shares = await storage.getScenarioSharesForScenario(scenarioId);
  return {
    result: shares.map(s => ({
      id: s.id,
      granteeId: s.granteeId,
      grantType: s.grantType,
      createdAt: s.createdAt,
    })),
  };
}

export async function toolRevokeShare(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const scenarioIdResult = requireNumericArg(args, "scenarioId");
  if (!scenarioIdResult.ok) return scenarioIdResult.result;
  const scenarioId = scenarioIdResult.value;

  const granteeIdResult = requireNumericArg(args, "granteeId");
  if (!granteeIdResult.ok) return granteeIdResult.result;
  const granteeId = granteeIdResult.value;

  const scenario = await storage.getScenario(scenarioId);
  if (!scenario || scenario.userId !== ctx.userId) {
    return { result: { error: "Not found" } };
  }

  await storage.revokeScenarioAccess(ctx.userId, granteeId, scenarioId);
  return {
    result: { success: true },
    dataChanged: { entityType: "scenario", entityId: scenarioId },
  };
}
