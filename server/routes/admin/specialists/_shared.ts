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
 *     specialists plus the synthetic id "gaspar" (orchestrator).
 */
import { z } from "zod";
import { getSpecialistById } from "../../../../engine/analyst/registry/specialist-catalog";
import type { SpecialistDefinition } from "@shared/schema/specialist";
import { getValidRequiredFieldKeys } from "../../../../engine/analyst/registry/required-field-keys";
import type { SpecialistConfigPublicView } from "@shared/schema";
import {
  GASPAR_IDENTITY,
  ORCHESTRATOR_SPECIALIST_ID,
  type IdentityCatalogDefault,
} from "../../../../engine/analyst/identity";

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
    return { humanName: GASPAR_IDENTITY.humanName, gender: GASPAR_IDENTITY.gender };
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
  def?: SpecialistDefinition,
): SpecialistConfigPublicView {
  const allow = getValidRequiredFieldKeys(row.specialistId);
  const definition = def ?? getSpecialistById(row.specialistId);
  const catalogDefault = definition?.refreshCadenceDays ?? null;
  const override = row.refreshCadenceDays ?? null;
  return {
    specialistId: row.specialistId,
    promptTemplate: row.promptTemplate,
    modelResourceId: row.modelResourceId,
    requiredFields: row.requiredFields ?? [],
    validRequiredFieldKeys: allow === null ? null : [...allow],
    fieldRequirements: row.fieldRequirements ?? {},
    prerequisiteToggles: row.prerequisiteToggles ?? {},
    runtimeConfig: row.runtimeConfig ?? {},
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
): string[] {
  const map = fieldRequirements ?? {};
  const hardKeys = Object.entries(map)
    .filter(([, level]) => level === "hard")
    .map(([k]) => k);
  if (hardKeys.length > 0 || Object.keys(map).length > 0) return hardKeys;
  // No toggle state set yet — fall back to legacy list to preserve current
  // gate behavior on Specialists that haven't been migrated.
  return [...(fallbackLegacy ?? [])];
}
