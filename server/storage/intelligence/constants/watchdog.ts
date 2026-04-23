import {
  analystCooldowns,
  analystWatchdogBenchmarks,
  capitalRaiseBenchmarks,
  exitMultiples,
  analystRefreshAuditLog,
  analystRefreshSettings,
  type AnalystWatchdogBenchmarks, type InsertAnalystWatchdogBenchmarks,
  type CapitalRaiseBenchmark, type InsertCapitalRaiseBenchmark,
  type ExitMultiple, type InsertExitMultiple,
  type AnalystRefreshAuditLog, type InsertAnalystRefreshAuditLog,
  type AnalystRefreshSettings, type InsertAnalystRefreshSettings,
} from "@shared/schema";
import { eq, and, desc, lte, sql } from "drizzle-orm";
import type { IntelligenceTx } from "../tx";

/**
 * WatchdogStorage — everything the analyst-refresh / Capital-Raise
 * Watchdog flow touches: per-user analyst cooldowns, per-user watchdog
 * benchmarks (seeded from DEFAULT_CAPITAL_RAISE_BENCHMARKS), the
 * shared capital-raise + exit-multiples tables the watchdog writes to,
 * and the refresh audit log + global refresh settings.
 *
 * These tables are co-located here because the cooldown gate, the
 * watchdog ingestion, and the audit-log finalisation all run together
 * inside one POST /api/analyst/refresh request.
 */
export class WatchdogStorage {
  constructor(public readonly _ctx: IntelligenceTx) {}

  // ── Analyst cooldown ─────────────────────────────────────────
  async getAnalystCooldownReservedAt(userId: number): Promise<Date | null> {
    const [row] = await this._ctx.db.select().from(analystCooldowns)
      .where(eq(analystCooldowns.userId, userId))
      .limit(1);
    return row?.reservedAt ?? null;
  }

  /**
   * Atomic admission control for the analyst refresh cooldown.
   *
   * INSERTs a fresh reservation, OR UPDATEs an existing one only when the
   * prior reservation is older than `cooldownMs`. Returns `granted=true`
   * when the slot is acquired (caller may run), or `granted=false` with
   * `retryAfterMs` when the cooldown is still active.
   *
   * This is the only correct primitive for serving multiple admin clicks
   * (or multiple app instances) without two of them passing the gate; a
   * separate read-then-reserve sequence would race.
   */
  async tryReserveAnalystCooldown(
    userId: number,
    now: Date,
    cooldownMs: number,
  ): Promise<{ granted: true } | { granted: false; retryAfterMs: number }> {
    const cutoff = new Date(now.getTime() - cooldownMs);
    const [row] = await this._ctx.db.insert(analystCooldowns)
      .values({ userId, reservedAt: now })
      .onConflictDoUpdate({
        target: analystCooldowns.userId,
        set: { reservedAt: now },
        setWhere: lte(analystCooldowns.reservedAt, cutoff),
      })
      .returning({ reservedAt: analystCooldowns.reservedAt });
    if (!row) {
      const [existing] = await this._ctx.db.select().from(analystCooldowns)
        .where(eq(analystCooldowns.userId, userId))
        .limit(1);
      const elapsed = existing ? now.getTime() - existing.reservedAt.getTime() : 0;
      const retryAfterMs = Math.max(0, cooldownMs - elapsed);
      return { granted: false, retryAfterMs };
    }
    return { granted: true };
  }

  /**
   * Test/admin hook — clears cooldown for one user, or all users if `userId`
   * is omitted. Production code should not call this.
   */
  async clearAnalystCooldown(userId?: number): Promise<void> {
    if (userId == null) {
      await this._ctx.db.delete(analystCooldowns);
    } else {
      await this._ctx.db.delete(analystCooldowns).where(eq(analystCooldowns.userId, userId));
    }
  }

  // ── Analyst Watchdog Benchmarks (per-user cache) ─────────────
  // Stub seeding: when no row exists for the user, insert one populated
  // from DEFAULT_CAPITAL_RAISE_BENCHMARKS. Future task swaps the seed
  // for an LLM-refreshed populator without changing the read path.
  async getAnalystWatchdogBenchmarks(userId: number): Promise<AnalystWatchdogBenchmarks> {
    const rows = await this._ctx.db.select().from(analystWatchdogBenchmarks)
      .where(eq(analystWatchdogBenchmarks.userId, userId))
      .limit(1);
    if (rows.length > 0) return rows[0];
    const { DEFAULT_CAPITAL_RAISE_BENCHMARKS } = await import("@shared/constants-funding");
    const seed: typeof analystWatchdogBenchmarks.$inferInsert = {
      userId,
      ...DEFAULT_CAPITAL_RAISE_BENCHMARKS,
      lastRefreshedAt: null,
      refreshedBy: "stub",
      sourceCount: 0,
      tokensUsed: 0,
    };
    const [inserted] = await this._ctx.db.insert(analystWatchdogBenchmarks).values(seed).returning();
    return inserted;
  }

  async upsertAnalystWatchdogBenchmarks(
    userId: number,
    row: Partial<InsertAnalystWatchdogBenchmarks>,
  ): Promise<AnalystWatchdogBenchmarks> {
    const existing = await this._ctx.db.select().from(analystWatchdogBenchmarks)
      .where(eq(analystWatchdogBenchmarks.userId, userId))
      .limit(1);
    if (existing.length > 0) {
      const [updated] = await this._ctx.db.update(analystWatchdogBenchmarks)
        .set({ ...row, updatedAt: new Date() })
        .where(eq(analystWatchdogBenchmarks.id, existing[0].id))
        .returning();
      return updated;
    }
    // Seed a base row first so every column has a value, then patch.
    const seeded = await this.getAnalystWatchdogBenchmarks(userId);
    const [updated] = await this._ctx.db.update(analystWatchdogBenchmarks)
      .set({ ...row, updatedAt: new Date() })
      .where(eq(analystWatchdogBenchmarks.id, seeded.id))
      .returning();
    return updated;
  }

  // ── Capital Raise Benchmarks ─────────────────────────────────
  async getCapitalRaiseBenchmarks(): Promise<CapitalRaiseBenchmark[]> {
    return this._ctx.db.select().from(capitalRaiseBenchmarks).orderBy(capitalRaiseBenchmarks.dimensionKey);
  }

  async getCapitalRaiseBenchmarkSummary(): Promise<{
    rows: CapitalRaiseBenchmark[];
    lastRefreshedAt: Date | null;
    sourceCount: number;
  }> {
    const rows = await this.getCapitalRaiseBenchmarks();
    const refreshed = rows.map(r => r.lastRefreshedAt).filter((d): d is Date => !!d);
    const lastRefreshedAt = refreshed.length ? new Date(Math.max(...refreshed.map(d => d.getTime()))) : null;
    const sourceCount = rows.reduce((s, r) => Math.max(s, r.sourceCount ?? 0), 0);
    return { rows, lastRefreshedAt, sourceCount };
  }

  async upsertCapitalRaiseBenchmark(data: InsertCapitalRaiseBenchmark): Promise<CapitalRaiseBenchmark> {
    const [existing] = await this._ctx.db.select().from(capitalRaiseBenchmarks)
      .where(eq(capitalRaiseBenchmarks.dimensionKey, data.dimensionKey)).limit(1);
    if (existing) {
      const [updated] = await this._ctx.db.update(capitalRaiseBenchmarks)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(capitalRaiseBenchmarks.id, existing.id))
        .returning();
      return updated;
    }
    const [inserted] = await this._ctx.db.insert(capitalRaiseBenchmarks)
      .values(data as typeof capitalRaiseBenchmarks.$inferInsert)
      .returning();
    return inserted;
  }

  /**
   * Batch write path used by the Capital-Raise Watchdog ingestion pipeline.
   * Each observation is upserted into `capital_raise_benchmarks` keyed by
   * `dimensionKey`. Existing rows inherit their label/unit when the watchdog
   * doesn't supply one; unrecognized dimensions (no existing row + missing
   * label) are skipped so a stray observation can't pollute the table.
   *
   * Note: writes are sequential, not wrapped in a single DB transaction. A
   * mid-loop failure can leave the table partially updated; the caller's
   * audit-log row records exactly which dimensions made it through (the
   * `applied` list) so the next watchdog run reconciles the rest.
   *
   * Returns the dimensionKeys that were applied vs. skipped so the caller can
   * log a precise diff and finalize the audit row accordingly.
   */
  async applyWatchdogCapitalRaiseObservations(
    observations: Array<{
      dimensionKey: string;
      label?: string | null;
      unit?: string | null;
      valueLow: number | null;
      valueMid: number | null;
      valueHigh: number | null;
    }>,
    opts: { sourceCount: number; recordedAt: Date },
  ): Promise<{ applied: CapitalRaiseBenchmark[]; skipped: string[] }> {
    const existingRows = await this.getCapitalRaiseBenchmarks();
    const byKey = new Map(existingRows.map(r => [r.dimensionKey, r] as const));

    const applied: CapitalRaiseBenchmark[] = [];
    const skipped: string[] = [];

    for (const obs of observations) {
      const prior = byKey.get(obs.dimensionKey);
      const label = obs.label ?? prior?.label ?? null;
      const unit = obs.unit ?? prior?.unit ?? "usd";
      if (!label) {
        skipped.push(obs.dimensionKey);
        continue;
      }
      const row = await this.upsertCapitalRaiseBenchmark({
        dimensionKey: obs.dimensionKey,
        label,
        unit,
        valueLow: obs.valueLow,
        valueMid: obs.valueMid,
        valueHigh: obs.valueHigh,
        sourceCount: opts.sourceCount,
        lastRefreshedAt: opts.recordedAt,
      });
      applied.push(row);
    }

    return { applied, skipped };
  }

  // ── Exit Multiples ───────────────────────────────────────────
  async getExitMultiples(): Promise<ExitMultiple[]> {
    return this._ctx.db.select().from(exitMultiples).orderBy(exitMultiples.dimensionKey);
  }

  async getExitMultiplesSummary(): Promise<{
    rows: ExitMultiple[];
    lastRefreshedAt: Date | null;
    sourceCount: number;
  }> {
    const rows = await this.getExitMultiples();
    const refreshed = rows.map(r => r.lastRefreshedAt).filter((d): d is Date => !!d);
    const lastRefreshedAt = refreshed.length ? new Date(Math.max(...refreshed.map(d => d.getTime()))) : null;
    const sourceCount = rows.reduce((s, r) => Math.max(s, r.sourceCount ?? 0), 0);
    return { rows, lastRefreshedAt, sourceCount };
  }

  async upsertExitMultiple(data: InsertExitMultiple): Promise<ExitMultiple> {
    const [existing] = await this._ctx.db.select().from(exitMultiples)
      .where(eq(exitMultiples.dimensionKey, data.dimensionKey)).limit(1);
    if (existing) {
      const [updated] = await this._ctx.db.update(exitMultiples)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(exitMultiples.id, existing.id))
        .returning();
      return updated;
    }
    const [inserted] = await this._ctx.db.insert(exitMultiples)
      .values(data as typeof exitMultiples.$inferInsert)
      .returning();
    return inserted;
  }

  // ── Analyst Refresh Audit Log ────────────────────────────────
  async createAnalystRefreshAuditLog(data: InsertAnalystRefreshAuditLog): Promise<AnalystRefreshAuditLog> {
    const [row] = await this._ctx.db.insert(analystRefreshAuditLog)
      .values(data as typeof analystRefreshAuditLog.$inferInsert)
      .returning();
    return row;
  }

  async finalizeAnalystRefreshAuditLog(
    id: number,
    patch: Partial<InsertAnalystRefreshAuditLog> & { finishedAt?: Date },
  ): Promise<AnalystRefreshAuditLog | undefined> {
    const [row] = await this._ctx.db.update(analystRefreshAuditLog)
      .set(patch)
      .where(eq(analystRefreshAuditLog.id, id))
      .returning();
    return row;
  }

  async getRecentAnalystRefreshAuditLogs(opts: { tableId?: string; sinceMs?: number; limit?: number } = {}): Promise<AnalystRefreshAuditLog[]> {
    const since = opts.sinceMs ? new Date(Date.now() - opts.sinceMs) : null;
    const conditions = [];
    if (opts.tableId) conditions.push(eq(analystRefreshAuditLog.tableId, opts.tableId));
    if (since) conditions.push(sql`${analystRefreshAuditLog.startedAt} > ${since}`);
    const where = conditions.length ? and(...conditions) : undefined;
    return this._ctx.db.select().from(analystRefreshAuditLog)
      .where(where)
      .orderBy(desc(analystRefreshAuditLog.startedAt))
      .limit(opts.limit ?? 50);
  }

  async countAnalystRefreshAttempts(opts: { adminId?: number; sinceMs: number }): Promise<number> {
    const since = new Date(Date.now() - opts.sinceMs);
    const conditions = [sql`${analystRefreshAuditLog.startedAt} > ${since}`];
    if (opts.adminId != null) conditions.push(eq(analystRefreshAuditLog.adminId, opts.adminId));
    const rows = await this._ctx.db.select({ c: sql<number>`count(*)::int` })
      .from(analystRefreshAuditLog)
      .where(and(...conditions));
    return rows[0]?.c ?? 0;
  }

  // ── Analyst Refresh Settings (singleton row id=1) ────────────
  async getAnalystRefreshSettings(): Promise<AnalystRefreshSettings> {
    const [row] = await this._ctx.db.select().from(analystRefreshSettings).where(eq(analystRefreshSettings.id, 1)).limit(1);
    if (row) return row;
    const [inserted] = await this._ctx.db.insert(analystRefreshSettings)
      .values({ id: 1, globalCadenceDays: 30 })
      .returning();
    return inserted;
  }

  async updateAnalystRefreshSettings(patch: InsertAnalystRefreshSettings): Promise<AnalystRefreshSettings> {
    await this.getAnalystRefreshSettings(); // ensure exists
    const [row] = await this._ctx.db.update(analystRefreshSettings)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(analystRefreshSettings.id, 1))
      .returning();
    return row;
  }
}
