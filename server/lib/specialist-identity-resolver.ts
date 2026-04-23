/**
 * Server-side helpers that join the catalog factory default with any
 * Phase-3 admin override (specialist_identity_overrides) and return the
 * resolved persona. These wrap `resolveSpecialistIdentity()` from
 * engine/analyst/identity (pure) with the storage read so callsites that
 * narrate or render Specialist names get the override-wins value
 * automatically — without each callsite re-implementing the merge.
 *
 * Use these anywhere the engine renders a Specialist's persona name to
 * users (activity logs, tool inspector, sidebar). Do NOT use them inside
 * the IdentityTab routes themselves — those compose the same view directly
 * from the resolver and storage.
 */
import { storage } from "../storage";
import {
  GASPAR_IDENTITY,
  ORCHESTRATOR_SPECIALIST_ID,
  resolveSpecialistIdentity,
  type Gender,
  type IdentityCatalogDefault,
  type ResolvedIdentity,
} from "../../engine/analyst/identity";
import { getSpecialistById } from "../../engine/analyst/registry/specialist-catalog";

function catalogFor(id: string): IdentityCatalogDefault | null {
  if (id === ORCHESTRATOR_SPECIALIST_ID) {
    return { humanName: GASPAR_IDENTITY.humanName, gender: GASPAR_IDENTITY.gender };
  }
  const def = getSpecialistById(id);
  return def ? { humanName: def.humanName, gender: def.gender } : null;
}

/**
 * Resolve the currently-effective identity for a single specialist (or
 * the orchestrator if `id === "gaspar"`). Returns null for unknown ids
 * so callers can decide whether to fall back to the slug or 404.
 */
export async function getEffectiveSpecialistIdentity(
  id: string,
): Promise<ResolvedIdentity | null> {
  const catalog = catalogFor(id);
  if (!catalog) return null;
  const override = await storage.getIdentityOverride(id);
  return resolveSpecialistIdentity(catalog, override);
}

/**
 * Convenience wrapper for the orchestrator. Equivalent to
 * `getEffectiveSpecialistIdentity("gaspar")` but returns a non-null
 * resolved identity (the orchestrator catalog default always exists).
 */
export async function getEffectiveOrchestratorIdentity(): Promise<ResolvedIdentity> {
  const override = await storage.getIdentityOverride(ORCHESTRATOR_SPECIALIST_ID);
  return resolveSpecialistIdentity(
    { humanName: GASPAR_IDENTITY.humanName, gender: GASPAR_IDENTITY.gender },
    override,
  );
}

/**
 * Bulk version for surfaces that render many specialists (sidebar list,
 * tool inspector, audit feed). Single storage round-trip.
 *
 * Returns a map keyed by specialist id; ids unknown to the catalog are
 * omitted from the map (callers should fall back to the slug).
 */
export async function getEffectiveSpecialistIdentities(
  ids: readonly string[],
): Promise<Map<string, ResolvedIdentity>> {
  if (ids.length === 0) return new Map();
  const overrides = await storage.listIdentityOverrides();
  const overrideById = new Map(overrides.map((o) => [o.specialistId, o]));
  const out = new Map<string, ResolvedIdentity>();
  for (const id of ids) {
    const catalog = catalogFor(id);
    if (!catalog) continue;
    out.set(id, resolveSpecialistIdentity(catalog, overrideById.get(id) ?? null));
  }
  return out;
}

export type { Gender, ResolvedIdentity };
