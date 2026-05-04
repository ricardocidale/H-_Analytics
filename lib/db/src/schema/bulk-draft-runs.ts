import { pgTable, serial, integer, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { users } from "./auth";

export interface BulkDraftPropertyResultJson {
  propertyId: number;
  propertyName: string;
  status: "done" | "error";
  draftedSlots: string[];
  skippedSlots: string[];
}

export const bulkDraftRuns = pgTable(
  "bulk_draft_runs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userName: text("user_name").notNull(),
    ranAt: timestamp("ran_at").defaultNow().notNull(),
    totalDrafted: integer("total_drafted").notNull().default(0),
    totalSkipped: integer("total_skipped").notNull().default(0),
    totalErrors: integer("total_errors").notNull().default(0),
    propertyCount: integer("property_count").notNull().default(0),
    propertyResults: jsonb("property_results")
      .notNull()
      .$type<BulkDraftPropertyResultJson[]>(),
  },
  (table) => [
    index("bulk_draft_runs_user_id_idx").on(table.userId),
    index("bulk_draft_runs_ran_at_idx").on(table.ranAt),
  ],
);

export type BulkDraftRun = typeof bulkDraftRuns.$inferSelect;

export const insertBulkDraftRunSchema = createInsertSchema(bulkDraftRuns).omit({
  id: true,
  ranAt: true,
});

export type InsertBulkDraftRun = z.infer<typeof insertBulkDraftRunSchema>;

/**
 * Maximum number of bulk_draft_runs rows retained automatically.
 * After each insert, rows beyond this count (ordered by ran_at DESC, id DESC)
 * are deleted as a best-effort trim so the table stays bounded.
 */
export const BULK_DRAFT_RUNS_KEEP = 200;
