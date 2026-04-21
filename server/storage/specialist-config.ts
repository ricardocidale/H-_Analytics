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
  type SpecialistConfigRow,
  type SpecialistConfigVersionRow,
  type SpecialistConfigSectionType,
} from "@shared/schema";

export interface SpecialistConfigPatch {
  promptTemplate?: string;
  modelResourceId?: number | null;
  requiredFields?: string[];
  runtimeConfig?: Record<string, unknown>;
}

const EMPTY_CONFIG: Omit<SpecialistConfigRow, "id" | "specialistId" | "version" | "updatedByUserId" | "createdAt" | "updatedAt"> = {
  promptTemplate: "",
  modelResourceId: null,
  requiredFields: [],
  runtimeConfig: {},
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
        runtimeConfig: current.runtimeConfig,
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
      if (patch.runtimeConfig !== undefined) next.runtimeConfig = patch.runtimeConfig;

      const [updated] = await tx
        .update(specialistConfigs)
        .set(next)
        .where(eq(specialistConfigs.specialistId, specialistId))
        .returning();
      return updated;
    });
  }
}
