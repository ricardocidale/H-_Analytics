/**
 * Shared types for the smart data router.
 *
 * Extracted from `server/ai/data-routing.ts` so that helper modules
 * (routing table, service registry, relaxation, dispatchers) can depend
 * on the same vocabulary without importing the orchestrator.
 */

export type RelaxationLevel = 0 | 1 | 2 | 3 | 4 | 5;

export type ConfidenceLevel = "high" | "medium" | "low";

export interface DataRoute {
  service: string;
  method: string;
  priority: number;
  description: string;
}

export interface DataRouteResult {
  field: string;
  value: number | string | null;
  range?: { low: number; mid: number; high: number };
  source: string;
  relaxationLevel: RelaxationLevel;
  confidence: ConfidenceLevel;
  provenance: string;
  fetchedAt: string;
}

export interface RoutingContext {
  location?: string;
  city?: string;
  state?: string;
  country?: string;
  qualityTier?: string;
  businessModel?: string;
  roomCount?: number;
  latitude?: number;
  longitude?: number;
  propertyType?: string;
  chainScale?: string;
  propertyId?: number;
}

/**
 * Relaxed version of the context at each progressive level.
 * At each level, some criteria are dropped or widened.
 */
export interface RelaxedContext {
  level: RelaxationLevel;
  location?: string;
  city?: string;
  state?: string;
  country?: string;
  qualityTier?: string;
  propertyType?: string;
  retained: string[];
  relaxed: string[];
}

/** Result of a single service-call dispatch for one field at one relaxation level. */
export interface DispatchResult {
  value: number | string | null;
  range?: { low: number; mid: number; high: number };
  provenance: string;
}
