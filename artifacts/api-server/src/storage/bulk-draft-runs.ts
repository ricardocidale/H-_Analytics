import { db } from "../db";
import { bulkDraftRuns, BULK_DRAFT_RUNS_KEEP, type BulkDraftRun, type BulkDraftPropertyResultJson } from "@workspace/db";
import { desc, sql } from "drizzle-orm";
import { logger } from "../logger";

export interface CreateBulkDraftRunInput {
  userId: number;
  userName: string;
  totalDrafted: number;
  totalSkipped: number;
  totalErrors: number;
  propertyCount: number;
  propertyResults: BulkDraftPropertyResultJson[];
}

export interface BulkDraftRunsStorage {
  createBulkDraftRun(input: CreateBulkDraftRunInput): Promise<BulkDraftRun>;
  listBulkDraftRuns(limit?: number): Promise<BulkDraftRun[]>;
}

const MAX_RUNS_KEPT = 100;

export class BulkDraftRunsStorageImpl implements BulkDraftRunsStorage {
  async createBulkDraftRun(input: CreateBulkDraftRunInput): Promise<BulkDraftRun> {
    const [row] = await db
      .insert(bulkDraftRuns)
      .values({
        userId: input.userId,
        userName: input.userName,
        totalDrafted: input.totalDrafted,
        totalSkipped: input.totalSkipped,
        totalErrors: input.totalErrors,
        propertyCount: input.propertyCount,
        propertyResults: input.propertyResults,
      })
      .returning();

    // Best-effort trim: delete rows beyond the most recent BULK_DRAFT_RUNS_KEEP.
    // Errors are swallowed here — the insert already committed, and the next
    // insert will attempt the trim again.
    try {
      await db.execute(sql`
        DELETE FROM bulk_draft_runs
        WHERE id NOT IN (
          SELECT id FROM bulk_draft_runs
          ORDER BY ran_at DESC, id DESC
          LIMIT ${BULK_DRAFT_RUNS_KEEP}
        )
      `);
    } catch (err) {
      logger.warn(`bulk_draft_runs trim failed — will retry on next insert: ${err instanceof Error ? err.message : String(err)}`, "bulk-draft-runs");
    }

    return row;
  }

  async listBulkDraftRuns(limit: number = MAX_RUNS_KEPT): Promise<BulkDraftRun[]> {
    return db
      .select()
      .from(bulkDraftRuns)
      .orderBy(desc(bulkDraftRuns.ranAt))
      .limit(Math.min(limit, MAX_RUNS_KEPT));
  }
}
