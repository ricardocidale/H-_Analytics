/**
 * server/defaults.ts — DB-backed reader for the Steady State → Defaults page.
 *
 * The `model_defaults` table holds the admin-managed seed values that become
 * a user's starting assumptions (see `shared/schema/model-defaults.ts`). The
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

import { eq } from "drizzle-orm";
import { db } from "./db";
import { modelDefaults, type ModelDefault } from "@shared/schema/model-defaults";

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
