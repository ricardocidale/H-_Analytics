import { storage } from "../storage";
import type { ToolParam } from "./tool-types";
import type { Property, UpdateProperty, Scenario, UpdateScenario } from "@workspace/db";
import { updatePropertySchema } from "@workspace/db";
import { generateLocationAwareResearchValues } from "../data/researchSeeds";

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
      case "lock_scenario":
        return await toolLockScenario(args, ctx);
      case "delete_scenario":
        return await toolDeleteScenario(args, ctx);
      case "trigger_research":
        return await toolTriggerResearch(args, ctx);
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
    // Clone from the user's default scenario; fall back to any available scenario.
    // InsertScenario requires non-null globalAssumptions and properties columns,
    // so we cannot create a blank scenario — we must clone an existing one.
    const allScenarios = await storage.getScenariosByUser(ctx.userId);
    const defaultSc = allScenarios.find((s: Scenario) => s.kind === "default");
    const sourceSc = defaultSc ?? allScenarios[0];
    if (!sourceSc) {
      return { result: { error: "Cannot create scenario — no existing scenario to clone from" } };
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

async function toolUpdateScenario(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const id = args.id as number;
  const fields = args.fields as Record<string, unknown>;

  const sc = await storage.getScenario(id);
  if (!sc || sc.userId !== ctx.userId) {
    return { result: { error: "Not found" } };
  }

  // UpdateScenario type officially covers name/description/tags.
  // Cast through unknown so callers can pass additional keys;
  // the storage layer's stripAutoFields handles unrecognized keys at runtime.
  await storage.updateScenario(id, fields as unknown as UpdateScenario);

  return {
    result: { success: true, updated: Object.keys(fields) },
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
