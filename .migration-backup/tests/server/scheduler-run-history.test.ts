/**
 * Task #558 — Static-analysis guard for the scheduler-runs history append+trim.
 *
 * `scheduler_runs` is intentionally upsert-only (one row per scheduler), so
 * the only way to surface a "it failed twice last night, then succeeded"
 * pattern is the companion `scheduler_run_history` table. The contract is:
 *
 *   1. Every call to `recordSchedulerRun` must ALSO insert into
 *      `scheduler_run_history` with the same cycle counters/status/notes.
 *   2. The same call must trim the per-scheduler history to the last
 *      `SCHEDULER_HISTORY_KEEP` rows so the table stays bounded.
 *   3. The Observability route must read the latest cycles back through
 *      `listSchedulerRunHistory` and ship them to the UI as `recentRuns`.
 *
 * Mirrors the static-analysis style of `storage-layer.test.ts` so it runs
 * in the cheap `tests/server` lane and never has to spin up a real DB.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

import {
  schedulerRunHistory,
  SCHEDULER_HISTORY_KEEP,
  SCHEDULER_HISTORY_STRIP,
} from "../../shared/schema";

const repoRoot = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), "utf-8");

describe("scheduler_run_history — schema declaration", () => {
  it("declares the companion table on the public schema", () => {
    // @ts-expect-error — Drizzle stores the table name on the symbol map.
    const symbols = Object.getOwnPropertySymbols(schedulerRunHistory);
    const nameSym = symbols.find((s) => s.toString().includes("Name"));
    const tableName = nameSym
      // @ts-expect-error — symbol indexing returns string in Drizzle.
      ? schedulerRunHistory[nameSym]
      : null;
    expect(tableName).toBe("scheduler_run_history");
  });

  it("uses sane retention/strip constants", () => {
    expect(SCHEDULER_HISTORY_KEEP).toBeGreaterThanOrEqual(20);
    expect(SCHEDULER_HISTORY_KEEP).toBeLessThanOrEqual(200);
    expect(SCHEDULER_HISTORY_STRIP).toBeLessThanOrEqual(SCHEDULER_HISTORY_KEEP);
  });
});

describe("scheduler-runs storage — append+trim contract", () => {
  const src = read("server/storage/scheduler-runs.ts");

  it("recordSchedulerRun appends to scheduler_run_history", () => {
    expect(src).toContain("db.insert(schedulerRunHistory)");
  });

  it("recordSchedulerRun trims per-scheduler history with a sub-select", () => {
    // Trim must filter on the SAME scheduler key in both the outer DELETE
    // and the inner SELECT — otherwise concurrent writes for OTHER
    // schedulers could be deleted.
    expect(src).toMatch(/DELETE FROM scheduler_run_history/);
    expect(src).toMatch(/scheduler_key = \$\{input\.schedulerKey\}/);
    expect(src).toMatch(/LIMIT \$\{SCHEDULER_HISTORY_KEEP\}/);
  });

  it("listSchedulerRunHistory uses ROW_NUMBER() for per-scheduler caps", () => {
    // Single round-trip query — the per-scheduler limit lives in a window
    // function so the Observability page doesn't pay N round trips when
    // it asks for many schedulers at once.
    expect(src).toMatch(/ROW_NUMBER\(\)/);
    expect(src).toMatch(/PARTITION BY scheduler_key/);
  });
});

describe("observability route — recent-runs strip", () => {
  const routeSrc = read("server/routes/admin/observability.ts");
  const uiSrc = read("client/src/components/admin/ObservabilityTab.tsx");

  it("API attaches a recentRuns array to each scheduler row", () => {
    expect(routeSrc).toContain("storage.listSchedulerRunHistory(");
    expect(routeSrc).toMatch(/recentRuns:\s*historyByKey\.get\(/);
    expect(routeSrc).toMatch(/recentRunsLimit:\s*SCHEDULER_HISTORY_STRIP/);
  });

  it("UI renders a status-dot strip per scheduler", () => {
    expect(uiSrc).toContain("RecentRunsStrip");
    expect(uiSrc).toContain("recentDotClass");
    // Status dots ship test ids so the e2e suite can assert on them.
    expect(uiSrc).toMatch(/data-testid=\{`dot-recent-run-/);
  });
});
