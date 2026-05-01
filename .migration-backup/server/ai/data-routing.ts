/**
 * Smart Data Router — knows exactly where each data point lives.
 *
 * Instead of firing all 14+ services and hoping, this router:
 * 1. Determines which data points are needed (based on the assumption fields being researched)
 * 2. Maps each data point to the specific services that provide it (with priority order)
 * 3. Calls ONLY the relevant services (saves API quota, reduces latency)
 * 4. If initial query returns nothing, applies progressive relaxation:
 *    - Level 0: Exact match (city + quality tier + property type)
 *    - Level 1: Relax property type (boutique -> any luxury hotel)
 *    - Level 2: Relax geography (city -> metro area)
 *    - Level 3: Relax quality tier (luxury -> upscale)
 *    - Level 4: Relax to state/region level
 *    - Level 5: Relax to country level (widest ranges, still accurate)
 * 5. Returns data with provenance: which service provided it, at what relaxation level
 *
 * This file is the orchestrator. Routing data, service registry, the
 * integration-status sink, relaxation helpers, and per-service dispatch live
 * in `./data-routing/`. The public API (types + functions) is preserved for
 * existing callers and tests.
 */
import { logger } from "../logger";
import { DATA_ROUTING_TABLE } from "./data-routing/routing-table";
import { isServiceEnabled, getServiceRegistry } from "./data-routing/service-registry";
import { buildRelaxedContexts, confidenceFromRelaxation } from "./data-routing/relaxation";
import { callServiceForField } from "./data-routing/dispatchers";
import type {
  DataRoute,
  DataRouteResult,
  RelaxationLevel,
  RoutingContext,
} from "./data-routing/types";

// ---------------------------------------------------------------------------
// Public re-exports — keep import paths stable for existing callers/tests
// ---------------------------------------------------------------------------

export { DATA_ROUTING_TABLE };
export type {
  DataRoute,
  DataRouteResult,
  RelaxationLevel,
  RoutingContext,
  ConfidenceLevel,
  RelaxedContext,
} from "./data-routing/types";
export {
  getIntegrationStatusSink,
  setIntegrationStatusSink,
  resetDefaultIntegrationStatusSink,
  InMemoryIntegrationStatusSink,
  type IntegrationStatusSink,
} from "./data-routing/integration-status-sink";

// ---------------------------------------------------------------------------
// Core: Fetch data for a single field with progressive relaxation
// ---------------------------------------------------------------------------

export async function fetchFieldData(
  field: string,
  context: RoutingContext,
  maxRelaxLevel: RelaxationLevel = 5,
): Promise<DataRouteResult | null> {
  const routes = DATA_ROUTING_TABLE[field];
  if (!routes || routes.length === 0) {
    logger.warn(`Data router: no routes defined for field "${field}"`, "data-router");
    return null;
  }

  const relaxedContexts = buildRelaxedContexts(context, maxRelaxLevel);

  for (const rCtx of relaxedContexts) {
    // Sort routes by priority (lower = higher priority)
    const sortedRoutes = [...routes].sort((a, b) => a.priority - b.priority);

    for (const route of sortedRoutes) {
      // Check if service is enabled and available
      const enabled = await isServiceEnabled(route.service);
      if (!enabled) continue;

      const registry = getServiceRegistry();
      const svc = registry[route.service];
      if (!svc || !svc.isAvailable()) continue;

      const result = await callServiceForField(
        route.service,
        route.method,
        field,
        rCtx,
        context,
      );

      if (result && result.value != null) {
        return {
          field,
          value: result.value,
          range: result.range,
          source: route.service,
          relaxationLevel: rCtx.level,
          confidence: confidenceFromRelaxation(rCtx.level),
          provenance: result.provenance,
          fetchedAt: new Date().toISOString(),
        };
      }
    }

    // After trying all services at this level, if we got context-only results
    // (value = null but provenance set), check if any were valuable
    // Continue to next relaxation level
  }

  // All levels exhausted — no data found
  return null;
}

// ---------------------------------------------------------------------------
// Batch: Fetch multiple fields with service call grouping
// ---------------------------------------------------------------------------

/**
 * Fetches data for multiple assumption fields, grouping by service to minimize
 * duplicate API calls. If ADR, occupancy, and cap rate all need CoStar,
 * one CoStar call serves all three.
 */
export async function fetchMultipleFields(
  fields: string[],
  context: RoutingContext,
  maxRelaxLevel: RelaxationLevel = 5,
): Promise<Map<string, DataRouteResult>> {
  const results = new Map<string, DataRouteResult>();
  const startTime = Date.now();

  // ── Phase 1: handle "always available" services synchronously ───────────
  // (country-defaults, regulatory-data are in-memory and L0-only.)
  const alwaysAvailableFields = fields.filter(f => {
    const routes = DATA_ROUTING_TABLE[f];
    if (!routes) return false;
    return routes.some(r => r.service === "country-defaults" || r.service === "regulatory-data");
  });

  for (const field of alwaysAvailableFields) {
    const result = await fetchFieldData(field, context, 0); // L0 only for in-memory lookups
    if (result && result.value != null) {
      results.set(field, result);
    }
  }

  // ── Phase 2: parallel fetch the API-backed services ─────────────────────
  const remainingFields = fields.filter(f => !results.has(f));

  const promises = remainingFields.map(async (field) => {
    try {
      const result = await fetchFieldData(field, context, maxRelaxLevel);
      if (result) {
        return { field, result };
      }
    } catch (err: unknown) {
      logger.warn(
        `Data router: failed to fetch ${field}: ${err instanceof Error ? err.message : err}`,
        "data-router",
      );
    }
    return null;
  });

  const settled = await Promise.allSettled(promises);

  for (const s of settled) {
    if (s.status === "fulfilled" && s.value) {
      results.set(s.value.field, s.value.result);
    }
  }

  const elapsed = Date.now() - startTime;
  const verified = Array.from(results.values()).filter(r => r.value != null).length;
  logger.info(
    `Data router: fetched ${verified}/${fields.length} fields with data in ${elapsed}ms`,
    "data-router",
  );

  return results;
}

// ---------------------------------------------------------------------------
// Utility: List all routable fields
// ---------------------------------------------------------------------------

export function getRoutableFields(): string[] {
  return Object.keys(DATA_ROUTING_TABLE);
}

/** Get the routing table entry for a specific field */
export function getFieldRoutes(field: string): DataRoute[] | undefined {
  return DATA_ROUTING_TABLE[field];
}

/**
 * Get all fields that use a specific service.
 * Useful for understanding what breaks when a service goes down.
 */
export function getFieldsByService(serviceKey: string): string[] {
  const fields: string[] = [];
  for (const [field, routes] of Object.entries(DATA_ROUTING_TABLE)) {
    if (routes.some(r => r.service === serviceKey)) {
      fields.push(field);
    }
  }
  return fields;
}
