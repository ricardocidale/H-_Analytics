/**
 * apply-model-constants — overlay admin-governed Model Constants onto the
 * GlobalInput before it reaches the financial engine.
 *
 * This is the single boundary where rows in `model_constant_overrides`
 * become numbers the engine actually uses. Without this overlay, an admin's
 * Regenerate-via-Analyst or manual override on (e.g.) `daysPerMonth` would
 * be saved but ignored by every projection.
 *
 * Scope (Phase 5):
 *   - Universal Model Constants (locality === "universal") are overlaid on
 *     the global object directly. `daysPerMonth` is the only one today.
 *   - Country / country+state constants are NOT overlaid here — the engine
 *     resolves those per-property via the existing
 *     `property.X ?? global.X ?? CONSTANT` cascade. Migrating those into
 *     the overlay needs per-property locality plumbing and is its own task.
 *
 * Server-side authoritative override: the value coming in on the request
 * body (from the client's local copy of globalAssumptions) is replaced by
 * the admin-governed value. The admin's override always wins, even if a
 * stale client sends a different number.
 */

import { storage } from "../storage";
import {
  MODEL_CONSTANTS_REGISTRY,
  REGISTERED_CONSTANT_KEYS,
} from "@shared/model-constants-registry";
import { getEffectiveConstant } from "@shared/get-effective-constant";
import type { ModelConstantOverride } from "@shared/schema/model-constants";

/**
 * Pure overlay. Returns a new object with universal Model Constants applied.
 * Caller is responsible for loading the override array.
 *
 * Generic over T so engine types like GlobalInput flow through unchanged.
 */
export function applyModelConstantsToGlobals<T>(
  global: T,
  overrides: readonly ModelConstantOverride[],
): T {
  if (!global || typeof global !== "object") return global;
  const overlaid: Record<string, unknown> = { ...(global as Record<string, unknown>) };
  for (const key of REGISTERED_CONSTANT_KEYS) {
    const entry = MODEL_CONSTANTS_REGISTRY[key];
    if (entry?.locality !== "universal") continue;
    const resolved = getEffectiveConstant({ key, overrides });
    if (resolved.value !== undefined) {
      overlaid[key] = resolved.value;
    }
  }
  return overlaid as T;
}

/**
 * Async wrapper: load the override list from storage and apply. Use this at
 * any route or service boundary where a `globalAssumptions` payload is
 * about to be passed to the engine.
 */
export async function withModelConstants<T>(global: T): Promise<T> {
  if (!global || typeof global !== "object") return global;
  const overrides = await storage.listModelConstantOverrides();
  return applyModelConstantsToGlobals(global, overrides);
}
