/**
 * Resource probe history (P3) — recordProbeResult, history reads, and
 * stale-aware live status derivation.
 *
 * recordProbeResult writes the probe row AND updates the parent's
 * denormalized lastHealthStatus + lastCheckedAt in the same transaction,
 * so the parent never disagrees with the latest history row. Read paths
 * still re-derive freshness via `deriveHealthStatus` so a row that was
 * green at write time is correctly amber once the per-kind TTL elapses.
 */
import { db } from "../../db";
import { and, desc, eq, gte } from "drizzle-orm";
import {
  adminResources,
  resourceHealthChecks,
  type AdminResourceRow,
  type ProbeStatus,
  type ResourceHealthCheckRow,
  type ResourceKind,
  type ResourceHealthStatus,
  PROBE_PROFILES,
  deriveHealthStatus,
} from "@shared/schema";

export class AdminResourceHealthChecksStorage {
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
