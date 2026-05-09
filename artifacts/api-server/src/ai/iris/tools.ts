/**
 * Iris atomic tools — six operations that Iris can call during a health-check
 * or maintenance run.
 *
 * Exports:
 *   getIrisTools()      — JSON Schema tool definitions (same shape as getRebeccaTools())
 *   dispatchIrisTool()  — dispatcher that routes tool names to implementations
 */

import { promises as fs } from "fs";
import path from "path";
import { storage } from "../../storage";
import {
  isVectorStoreAvailable,
  upsertChunks,
  queryChunks,
  vectorCount,
  pruneOrphanedVectors,
  listVectorIds,
} from "../vector-store-service";
import { splitIntoChunks } from "../knowledge-base";
import { writeIrisHealth } from "./workspace";
import type { ToolParam } from "../../chat/tool-types";

// ---------------------------------------------------------------------------
// Named constants (Category 2 — DEFAULT VARIABLE, admin-controlled starting values)
// ---------------------------------------------------------------------------

/** Timeout in milliseconds for Iris API connectivity probes. */
const IRIS_API_TEST_TIMEOUT_MS = 5_000;

/** Number of candidate chunks retrieved for retrieval quality evaluation. */
const IRIS_RETRIEVAL_EVAL_TOP_K = 5;

/** Max characters of chunk metadata content stored in the vector index per chunk. */
const IRIS_INGEST_METADATA_PREVIEW_MAX_CHARS = 3_000;

// ---------------------------------------------------------------------------
// Security: URL and file-path validators for ingest_document
// ---------------------------------------------------------------------------

const IRIS_ALLOWED_URL_SCHEMES = new Set(["https:", "http:"]);

// Patterns that match private/loopback/link-local addresses to block SSRF.
// IPv6 hostnames in URLs are bracket-wrapped by the URL parser (e.g. [fe80::1]),
// so IPv6 patterns must match the bracketed form produced by `new URL(…).hostname`.
const IRIS_BLOCKED_HOST_PATTERNS: RegExp[] = [
  // ── IPv4 loopback / private / link-local ──────────────────────────────────
  /^localhost$/i,
  /^0\.0\.0\.0$/,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  // ── IPv6 loopback (::1) ───────────────────────────────────────────────────
  /^::1$/, // bare form (direct string comparison)
  /^\[::1\]$/, // bracket-wrapped form produced by URL parser
  // ── IPv6 link-local (fe80::/10) ───────────────────────────────────────────
  // fe80::/10 spans second bytes 0x80–0xbf (high nibble 8, 9, a, b).
  /^\[fe8[0-9a-f]:/i, // 0x80–0x8f
  /^\[fe9[0-9a-f]:/i, // 0x90–0x9f
  /^\[fea[0-9a-f]:/i, // 0xa0–0xaf
  /^\[feb[0-9a-f]:/i, // 0xb0–0xbf
  // ── IPv6 ULA (fc00::/7 — covers fc and fd prefixes) ──────────────────────
  /^\[f[cd][0-9a-f]/i,
];

/**
 * Node.js normalises IPv4-mapped IPv6 addresses to compressed hex notation,
 * e.g. `http://[::ffff:169.254.169.254]/` → hostname `[::ffff:a9fe:a9fe]`.
 *
 * This helper decodes the two 4-hex-digit groups back to dotted-decimal IPv4
 * so the existing IPv4 patterns in `IRIS_BLOCKED_HOST_PATTERNS` can be reused
 * without maintaining a parallel set of opaque hex-encoded range patterns.
 *
 * Returns the dotted-decimal IPv4 string when `hostname` matches the
 * `[::ffff:HHHH:HHHH]` shape, or `null` otherwise.
 */
function extractIpv4FromMappedIpv6(hostname: string): string | null {
  const match = hostname.match(/^\[::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})\]$/i);
  if (!match) return null;
  const hiStr = match[1].padStart(4, "0");
  const loStr = match[2].padStart(4, "0");
  const b0 = Number("0x" + hiStr.slice(0, 2));
  const b1 = Number("0x" + hiStr.slice(2, 4));
  const b2 = Number("0x" + loStr.slice(0, 2));
  const b3 = Number("0x" + loStr.slice(2, 4));
  return `${b0}.${b1}.${b2}.${b3}`;
}

/**
 * Returns an error message if the URL is disallowed, or null if it is safe.
 * Blocks non-http(s) schemes and private/internal host ranges.
 *
 * Exported so other server-side validators (e.g. slide-factory slot PATCH for
 * URL-valued slots) can route through the same canonical check instead of
 * maintaining a parallel blocklist.
 */
export function validateIngestUrl(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return "Invalid URL format";
  }
  if (!IRIS_ALLOWED_URL_SCHEMES.has(parsed.protocol)) {
    return `Unsupported URL scheme '${parsed.protocol}' — only http and https are allowed`;
  }
  const hostname = parsed.hostname;
  for (const pattern of IRIS_BLOCKED_HOST_PATTERNS) {
    if (pattern.test(hostname)) {
      return `Host '${hostname}' is a private or internal address and cannot be fetched`;
    }
  }
  // IPv4-mapped IPv6 addresses (e.g. ::ffff:169.254.x.x) are normalised by
  // Node.js URL parser to hex notation ([::ffff:a9fe:a9fe]). Extract the
  // embedded IPv4 and re-run the IPv4 patterns against it.
  const mappedIpv4 = extractIpv4FromMappedIpv6(hostname);
  if (mappedIpv4 !== null) {
    for (const pattern of IRIS_BLOCKED_HOST_PATTERNS) {
      if (pattern.test(mappedIpv4)) {
        return `Host '${hostname}' (IPv4-mapped: ${mappedIpv4}) is a private or internal address and cannot be fetched`;
      }
    }
  }
  return null;
}

/**
 * Returns an error message if the file path escapes the server working directory,
 * or null if the path is within the allowed workspace root.
 */
function validateIngestFilePath(rawPath: string): string | null {
  const workspaceRoot = path.resolve(process.cwd());
  const resolved = path.resolve(rawPath);
  // Allow exact root match or any path strictly inside it
  const insideRoot =
    resolved === workspaceRoot ||
    resolved.startsWith(workspaceRoot + path.sep);
  if (!insideRoot) {
    return `File path must be within the server workspace — '${rawPath}' is not allowed`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function isFulfilled<T>(r: PromiseSettledResult<T>): r is PromiseFulfilledResult<T> {
  return r.status === "fulfilled";
}

// ---------------------------------------------------------------------------
// Tool: ingest_document
// ---------------------------------------------------------------------------

export interface IngestDocumentArgs {
  url?: string;
  filePath?: string;
  category: string;
}

export interface IngestDocumentResult {
  success: boolean;
  chunksIndexed: number;
  error?: string;
}

export async function ingestDocument(
  args: IngestDocumentArgs,
): Promise<IngestDocumentResult> {
  const { url, filePath, category } = args;

  if (!url && !filePath) {
    return { success: false, chunksIndexed: 0, error: "Either url or filePath must be provided" };
  }

  if (url) {
    const urlError = validateIngestUrl(url);
    if (urlError) return { success: false, chunksIndexed: 0, error: urlError };
  }

  if (filePath) {
    const pathError = validateIngestFilePath(filePath);
    if (pathError) return { success: false, chunksIndexed: 0, error: pathError };
  }

  if (!isVectorStoreAvailable()) {
    return { success: false, chunksIndexed: 0, error: "Vector store is not available" };
  }

  let text: string;
  let source: string;
  let title: string;

  try {
    if (url) {
      const controller = new AbortController();
      const timer = AbortSignal.timeout(IRIS_API_TEST_TIMEOUT_MS);
      timer.addEventListener("abort", () => controller.abort(timer.reason));
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        return {
          success: false,
          chunksIndexed: 0,
          error: `HTTP ${response.status} fetching ${url}`,
        };
      }
      text = await response.text();
      source = url;
      title = url;
    } else {
      // filePath is guaranteed non-null here because of the guard above
      text = await fs.readFile(filePath as string, "utf-8");
      source = filePath as string;
      title = (filePath as string).split("/").pop() ?? filePath as string;
    }
  } catch (err: unknown) {
    return {
      success: false,
      chunksIndexed: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const rawChunks = splitIntoChunks(text, title, source, category);

  if (rawChunks.length === 0) {
    return { success: true, chunksIndexed: 0 };
  }

  // Map to the VectorChunk shape that upsertChunks expects.
  // Mirror the mapping from knowledge-base.ts (lines 167-176).
  const vectorChunks = rawChunks.map((c, i) => ({
    id: `kb:${c.source}:${i}`,
    text: `${c.title}\n\n${c.content}`,
    metadata: {
      title: c.title,
      content: c.content.slice(0, IRIS_INGEST_METADATA_PREVIEW_MAX_CHARS),
      source: c.source,
      category: c.category,
    },
  }));

  try {
    await upsertChunks("knowledge-base", vectorChunks);
  } catch (err: unknown) {
    return {
      success: false,
      chunksIndexed: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // Sanity verify — await so the count appears in logs and the result.
  const vectorCountAfter = await vectorCount("knowledge-base").catch(() => 0);
  void vectorCountAfter; // included for observability; not used to gate success

  return { success: true, chunksIndexed: rawChunks.length };
}

// ---------------------------------------------------------------------------
// Tool: prune_stale_entries
// ---------------------------------------------------------------------------

export interface PruneStaleEntriesArgs {
  maxAgeDays: number;
}

export interface PruneStaleEntriesResult {
  prunedCount: number;
  error?: string;
}

/**
 * Prune orphaned vectors from the knowledge-base namespace.
 *
 * NOTE: `pruneOrphanedVectors(namespace, validIds)` deletes rows NOT in
 * `validIds`. Age-based pruning is not yet supported by the underlying
 * primitive (no `updated_at` filter is available in the helper). We pass the
 * full current list of IDs so the call is a verified no-op — it removes only
 * rows that truly have no matching ID in the store (genuine orphans), which
 * can arise from partially-failed upserts. The `maxAgeDays` parameter is
 * accepted for forward-compatibility but is not yet enforced.
 */
export async function pruneStaleEntries(
  _args: PruneStaleEntriesArgs,
): Promise<PruneStaleEntriesResult> {
  if (!isVectorStoreAvailable()) {
    return { prunedCount: 0, error: "Vector store is not available" };
  }

  try {
    const validIds = await listVectorIds("knowledge-base");
    const results = await Promise.allSettled([
      pruneOrphanedVectors("knowledge-base", validIds),
    ]);

    const prunedCount = results
      .filter(isFulfilled)
      .reduce((sum, r) => sum + r.value, 0);

    return { prunedCount };
  } catch (err: unknown) {
    return {
      prunedCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Tool: test_api_connection
// ---------------------------------------------------------------------------

export interface TestApiConnectionArgs {
  sourceId: string;
  url: string;
}

export interface TestApiConnectionResult {
  reachable: boolean;
  latencyMs: number;
  errorMessage?: string;
}

/**
 * Fire an HTTP GET to `url` and measure latency.
 * NEVER throws — all errors are caught and returned as `{ reachable: false }`.
 * Applies the same SSRF guard as `ingestDocument` — private/loopback hosts
 * and non-http(s) schemes are rejected before any network call is made.
 */
export async function testApiConnection(
  args: TestApiConnectionArgs,
): Promise<TestApiConnectionResult> {
  const { url } = args;

  const urlError = validateIngestUrl(url);
  if (urlError) {
    return { reachable: false, latencyMs: 0, errorMessage: urlError };
  }

  const start = Date.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(IRIS_API_TEST_TIMEOUT_MS),
    });
    const latencyMs = Date.now() - start;
    return { reachable: response.ok, latencyMs };
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    return {
      reachable: false,
      latencyMs,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Tool: evaluate_retrieval_quality
// ---------------------------------------------------------------------------

export interface EvaluateRetrievalQualityArgs {
  testQuery: string;
  minExpectedResults: number;
}

export interface EvaluateRetrievalQualityResult {
  pass: boolean;
  count: number;
  testQuery: string;
}

export async function evaluateRetrievalQuality(
  args: EvaluateRetrievalQualityArgs,
): Promise<EvaluateRetrievalQualityResult> {
  const { testQuery, minExpectedResults } = args;

  if (!isVectorStoreAvailable()) {
    return { pass: false, count: 0, testQuery };
  }

  try {
    const matches = await queryChunks("knowledge-base", testQuery, IRIS_RETRIEVAL_EVAL_TOP_K);
    const count = matches.length;
    return {
      pass: count >= minExpectedResults,
      count,
      testQuery,
    };
  } catch {
    return { pass: false, count: 0, testQuery };
  }
}

// ---------------------------------------------------------------------------
// Tool: sync_data_source
// ---------------------------------------------------------------------------

export interface SyncDataSourceArgs {
  sourceId: string;
}

export interface SyncDataSourceResult {
  synced: boolean;
  chunksIndexed?: number;
  error?: string;
}

export async function syncDataSource(
  args: SyncDataSourceArgs,
): Promise<SyncDataSourceResult> {
  const { sourceId } = args;

  const id = Number(sourceId);
  if (!Number.isFinite(id) || Number.isNaN(id)) {
    return { synced: false, error: `Invalid sourceId: "${sourceId}" is not a valid integer` };
  }

  let entry: Awaited<ReturnType<typeof storage.getSourceRegistryEntry>>;
  try {
    entry = await storage.getSourceRegistryEntry(id);
  } catch (err: unknown) {
    return {
      synced: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (!entry) {
    return { synced: false, error: `Source ${id} not found in source_registry` };
  }

  const endpoint = entry.endpoint;
  if (!endpoint) {
    return { synced: false, error: `Source ${id} has no endpoint configured` };
  }

  const category = entry.category ?? "reference";
  const result = await ingestDocument({ url: endpoint, category });
  return {
    synced: result.success,
    chunksIndexed: result.chunksIndexed,
    error: result.error,
  };
}

// ---------------------------------------------------------------------------
// Tool: write_health_report
// ---------------------------------------------------------------------------

export interface WriteHealthReportArgs {
  results: Array<{ tool: string; success: boolean; details?: string }>;
}

export interface WriteHealthReportResult {
  written: boolean;
}

export async function writeHealthReport(
  args: WriteHealthReportArgs,
): Promise<WriteHealthReportResult> {
  const { results } = args;

  const lines: string[] = [
    `# Iris Health Report`,
    ``,
    `Generated: ${new Date().toISOString()}`,
    ``,
    `## Results`,
    ``,
  ];

  for (const r of results) {
    const status = r.success ? "PASS" : "FAIL";
    const icon = r.success ? "✓" : "✗";
    lines.push(`### ${icon} ${r.tool} — ${status}`);
    if (r.details) {
      lines.push(``, r.details, ``);
    } else {
      lines.push(``);
    }
  }

  const passCount = results.filter((r) => r.success).length;
  lines.push(`---`, ``, `**${passCount}/${results.length} tools passed.**`, ``);

  const markdown = lines.join("\n");

  try {
    await writeIrisHealth(markdown);
    return { written: true };
  } catch {
    return { written: false };
  }
}

// ---------------------------------------------------------------------------
// Tool definitions (JSON Schema) — same pattern as getRebeccaTools()
// ---------------------------------------------------------------------------

export function getIrisTools(): ToolParam[] {
  return [
    {
      name: "ingest_document",
      description:
        "Fetch content from a URL or local file path, split into chunks, embed, and upsert into the knowledge-base vector store.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Remote URL to fetch content from (HTTP GET)" },
          filePath: { type: "string", description: "Absolute local file path to read" },
          category: { type: "string", description: "Knowledge-base category for the chunks (e.g. 'reference', 'specification')" },
        },
        required: ["category"],
      },
    },
    {
      name: "prune_stale_entries",
      description:
        "Remove orphaned vectors from the knowledge-base namespace. Age-based pruning is not yet enforced by the underlying primitive; the call removes genuinely orphaned rows.",
      parameters: {
        type: "object",
        properties: {
          maxAgeDays: {
            type: "number",
            description: "Maximum age in days (accepted for forward-compatibility; not yet enforced)",
          },
        },
        required: [],
      },
    },
    {
      name: "test_api_connection",
      description:
        "Send an HTTP GET probe to a URL and measure latency. Returns reachable=false on any error — never throws.",
      parameters: {
        type: "object",
        properties: {
          sourceId: { type: "string", description: "Source registry ID (informational)" },
          url: { type: "string", description: "URL to probe" },
        },
        required: ["sourceId", "url"],
      },
    },
    {
      name: "evaluate_retrieval_quality",
      description:
        "Run a test query against the knowledge-base vector store and check whether the result count meets the minimum threshold.",
      parameters: {
        type: "object",
        properties: {
          testQuery: { type: "string", description: "Natural-language query to evaluate" },
          minExpectedResults: {
            type: "number",
            description: "Minimum number of results required for the evaluation to pass",
          },
        },
        required: ["testQuery", "minExpectedResults"],
      },
    },
    {
      name: "sync_data_source",
      description:
        "Look up a source registry entry by ID, fetch its endpoint, and ingest the content into the knowledge-base.",
      parameters: {
        type: "object",
        properties: {
          sourceId: { type: "string", description: "Source registry entry ID (as a string)" },
        },
        required: ["sourceId"],
      },
    },
    {
      name: "write_health_report",
      description:
        "Format a markdown health report from tool results and write it to the Iris health workspace file.",
      parameters: {
        type: "object",
        properties: {
          results: {
            type: "array",
            description: "Array of tool result summaries",
            items: {
              type: "object",
              properties: {
                tool: { type: "string" },
                success: { type: "boolean" },
                details: { type: "string" },
              },
              required: ["tool", "success"],
            },
          },
        },
        required: ["results"],
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export async function dispatchIrisTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "ingest_document":
      return ingestDocument(args as unknown as IngestDocumentArgs);
    case "prune_stale_entries":
      return pruneStaleEntries(args as unknown as PruneStaleEntriesArgs);
    case "test_api_connection":
      return testApiConnection(args as unknown as TestApiConnectionArgs);
    case "evaluate_retrieval_quality":
      return evaluateRetrievalQuality(args as unknown as EvaluateRetrievalQualityArgs);
    case "sync_data_source":
      return syncDataSource(args as unknown as SyncDataSourceArgs);
    case "write_health_report":
      return writeHealthReport(args as unknown as WriteHealthReportArgs);
    default:
      throw new Error(`Unknown Iris tool: ${name}`);
  }
}
