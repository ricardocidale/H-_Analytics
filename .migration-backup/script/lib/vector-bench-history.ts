/**
 * Pure (no DB / no network) helpers for the vector-bench history file
 * (`docs/vector-bench-history.json`).
 *
 * Extracted out of `script/vector-bench.ts` so the append/sort/cap logic
 * can be unit-tested without standing up the bench harness, the pgvector
 * pool, or the OpenAI embedding client. The CI workflow reads the file
 * this module produces and the admin "Vector latency" trends chart
 * consumes the same shape via `/api/admin/vector-bench/history`, so the
 * schema here is a load-bearing contract — keep `VectorBenchHistory{,Run}`
 * stable and add fields rather than renaming them.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Latency thresholds (ms) used by the trends chart to highlight regressions.
 * Single-namespace queries hit a single HNSW index; multi-namespace queries
 * fan out across all namespaces in parallel and pay the slowest.
 */
export const VECTOR_BENCH_THRESHOLDS = {
  singleP95Ms: 50,
  singleP50Ms: 25,
  multiP95Ms: 600,
  multiP50Ms: 300,
} as const;

/**
 * Hard cap on the number of runs we keep in the history file. The chart
 * is a time-series, so older runs scroll off the left edge once the cap
 * is exceeded. 500 runs at the current CI cadence is well over a year of
 * data — enough for trend spotting, small enough to keep the JSON
 * payload trivial to ship to the admin client.
 */
export const HISTORY_MAX_RUNS = 500;

export type EmbedSource = "openai" | "random";

/** Source tag for a history entry. */
export type HistoryRunSource = "vector-bench" | "backfill";

export interface BenchStats {
  count: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}

export interface BenchRecallStats {
  count: number;
  topK: number;
  meanAtK: number;
  minAtK: number;
  p5AtK: number;
}

export interface BenchSizeResult {
  size: number;
  totalRowsAtRun: number;
  single: BenchStats;
  multi: BenchStats;
  /** Recall@K stats; only populated for `embedSource === "openai"` runs. */
  recall?: BenchRecallStats | null;
}

export interface VectorBenchHistoryRun {
  timestamp: string;
  node: string;
  dbHint: string;
  queries: number;
  topK: number;
  sizes: number[];
  /**
   * How this run got into the history file. `vector-bench` = appended live
   * by `script/vector-bench.ts`. `backfill` = parsed out of the markdown
   * results log by `script/backfill-vector-bench-history.ts`. Older
   * entries (recorded before this field was added) omit it; the admin
   * chart treats a missing value as `vector-bench`.
   */
  source?: HistoryRunSource;
  /** Embedding source — older runs (before recall measurement) omit this. */
  embedSource?: EmbedSource;
  results: BenchSizeResult[];
}

export interface VectorBenchHistory {
  thresholds: typeof VECTOR_BENCH_THRESHOLDS;
  namespaces: number;
  updatedAt: string;
  runs: VectorBenchHistoryRun[];
}

export interface AppendRunInput {
  timestamp: string;
  node: string;
  dbHint: string;
  queries: number;
  topK: number;
  sizes: number[];
  embedSource: EmbedSource;
  results: BenchSizeResult[];
  namespaceCount: number;
}

/**
 * Read and validate an existing history file, returning a normalised
 * `VectorBenchHistory`. Missing file -> empty history. Invalid JSON or
 * an unexpected shape -> empty history with a warning logged via the
 * supplied `onWarn` callback (defaults to `console.warn`), so a corrupt
 * file never aborts the bench (which would also drop the run we were
 * about to record).
 */
export async function loadHistoryFile(
  path: string,
  namespaceCount: number,
  onWarn: (msg: string) => void = (m) => console.warn(m),
): Promise<VectorBenchHistory> {
  const empty: VectorBenchHistory = {
    thresholds: VECTOR_BENCH_THRESHOLDS,
    namespaces: namespaceCount,
    updatedAt: new Date(0).toISOString(),
    runs: [],
  };
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return empty;
    onWarn(
      `could not read history at ${path}: ${
        err instanceof Error ? err.message : String(err)
      } (starting fresh)`,
    );
    return empty;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<VectorBenchHistory>;
    if (!parsed || !Array.isArray(parsed.runs)) return empty;
    const runs = parsed.runs.filter(
      (r): r is VectorBenchHistoryRun =>
        !!r && typeof r.timestamp === "string" && Array.isArray(r.results),
    );
    return {
      thresholds: VECTOR_BENCH_THRESHOLDS,
      namespaces: namespaceCount,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : empty.updatedAt,
      runs,
    };
  } catch (err) {
    onWarn(
      `could not parse existing history at ${path}: ${
        err instanceof Error ? err.message : String(err)
      } (starting fresh)`,
    );
    return empty;
  }
}

/**
 * Pure: append a new `vector-bench` run to the given history, preserving
 * any existing entries (including ones with `source: "backfill"` or no
 * source field at all), sorting all runs oldest -> newest by timestamp,
 * and capping the total at {@link HISTORY_MAX_RUNS}.
 *
 * The returned object is a fresh value — `existing` is not mutated, so
 * callers can diff before/after if needed.
 */
export function appendBenchRun(
  existing: VectorBenchHistory,
  input: AppendRunInput,
): VectorBenchHistory {
  const newRun: VectorBenchHistoryRun = {
    timestamp: input.timestamp,
    node: input.node,
    dbHint: input.dbHint,
    queries: input.queries,
    topK: input.topK,
    sizes: input.sizes,
    source: "vector-bench",
    embedSource: input.embedSource,
    results: input.results,
  };

  const combined = [...existing.runs, newRun].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  const capped =
    combined.length > HISTORY_MAX_RUNS ? combined.slice(-HISTORY_MAX_RUNS) : combined;

  return {
    thresholds: VECTOR_BENCH_THRESHOLDS,
    namespaces: input.namespaceCount,
    updatedAt: input.timestamp,
    runs: capped,
  };
}

/**
 * Read existing history (if any), append a fresh `vector-bench` run, and
 * write the result back to disk. Wraps {@link loadHistoryFile} +
 * {@link appendBenchRun} + a JSON serialise so `script/vector-bench.ts`
 * has a single call site.
 *
 * Returns the written history so tests / callers can assert on it
 * without re-reading the file.
 */
export async function recordBenchRun(
  path: string,
  input: AppendRunInput,
  onWarn: (msg: string) => void = (m) => console.warn(m),
): Promise<VectorBenchHistory> {
  await mkdir(dirname(path), { recursive: true });
  const existing = await loadHistoryFile(path, input.namespaceCount, onWarn);
  const next = appendBenchRun(existing, input);
  await writeFile(path, JSON.stringify(next, null, 2) + "\n");
  return next;
}
