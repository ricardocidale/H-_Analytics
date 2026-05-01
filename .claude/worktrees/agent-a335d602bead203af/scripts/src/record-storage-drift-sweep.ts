/**
 * Task #867 — Recorder script for the nightly storage drift sweep.
 *
 * Parses the r2-cutover-reconcile.ts reconciler stdout (piped via stdin or
 * read from a --log-file path), extracts mutation counters and residual bucket
 * counts from the LAST occurrence of each block (the reconciler may print
 * pre-remediation and post-remediation blocks; we always want the final
 * [RE-VERIFY] numbers), derives the run status, then upserts the singleton
 * row in `storage_drift_sweep_runs`.
 *
 * Why direct Drizzle instead of StorageDriftSweepRunsStorageImpl:
 *   StorageDriftSweepRunsStorageImpl lives in artifacts/api-server, which is a
 *   leaf workspace package. The pnpm workspace rules prohibit artifacts from
 *   importing each other, so this script re-implements the same upsert inline
 *   against @workspace/db. The schema, table, and singleton key are all shared
 *   from @workspace/db — the only duplication is the insert/onConflict call,
 *   which is intentionally kept identical to the impl class.
 *
 * Environment variables (set by the GitHub Actions workflow):
 *   EXIT_CODE          — exit code of the preceding reconciler step (required)
 *   GITHUB_RUN_ID      — GitHub Actions run ID
 *   GITHUB_RUN_URL     — Resolved HTML URL for the Actions run
 *   GITHUB_EVENT_NAME  — "schedule" | "workflow_dispatch"
 *   INPUT_REASON       — free-text reason from workflow_dispatch input (optional)
 *   DATABASE_URL       — Postgres connection string (required)
 */

import { readFileSync } from "fs";
import { db, pool } from "@workspace/db";
import {
  storageDriftSweepRuns,
  STORAGE_DRIFT_SWEEP_SINGLETON_ID,
} from "@workspace/db";
import {
  parseMutationCounters,
  parseResidualCount,
  deriveStatus,
  buildNotes,
} from "./log-parser.js";

// ---------------------------------------------------------------------------
// Argument / stdin helpers
// ---------------------------------------------------------------------------

function getLogText(): string {
  const logFileFlag = process.argv.indexOf("--log-file");
  if (logFileFlag !== -1 && process.argv[logFileFlag + 1]) {
    const filePath = process.argv[logFileFlag + 1];
    return readFileSync(filePath, "utf8");
  }
  try {
    return readFileSync("/dev/stdin", "utf8");
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const exitCode = parseInt(process.env.EXIT_CODE ?? "0", 10);
  const runId = process.env.GITHUB_RUN_ID ?? null;
  const runUrl = process.env.GITHUB_RUN_URL ?? null;
  const trigger = process.env.GITHUB_EVENT_NAME ?? null;
  const triggerReason = process.env.INPUT_REASON ?? null;

  const logText = getLogText();

  const { rewroteCount, copiedCount, skippedCount, failedCount } =
    parseMutationCounters(logText);
  const residualCount = parseResidualCount(logText);

  const status = deriveStatus({ exitCode, residualCount, rewroteCount, copiedCount });
  const notes = buildNotes(logText, residualCount);
  const finishedAt = new Date();

  const values = {
    id: STORAGE_DRIFT_SWEEP_SINGLETON_ID,
    finishedAt,
    exitCode,
    status,
    rewroteCount,
    copiedCount,
    skippedCount,
    failedCount,
    residualCount,
    runId,
    runUrl,
    trigger,
    triggerReason,
    notes,
    updatedAt: finishedAt,
  };

  await db
    .insert(storageDriftSweepRuns)
    .values(values)
    .onConflictDoUpdate({
      target: storageDriftSweepRuns.id,
      set: {
        finishedAt: values.finishedAt,
        exitCode: values.exitCode,
        status: values.status,
        rewroteCount: values.rewroteCount,
        copiedCount: values.copiedCount,
        skippedCount: values.skippedCount,
        failedCount: values.failedCount,
        residualCount: values.residualCount,
        runId: values.runId,
        runUrl: values.runUrl,
        trigger: values.trigger,
        triggerReason: values.triggerReason,
        notes: values.notes,
        updatedAt: values.updatedAt,
      },
    });

  console.log(
    `[record-storage-drift-sweep] upserted singleton row — status=${status} exitCode=${exitCode} residual=${residualCount} rewrote=${rewroteCount} copied=${copiedCount} skipped=${skippedCount} failed=${failedCount}`,
  );

  await pool.end();
}

main().catch((err) => {
  console.error("[record-storage-drift-sweep] fatal error:", err);
  process.exit(1);
});
