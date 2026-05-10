import { storage } from "../storage";
import { getAllMarketRates, getMarketRate, upsertMarketRate } from "../data/marketRates";
import { generateLocationAwareResearchValues } from "../data/researchSeeds";
import type { UpdateProperty } from "@workspace/db";
import type { DataChangedEntry, ToolContext } from "./rebecca-tool-types";
import { RESEARCH_ESTIMATED_MINUTES, requireAdminCtx, requireNumericArg, requireObjectArg } from "./rebecca-tool-types";

// ---------------------------------------------------------------------------
// Pietro data infrastructure tools
// ---------------------------------------------------------------------------

export async function toolGetDataSourceStatus(ctx: ToolContext): Promise<{ result: unknown }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const { db } = await import("../db");
  const { adminResources } = await import("@workspace/db");
  const { or, eq } = await import("drizzle-orm");

  const rows = await db
    .select({
      id: adminResources.id,
      slug: adminResources.slug,
      kind: adminResources.kind,
      displayName: adminResources.displayName,
      lastHealthStatus: adminResources.lastHealthStatus,
      lastCheckedAt: adminResources.lastCheckedAt,
      dailyRequestBudget: adminResources.dailyRequestBudget,
    })
    .from(adminResources)
    .where(or(eq(adminResources.kind, "source"), eq(adminResources.kind, "mcp")));

  return {
    result: rows.map(r => ({
      ...r,
      lastCheckedAt: r.lastCheckedAt?.toISOString() ?? null,
    })),
  };
}

export async function toolProbeDataSource(args: Record<string, unknown>, ctx: ToolContext): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const id = typeof args.id === "number" ? args.id : Number(args.id);
  if (!id || isNaN(id)) return { result: { error: "id must be a positive integer" } };

  const { db } = await import("../db");
  const { adminResources } = await import("@workspace/db");
  const { eq } = await import("drizzle-orm");
  const { runProbe } = await import("../jobs/probes");

  const [row] = await db.select().from(adminResources).where(eq(adminResources.id, id)).limit(1);
  if (!row) return { result: { error: `Resource not found: id=${id}` } };

  const outcome = await runProbe(row);
  return { result: outcome };
}

export async function toolRegenerateDataSource(args: Record<string, unknown>, ctx: ToolContext): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const slug = typeof args.slug === "string" ? args.slug : "";
  if (!slug) return { result: { error: "slug is required" } };

  const { MINION_REGISTRY } = await import("../ai/ambient/pietro-scheduler");
  const minion = MINION_REGISTRY[slug];
  if (!minion) return { result: { error: `No minion registered for slug: ${slug}` } };

  const result = await minion();
  return { result, dataChanged: { entityType: "data_source", entityId: 0 } };
}

// ---------------------------------------------------------------------------
// Tripadvisor live hotel research
// ---------------------------------------------------------------------------

export async function toolGetTripadvisorHotels(
  args: Record<string, unknown>,
): Promise<{ result: unknown }> {
  const market = typeof args.market === "string" ? args.market.trim() : "";
  if (!market) return { result: { error: "market is required" } };

  const query =
    typeof args.query === "string" && args.query.trim()
      ? args.query.trim()
      : "hotel";

  const { TRIPADVISOR_DEFAULT_HOTEL_LIMIT, searchTripadvisorHotels } =
    await import("../data/tripadvisor.js");

  const rawLimit =
    typeof args.limit === "number" && Number.isFinite(args.limit)
      ? args.limit
      : TRIPADVISOR_DEFAULT_HOTEL_LIMIT;

  const result = await searchTripadvisorHotels(market, query, rawLimit);
  return { result };
}

// ---------------------------------------------------------------------------
// Market rate tools (U7)
// ---------------------------------------------------------------------------

export async function toolGetMarketRates(
  args: Record<string, unknown>,
  _ctx: ToolContext,
): Promise<{ result: unknown }> {
  const key = typeof args.key === "string" ? args.key : undefined;
  if (key) {
    const rate = await getMarketRate(key);
    if (!rate) return { result: { error: "Rate not found" } };
    return { result: rate };
  }
  const rates = await getAllMarketRates();
  return { result: rates };
}

// NOTE: toolUpdateMarketRate was intentionally removed (CLAUDE.md §8).
// Market rate rows are regenerated in their entirety by the Analyst button
// (Admin → Sources & Resources). Per-cell manual editing is not supported
// and must not be exposed through any agent tool.

// ---------------------------------------------------------------------------
// Research trigger
// ---------------------------------------------------------------------------

export async function toolTriggerResearch(
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
// Global assumptions tools (U2/U5)
// ---------------------------------------------------------------------------

export async function toolGetGlobalAssumptions(
  ctx: ToolContext,
): Promise<{ result: unknown }> {
  const ga = await storage.getGlobalAssumptions(ctx.userId);
  if (!ga) return { result: { error: "Global assumptions not found" } };
  return { result: ga };
}

export async function toolUpdateGlobalAssumptions(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const patchResult = requireObjectArg(args, "patch");
  if (!patchResult.ok) return patchResult.result;

  const ga = await storage.getGlobalAssumptions(ctx.userId);
  if (!ga) {
    return { result: { error: "Global assumptions not found" } };
  }

  const patch: Record<string, unknown> = { ...patchResult.value, updatedAt: new Date() };
  const updated = await storage.patchGlobalAssumptions(ga.id, patch);

  return {
    result: { success: true, id: updated.id },
    dataChanged: { entityType: "global_assumptions", entityId: 0 },
  };
}

// ---------------------------------------------------------------------------
// Prospective Properties tools (U4)
// ---------------------------------------------------------------------------

export async function toolListProspectiveProperties(
  ctx: ToolContext,
): Promise<{ result: unknown }> {
  const props = await storage.getProspectiveProperties(ctx.userId);
  return {
    result: props.map(p => ({
      id: p.id,
      address: p.address,
      city: p.city,
      state: p.state,
      zipCode: p.zipCode,
      notes: p.notes,
      savedAt: p.savedAt,
      priceEventCount: (p.priceEvents ?? []).length,
    })),
  };
}

export async function toolSaveProspectiveProperty(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const address = typeof args.address === "string" ? args.address.trim() : "";
  if (!address) return { result: { error: "address is required" } };

  const prop = await storage.addProspectiveProperty({
    userId: ctx.userId,
    address,
    city: typeof args.city === "string" ? args.city : null,
    state: typeof args.state === "string" ? args.state : null,
    zipCode: typeof args.zipCode === "string" ? args.zipCode : null,
    notes: typeof args.notes === "string" ? args.notes : null,
    externalId: `rebecca-${Date.now()}`,
    source: "rebecca",
  });

  return {
    result: { id: prop.id, address: prop.address },
    dataChanged: { entityType: "property_finder" as const, entityId: prop.id },
  };
}

export async function toolDeleteProspectiveProperty(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const idResult = requireNumericArg(args, "id");
  if (!idResult.ok) return idResult.result;

  await storage.deleteProspectiveProperty(idResult.value, ctx.userId);
  return {
    result: { success: true },
    dataChanged: { entityType: "property_finder" as const, entityId: idResult.value },
  };
}

export async function toolUpdateProspectivePropertyNotes(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const idResult = requireNumericArg(args, "id");
  if (!idResult.ok) return idResult.result;
  const notes = typeof args.notes === "string" ? args.notes : "";

  const updated = await storage.updateProspectivePropertyNotes(idResult.value, ctx.userId, notes);
  if (!updated) return { result: { error: "Not found" } };
  return {
    result: { success: true, notes: updated.notes },
    dataChanged: { entityType: "property_finder" as const, entityId: idResult.value },
  };
}

// ---------------------------------------------------------------------------
// Price Events tools (U5)
// ---------------------------------------------------------------------------

export async function toolListPriceEvents(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown }> {
  const idResult = requireNumericArg(args, "prospectivePropertyId");
  if (!idResult.ok) return idResult.result;

  const history = await storage.getProspectivePriceHistory(idResult.value, ctx.userId);
  if (!history) return { result: { error: "Not found" } };
  return { result: history.priceEvents ?? [] };
}

export async function toolCreatePriceEvent(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const idResult = requireNumericArg(args, "prospectivePropertyId");
  if (!idResult.ok) return idResult.result;
  const kind = typeof args.kind === "string" ? args.kind.trim() : (typeof args.type === "string" ? args.type.trim() : "");
  const newPrice = typeof args.price === "number" ? args.price : Number(args.price);
  if (!kind) return { result: { error: "kind (event type) is required: list, reduction, delist, relist, contract, prior_sale" } };
  if (isNaN(newPrice)) return { result: { error: "price must be a number" } };

  const updated = await storage.addProspectivePriceEvent(idResult.value, ctx.userId, {
    kind: kind as import("@shared/price-history").PriceEventKind,
    newPrice,
    date: typeof args.date === "string" ? args.date : new Date().toISOString().slice(0, 10),
    note: typeof args.notes === "string" ? args.notes : undefined,
  });
  if (!updated) return { result: { error: "Not found" } };
  const events = updated.priceEvents ?? [];
  return {
    result: { success: true, eventCount: events.length },
    dataChanged: { entityType: "property_finder" as const, entityId: idResult.value },
  };
}

export async function toolUpdatePriceEvent(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const idResult = requireNumericArg(args, "prospectivePropertyId");
  if (!idResult.ok) return idResult.result;
  const eventId = typeof args.eventId === "string" ? args.eventId : "";
  if (!eventId) return { result: { error: "eventId is required" } };

  const patch: Record<string, unknown> = {};
  if (typeof args.kind === "string") patch.kind = args.kind;
  if (typeof args.newPrice === "number") patch.newPrice = args.newPrice;
  if (typeof args.price === "number") patch.newPrice = args.price;
  if (typeof args.date === "string") patch.date = args.date;
  if (typeof args.note === "string") patch.note = args.note;
  if (typeof args.notes === "string") patch.note = args.notes;

  if (Object.keys(patch).length === 0) return { result: { error: "No fields to update" } };

  const updated = await storage.updateProspectivePriceEvent(idResult.value, ctx.userId, eventId, patch as Parameters<typeof storage.updateProspectivePriceEvent>[3]);
  if (!updated) return { result: { error: "Not found" } };
  return {
    result: { success: true },
    dataChanged: { entityType: "property_finder" as const, entityId: idResult.value },
  };
}

export async function toolDeletePriceEvent(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const idResult = requireNumericArg(args, "prospectivePropertyId");
  if (!idResult.ok) return idResult.result;
  const eventId = typeof args.eventId === "string" ? args.eventId : "";
  if (!eventId) return { result: { error: "eventId is required" } };

  const updated = await storage.deleteProspectivePriceEvent(idResult.value, ctx.userId, eventId);
  if (!updated) return { result: { error: "Not found" } };
  return {
    result: { success: true },
    dataChanged: { entityType: "property_finder" as const, entityId: idResult.value },
  };
}

// ---------------------------------------------------------------------------
// Service Templates tools (U7)
// ---------------------------------------------------------------------------

export async function toolListServiceTemplates(
  ctx: ToolContext,
): Promise<{ result: unknown }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const templates = await storage.getAllServiceTemplates();
  return { result: templates };
}

export async function toolUpdateServiceTemplate(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const idResult = requireNumericArg(args, "id");
  if (!idResult.ok) return idResult.result;

  const patch: Record<string, unknown> = {};
  if (typeof args.name === "string") patch.name = args.name;
  if (typeof args.defaultRate === "number") patch.defaultRate = args.defaultRate;
  if (typeof args.markupPercent === "number") patch.markupPercent = args.markupPercent;
  if (typeof args.isActive === "boolean") patch.isActive = args.isActive;
  if (typeof args.sortOrder === "number") patch.sortOrder = args.sortOrder;

  if (Object.keys(patch).length === 0) return { result: { error: "No fields to update" } };

  const updated = await storage.updateServiceTemplate(idResult.value, patch as Parameters<typeof storage.updateServiceTemplate>[1]);
  if (!updated) return { result: { error: "Service template not found" } };

  return {
    result: { success: true, id: updated.id },
    dataChanged: { entityType: "service_template" as const, entityId: idResult.value },
  };
}
