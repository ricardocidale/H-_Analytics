/**
 * Vector store benchmark — measures pgvector / HNSW query latency as the
 * `vector_chunks` table grows.
 *
 * What it does:
 *   1. Seeds N synthetic 1536-dim chunks (random unit vectors) into a single
 *      benchmark namespace, in batches.
 *   2. Runs Q random top-K queries against the same SQL used by
 *      `queryChunks` (single-namespace) and `multiNamespaceQuery` (fan-out
 *      over all 7 namespaces) and records p50 / p95 / mean latency.
 *   3. Prints a markdown-friendly table and (unless `--no-record`) appends
 *      the run to `docs/vector-bench-results.md` for historical comparison.
 *   4. Cleans up the seeded rows on exit unless `--keep` is passed.
 *
 * Why random vectors? Embedding 100k chunks via the OpenAI API would be slow
 * and expensive; HNSW query latency depends on index size and `ef_search`,
 * not on the semantic content of the vectors, so synthetic data is fine for
 * latency benchmarking. Recall quality is *not* measured here.
 *
 * Usage:
 *   npx tsx script/vector-bench.ts                       # default: 10k, 100k
 *   npx tsx script/vector-bench.ts --sizes 1000,10000    # custom sizes
 *   npx tsx script/vector-bench.ts --queries 100 --top-k 8
 *   npx tsx script/vector-bench.ts --keep                # don't clean up
 *   npx tsx script/vector-bench.ts --no-record           # don't append to docs
 *
 * CI / regression-alert flags (used by `.github/workflows/vector-bench.yml`):
 *   --threshold-p95-ms=<ms>  Exit 1 if any size's single or multi p95 exceeds
 *   --warn-p95-ms=<ms>       Print a warning if any size's p95 exceeds
 *   --json-out=<path>        Write a structured JSON summary to this file
 *   --append-docs            Alias for the default record behavior (explicit)
 *   --allow-production       Override the safety check that refuses to run
 *                            against a DATABASE_URL that looks production-like
 *   --embed-source=openai|random
 *                            Choose how seed/query vectors are generated.
 *                            `random` (default) uses synthetic unit vectors —
 *                            cheap, no API key. `openai` calls
 *                            text-embedding-3-small so the distribution
 *                            matches production (requires OPENAI_API_KEY).
 *
 * Requires DATABASE_URL pointing at a Postgres instance with the `vector`
 * extension and the `vector_chunks` table (migration 0012_pgvector_store.sql).
 */
import { mkdir, appendFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { vectorStorePool as pool } from "../server/storage/vector-store";
import {
  ALL_NAMESPACES,
  embed,
  embedBatch,
  isEmbeddingAvailable,
  type VectorNamespace,
} from "../server/ai/vector-store-service";

const EMBED_DIMS = 1536;
const BENCH_NAMESPACE: VectorNamespace = "knowledge-base";
const BENCH_ID_PREFIX = "bench:vector-bench:";
const RESULTS_PATH = "docs/vector-bench-results.md";

type EmbedSource = "openai" | "random";

interface Args {
  sizes: number[];
  queries: number;
  topK: number;
  keep: boolean;
  record: boolean;
  insertBatch: number;
  thresholdP95Ms: number;
  warnP95Ms: number;
  jsonOut: string | null;
  allowProduction: boolean;
  embedSource: EmbedSource;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    sizes: [10_000, 100_000],
    queries: 50,
    topK: 8,
    keep: false,
    record: true,
    insertBatch: 500,
    thresholdP95Ms: 0,
    warnP95Ms: 0,
    jsonOut: null,
    allowProduction: false,
    embedSource: "random",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    // Support both "--flag value" and "--flag=value" styles so the CI
    // workflow can use the more compact form.
    let key = a;
    let inlineValue: string | undefined;
    if (a.startsWith("--") && a.includes("=")) {
      const eq = a.indexOf("=");
      key = a.slice(0, eq);
      inlineValue = a.slice(eq + 1);
    }
    const next = (): string => {
      if (inlineValue !== undefined) return inlineValue;
      return argv[++i];
    };
    switch (key) {
      case "--sizes":
        args.sizes = next().split(",").map((s) => Number(s.trim())).filter((n) => n > 0);
        break;
      case "--queries":
        args.queries = Number(next());
        break;
      case "--top-k":
      case "--topK":
      case "--topk":
        args.topK = Number(next());
        break;
      case "--insert-batch":
        args.insertBatch = Number(next());
        break;
      case "--keep":
      case "--keep-data":
        args.keep = true;
        break;
      case "--no-record":
        args.record = false;
        break;
      case "--append-docs":
        // Default behavior already records; flag is accepted for explicitness
        // so the CI workflow reads naturally.
        args.record = true;
        break;
      case "--threshold-p95-ms":
        args.thresholdP95Ms = Math.max(0, Number(next()) || 0);
        break;
      case "--warn-p95-ms":
        args.warnP95Ms = Math.max(0, Number(next()) || 0);
        break;
      case "--json-out": {
        const v = next();
        args.jsonOut = v && v.length > 0 ? v : null;
        break;
      }
      case "--allow-production":
        args.allowProduction = true;
        break;
      case "--embed-source": {
        const v = next();
        if (v !== "openai" && v !== "random") {
          throw new Error("--embed-source must be 'openai' or 'random'");
        }
        args.embedSource = v;
        break;
      }
      case "-h":
      case "--help":
        console.log(
          "Usage: tsx script/vector-bench.ts [--sizes 10000,100000] [--queries 50] [--top-k 8]\n" +
            "                                  [--insert-batch 500] [--keep] [--no-record]\n" +
            "                                  [--append-docs] [--json-out path]\n" +
            "                                  [--threshold-p95-ms N] [--warn-p95-ms N]\n" +
            "                                  [--allow-production]\n" +
            "                                  [--embed-source openai|random]",
        );
        process.exit(0);
    }
  }
  if (args.sizes.length === 0 || args.sizes.some((n) => !Number.isFinite(n) || n <= 0)) {
    throw new Error("--sizes must be a comma-separated list of positive integers");
  }
  if (!Number.isFinite(args.queries) || args.queries <= 0) {
    throw new Error("--queries must be a positive integer");
  }
  if (!Number.isFinite(args.topK) || args.topK <= 0) {
    throw new Error("--top-k must be a positive integer");
  }
  if (!Number.isFinite(args.insertBatch) || args.insertBatch <= 0) {
    throw new Error("--insert-batch must be a positive integer");
  }
  return args;
}

function isProductionLike(url: string): boolean {
  const lower = url.toLowerCase();
  // Heuristic: explicit "prod" markers in DSN. Local / ephemeral CI databases
  // never trip these.
  return /(\bprod\b|\bproduction\b|prod[-_])/.test(lower);
}

function redactDsn(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    if (u.username) u.username = u.username.replace(/.(?=.{0,3}$)/g, "*");
    return u.toString();
  } catch {
    return "unknown";
  }
}

// Small word pool used to synthesise short, varied texts for OpenAI embedding.
// We don't need semantically meaningful content — just realistic-looking
// English noun-phrase chunks so the embedding distribution resembles
// production text rather than uniform noise.
const WORD_POOL = [
  "hotel", "resort", "occupancy", "ADR", "RevPAR", "seasonal", "calendar",
  "market", "comp", "set", "demand", "supply", "leisure", "corporate",
  "group", "transient", "rate", "yield", "channel", "OTA", "direct",
  "booking", "cancellation", "lead", "time", "shoulder", "peak", "valley",
  "weekend", "weekday", "summer", "winter", "spring", "fall", "festival",
  "convention", "airport", "downtown", "suburb", "luxury", "midscale",
  "economy", "branded", "independent", "renovation", "capex", "noi",
  "ebitda", "cap", "rate", "exit", "multiple", "underwriting", "pro",
  "forma", "stabilised", "ramp", "rooms", "F&B", "banquet", "spa", "golf",
  "loyalty", "guest", "satisfaction", "score", "reputation", "review",
  "investor", "debt", "service", "coverage", "ltv", "irr", "equity",
  "sponsor", "operator", "management", "agreement", "franchise", "fee",
  "labor", "wages", "utilities", "insurance", "tax", "assessment",
];

function syntheticText(seed: number): string {
  // Deterministic-ish per-seed length & word pick (still varied across rows).
  const len = 12 + (seed % 24);
  const parts: string[] = [];
  let s = seed * 2654435761;
  for (let i = 0; i < len; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    parts.push(WORD_POOL[s % WORD_POOL.length]);
  }
  return parts.join(" ");
}

function randomUnitVector(dims: number): number[] {
  const v = new Array<number>(dims);
  let sumSq = 0;
  for (let i = 0; i < dims; i++) {
    // Box-Muller for a normal sample — gives uniform direction on the sphere.
    const u1 = Math.random() || 1e-12;
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    v[i] = z;
    sumSq += z * z;
  }
  const norm = Math.sqrt(sumSq) || 1;
  for (let i = 0; i < dims; i++) v[i] /= norm;
  return v;
}

function toLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

async function currentBenchCount(): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM vector_chunks
      WHERE namespace = $1 AND id LIKE $2`,
    [BENCH_NAMESPACE, `${BENCH_ID_PREFIX}%`],
  );
  return Number(rows[0]?.count ?? 0);
}

async function seedTo(target: number, batchSize: number, embedSource: EmbedSource): Promise<void> {
  const have = await currentBenchCount();
  if (have >= target) return;

  const need = target - have;
  process.stdout.write(`  seeding ${need.toLocaleString()} chunks (have ${have.toLocaleString()}, target ${target.toLocaleString()}, source=${embedSource})`);
  const start = Date.now();

  let inserted = 0;
  while (inserted < need) {
    const thisBatch = Math.min(batchSize, need - inserted);
    const texts: string[] = [];
    for (let j = 0; j < thisBatch; j++) {
      texts.push(
        embedSource === "openai"
          ? syntheticText(have + inserted + j)
          : `synthetic-${have + inserted + j}`,
      );
    }
    const vectors: number[][] = embedSource === "openai"
      ? await embedBatch(texts)
      : Array.from({ length: thisBatch }, () => randomUnitVector(EMBED_DIMS));

    const placeholders: string[] = [];
    const values: unknown[] = [];
    for (let j = 0; j < thisBatch; j++) {
      const base = j * 5;
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::jsonb, $${base + 5}::vector)`,
      );
      const id = `${BENCH_ID_PREFIX}${have + inserted + j}`;
      values.push(
        BENCH_NAMESPACE,
        id,
        texts[j],
        JSON.stringify({ bench: true, embedSource }),
        toLiteral(vectors[j]),
      );
    }
    await pool.query(
      `INSERT INTO vector_chunks (namespace, id, text, metadata, embedding)
       VALUES ${placeholders.join(",")}
       ON CONFLICT (namespace, id) DO NOTHING`,
      values,
    );
    inserted += thisBatch;
    if (inserted % (batchSize * 10) === 0 || inserted === need) {
      process.stdout.write(".");
    }
  }
  const secs = ((Date.now() - start) / 1000).toFixed(1);
  console.log(` done in ${secs}s`);
}

async function timeQuery(sql: string, params: unknown[]): Promise<number> {
  const t0 = process.hrtime.bigint();
  await pool.query(sql, params);
  const t1 = process.hrtime.bigint();
  return Number(t1 - t0) / 1e6; // ms
}

interface Stats {
  count: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}

function summarise(samples: number[]): Stats {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = samples.reduce((s, x) => s + x, 0);
  return {
    count: samples.length,
    meanMs: sum / samples.length,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    maxMs: sorted[sorted.length - 1],
  };
}

async function queryVector(embedSource: EmbedSource, seed: number): Promise<number[]> {
  if (embedSource === "openai") {
    return embed(syntheticText(seed));
  }
  return randomUnitVector(EMBED_DIMS);
}

async function benchAtSize(size: number, queries: number, topK: number, embedSource: EmbedSource): Promise<{
  size: number;
  topK: number;
  totalRowsAtRun: number;
  single: Stats;
  multi: Stats;
}> {
  // Warm up — first query after a cold session pays connection / planning costs.
  for (let w = 0; w < 3; w++) {
    const warm = toLiteral(await queryVector(embedSource, 1_000_000 + w));
    await pool.query(
      `SELECT id FROM vector_chunks WHERE namespace = $1
        ORDER BY embedding <=> $2::vector ASC LIMIT $3`,
      [BENCH_NAMESPACE, warm, topK],
    );
  }

  const singleSamples: number[] = [];
  for (let i = 0; i < queries; i++) {
    const literal = toLiteral(await queryVector(embedSource, 2_000_000 + i));
    const ms = await timeQuery(
      `SELECT id, metadata, 1 - (embedding <=> $2::vector) AS score
         FROM vector_chunks
        WHERE namespace = $1
     ORDER BY embedding <=> $2::vector ASC
        LIMIT $3`,
      [BENCH_NAMESPACE, literal, topK],
    );
    singleSamples.push(ms);
  }

  const multiSamples: number[] = [];
  for (let i = 0; i < queries; i++) {
    const literal = toLiteral(await queryVector(embedSource, 3_000_000 + i));
    const t0 = process.hrtime.bigint();
    // Mirror multiNamespaceQuery: parallel per-namespace queries, then merge,
    // sort by score desc, slice to topK*2.
    const perNs = await Promise.all(
      ALL_NAMESPACES.map(async (ns) => {
        const { rows } = await pool.query<{
          id: string;
          metadata: Record<string, unknown>;
          score: number;
        }>(
          `SELECT id, metadata, 1 - (embedding <=> $2::vector) AS score
             FROM vector_chunks
            WHERE namespace = $1
         ORDER BY embedding <=> $2::vector ASC
            LIMIT $3`,
          [ns, literal, topK],
        );
        return rows.map((r) => ({
          id: r.id,
          score: Number(r.score) || 0,
          metadata: r.metadata ?? {},
          namespace: ns,
        }));
      }),
    );
    perNs.flat().sort((a, b) => b.score - a.score).slice(0, topK * 2);
    const t1 = process.hrtime.bigint();
    multiSamples.push(Number(t1 - t0) / 1e6);
  }

  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM vector_chunks`,
  );
  return {
    size,
    topK,
    totalRowsAtRun: Number(rows[0]?.count ?? 0),
    single: summarise(singleSamples),
    multi: summarise(multiSamples),
  };
}

async function cleanup(): Promise<void> {
  const { rowCount } = await pool.query(
    `DELETE FROM vector_chunks WHERE namespace = $1 AND id LIKE $2`,
    [BENCH_NAMESPACE, `${BENCH_ID_PREFIX}%`],
  );
  console.log(`  cleaned up ${rowCount ?? 0} synthetic rows`);
}

function fmt(ms: number): string {
  return ms >= 100 ? ms.toFixed(0) : ms.toFixed(1);
}

function renderTable(rows: Array<Awaited<ReturnType<typeof benchAtSize>>>, queries: number): string {
  const lines: string[] = [];
  lines.push(
    `| seeded | total rows | top-K | queries | single p50 (ms) | single p95 (ms) | single mean (ms) | multi p50 (ms) | multi p95 (ms) | multi mean (ms) |`,
  );
  lines.push(
    `| -----: | ---------: | ----: | ------: | --------------: | --------------: | ---------------: | -------------: | -------------: | --------------: |`,
  );
  for (const r of rows) {
    lines.push(
      `| ${r.size.toLocaleString()} | ${r.totalRowsAtRun.toLocaleString()} | ${r.topK} | ${queries} | ${fmt(r.single.p50Ms)} | ${fmt(r.single.p95Ms)} | ${fmt(r.single.meanMs)} | ${fmt(r.multi.p50Ms)} | ${fmt(r.multi.p95Ms)} | ${fmt(r.multi.meanMs)} |`,
    );
  }
  return lines.join("\n");
}

async function ensureResultsHeader(path: string): Promise<void> {
  const { existsSync } = await import("node:fs");
  if (existsSync(path)) return;
  await mkdir(dirname(path), { recursive: true });
  const header = `# Vector Store Benchmark Results

Append-only log of \`script/vector-bench.ts\` runs. Each run records
single-namespace and 7-namespace fan-out top-K query latency over the
\`vector_chunks\` (pgvector + HNSW) table at the seeded sizes. Synthetic
random vectors are used, so this measures index latency, not recall.

Compare new runs against the most recent entry of comparable size to spot
regressions from HNSW parameter changes (\`m\`, \`ef_construction\`,
\`ef_search\`) or schema/index changes.

`;
  await appendFile(path, header);
}

async function recordResults(
  path: string,
  rows: Array<Awaited<ReturnType<typeof benchAtSize>>>,
  args: Args,
): Promise<void> {
  await ensureResultsHeader(path);
  const ts = new Date().toISOString();
  const node = process.version;
  const dbHint = process.env.DATABASE_URL?.includes("neon") ? "Neon" : "Postgres";
  const block = `## ${ts}

- Runner: Node ${node}, ${dbHint}
- Embedding source: **${args.embedSource}**${args.embedSource === "openai" ? " (text-embedding-3-small)" : " (synthetic unit vectors)"}
- Queries per size: ${args.queries}, top-K: ${args.topK}
- Sizes: ${args.sizes.join(", ")}

${renderTable(rows, args.queries)}

`;
  await appendFile(path, block);
  console.log(`  recorded results to ${path}`);
}

interface BenchOutcome {
  startedAt: string;
  finishedAt: string;
  commit: string | null;
  database: string;
  embedDims: number;
  queries: number;
  topK: number;
  thresholdP95Ms: number;
  warnP95Ms: number;
  embedSource: EmbedSource;
  results: Array<{
    size: number;
    totalRowsAtRun: number;
    single: Stats;
    multi: Stats;
  }>;
  failed: string[];
  warned: string[];
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set — aborting.");
    process.exit(1);
  }

  if (isProductionLike(process.env.DATABASE_URL) && !args.allowProduction) {
    console.error(
      "Refusing to run: DATABASE_URL looks production-like. Pass --allow-production to override.",
    );
    process.exit(2);
  }

  // Sanity check: extension + table.
  const probe = await pool.query<{ has_table: boolean; has_ext: boolean }>(
    `SELECT
       EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vector_chunks') AS has_table,
       EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS has_ext`,
  );
  if (!probe.rows[0]?.has_table || !probe.rows[0]?.has_ext) {
    console.error(
      "vector_chunks table or pgvector extension missing. Run db:push first.",
    );
    process.exit(1);
  }

  if (args.embedSource === "openai" && !isEmbeddingAvailable()) {
    console.error(
      "--embed-source=openai requires OPENAI_API_KEY (or equivalent) to be set.",
    );
    process.exit(1);
  }

  console.log("Vector store benchmark");
  console.log(`  embed source: ${args.embedSource}`);
  console.log(`  sizes: ${args.sizes.join(", ")}, queries/size: ${args.queries}, top-K: ${args.topK}`);
  console.log(`  bench namespace: ${BENCH_NAMESPACE}, id prefix: ${BENCH_ID_PREFIX}`);

  const startedAt = new Date().toISOString();
  const sortedSizes = [...args.sizes].sort((a, b) => a - b);
  const results: Array<Awaited<ReturnType<typeof benchAtSize>>> = [];
  const failed: string[] = [];
  const warned: string[] = [];
  let exitCode = 0;
  try {
    for (const size of sortedSizes) {
      console.log(`\nSize: ${size.toLocaleString()}`);
      await seedTo(size, args.insertBatch, args.embedSource);
      const r = await benchAtSize(size, args.queries, args.topK, args.embedSource);
      results.push(r);
      console.log(
        `  single-ns:    p50=${fmt(r.single.p50Ms)}ms  p95=${fmt(r.single.p95Ms)}ms  mean=${fmt(r.single.meanMs)}ms  max=${fmt(r.single.maxMs)}ms`,
      );
      console.log(
        `  multi-ns(7):  p50=${fmt(r.multi.p50Ms)}ms  p95=${fmt(r.multi.p95Ms)}ms  mean=${fmt(r.multi.meanMs)}ms  max=${fmt(r.multi.maxMs)}ms`,
      );

      // Threshold checks: evaluate against single-namespace and multi-namespace
      // p95 separately so the CI summary makes the failure source obvious.
      const checks: Array<{ label: string; p95: number }> = [
        { label: `size=${size} single`, p95: r.single.p95Ms },
        { label: `size=${size} multi`, p95: r.multi.p95Ms },
      ];
      for (const c of checks) {
        if (args.thresholdP95Ms > 0 && c.p95 > args.thresholdP95Ms) {
          failed.push(`${c.label}: p95=${fmt(c.p95)}ms > ${args.thresholdP95Ms}ms`);
        } else if (args.warnP95Ms > 0 && c.p95 > args.warnP95Ms) {
          warned.push(`${c.label}: p95=${fmt(c.p95)}ms > ${args.warnP95Ms}ms`);
        }
      }
    }

    console.log("\n" + renderTable(results, args.queries));

    if (args.record && results.length > 0) {
      await recordResults(RESULTS_PATH, results, args);
    }
  } catch (err) {
    exitCode = 2;
    console.error("Benchmark failed:", err instanceof Error ? err.message : err);
  } finally {
    if (!args.keep) {
      try {
        await cleanup();
      } catch (err) {
        console.error("Cleanup failed:", err instanceof Error ? err.message : err);
      }
    } else {
      console.log("  --keep set: leaving synthetic rows in place");
    }
    await pool.end().catch(() => {});
  }

  // Always emit a structured JSON summary so CI can parse / surface it,
  // regardless of whether --json-out is set.
  const outcome: BenchOutcome = {
    startedAt,
    finishedAt: new Date().toISOString(),
    commit: process.env.GITHUB_SHA || process.env.COMMIT_SHA || null,
    database: redactDsn(process.env.DATABASE_URL),
    embedDims: EMBED_DIMS,
    queries: args.queries,
    topK: args.topK,
    thresholdP95Ms: args.thresholdP95Ms,
    warnP95Ms: args.warnP95Ms,
    embedSource: args.embedSource,
    results: results.map((r) => ({
      size: r.size,
      totalRowsAtRun: r.totalRowsAtRun,
      single: r.single,
      multi: r.multi,
    })),
    failed,
    warned,
  };
  console.log("\n=== vector-bench JSON ===");
  console.log(JSON.stringify(outcome, null, 2));

  if (args.jsonOut) {
    try {
      await mkdir(dirname(args.jsonOut), { recursive: true });
      await writeFile(args.jsonOut, JSON.stringify(outcome, null, 2));
    } catch (err) {
      console.error("Failed to write --json-out:", err instanceof Error ? err.message : err);
    }
  }

  if (failed.length > 0) {
    console.error(`\nvector-bench FAIL:\n${failed.map((m) => "  - " + m).join("\n")}`);
    if (exitCode === 0) exitCode = 1;
  }
  if (warned.length > 0) {
    console.warn(`\nvector-bench WARN:\n${warned.map((m) => "  - " + m).join("\n")}`);
  }

  process.exit(exitCode);
}

void main();
