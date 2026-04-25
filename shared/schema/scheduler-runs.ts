/**
 * Task #542 — Track scheduler run health on the admin observability page.
 *
 * Several background schedulers run on production (ambient benchmarks,
 * research workflows, resource health probes, constants refresh, and the
 * nightly Specialist quality recompute). Each used to log its cycle
 * summary to the structured logger only — there was no single admin
 * surface that said "last run, what happened, did it fail". When a cycle
 * silently stopped firing nobody noticed until aggregate scores rotted.
 *
 * `scheduler_runs` is a tiny upsert-only table: ONE row per scheduler,
 * keyed on `schedulerKey`. Each scheduler writes its latest cycle summary
 * at the end of every cycle (success or failure). The Admin →
 * Observability page reads every row and computes a stale-warning when
 * `lastRunAt` is older than `cycleIntervalMs * staleMultiplier`.
 *
 * We deliberately keep ONE row per scheduler instead of an append-only
 * history — the goal here is "did the cycle fire and was it healthy",
 * not a long-tail audit log. Long-tail history (per-row research_runs,
 * per-resource probe history, per-Specialist quality snapshots) already
 * exists in the surfaces those schedulers feed.
 */
import { pgTable, text, integer, bigint, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const SCHEDULER_STATUSES = ["ok", "warn", "error"] as const;
export type SchedulerStatus = (typeof SCHEDULER_STATUSES)[number];
export const SchedulerStatusSchema = z.enum(SCHEDULER_STATUSES);

export const schedulerRuns = pgTable("scheduler_runs", {
  // Stable string identifier per scheduler (e.g. `ambient-benchmarks`).
  schedulerKey: text("scheduler_key").primaryKey(),
  // Human-readable label shown in the admin UI.
  schedulerLabel: text("scheduler_label").notNull(),
  // When the most recent cycle finished (success OR failure).
  lastRunAt: timestamp("last_run_at").defaultNow().notNull(),
  // Cycle counters. Semantics are scheduler-specific:
  //   • considered: how many work units were inspected this cycle
  //   • succeeded:  how many work units finished cleanly
  //   • failed:     how many work units errored
  // For schedulers without a natural unit count (e.g. the ambient benchmark
  // refresh emits a single batch), considered/succeeded/failed mirror the
  // cycle outcome (1/1/0 success, 1/0/1 failure).
  considered: integer("considered").notNull().default(0),
  succeeded: integer("succeeded").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  // Health verdict the scheduler stamped on this cycle:
  //   • ok    — cycle completed with zero unit failures
  //   • warn  — cycle completed but one or more units failed (partial)
  //   • error — cycle itself threw; no useful counters were produced
  status: text("status").notNull(),
  // Optional one-line note (truncated error message, sample of failed
  // unit ids, etc). Kept short — UI shows it inline.
  notes: text("notes"),
  // Cycle cadence in ms — used by the admin UI to compute "stale" when
  // the row's `lastRunAt` is older than `cycleIntervalMs * staleMultiplier`.
  // bigint because 24h schedulers don't fit in int4 in some Postgres
  // configurations once you multiply by stale multiplier downstream.
  cycleIntervalMs: bigint("cycle_interval_ms", { mode: "number" }).notNull(),
  // Wall-clock duration of the most recent cycle. Optional — not every
  // scheduler measures it (the resource health checker, for example,
  // would have to wrap each tick to track).
  durationMs: integer("duration_ms"),
  // Last write — auto-bumped on every upsert.
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type SchedulerRun = typeof schedulerRuns.$inferSelect;

export const insertSchedulerRunSchema = createInsertSchema(schedulerRuns, {
  status: SchedulerStatusSchema,
}).omit({
  updatedAt: true,
});
export type InsertSchedulerRun = z.infer<typeof insertSchedulerRunSchema>;
