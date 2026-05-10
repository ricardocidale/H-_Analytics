/**
 * check-timing-report.ts
 *
 * Prints the last N runs from `.cache/check-timing.jsonl` in a readable table.
 *
 * Usage:
 *   pnpm run check:timing-report           # last 10 runs
 *   pnpm run check:timing-report -- --n=20 # last 20 runs
 *   pnpm run check:timing-report -- --slow # show only runs with at least one slow check
 */

import fs from "node:fs";
import path from "node:path";

import { WORKSPACE_ROOT } from "./lib/check-cache.js";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

function getArgValue(flag: string): string | undefined {
  for (const a of args) {
    if (a.startsWith(`${flag}=`)) return a.slice(flag.length + 1);
    if (a === flag) {
      const idx = args.indexOf(a);
      return args[idx + 1];
    }
  }
  return undefined;
}

const rawN = getArgValue("--n") ?? getArgValue("-n");
const N = rawN !== undefined ? Math.max(1, parseInt(rawN, 10)) : 10;
const slowOnly = args.includes("--slow");

// ---------------------------------------------------------------------------
// Types (mirror of the record written by check-selective.ts)
// ---------------------------------------------------------------------------

interface CheckEntry {
  label: string;
  durationMs: number;
  slow: boolean;
  exitCode: number;
}

interface TimingRecord {
  ts: string;
  totalMs: number;
  passed: boolean;
  checks: CheckEntry[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TIMING_FILE = path.join(WORKSPACE_ROOT, ".cache", "check-timing.jsonl");

function loadRecords(): TimingRecord[] {
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

function formatMs(ms: number): string {
  const secs = ms / 1000;
  if (secs < 10) return `${secs.toFixed(1)}s`;
  return `${Math.round(secs)}s`;
}

function formatTs(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date} ${time}`;
}

function pad(s: string, width: number, right = false): string {
  if (right) return s.padStart(width);
  return s.padEnd(width);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const all = loadRecords();

  if (all.length === 0) {
    console.log(`No timing history found at ${TIMING_FILE}.`);
    console.log("Run `pnpm run check:selective` at least once to generate data.");
    process.exit(0);
  }

  let records = slowOnly ? all.filter((r) => r.checks.some((c) => c.slow)) : all;
  records = records.slice(-N);

  if (records.length === 0) {
    console.log(`No runs match the filter (--slow) in ${all.length} total run(s).`);
    process.exit(0);
  }

  // Collect all unique labels seen across filtered records.
  const labelSet = new Set<string>();
  for (const rec of records) {
    for (const c of rec.checks) labelSet.add(c.label);
  }
  const labels = [...labelSet].sort();

  // ---------------------------------------------------------------------------
  // Header
  // ---------------------------------------------------------------------------

  const LABEL_W = 22;
  const DUR_W = 7;
  const TS_W = 15;
  const TOTAL_W = 8;
  const STATUS_W = 7;

  const headerCols = [
    pad("Timestamp", TS_W),
    pad("Status", STATUS_W),
    pad("Total", TOTAL_W, true),
    ...labels.map((l) => pad(l.slice(0, LABEL_W), LABEL_W, true)),
  ];

  const divider = headerCols.map((c) => "-".repeat(c.length)).join("-+-");

  console.log("");
  console.log(
    `Check timing history — last ${records.length} run(s)${slowOnly ? " with slow checks" : ""}` +
      ` (of ${all.length} total)`,
  );
  console.log(`File: ${TIMING_FILE}`);
  console.log("");
  console.log(headerCols.join(" | "));
  console.log(divider);

  // ---------------------------------------------------------------------------
  // Rows
  // ---------------------------------------------------------------------------

  for (const rec of records) {
    const byLabel: Record<string, CheckEntry> = {};
    for (const c of rec.checks) byLabel[c.label] = c;

    const status = rec.passed ? "pass" : "FAIL";
    const statusCell = pad(status, STATUS_W);

    const checkCells = labels.map((l) => {
      const entry = byLabel[l];
      if (!entry) return pad("—", LABEL_W, true);
      const dur = formatMs(entry.durationMs).padStart(DUR_W);
      const tag = entry.slow ? " ⚠" : "  ";
      return pad(`${dur}${tag}`, LABEL_W, true);
    });

    const cols = [
      pad(formatTs(rec.ts), TS_W),
      statusCell,
      pad(formatMs(rec.totalMs), TOTAL_W, true),
      ...checkCells,
    ];

    console.log(cols.join(" | "));
  }

  console.log(divider);

  // ---------------------------------------------------------------------------
  // Slowest-check summary (across the displayed records)
  // ---------------------------------------------------------------------------

  const allEntries: CheckEntry[] = records.flatMap((r) => r.checks);
  const slowEntries = allEntries.filter((e) => e.slow);

  if (slowEntries.length > 0) {
    // Aggregate per label: max duration seen.
    const maxByLabel: Record<string, number> = {};
    for (const e of slowEntries) {
      maxByLabel[e.label] = Math.max(maxByLabel[e.label] ?? 0, e.durationMs);
    }
    const sorted = Object.entries(maxByLabel).sort((a, b) => b[1] - a[1]);

    console.log("");
    console.log("Slowest checks (⚠ = exceeded threshold at least once):");
    for (const [label, maxMs] of sorted) {
      const count = slowEntries.filter((e) => e.label === label).length;
      console.log(
        `  ${label.padEnd(LABEL_W)}  max ${formatMs(maxMs).padStart(6)}  slow in ${count}/${records.length} run(s)`,
      );
    }
  }

  console.log("");
}

main();
