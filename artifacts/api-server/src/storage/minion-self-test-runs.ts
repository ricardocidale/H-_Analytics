/**
 * Task #1396 — Storage for `minion_self_test_runs`.
 *
 * Append-only short history of POST /api/admin/minions/:id/self-test results.
 * Each `recordMinionSelfTestRun` call inserts one row and trims that
 * minion's history to the last `MINION_SELF_TEST_HISTORY_KEEP` rows so the
 * table stays bounded. The Minions roster reads the latest rows back via
 * `listMinionSelfTestHistory` to render the per-row pass/fail strip.
 *
 * Mirrors the `scheduler-runs.ts` pattern (Task #558) — one append, one
 * trim, one PARTITION-BY-bounded read for cheap multi-minion fetches.
 */
import { db } from "../db";
import {
  minionSelfTestRuns,
  MINION_SELF_TEST_HISTORY_KEEP,
  type MinionSelfTestRunRow,
  type MinionSelfTestStatus,
} from "@workspace/db";
import { sql } from "drizzle-orm";

export interface RecordMinionSelfTestRunInput {
  minionId: string;
  status: MinionSelfTestStatus;
  durationMs: number;
  message?: string | null;
  ranAt?: Date;
}

export interface ListMinionSelfTestHistoryOptions {
  /** Per-minion row cap. Defaults to `MINION_SELF_TEST_HISTORY_KEEP`. */
  limitPerMinion?: number;
  /** Restrict the lookup to specific minion ids (defaults to all). */
  minionIds?: string[];
}

export interface MinionSelfTestRunsStorage {
  recordMinionSelfTestRun(
    input: RecordMinionSelfTestRunInput,
  ): Promise<MinionSelfTestRunRow>;
  listMinionSelfTestHistory(
    options?: ListMinionSelfTestHistoryOptions,
  ): Promise<MinionSelfTestRunRow[]>;
}

export class MinionSelfTestRunsStorageImpl implements MinionSelfTestRunsStorage {
  async recordMinionSelfTestRun(
    input: RecordMinionSelfTestRunInput,
  ): Promise<MinionSelfTestRunRow> {
    const ranAt = input.ranAt ?? new Date();
    const [row] = await db
      .insert(minionSelfTestRuns)
      .values({
        minionId: input.minionId,
        status: input.status,
        durationMs: input.durationMs,
        message: input.message ?? null,
        ranAt,
      })
      .returning();

    // Trim to the last N rows for this minion. Scope the DELETE to the
    // SAME minionId via a sub-select so concurrent writes for OTHER
    // minions can't be touched. Best-effort: a failure here leaves the
    // append intact and the next cycle will trim it down.
    await db.execute(sql`
      DELETE FROM minion_self_test_runs
      WHERE minion_id = ${input.minionId}
        AND id NOT IN (
          SELECT id FROM minion_self_test_runs
          WHERE minion_id = ${input.minionId}
          ORDER BY ran_at DESC, id DESC
          LIMIT ${MINION_SELF_TEST_HISTORY_KEEP}
        )
    `);

    return row;
  }

  async listMinionSelfTestHistory(
    options: ListMinionSelfTestHistoryOptions = {},
  ): Promise<MinionSelfTestRunRow[]> {
    // Validate `limitPerMinion` before clamping. `Math.max(1, NaN) === NaN`, which
    // would crash the SQL query — coerce non-finite or non-integer inputs back to
    // the catalog default before applying the floor of 1.
    const rawLimit = options.limitPerMinion;
    const validatedLimit =
      typeof rawLimit === "number" && Number.isFinite(rawLimit)
        ? Math.floor(rawLimit)
        : MINION_SELF_TEST_HISTORY_KEEP;
    const limit = Math.max(1, validatedLimit);
    const ids = options.minionIds;

    const filterSql = ids && ids.length > 0
      ? sql`WHERE minion_id IN (${sql.join(ids.map((k) => sql`${k}`), sql`, `)})`
      : sql``;

    const result = await db.execute(sql`
      SELECT id, minion_id, status, duration_ms, message, ran_at
      FROM (
        SELECT *,
               ROW_NUMBER() OVER (
                 PARTITION BY minion_id
                 ORDER BY ran_at DESC, id DESC
               ) AS rn
        FROM minion_self_test_runs
        ${filterSql}
      ) ranked
      WHERE rn <= ${limit}
      ORDER BY minion_id ASC, ran_at DESC, id DESC
    `);

    const rows = (result.rows ?? []) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: Number(r.id),
      minionId: String(r.minion_id),
      status: String(r.status),
      durationMs: Number(r.duration_ms ?? 0),
      message: r.message == null ? null : String(r.message),
      ranAt: r.ran_at instanceof Date ? r.ran_at : new Date(String(r.ran_at)),
    }));
  }
}
