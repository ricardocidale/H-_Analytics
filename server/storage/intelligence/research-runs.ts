import {
  researchRuns, relaxationTraces, coverageSnapshots,
  type ResearchRun, type InsertResearchRun,
  type RelaxationTrace, type InsertRelaxationTrace,
  type CoverageSnapshot, type InsertCoverageSnapshot,
} from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import type { IntelligenceTx } from "./tx";

/**
 * ResearchRunsStorage — research_runs table plus its tightly-coupled
 * children (relaxation_traces, coverage_snapshots).
 *
 * Every query goes through `this._rtx.db`, so the same instance
 * participates in either the root executor or an active transaction
 * depending on the IntelligenceTx it was constructed with.
 */
export class ResearchRunsStorage {
  private readonly _rtx: IntelligenceTx;
  constructor(tx: IntelligenceTx) { this._rtx = tx; }

  async createResearchRun(data: InsertResearchRun): Promise<ResearchRun> {
    const [run] = await this._rtx.db.insert(researchRuns)
      .values(data as typeof researchRuns.$inferInsert)
      .returning();
    return run;
  }

  /**
   * Direct lookup by primary key. Used by the Constants doctrine guard on
   * POST /api/admin/model-constants/:key/apply-research (Task #388) to
   * verify a client-supplied `researchRunId` against the persisted row
   * regardless of how old the run is. The handler applies its own
   * constant-key + locality scoping check on the returned metadata so a
   * cross-row replay still fails closed; this method is intentionally
   * unbounded and unscoped so an admin who applies a months-old run that
   * matches the locality is not silently 404-ed by a stale row falling
   * outside a list-window.
   */
  async getResearchRunById(id: number): Promise<ResearchRun | undefined> {
    const [row] = await this._rtx.db.select().from(researchRuns)
      .where(eq(researchRuns.id, id))
      .limit(1);
    return row;
  }

  async updateResearchRun(id: number, updates: Partial<ResearchRun>): Promise<ResearchRun | undefined> {
    const [updated] = await this._rtx.db.update(researchRuns)
      .set(updates)
      .where(eq(researchRuns.id, id))
      .returning();
    return updated;
  }

  async getResearchRuns(entityType: string, entityId: number): Promise<ResearchRun[]> {
    return this._rtx.db.select().from(researchRuns)
      .where(and(eq(researchRuns.entityType, entityType), eq(researchRuns.entityId, entityId)))
      .orderBy(desc(researchRuns.startedAt));
  }

  /**
   * Constants doctrine — list recent `research_runs` rows produced by the
   * Constants regeneration pipeline for a specific (key, country, subdivision)
   * triple. Powers the per-row "History" affordance on the Constants admin
   * tab so admins can audit the chain of analyst proposals for a constant
   * without trawling through global research-run logs.
   *
   * Filter keys (`metadata.constant.{key,country,subdivision}`) are written
   * by `proposeConstantRegeneration` in `server/ai/regenerate-constants.ts`
   * — keep those two call sites in sync if either changes.
   */
  async getResearchRunsForConstant(
    constantKey: string,
    country: string | null,
    subdivision: string | null,
    limit = 10,
  ): Promise<ResearchRun[]> {
    const conditions = [
      eq(researchRuns.entityType, "model-constant"),
      sql`${researchRuns.metadata}->'constant'->>'key' = ${constantKey}`,
      country === null
        ? sql`${researchRuns.metadata}->'constant'->>'country' IS NULL`
        : sql`${researchRuns.metadata}->'constant'->>'country' = ${country}`,
      subdivision === null
        ? sql`${researchRuns.metadata}->'constant'->>'subdivision' IS NULL`
        : sql`${researchRuns.metadata}->'constant'->>'subdivision' = ${subdivision}`,
    ];
    return this._rtx.db.select().from(researchRuns)
      .where(and(...conditions))
      .orderBy(desc(researchRuns.startedAt))
      .limit(limit);
  }

  /**
   * Latest *successfully completed* research_run for a Constants locality.
   * Used by the Constants-refresh scheduler and the admin Constants tab to
   * compute "last refreshed" / staleness without letting failed attempts
   * advance the freshness window. See server/jobs/specialist-constants-
   * refresh.ts and the route in server/routes/admin/model-constants.ts.
   */
  async getLatestSuccessfulRunForConstant(
    constantKey: string,
    country: string | null,
    subdivision: string | null,
  ): Promise<ResearchRun | undefined> {
    const conditions = [
      eq(researchRuns.entityType, "model-constant"),
      eq(researchRuns.status, "completed"),
      sql`${researchRuns.metadata}->'constant'->>'key' = ${constantKey}`,
      country === null
        ? sql`${researchRuns.metadata}->'constant'->>'country' IS NULL`
        : sql`${researchRuns.metadata}->'constant'->>'country' = ${country}`,
      subdivision === null
        ? sql`${researchRuns.metadata}->'constant'->>'subdivision' IS NULL`
        : sql`${researchRuns.metadata}->'constant'->>'subdivision' = ${subdivision}`,
    ];
    const [row] = await this._rtx.db.select().from(researchRuns)
      .where(and(...conditions))
      .orderBy(desc(researchRuns.completedAt))
      .limit(1);
    return row;
  }

  /**
   * List failed scheduled Constants refreshes whose `completedAt` is at or
   * after `since`. Filters by the marker (`metadata.scheduledRefresh = true`)
   * that `server/jobs/specialist-constants-refresh.ts` writes when it
   * persists a failure row, so manual one-off refresh failures are excluded.
   *
   * Used by:
   *   - the daily digest evaluator (server/notifications/constants-refresh-
   *     failure-digest.ts) to email admins,
   *   - the admin Constants tab banner endpoint to surface failures since
   *     the admin's last visit.
   */
  async getFailedScheduledConstantsRefreshes(since: Date, limit = 200): Promise<ResearchRun[]> {
    return this._rtx.db.select().from(researchRuns)
      .where(and(
        eq(researchRuns.entityType, "model-constant"),
        eq(researchRuns.status, "failed"),
        sql`${researchRuns.metadata}->>'scheduledRefresh' = 'true'`,
        sql`${researchRuns.completedAt} IS NOT NULL`,
        sql`${researchRuns.completedAt} >= ${since.toISOString()}`,
      ))
      .orderBy(desc(researchRuns.completedAt))
      .limit(limit);
  }

  /**
   * List recent `research_runs` rows attributed to a Specialist via
   * `metadata.specialistId`. Powers the per-Specialist call log surfaces
   * (e.g. Photos & Renders specialist page) so admins can see every render
   * job that flowed through the specialist regardless of where it was
   * triggered (album button or specialist page).
   *
   * Pagination: `offset` is supported alongside `limit` so the Photos &
   * Renders gallery can pull a server-backed history page-by-page rather
   * than holding the whole stream in memory. Callers that don't paginate
   * (existing per-property album call log) can omit `offset` and keep the
   * legacy "first N rows" semantics.
   */
  async getResearchRunsForSpecialist(specialistId: string, limit = 50, offset = 0): Promise<ResearchRun[]> {
    return this._rtx.db.select().from(researchRuns)
      .where(sql`${researchRuns.metadata}->>'specialistId' = ${specialistId}`)
      .orderBy(desc(researchRuns.startedAt))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Total count of `research_runs` rows for a Specialist. Companion to
   * getResearchRunsForSpecialist for pagination — the Photos & Renders
   * gallery shows "showing N of M" and a "Load more" button without
   * over-fetching.
   */
  async countResearchRunsForSpecialist(specialistId: string): Promise<number> {
    const [row] = await this._rtx.db.select({ count: sql<number>`count(*)::int` })
      .from(researchRuns)
      .where(sql`${researchRuns.metadata}->>'specialistId' = ${specialistId}`);
    return Number(row?.count ?? 0);
  }

  async getRunningResearchEntityIds(entityType: string): Promise<number[]> {
    const rows = await this._rtx.db.execute(sql`
      SELECT DISTINCT entity_id AS "entityId"
      FROM research_runs
      WHERE entity_type = ${entityType} AND status = 'running'
    `);
    return ((rows.rows ?? []) as { entityId: number }[]).map(r => Number(r.entityId));
  }

  async getLatestCompletedRunsPerEntity(entityType: string): Promise<{ entityId: number; completedAt: Date; durationMs: number | null }[]> {
    const rows = await this._rtx.db.execute(sql`
      SELECT DISTINCT ON (entity_id)
        entity_id AS "entityId",
        completed_at AS "completedAt",
        duration_ms AS "durationMs"
      FROM research_runs
      WHERE entity_type = ${entityType}
        AND status = 'completed'
        AND completed_at IS NOT NULL
      ORDER BY entity_id, completed_at DESC
    `);
    return (rows.rows ?? []) as { entityId: number; completedAt: Date; durationMs: number | null }[];
  }

  async createRelaxationTrace(data: InsertRelaxationTrace): Promise<RelaxationTrace> {
    const [trace] = await this._rtx.db.insert(relaxationTraces)
      .values(data as typeof relaxationTraces.$inferInsert)
      .returning();
    return trace;
  }

  async getRelaxationTraces(researchRunId: number): Promise<RelaxationTrace[]> {
    return this._rtx.db.select().from(relaxationTraces)
      .where(eq(relaxationTraces.researchRunId, researchRunId))
      .orderBy(relaxationTraces.level);
  }

  async createCoverageSnapshot(data: InsertCoverageSnapshot): Promise<CoverageSnapshot> {
    const [snap] = await this._rtx.db.insert(coverageSnapshots)
      .values(data as typeof coverageSnapshots.$inferInsert)
      .returning();
    return snap;
  }

  async getCoverageSnapshots(entityType: string, entityId: number): Promise<CoverageSnapshot[]> {
    return this._rtx.db.select().from(coverageSnapshots)
      .where(and(eq(coverageSnapshots.entityType, entityType), eq(coverageSnapshots.entityId, entityId)))
      .orderBy(desc(coverageSnapshots.snapshotDate));
  }
}
