import {
  researchRuns, relaxationTraces, coverageSnapshots,
  type ResearchRun, type InsertResearchRun,
  type RelaxationTrace, type InsertRelaxationTrace,
  type CoverageSnapshot, type InsertCoverageSnapshot,
} from "@workspace/db";
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
   * Batch variant of `getLatestSuccessfulRunForConstant` — fetches the most
   * recent completed run for **every** registered constant key in a single
   * `DISTINCT ON` query, eliminating the N+1 that was firing once per key on
   * `GET /api/admin/model-constants` (Sentry #7471411947).
   *
   * Returns a `Map` keyed by `"<constantKey>|<country>|<subdivision>"` (empty
   * string for NULL segments) so the route handler can do O(1) lookups for
   * each key's effective locality triple.
   *
   * The WHERE clause covers all three locality tiers that a single request
   * can resolve to:
   *   • universal  — country IS NULL, subdivision IS NULL
   *   • country    — country = $country, subdivision IS NULL
   *   • full       — country = $country, subdivision = $subdivision
   *
   * When `country` is NULL the country/full tiers match nothing (the
   * equality predicates are replaced with IS NULL which overlaps the
   * universal clause — harmless dedup via DISTINCT ON).
   */
  async getLatestSuccessfulRunsForAllConstants(
    country: string | null,
    subdivision: string | null,
  ): Promise<Map<string, ResearchRun>> {
    const countryFilter = country === null
      ? sql`metadata->'constant'->>'country' IS NULL`
      : sql`metadata->'constant'->>'country' = ${country}`;
    const subdivisionFilter = subdivision === null
      ? sql`metadata->'constant'->>'subdivision' IS NULL`
      : sql`metadata->'constant'->>'subdivision' = ${subdivision}`;

    const result = await this._rtx.db.execute<{
      id: number;
      user_id: number | null;
      entity_type: string;
      entity_id: number;
      scenario_id: number | null;
      tier: number;
      status: string;
      started_at: Date;
      completed_at: Date | null;
      duration_ms: number | null;
      model_primary: string | null;
      model_secondary: string | null;
      model_synthesis: string | null;
      tokens_used: number | null;
      estimated_cost: number | null;
      error: string | null;
      metadata: Record<string, unknown> | null;
      cache_key: string | null;
      cache_inputs_hash: string | null;
    }>(sql`
      SELECT DISTINCT ON (
        metadata->'constant'->>'key',
        metadata->'constant'->>'country',
        metadata->'constant'->>'subdivision'
      )
        id,
        user_id,
        entity_type,
        entity_id,
        scenario_id,
        tier,
        status,
        started_at,
        completed_at,
        duration_ms,
        model_primary,
        model_secondary,
        model_synthesis,
        tokens_used,
        estimated_cost,
        error,
        metadata,
        cache_key,
        cache_inputs_hash
      FROM research_runs
      WHERE entity_type = 'model-constant'
        AND status = 'completed'
        AND completed_at IS NOT NULL
        AND (
          (metadata->'constant'->>'country' IS NULL AND metadata->'constant'->>'subdivision' IS NULL)
          OR (${countryFilter} AND metadata->'constant'->>'subdivision' IS NULL)
          OR (${countryFilter} AND ${subdivisionFilter})
        )
      ORDER BY
        metadata->'constant'->>'key',
        metadata->'constant'->>'country',
        metadata->'constant'->>'subdivision',
        completed_at DESC
    `);

    const map = new Map<string, ResearchRun>();
    for (const raw of result.rows) {
      const meta = (raw.metadata ?? {}) as { constant?: { key?: string; country?: string | null; subdivision?: string | null } };
      const k = meta.constant?.key;
      if (!k) continue;
      const c = meta.constant?.country ?? null;
      const s = meta.constant?.subdivision ?? null;
      const mapKey = `${k}|${c ?? ""}|${s ?? ""}`;
      map.set(mapKey, {
        id: raw.id,
        userId: raw.user_id,
        entityType: raw.entity_type,
        entityId: raw.entity_id,
        scenarioId: raw.scenario_id,
        tier: raw.tier,
        status: raw.status,
        startedAt: raw.started_at,
        completedAt: raw.completed_at,
        durationMs: raw.duration_ms,
        modelPrimary: raw.model_primary,
        modelSecondary: raw.model_secondary,
        modelSynthesis: raw.model_synthesis,
        tokensUsed: raw.tokens_used,
        estimatedCost: raw.estimated_cost,
        error: raw.error,
        metadata: raw.metadata,
        cacheKey: raw.cache_key,
        cacheInputsHash: raw.cache_inputs_hash,
      });
    }
    return map;
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
   * Pagination: `options.offset` is supported alongside `limit` so the
   * Photos & Renders gallery can pull a server-backed history page-by-page
   * rather than holding the whole stream in memory. Callers that don't
   * paginate can omit it and keep the legacy "first N rows" semantics.
   *
   * Pass `options.propertyId` to additionally scope the result to a single
   * property — used by the per-property album "Render history" section so
   * admins can see "what AI runs were tried for this property" without
   * leaving the property page (Task #439). The filter matches both the
   * indexed `entity_type/entity_id` columns (the album path) and the
   * `metadata.propertyId` JSON field (defensive — covers any older rows
   * the pipeline wrote before entity_type was switched to "property").
   *
   * The third argument also accepts a bare number for back-compat with the
   * gallery callsite that passes `offset` positionally.
   */
  async getResearchRunsForSpecialist(
    specialistId: string,
    limit = 50,
    options?: number | { offset?: number; propertyId?: number },
  ): Promise<ResearchRun[]> {
    const offset = typeof options === "number"
      ? options
      : (options?.offset ?? 0);
    const propertyId = typeof options === "object" && options !== null
      ? options.propertyId
      : undefined;
    const conditions = [sql`${researchRuns.metadata}->>'specialistId' = ${specialistId}`];
    if (propertyId !== undefined) {
      conditions.push(sql`(
        (${researchRuns.entityType} = 'property' AND ${researchRuns.entityId} = ${propertyId})
        OR (${researchRuns.metadata}->>'propertyId' = ${String(propertyId)})
      )`);
    }
    return this._rtx.db.select().from(researchRuns)
      .where(and(...conditions))
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

  /**
   * Count `research_runs` rows currently in `status='running'` for one
   * Specialist. Used by the per-Specialist concurrency gate (Task #501)
   * on `POST /api/research/generate` and `runAnalystScoped` to enforce
   * `SpecialistWorkflowOverrides.maxConcurrentRuns`.
   *
   * Lookup matches the persisted-metadata pattern used by
   * `getResearchRunsForSpecialist` / `countResearchRunsForSpecialist`
   * (`metadata->>'specialistId'`); the call sites that create the early-
   * run row are responsible for writing `specialistId` into metadata.
   */
  async countRunningResearchRunsForSpecialist(specialistId: string): Promise<number> {
    const [row] = await this._rtx.db.select({ count: sql<number>`count(*)::int` })
      .from(researchRuns)
      .where(and(
        sql`${researchRuns.metadata}->>'specialistId' = ${specialistId}`,
        eq(researchRuns.status, "running"),
      ));
    return Number(row?.count ?? 0);
  }

  /**
   * Sum `tokens_used` across `research_runs` rows for one Specialist
   * since the given timestamp. Used by the per-Specialist token-budget
   * gate (Task #501) to enforce `SpecialistWorkflowOverrides
   * .dailyTokenBudget` / `.monthlyTokenBudget` against actual recent
   * spend before dispatching a new run.
   *
   * Counts every run regardless of status: a failed run that consumed
   * tokens still counts against the budget (the LLM call already cost
   * money).  Rows with NULL `tokens_used` (e.g. an in-flight `running`
   * row that has not finalized yet) contribute 0 — they get counted as
   * soon as the finalize step writes the token estimate.
   */
  async sumTokensUsedForSpecialistSince(
    specialistId: string,
    since: Date,
  ): Promise<number> {
    const [row] = await this._rtx.db.select({
      total: sql<number>`coalesce(sum(${researchRuns.tokensUsed}), 0)::int`,
    })
      .from(researchRuns)
      .where(and(
        sql`${researchRuns.metadata}->>'specialistId' = ${specialistId}`,
        sql`${researchRuns.startedAt} >= ${since.toISOString()}`,
      ));
    return Number(row?.total ?? 0);
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

  /**
   * Hard-delete a single research_run row by primary key.
   * Cascades to relaxation_traces and coverage_snapshots via FK constraints.
   * Exposed to agent tools so failed / orphaned run records can be cleaned up
   * without requiring a direct DB operation.
   */
  async deleteResearchRun(id: number): Promise<void> {
    await this._rtx.db.delete(researchRuns).where(eq(researchRuns.id, id));
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
