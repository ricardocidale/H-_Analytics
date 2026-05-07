import { storage } from "../storage";
import type { ToolParam } from "./tool-types";
import type { Property, UpdateProperty, Scenario, UpdateScenario } from "@workspace/db";
import { updatePropertySchema } from "@workspace/db";
import { generateLocationAwareResearchValues } from "../data/researchSeeds";
import {
  researchCapitalRaiseBenchmarks,
  researchExitMultiples,
  researchReferenceBrands,
} from "../ai/analyst-table-refresh";
import {
  triggerLbDeckRenderService,
  getLbDeckRenderStatusService,
} from "../routes/lb-deck-pdf";
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
      name: "patch_property",
      description: "Update multiple property fields in a single call. Validates each field against its schema. Returns updated (fields written) and skipped (fields that failed validation). Always check the skipped array and inform the user if any fields were not written.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "number", description: "Property ID" },
          fields: {
            type: "object",
            description: "Map of field names to new values (e.g. { startAdr: 250, maxOccupancy: 20 })",
          },
        },
        required: ["id", "fields"],
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
      name: "get_lb_deck_config",
      description: "Read the current LB investor deck configuration — which properties are assigned to slides 1/2/3/5 and any slide 4/6 text. Admin only. Call before configure_lb_deck to see current state.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      name: "configure_lb_deck",
      description: "Assign properties to LB investor deck slides 1/2/3/5 and set optional slide 4 subtitle and slide 6 disclaimer. Only the fields you supply are changed; omitted fields keep their current values. Admin only.",
      parameters: {
        type: "object",
        properties: {
          slide1PropertyId: { type: "number", description: "Property ID for Slide 1 (Pipeline Spotlight). Must belong to the current user." },
          slide2PropertyId: { type: "number", description: "Property ID for Slide 2 (Photo Gallery). Must belong to the current user." },
          slide3PropertyId: { type: "number", description: "Property ID for Slide 3 (Investment Model). Must belong to the current user." },
          slide5PropertyId: { type: "number", description: "Property ID for Slide 5 (Financial Snapshot). Must belong to the current user." },
          slide4SectionSubtitle: { type: "string", description: "Optional subtitle for Slide 4 portfolio grid section" },
          slide6Disclaimer: { type: "string", description: "Optional disclaimer text for Slide 6 income statement" },
        },
        required: [],
      },
    },
    {
      name: "trigger_lb_deck_render",
      description: "Trigger a background render of the LB investor deck PDF. Returns immediately — use get_lb_deck_render_status to poll progress. Admin only.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      name: "get_lb_deck_render_status",
      description: "Return the current LB deck render status (idle | rendering | ready | error), last rendered timestamp, and any error message. Admin only.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      name: "refresh_analyst_table",
      description: "Trigger an LLM-driven refresh of an analyst benchmark table and commit the results. Admin only. tableId must be one of: capital_raise_benchmarks, exit_multiples, reference_brands.",
      parameters: {
        type: "object",
        properties: {
          tableId: {
            type: "string",
            enum: ["capital_raise_benchmarks", "exit_multiples", "reference_brands"],
            description: "Table to refresh",
          },
        },
        required: ["tableId"],
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
      case "patch_property":
        return await toolPatchProperty(args, ctx);
      case "create_scenario":
        return await toolCreateScenario(args, ctx);
      case "update_scenario":
        return await toolUpdateScenario(args, ctx);
      case "update_scenario_assumptions":
        return await toolUpdateScenarioAssumptions(args, ctx);
      case "configure_lb_deck":
        return await toolConfigureLbDeck(args, ctx);
      case "get_lb_deck_config":
        return await toolGetLbDeckConfig(ctx);
      case "trigger_lb_deck_render":
        return await toolTriggerLbDeckRender(ctx);
      case "get_lb_deck_render_status":
        return await toolGetLbDeckRenderStatus(ctx);
      case "refresh_analyst_table":
        return await toolRefreshAnalystTable(args, ctx);
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
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as Record<string, unknown>)?.code;
    return { result: { error: message, ...(code !== undefined ? { code } : {}) } };
  }
}

// ---------------------------------------------------------------------------
// Args validation helpers
// ---------------------------------------------------------------------------

/** Extracts a required numeric ID from LLM-supplied args, returning an error
 *  result if the value is absent or not a finite number. LLMs sometimes return
 *  string IDs ("123") rather than numbers — catching that here prevents silent
 *  type confusion reaching the storage layer. */
function requireNumericArg(
  args: Record<string, unknown>,
  key: string,
): { ok: true; value: number } | { ok: false; result: { result: { error: string } } } {
  const v = args[key];
  if (typeof v !== "number" || !Number.isFinite(v)) {
    return { ok: false, result: { result: { error: `${key} must be a number` } } };
  }
  return { ok: true, value: v };
}

/** Extracts a required object from LLM-supplied args. */
function requireObjectArg(
  args: Record<string, unknown>,
  key: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; result: { result: { error: string } } } {
  const v = args[key];
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    return { ok: false, result: { result: { error: `${key} must be an object` } } };
  }
  return { ok: true, value: v as Record<string, unknown> };
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

async function toolPatchProperty(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const idResult = requireNumericArg(args, "id");
  if (!idResult.ok) return idResult.result;
  const id = idResult.value;
  const fieldsResult = requireObjectArg(args, "fields");
  if (!fieldsResult.ok) return fieldsResult.result;
  const rawFields = fieldsResult.value;

  const prop = await storage.getProperty(id);
  if (!prop || prop.userId !== ctx.userId) {
    return { result: { error: "Not found" } };
  }

  const schemaShape = updatePropertySchema.shape;
  const validated: Record<string, unknown> = {};
  const errors: string[] = [];

  for (const [field, value] of Object.entries(rawFields)) {
    const fieldValidator = schemaShape[field as keyof typeof schemaShape];
    if (!fieldValidator) {
      errors.push(`Unknown field: ${field}`);
      continue;
    }
    const parsed = fieldValidator.safeParse(value);
    if (!parsed.success) {
      errors.push(`Invalid value for "${field}": ${String(parsed.error)}`);
    } else {
      validated[field] = value;
    }
  }

  if (errors.length > 0 && Object.keys(validated).length === 0) {
    return { result: { error: errors.join("; ") } };
  }

  await storage.updateProperty(id, validated as UpdateProperty);

  return {
    result: {
      success: true,
      updated: Object.keys(validated),
      ...(errors.length > 0 ? { skipped: errors } : {}),
      displayName: prop.name,
    },
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

// Allowlist of globalAssumptions keys Rebecca may write, with per-key type guards.
// Derived from the three explicitly-typed fields in ScenarioGlobalAssumptionsSnapshot.
// The engine reads many more keys from this blob (see company-engine.ts:93-147),
// but those are internally managed; LLM-controlled writes are intentionally limited
// to the three admin-facing fields below.
const SCENARIO_ASSUMPTION_VALIDATORS: Record<string, (v: unknown) => boolean> = {
  modelStartDate: (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v),
  baseManagementFeePercent: (v) => typeof v === "number" && v >= 0 && v <= 1,
  projectionYears: (v) => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 50,
};

async function toolUpdateScenarioAssumptions(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const idResult = requireNumericArg(args, "id");
  if (!idResult.ok) return idResult.result;
  const id = idResult.value;
  const patchesResult = requireObjectArg(args, "patches");
  if (!patchesResult.ok) return patchesResult.result;
  const rawPatches = patchesResult.value;

  // Note: this is a read-modify-write without a DB-level lock. Two concurrent
  // calls on the same scenario (possible when the LLM emits multiple tool_use
  // blocks in one response) will race and the last writer wins. The correct
  // fix is optimistic locking on updateScenarioSnapshot using updatedAt or a
  // version column — tracked as a known limitation.
  const sc = await storage.getScenario(id);
  if (!sc || sc.userId !== ctx.userId) {
    return { result: { error: "Not found" } };
  }
  if (sc.isLocked) {
    return { result: { error: "Scenario is locked and cannot be edited" } };
  }

  // Validate and filter patches through the allowlist.
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

  // Null out computedResults and computeHash so cached projections are not
  // served against stale assumptions. The engine recomputes on the next
  // scenario load. The auto-save route calls tryComputeResults before writing,
  // but importing that here would violate ADR-007 DI discipline.
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

async function toolGetLbDeckConfig(
  ctx: ToolContext,
): Promise<{ result: unknown }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;
  const config = await storage.getLbSlidesConfig();
  return {
    result: config ?? {
      slide1PropertyId: null, slide2PropertyId: null,
      slide3PropertyId: null, slide5PropertyId: null,
      slide4SectionSubtitle: null, slide6Disclaimer: null,
    },
  };
}

async function toolConfigureLbDeck(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  // Read-merge-write: only supplied fields change; omitted fields keep current values.
  const current = await storage.getLbSlidesConfig();

  const SLIDE_PROP_FIELDS = [
    "slide1PropertyId", "slide2PropertyId", "slide3PropertyId", "slide5PropertyId",
  ] as const;

  // Verify ownership of any supplied property IDs before writing.
  for (const field of SLIDE_PROP_FIELDS) {
    const rawId = args[field];
    if (rawId === undefined || rawId === null) continue;
    const id = rawId as number;
    const prop = await storage.getProperty(id);
    if (!prop || prop.userId !== ctx.userId) {
      return { result: { error: `Property ID ${id} for ${field} not found or not owned by you` } };
    }
  }

  const merge = <T>(key: string, current: T): T =>
    args[key] !== undefined ? (args[key] as T) : current;

  const updated = await storage.upsertLbSlidesConfig({
    slide1PropertyId: merge("slide1PropertyId", current?.slide1PropertyId ?? null),
    slide2PropertyId: merge("slide2PropertyId", current?.slide2PropertyId ?? null),
    slide3PropertyId: merge("slide3PropertyId", current?.slide3PropertyId ?? null),
    slide5PropertyId: merge("slide5PropertyId", current?.slide5PropertyId ?? null),
    slide4SectionSubtitle: merge("slide4SectionSubtitle", current?.slide4SectionSubtitle ?? null),
    slide6Disclaimer: merge("slide6Disclaimer", current?.slide6Disclaimer ?? null),
  });
  return { result: { success: true, config: updated } };
}

async function toolTriggerLbDeckRender(
  ctx: ToolContext,
): Promise<{ result: unknown }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;
  return { result: triggerLbDeckRenderService() };
}

async function toolGetLbDeckRenderStatus(
  ctx: ToolContext,
): Promise<{ result: unknown }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;
  return { result: getLbDeckRenderStatusService() };
}

async function toolRefreshAnalystTable(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;
  const VALID_TABLE_IDS = ["capital_raise_benchmarks", "exit_multiples", "reference_brands"] as const;
  const tableId = args.tableId;
  if (typeof tableId !== "string" || !VALID_TABLE_IDS.includes(tableId as typeof VALID_TABLE_IDS[number])) {
    return { result: { error: `tableId must be one of: ${VALID_TABLE_IDS.join(", ")}` } };
  }
  const now = new Date();

  if (tableId === "capital_raise_benchmarks") {
    const current = await storage.getCapitalRaiseBenchmarks();
    const result = await researchCapitalRaiseBenchmarks(current);
    for (const r of result.proposedRanges) {
      await storage.upsertCapitalRaiseBenchmark({
        dimensionKey: r.dimensionKey,
        label: r.label,
        unit: r.unit ?? "usd",
        valueLow: r.valueLow,
        valueMid: r.valueMid,
        valueHigh: r.valueHigh,
        sourceCount: result.sourceCount,
        lastRefreshedAt: now,
      });
    }
    return {
      result: {
        tableId,
        rangesCommitted: result.proposedRanges.length,
        sourceCount: result.sourceCount,
        tokensUsed: result.tokensUsed,
      },
    };
  }

  if (tableId === "exit_multiples") {
    const current = await storage.getExitMultiples();
    const result = await researchExitMultiples(current);
    for (const r of result.proposedRanges) {
      await storage.upsertExitMultiple({
        dimensionKey: r.dimensionKey,
        label: r.label,
        unit: r.unit ?? "x_revenue",
        valueLow: r.valueLow,
        valueMid: r.valueMid,
        valueHigh: r.valueHigh,
        sourceCount: result.sourceCount,
        lastRefreshedAt: now,
      });
    }
    return {
      result: {
        tableId,
        rangesCommitted: result.proposedRanges.length,
        sourceCount: result.sourceCount,
        tokensUsed: result.tokensUsed,
      },
    };
  }

  if (tableId === "reference_brands") {
    const current = await storage.getReferenceBrands();
    const result = await researchReferenceBrands(current);
    return {
      result: {
        tableId,
        autoCommitted: result.autoCommitted,
        brandCount: result.brandCount,
        sourceCount: result.sourceCount,
        tokensUsed: result.tokensUsed,
      },
    };
  }

  return { result: { error: `Unknown tableId: ${tableId}. Use capital_raise_benchmarks, exit_multiples, or reference_brands.` } };
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
    return { result: { error: "This action requires admin access" } };
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
