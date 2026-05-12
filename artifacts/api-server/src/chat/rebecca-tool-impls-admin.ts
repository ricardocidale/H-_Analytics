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
// ICP national research table reads
// ---------------------------------------------------------------------------

export async function toolGetVendorPassthroughCosts(args: Record<string, unknown>): Promise<{ result: unknown }> {
  const { getLatestNationalBenchmarks } = await import("../finance/national-benchmarks");

  const serviceLine = typeof args.serviceLine === "string" && args.serviceLine.trim()
    ? args.serviceLine.trim()
    : null;

  const { vendorCosts, vendorCostsLastFetchedAt } = await getLatestNationalBenchmarks();

  const filtered = serviceLine
    ? vendorCosts.filter(r => r.serviceLine === serviceLine)
    : vendorCosts;

  if (filtered.length === 0) {
    return {
      result: {
        message: "No vendor pass-through cost data cached. Trigger regeneration from Admin → AI → Intelligence → Knowledge & Resources → Tables → National Vendor Pass-Through Costs.",
        rows: [],
        lastFetchedAt: null,
      },
    };
  }

  return {
    result: {
      rows: filtered.map(r => ({
        serviceLine: r.serviceLine,
        costPctRevenue: r.costPctRevenue,
        costPctRevenueLabel: `${(r.costPctRevenue * 100).toFixed(2)}%`,
        period: r.period,
        source: r.source,
        sourceUrl: r.sourceUrl,
        fetchedAt: r.fetchedAt.toISOString(),
      })),
      count: filtered.length,
      lastFetchedAt: vendorCostsLastFetchedAt,
    },
  };
}

export async function toolGetMgmtCoMarkupFactors(args: Record<string, unknown>): Promise<{ result: unknown }> {
  const { getLatestNationalBenchmarks } = await import("../finance/national-benchmarks");

  const serviceLine = typeof args.serviceLine === "string" && args.serviceLine.trim()
    ? args.serviceLine.trim()
    : null;

  const { markupFactors, markupFactorsLastFetchedAt } = await getLatestNationalBenchmarks();

  const filtered = serviceLine
    ? markupFactors.filter(r => r.serviceLine === serviceLine)
    : markupFactors;

  if (filtered.length === 0) {
    return {
      result: {
        message: "No Mgmt Co markup factor data cached. Trigger regeneration from Admin → AI → Intelligence → Knowledge & Resources → Tables → National Mgmt Co Markup Factors.",
        rows: [],
        lastFetchedAt: null,
      },
    };
  }

  return {
    result: {
      rows: filtered.map(r => ({
        serviceLine: r.serviceLine,
        markupPctRevenue: r.markupPctRevenue,
        markupPctRevenueLabel: `${(r.markupPctRevenue * 100).toFixed(2)}%`,
        period: r.period,
        source: r.source,
        sourceUrl: r.sourceUrl,
        fetchedAt: r.fetchedAt.toISOString(),
      })),
      count: filtered.length,
      lastFetchedAt: markupFactorsLastFetchedAt,
    },
  };
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

// DEPRECATED: remove after Wave 2. True wrapper around the new primitives so
// auth + validation logic doesn't drift between this path and the seed/apply
// pair (CodeRabbit PR-96).
export async function toolTriggerResearch(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const seedsResult = await toolGetPropertyResearchSeeds(args, ctx);
  const seedsBody = seedsResult.result as { error?: string; seeds?: Record<string, unknown> };
  if (seedsBody.error || !seedsBody.seeds) return seedsResult;

  const applyResult = await toolApplyPropertyResearchValues(
    { propertyId: args.propertyId, researchValues: seedsBody.seeds },
    ctx,
  );
  const applyBody = applyResult.result as { error?: string; propertyId?: number };
  if (applyBody.error) return applyResult;

  return {
    result: {
      queued: true,
      estimatedMinutes: RESEARCH_ESTIMATED_MINUTES,
      propertyId: applyBody.propertyId,
    },
    dataChanged: applyResult.dataChanged,
  };
}

// W1.4 — primitives that decompose trigger_research into a read-only seed
// step (no DB write) and a write step. Letting the agent inspect or adjust
// proposed seeds before persisting is the point — the old trigger_research
// tool remains as a deprecated single-shot wrapper.

export async function toolGetPropertyResearchSeeds(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown }> {
  const idResult = requireNumericArg(args, "propertyId");
  if (!idResult.ok) return idResult.result;
  const propertyId = idResult.value;

  const prop = await storage.getProperty(propertyId);
  if (!prop || prop.userId !== ctx.userId) {
    return { result: { error: "Not found" } };
  }

  const seeds = generateLocationAwareResearchValues({
    location: prop.location,
    streetAddress: prop.streetAddress,
    city: prop.city,
    stateProvince: prop.stateProvince,
    zipPostalCode: prop.zipPostalCode,
    country: prop.country,
    market: prop.market,
  });

  return {
    result: {
      propertyId,
      propertyName: prop.name,
      seeds,
    },
  };
}

export async function toolApplyPropertyResearchValues(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const idResult = requireNumericArg(args, "propertyId");
  if (!idResult.ok) return idResult.result;
  const propertyId = idResult.value;

  const researchValuesResult = requireObjectArg(args, "researchValues");
  if (!researchValuesResult.ok) return researchValuesResult.result;
  const researchValues = researchValuesResult.value;

  const prop = await storage.getProperty(propertyId);
  if (!prop || prop.userId !== ctx.userId) {
    return { result: { error: "Not found" } };
  }

  await storage.updateProperty(propertyId, { researchValues } as UpdateProperty);

  return {
    result: { ok: true, propertyId, fieldCount: Object.keys(researchValues).length },
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

export async function toolSaveCompanyAssumptionTab(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown; dataChanged?: DataChangedEntry }> {
  const {
    COMPANY_ASSUMPTION_TAB_KEYS,
    saveCompanyAssumptionTab,
    SaveCompanyAssumptionTabValidationError,
  } = await import("../routes/global-assumptions-save-tab");

  const tabKey = args.tabKey;
  if (
    typeof tabKey !== "string" ||
    !(COMPANY_ASSUMPTION_TAB_KEYS as readonly string[]).includes(tabKey)
  ) {
    return {
      result: {
        error: `tabKey must be one of: ${COMPANY_ASSUMPTION_TAB_KEYS.join(", ")}`,
      },
    };
  }

  const patch = args.patch;
  if (patch !== undefined && (patch === null || typeof patch !== "object" || Array.isArray(patch))) {
    return { result: { error: "patch must be an object when provided" } };
  }

  const fundingInputs = args.fundingInputs;
  if (
    fundingInputs !== undefined &&
    (fundingInputs === null || typeof fundingInputs !== "object" || Array.isArray(fundingInputs))
  ) {
    return { result: { error: "fundingInputs must be an object when provided" } };
  }

  const unsave = args.unsave;
  if (unsave !== undefined && typeof unsave !== "boolean") {
    return { result: { error: "unsave must be a boolean when provided" } };
  }

  try {
    const result = await saveCompanyAssumptionTab({
      tabKey: tabKey as Parameters<typeof saveCompanyAssumptionTab>[0]["tabKey"],
      patch: patch as Record<string, unknown> | undefined,
      fundingInputs: fundingInputs as Parameters<typeof saveCompanyAssumptionTab>[0]["fundingInputs"],
      unsave,
      userId: ctx.userId,
    });
    return {
      result: {
        success: true,
        savedTabs: result.savedTabs,
        ...(result.requiredFieldsMissing ? { requiredFieldsMissing: result.requiredFieldsMissing } : {}),
      },
      dataChanged: { entityType: "global_assumptions", entityId: 0 },
    };
  } catch (err: unknown) {
    if (err instanceof SaveCompanyAssumptionTabValidationError) {
      return { result: { error: err.message } };
    }
    throw err;
  }
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
  if (!Number.isFinite(newPrice)) return { result: { error: "price must be a finite number" } };

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

// ---------------------------------------------------------------------------
// W2.1: Specialist read tools + recommendation telemetry
//
// Specialist prompt/model/required-fields/toggles are dev-defined per
// `.claude/rules/specialists-are-dev-defined-only.md` (admin routes return
// 405). The only admin-mutable surface is the append-only recommendation
// event below, which mirrors the Required Fields tab's Promote/Ignore.
// ---------------------------------------------------------------------------

const RECOMMENDATION_ACTIONS = ["promote-recommended", "promote-hard", "ignore"] as const;
type RecommendationAction = (typeof RECOMMENDATION_ACTIONS)[number];

export async function toolListSpecialists(ctx: ToolContext): Promise<{ result: unknown }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const { SPECIALIST_CATALOG } = await import("@engine/analyst/registry/specialist-catalog");
  const overrideIds = await storage.listSpecialistsWithLlmOverrides();

  return {
    result: SPECIALIST_CATALOG.map((def) => ({
      id: def.id,
      letter: def.letter,
      humanName: def.humanName,
      subject: def.subject,
      description: def.description ?? null,
      candidateFieldKeys: (def.candidateFields ?? []).map((c) => c.key),
      hasLlmOverrides: overrideIds.has(def.id),
    })),
  };
}

export async function toolGetSpecialistConfig(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const specialistId = typeof args.specialistId === "string" ? args.specialistId : "";
  if (!specialistId) return { result: { error: "specialistId must be a non-empty string" } };

  const { getSpecialistById } = await import("@engine/analyst/registry/specialist-catalog");
  const definition = getSpecialistById(specialistId);
  if (!definition) return { result: { error: `Specialist not found: ${specialistId}` } };

  const config = await storage.getSpecialistConfig(specialistId);
  return { result: { definition, config: config ?? null } };
}

export async function toolRecordSpecialistRecommendationEvent(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const specialistId = typeof args.specialistId === "string" ? args.specialistId : "";
  if (!specialistId) return { result: { error: "specialistId must be a non-empty string" } };

  const fieldKey = typeof args.fieldKey === "string" ? args.fieldKey : "";
  if (!fieldKey) return { result: { error: "fieldKey must be a non-empty string" } };

  const action = args.action;
  if (typeof action !== "string" || !RECOMMENDATION_ACTIONS.includes(action as RecommendationAction)) {
    return { result: { error: `action must be one of: ${RECOMMENDATION_ACTIONS.join(", ")}` } };
  }
  const typedAction = action as RecommendationAction;

  const { getSpecialistById, getLockedHardCandidateKeys } = await import("@engine/analyst/registry/specialist-catalog");
  const definition = getSpecialistById(specialistId);
  if (!definition) return { result: { error: `Specialist not found: ${specialistId}` } };

  const candidateKeys = new Set((definition.candidateFields ?? []).map((c) => c.key));
  if (!candidateKeys.has(fieldKey)) {
    return { result: { error: `Field key "${fieldKey}" is not a declared candidate of ${specialistId}` } };
  }

  if (typedAction === "promote-hard") {
    const lockedHard = new Set(getLockedHardCandidateKeys(specialistId));
    if (!lockedHard.has(fieldKey)) {
      return {
        result: {
          error: `Cannot promote "${fieldKey}" to hard-required: not catalog-locked. The hard tier is owned by the catalog.`,
          lockedHardKeys: Array.from(lockedHard),
        },
      };
    }
  }

  const event = await storage.recordRecommendationEvent(specialistId, fieldKey, typedAction, ctx.userId);
  return { result: { success: true, eventId: event.id, specialistId, fieldKey, action: typedAction } };
}

// ---------------------------------------------------------------------------
// W2.3: update_admin_resource
//
// Mirrors `PUT /api/admin/resources/:id` (routes/admin/resources.ts:152).
// Versioned write — `storage.updateAdminResource` writes a new version row.
// SSRF guard on `config.healthProbe.url` is reapplied here (defense in depth)
// since this path bypasses the HTTP route. Returns { resource, impact } to
// match the route's response shape.
// ---------------------------------------------------------------------------

export async function toolUpdateAdminResource(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ result: unknown }> {
  const authError = await requireAdminCtx(ctx);
  if (authError) return authError;

  const idResult = requireNumericArg(args, "id");
  if (!idResult.ok) return idResult.result;

  // Build the mutable-fields patch (displayName/description/config/secretRef)
  // SEPARATELY from changeSummary, which is metadata-only. Otherwise a caller
  // passing `{ id, changeSummary }` would create an empty new version row
  // (CodeRabbit PR-102).
  const mutablePatch: Record<string, unknown> = {};
  if (typeof args.displayName === "string") {
    if (args.displayName.length === 0) {
      return { result: { error: "displayName must be a non-empty string" } };
    }
    mutablePatch.displayName = args.displayName;
  }
  if (typeof args.description === "string" || args.description === null) mutablePatch.description = args.description;
  if (typeof args.secretRef === "string" || args.secretRef === null) mutablePatch.secretRef = args.secretRef;
  if (args.config && typeof args.config === "object" && !Array.isArray(args.config)) {
    mutablePatch.config = args.config as Record<string, unknown>;
  }

  if (Object.keys(mutablePatch).length === 0) {
    return { result: { error: "No fields to update — provide at least one of displayName, description, config, secretRef" } };
  }

  const patch: Record<string, unknown> = { ...mutablePatch };
  if (typeof args.changeSummary === "string") {
    if (args.changeSummary.length === 0) {
      return { result: { error: "changeSummary must be a non-empty string" } };
    }
    patch.changeSummary = args.changeSummary;
  }

  if (patch.config) {
    const { validateIngestUrl } = await import("../ai/iris/tools");
    const config = patch.config as Record<string, unknown>;
    const probe = config.healthProbe;
    if (probe && typeof probe === "object" && !Array.isArray(probe)) {
      const url = (probe as Record<string, unknown>).url;
      if (typeof url === "string") {
        const urlError = validateIngestUrl(url);
        if (urlError) {
          return { result: { error: `config.healthProbe.url is invalid — ${urlError}` } };
        }
      }
    }
  }

  const row = await storage.updateAdminResource(
    idResult.value,
    patch as Parameters<typeof storage.updateAdminResource>[1],
    ctx.userId,
  );
  if (!row) return { result: { error: "Resource not found" } };

  const { toResourcePublicView } = await import("@workspace/db");
  const impact = await storage.listResourceImpact(idResult.value);
  return { result: { resource: toResourcePublicView(row), impact } };
}
