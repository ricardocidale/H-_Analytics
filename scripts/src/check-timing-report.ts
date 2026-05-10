/**
 * check-timing-report.ts
 *
 * Prints the last N runs from `.cache/check-timing.jsonl` in a readable table,
 * with trend indicators (↑ ↓ →) per check column derived from the same p75
 * regression logic used by check-selective.ts, followed by a per-check summary
 * with p50/p95 durations, trend direction, and a list of checks that have been
 * slow in the last 10 runs.
 *
 * Usage:
 *   pnpm run check:timing-report           # last 10 runs + full summary
 *   pnpm run check:timing-report -- --n=20 # last 20 runs
 *   pnpm run check:timing-report -- --slow # show only runs with at least one slow check
 *   pnpm run check:timing-report -- --summary-only # skip the run table, just show summary
 *
 * Env vars:
 *   CHECK_TREND_WINDOW=<integer ≥ 2>   number of prior runs used as the p75
 *                                      baseline (default 5, same as check-selective)
 */

import fs from "node:fs";
import path from "node:path";

import { WORKSPACE_ROOT } from "./lib/check-cache.js";
import { classifyTrend, p75, trendArrow, TrendDirection } from "./lib/check-trend.js";

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
const summaryOnly = args.includes("--summary-only");

/**
 * Number of prior runs used as the baseline window for p75 regression detection.
 * Override with CHECK_TREND_WINDOW=<integer ≥ 2>.  Matches the default in
 * check-selective.ts so both scripts agree on what "regression" means.
 */
const TREND_WINDOW = (() => {
  const raw = process.env.CHECK_TREND_WINDOW;
  if (raw !== undefined) {
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed >= 2) return parsed;
  }
  return 5;
})();

/**
 * Number of runs used as the window when comparing older vs newer halves for
 * the per-check p50/p95 summary trend direction.
 */
const SUMMARY_TREND_WINDOW = 20;

/** Number of recent runs inspected for the "slow in last N" column. */
const SLOW_LOOKBACK = 10;

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

/** Compute percentile value from a sorted array of numbers. */
function percentile(sorted: number[], pct: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const idx = (pct / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const weight = idx - lo;
  return (sorted[lo]! * (1 - weight)) + (sorted[hi]! * weight);
}

/** Average of a numeric array; returns 0 for empty arrays. */
function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// ---------------------------------------------------------------------------
// Per-check p50/p95/trend/slow summary
// ---------------------------------------------------------------------------

type TrendDir = "↓ faster" | "↑ slower" | "→ stable";

interface CheckSummary {
  label: string;
  p50Ms: number;
  p95Ms: number;
  trend: TrendDir;
  trendDeltaMs: number;
  slowInLast10: number;
  totalSamples: number;
}

function buildSummary(all: TimingRecord[]): CheckSummary[] {
  // Collect all unique labels across history.
  const labelSet = new Set<string>();
  for (const rec of all) {
    for (const c of rec.checks) labelSet.add(c.label);
  }

  const summaries: CheckSummary[] = [];

  for (const label of [...labelSet].sort()) {
    // All duration samples for this check (chronological, oldest first).
    const allDurations = all
      .flatMap((r) => r.checks.filter((c) => c.label === label).map((c) => c.durationMs));

    if (allDurations.length === 0) continue;

    const sorted = [...allDurations].sort((a, b) => a - b);
    const p50Ms = percentile(sorted, 50);
    const p95Ms = percentile(sorted, 95);

    // Trend: compare average of older half vs newer half of the last SUMMARY_TREND_WINDOW runs.
    const window = all.slice(-SUMMARY_TREND_WINDOW);
    const windowDurations = window
      .flatMap((r) => r.checks.filter((c) => c.label === label).map((c) => c.durationMs));

    let trend: TrendDir = "→ stable";
    let trendDeltaMs = 0;

    if (windowDurations.length >= 4) {
      const half = Math.floor(windowDurations.length / 2);
      const older = windowDurations.slice(0, half);
      const newer = windowDurations.slice(-half);
      const delta = avg(newer) - avg(older);
      trendDeltaMs = Math.round(delta);

      // Require at least 10 % change and 500 ms absolute to call it a trend.
      const oldAvg = avg(older);
      const relChange = oldAvg > 0 ? delta / oldAvg : 0;
      if (Math.abs(delta) >= 500 && Math.abs(relChange) >= 0.1) {
        trend = delta > 0 ? "↑ slower" : "↓ faster";
      }
    }

    // Slow-in-last-10: count runs in the last SLOW_LOOKBACK where this check was slow.
    const last10 = all.slice(-SLOW_LOOKBACK);
    const slowInLast10 = last10.filter((r) =>
      r.checks.some((c) => c.label === label && c.slow),
    ).length;

    summaries.push({
      label,
      p50Ms,
      p95Ms,
      trend,
      trendDeltaMs,
      slowInLast10,
      totalSamples: allDurations.length,
    });
  }

  return summaries;
}

// ---------------------------------------------------------------------------
// p75 trend computation (matches check-selective.ts logic)
// ---------------------------------------------------------------------------

/**
 * For each label, compute the trend of its most recent successful run vs the
 * p75 of its prior TREND_WINDOW successful runs, using ALL records in the file
 * (not just the N displayed).  This gives the same answer as check-selective.ts
 * produces at run time.
 *
 * Returns "unknown" for any label that doesn't have enough history.
 */
function computeLabelTrends(
  allRecords: TimingRecord[],
  labels: string[],
): Map<string, TrendDirection> {
  const result = new Map<string, TrendDirection>();

  for (const label of labels) {
    // Collect all passing durations for this label in chronological order.
    const durations: number[] = [];
    for (const rec of allRecords) {
      const entry = rec.checks.find((c) => c.label === label && c.exitCode === 0);
      if (entry) durations.push(entry.durationMs);
    }

    // Need at least TREND_WINDOW prior runs + 1 current run.
    if (durations.length <= TREND_WINDOW) {
      result.set(label, "unknown");
      continue;
    }

    const current = durations[durations.length - 1]!;
    // The prior window is the TREND_WINDOW data points immediately before the last.
    const prior = durations.slice(-(TREND_WINDOW + 1), -1);

    result.set(label, classifyTrend(prior, current));
  }

  return result;
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

  // ---------------------------------------------------------------------------
  // Run table (skip when --summary-only)
  // ---------------------------------------------------------------------------

  if (!summaryOnly) {
    let records = slowOnly ? all.filter((r) => r.checks.some((c) => c.slow)) : all;
    records = records.slice(-N);

    if (records.length === 0) {
      console.log(`No runs match the filter (--slow) in ${all.length} total run(s).`);
    } else {
      // Collect all unique labels seen across filtered records.
      const labelSet = new Set<string>();
      for (const rec of records) {
        for (const c of rec.checks) labelSet.add(c.label);
      }
      const labels = [...labelSet].sort();

      // Compute trend directions using the full history.
      const trends = computeLabelTrends(all, labels);

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
      console.log(`Trend window: last ${TREND_WINDOW} prior runs (CHECK_TREND_WINDOW)  ↑ regression >20%  ↓ improved >20%  → stable  ? insufficient history`);
      console.log("");
      console.log(headerCols.join(" | "));
      console.log(divider);

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

      // Trend row — one arrow per check column, aligned with the column headers.
      const trendCells = labels.map((l) => {
        const dir = trends.get(l) ?? "unknown";
        return pad(trendArrow(dir), LABEL_W, true);
      });

      const trendRowCols = [
        pad("Trend", TS_W),
        pad("", STATUS_W),
        pad("", TOTAL_W, true),
        ...trendCells,
      ];

      console.log(divider);
      console.log(trendRowCols.join(" | "));
      console.log(divider);

      // -----------------------------------------------------------------------
      // Regression summary
      // -----------------------------------------------------------------------

      const regressedLabels = labels.filter((l) => trends.get(l) === "up");
      const improvedLabels  = labels.filter((l) => trends.get(l) === "down");

      if (regressedLabels.length > 0 || improvedLabels.length > 0) {
        console.log("");
        console.log(`Trend summary (p75 of last ${TREND_WINDOW} runs vs most recent run):`);

        if (regressedLabels.length > 0) {
          console.log("  ↑ Regressing (>20% slower than p75 baseline):");
          for (const label of regressedLabels) {
            const durations: number[] = [];
            for (const rec of all) {
              const entry = rec.checks.find((c) => c.label === label && c.exitCode === 0);
              if (entry) durations.push(entry.durationMs);
            }
            const current = durations[durations.length - 1]!;
            const prior = durations.slice(-(TREND_WINDOW + 1), -1);
            const baseline = p75(prior);
            const pct = Math.round(((current - baseline) / baseline) * 100);
            console.log(
              `    ${label.padEnd(LABEL_W)}  latest ${formatMs(current).padStart(6)}  p75 baseline ${formatMs(baseline).padStart(6)}  +${pct}%`,
            );
          }
        }

        if (improvedLabels.length > 0) {
          console.log("  ↓ Improving (>20% faster than p75 baseline):");
          for (const label of improvedLabels) {
            const durations: number[] = [];
            for (const rec of all) {
              const entry = rec.checks.find((c) => c.label === label && c.exitCode === 0);
              if (entry) durations.push(entry.durationMs);
            }
            const current = durations[durations.length - 1]!;
            const prior = durations.slice(-(TREND_WINDOW + 1), -1);
            const baseline = p75(prior);
            const pct = Math.round(((baseline - current) / baseline) * 100);
            console.log(
              `    ${label.padEnd(LABEL_W)}  latest ${formatMs(current).padStart(6)}  p75 baseline ${formatMs(baseline).padStart(6)}  -${pct}%`,
            );
          }
        }
      }

      // -----------------------------------------------------------------------
      // Slowest-check callout (across the displayed records)
      // -----------------------------------------------------------------------

      const allEntries: CheckEntry[] = records.flatMap((r) => r.checks);
      const slowEntries = allEntries.filter((e) => e.slow);

      if (slowEntries.length > 0) {
        const maxByLabel: Record<string, number> = {};
        for (const e of slowEntries) {
          maxByLabel[e.label] = Math.max(maxByLabel[e.label] ?? 0, e.durationMs);
        }
        const sorted = Object.entries(maxByLabel).sort((a, b) => b[1] - a[1]);

        console.log("");
        console.log("Slowest checks (⚠ = exceeded threshold at least once in this view):");
        for (const [label, maxMs] of sorted) {
          const count = slowEntries.filter((e) => e.label === label).length;
          console.log(
            `  ${label.padEnd(LABEL_W)}  max ${formatMs(maxMs).padStart(6)}  slow in ${count}/${records.length} run(s)`,
          );
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Per-check summary: p50 / p95 / trend / slow-in-last-10
  // ---------------------------------------------------------------------------

  const summaries = buildSummary(all);

  if (summaries.length === 0) {
    console.log("");
    console.log("No per-check data available for summary.");
    return;
  }

  const SUM_LABEL_W = 26;
  const COL_W = 8;
  const TREND_W = 12;
  const SLOW_W = 14;

  const hdr = [
    pad("Check", SUM_LABEL_W),
    pad("p50", COL_W, true),
    pad("p95", COL_W, true),
    pad("Trend", TREND_W, true),
    pad("Slow/last10", SLOW_W, true),
    pad("Samples", COL_W, true),
  ];
  const sumDivider = hdr.map((c) => "-".repeat(c.length)).join("-+-");

  console.log("");
  console.log(`Per-check summary (all ${all.length} run(s) in history, trend window: last ${SUMMARY_TREND_WINDOW})`);
  console.log(hdr.join(" | "));
  console.log(sumDivider);

  for (const s of summaries) {
    const trendCell = s.trend === "→ stable"
      ? pad(s.trend, TREND_W, true)
      : pad(
          `${s.trend} ${s.trendDeltaMs > 0 ? "+" : ""}${formatMs(Math.abs(s.trendDeltaMs))}`,
          TREND_W,
          true,
        );

    const slowCell = s.slowInLast10 > 0
      ? pad(`${s.slowInLast10}/${Math.min(SLOW_LOOKBACK, all.length)} ⚠`, SLOW_W, true)
      : pad(`${s.slowInLast10}/${Math.min(SLOW_LOOKBACK, all.length)}`, SLOW_W, true);

    const row = [
      pad(s.label.slice(0, SUM_LABEL_W), SUM_LABEL_W),
      pad(formatMs(s.p50Ms), COL_W, true),
      pad(formatMs(s.p95Ms), COL_W, true),
      trendCell,
      slowCell,
      pad(String(s.totalSamples), COL_W, true),
    ];

    console.log(row.join(" | "));
  }

  console.log(sumDivider);

  // Highlight any checks that have been perennially slow.
  const perenniallySlow = summaries.filter(
    (s) => s.slowInLast10 >= Math.min(3, all.length),
  );
  if (perenniallySlow.length > 0) {
    console.log("");
    console.log("Checks slow in 3+ of the last 10 runs — worth investigating:");
    for (const s of perenniallySlow) {
      console.log(
        `  ${s.label.padEnd(SUM_LABEL_W)}  p50 ${formatMs(s.p50Ms).padStart(6)}  p95 ${formatMs(s.p95Ms).padStart(6)}  ${s.trend}`,
      );
    }
  }

  // Highlight degrading checks.
  const degrading = summaries.filter((s) => s.trend === "↑ slower");
  if (degrading.length > 0) {
    console.log("");
    console.log("Checks trending slower over the last 20 runs:");
    for (const s of degrading) {
      console.log(
        `  ${s.label.padEnd(SUM_LABEL_W)}  avg +${formatMs(s.trendDeltaMs)} vs prior window  p95 ${formatMs(s.p95Ms)}`,
      );
    }
  }

  console.log("");
}

main();
