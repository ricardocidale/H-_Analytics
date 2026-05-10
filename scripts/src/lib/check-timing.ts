/**
 * check-timing.ts
 *
 * Shared check-timing utilities used by both check-selective.ts (writer) and
 * check-timing-report.ts (reader).  Extracting them here prevents the two
 * files from drifting as each evolves independently.
 *
 * Exports:
 *   TimingRecord       — the JSONL record shape written by check-selective.ts
 *   CheckEntry         — per-check entry nested inside TimingRecord
 *   CheckResult        — minimal run-result shape required by computeRegressions()
 *   TIMING_FILE        — canonical path to the timing history file
 *   loadTimingRecords  — parse the full JSONL history into TimingRecord[]
 *   computeRegressions — compare current results against historical p75 baseline
 */

import fs from "node:fs";
import path from "node:path";

import { WORKSPACE_ROOT } from "./check-cache.js";
import { classifyTrend } from "./check-trend.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CheckEntry {
  label: string;
  durationMs: number;
  slow: boolean;
  exitCode: number;
}

export interface TimingRecord {
  ts: string;
  totalMs: number;
  passed: boolean;
  checks: CheckEntry[];
}

/**
 * Minimal shape of a run result required by computeRegressions().  The caller
 * (check-selective.ts) may use a superset interface — only these four fields
 * are read here.
 */
export interface CheckResult {
  label: string;
  exitCode: number;
  durationMs: number;
  killed?: boolean;
}

// ---------------------------------------------------------------------------
// Timing file path
// ---------------------------------------------------------------------------

export const TIMING_FILE = path.join(WORKSPACE_ROOT, ".cache", "check-timing.jsonl");

// ---------------------------------------------------------------------------
// loadTimingRecords
// ---------------------------------------------------------------------------

/**
 * Parse the full JSONL timing history into an array of TimingRecord objects.
 * Returns an empty array if the file does not exist or contains no valid lines.
 * Malformed lines are silently skipped.
 */
export function loadTimingRecords(): TimingRecord[] {
  if (!fs.existsSync(TIMING_FILE)) return [];

  const lines = fs.readFileSync(TIMING_FILE, "utf8").split("\n").filter(Boolean);
  const records: TimingRecord[] = [];

  for (const line of lines) {
    try {
      records.push(JSON.parse(line) as TimingRecord);
    } catch {
      // Skip malformed lines.
    }
  }

  return records;
}

// ---------------------------------------------------------------------------
// computeRegressions
// ---------------------------------------------------------------------------

/**
 * Compare each check's current duration against the p75 of its last
 * `trendWindow` prior runs via classifyTrend().  Returns the set of check
 * labels whose trend is classified as "up" (i.e. exceeded the REGRESSION_THRESHOLD
 * baseline).
 *
 * A check is only flagged when it has at least `trendWindow` prior data
 * points — sparse history never produces false positives.
 *
 * The function reads from the timing history file directly.  The caller must
 * have already appended the current run's record before calling this so that
 * the file contains the just-completed run as its last line.
 */
export function computeRegressions(
  currentResults: CheckResult[],
  trendWindow: number,
): Set<string> {
  const regressed = new Set<string>();

  let allRecords: TimingRecord[] = [];
  try {
    allRecords = loadTimingRecords();
  } catch {
    return regressed; // No history file yet — nothing to analyse.
  }

  if (allRecords.length === 0) return regressed;

  // The last record is the one we just appended (current run).
  // Prior records are everything before it.
  const priorRecords = allRecords.slice(0, -1);

  for (const result of currentResults) {
    // Only flag passing, non-killed checks.
    if (result.exitCode !== 0 || result.killed) continue;

    // Collect durations for this check from prior records, in chronological order.
    const priorDurations: number[] = [];
    for (const rec of priorRecords) {
      const entry = rec.checks.find((c) => c.label === result.label);
      if (entry && entry.exitCode === 0) priorDurations.push(entry.durationMs);
    }

    // Take only the most recent trendWindow prior runs.
    const window = priorDurations.slice(-trendWindow);

    // Require a full window before flagging — avoids false positives on new checks.
    if (window.length < trendWindow) continue;

    if (classifyTrend(window, result.durationMs) === "up") {
      regressed.add(result.label);
    }
  }

  return regressed;
}
