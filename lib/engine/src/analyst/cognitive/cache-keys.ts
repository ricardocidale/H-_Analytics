/**
 * cache-keys.ts — Content-addressed cache key computation for verdict cache.
 *
 * Implements Phase 5A utilities from ADR-004. Pure functions only — no DB,
 * no I/O, no singletons. All cache-key material is derivable from the
 * caller's inputs, which means:
 *
 *   1. Tests don't need fixtures or DB state.
 *   2. Replit's Phase 5A migrations can rely on identical key computation
 *      without importing this file's dependencies.
 *   3. Future Edge/Worker deployment has no porting work.
 *
 * The read/write path that consumes these keys lives in engine-client.ts
 * (Phase 5B for reads, Phase 5C for writes). That path imports this module.
 *
 * See: docs/architecture/decisions/ADR-004-verdict-cache.md §"Cache key shape"
 *      and §"Invalidation triggers".
 */

import { createHash } from "node:crypto";
import type { CanonicalResearchField } from "@server/ai/synthesis-schema.js";

// ──────────────────────────────────────────────────────────────────────────
// Types

/**
 * Full structured cache key. The SHA-256 of the canonical JSON of this
 * object is the `cache_key` stored in `research_runs.cache_key`.
 */
export type VerdictCacheKey = {
  /** Scenario context; null = shared workspace (the default viewer state). */
  scenarioId: number | null;
  entityType: "property" | "company";
  entityId: number;
  /**
   * Canonical field keys this cache entry covers. Sorted and deduplicated
   * before hashing. One cache entry can cover a multi-field orchestration
   * request (research_runs is the unit, and one run produces many
   * assumption_guidance rows).
   */
  fieldGroup: CanonicalResearchField[];
  /**
   * Hash of the resolved AnalystPersona at call time. Until multi-tenant
   * persona resolution (SYSTEM-MODEL §9 N3) lands, this is the hash of
   * {L+B, luxury, US}. The key shape is persona-shape-agnostic by design.
   */
  personaHash: string;
  /**
   * Hash of the entity inputs that affect this field group. Stored
   * separately on `research_runs.cache_inputs_hash` so a missed lookup
   * can diagnose the axis that failed.
   */
  inputContextHash: string;
  /**
   * `ENGINE_VERSION` at call time. Bumped when orchestrator semantics
   * change (prompt builder, synthesis schema, model). Forcing old entries
   * to cold-miss on any engine change.
   */
  engineVersion: string;
};

/**
 * Subset of property inputs used to compute `inputContextHash`. The actual
 * input dependencies are declared via `FIELD_GROUP_INPUT_DEPENDENCIES`
 * below; this type enumerates every field that any canonical research
 * field could possibly depend on.
 */
export type PropertyCacheInputs = {
  // Identity-affecting: change any of these and almost every research
  // field should re-run because the property is effectively a different
  // asset.
  type?: string | null;
  businessModel?: string | null;
  location?: string | null;
  market?: string | null;
  country?: string | null;
  stateProvince?: string | null;
  marketTier?: string | null;
  propertyType?: string | null;
  qualityTier?: string | null;
  serviceLevel?: string | null;
  roomCount?: number | null;
  maxGuests?: number | null;
  hasFB?: boolean | null;
  hasEvents?: boolean | null;
  // Financial structure: affects returns/financing/tax fields
  purchasePrice?: number | null;
  buildingImprovements?: number | null;
  acquisitionLTV?: number | null;
  operatingReserve?: number | null;
  // Macro + tax
  inflationRate?: number | null;
  taxRate?: number | null;
};

export type CompanyCacheInputs = {
  // Management-company identity
  propertyType?: string | null;
  numProperties?: number | null;
  region?: string | null;
  country?: string | null;
  // Capital structure
  capitalRaise1Amount?: number | null;
  capitalRaise2Amount?: number | null;
  capitalRaise3Amount?: number | null;
  // Fee tier (affects incentive/base fee ranges)
  baseManagementFee?: number | null;
  incentiveManagementFee?: number | null;
};

// ──────────────────────────────────────────────────────────────────────────
// Field-group → input-dependency map
//
// v0 (shipped 2026-04-20): conservative — every canonical research field
// depends on the full property input context. That means any input change
// cold-misses the whole cache for that property, which is safe but
// pessimistic. Future passes should narrow each field to only the inputs
// it genuinely depends on (e.g., `occupancy` probably only depends on
// location/market/roomCount/marketTier, not on acquisitionLTV).
//
// When narrowing, add a row per field with its specific input key list.
// The lookup code falls back to the "*" entry for any field not listed.

type CacheInputKey = keyof PropertyCacheInputs | keyof CompanyCacheInputs;

const FULL_PROPERTY_INPUTS: (keyof PropertyCacheInputs)[] = [
  "type",
  "businessModel",
  "location",
  "market",
  "country",
  "stateProvince",
  "marketTier",
  "propertyType",
  "qualityTier",
  "serviceLevel",
  "roomCount",
  "maxGuests",
  "hasFB",
  "hasEvents",
  "purchasePrice",
  "buildingImprovements",
  "acquisitionLTV",
  "operatingReserve",
  "inflationRate",
  "taxRate",
];

const FULL_COMPANY_INPUTS: (keyof CompanyCacheInputs)[] = [
  "propertyType",
  "numProperties",
  "region",
  "country",
  "capitalRaise1Amount",
  "capitalRaise2Amount",
  "capitalRaise3Amount",
  "baseManagementFee",
  "incentiveManagementFee",
];

/**
 * Per-field input-dependency map. "*" means "all inputs for this entity
 * type". Override with a tighter list when field-by-field analysis has
 * been done.
 */
export const FIELD_GROUP_INPUT_DEPENDENCIES: Partial<
  Record<CanonicalResearchField | "*", CacheInputKey[] | "*">
> = {
  "*": "*",
};

// ──────────────────────────────────────────────────────────────────────────
// Canonical JSON

/**
 * Stringify an object with stable key order and trimmed whitespace. Hashes
 * computed over this output are deterministic regardless of how the source
 * object was constructed.
 *
 * Nested objects are recursed. Arrays preserve element order (callers are
 * responsible for sorting arrays whose order shouldn't affect the hash).
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  // Date / boxed primitives / objects with toJSON: pre-serialize so their
  // content appears in the hash. Without this, `new Date(...)` hashes as
  // `{}` because Object.entries on a Date returns no own enumerable keys.
  if (
    value instanceof Date ||
    (typeof (value as { toJSON?: unknown }).toJSON === "function")
  ) {
    return (value as { toJSON: () => unknown }).toJSON();
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined) // drop undefineds so unset ≡ absent
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => [k, sortKeys(v)] as const);
  return Object.fromEntries(entries);
}

// ──────────────────────────────────────────────────────────────────────────
// Hash primitives

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

// ──────────────────────────────────────────────────────────────────────────
// Public API

/**
 * Compute the `inputContextHash` for a set of entity inputs against one or
 * more canonical fields. Only the inputs declared in
 * FIELD_GROUP_INPUT_DEPENDENCIES for the requested fields are included.
 *
 * On v0 (2026-04-20 baseline) every field uses the "*" fallback, so this
 * hash covers every field in the inputs object. That means any input
 * change cold-misses every field's cache — safe but pessimistic.
 */
export function computeInputContextHash(
  entityType: "property" | "company",
  inputs: PropertyCacheInputs | CompanyCacheInputs,
  fields: CanonicalResearchField[]
): string {
  const relevant = collectRelevantInputs(entityType, inputs, fields);
  return sha256Hex(canonicalJson(relevant));
}

function collectRelevantInputs(
  entityType: "property" | "company",
  inputs: PropertyCacheInputs | CompanyCacheInputs,
  fields: CanonicalResearchField[]
): Record<string, unknown> {
  const keySet = new Set<string>();

  for (const field of fields) {
    const dep = FIELD_GROUP_INPUT_DEPENDENCIES[field];
    const effective = dep ?? FIELD_GROUP_INPUT_DEPENDENCIES["*"];
    if (effective === "*" || effective === undefined) {
      const fullList =
        entityType === "property" ? FULL_PROPERTY_INPUTS : FULL_COMPANY_INPUTS;
      for (const k of fullList) keySet.add(k);
    } else {
      for (const k of effective) keySet.add(k);
    }
  }

  const result: Record<string, unknown> = {};
  const source = inputs as Record<string, unknown>;
  for (const k of Array.from(keySet).sort()) {
    if (k in source) result[k] = source[k];
  }
  return result;
}

/**
 * Compute the full cache key hash from a VerdictCacheKey. This is what
 * gets stored in `research_runs.cache_key` and used for `SELECT ... WHERE
 * cache_key = $key` lookups.
 *
 * Field groups are normalized (sorted + deduplicated) before hashing so
 * that {["adr", "occupancy"]} and {["occupancy", "adr"]} collapse to the
 * same key.
 */
export function computeCacheKey(key: VerdictCacheKey): string {
  const normalized: VerdictCacheKey = {
    ...key,
    fieldGroup: Array.from(new Set(key.fieldGroup)).sort(),
  };
  return sha256Hex(canonicalJson(normalized));
}
