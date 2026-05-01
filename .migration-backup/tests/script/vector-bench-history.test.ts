/**
 * vector-bench-history.test.ts — Sanity tests for the history-recording
 * helpers in `script/lib/vector-bench-history.ts`.
 *
 * These guard the contract between `script/vector-bench.ts` (which appends
 * a run via {@link recordBenchRun} after each CI run) and the admin
 * "Vector latency" trends chart at
 * `client/src/components/admin/intelligence/VectorBenchTrendsTab.tsx`,
 * which reads the file via `/api/admin/vector-bench/history` (Task #372).
 *
 * Without this coverage a refactor or schema drift could silently break
 * the chart, which is exactly the failure mode the task was opened to
 * prevent — the chart looked fine for weeks because no new runs were
 * actually landing in the file.
 */
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendBenchRun,
  HISTORY_MAX_RUNS,
  recordBenchRun,
  VECTOR_BENCH_THRESHOLDS,
  type AppendRunInput,
  type BenchSizeResult,
  type VectorBenchHistory,
  type VectorBenchHistoryRun,
} from "../../script/lib/vector-bench-history";

const NAMESPACE_COUNT = 7;

function sampleResult(size: number): BenchSizeResult {
  return {
    size,
    totalRowsAtRun: size,
    single: { count: 10, meanMs: 4.2, p50Ms: 4.0, p95Ms: 5.1, maxMs: 5.5 },
    multi: { count: 10, meanMs: 140, p50Ms: 138, p95Ms: 250, maxMs: 260 },
  };
}

function sampleRun(timestamp: string, source?: VectorBenchHistoryRun["source"]): VectorBenchHistoryRun {
  return {
    timestamp,
    node: "v20.20.0",
    dbHint: "Postgres",
    queries: 10,
    topK: 8,
    sizes: [1000],
    ...(source ? { source } : {}),
    results: [sampleResult(1000)],
  };
}

function makeInput(overrides: Partial<AppendRunInput> = {}): AppendRunInput {
  return {
    timestamp: "2026-04-25T12:00:00.000Z",
    node: "v20.20.0",
    dbHint: "Postgres",
    queries: 20,
    topK: 8,
    sizes: [1000, 5000],
    embedSource: "random",
    results: [sampleResult(1000), sampleResult(5000)],
    namespaceCount: NAMESPACE_COUNT,
    ...overrides,
  };
}

describe("appendBenchRun (pure)", () => {
  it("appends a new run and tags it with source 'vector-bench'", () => {
    const start: VectorBenchHistory = {
      thresholds: VECTOR_BENCH_THRESHOLDS,
      namespaces: NAMESPACE_COUNT,
      updatedAt: "1970-01-01T00:00:00.000Z",
      runs: [sampleRun("2026-04-20T10:00:00.000Z", "backfill")],
    };

    const next = appendBenchRun(start, makeInput({ timestamp: "2026-04-25T12:00:00.000Z" }));

    expect(next.runs).toHaveLength(2);
    const appended = next.runs[next.runs.length - 1];
    expect(appended.timestamp).toBe("2026-04-25T12:00:00.000Z");
    expect(appended.source).toBe("vector-bench");
    expect(appended.embedSource).toBe("random");
    expect(next.updatedAt).toBe("2026-04-25T12:00:00.000Z");
    // Original input must not be mutated.
    expect(start.runs).toHaveLength(1);
  });

  it("preserves backfill entries (and untagged legacy entries) when appending", () => {
    const start: VectorBenchHistory = {
      thresholds: VECTOR_BENCH_THRESHOLDS,
      namespaces: NAMESPACE_COUNT,
      updatedAt: "1970-01-01T00:00:00.000Z",
      runs: [
        sampleRun("2026-04-18T10:00:00.000Z", "backfill"),
        sampleRun("2026-04-19T10:00:00.000Z"), // legacy: no source
        sampleRun("2026-04-20T10:00:00.000Z", "backfill"),
      ],
    };

    const next = appendBenchRun(start, makeInput({ timestamp: "2026-04-25T12:00:00.000Z" }));

    expect(next.runs).toHaveLength(4);
    // Existing entries keep their original source value (or absence thereof).
    expect(next.runs[0]).toMatchObject({
      timestamp: "2026-04-18T10:00:00.000Z",
      source: "backfill",
    });
    expect(next.runs[1].source).toBeUndefined();
    expect(next.runs[2]).toMatchObject({
      timestamp: "2026-04-20T10:00:00.000Z",
      source: "backfill",
    });
    // Only the freshly-appended run is tagged 'vector-bench'.
    expect(next.runs[3]).toMatchObject({
      timestamp: "2026-04-25T12:00:00.000Z",
      source: "vector-bench",
    });
  });

  it("sorts runs oldest -> newest even when the new timestamp is older", () => {
    const start: VectorBenchHistory = {
      thresholds: VECTOR_BENCH_THRESHOLDS,
      namespaces: NAMESPACE_COUNT,
      updatedAt: "1970-01-01T00:00:00.000Z",
      runs: [
        sampleRun("2026-04-20T10:00:00.000Z", "backfill"),
        sampleRun("2026-04-22T10:00:00.000Z", "backfill"),
      ],
    };

    // Insert an older run between the two existing ones.
    const next = appendBenchRun(start, makeInput({ timestamp: "2026-04-21T10:00:00.000Z" }));

    expect(next.runs.map((r) => r.timestamp)).toEqual([
      "2026-04-20T10:00:00.000Z",
      "2026-04-21T10:00:00.000Z",
      "2026-04-22T10:00:00.000Z",
    ]);
    // The middle slot is the freshly-recorded run.
    expect(next.runs[1].source).toBe("vector-bench");
  });

  it("caps the run list at HISTORY_MAX_RUNS, dropping the oldest entries", () => {
    // Build HISTORY_MAX_RUNS pre-existing entries with strictly increasing
    // timestamps. Use a base year well below 2026 so the freshly-appended
    // run is unambiguously the newest.
    const baseMs = Date.UTC(2000, 0, 1);
    const existing: VectorBenchHistoryRun[] = [];
    for (let i = 0; i < HISTORY_MAX_RUNS; i++) {
      const ts = new Date(baseMs + i * 60_000).toISOString();
      existing.push(sampleRun(ts, "backfill"));
    }
    const start: VectorBenchHistory = {
      thresholds: VECTOR_BENCH_THRESHOLDS,
      namespaces: NAMESPACE_COUNT,
      updatedAt: "1970-01-01T00:00:00.000Z",
      runs: existing,
    };

    const newest = "2026-04-25T12:00:00.000Z";
    const next = appendBenchRun(start, makeInput({ timestamp: newest }));

    expect(next.runs).toHaveLength(HISTORY_MAX_RUNS);
    // Oldest entry (the one at `baseMs`) was evicted.
    expect(next.runs[0].timestamp).toBe(new Date(baseMs + 60_000).toISOString());
    // Newest entry is our freshly-appended run, tagged 'vector-bench'.
    const last = next.runs[next.runs.length - 1];
    expect(last.timestamp).toBe(newest);
    expect(last.source).toBe("vector-bench");
  });

  it("refreshes thresholds and namespace count from the new input", () => {
    const start: VectorBenchHistory = {
      thresholds: { singleP95Ms: 1, singleP50Ms: 1, multiP95Ms: 1, multiP50Ms: 1 } as never,
      namespaces: 99,
      updatedAt: "1970-01-01T00:00:00.000Z",
      runs: [],
    };

    const next = appendBenchRun(start, makeInput({ namespaceCount: NAMESPACE_COUNT }));

    expect(next.thresholds).toEqual(VECTOR_BENCH_THRESHOLDS);
    expect(next.namespaces).toBe(NAMESPACE_COUNT);
  });
});

describe("recordBenchRun (filesystem)", () => {
  let tmp: string;
  let path: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "vector-bench-history-"));
    path = join(tmp, "history.json");
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("creates the file and writes a valid history when none exists", async () => {
    const written = await recordBenchRun(path, makeInput({ timestamp: "2026-04-25T12:00:00.000Z" }));

    expect(written.runs).toHaveLength(1);
    expect(written.runs[0].source).toBe("vector-bench");

    const onDisk = JSON.parse(await readFile(path, "utf8")) as VectorBenchHistory;
    expect(onDisk.runs).toHaveLength(1);
    expect(onDisk.runs[0].timestamp).toBe("2026-04-25T12:00:00.000Z");
    expect(onDisk.thresholds).toEqual(VECTOR_BENCH_THRESHOLDS);
    expect(onDisk.namespaces).toBe(NAMESPACE_COUNT);
    expect(onDisk.updatedAt).toBe("2026-04-25T12:00:00.000Z");
  });

  it("appends to an existing history, preserves backfill entries, sorts oldest->newest", async () => {
    // Seed the file with a mix of backfill + legacy entries, in arbitrary
    // order on disk so we exercise the sort path too.
    const initial: VectorBenchHistory = {
      thresholds: VECTOR_BENCH_THRESHOLDS,
      namespaces: NAMESPACE_COUNT,
      updatedAt: "2026-04-20T10:00:00.000Z",
      runs: [
        sampleRun("2026-04-20T10:00:00.000Z", "backfill"),
        sampleRun("2026-04-18T10:00:00.000Z", "backfill"),
        sampleRun("2026-04-19T10:00:00.000Z"), // legacy untagged
      ],
    };
    await writeFile(path, JSON.stringify(initial, null, 2) + "\n", "utf8");

    const written = await recordBenchRun(
      path,
      makeInput({ timestamp: "2026-04-25T12:00:00.000Z" }),
    );

    expect(written.runs).toHaveLength(4);
    expect(written.runs.map((r) => r.timestamp)).toEqual([
      "2026-04-18T10:00:00.000Z",
      "2026-04-19T10:00:00.000Z",
      "2026-04-20T10:00:00.000Z",
      "2026-04-25T12:00:00.000Z",
    ]);
    expect(written.runs[0].source).toBe("backfill");
    expect(written.runs[1].source).toBeUndefined();
    expect(written.runs[2].source).toBe("backfill");
    expect(written.runs[3].source).toBe("vector-bench");

    // And the on-disk copy matches what we returned (catches a missing
    // writeFile / wrong-path bug).
    const onDisk = JSON.parse(await readFile(path, "utf8")) as VectorBenchHistory;
    expect(onDisk.runs.map((r) => r.timestamp)).toEqual(
      written.runs.map((r) => r.timestamp),
    );
  });

  it("recovers from a corrupt history file by starting fresh (with a warning)", async () => {
    await writeFile(path, "not json at all", "utf8");
    const warnings: string[] = [];

    const written = await recordBenchRun(
      path,
      makeInput({ timestamp: "2026-04-25T12:00:00.000Z" }),
      (msg) => warnings.push(msg),
    );

    expect(warnings.length).toBeGreaterThan(0);
    expect(written.runs).toHaveLength(1);
    expect(written.runs[0].source).toBe("vector-bench");
  });
});
