import { storage } from "../storage";
import type { ToolParam } from "./tool-types";
import type { Property, UpdateProperty, Scenario, UpdateScenario } from "@workspace/db";
import { updatePropertySchema } from "@workspace/db";
import { generateLocationAwareResearchValues } from "../data/researchSeeds";
import { appendIrisGap, clearIrisGaps, readIrisGaps } from "../ai/iris/workspace";
import { runIrisAgent, type IrisTrigger } from "../ai/iris/agent";
import { insertIrisRun, updateIrisRun, getLatestIrisRun } from "../storage/iris-runs";

// Named constant: estimated minutes for background research job (Category 2 — DEFAULT VARIABLE)
const RESEARCH_ESTIMATED_MINUTES = 2;

export type ToolContext = { userId: number };

export type DataChangedEntry = { entityType: "property" | "scenario"; entityId: number };

// ---------------------------------------------------------------------------
// Tool definitions (JSON Schema for LLM tool-calling)
// ---------------------------------------------------------------------------

export function getRebeccaTools(): ToolParam[] {
  return [
    {
      name: "list_properties",
      description: "List all properties in the user's portfolio. Returns id, name, country, and type for each property.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "get_property",
      description: "Get detailed information about a specific property including financial assumptions.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Property ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_scenarios",
      description: "List the user's scenarios. Optionally filter by a property ID (matched against properties snapshotted in the scenario).",
      parameters: {
        type: "object",
        properties: {
          propertyId: { type: "number", description: "Optional property ID to filter scenarios by" },
        },
        required: [],
      },
    },
    {
      name: "get_scenario",
      description: "Get details of a specific scenario including global assumptions.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Scenario ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "update_property",
      description: "Update a single field on a property. Returns the old and new values.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Property ID" },
          field: { type: "string", description: "Field name to update (must be a valid updatePropertySchema field)" },
          value: { description: "New value for the field" },
        },
        required: ["id", "field", "value"],
      },
    },
    {
      name: "create_scenario",
      description: "Create a new scenario. If cloneFromId is provided, clones that scenario; otherwise clones the user's default scenario. The new scenario is renamed to the provided name.",
      parameters: {
        type: "object",
        properties: {
          propertyId: { type: "number", description: "Property ID (informational; used to find a relevant source scenario)" },
          name: { type: "string", description: "Name for the new scenario" },
          cloneFromId: { type: "number", description: "Optional scenario ID to clone from" },
        },
        required: ["propertyId", "name"],
      },
    },
    {
      name: "update_scenario",
      description: "Partially update a scenario's fields (name, description, or tags).",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Scenario ID" },
          fields: {
            type: "object",
            description: "Partial scenario fields to update (name, description, tags)",
          },
        },
        required: ["id", "fields"],
      },
    },
    {
      name: "update_scenario_assumptions",
      description: "Patch a scenario's global financial assumptions (e.g. projectionYears, baseManagementFeePercent, modelStartDate). Merges the supplied key-value pairs into the existing snapshot. Fails if the scenario is locked.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Scenario ID" },
          patches: {
            type: "object",
            description: "Partial globalAssumptions fields to update (e.g. { projectionYears: 20, baseManagementFeePercent: 0.05 })",
          },
        },
        required: ["id", "patches"],
      },
    },
    {
      name: "lock_scenario",
      description: "Lock a scenario so it cannot be edited.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Scenario ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "delete_scenario",
      description: "Soft-delete a scenario (it can be recovered within 30 days).",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Scenario ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "trigger_research",
      description: "Trigger research value generation for a property using location-aware seed data.",
      parameters: {
        type: "object",
        properties: {
          propertyId: { type: "number", description: "Property ID" },
        },
        required: ["propertyId"],
      },
    },
    {
      name: "write_retrieval_gap",
      description: "Signal a retrieval gap — called when knowledge base search returns no confident results for a topic.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The topic or query that returned no results" },
        },
        required: ["query"],
      },
    },
    {
      name: "trigger_iris_health_check",
      description: "Run a quick Iris health check across configured data sources. Admin only.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      name: "trigger_iris_reindex",
      description: "Run a full Iris reindex of the knowledge base. Slower than a health check. Admin only.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      name: "clear_iris_gaps",
      description: "Clear the queue of pending retrieval gaps Iris is scheduled to ingest. Admin only.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      name: "get_iris_status",
      description: "Read Iris's most recent run summary and current pending gaps count. Admin only.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  ];
}

// ---------------------------------------------------------------------------
// Tool dispatcher
// ---------------------------------------------------------------------------

export async function dispatchRebeccaTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  try {
    switch (name) {
      case "list_properties":
        return await toolListProperties(ctx);
      case "get_property":
        return await toolGetProperty(args, ctx);
      case "list_scenarios":
        return await toolListScenarios(args, ctx);
      case "get_scenario":
        return await toolGetScenario(args, ctx);
      case "update_property":
        return await toolUpdateProperty(args, ctx);
      case "create_scenario":
        return await toolCreateScenario(args, ctx);
      case "update_scenario":
        return await toolUpdateScenario(args, ctx);
      case "update_scenario_assumptions":
        return await toolUpdateScenarioAssumptions(args, ctx);
      case "lock_scenario":
        return await toolLockScenario(args, ctx);
      case "delete_scenario":
        return await toolDeleteScenario(args, ctx);
      case "trigger_research":
        return await toolTriggerResearch(args, ctx);
      case "write_retrieval_gap":
        return await toolWriteRetrievalGap(args, ctx);
      case "trigger_iris_health_check":
        return await toolTriggerIrisHealthCheck(ctx);
      case "trigger_iris_reindex":
        return await toolTriggerIrisReindex(ctx);
      case "clear_iris_gaps":
        return await toolClearIrisGaps(ctx);
      case "get_iris_status":
        return await toolGetIrisStatus(ctx);
      default:
        return { result: { error: "Unknown tool" } };
    }
  } catch (err) {
    return { result: { error: err instanceof Error ? err.message : String(err) } };
  }
}

// ---------------------------------------------------------------------------
// Individual tool implementations
// ---------------------------------------------------------------------------

async function toolListProperties(
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const props = await storage.getAllProperties(ctx.userId);
  return {
    result: {
      properties: props.map((p: Property) => ({
        id: p.id,
        name: p.name,
        country: p.country,
        type: p.type,
      })),
    },
  };
}

async function toolGetProperty(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const id = args.id as number;
  const prop = await storage.getProperty(id);
  if (!prop || prop.userId !== ctx.userId) {
    return { result: { error: "Not found" } };
  }
  return {
    result: {
      property: {
        id: prop.id,
        name: prop.name,
        country: prop.country,
        type: prop.type,
        startAdr: prop.startAdr,
        maxOccupancy: prop.maxOccupancy,
        costRateMarketing: prop.costRateMarketing,
        exitCapRate: prop.exitCapRate,
        location: prop.location,
        city: prop.city,
        stateProvince: prop.stateProvince,
        purchasePrice: prop.purchasePrice,
        roomCount: prop.roomCount,
        startOccupancy: prop.startOccupancy,
        adrGrowthRate: prop.adrGrowthRate,
        taxRate: prop.taxRate,
        status: prop.status,
        market: prop.market,
      },
    },
  };
}

async function toolListScenarios(
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

async function toolGetScenario(
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

async function toolUpdateProperty(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const id = args.id as number;
  const field = args.field as string;
  const value = args.value;

  const prop = await storage.getProperty(id);
  if (!prop || prop.userId !== ctx.userId) {
    return { result: { error: "Not found" } };
  }

  if (!Object.keys(updatePropertySchema.shape).includes(field)) {
    return { result: { error: `Unknown field: ${field}` } };
  }

  // Validate the value against the field's schema before writing to the DB
  const fieldSchema = (updatePropertySchema.shape as Record<string, { safeParse: (v: unknown) => { success: boolean; error?: unknown } }>)[field];
  const parsed = fieldSchema.safeParse(value);
  if (!parsed.success) {
    return { result: { error: `Invalid value for field "${field}": ${String(parsed.error)}` } };
  }

  const before = (prop as unknown as Record<string, unknown>)[field];
  await storage.updateProperty(id, { [field]: value } as UpdateProperty);

  return {
    result: { success: true, field, before, after: value, displayName: prop.name },
    dataChanged: { entityType: "property", entityId: id },
  };
}

async function toolCreateScenario(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const propertyId = args.propertyId as number;
  const name = args.name as string;
  const cloneFromId = args.cloneFromId as number | undefined;

  let sourceId: number;

  if (cloneFromId != null) {
    // Verify ownership before cloning
    const sourceSc = await storage.getScenario(cloneFromId);
    if (!sourceSc || sourceSc.userId !== ctx.userId) {
      return { result: { error: "Not found" } };
    }
    sourceId = cloneFromId;
  } else {
    // Find a source scenario that already covers the requested property.
    // Prefer the user's default scenario for that property, then any scenario
    // for that property. Surface an error if none exists rather than silently
    // cloning an unrelated property's scenario.
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

  // Rename to requested name if the auto-generated clone name differs
  let finalScenario = clone;
  if (clone.name !== name) {
    // UpdateScenario officially covers name/description/tags; cast is safe here
    const updated = await storage.updateScenario(clone.id, { name } as UpdateScenario);
    if (updated) finalScenario = updated;
  }

  return {
    result: { scenario: { id: finalScenario.id, name: finalScenario.name } },
    dataChanged: { entityType: "scenario", entityId: finalScenario.id },
  };
}

// Whitelist of UpdateScenario keys Rebecca is allowed to mutate.
// Hard gate against LLM-supplied keys outside the documented contract
// (e.g. userId, kind, globalAssumptions) — stripToColumns at the storage
// layer would still let real DB columns through.
const REBECCA_SCENARIO_UPDATE_KEYS = ["name", "description", "tags"] as const;

async function toolUpdateScenario(
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

async function toolUpdateScenarioAssumptions(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const id = args.id as number;
  const patches = args.patches as Record<string, unknown>;

  const sc = await storage.getScenario(id);
  if (!sc || sc.userId !== ctx.userId) {
    return { result: { error: "Not found" } };
  }
  if (sc.isLocked) {
    return { result: { error: "Scenario is locked and cannot be edited" } };
  }

  const mergedGA = {
    ...(sc.globalAssumptions as Record<string, unknown>),
    ...patches,
  };

  await storage.updateScenarioSnapshot(id, {
    globalAssumptions: mergedGA,
    properties: sc.properties as import("@workspace/db").ScenarioPropertySnapshot[],
    feeCategories: sc.feeCategories as Record<string, import("@workspace/db").ScenarioFeeCategorySnapshot[]> | undefined,
    propertyPhotos: sc.propertyPhotos as Record<string, import("@workspace/db").ScenarioPhotoSnapshot[]> | undefined,
    serviceTemplates: sc.serviceTemplates as import("@workspace/db").ScenarioServiceTemplateSnapshot[] | undefined,
  });

  return {
    result: { success: true, updated: Object.keys(patches) },
    dataChanged: { entityType: "scenario", entityId: id },
  };
}

async function toolLockScenario(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const id = args.id as number;

  const sc = await storage.getScenario(id);
  if (!sc || sc.userId !== ctx.userId) {
    return { result: { error: "Not found" } };
  }

  // UpdateScenario type covers name/description/tags only; isLocked is applied via cast.
  // The storage layer accepts isLocked through its set() call on the scenarios table.
  await storage.updateScenario(id, { isLocked: true } as unknown as UpdateScenario);

  return {
    result: { success: true },
    dataChanged: { entityType: "scenario", entityId: id },
  };
}

async function toolDeleteScenario(
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

async function toolTriggerResearch(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const propertyId = args.propertyId as number;

  const prop = await storage.getProperty(propertyId);
  if (!prop || prop.userId !== ctx.userId) {
    return { result: { error: "Not found" } };
  }

  const seededValues = generateLocationAwareResearchValues({
    location: prop.location,
    streetAddress: prop.streetAddress,
    city: prop.city,
    stateProvince: prop.stateProvince,
    zipPostalCode: prop.zipPostalCode,
    country: prop.country,
    market: prop.market,
  });

  await storage.updateProperty(propertyId, { researchValues: seededValues } as UpdateProperty);

  return {
    result: { queued: true, estimatedMinutes: RESEARCH_ESTIMATED_MINUTES },
    dataChanged: { entityType: "property", entityId: propertyId },
  };
}

// ---------------------------------------------------------------------------
// Admin auth helper
// ---------------------------------------------------------------------------

/**
 * Returns an error result if the caller is not an admin, null otherwise.
 * Mirrors the `requireAdmin` middleware used in routes/admin/iris.ts.
 */
async function requireAdminCtx(ctx: ToolContext): Promise<{ result: { error: string } } | null> {
  const user = await storage.getUserById(ctx.userId);
  if (user?.role !== "admin") {
    return { result: { error: "Iris controls require admin access" } };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Iris tool helpers
// ---------------------------------------------------------------------------

/**
 * Shared implementation for the two Iris run-trigger tools.
 * Creates a DB run record, fires runIrisAgent async (fire-and-forget), and
 * returns immediately — mirroring POST /api/admin/iris/run behaviour.
 */
async function toolTriggerIrisRun(
  trigger: IrisTrigger,
  ctx: ToolContext,
): Promise<{ result: unknown }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  // Best-effort concurrency guard — no in-process lock available here, but the
  // DB check catches the common case of a run already tracked as "running".
  const latest = await getLatestIrisRun();
  if (latest?.status === "running") {
    return { result: { error: "An Iris run is already in progress" } };
  }

  const run = await insertIrisRun({ trigger, status: "running" });
  const runId = run.id;
  const startTs = Date.now();

  void runIrisAgent(trigger)
    .then((result) =>
      updateIrisRun(runId, {
        status: "completed",
        modelUsed: result.model,
        chunksIndexed: result.chunksIndexed,
        errorsEncountered: result.errorsEncountered,
        durationMs: result.durationMs,
        healthSummary: {
          summary: result.summary,
          toolsInvoked: result.toolsInvoked,
          runId: result.runId,
        },
      }),
    )
    .catch((err: unknown) => {
      const durationMs = Date.now() - startTs;
      return updateIrisRun(runId, {
        status: "error",
        durationMs,
        healthSummary: { error: String(err) },
      });
    });

  return { result: { runId, status: "started" } };
}

async function toolTriggerIrisHealthCheck(
  ctx: ToolContext,
): Promise<{ result: unknown }> {
  return toolTriggerIrisRun("scheduled-health", ctx);
}

async function toolTriggerIrisReindex(
  ctx: ToolContext,
): Promise<{ result: unknown }> {
  return toolTriggerIrisRun("scheduled-reindex", ctx);
}

async function toolClearIrisGaps(
  ctx: ToolContext,
): Promise<{ result: unknown }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  await clearIrisGaps();
  return { result: { success: true } };
}

async function toolGetIrisStatus(
  ctx: ToolContext,
): Promise<{ result: unknown }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const [lastRun, gaps] = await Promise.all([
    getLatestIrisRun(),
    readIrisGaps(),
  ]);
  return { result: { lastRun, gapsCount: gaps.length } };
}

/** Max characters accepted for a retrieval-gap query before truncation. */
const IRIS_GAP_MAX_QUERY_CHARS = 500;

async function toolWriteRetrievalGap(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  void ctx; // no user-scoped DB operation needed for gap logging
  // Normalize: collapse whitespace, trim, and cap — the query is model/user
  // input that writes into the shared Iris workspace markdown file.
  const rawQuery = ((args.query as string) ?? "").replace(/\s+/g, " ").trim();
  const query = rawQuery.slice(0, IRIS_GAP_MAX_QUERY_CHARS);
  if (!query) return { result: { recorded: false } };
  await appendIrisGap(query);
  return { result: { recorded: true } };
}
