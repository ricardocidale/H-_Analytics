/**
 * AdminResourceStorage — persistence for the canonical Resources control plane.
 *
 * Spec: docs/architecture/resources-control-plane.md
 * Tables: admin_resources, admin_resource_versions,
 *         audit_break_glass_overrides, specialist_assignments
 *
 * All edits are versioned: `update` writes the prior state to
 * admin_resource_versions and bumps the row's version. `rollback` re-applies
 * a past version as a NEW version (history is append-only). Secrets are kept
 * in `secret_ref` and never serialized into version snapshots' config jsonb;
 * `secret_ref` is itself a key-name (not a value) so storing it is safe.
 */
import { db } from "../db";
import { and, desc, eq, gte } from "drizzle-orm";
import {
  adminResources,
  adminResourceVersions,
  auditBreakGlassOverrides,
  resourceHealthChecks,
  specialistAssignments,
  type AdminResourceRow,
  type AdminResourceVersionRow,
  type BreakGlassOverrideRow,
  type ResourceHealthCheckRow,
  type SpecialistAssignmentRow,
  type InsertAdminResource,
  type InsertBreakGlassOverride,
  type ProbeStatus,
  type ResourceKind,
  PROBE_PROFILES,
  deriveHealthStatus,
  type ResourceHealthStatus,
} from "@shared/schema";

export interface ResourceImpactEntry {
  specialistId: string;
  assignmentKind: string;
  assignmentSlug: string;
  assignmentRole: string | null;
  required: boolean;
}

export interface UpdateAdminResourcePatch {
  displayName?: string;
  description?: string | null;
  config?: Record<string, unknown>;
  secretRef?: string | null;
  changeSummary?: string;
}

export interface CatalogSyncDeclaration {
  specialistId: string;
  assignmentKind: ResourceKind;
  assignmentSlug: string;
  assignmentRole?: string | null;
  required: boolean;
}

export interface CatalogSyncResult {
  inserted: number;
  updated: number;
  removed: number;
  unresolvedSlugs: number;
}

export class AdminResourceStorage {
  // ── CRUD ──────────────────────────────────────────────────────────

  async listAdminResources(kind?: ResourceKind): Promise<AdminResourceRow[]> {
    if (kind) {
      return db.select().from(adminResources).where(eq(adminResources.kind, kind)).orderBy(adminResources.slug);
    }
    return db.select().from(adminResources).orderBy(adminResources.kind, adminResources.slug);
  }

  async getAdminResourceById(id: number): Promise<AdminResourceRow | undefined> {
    const [row] = await db.select().from(adminResources).where(eq(adminResources.id, id));
    return row || undefined;
  }

  async getAdminResourceBySlug(kind: ResourceKind, slug: string): Promise<AdminResourceRow | undefined> {
    const [row] = await db
      .select()
      .from(adminResources)
      .where(and(eq(adminResources.kind, kind), eq(adminResources.slug, slug)));
    return row || undefined;
  }

  async createAdminResource(
    data: InsertAdminResource,
    actorUserId: number,
  ): Promise<AdminResourceRow> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(adminResources)
        .values({
          kind: data.kind,
          slug: data.slug,
          displayName: data.displayName,
          description: data.description ?? null,
          config: data.config ?? {},
          secretRef: data.secretRef ?? null,
          createdByUserId: actorUserId,
          updatedByUserId: actorUserId,
        })
        .returning();
      await tx.insert(adminResourceVersions).values({
        resourceId: row.id,
        version: row.version,
        displayName: row.displayName,
        description: row.description,
        config: row.config ?? {},
        secretRef: row.secretRef,
        changeSummary: "created",
        changedByUserId: actorUserId,
      });
      return row;
    });
  }

  async updateAdminResource(
    id: number,
    patch: UpdateAdminResourcePatch,
    actorUserId: number,
  ): Promise<AdminResourceRow | undefined> {
    return db.transaction(async (tx) => {
      const [current] = await tx.select().from(adminResources).where(eq(adminResources.id, id));
      if (!current) return undefined;

      const nextVersion = current.version + 1;
      const updates: Partial<typeof adminResources.$inferInsert> = {
        version: nextVersion,
        updatedAt: new Date(),
        updatedByUserId: actorUserId,
      };
      if (patch.displayName !== undefined) updates.displayName = patch.displayName;
      if (patch.description !== undefined) updates.description = patch.description;
      if (patch.config !== undefined) updates.config = patch.config;
      if (patch.secretRef !== undefined) updates.secretRef = patch.secretRef;

      const [row] = await tx
        .update(adminResources)
        .set(updates)
        .where(eq(adminResources.id, id))
        .returning();

      await tx.insert(adminResourceVersions).values({
        resourceId: row.id,
        version: row.version,
        displayName: row.displayName,
        description: row.description,
        config: row.config ?? {},
        secretRef: row.secretRef,
        changeSummary: patch.changeSummary ?? "updated",
        changedByUserId: actorUserId,
      });
      return row;
    });
  }

  async deleteAdminResource(id: number): Promise<boolean> {
    const result = await db.delete(adminResources).where(eq(adminResources.id, id)).returning({ id: adminResources.id });
    return result.length > 0;
  }

  // ── Versioning ────────────────────────────────────────────────────

  async listAdminResourceVersions(resourceId: number): Promise<AdminResourceVersionRow[]> {
    return db
      .select()
      .from(adminResourceVersions)
      .where(eq(adminResourceVersions.resourceId, resourceId))
      .orderBy(desc(adminResourceVersions.version));
  }

  async rollbackAdminResource(
    id: number,
    targetVersion: number,
    actorUserId: number,
  ): Promise<AdminResourceRow | undefined> {
    return db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(adminResourceVersions)
        .where(and(eq(adminResourceVersions.resourceId, id), eq(adminResourceVersions.version, targetVersion)));
      if (!target) return undefined;

      const [current] = await tx.select().from(adminResources).where(eq(adminResources.id, id));
      if (!current) return undefined;

      const nextVersion = current.version + 1;
      const [row] = await tx
        .update(adminResources)
        .set({
          version: nextVersion,
          displayName: target.displayName,
          description: target.description,
          config: target.config ?? {},
          secretRef: target.secretRef,
          updatedAt: new Date(),
          updatedByUserId: actorUserId,
        })
        .where(eq(adminResources.id, id))
        .returning();

      await tx.insert(adminResourceVersions).values({
        resourceId: row.id,
        version: row.version,
        displayName: row.displayName,
        description: row.description,
        config: row.config ?? {},
        secretRef: row.secretRef,
        changeSummary: `rollback to v${targetVersion}`,
        changedByUserId: actorUserId,
      });
      return row;
    });
  }

  // ── Impact (which Specialists wire to a resource) ─────────────────

  async listResourceImpact(resourceId: number): Promise<ResourceImpactEntry[]> {
    const rows = await db
      .select()
      .from(specialistAssignments)
      .where(eq(specialistAssignments.resourceId, resourceId));
    return rows.map((r) => ({
      specialistId: r.specialistId,
      assignmentKind: r.assignmentKind,
      assignmentSlug: r.assignmentSlug,
      assignmentRole: r.assignmentRole,
      required: r.required,
    }));
  }

  async listSpecialistAssignments(specialistId?: string): Promise<SpecialistAssignmentRow[]> {
    if (specialistId) {
      return db
        .select()
        .from(specialistAssignments)
        .where(eq(specialistAssignments.specialistId, specialistId))
        .orderBy(specialistAssignments.assignmentKind, specialistAssignments.assignmentSlug);
    }
    return db
      .select()
      .from(specialistAssignments)
      .orderBy(specialistAssignments.specialistId, specialistAssignments.assignmentKind);
  }

  // ── Catalog → DB materialization (idempotent) ─────────────────────

  async syncSpecialistCatalog(
    declarations: CatalogSyncDeclaration[],
  ): Promise<CatalogSyncResult> {
    return db.transaction(async (tx) => {
      const existing = await tx.select().from(specialistAssignments);
      const existingByKey = new Map<string, SpecialistAssignmentRow>();
      for (const row of existing) {
        existingByKey.set(declKey(row.specialistId, row.assignmentKind, row.assignmentSlug, row.assignmentRole), row);
      }

      // Resolve slugs to resource ids in one pass per (kind, slug) pair.
      const resourceLookupCache = new Map<string, number | null>();
      const resolveResourceId = async (kind: string, slug: string): Promise<number | null> => {
        const cacheKey = `${kind}:${slug}`;
        if (resourceLookupCache.has(cacheKey)) return resourceLookupCache.get(cacheKey)!;
        const [r] = await tx
          .select({ id: adminResources.id })
          .from(adminResources)
          .where(and(eq(adminResources.kind, kind), eq(adminResources.slug, slug)));
        const id = r?.id ?? null;
        resourceLookupCache.set(cacheKey, id);
        return id;
      };

      const wantKeys = new Set<string>();
      let inserted = 0;
      let updated = 0;
      let unresolvedSlugs = 0;

      for (const decl of declarations) {
        const role = decl.assignmentRole ?? null;
        const key = declKey(decl.specialistId, decl.assignmentKind, decl.assignmentSlug, role);
        wantKeys.add(key);

        const resourceId = await resolveResourceId(decl.assignmentKind, decl.assignmentSlug);
        if (resourceId === null) unresolvedSlugs++;

        const prev = existingByKey.get(key);
        if (!prev) {
          await tx.insert(specialistAssignments).values({
            specialistId: decl.specialistId,
            assignmentKind: decl.assignmentKind,
            assignmentSlug: decl.assignmentSlug,
            assignmentRole: role,
            required: decl.required,
            resourceId,
          });
          inserted++;
        } else if (
          prev.required !== decl.required ||
          prev.resourceId !== resourceId
        ) {
          await tx
            .update(specialistAssignments)
            .set({ required: decl.required, resourceId, materializedAt: new Date() })
            .where(eq(specialistAssignments.id, prev.id));
          updated++;
        }
      }

      // Remove rows the catalog no longer declares.
      let removed = 0;
      for (const entry of Array.from(existingByKey.entries())) {
        const [key, row] = entry;
        if (!wantKeys.has(key)) {
          await tx.delete(specialistAssignments).where(eq(specialistAssignments.id, row.id));
          removed++;
        }
      }

      return { inserted, updated, removed, unresolvedSlugs };
    });
  }

  // ── Break-glass overrides (super-admin only at the route layer) ───

  async listBreakGlassOverrides(specialistId?: string): Promise<BreakGlassOverrideRow[]> {
    if (specialistId) {
      return db
        .select()
        .from(auditBreakGlassOverrides)
        .where(eq(auditBreakGlassOverrides.specialistId, specialistId))
        .orderBy(desc(auditBreakGlassOverrides.createdAt));
    }
    return db
      .select()
      .from(auditBreakGlassOverrides)
      .orderBy(desc(auditBreakGlassOverrides.createdAt));
  }

  async createBreakGlassOverride(
    data: InsertBreakGlassOverride,
  ): Promise<BreakGlassOverrideRow> {
    const [row] = await db
      .insert(auditBreakGlassOverrides)
      .values({
        specialistId: data.specialistId,
        assignmentKind: data.assignmentKind,
        assignmentSlug: data.assignmentSlug,
        assignmentRole: data.assignmentRole ?? null,
        overrideResourceId: data.overrideResourceId ?? null,
        reason: data.reason,
        expiresAt: data.expiresAt,
        createdByUserId: data.createdByUserId,
      })
      .returning();
    return row;
  }

  async revokeBreakGlassOverride(id: number, actorUserId: number): Promise<BreakGlassOverrideRow | undefined> {
    const [row] = await db
      .update(auditBreakGlassOverrides)
      .set({ revokedAt: new Date(), revokedByUserId: actorUserId })
      .where(eq(auditBreakGlassOverrides.id, id))
      .returning();
    return row || undefined;
  }

  // ── Health checks (P3) ─────────────────────────────────────────────

  /**
   * Persist a probe outcome and update the parent row's denormalized
   * lastHealthStatus / lastCheckedAt for fast list-view queries. Both writes
   * happen in a single transaction so the parent never disagrees with the
   * latest history row. The denormalized status is the *raw* probe status
   * (ok/fail/skipped → green/red/amber) at write time; freshness is recomputed
   * on every read via `deriveHealthStatus` so a row that was green at 10:00
   * is correctly amber at 10:05 when its 60s TTL has elapsed.
   */
  async recordProbeResult(
    resourceId: number,
    kind: ResourceKind,
    outcome: { status: ProbeStatus; latencyMs: number; errorCode?: string; errorMessage?: string },
    triggeredByUserId: number | null,
  ): Promise<ResourceHealthCheckRow> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(resourceHealthChecks)
        .values({
          resourceId,
          kind,
          status: outcome.status,
          latencyMs: outcome.latencyMs,
          errorCode: outcome.errorCode ?? null,
          errorMessage: outcome.errorMessage ?? null,
          triggeredByUserId,
        })
        .returning();
      // Map raw status → status-band stored on the parent row at write time.
      // Read paths must still re-derive freshness via deriveHealthStatus.
      const writeStatus: ResourceHealthStatus =
        outcome.status === "ok" ? "green" : outcome.status === "fail" ? "red" : "amber";
      await tx
        .update(adminResources)
        .set({ lastHealthStatus: writeStatus, lastCheckedAt: row.checkedAt })
        .where(eq(adminResources.id, resourceId));
      return row;
    });
  }

  async getLatestHealthCheck(resourceId: number): Promise<ResourceHealthCheckRow | undefined> {
    const [row] = await db
      .select()
      .from(resourceHealthChecks)
      .where(eq(resourceHealthChecks.resourceId, resourceId))
      .orderBy(desc(resourceHealthChecks.checkedAt))
      .limit(1);
    return row || undefined;
  }

  async listHealthChecksForResource(resourceId: number, limit = 50): Promise<ResourceHealthCheckRow[]> {
    return db
      .select()
      .from(resourceHealthChecks)
      .where(eq(resourceHealthChecks.resourceId, resourceId))
      .orderBy(desc(resourceHealthChecks.checkedAt))
      .limit(limit);
  }

  /**
   * Stale-aware live status: never returns green if the last successful check
   * is past the per-kind TTL, regardless of what the parent row says.
   */
  async getResourceHealthView(resourceId: number, now: Date = new Date()): Promise<{
    status: ResourceHealthStatus;
    lastChecked: Date | null;
    lastStatus: ProbeStatus | null;
    latencyMs: number | null;
    errorCode: string | null;
    errorMessage: string | null;
    ttlSeconds: number;
  } | undefined> {
    const [parent] = await db.select().from(adminResources).where(eq(adminResources.id, resourceId));
    if (!parent) return undefined;
    const latest = await this.getLatestHealthCheck(resourceId);
    const ttlSeconds = PROBE_PROFILES[parent.kind as ResourceKind]?.ttlSeconds ?? 3600;
    const status = deriveHealthStatus({
      lastStatus: (latest?.status as ProbeStatus | undefined) ?? null,
      lastCheckedAt: latest?.checkedAt ?? null,
      kind: parent.kind as ResourceKind,
      now,
    });
    return {
      status,
      lastChecked: latest?.checkedAt ?? null,
      lastStatus: (latest?.status as ProbeStatus | undefined) ?? null,
      latencyMs: latest?.latencyMs ?? null,
      errorCode: latest?.errorCode ?? null,
      errorMessage: latest?.errorMessage ?? null,
      ttlSeconds,
    };
  }

  /**
   * Walk admin_resources and return rows whose last_checked_at is past their
   * per-kind TTL (or null). Used by the background scheduler.
   */
  async listResourcesDueForHealthCheck(
    profiles: typeof PROBE_PROFILES,
  ): Promise<AdminResourceRow[]> {
    const all = await db.select().from(adminResources);
    const now = Date.now();
    return all.filter((r) => {
      const ttlMs = (profiles[r.kind as ResourceKind]?.ttlSeconds ?? 3600) * 1000;
      if (!r.lastCheckedAt) return true;
      return now - r.lastCheckedAt.getTime() >= ttlMs;
    });
  }

  /**
   * Per-(actor, resource) Test-button rate limit. Returns true if the actor
   * has already exceeded the resource's per-minute probe budget. The check
   * only counts user-triggered probes — scheduler probes have null actor.
   */
  async isAdminTestRateLimited(resourceId: number, actorUserId: number, kind: ResourceKind, now: Date = new Date()): Promise<boolean> {
    const limit = PROBE_PROFILES[kind]?.rateLimitPerMinute ?? 6;
    const since = new Date(now.getTime() - 60_000);
    const rows = await db
      .select({ id: resourceHealthChecks.id })
      .from(resourceHealthChecks)
      .where(
        and(
          eq(resourceHealthChecks.resourceId, resourceId),
          eq(resourceHealthChecks.triggeredByUserId, actorUserId),
          gte(resourceHealthChecks.checkedAt, since),
        ),
      );
    return rows.length >= limit;
  }
}

function declKey(specialistId: string, kind: string, slug: string, role: string | null): string {
  return `${specialistId}|${kind}|${slug}|${role ?? ""}`;
}
