import { db } from "../db";
import { bulkDraftRuns, type BulkDraftRun, type BulkDraftPropertyResultJson } from "@workspace/db";
import { desc } from "drizzle-orm";

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
