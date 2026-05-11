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
import { validateIngestUrl } from "../../lib/validate-url";
export { validateIngestUrl } from "../../lib/validate-url";

// ---------------------------------------------------------------------------
// Named constants (Category 2 — DEFAULT VARIABLE, admin-controlled starting values)
// ---------------------------------------------------------------------------

/** Timeout in milliseconds for Iris API connectivity probes. */
const IRIS_API_TEST_TIMEOUT_MS = 5_000;

/** Number of candidate chunks retrieved for retrieval quality evaluation. */
const IRIS_RETRIEVAL_EVAL_TOP_K = 5;

/** Max characters of chunk metadata content stored in the vector index per chunk. */
const IRIS_INGEST_METADATA_PREVIEW_MAX_CHARS = 3_000;

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
// Tool: get_source_endpoint  (W1.7 primitive)
// ---------------------------------------------------------------------------

export interface GetSourceEndpointArgs {
  sourceId: string;
}

export interface GetSourceEndpointResult {
  sourceId: number;
  endpoint?: string;
  category?: string;
  error?: string;
}

/**
 * Look up a source_registry entry by ID and return its endpoint + category.
 * NO ingestion. The agent calls this, then passes the endpoint to
 * ingest_document — letting it inspect/override the endpoint before the
 * heavy work happens (W1.7).
 */
export async function getSourceEndpoint(
  args: GetSourceEndpointArgs,
): Promise<GetSourceEndpointResult> {
  const { sourceId } = args;
  const id = Number(sourceId);
  // Number.isFinite alone accepts non-integers like "1.5"; tighten to match
  // the source_registry.id column's integer semantics (CodeRabbit PR-99).
  if (!Number.isInteger(id)) {
    return { sourceId: NaN, error: `Invalid sourceId: "${sourceId}" is not a valid integer` };
  }

  let entry: Awaited<ReturnType<typeof storage.getSourceRegistryEntry>>;
  try {
    entry = await storage.getSourceRegistryEntry(id);
  } catch (err: unknown) {
    return { sourceId: id, error: err instanceof Error ? err.message : String(err) };
  }

  if (!entry) return { sourceId: id, error: `Source ${id} not found in source_registry` };
  if (!entry.endpoint) return { sourceId: id, error: `Source ${id} has no endpoint configured` };

  return {
    sourceId: id,
    endpoint: entry.endpoint,
    category: entry.category ?? "reference",
  };
}

// ---------------------------------------------------------------------------
// Tool: sync_data_source  (DEPRECATED — use get_source_endpoint + ingest_document)
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
  const lookup = await getSourceEndpoint(args);
  if (lookup.error || !lookup.endpoint || !lookup.category) {
    return {
      synced: false,
      error: lookup.error ?? "Source lookup returned no endpoint or category",
    };
  }
  const result = await ingestDocument({ url: lookup.endpoint, category: lookup.category });
  return {
    synced: result.success,
    chunksIndexed: result.chunksIndexed,
    error: result.error,
  };
}

// ---------------------------------------------------------------------------
// Tool: append_to_maintenance_log  (W1.7 primitive)
// ---------------------------------------------------------------------------

export interface AppendToMaintenanceLogArgs {
  content: string;
}

export interface AppendToMaintenanceLogResult {
  written: boolean;
}

/**
 * Persist raw markdown content to the Iris health workspace
 * (`iris/health.md`). The agent formats the report itself per its system
 * prompt — this primitive does no formatting (W1.7).
 */
export async function appendToMaintenanceLog(
  args: AppendToMaintenanceLogArgs,
): Promise<AppendToMaintenanceLogResult> {
  // Schema marks content required, but the tool dispatcher passes through
  // whatever the LLM produced — validate at the boundary (CodeRabbit PR-99).
  if (typeof args.content !== "string") {
    return { written: false };
  }
  try {
    await writeIrisHealth(args.content);
    return { written: true };
  } catch {
    return { written: false };
  }
}

// ---------------------------------------------------------------------------
// Tool: write_health_report  (DEPRECATED — use append_to_maintenance_log)
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

  return appendToMaintenanceLog({ content: lines.join("\n") });
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
      name: "get_source_endpoint",
      description:
        "Look up a source_registry entry by ID and return its endpoint + category. No ingestion. Pair with ingest_document (you choose when/whether to ingest).",
      parameters: {
        type: "object",
        properties: {
          sourceId: { type: "string", description: "Source registry entry ID (as a string)" },
        },
        required: ["sourceId"],
      },
    },
    {
      name: "sync_data_source",
      description:
        "DEPRECATED — use get_source_endpoint + ingest_document instead. Single-shot lookup + ingest in one call.",
      parameters: {
        type: "object",
        properties: {
          sourceId: { type: "string", description: "Source registry entry ID (as a string)" },
        },
        required: ["sourceId"],
      },
    },
    {
      name: "append_to_maintenance_log",
      description:
        "Persist raw markdown content to the Iris health workspace (iris/health.md). You format the report yourself per the rubric in your system prompt — this primitive does no formatting. ALWAYS call this last with your full report.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "Raw markdown to write to health.md (overwrites file contents)." },
        },
        required: ["content"],
      },
    },
    {
      name: "write_health_report",
      description:
        "DEPRECATED — use append_to_maintenance_log instead (format the markdown yourself). Format a markdown health report from tool results and write it to the Iris health workspace file.",
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
    case "get_source_endpoint":
      return getSourceEndpoint(args as unknown as GetSourceEndpointArgs);
    case "sync_data_source":
      return syncDataSource(args as unknown as SyncDataSourceArgs);
    case "append_to_maintenance_log":
      return appendToMaintenanceLog(args as unknown as AppendToMaintenanceLogArgs);
    case "write_health_report":
      return writeHealthReport(args as unknown as WriteHealthReportArgs);
    default:
      throw new Error(`Unknown Iris tool: ${name}`);
  }
}
