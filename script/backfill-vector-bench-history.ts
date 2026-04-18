/**
 * One-off backfill: parse historical run blocks out of
 * `docs/vector-bench-results.md` and merge them into
 * `docs/vector-bench-history.json` so the admin "Vector latency" chart can
 * plot earlier runs alongside ones recorded after the chart shipped.
 *
 * The history file is the same shape produced by `recordHistory` in
 * `script/vector-bench.ts`:
 *
 *     {
 *       "thresholds": { singleP50Ms, singleP95Ms, multiP50Ms, multiP95Ms },
 *       "namespaces": <number>,
 *       "updatedAt": <iso>,
 *       "runs": VectorBenchHistoryRun[]   // each has `timestamp`, `node`, ...
 *     }
 *
 * Each run block in the markdown looks like:
 *
 *     ## 2026-04-18T10:58:59.498Z
 *
 *     - Runner: Node v20.20.0, Postgres
 *     - Queries per size: 20, top-K: 8
 *     - Sizes: 1000, 5000
 *
 *     | seeded | total rows | top-K | queries | single p50 (ms) | ... |
 *     | -----: | ---------: | ----: | ------: | --------------: | ... |
 *     | 1,000 | 1,000 | 8 | 20 | 4.8 | 5.4 | 4.7 | 187 | 253 | 145 |
 *
 * The markdown only carries p50/p95/mean, so backfilled rows set
 * `maxMs = p95Ms` (best available approximation from the recorded data).
 *
 * Idempotent: dedupes by run `timestamp`, so re-running the script never
 * duplicates an existing entry. Runs are kept sorted oldest -> newest, and
 * `updatedAt`/`thresholds`/`namespaces` are refreshed if the file already
 * exists. If the history file does not exist yet, sane defaults are used
 * that mirror those in `script/vector-bench.ts`.
 *
 * Usage:
 *   npx tsx script/backfill-vector-bench-history.ts
 *   npx tsx script/backfill-vector-bench-history.ts --dry-run
 *   npx tsx script/backfill-vector-bench-history.ts \
 *     --in docs/vector-bench-results.md --out docs/vector-bench-history.json
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";

// Inline the schema constants instead of importing from `./vector-bench`,
// because that module has a top-level `void main()` that would actually run
// the benchmark on import. Keep these in sync with the canonical
// definitions in `script/vector-bench.ts` (`VECTOR_BENCH_THRESHOLDS`,
// `VectorBenchHistoryRun`, `VectorBenchHistory`) and
// `server/ai/vector-store-service.ts` (`ALL_NAMESPACES`).
const VECTOR_BENCH_THRESHOLDS = {
  singleP95Ms: 50,
  singleP50Ms: 25,
  multiP95Ms: 600,
  multiP50Ms: 300,
} as const;
const DEFAULT_NAMESPACE_COUNT = 7;

interface Stats {
  count: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}

interface VectorBenchHistoryRun {
  timestamp: string;
  node: string;
  dbHint: string;
  queries: number;
  topK: number;
  sizes: number[];
  results: Array<{
    size: number;
    totalRowsAtRun: number;
    single: Stats;
    multi: Stats;
  }>;
}

interface VectorBenchHistory {
  thresholds: typeof VECTOR_BENCH_THRESHOLDS;
  namespaces: number;
  updatedAt: string;
  runs: VectorBenchHistoryRun[];
}

const DEFAULT_IN = "docs/vector-bench-results.md";
const DEFAULT_OUT = "docs/vector-bench-history.json";

interface CliArgs {
  inputPath: string;
  outputPath: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    inputPath: DEFAULT_IN,
    outputPath: DEFAULT_OUT,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    let key = a;
    let inlineValue: string | undefined;
    if (a.startsWith("--") && a.includes("=")) {
      const eq = a.indexOf("=");
      key = a.slice(0, eq);
      inlineValue = a.slice(eq + 1);
    }
    const next = (): string => (inlineValue !== undefined ? inlineValue : argv[++i]);
    switch (key) {
      case "--in":
      case "--input":
        args.inputPath = next();
        break;
      case "--out":
      case "--output":
        args.outputPath = next();
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "-h":
      case "--help":
        console.log(
          "Usage: tsx script/backfill-vector-bench-history.ts [--in path] [--out path] [--dry-run]",
        );
        process.exit(0);
    }
  }
  return args;
}

function parseNum(s: string): number {
  // Accepts "1,000", "187", "4.8".
  const cleaned = s.replace(/,/g, "").trim();
  const n = Number(cleaned);
  if (!Number.isFinite(n)) throw new Error(`Could not parse number: ${JSON.stringify(s)}`);
  return n;
}

function isTableSeparator(line: string): boolean {
  return /^\|\s*-+:?/.test(line);
}

function parseTableRow(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
    throw new Error(`Malformed table row: ${line}`);
  }
  return trimmed
    .slice(1, -1)
    .split("|")
    .map((c) => c.trim());
}

interface RawBlock {
  timestamp: string;
  bodyLines: string[];
}

function splitBlocks(md: string): RawBlock[] {
  const lines = md.split(/\r?\n/);
  const blocks: RawBlock[] = [];
  let current: RawBlock | null = null;
  for (const line of lines) {
    // Run blocks start with "## <ISO timestamp>". Document/section headings
    // (e.g. "# Vector Store Benchmark Results", "## How to run", "## Runs")
    // are filtered out by the ISO timestamp regex.
    const m = /^##\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s*$/.exec(line);
    if (m) {
      if (current) blocks.push(current);
      current = { timestamp: m[1], bodyLines: [] };
      continue;
    }
    if (line.startsWith("## ") || line.startsWith("# ")) {
      if (current) blocks.push(current);
      current = null;
      continue;
    }
    if (current) current.bodyLines.push(line);
  }
  if (current) blocks.push(current);
  return blocks;
}

function parseBlock(block: RawBlock): VectorBenchHistoryRun | null {
  let queries = 0;
  let topK = 0;
  let node = "unknown";
  let dbHint = "Postgres";
  const sizesDeclared: number[] = [];

  const tableLines: string[] = [];
  let inTable = false;
  for (const raw of block.bodyLines) {
    const line = raw.trimEnd();
    if (line.startsWith("- Runner:")) {
      // "- Runner: Node v20.20.0, Postgres"
      const m = /Runner:\s*Node\s+(\S+)\s*,\s*(.+)$/.exec(line);
      if (m) {
        node = m[1];
        dbHint = m[2].trim();
      }
      continue;
    }
    if (line.startsWith("- Queries per size:")) {
      const m = /Queries per size:\s*(\d+)\s*,\s*top-K:\s*(\d+)/.exec(line);
      if (m) {
        queries = Number(m[1]);
        topK = Number(m[2]);
      }
      continue;
    }
    if (line.startsWith("- Sizes:")) {
      const m = /Sizes:\s*(.+)$/.exec(line);
      if (m) {
        for (const part of m[1].split(",")) {
          const n = parseNum(part);
          if (n > 0) sizesDeclared.push(n);
        }
      }
      continue;
    }
    if (line.startsWith("|")) {
      tableLines.push(line);
      inTable = true;
    } else if (inTable && line.trim() === "") {
      inTable = false;
    }
  }

  if (tableLines.length < 3) {
    console.warn(`  skip ${block.timestamp}: no result table found`);
    return null;
  }

  const header = parseTableRow(tableLines[0]).map((h) => h.toLowerCase());
  if (!isTableSeparator(tableLines[1])) {
    console.warn(`  skip ${block.timestamp}: malformed table separator`);
    return null;
  }

  const col = (name: string): number => {
    const idx = header.indexOf(name);
    if (idx < 0) throw new Error(`Missing column "${name}" in table`);
    return idx;
  };
  const cSeeded = col("seeded");
  const cTotal = col("total rows");
  const cTopK = col("top-k");
  const cQueries = col("queries");
  const cSingleP50 = col("single p50 (ms)");
  const cSingleP95 = col("single p95 (ms)");
  const cSingleMean = col("single mean (ms)");
  const cMultiP50 = col("multi p50 (ms)");
  const cMultiP95 = col("multi p95 (ms)");
  const cMultiMean = col("multi mean (ms)");

  const results: VectorBenchHistoryRun["results"] = [];
  const sizesFromTable: number[] = [];
  for (const dataLine of tableLines.slice(2)) {
    const cells = parseTableRow(dataLine);
    const rowQueries = parseNum(cells[cQueries]);
    const rowTopK = parseNum(cells[cTopK]);
    if (queries === 0) queries = rowQueries;
    if (topK === 0) topK = rowTopK;
    const singleP50 = parseNum(cells[cSingleP50]);
    const singleP95 = parseNum(cells[cSingleP95]);
    const singleMean = parseNum(cells[cSingleMean]);
    const multiP50 = parseNum(cells[cMultiP50]);
    const multiP95 = parseNum(cells[cMultiP95]);
    const multiMean = parseNum(cells[cMultiMean]);
    const size = parseNum(cells[cSeeded]);
    sizesFromTable.push(size);
    results.push({
      size,
      totalRowsAtRun: parseNum(cells[cTotal]),
      single: {
        count: rowQueries,
        meanMs: singleMean,
        p50Ms: singleP50,
        p95Ms: singleP95,
        maxMs: singleP95,
      },
      multi: {
        count: rowQueries,
        meanMs: multiMean,
        p50Ms: multiP50,
        p95Ms: multiP95,
        maxMs: multiP95,
      },
    });
  }

  if (results.length === 0) {
    console.warn(`  skip ${block.timestamp}: empty result table`);
    return null;
  }

  return {
    timestamp: block.timestamp,
    node,
    dbHint,
    queries: queries || results[0].single.count,
    topK: topK || 8,
    sizes: sizesDeclared.length > 0 ? sizesDeclared : sizesFromTable,
    results,
  };
}

async function loadHistory(path: string): Promise<VectorBenchHistory> {
  const fallback: VectorBenchHistory = {
    thresholds: VECTOR_BENCH_THRESHOLDS,
    namespaces: DEFAULT_NAMESPACE_COUNT,
    updatedAt: new Date().toISOString(),
    runs: [],
  };
  if (!existsSync(path)) return fallback;
  const raw = await readFile(path, "utf8");
  const trimmed = raw.trim();
  if (trimmed === "") return fallback;
  const parsed = JSON.parse(trimmed) as Partial<VectorBenchHistory>;
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.runs)) {
    throw new Error(`Unexpected history file shape at ${path}`);
  }
  const runs = parsed.runs.filter(
    (r): r is VectorBenchHistoryRun =>
      !!r && typeof r.timestamp === "string" && Array.isArray(r.results),
  );
  return {
    thresholds: parsed.thresholds ?? VECTOR_BENCH_THRESHOLDS,
    namespaces:
      typeof parsed.namespaces === "number" && parsed.namespaces > 0
        ? parsed.namespaces
        : DEFAULT_NAMESPACE_COUNT,
    updatedAt: parsed.updatedAt ?? fallback.updatedAt,
    runs,
  };
}

function mergeRuns(
  existing: VectorBenchHistoryRun[],
  parsed: VectorBenchHistoryRun[],
): { merged: VectorBenchHistoryRun[]; added: number; skipped: number } {
  const seen = new Set(existing.map((r) => r.timestamp));
  let added = 0;
  let skipped = 0;
  const toAdd: VectorBenchHistoryRun[] = [];
  for (const entry of parsed) {
    if (seen.has(entry.timestamp)) {
      skipped += 1;
      continue;
    }
    seen.add(entry.timestamp);
    toAdd.push(entry);
    added += 1;
  }
  // Keep the runs sorted oldest -> newest so the chart can render straight
  // from the array (and so future appends from `recordHistory` slot in at
  // the end as the most-recent entry).
  const merged = [...existing, ...toAdd].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );
  return { merged, added, skipped };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(args.inputPath)) {
    console.error(`Input not found: ${args.inputPath}`);
    process.exit(1);
  }
  const md = await readFile(args.inputPath, "utf8");
  const blocks = splitBlocks(md);
  console.log(`Found ${blocks.length} run block(s) in ${args.inputPath}`);

  const parsedEntries: VectorBenchHistoryRun[] = [];
  for (const block of blocks) {
    try {
      const entry = parseBlock(block);
      if (entry) parsedEntries.push(entry);
    } catch (err) {
      console.warn(
        `  failed to parse ${block.timestamp}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  console.log(`Parsed ${parsedEntries.length} entries from markdown`);

  const history = await loadHistory(args.outputPath);
  const { merged, added, skipped } = mergeRuns(history.runs, parsedEntries);
  console.log(
    `History: ${history.runs.length} existing, +${added} added, ${skipped} duplicate(s) skipped`,
  );

  if (args.dryRun) {
    console.log("--dry-run set: not writing output");
    return;
  }

  const out: VectorBenchHistory = {
    thresholds: history.thresholds ?? VECTOR_BENCH_THRESHOLDS,
    namespaces: history.namespaces || DEFAULT_NAMESPACE_COUNT,
    // Refresh `updatedAt` only if we actually changed anything; otherwise
    // re-running the script as a no-op shouldn't bump the chart's "last
    // updated" badge.
    updatedAt: added > 0 ? new Date().toISOString() : history.updatedAt,
    runs: merged,
  };
  await mkdir(dirname(args.outputPath), { recursive: true });
  await writeFile(args.outputPath, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote ${merged.length} run(s) to ${args.outputPath}`);
}

void main().catch((err) => {
  console.error("Backfill failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
