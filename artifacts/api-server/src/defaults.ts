/**
 * server/defaults.ts — DB-backed reader for the Model Defaults → Defaults page.
 *
 * The `model_defaults` table holds the admin-managed seed values that become
 * a user's starting assumptions (see `lib/db/src/schema/model-defaults.ts`). The
 * downstream financial engine is **pure** — it cannot touch I/O. So this
 * module is the boundary layer: server code calls `resolveDefault` once at
 * the edge of a request, turns the result into a typed overlay, and hands
 * that overlay into the pure engine as an argument.
 *
 * Resolution contract (most-specific-wins):
 *   A row is a *candidate* for a given (key, scope) if, for every scope
 *   dimension (country, countrySubdivision, businessType, sizeBand), either
 *   the row's column is NULL (universal at that dimension) or it matches
 *   the passed scope value exactly.
 *   Among candidates, specificity = count of non-NULL scope columns. The
 *   highest-scoring row wins. Ties (two rows at the same specificity) are
 *   broken by `id DESC` — the most recently written row wins — which is the
 *   expected behaviour when the Analyst proposes an alternative override at
 *   the same scope and the admin accepts it.
 *
 * This module does NOT apply pending `proposed_*` values. Those surface in
 * the Admin UI's Pending Proposals queue. The engine reads only `value`.
 */

import { eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { modelDefaults, icpBrackets, type ModelDefault, type BracketMixData } from "@workspace/db";

export interface DefaultScope {
  country?: string | null;
  countrySubdivision?: string | null;
  businessType?: string | null;
  sizeBand?: string | null;
}

function isCompatible(row: ModelDefault, scope: DefaultScope): boolean {
  return (
    (row.country === null || row.country === (scope.country ?? null)) &&
    (row.countrySubdivision === null || row.countrySubdivision === (scope.countrySubdivision ?? null)) &&
    (row.businessType === null || row.businessType === (scope.businessType ?? null)) &&
    (row.sizeBand === null || row.sizeBand === (scope.sizeBand ?? null))
  );
}

function specificity(row: ModelDefault): number {
  return (
    (row.country === null ? 0 : 1) +
    (row.countrySubdivision === null ? 0 : 1) +
    (row.businessType === null ? 0 : 1) +
    (row.sizeBand === null ? 0 : 1)
  );
}

function pickBest(rows: ModelDefault[], scope: DefaultScope): ModelDefault | undefined {
  let best: ModelDefault | undefined;
  let bestScore = -1;
  for (const row of rows) {
    if (!isCompatible(row, scope)) continue;
    const score = specificity(row);
    if (score > bestScore || (score === bestScore && best !== undefined && row.id > best.id)) {
      best = row;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Resolve a single default by key and scope.
 *
 * Returns the row's `value` cast to T, or `undefined` if no compatible row
 * exists. Callers decide the fallback policy (usually: fall back to the TS
 * constant that was the pre-DB source of truth).
 */
export async function resolveDefault<T = unknown>(
  key: string,
  scope: DefaultScope = {},
): Promise<T | undefined> {
  const rows = await db
    .select()
    .from(modelDefaults)
    .where(eq(modelDefaults.defaultKey, key));
  const best = pickBest(rows, scope);
  return best === undefined ? undefined : (best.value as T);
}

/**
 * Resolve every default in a given card (category/subTab/cardKey tuple) for
 * the given scope. Returns a Map keyed by `defaultKey`, value is the raw
 * JSON value from the winning row for that key.
 *
 * This is the "card Save" shape used by the Admin UI and by server code that
 * needs a whole card's worth of defaults at once (e.g. MC funding calc).
 */
export async function resolveDefaultsByCard(
  category: string,
  subTab: string,
  cardKey: string,
  scope: DefaultScope = {},
): Promise<Map<string, unknown>> {
  const rows = await db
    .select()
    .from(modelDefaults)
    .where(eq(modelDefaults.cardKey, cardKey));

  const filtered = rows.filter(
    (r) => r.category === category && r.subTab === subTab,
  );

  const byKey = new Map<string, ModelDefault[]>();
  for (const row of filtered) {
    const list = byKey.get(row.defaultKey);
    if (list) list.push(row);
    else byKey.set(row.defaultKey, [row]);
  }

  const out = new Map<string, unknown>();
  byKey.forEach((candidates, key) => {
    const best = pickBest(candidates, scope);
    if (best !== undefined) out.set(key, best.value);
  });
  return out;
}

// ── Property financial hydration ──────────────────────────────────────────────

/** The 5 underwriting fields that must be non-null before any engine call. */
export interface HydratedFinancials {
  acquisitionLTV: number;
  refinanceLTV: number;
  exitCapRate: number;
  maxOccupancy: number;
  refiMaxLtvToOriginal: number;
}

type PartialFinancials = {
  acquisitionLTV?: number | null;
  refinanceLTV?: number | null;
  exitCapRate?: number | null;
  maxOccupancy?: number | null;
  refiMaxLtvToOriginal?: number | null;
};

const FINANCIAL_DEFAULT_KEYS = [
  { field: "acquisitionLTV",       defaultKey: "mc.funding.ltv" },
  { field: "refinanceLTV",         defaultKey: "mc.funding.refiLtv" },
  { field: "exitCapRate",          defaultKey: "mc.tax_exit.exitCapRate" },
  { field: "maxOccupancy",         defaultKey: "mc.property_defaults.maxOccupancy" },
  { field: "refiMaxLtvToOriginal", defaultKey: "mc.funding.refiMaxLtvToOriginal" },
] as const;

/**
 * Guarantees all five underwriting fields are non-null.
 *
 * Precedence: property record value (if set) > model_defaults DB row > error.
 * The startup guard (assertRequiredModelDefaults) ensures the DB rows exist, so
 * the error branch is only reached if the DB is empty on a non-guarded path.
 *
 * Call this at every server-side boundary before passing a property to the engine.
 * For batch property arrays, use hydratePropertiesFinancials.
 */
export async function hydratePropertyFinancials(
  property: PartialFinancials,
  scope: DefaultScope = {},
): Promise<HydratedFinancials> {
  const defaultKeys = FINANCIAL_DEFAULT_KEYS.map(m => m.defaultKey) as string[];
  const rows = await db
    .select()
    .from(modelDefaults)
    .where(inArray(modelDefaults.defaultKey, defaultKeys));

  const resolved = new Map<string, number>();
  for (const { defaultKey } of FINANCIAL_DEFAULT_KEYS) {
    const candidates = rows.filter(r => r.defaultKey === defaultKey);
    const best = pickBest(candidates, scope);
    if (best !== undefined && typeof best.value === "number") {
      resolved.set(defaultKey, best.value);
    }
  }

  const hydrate = (field: keyof PartialFinancials, defaultKey: string): number => {
    const existing = property[field];
    if (existing != null && Number.isFinite(existing)) return existing as number;
    const dbVal = resolved.get(defaultKey);
    if (dbVal !== undefined) return dbVal;
    throw new Error(
      `hydratePropertyFinancials: required model_defaults key "${defaultKey}" is missing. ` +
      `Run seedModelDefaults or restart the server to reseed.`,
    );
  };

  return {
    acquisitionLTV:       hydrate("acquisitionLTV",       "mc.funding.ltv"),
    refinanceLTV:         hydrate("refinanceLTV",         "mc.funding.refiLtv"),
    exitCapRate:          hydrate("exitCapRate",          "mc.tax_exit.exitCapRate"),
    maxOccupancy:         hydrate("maxOccupancy",         "mc.property_defaults.maxOccupancy"),
    refiMaxLtvToOriginal: hydrate("refiMaxLtvToOriginal", "mc.funding.refiMaxLtvToOriginal"),
  };
}

/**
 * Batch variant: overlays null financial fields from model_defaults on each property.
 * Resolved DB rows are fetched once for the whole batch; scope is derived per-property.
 * Returns a new array with the same objects but null underwriting fields filled in.
 * Non-fatal: if resolution fails, the original array is returned unchanged.
 */
export async function withFinancialHydration<T extends Record<string, unknown>>(
  properties: T[],
): Promise<T[]> {
  if (properties.length === 0) return properties;

  // Fetch all relevant model_defaults rows once for the batch.
  const defaultKeys = FINANCIAL_DEFAULT_KEYS.map(m => m.defaultKey) as string[];
  const rows = await db
    .select()
    .from(modelDefaults)
    .where(inArray(modelDefaults.defaultKey, defaultKeys));

  return properties.map(p => {
    const scope: DefaultScope = {
      country: p.country as string | null | undefined,
      businessType: (p.type ?? p.businessType) as string | null | undefined,
    };
    const patched: Record<string, unknown> = { ...p };
    for (const { field, defaultKey } of FINANCIAL_DEFAULT_KEYS) {
      if (patched[field] != null) continue;
      const candidates = rows.filter(r => r.defaultKey === defaultKey);
      const best = pickBest(candidates, scope);
      if (best !== undefined && typeof best.value === "number") {
        patched[field] = best.value;
      }
    }
    return patched as T;
  });
}
