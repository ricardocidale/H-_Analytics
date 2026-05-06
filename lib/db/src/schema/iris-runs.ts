/**
 * Iris backstage agent run log.
 *
 * One row per Iris agent execution. Inserted with status "running" when a run
 * is triggered and updated to "completed" or "error" when the agent finishes.
 * The Admin → Iris panel reads the latest row to surface last-run health.
 */
import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export const IRIS_RUN_STATUSES = ["running", "completed", "error"] as const;
export type IrisRunStatus = (typeof IRIS_RUN_STATUSES)[number];

export const irisRuns = pgTable("iris_runs", {
  id: serial("id").primaryKey(),
  trigger: text("trigger").notNull(),
  status: text("status").notNull().default("running"),
  modelUsed: text("model_used"),
  chunksIndexed: integer("chunks_indexed").notNull().default(0),
  errorsEncountered: integer("errors_encountered").notNull().default(0),
  durationMs: integer("duration_ms"),
  runAt: timestamp("run_at", { withTimezone: true }).defaultNow().notNull(),
  healthSummary: jsonb("health_summary"),
});

export type IrisRunRow = typeof irisRuns.$inferSelect;
