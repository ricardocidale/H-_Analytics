/**
 * SpecialistConfigStorage — per-Specialist mutable runtime config.
 *
 * Spec: docs/architecture/resources-control-plane.md (P5 section)
 * Tables: specialist_configs, specialist_config_versions
 *
 * The Specialist catalog (`engine/analyst/registry/specialist-catalog.ts`) is
 * code-only and declares wiring. This storage holds the knobs an admin tweaks
 * without a deploy: prompt template, model assignment, required-field subset,
 * runtime/trigger config. Every mutating call writes the prior state to the
 * append-only `specialist_config_versions` table inside a single transaction
 * and bumps the parent row's `version`. Audit-tab history is read from there.
 *
 * Resource ASSIGNMENTS are NOT mutable through this surface — the Specialist
 * page renders them read-only. Edits happen on canonical Resources pages;
 * incident reroutes go through the break-glass override (P2).
 */
import { db } from "../db";
import { desc, eq } from "drizzle-orm";
import {
  specialistConfigs,
  specialistConfigVersions,
  specialistRecommendationEvents,
  type SpecialistConfigRow,
  type SpecialistConfigVersionRow,
  type SpecialistConfigSectionType,
  type SpecialistRecommendationAction,
  type SpecialistRecommendationEventRow,
} from "@shared/schema";
import { sql } from "drizzle-orm";

export interface SpecialistConfigPatch {
  promptTemplate?: string;
  modelResourceId?: number | null;
  requiredFields?: string[];
  fieldRequirements?: Record<string, "hard" | "recommended" | "off">;
  prerequisiteToggles?: Record<string, boolean>;
  runtimeConfig?: Record<string, unknown>;
  refreshCadenceDays?: number | null;
}

const EMPTY_CONFIG: Omit<SpecialistConfigRow, "id" | "specialistId" | "version" | "updatedByUserId" | "createdAt" | "updatedAt"> = {
  promptTemplate: "",
  modelResourceId: null,
  requiredFields: [],
  fieldRequirements: {},
  prerequisiteToggles: {},
  runtimeConfig: {},
  refreshCadenceDays: null,
  lastObservedMissing: [],
  lastObservedMissingAt: null,
};

export class SpecialistConfigStorage {
  /**
   * Returns the existing row or lazily creates an empty one. Empty defaults
   * mean "no admin override yet"; the surface specialist falls back to its
   * code-coded behavior when promptTemplate === "" and modelResourceId is null.
   */
  async getOrCreateSpecialistConfig(specialistId: string): Promise<SpecialistConfigRow> {
    const [existing] = await db
      .select()
      .from(specialistConfigs)
      .where(eq(specialistConfigs.specialistId, specialistId));
    if (existing) return existing;
    const [created] = await db
      .insert(specialistConfigs)
      .values({ specialistId, ...EMPTY_CONFIG, version: 1 })
      .onConflictDoNothing({ target: specialistConfigs.specialistId })
      .returning();
    if (created) return created;
    // Lost the race; re-read.
    const [row] = await db
      .select()
      .from(specialistConfigs)
      .where(eq(specialistConfigs.specialistId, specialistId));
    return row;
  }

  async getSpecialistConfig(specialistId: string): Promise<SpecialistConfigRow | undefined> {
    const [row] = await db
      .select()
      .from(specialistConfigs)
      .where(eq(specialistConfigs.specialistId, specialistId));
    return row || undefined;
  }

  /**
   * Returns the per-Specialist refresh-cadence overrides as a Map. Used by
   * the scheduled-refresh job and the Constants tab to resolve the
   * effective cadence (override → catalog default) without an N+1 lookup.
   * Specialists without an override are simply absent from the map.
   */
  async getRefreshCadenceOverrides(): Promise<Map<string, number>> {
    const rows = await db
      .select({
        specialistId: specialistConfigs.specialistId,
        refreshCadenceDays: specialistConfigs.refreshCadenceDays,
      })
      .from(specialistConfigs);
    const out = new Map<string, number>();
    for (const r of rows) {
      if (r.refreshCadenceDays != null) out.set(r.specialistId, r.refreshCadenceDays);
    }
    return out;
  }

  /**
   * Returns the union of hard-required field keys configured for every
   * Specialist whose id appears in `propertySubjectSpecialistIds`. Used by the
   * `all-properties-required-fields-complete` prerequisite evaluator
   * (engine/analyst/registry/prerequisite-registry.ts) to decide which keys
   * must be populated on every property in scope before a portfolio-level
   * Specialist runs. "Hard" matches the `deriveHardRequiredFieldKeys`
   * resolution: prefer per-candidate `fieldRequirements[key] === "hard"`,
   * fall back to the legacy `requiredFields` array when no toggle state has
   * been written yet, so Specialists migrated to the toggle UI are honored
   * correctly even when the legacy column is stale.
   */
  async listHardRequiredFieldKeysForSpecialists(
    specialistIds: readonly string[],
  ): Promise<string[]> {
    if (specialistIds.length === 0) return [];
    const rows = await db
      .select({
        specialistId: specialistConfigs.specialistId,
        requiredFields: specialistConfigs.requiredFields,
        fieldRequirements: specialistConfigs.fieldRequirements,
      })
      .from(specialistConfigs);
    const wanted = new Set(specialistIds);
    const out = new Set<string>();
    for (const r of rows) {
      if (!wanted.has(r.specialistId)) continue;
      const map = r.fieldRequirements ?? {};
      const hardKeys = Object.entries(map)
        .filter(([, level]) => level === "hard")
        .map(([k]) => k);
      if (hardKeys.length > 0 || Object.keys(map).length > 0) {
        for (const k of hardKeys) out.add(k);
      } else {
        for (const k of r.requiredFields ?? []) out.add(k);
      }
    }
    return Array.from(out);
  }

  /**
   * Records the candidate-field keys the most recent Specialist run
   * observed as missing-but-useful. Telemetry-only: does NOT bump
   * `version`, write a `specialist_config_versions` row, or appear in the
   * Audit tab. Each call overwrites the prior list.
   *
   * Lazily creates the row if absent so callers don't have to pre-create.
   */
  async recordObservedMissingFields(
    specialistId: string,
    keys: readonly string[],
    occurredAt: Date = new Date(),
  ): Promise<void> {
    // Ensure the row exists (the dispatch site usually loaded the config
    // already, but recording must not silently no-op for a fresh Specialist).
    await this.getOrCreateSpecialistConfig(specialistId);
    await db
      .update(specialistConfigs)
      .set({
        lastObservedMissing: [...keys],
        lastObservedMissingAt: occurredAt,
      })
      .where(eq(specialistConfigs.specialistId, specialistId));
  }

  /**
   * Append-only telemetry: an admin clicked "Promote to Recommended",
   * "Promote to Hard-required", or "Ignore" on an observed-missing
   * candidate row. We aggregate by (specialistId, fieldKey) to compute
   * the promote-vs-ignore ratio that decides whether a future catalog
   * release should bake "recommended" in by default.
   *
   * Promote actions are downstream-functional too — the SpecialistPage
   * still calls the existing config-section update to flip the toggle.
   * This row is independent telemetry, no version bump.
   */
  async recordRecommendationEvent(
    specialistId: string,
    fieldKey: string,
    action: SpecialistRecommendationAction,
    actorUserId: number,
  ): Promise<SpecialistRecommendationEventRow> {
    const [row] = await db
      .insert(specialistRecommendationEvents)
      .values({ specialistId, fieldKey, action, actorUserId })
      .returning();
    return row;
  }

  /**
   * Promote-vs-ignore counts grouped by `fieldKey` for one Specialist.
   * The Required Fields tab renders these next to the field name so an
   * admin can see "ignored 8 / promoted 2 — likely noise" at a glance.
   */
  async getRecommendationEventStats(
    specialistId: string,
  ): Promise<
    Array<{
      fieldKey: string;
      promoteRecommended: number;
      promoteHard: number;
      ignore: number;
    }>
  > {
    const rows = await db
      .select({
        fieldKey: specialistRecommendationEvents.fieldKey,
        action: specialistRecommendationEvents.action,
        count: sql<number>`count(*)::int`,
      })
      .from(specialistRecommendationEvents)
      .where(eq(specialistRecommendationEvents.specialistId, specialistId))
      .groupBy(
        specialistRecommendationEvents.fieldKey,
        specialistRecommendationEvents.action,
      );
    const byField = new Map<
      string,
      { fieldKey: string; promoteRecommended: number; promoteHard: number; ignore: number }
    >();
    for (const r of rows) {
      const existing =
        byField.get(r.fieldKey) ?? {
          fieldKey: r.fieldKey,
          promoteRecommended: 0,
          promoteHard: 0,
          ignore: 0,
        };
      if (r.action === "promote-recommended") existing.promoteRecommended = r.count;
      else if (r.action === "promote-hard") existing.promoteHard = r.count;
      else if (r.action === "ignore") existing.ignore = r.count;
      byField.set(r.fieldKey, existing);
    }
    return Array.from(byField.values());
  }

  async listSpecialistConfigVersions(specialistId: string, limit = 50): Promise<SpecialistConfigVersionRow[]> {
    return db
      .select()
      .from(specialistConfigVersions)
      .where(eq(specialistConfigVersions.specialistId, specialistId))
      .orderBy(desc(specialistConfigVersions.changedAt))
      .limit(limit);
  }

  /**
   * Atomic versioned update: snapshots the prior row into
   * specialist_config_versions and bumps the parent's `version`. The
   * `section` argument tags the audit row so the Audit tab can render
   * "edited LLM Config" vs "edited Required Fields" vs "edited Runtime"
   * without re-deriving from a diff.
   */
  async updateSpecialistConfigSection(
    specialistId: string,
    section: SpecialistConfigSectionType,
    patch: SpecialistConfigPatch,
    actorUserId: number,
    changeSummary?: string,
  ): Promise<SpecialistConfigRow> {
    return db.transaction(async (tx) => {
      // Ensure the row exists inside the same transaction (no race window).
      const [maybeExisting] = await tx
        .select()
        .from(specialistConfigs)
        .where(eq(specialistConfigs.specialistId, specialistId));
      let current = maybeExisting;
      if (!current) {
        const [created] = await tx
          .insert(specialistConfigs)
          .values({ specialistId, ...EMPTY_CONFIG, version: 1 })
          .returning();
        current = created;
      }

      // Snapshot prior state before applying the patch (history is the
      // PRE-edit value at the version number being closed out).
      await tx.insert(specialistConfigVersions).values({
        specialistId,
        version: current.version,
        section,
        promptTemplate: current.promptTemplate,
        modelResourceId: current.modelResourceId,
        requiredFields: current.requiredFields,
        fieldRequirements: current.fieldRequirements,
        prerequisiteToggles: current.prerequisiteToggles,
        runtimeConfig: current.runtimeConfig,
        refreshCadenceDays: current.refreshCadenceDays,
        changeSummary: changeSummary ?? null,
        changedByUserId: actorUserId,
      });

      const next: Partial<SpecialistConfigRow> = {
        version: current.version + 1,
        updatedByUserId: actorUserId,
        updatedAt: new Date(),
      };
      if (patch.promptTemplate !== undefined) next.promptTemplate = patch.promptTemplate;
      if (patch.modelResourceId !== undefined) next.modelResourceId = patch.modelResourceId;
      if (patch.requiredFields !== undefined) next.requiredFields = patch.requiredFields;
      if (patch.fieldRequirements !== undefined) next.fieldRequirements = patch.fieldRequirements;
      if (patch.prerequisiteToggles !== undefined) next.prerequisiteToggles = patch.prerequisiteToggles;
      if (patch.runtimeConfig !== undefined) next.runtimeConfig = patch.runtimeConfig;
      if (patch.refreshCadenceDays !== undefined) next.refreshCadenceDays = patch.refreshCadenceDays;

      const [updated] = await tx
        .update(specialistConfigs)
        .set(next)
        .where(eq(specialistConfigs.specialistId, specialistId))
        .returning();
      return updated;
    });
  }
}
