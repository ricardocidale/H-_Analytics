/**
 * Shared helpers and schemas for the admin Specialists sub-routers.
 *
 * Extracted from the previously-monolithic `server/routes/admin/specialists.ts`
 * (Task #482). Public exports:
 *   - `deriveHardRequiredFieldKeys` — also re-exported from the barrel
 *     `./index.ts` so existing dynamic-import callers keep working.
 *   - `toConfigView` — the SpecialistConfig → public-view mapper.
 *   - `idParamSchema` / `resetIdentityBodySchema` / `identityHistoryQuerySchema`
 *   - `getIdentityCatalogDefault` — resolves catalog identity for the 12
 *     specialists plus the synthetic orchestrator id (ORCHESTRATOR_SPECIALIST_ID).
 */
import { z } from "zod";
import {
  getSpecialistById,
  getLockedHardCandidateKeys,
} from "@engine/analyst/registry/specialist-catalog";
import type { SpecialistDefinition } from "@workspace/db";
import { getValidRequiredFieldKeys } from "@engine/analyst/registry/required-field-keys";
import type {
  SpecialistConfigPublicView,
  SpecialistGlobalLlmDefaults,
  SpecialistWorkflowOverrides,
} from "@workspace/db";
import {
  ORCHESTRATOR_IDENTITY,
  ORCHESTRATOR_SPECIALIST_ID,
  type IdentityCatalogDefault,
} from "@engine/analyst/identity";
import { RECOMMENDED_MODEL_SLUGS_BY_ROLE } from "@engine/analyst/registry/recommended-models";

export const idParamSchema = z.object({ id: z.string().min(1) });

// Phase 3 (#453) — Zod-validated payloads for the identity routes.
export const resetIdentityBodySchema = z.object({
  changeSummary: z.string().min(1).max(500).optional(),
}).strict();

export const identityHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional(),
});

/**
 * Look up the catalog factory-default identity for any id accepted by the
 * Phase-3 identity routes. Returns the orchestrator default for "gaspar"
 * (which is not part of SPECIALIST_CATALOG), or the catalog entry for one
 * of the 12 specialists. Returns null for unknown ids so the route can
 * 404 cleanly.
 */
export function getIdentityCatalogDefault(id: string): IdentityCatalogDefault | null {
  if (id === ORCHESTRATOR_SPECIALIST_ID) {
    return { humanName: ORCHESTRATOR_IDENTITY.humanName, gender: ORCHESTRATOR_IDENTITY.gender };
  }
  const def = getSpecialistById(id);
  if (!def) return null;
  return { humanName: def.humanName, gender: def.gender };
}

export function toConfigView(
  row: {
    specialistId: string;
    promptTemplate: string;
    modelResourceId: number | null;
    analystAModelResourceId: number | null;
    analystBModelResourceId: number | null;
    synthesisModelResourceId: number | null;
    fallbackModelResourceId: number | null;
    multiModelEnabled: boolean | null;
    workflowOverrides: SpecialistWorkflowOverrides | null;
    requiredFields: string[];
    fieldRequirements: Record<string, "hard" | "recommended" | "off">;
    prerequisiteToggles: Record<string, boolean>;
    runtimeConfig: Record<string, unknown>;
    refreshCadenceDays: number | null;
    lastObservedMissing: string[];
    lastObservedMissingAt: Date | null;
    version: number;
    updatedAt: Date;
  },
  def: SpecialistDefinition | undefined,
  globalLlmDefaults: SpecialistGlobalLlmDefaults,
): SpecialistConfigPublicView {
  const allow = getValidRequiredFieldKeys(row.specialistId);
  const definition = def ?? getSpecialistById(row.specialistId);
  const catalogDefault = definition?.refreshCadenceDays ?? null;
  const override = row.refreshCadenceDays ?? null;
  // Catalog-locked keys are immutable; legacy "hard" values are kept.
  const lockedHard = getLockedHardCandidateKeys(row.specialistId);
  const fieldReqs: Record<string, "hard" | "recommended" | "off"> = {
    ...(row.fieldRequirements ?? {}),
  };
  for (const k of lockedHard) fieldReqs[k] = "hard";
  return {
    specialistId: row.specialistId,
    promptTemplate: row.promptTemplate,
    modelResourceId: row.modelResourceId,
    analystAModelResourceId: row.analystAModelResourceId,
    analystBModelResourceId: row.analystBModelResourceId,
    synthesisModelResourceId: row.synthesisModelResourceId,
    fallbackModelResourceId: row.fallbackModelResourceId,
    multiModelEnabled: row.multiModelEnabled,
    workflowOverrides: row.workflowOverrides ?? null,
    globalLlmDefaults,
    requiredFields: row.requiredFields ?? [],
    validRequiredFieldKeys: allow === null ? null : [...allow],
    fieldRequirements: fieldReqs,
    lockedHardKeys: lockedHard,
    prerequisiteToggles: row.prerequisiteToggles ?? {},
    runtimeConfig: row.runtimeConfig ?? {},
    recommendedModelSlugs: {
      primary: RECOMMENDED_MODEL_SLUGS_BY_ROLE.primary,
      analystA: RECOMMENDED_MODEL_SLUGS_BY_ROLE.analystA,
      analystB: RECOMMENDED_MODEL_SLUGS_BY_ROLE.analystB,
      synthesis: RECOMMENDED_MODEL_SLUGS_BY_ROLE.synthesis,
      fallback: RECOMMENDED_MODEL_SLUGS_BY_ROLE.fallback,
    },
    refreshCadenceDays: override ?? catalogDefault,
    defaultRefreshCadenceDays: catalogDefault,
    refreshCadenceOverridden: override !== null,
    lastObservedMissing: row.lastObservedMissing ?? [],
    lastObservedMissingAt: row.lastObservedMissingAt
      ? row.lastObservedMissingAt.toISOString()
      : null,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Derive the "effective hard-required field keys" for the specialist gate
 * during the toggle-UI transition. A field is hard-required iff its catalog
 * candidate entry's `fieldRequirements[key]` is `"hard"`. The legacy
 * `requiredFields` column remains writable through the legacy route, but
 * the gate prefers `fieldRequirements` when any candidate row is set so a
 * Specialist that has migrated to the toggle UI is gated correctly even
 * if the legacy column is stale.
 *
 * Re-exported from the barrel `./index.ts` for backward compatibility with
 * existing dynamic-import callers (`server/routes/global-assumptions.ts`,
 * `server/routes/properties.ts`).
 */
export function deriveHardRequiredFieldKeys(
  fieldRequirements: Record<string, "hard" | "recommended" | "off"> | null | undefined,
  fallbackLegacy: string[] | null | undefined,
  /** Catalog-locked hard keys. Always present in the result. */
  lockedHard: readonly string[] = [],
): string[] {
  const map = fieldRequirements ?? {};
  const result = new Set<string>(lockedHard);
  for (const [k, v] of Object.entries(map)) {
    if (v === "hard") result.add(k);
  }
  if (Object.keys(map).length === 0 && result.size === 0) {
    for (const k of fallbackLegacy ?? []) result.add(k);
  }
  return Array.from(result);
}
