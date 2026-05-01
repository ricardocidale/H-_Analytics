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
import { and, desc, eq, gte, isNull } from "drizzle-orm";
import {
  specialistConfigs,
  specialistConfigVersions,
  specialistRecommendationEvents,
  specialistRecommendationCounters,
  users,
  type SpecialistConfigRow,
  type SpecialistConfigVersionRow,
  type SpecialistConfigSectionType,
  type SpecialistRecommendationAction,
  type SpecialistRecommendationEventRow,
  type SpecialistWorkflowOverrides,
} from "@workspace/db";
import { sql } from "drizzle-orm";

export interface SpecialistConfigPatch {
  promptTemplate?: string;
  modelResourceId?: number | null;
  analystAModelResourceId?: number | null;
  analystBModelResourceId?: number | null;
  synthesisModelResourceId?: number | null;
  fallbackModelResourceId?: number | null;
  multiModelEnabled?: boolean | null;
  workflowOverrides?: SpecialistWorkflowOverrides | null;
  requiredFields?: string[];
  fieldRequirements?: Record<string, "hard" | "recommended" | "off">;
  prerequisiteToggles?: Record<string, boolean>;
  runtimeConfig?: Record<string, unknown>;
  refreshCadenceDays?: number | null;
}

const EMPTY_CONFIG: Omit<SpecialistConfigRow, "id" | "specialistId" | "version" | "updatedByUserId" | "createdAt" | "updatedAt"> = {
  promptTemplate: "",
  modelResourceId: null,
  analystAModelResourceId: null,
  analystBModelResourceId: null,
  synthesisModelResourceId: null,
  fallbackModelResourceId: null,
  multiModelEnabled: null,
  workflowOverrides: null,
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
   * Task #502 — returns the set of specialist ids whose `specialist_configs`
   * row currently overrides ANY field of the global LLM defaults or the
   * global pipeline policy. Used by the catalog list endpoint to surface
   * an "Overrides" badge on each Specialist sidebar row, and by the LLM
   * Defaults summary card to render the "N Specialists currently override
   * these" callout.
   *
   * "Override" is defined as (column-by-column) non-null on any of:
   *   - multiModelEnabled (tri-state; null = inherit)
   *   - analystAModelResourceId / analystBModelResourceId
   *   - synthesisModelResourceId / fallbackModelResourceId
   *   - workflowOverrides (jsonb; non-null AND has at least one non-null key)
   *
   * `modelResourceId` (the per-Specialist primary model) and `promptTemplate`
   * are NOT considered overrides because there is no global default they
   * diverge from — every Specialist owns its own primary model + prompt.
   */
  async listSpecialistsWithLlmOverrides(): Promise<Set<string>> {
    const rows = await db
      .select({
        specialistId: specialistConfigs.specialistId,
        multiModelEnabled: specialistConfigs.multiModelEnabled,
        analystAModelResourceId: specialistConfigs.analystAModelResourceId,
        analystBModelResourceId: specialistConfigs.analystBModelResourceId,
        synthesisModelResourceId: specialistConfigs.synthesisModelResourceId,
        fallbackModelResourceId: specialistConfigs.fallbackModelResourceId,
        workflowOverrides: specialistConfigs.workflowOverrides,
      })
      .from(specialistConfigs);
    const out = new Set<string>();
    for (const r of rows) {
      if (
        r.multiModelEnabled !== null ||
        r.analystAModelResourceId !== null ||
        r.analystBModelResourceId !== null ||
        r.synthesisModelResourceId !== null ||
        r.fallbackModelResourceId !== null
      ) {
        out.add(r.specialistId);
        continue;
      }
      const wf = r.workflowOverrides;
      if (wf && Object.values(wf).some((v) => v !== null && v !== undefined)) {
        out.add(r.specialistId);
      }
    }
    return out;
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

    // Task #438 — bump the per-(specialistId, fieldKey) appearance counter
    // for every key in this run. Upsert with ON CONFLICT so the first
    // appearance creates the row and subsequent ones increment in place.
    // Done as one round-trip per key to keep the migration pgnative
    // (no array unnest plumbing) — these lists are catalog-bounded
    // (≤ 20 keys per Specialist), so the constant-factor cost is fine.
    if (keys.length === 0) return;
    for (const key of keys) {
      await db
        .insert(specialistRecommendationCounters)
        .values({
          specialistId,
          fieldKey: key,
          appearances: 1,
          firstObservedAt: occurredAt,
          lastObservedAt: occurredAt,
        })
        .onConflictDoUpdate({
          target: [
            specialistRecommendationCounters.specialistId,
            specialistRecommendationCounters.fieldKey,
          ],
          set: {
            appearances: sql`${specialistRecommendationCounters.appearances} + 1`,
            lastObservedAt: occurredAt,
          },
        });
    }
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
    // Task #438 — promote actions annotate the appearance counter:
    // stamp `last_promoted_at = now()` and reset `appearances = 0` so the
    // count reads "appearances since last promotion". The row is upserted
    // (not deleted) so the annotation survives a future demote-and-reappear
    // cycle. Ignore actions are intentionally ignored here — they are
    // tracked through the events table aggregate, not the counter.
    if (action === "promote-recommended" || action === "promote-hard") {
      const now = new Date();
      await db
        .insert(specialistRecommendationCounters)
        .values({
          specialistId,
          fieldKey,
          appearances: 0,
          firstObservedAt: now,
          lastObservedAt: now,
          lastPromotedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            specialistRecommendationCounters.specialistId,
            specialistRecommendationCounters.fieldKey,
          ],
          set: {
            appearances: 0,
            lastPromotedAt: now,
          },
        });
    }
    return row;
  }

  /**
   * Promote-vs-ignore counts grouped by `fieldKey` for one Specialist,
   * joined with the Task #438 appearance-counter row so the Required
   * Fields tab can render "appeared 12 times · promoted 0 · ignored 5 —
   * likely noise" at a glance. Counter fields are nullable on the wire
   * because a field that has never been observed (e.g. only ever
   * promote-then-immediately-acted) will not have a counter row.
   */
  async getRecommendationEventStats(
    specialistId: string,
  ): Promise<
    Array<{
      fieldKey: string;
      promoteRecommended: number;
      promoteHard: number;
      ignore: number;
      appearances: number;
      firstObservedAt: string | null;
      lastObservedAt: string | null;
      lastPromotedAt: string | null;
    }>
  > {
    const [eventRows, counterRows] = await Promise.all([
      db
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
        ),
      db
        .select()
        .from(specialistRecommendationCounters)
        .where(eq(specialistRecommendationCounters.specialistId, specialistId)),
    ]);
    const byField = new Map<
      string,
      {
        fieldKey: string;
        promoteRecommended: number;
        promoteHard: number;
        ignore: number;
        appearances: number;
        firstObservedAt: string | null;
        lastObservedAt: string | null;
        lastPromotedAt: string | null;
      }
    >();
    const ensure = (key: string) => {
      let row = byField.get(key);
      if (!row) {
        row = {
          fieldKey: key,
          promoteRecommended: 0,
          promoteHard: 0,
          ignore: 0,
          appearances: 0,
          firstObservedAt: null,
          lastObservedAt: null,
          lastPromotedAt: null,
        };
        byField.set(key, row);
      }
      return row;
    };
    for (const r of eventRows) {
      const existing = ensure(r.fieldKey);
      if (r.action === "promote-recommended") existing.promoteRecommended = r.count;
      else if (r.action === "promote-hard") existing.promoteHard = r.count;
      else if (r.action === "ignore") existing.ignore = r.count;
    }
    for (const c of counterRows) {
      const existing = ensure(c.fieldKey);
      existing.appearances = c.appearances;
      existing.firstObservedAt = c.firstObservedAt
        ? c.firstObservedAt.toISOString()
        : null;
      existing.lastObservedAt = c.lastObservedAt
        ? c.lastObservedAt.toISOString()
        : null;
      existing.lastPromotedAt = c.lastPromotedAt
        ? c.lastPromotedAt.toISOString()
        : null;
    }
    return Array.from(byField.values());
  }

  /**
   * Task #614 — cross-Specialist roll-up of "perennial offender" candidate
   * fields: rows where `appearances >= 3` AND `lastPromotedAt IS NULL`,
   * meaning a Specialist has surfaced the same candidate field at least
   * three runs in a row without any admin ever promoting it. Surfaced on
   * the cross-Specialist Required Fields roll-up so admins can act on the
   * top offenders without visiting every Specialist's Recommendations card
   * one by one.
   *
   * Ordered by `appearances DESC` then `lastObservedAt DESC` so the most
   * persistent and most recent offenders rise to the top. Capped server-
   * side by `limit` (default 20) — the UI is a list, not a table.
   */
  async getTopPerennialRecommendationOffenders(
    limit = 20,
  ): Promise<
    Array<{
      specialistId: string;
      fieldKey: string;
      appearances: number;
      firstObservedAt: string;
      lastObservedAt: string;
    }>
  > {
    const rows = await db
      .select({
        specialistId: specialistRecommendationCounters.specialistId,
        fieldKey: specialistRecommendationCounters.fieldKey,
        appearances: specialistRecommendationCounters.appearances,
        firstObservedAt: specialistRecommendationCounters.firstObservedAt,
        lastObservedAt: specialistRecommendationCounters.lastObservedAt,
      })
      .from(specialistRecommendationCounters)
      .where(
        and(
          gte(specialistRecommendationCounters.appearances, 3),
          isNull(specialistRecommendationCounters.lastPromotedAt),
        ),
      )
      .orderBy(
        desc(specialistRecommendationCounters.appearances),
        desc(specialistRecommendationCounters.lastObservedAt),
      )
      .limit(limit);
    return rows.map((r) => ({
      specialistId: r.specialistId,
      fieldKey: r.fieldKey,
      appearances: r.appearances,
      firstObservedAt: r.firstObservedAt.toISOString(),
      lastObservedAt: r.lastObservedAt.toISOString(),
    }));
  }

  async listSpecialistConfigVersions(
    specialistId: string,
    limit = 50,
  ): Promise<(SpecialistConfigVersionRow & { changedByUserName: string | null })[]> {
    const rows = await db
      .select({
        v: specialistConfigVersions,
        u: {
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        },
      })
      .from(specialistConfigVersions)
      .leftJoin(users, eq(specialistConfigVersions.changedByUserId, users.id))
      .where(eq(specialistConfigVersions.specialistId, specialistId))
      .orderBy(desc(specialistConfigVersions.changedAt))
      .limit(limit);

    return rows.map(({ v, u }) => {
      const name = u?.firstName
        ? `${u.firstName}${u.lastName ? ` ${u.lastName}` : ""}`.trim()
        : (u?.email ?? null);
      return { ...v, changedByUserName: name };
    });
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
        analystAModelResourceId: current.analystAModelResourceId,
        analystBModelResourceId: current.analystBModelResourceId,
        synthesisModelResourceId: current.synthesisModelResourceId,
        fallbackModelResourceId: current.fallbackModelResourceId,
        multiModelEnabled: current.multiModelEnabled,
        workflowOverrides: current.workflowOverrides,
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
      if (patch.analystAModelResourceId !== undefined) next.analystAModelResourceId = patch.analystAModelResourceId;
      if (patch.analystBModelResourceId !== undefined) next.analystBModelResourceId = patch.analystBModelResourceId;
      if (patch.synthesisModelResourceId !== undefined) next.synthesisModelResourceId = patch.synthesisModelResourceId;
      if (patch.fallbackModelResourceId !== undefined) next.fallbackModelResourceId = patch.fallbackModelResourceId;
      if (patch.multiModelEnabled !== undefined) next.multiModelEnabled = patch.multiModelEnabled;
      if (patch.workflowOverrides !== undefined) next.workflowOverrides = patch.workflowOverrides;
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
