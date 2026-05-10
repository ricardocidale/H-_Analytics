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
 *   [pass]  check:<name>  completed in X.Xs        (or Xs for ≥10 s; "⚠ slow" if ≥ threshold)
 *   [fail]  check:<name>  FAILED (exit N) after Xs (same duration format + slow flag)
 *   [done]  N/M checks ran fresh, M-N cached — all passed in Xs.
 *
 * SLOW THRESHOLD
 *   Checks taking longer than CHECK_SLOW_THRESHOLD_S seconds (default 10) are
 *   flagged with "⚠ slow" on their [pass]/[fail] line and counted in [done].
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
];

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

  // 5. Summary.
  const wallMs = Date.now() - wallStart;
  const actualFailures = results.filter((r) => r.exitCode !== 0 && !r.killed);
  const killed = results.filter((r) => r.killed);
  const passes = results.filter((r) => r.exitCode === 0);

  for (const r of passes) {
    const dur = formatDuration(r.durationMs);
    const slowTag = r.durationMs >= SLOW_THRESHOLD_MS ? "  ⚠ slow" : "";
    console.log(`[pass]  check:${r.label.padEnd(22)} completed in ${dur}${slowTag}`);
  }
  for (const r of actualFailures) {
    const dur = formatDuration(r.durationMs);
    const slowTag = r.durationMs >= SLOW_THRESHOLD_MS ? "  ⚠ slow" : "";
    console.error(`[fail]  check:${r.label.padEnd(22)} FAILED (exit ${r.exitCode}) after ${dur}${slowTag}`);
  }
  for (const r of killed) {
    console.error(`[kill]  check:${r.label.padEnd(22)} terminated (another check failed)`);
  }

  // Count all non-killed checks that exceeded the threshold (passes + failures).
  const slowChecks = results.filter((r) => !r.killed && r.durationMs >= SLOW_THRESHOLD_MS);

  console.log("");
  const ranCount = toRun.length;
  const skippedCount = cached.length;
  const totalCount = SCRIPT_CHECKS.length + 1; // +1 for typecheck

  if (actualFailures.length === 0) {
    const slowNote = slowChecks.length > 0
      ? `, ${slowChecks.length} slow (≥${formatDuration(SLOW_THRESHOLD_MS)})`
      : "";
    console.log(
      `[done]  ${ranCount}/${totalCount} checks ran fresh` +
        (skippedCount > 0 ? `, ${skippedCount} skipped (cached)` : "") +
        `${slowNote} — all passed in ${formatDuration(wallMs)}.`,
    );
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
