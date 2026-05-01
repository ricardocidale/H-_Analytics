/**
 * Task #528 — Surface the last storage drift sweep result on the admin
 * Observability page.
 *
 * Background: `.github/workflows/storage-reconcile-remediate.yml` runs the
 * `script/r2-cutover-reconcile.ts` script nightly with both auto-remediation
 * flags. Up to now the only place an operator could see "did the sweep run,
 * and did it fix anything" was the GitHub Actions UI — leaving the app and
 * digging through the job summary. This table is the in-app surface for that
 * signal: the workflow's final step upserts the row so Admin → Observability
 * can render it like any other operational health row.
 *
 * Single-row table (PK = "default") because the goal is "show the last
 * sweep" — long-tail history lives in the GitHub Actions UI, where the
 * full reconciler stdout is uploaded as an artifact for 30 days. Keeping
 * one row in Postgres avoids growth concerns and keeps the admin read a
 * single primary-key lookup.
 */
import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const STORAGE_DRIFT_SWEEP_STATUSES = ["ok", "partial", "error"] as const;
export type StorageDriftSweepStatus = (typeof STORAGE_DRIFT_SWEEP_STATUSES)[number];
export const StorageDriftSweepStatusSchema = z.enum(STORAGE_DRIFT_SWEEP_STATUSES);

/**
 * The PK value the workflow always upserts under. Single-row table; this
 * sentinel string keeps the row addressable by name without exposing a
 * synthetic surrogate key to the workflow.
 */
export const STORAGE_DRIFT_SWEEP_SINGLETON_ID = "default" as const;

export const storageDriftSweepRuns = pgTable("storage_drift_sweep_runs", {
  // Singleton row id. Always `STORAGE_DRIFT_SWEEP_SINGLETON_ID` ("default").
  id: text("id").primaryKey(),
  // Wall-clock time when the workflow finished writing the row. The
  // workflow uses `always()` so this is set whether the reconciler exited
  // 0 or non-zero — staleness is computed against this timestamp.
  finishedAt: timestamp("finished_at").notNull(),
  // Reconciler exit code captured from the `[remediate]` step. 0 = clean,
  // non-zero = residual unresolved references after auto-remediation.
  exitCode: integer("exit_code").notNull(),
  // Health verdict derived from exit code + residual count:
  //   • ok      — exit 0 AND residual == 0
  //   • partial — exit 0 OR exit non-zero with residual > 0 but the sweep
  //               still performed mutations (rewrote/copied > 0)
  //   • error   — exit non-zero with NO mutations performed (the sweep
  //               itself failed before remediating anything)
  status: text("status").notNull(),
  // Per-action mutation counters parsed from the reconciler stdout. These
  // mirror the "Mutations performed" block in the GitHub job summary so
  // the admin panel can render the exact same numbers without scraping
  // the Actions UI.
  rewroteCount: integer("rewrote_count").notNull().default(0),
  copiedCount: integer("copied_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
  failedCount: integer("failed_count").notNull().default(0),
  // Residual unresolved-reference count after the final [RE-VERIFY] pass.
  // Sum of MISSING-R2 + MISSING-media + MISSING-photo + LEGACY-host
  // buckets in the last bucket-count block emitted by the reconciler.
  // If non-zero after a remediation run, the residual is a manual-triage
  // signal (the script can't mechanically fix non-rewritable shapes or
  // rotted media rows).
  residualCount: integer("residual_count").notNull().default(0),
  // GitHub Actions run id and resolved URL. The admin panel renders the
  // URL as a "View on GitHub" link out to the run for the full audit
  // trail (the artifact log lives there for 30 days).
  runId: text("run_id"),
  runUrl: text("run_url"),
  // What kicked the workflow off — `schedule` (the nightly cron) or
  // `workflow_dispatch` (a manual operator-triggered run). Surfaced on
  // the panel so an operator can tell at a glance whether the last
  // result reflects routine drift or an ad-hoc sweep.
  trigger: text("trigger"),
  // Free-text reason the operator supplied when manually dispatching
  // the workflow. Null for scheduled runs.
  triggerReason: text("trigger_reason"),
  // Optional one-line summary (e.g. "missing-r2:1 legacy-host:0 …") so the
  // panel can show the residual breakdown without an extra column per
  // bucket. Kept short — display uses it inline like a notes column.
  notes: text("notes"),
  // Last write — auto-bumped on every upsert.
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type StorageDriftSweepRun = typeof storageDriftSweepRuns.$inferSelect;

export const insertStorageDriftSweepRunSchema = createInsertSchema(storageDriftSweepRuns, {
  status: StorageDriftSweepStatusSchema,
}).omit({
  updatedAt: true,
});
export type InsertStorageDriftSweepRun = z.infer<typeof insertStorageDriftSweepRunSchema>;
