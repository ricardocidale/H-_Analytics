/**
 * check-selective.ts
 *
 * Selective check driver for `pnpm run check`.
 *
 * Instead of running ALL checks in parallel when the composite cache misses,
 * this driver pre-probes each individual check's input hash and only spawns
 * processes for checks whose inputs have actually changed since the last
 * successful run.  Unchanged checks are skipped immediately with a one-line
 * "cached" message — no process is spawned at all.  Stale checks are run in
 * parallel, preserving the concurrency of the old `check:core` script.
 *
 * HOW IT FITS INTO THE PIPELINE
 *   pnpm run check
 *     = check:all-cached                          (composite fast-path: all green → skip)
 *     || { check:selective && check:all-cached:write }
 *
 * INPUT COVERAGE
 *   Each individual check script exports a `collectInputFiles()` function.
 *   This driver imports those functions directly — there is no duplicated
 *   input-collection logic here.  Any change to a check script's input set
 *   automatically flows through to the selective driver; drift is structurally
 *   impossible.
 *
 * TYPECHECK
 *   `typecheck` now has a check-cache.ts-managed hash (via check-typecheck.ts).
 *   Its inputs are all TS/TSX source files plus every tsconfig*.json in the
 *   workspace.  When those are unchanged, the typecheck step is skipped without
 *   spawning tsc at all.  On a miss, `pnpm run check:typecheck` runs — which
 *   invokes `pnpm run typecheck` and writes the cache on success.
 *
 * OUTPUT FORMAT
 *   [skip]  check:<name>  — inputs unchanged, skipping
 *   [run]   check:<name>  — inputs changed, running
 *   [pass]  check:<name>  completed in X.Xs        (or Xs for ≥10 s; "⚠ slow" if ≥ threshold; "⚠ regression" if trending up)
 *   [fail]  check:<name>  FAILED (exit N) after Xs (same duration format + slow flag)
 *   [done]  N/M checks ran fresh, M-N cached — all passed in Xs.
 *
 * SLOW THRESHOLD
 *   Checks taking longer than CHECK_SLOW_THRESHOLD_S seconds (default 10) are
 *   flagged with "⚠ slow" on their [pass]/[fail] line and counted in [done].
 *
 * REGRESSION DETECTION
 *   After each run the script compares each check's current duration against
 *   the p75 duration of its last CHECK_TREND_WINDOW runs (default 5).  When
 *   the current duration exceeds that baseline by more than REGRESSION_THRESHOLD
 *   the check is flagged with "⚠ regression".  At least CHECK_TREND_WINDOW
 *   prior runs must exist for a check before the flag is emitted (no false
 *   positives on sparse history).
 *
 * REGRESSION GATE
 *   Set CHECK_REGRESSION_FAIL=1 to promote regression warnings into a hard
 *   build failure (exit code 2).  When any check regresses and this flag is
 *   set, the driver prints a detailed trend summary and exits non-zero so CI
 *   catches creeping slowness rather than merely warning about it.  The
 *   regression threshold and window remain configurable via
 *   CHECK_TREND_WINDOW and the REGRESSION_THRESHOLD constant in check-trend.ts.
 *
 * REGRESSION GATE
 *   Set CHECK_REGRESSION_FAIL=1 to promote regression warnings into a hard
 *   build failure (exit code 2).  When any check regresses and this flag is
 *   set, the driver prints a detailed trend summary and exits non-zero so CI
 *   catches creeping slowness rather than merely warning about it.  The
 *   regression threshold and window remain configurable via
 *   CHECK_TREND_WINDOW and the REGRESSION_THRESHOLD constant in check-trend.ts.
 *
 * BYPASS
 *   CHECK_CACHE_DISABLED=1 — treat every check as stale (same as the
 *   individual checks honour this flag).
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  computeInputsHash,
  WORKSPACE_ROOT,
} from "./lib/check-cache.js";
import { REGRESSION_THRESHOLD } from "./lib/check-trend.js";
import {
  computeRegressions,
  TIMING_FILE,
  TimingRecord,
} from "./lib/check-timing.js";

// Per-check input-collection functions — imported directly from each check
// script so drift between this driver and the individual checks is structurally
// impossible.  Any change to a check script's collectInputFiles() automatically
// flows through here without any manual mirror update.
import { collectInputFiles as collectInputFiles_lint } from "./check-lint.js";
import { collectInputFiles as collectInputFiles_lintLibs } from "./check-lint-libs.js";
import { collectInputFiles as collectInputFiles_typecheck } from "./check-typecheck.js";
import { collectInputFiles as collectInputFiles_magicNumbers } from "./check-magic-numbers.js";
import { collectInputFiles as collectInputFiles_replitIndependence } from "./check-replit-independence.js";
import { collectInputFiles as collectInputFiles_migrationGuards } from "./check-migration-guards.js";
import { collectInputFiles as collectInputFiles_spinnerContrast } from "./check-spinner-contrast.js";
import { collectInputFiles as collectInputFiles_productionImage } from "./check-production-image.js";
import { collectInputFiles as collectInputFiles_typesMirror } from "./check-types-mirror.js";
import { collectInputFiles as collectInputFiles_schemaDrift } from "./check-schema-drift.js";
import { collectInputFiles as collectInputFiles_directRunGuards } from "./check-direct-run-guards.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CACHE_DIR = path.join(WORKSPACE_ROOT, ".cache");

/**
 * Slow-check threshold in ms.  Override with CHECK_SLOW_THRESHOLD_S=<seconds>.
 * Any check that takes longer than this will be flagged in the summary.
 */
const SLOW_THRESHOLD_MS = (() => {
  const raw = process.env.CHECK_SLOW_THRESHOLD_S;
  if (raw !== undefined) {
    const parsed = parseFloat(raw);
    if (!isNaN(parsed) && parsed > 0) return parsed * 1000;
  }
  return 10_000; // default: 10 s
})();

/**
 * Number of prior runs used as the baseline window for regression detection.
 * Override with CHECK_TREND_WINDOW=<integer ≥ 2>.
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
 * When true, any detected regression causes a non-zero exit (code 2) so CI
 * catches creeping slowness as a hard failure rather than an advisory warning.
 * Enable by setting CHECK_REGRESSION_FAIL=1 in the environment.
 */
const REGRESSION_FAIL = process.env.CHECK_REGRESSION_FAIL === "1";

/**
 * Return a human-friendly duration string.
 *  < 10 s  → one decimal place ("3.2s")
 *  >= 10 s → whole seconds    ("12s")
 */
function formatDuration(ms: number): string {
  const secs = ms / 1000;
  if (secs < 10) return `${secs.toFixed(1)}s`;
  return `${Math.round(secs)}s`;
}

function readStoredHash(name: string): string | null {
  try {
    return fs.readFileSync(path.join(CACHE_DIR, `check-${name}.hash`), "utf8").trim() || null;
  } catch {
    return null;
  }
}

function isStale(name: string, freshHash: string): boolean {
  if (process.env.CHECK_CACHE_DISABLED === "1") return true;
  return readStoredHash(name) !== freshHash;
}

// ---------------------------------------------------------------------------
// Check registry
// ---------------------------------------------------------------------------

interface CheckSpec {
  /** Cache name — matches the key used by the individual check (check-<name>.hash). */
  name: string;
  /** Human-readable label used in log output. */
  label: string;
  /** Root package.json script to run when stale. */
  rootScript: string;
  /** Collect the full list of input file paths for this check. */
  collectInputs: () => string[];
  /** Optional extra string folded into the hash (e.g. CLI args). */
  extra?: string;
}

const SCRIPT_CHECKS: CheckSpec[] = [
  {
    name: "lint",
    label: "lint",
    rootScript: "check:lint",
    collectInputs: collectInputFiles_lint,
  },
  {
    name: "lint-libs",
    label: "lint:libs",
    rootScript: "check:lint:libs",
    collectInputs: collectInputFiles_lintLibs,
  },
  {
    name: "typecheck",
    label: "typecheck",
    rootScript: "check:typecheck",
    collectInputs: collectInputFiles_typecheck,
  },
  {
    name: "magic-numbers",
    label: "magic-numbers",
    rootScript: "check:magic-numbers",
    collectInputs: collectInputFiles_magicNumbers,
    extra: "threshold=4",
  },
  {
    name: "replit-independence",
    label: "replit-independence",
    rootScript: "check:replit-independence",
    collectInputs: collectInputFiles_replitIndependence,
  },
  {
    name: "migration-guards",
    label: "migration-guards",
    rootScript: "check:migration-guards",
    // check-migration-guards.ts also carries its own tryCacheHit/writeCacheHit
    // wrapper, so a warm run skips the real work even when spawned directly
    // (i.e. outside the selective driver).
    collectInputs: collectInputFiles_migrationGuards,
  },
  {
    name: "spinner-contrast",
    label: "spinner-contrast",
    rootScript: "check:spinner-contrast",
    collectInputs: collectInputFiles_spinnerContrast,
  },
  {
    name: "production-image",
    label: "production-image",
    rootScript: "check:production-image",
    collectInputs: collectInputFiles_productionImage,
  },
  {
    name: "types-mirror",
    label: "types-mirror",
    rootScript: "check:types-mirror",
    collectInputs: collectInputFiles_typesMirror,
  },
  {
    name: "schema-drift",
    label: "schema-drift",
    rootScript: "check:schema-drift",
    collectInputs: collectInputFiles_schemaDrift,
  },
  {
    name: "direct-run-guards",
    label: "direct-run-guards",
    rootScript: "check:direct-run-guards",
    collectInputs: collectInputFiles_directRunGuards,
  },
];

// ---------------------------------------------------------------------------
// Timing history
// ---------------------------------------------------------------------------

/**
 * Maximum number of timing records to keep in the history file.
 * Override with CHECK_TIMING_HISTORY_MAX=<n>.  Default: 500.
 */
const TIMING_HISTORY_MAX = (() => {
  const raw = process.env.CHECK_TIMING_HISTORY_MAX;
  if (raw !== undefined) {
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 500;
})();


function appendTimingRecord({
  wallMs,
  results,
  passed,
}: {
  wallMs: number;
  results: RunResult[];
  passed: boolean;
}): void {
  const record: TimingRecord = {
    ts: new Date().toISOString(),
    totalMs: wallMs,
    passed,
    checks: results
      .filter((r) => !r.killed)
      .map((r) => ({
        label: r.label,
        durationMs: r.durationMs,
        slow: r.durationMs >= SLOW_THRESHOLD_MS,
        exitCode: r.exitCode,
      })),
  };

  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.appendFileSync(TIMING_FILE, JSON.stringify(record) + "\n", "utf8");

    // Compact: keep only the last TIMING_HISTORY_MAX lines so the file
    // doesn't grow unboundedly over months of CI runs.
    const raw = fs.readFileSync(TIMING_FILE, "utf8");
    const lines = raw.split("\n").filter((l) => l.trim() !== "");
    if (lines.length > TIMING_HISTORY_MAX) {
      const trimmed = lines.slice(lines.length - TIMING_HISTORY_MAX).join("\n") + "\n";
      fs.writeFileSync(TIMING_FILE, trimmed, "utf8");
    }
  } catch {
    // Non-fatal: timing history is best-effort.
  }
}

// ---------------------------------------------------------------------------
// Probe: compute fresh hash and compare to stored
// ---------------------------------------------------------------------------

interface ProbeResult {
  spec: CheckSpec;
  freshHash: string;
  stale: boolean;
}

function probeAll(): ProbeResult[] {
  return SCRIPT_CHECKS.map((spec) => {
    const freshHash = computeInputsHash({
      files: spec.collectInputs(),
      extra: spec.extra,
    });
    return { spec, freshHash, stale: isStale(spec.name, freshHash) };
  });
}

// ---------------------------------------------------------------------------
// Run a single check as a child process, streaming its output
// ---------------------------------------------------------------------------

interface RunResult {
  label: string;
  exitCode: number;
  durationMs: number;
  /** True when the process was killed because another check failed first. */
  killed?: boolean;
}

/**
 * Run one check as a child process, streaming its output.
 * If `signal` is already aborted when the process starts, or aborts while the
 * process is running, the child receives SIGTERM (then SIGKILL after 3 s).
 */
function runCheck(
  rootScript: string,
  label: string,
  signal: AbortSignal,
): Promise<RunResult> {
  return new Promise((resolve) => {
    const start = Date.now();

    if (signal.aborted) {
      resolve({ label, exitCode: 130, durationMs: 0, killed: true });
      return;
    }

    const child = spawn(
      "pnpm",
      ["run", rootScript],
      {
        cwd: WORKSPACE_ROOT,
        stdio: "inherit",
        shell: false,
        env: process.env,
      },
    );

    let killedBySignal = false;

    function killChild(): void {
      killedBySignal = true;
      child.kill("SIGTERM");
      // Escalate to SIGKILL after 3 s if the process hasn't exited.
      setTimeout(() => {
        try { child.kill("SIGKILL"); } catch { /* already gone */ }
      }, 3000).unref();
    }

    signal.addEventListener("abort", killChild, { once: true });

    child.on("close", (code) => {
      signal.removeEventListener("abort", killChild);
      resolve({
        label,
        exitCode: code ?? 1,
        durationMs: Date.now() - start,
        killed: killedBySignal,
      });
    });

    child.on("error", (err) => {
      signal.removeEventListener("abort", killChild);
      console.error(`[check-selective] failed to spawn ${label}: ${err.message}`);
      resolve({ label, exitCode: 1, durationMs: Date.now() - start });
    });
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const wallStart = Date.now();

  // 1. Probe all script-based checks.
  const probes = probeAll();

  const stale = probes.filter((p) => p.stale);
  const cached = probes.filter((p) => !p.stale);

  // 2. Report cached checks immediately.
  for (const p of cached) {
    console.log(`[skip]  check:${p.spec.label.padEnd(22)} inputs unchanged`);
  }

  // 3. Report which checks will run.
  const toRun: Array<{ rootScript: string; label: string }> = [];

  for (const p of stale) {
    console.log(`[run]   check:${p.spec.label.padEnd(22)} inputs changed`);
    toRun.push({ rootScript: p.spec.rootScript, label: p.spec.label });
  }

  if (toRun.length === 0) {
    appendTimingRecord({ wallMs: Date.now() - wallStart, results: [], passed: true });
    console.log("[done]  all checks cached — nothing to run");
    process.exit(0);
  }

  console.log("");

  // 4. Run stale checks in parallel with fail-fast cancellation.
  // When any check fails, an AbortController signals siblings to terminate,
  // matching the behaviour of the old `concurrently --kill-others-on-fail`.
  const controller = new AbortController();
  const { signal } = controller;

  // Track first failure so we can abort siblings immediately.
  let firstFailure: RunResult | null = null;

  const promises = toRun.map(({ rootScript, label }) =>
    runCheck(rootScript, label, signal).then((result) => {
      if (result.exitCode !== 0 && !result.killed) {
        if (!firstFailure) {
          firstFailure = result;
          controller.abort();
        }
      }
      return result;
    }),
  );

  const results = await Promise.all(promises);

  console.log("");

  // 5. Compute summary metrics.
  const wallMs = Date.now() - wallStart;
  const actualFailures = results.filter((r) => r.exitCode !== 0 && !r.killed);
  const killed = results.filter((r) => r.killed);
  const passes = results
    .filter((r) => r.exitCode === 0)
    .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0));
  const actualFailuresSorted = actualFailures
    .slice()
    .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0));

  // Count all non-killed checks that exceeded the threshold (passes + failures).
  const slowChecks = results.filter((r) => !r.killed && r.durationMs >= SLOW_THRESHOLD_MS);

  const ranCount = toRun.length;
  const skippedCount = cached.length;
  const totalCount = SCRIPT_CHECKS.length + 1; // +1 for typecheck

  // 6. Persist timing history, then detect regressions against prior runs.
  appendTimingRecord({
    wallMs,
    results,
    passed: actualFailures.length === 0,
  });

  const regressed = computeRegressions(results, TREND_WINDOW);

  // 7. Print per-check outcome lines (after regression data is available).
  for (const r of passes) {
    const dur = formatDuration(r.durationMs);
    const slowTag = r.durationMs >= SLOW_THRESHOLD_MS ? "  ⚠ slow" : "";
    const regressionTag = regressed.has(r.label) ? "  ⚠ regression" : "";
    console.log(`[pass]  check:${r.label.padEnd(22)} completed in ${dur}${slowTag}${regressionTag}`);
  }
  for (const r of actualFailuresSorted) {
    const dur = formatDuration(r.durationMs);
    const slowTag = r.durationMs >= SLOW_THRESHOLD_MS ? "  ⚠ slow" : "";
    console.error(`[fail]  check:${r.label.padEnd(22)} FAILED (exit ${r.exitCode}) after ${dur}${slowTag}`);
  }
  for (const r of killed) {
    console.error(`[kill]  check:${r.label.padEnd(22)} terminated (another check failed)`);
  }

  console.log("");

  if (actualFailures.length === 0) {
    const thresholdPct = Math.round(REGRESSION_THRESHOLD * 100);
    const slowNote = slowChecks.length > 0
      ? `, ${slowChecks.length} slow (≥${formatDuration(SLOW_THRESHOLD_MS)})`
      : "";
    const regressionNote = regressed.size > 0
      ? `, ${regressed.size} regression${regressed.size > 1 ? "s" : ""} (>${thresholdPct}% slower than p75 of last ${TREND_WINDOW} runs)`
      : "";
    console.log(
      `[done]  ${ranCount}/${totalCount} checks ran fresh` +
        (skippedCount > 0 ? `, ${skippedCount} skipped (cached)` : "") +
        `${slowNote}${regressionNote} — all passed in ${formatDuration(wallMs)}.`,
    );

    // Regression gate: exit non-zero when CHECK_REGRESSION_FAIL=1 and any
    // check regressed.  Exit code 2 distinguishes a regression failure from a
    // normal check failure (exit 1).
    if (REGRESSION_FAIL && regressed.size > 0) {
      console.error("");
      console.error(
        `[regression-gate]  CHECK_REGRESSION_FAIL=1 — ${regressed.size} regression${regressed.size > 1 ? "s" : ""} detected`,
      );
      console.error(
        `[regression-gate]  Threshold: >${thresholdPct}%  Window: last ${TREND_WINDOW} successful runs`,
      );
      console.error("");

      // Print one line per regressed check, sorted alphabetically.
      const sorted = [...regressed].sort();
      for (const label of sorted) {
        console.error(`[regression-gate]  check:${label}`);
      }

      console.error("");
      console.error(
        "[regression-gate]  To suppress this gate: unset CHECK_REGRESSION_FAIL or set it to 0.",
      );
      process.exit(2);
    }

    process.exit(0);
  } else {
    console.error(
      `[done]  ${actualFailures.length} check(s) failed` +
        (skippedCount > 0 ? ` (${skippedCount} cached checks were skipped)` : "") +
        ` — total ${formatDuration(wallMs)}.`,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[check-selective] unexpected error:", err);
  process.exit(1);
});
