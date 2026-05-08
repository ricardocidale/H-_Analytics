/**
 * Davide — financial-agents shared service: pre-engine constants overlay.
 *
 * Cross-app single-name agent per CLAUDE.md §10. The single helper here
 * (`withModelConstants`) is part of Davide's contract surface — see
 * docs/discipline/financial-agents-contract.md. Authoring authority:
 * CLAUDE.md §9 (shell CC only).
 *
 * apply-model-constants — overlay admin-governed Model Constants onto the
 * GlobalInput before it reaches the financial engine.
 *
 * This is the single boundary where rows in `model_constant_overrides`
 * (and the canonical `model_constants` table) become numbers the engine
 * actually uses. Without this overlay, an admin's Regenerate-via-Analyst
 * or manual override on (e.g.) `daysPerMonth` would be saved but ignored
 * by every projection.
 *
 * Scope:
 *   - Universal Model Constants (locality === "universal") are overlaid
 *     on the global object directly. `daysPerMonth` is the only one
 *     today.
 *   - Country-keyed constants overlaid here for the global jurisdiction
 *     baseline (United States today): `depreciationYears`. Per-property
 *     overrides still win the engine cascade
 *     (`property.X ?? global.X ?? CONSTANT`); the overlay only changes
 *     what `global.X` resolves to.
 *   - Other country / country+state constants (`inflationRate`,
 *     `costRateTaxes`, `taxRate`, `countryRiskPremium`,
 *     `capitalGainsRate`) are NOT yet overlaid here — moving them into
 *     the overlay requires backfilling existing globalAssumptions
 *     deviations into manual overrides so behavior is preserved. Tracked
 *     as a follow-up; see
 *     `docs/audits/task-379-defaults-vs-source-of-truth.md`.
 *
 * Server-side authoritative override: the value coming in on the request
 * body (from the client's local copy of globalAssumptions) is replaced
 * by the admin-governed value. The admin's override always wins, even if
 * a stale client sends a different number.
 */

import { storage } from "../storage";
import {
  MODEL_CONSTANTS_REGISTRY,
  REGISTERED_CONSTANT_KEYS,
} from "@shared/model-constants-registry";
import { getEffectiveConstant } from "@shared/get-effective-constant";
import type { ModelConstantOverride } from "@workspace/db";
import type { ModelConstant } from "@workspace/db";

/**
 * Country-keyed constants that are safe to overlay onto the global
 * jurisdiction baseline. The set is intentionally narrow: a key only
 * lands here once any production deviation in `globalAssumptions` has
 * been audited as either matching the canonical or migratable to a
 * manual override.
 *
 * SPECIAL RULE — `inflationRate`. Inflation is NOT a depreciation-style
 * regulatory constant. It is governed by `.claude/rules/inflation-cascade.md`
 * and the cascade `property → companyAssumptions → marketMacroFallback`.
 * Adding `inflationRate` to this set requires ALL THREE of:
 *   (a) Specialist-sourced canonical rows — written by an Intelligence
 *       specialist from a monetary-authority publication (US Fed target,
 *       IMF WEO, central-bank target). Admin hand-typed canonical rows
 *       without an `authoritySource`/`authorityRef` do NOT qualify.
 *   (b) Production-deviation backfill — every existing tenant whose
 *       `companyAssumptions.inflationRate` deviates from the seeded
 *       canonical is migrated to an explicit override row preserving
 *       their value, OR flagged for admin review before activation.
 *   (c) The behavior-preservation guard below remains intact (overlay
 *       only when an explicit admin override row exists; seeded
 *       canonical rows alone do not silently overwrite tenant data).
 * Without all three, inflationRate stays out of this set.
 */
const COUNTRY_KEYS_OVERLAID_ON_GLOBAL = new Set<string>([
  "depreciationYears",
]);

/** Jurisdiction baseline for the universal global object. */
const GLOBAL_JURISDICTION_COUNTRY = "United States";

/**
 * Pure overlay. Returns a new object with Model Constants applied.
 * Caller is responsible for loading the override + canonical arrays.
 *
 * Generic over T so engine types like GlobalInput flow through unchanged.
 */
export function applyModelConstantsToGlobals<T>(
  global: T,
  overrides: readonly ModelConstantOverride[],
  canonicals: readonly ModelConstant[] = [],
): T {
  if (!global || typeof global !== "object") return global;
  const overlaid: Record<string, unknown> = { ...(global as Record<string, unknown>) };
  for (const key of REGISTERED_CONSTANT_KEYS) {
    const entry = MODEL_CONSTANTS_REGISTRY[key];
    if (!entry) continue;
    if (entry.locality === "universal") {
      const resolved = getEffectiveConstant({ key, overrides, canonicals });
      if (resolved.value !== undefined) {
        overlaid[key] = resolved.value;
      }
    } else if (entry.locality === "country" && COUNTRY_KEYS_OVERLAID_ON_GLOBAL.has(key)) {
      const resolved = getEffectiveConstant({
        key,
        country: GLOBAL_JURISDICTION_COUNTRY,
        overrides,
        canonicals,
      });
      // Behavior-preservation guard: overlay ONLY when an explicit
      // admin override row exists (manual or analyst). Seeded canonical
      // rows are NOT a sufficient signal — historically, tenants could
      // set a non-default `globalAssumptions.depreciationYears` via the
      // old editable control, and silently replacing that with the
      // seeded canonical (39 for US) would change engine outputs without
      // a migration. The overlay therefore wires the Constants tab as a
      // true canonical edit surface (admin opts in by saving an
      // override) while leaving historical tenant deviations intact.
      // Migration plan to switch to a "canonical-row also wins" policy
      // is tracked under follow-up #381.
      const isExplicitOverride =
        resolved.source === "manual" || resolved.source === "analyst";
      if (isExplicitOverride && resolved.value !== undefined) {
        overlaid[key] = resolved.value;
      }
    }
  }
  return overlaid as T;
}

/**
 * Async wrapper: load the override + canonical lists from storage and
 * apply. Use this at any route or service boundary where a
 * `globalAssumptions` payload is about to be passed to the engine.
 */
export async function withModelConstants<T>(global: T): Promise<T> {
  if (!global || typeof global !== "object") return global;
  const [overrides, canonicals] = await Promise.all([
    storage.listModelConstantOverrides(),
    storage.listCanonicals(),
  ]);
  return applyModelConstantsToGlobals(global, overrides, canonicals);
}
