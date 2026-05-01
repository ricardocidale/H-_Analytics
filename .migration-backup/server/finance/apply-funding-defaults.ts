/**
 * apply-funding-defaults — overlay admin-managed Funding Specialist
 * Defaults onto a globalAssumptions row before it reaches the client or
 * the Funding Specialist evaluator.
 *
 * Cascade rule (per `.claude/rules/inflation-cascade.md` §three-tier):
 *   Constants → Defaults → Assumptions
 *
 * The four Funding Specialist columns on `global_assumptions`
 * (`runwayBufferMonths`, `sizingOvershootPct`, `revenueRampDelayMonths`,
 * `burnFlexDownPct`) are intentionally nullable — NULL means "no
 * Assumption-tier value, inherit from the Default tier". Without this
 * overlay the client would fall straight through NULL to the hardcoded
 * `DEFAULT_*` constant in `shared/constants-funding.ts`, hiding the
 * admin's Default-tier value (the value the admin tuned on Steady State
 * → Defaults).
 *
 * Why a sibling module to `apply-model-constants.ts` instead of
 * extending it: that module is the Constants-tier overlay (sources
 * `model_canonicals` / `model_constant_overrides`). This is the
 * Defaults-tier overlay (sources `model_defaults`). Keeping the two
 * tiers in separate modules matches the Constants-vs-Defaults rule and
 * keeps each overlay's blast radius narrow.
 *
 * Behavior contract:
 *   - If a column already holds a finite number, it is left untouched
 *     (the user's saved Assumption wins).
 *   - If a column is NULL/undefined and a `model_defaults` row exists
 *     for the canonical key (`mc.funding.<column>`), the Default's
 *     `value` is overlaid.
 *   - If a column is NULL and no Default row exists, the column stays
 *     NULL — downstream consumers fall through to the hardcoded
 *     `DEFAULT_*` constant exactly as they do today.
 */

import { resolveDefault } from "../defaults";

/**
 * Canonical (column → default-key) map for the four Funding Specialist
 * fields. Mirrors the seed in `script/seed-model-defaults.ts` (rows
 * with `card="funding"`, `subTab="funding"`).
 */
export const FUNDING_DEFAULT_COLUMNS = [
  { column: "runwayBufferMonths",     defaultKey: "mc.funding.runwayBufferMonths" },
  { column: "sizingOvershootPct",     defaultKey: "mc.funding.sizingOvershootPct" },
  { column: "revenueRampDelayMonths", defaultKey: "mc.funding.revenueRampDelayMonths" },
  { column: "burnFlexDownPct",        defaultKey: "mc.funding.burnFlexDownPct" },
] as const;

/**
 * Pure overlay. Accepts a globalAssumptions-shaped object and a map of
 * already-resolved default values keyed by `defaultKey`, and returns a
 * new object with NULL columns filled in from the map. No I/O — used by
 * the async wrapper below and by focused tests.
 */
export function applyFundingDefaultsOverlay<T>(
  global: T,
  resolvedDefaults: ReadonlyMap<string, unknown>,
): T {
  if (!global || typeof global !== "object") return global;
  const overlaid: Record<string, unknown> = { ...(global as Record<string, unknown>) };
  for (const { column, defaultKey } of FUNDING_DEFAULT_COLUMNS) {
    const current = overlaid[column];
    const isMissing =
      current === null ||
      current === undefined ||
      (typeof current === "number" && !Number.isFinite(current));
    if (!isMissing) continue;
    const def = resolvedDefaults.get(defaultKey);
    if (typeof def === "number" && Number.isFinite(def)) {
      overlaid[column] = def;
    }
  }
  return overlaid as T;
}

/**
 * Async wrapper: resolves each Funding Default from `model_defaults`
 * (universal scope, no country/businessType filter today) and applies
 * the overlay. Use this at any route boundary that reads
 * `globalAssumptions` and either (a) ships it to the client, or (b)
 * feeds the Funding Specialist evaluator's `CapitalRaiseInputs`.
 */
export async function withFundingDefaults<T>(global: T): Promise<T> {
  if (!global || typeof global !== "object") return global;
  const entries = await Promise.all(
    FUNDING_DEFAULT_COLUMNS.map(async ({ defaultKey }) => {
      const value = await resolveDefault<unknown>(defaultKey);
      return [defaultKey, value] as const;
    }),
  );
  const map = new Map<string, unknown>();
  for (const [key, value] of entries) {
    if (value !== undefined) map.set(key, value);
  }
  return applyFundingDefaultsOverlay(global, map);
}
