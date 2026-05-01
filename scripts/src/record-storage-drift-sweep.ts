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
  type StorageDriftSweepStatus,
} from "@workspace/db";

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
// Parsing helpers — always return the LAST match in the log
//
// The reconciler emits multiple passes (pre-remediation audit, remediation,
// post-remediation RE-VERIFY). Each pass may print a "Mutations performed"
// block and a bucket-count block. We want the FINAL numbers so we iterate
// all matches with the global flag and keep only the last.
// ---------------------------------------------------------------------------

/**
 * Extract a named integer counter, returning the value from the LAST
 * occurrence in the log. Matches lines like:
 *   "  rewrote: 5" / "rewrote=5" / "Rewrote 5 objects"
 * Returns 0 if the label is not found anywhere in the log.
 */
function parseLastCounter(text: string, label: string): number {
  const pattern = new RegExp(`\\b${label}[:\\s=]+([0-9]+)`, "gi");
  let lastValue = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    lastValue = parseInt(match[1], 10);
  }
  return lastValue;
}

/**
 * Parse the last "Mutations performed" block for the four action counters.
 * Using parseLastCounter ensures we get the post-remediation figures.
 */
function parseMutationCounters(text: string): {
  rewroteCount: number;
  copiedCount: number;
  skippedCount: number;
  failedCount: number;
} {
  return {
    rewroteCount: parseLastCounter(text, "rewrote"),
    copiedCount: parseLastCounter(text, "copied"),
    skippedCount: parseLastCounter(text, "skipped"),
    failedCount: parseLastCounter(text, "failed"),
  };
}

/**
 * Parse the LAST bucket-count block for residual unresolved references.
 * Sums MISSING-R2, MISSING-media, MISSING-photo, and LEGACY-host.
 *
 * The reconciler's final [RE-VERIFY] pass is the authoritative residual
 * count, so we isolate the text from the last bucket-header marker onward
 * before summing.
 */
function parseResidualCount(text: string): number {
  // Find the last occurrence of a bucket-count section header.
  // Common headers the reconciler uses: "[RE-VERIFY]", "Bucket counts:",
  // "Unresolved references:", or simply the first bucket label itself.
  const bucketHeaders = ["\\[RE-VERIFY\\]", "Bucket counts:", "Unresolved references:"];
  let lastHeaderIdx = -1;
  for (const header of bucketHeaders) {
    const pattern = new RegExp(header, "gi");
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastHeaderIdx) lastHeaderIdx = match.index;
    }
  }

  // If we found a section header, restrict parsing to everything after it.
  // Otherwise fall back to last-match across the whole log.
  const searchText = lastHeaderIdx >= 0 ? text.slice(lastHeaderIdx) : text;

  const buckets = ["MISSING-R2", "MISSING-media", "MISSING-photo", "LEGACY-host"];
  let total = 0;
  for (const bucket of buckets) {
    // Escape the hyphen for use inside a character class alternative.
    const escapedBucket = bucket.replace(/-/g, "[-]");
    total += parseLastCounter(searchText, escapedBucket);
  }
  return total;
}

/**
 * Derive the health status from schema-documented rules:
 *   ok      — exit 0 AND residual == 0
 *   partial — (exit 0 AND residual > 0) OR
 *             (exit non-zero AND residual > 0 AND mutations > 0)
 *   error   — exit non-zero AND no mutations performed
 */
function deriveStatus(opts: {
  exitCode: number;
  residualCount: number;
  rewroteCount: number;
  copiedCount: number;
}): StorageDriftSweepStatus {
  const { exitCode, residualCount, rewroteCount, copiedCount } = opts;
  const mutationsPerformed = rewroteCount + copiedCount;

  if (exitCode === 0 && residualCount === 0) {
    return "ok";
  }
  if (exitCode !== 0 && mutationsPerformed === 0) {
    return "error";
  }
  return "partial";
}

// ---------------------------------------------------------------------------
// Notes helper — compact per-bucket summary for the admin panel
// ---------------------------------------------------------------------------

function buildNotes(text: string, residualCount: number): string | null {
  if (residualCount === 0) return null;

  const buckets: Record<string, number> = {
    "missing-r2": parseLastCounter(text, "MISSING-R2"),
    "missing-media": parseLastCounter(text, "MISSING-media"),
    "missing-photo": parseLastCounter(text, "MISSING-photo"),
    "legacy-host": parseLastCounter(text, "LEGACY-host"),
  };

  const parts = Object.entries(buckets)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k}:${v}`);

  return parts.length > 0 ? parts.join(" ") : null;
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
