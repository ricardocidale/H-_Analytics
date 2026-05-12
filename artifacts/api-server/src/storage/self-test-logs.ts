/**
 * Storage for `self_test_logs` (Task #1458).
 *
 * Append-only log of every entity self-test execution across all entity
 * kinds (admin_resources, agents, specialists, minions, rebecca). The
 * Self-tests tab on the Logs page reads from this table; the minion
 * self-test scheduler writes one row per probe.
 */
import { db } from "../db";
import {
  selfTestLogs,
  type InsertSelfTestLog,
  type SelfTestLogRow,
  type SelfTestOutcome,
} from "@workspace/db";
import { and, desc, eq, gte, sql } from "drizzle-orm";

export interface RecordSelfTestLogInput {
  entityKind: string;
  entityId: string;
  entityName: string;
  outcome: SelfTestOutcome;
  durationMs?: number | null;
  adminResourceId?: number | null;
  probeRecipeSnapshot?: Record<string, unknown> | null;
  rawResponse?: Record<string, unknown> | null;
  summary?: string | null;
  findingId?: string | null;
}

export interface ListSelfTestLogsOptions {
  entityKind?: string;
  outcome?: SelfTestOutcome;
  /** Only return rows with `ran_at >= since`. */
  since?: Date;
  /** Hard cap on rows returned. Defaults to 500. */
  limit?: number;
}

export interface SelfTestLogsStorage {
  recordSelfTestLog(input: RecordSelfTestLogInput): Promise<SelfTestLogRow>;
  listSelfTestLogs(options?: ListSelfTestLogsOptions): Promise<SelfTestLogRow[]>;
}

const DEFAULT_LIST_LIMIT = 500;
const MAX_LIST_LIMIT = 2000;

export class SelfTestLogsStorageImpl implements SelfTestLogsStorage {
  async recordSelfTestLog(input: RecordSelfTestLogInput): Promise<SelfTestLogRow> {
    const values: InsertSelfTestLog = {
      entityKind: input.entityKind,
      entityId: input.entityId,
      entityName: input.entityName,
      outcome: input.outcome,
      durationMs: input.durationMs ?? null,
      adminResourceId: input.adminResourceId ?? null,
      probeRecipeSnapshot: input.probeRecipeSnapshot ?? null,
      rawResponse: input.rawResponse ?? null,
      summary: input.summary ?? null,
      findingId: input.findingId ?? null,
    };
    const [row] = await db.insert(selfTestLogs).values(values).returning();
    return row;
  }

  async listSelfTestLogs(
    options: ListSelfTestLogsOptions = {},
  ): Promise<SelfTestLogRow[]> {
    const filters = [];
    if (options.entityKind) filters.push(eq(selfTestLogs.entityKind, options.entityKind));
    if (options.outcome) filters.push(eq(selfTestLogs.outcome, options.outcome));
    if (options.since instanceof Date && !Number.isNaN(options.since.getTime())) {
      filters.push(gte(selfTestLogs.ranAt, options.since));
    }

    const rawLimit = options.limit;
    const validatedLimit =
      typeof rawLimit === "number" && Number.isFinite(rawLimit)
        ? Math.floor(rawLimit)
        : DEFAULT_LIST_LIMIT;
    const limit = Math.max(1, Math.min(MAX_LIST_LIMIT, validatedLimit));

    const where = filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : and(...filters);
    const query = db
      .select()
      .from(selfTestLogs)
      .orderBy(desc(selfTestLogs.ranAt), desc(selfTestLogs.id))
      .limit(limit);
    return where ? await query.where(where) : await query;
  }
}

// Re-export sql so the storage barrel doesn't require it. (Kept for symmetry
// with sibling modules that may filter by raw SQL fragments later.)
export { sql };
