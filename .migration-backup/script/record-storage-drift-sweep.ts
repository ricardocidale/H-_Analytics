/**
 * Task #528 — Record the last storage-drift sweep result into Postgres so
 * the Admin → Observability page can surface it.
 *
 * Invoked as the last step of `.github/workflows/storage-reconcile-remediate.yml`,
 * AFTER the GitHub job summary is written, with `if: always()` so a non-zero
 * reconciler exit still records the row (the row's `exitCode` field is what
 * tells the admin UI the sweep failed).
 *
 * Inputs (env vars):
 *   • RECONCILER_LOG_PATH   — path to the captured reconciler stdout
 *                             (e.g. `artifacts/r2-cutover-remediate.log`).
 *                             Required.
 *   • RECONCILER_EXIT_CODE  — numeric exit code from the reconciler step.
 *                             Required.
 *   • POSTGRES_URL          — connection string. Same secret the workflow's
 *                             reconciler step uses (`PROD_POSTGRES_URL`).
 *                             Required (read by `server/db.ts`).
 *   • GITHUB_RUN_ID         — Actions-provided. Used to build the run URL.
 *   • GITHUB_REPOSITORY     — Actions-provided. Used to build the run URL.
 *   • GITHUB_SERVER_URL     — Actions-provided. Defaults to https://github.com.
 *   • GITHUB_EVENT_NAME     — Actions-provided. Stored as `trigger`.
 *   • TRIGGER_REASON        — Optional. The `inputs.reason` from a
 *                             `workflow_dispatch` invocation.
 *
 * The script intentionally does NOT throw on parse-only issues — if the
 * reconciler log is missing or malformed it still upserts a row with
 * `status=error`, exit code from the env, and notes describing the
 * problem. That way an empty log file doesn't silently leave the panel
 * showing a stale "ok" from a previous run.
 */
import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import {
  parseStorageDriftSweepLog,
  deriveStorageDriftSweepStatus,
  summariseStorageDriftSweepNotes,
} from "./lib/parse-storage-drift-sweep-log";
import { storage } from "../server/storage";
import { pool } from "../server/db";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    console.error(`record-storage-drift-sweep: missing required env ${name}`);
    process.exit(2);
  }
  return v;
}

function buildRunUrl(): { runId: string | null; runUrl: string | null } {
  const runId = process.env.GITHUB_RUN_ID ?? null;
  const repo = process.env.GITHUB_REPOSITORY;
  const server = process.env.GITHUB_SERVER_URL ?? "https://github.com";
  if (!runId || !repo) return { runId, runUrl: null };
  return { runId, runUrl: `${server}/${repo}/actions/runs/${runId}` };
}

async function main(): Promise<void> {
  const logPath = requireEnv("RECONCILER_LOG_PATH");
  const exitCode = Number(requireEnv("RECONCILER_EXIT_CODE"));
  if (!Number.isFinite(exitCode)) {
    console.error(`record-storage-drift-sweep: RECONCILER_EXIT_CODE is not numeric: ${process.env.RECONCILER_EXIT_CODE}`);
    process.exit(2);
  }

  const trigger = process.env.GITHUB_EVENT_NAME ?? null;
  const triggerReason = process.env.TRIGGER_REASON?.trim() || null;
  const { runId, runUrl } = buildRunUrl();

  let stdout = "";
  let parseFailureNote: string | null = null;
  if (!existsSync(logPath)) {
    parseFailureNote = `reconciler log not found at ${logPath}`;
  } else {
    try {
      stdout = readFileSync(logPath, "utf8");
    } catch (err: unknown) {
      parseFailureNote = `failed to read reconciler log: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  const counts = parseStorageDriftSweepLog(stdout);
  const status = parseFailureNote
    ? "error"
    : deriveStorageDriftSweepStatus(exitCode, counts);
  const notes = parseFailureNote ?? summariseStorageDriftSweepNotes(counts);

  try {
    const row = await storage.recordStorageDriftSweepRun({
      finishedAt: new Date(),
      exitCode,
      status,
      rewroteCount: counts.rewroteCount,
      copiedCount: counts.copiedCount,
      skippedCount: counts.skippedCount,
      failedCount: counts.failedCount,
      residualCount: counts.residualCount,
      runId,
      runUrl,
      trigger,
      triggerReason,
      notes,
    });
    console.log(
      `record-storage-drift-sweep: upserted row (status=${row.status} exit=${row.exitCode} ` +
        `rewrote=${row.rewroteCount} copied=${row.copiedCount} skipped=${row.skippedCount} ` +
        `failed=${row.failedCount} residual=${row.residualCount})`,
    );
  } finally {
    // Close the pool so the workflow step exits promptly.
    await pool.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error("record-storage-drift-sweep: fatal", err);
  process.exit(1);
});
