/**
 * Unit tests for the Iris atomic tools (U2).
 *
 * Vector-store primitives and the Iris workspace helpers are mocked so that
 * tests run without a live database or OpenAI key. The `test_api_connection`
 * tests use real network calls (or AbortSignal.timeout failures) because the
 * tool's contract is that it never throws — observing the return value is
 * sufficient.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — must be declared before any imports that load the mocked
// modules. Vitest hoists vi.mock() calls to the top of the file.
// ---------------------------------------------------------------------------

vi.mock("../../../ai/vector-store-service", () => ({
  isVectorStoreAvailable: vi.fn(() => true),
  upsertChunks: vi.fn(async () => undefined),
  queryChunks: vi.fn(async () => []),
  vectorCount: vi.fn(async () => 0),
  pruneOrphanedVectors: vi.fn(async () => 0),
  listVectorIds: vi.fn(async () => []),
}));

vi.mock("../../../ai/knowledge-base", () => ({
  splitIntoChunks: vi.fn(() => []),
}));

vi.mock("../../../storage", () => ({
  storage: {
    getSourceRegistryEntry: vi.fn(async () => undefined),
  },
}));

vi.mock("../../../ai/iris/workspace", () => ({
  writeIrisHealth: vi.fn(async () => undefined),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  ingestDocument,
  pruneStaleEntries,
  testApiConnection,
  evaluateRetrievalQuality,
  syncDataSource,
  writeHealthReport,
  getIrisTools,
  dispatchIrisTool,
} from "../../../ai/iris/tools";

import * as vectorStore from "../../../ai/vector-store-service";
import * as kb from "../../../ai/knowledge-base";
import * as workspaceModule from "../../../ai/iris/workspace";
import { storage } from "../../../storage";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockIsAvailable(value: boolean) {
  vi.mocked(vectorStore.isVectorStoreAvailable).mockReturnValue(value);
}

// ---------------------------------------------------------------------------
// getIrisTools
// ---------------------------------------------------------------------------

describe("getIrisTools", () => {
  it("returns an array of 6 tool definitions", () => {
    const tools = getIrisTools();
    expect(tools).toHaveLength(6);
    const names = tools.map((t) => t.name);
    expect(names).toContain("ingest_document");
    expect(names).toContain("prune_stale_entries");
    expect(names).toContain("test_api_connection");
    expect(names).toContain("evaluate_retrieval_quality");
    expect(names).toContain("sync_data_source");
    expect(names).toContain("write_health_report");
  });

  it("each tool has name, description, and parameters", () => {
    for (const tool of getIrisTools()) {
      expect(typeof tool.name).toBe("string");
      expect(typeof tool.description).toBe("string");
      expect(tool.parameters).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// dispatchIrisTool
// ---------------------------------------------------------------------------

describe("dispatchIrisTool", () => {
  it("throws on unknown tool name", async () => {
    await expect(
      dispatchIrisTool("no_such_tool", {}),
    ).rejects.toThrow("Unknown Iris tool: no_such_tool");
  });

  it("routes write_health_report to writeHealthReport", async () => {
    const result = await dispatchIrisTool("write_health_report", { results: [] });
    expect(result).toHaveProperty("written");
  });
});

// ---------------------------------------------------------------------------
// ingest_document
// ---------------------------------------------------------------------------

describe("ingestDocument", () => {
  beforeEach(() => {
    mockIsAvailable(true);
    vi.mocked(kb.splitIntoChunks).mockReturnValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when neither url nor filePath is provided", async () => {
    const result = await ingestDocument({ category: "reference" });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/url or filePath/i);
  });

  it("returns error when vector store is unavailable", async () => {
    mockIsAvailable(false);
    const result = await ingestDocument({ url: "https://example.com", category: "reference" });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/vector store/i);
  });

  it("returns chunksIndexed=0 when splitIntoChunks returns empty", async () => {
    vi.mocked(kb.splitIntoChunks).mockReturnValue([]);
    // We mock fetch for this test
    const mockFetch = vi.fn(async () =>
      new Response("# Doc\n\nSome content", { status: 200 })
    );
    vi.stubGlobal("fetch", mockFetch);

    const result = await ingestDocument({ url: "https://example.com", category: "reference" });
    expect(result.success).toBe(true);
    expect(result.chunksIndexed).toBe(0);

    vi.unstubAllGlobals();
  });

  it("calls upsertChunks and returns chunksIndexed when chunks exist", async () => {
    const fakeChunks = [
      { title: "T1", content: "C1", source: "src1", category: "reference" },
      { title: "T2", content: "C2", source: "src1", category: "reference" },
    ];
    vi.mocked(kb.splitIntoChunks).mockReturnValue(fakeChunks);

    const mockFetch = vi.fn(async () =>
      new Response("# Doc\n\nSome content\n\nMore content here.", { status: 200 })
    );
    vi.stubGlobal("fetch", mockFetch);

    const result = await ingestDocument({ url: "https://example.com", category: "reference" });
    expect(result.success).toBe(true);
    expect(result.chunksIndexed).toBe(2);
    expect(vi.mocked(vectorStore.upsertChunks)).toHaveBeenCalledWith(
      "knowledge-base",
      expect.arrayContaining([
        expect.objectContaining({ id: "kb:src1:0", text: "T1\n\nC1" }),
        expect.objectContaining({ id: "kb:src1:1", text: "T2\n\nC2" }),
      ]),
    );

    vi.unstubAllGlobals();
  });
});

// ---------------------------------------------------------------------------
// prune_stale_entries
// ---------------------------------------------------------------------------

describe("pruneStaleEntries", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns prunedCount=0 when vector store is unavailable", async () => {
    mockIsAvailable(false);
    const result = await pruneStaleEntries({ maxAgeDays: 30 });
    expect(result.prunedCount).toBe(0);
    expect(result.error).toMatch(/vector store/i);
  });

  it("calls pruneOrphanedVectors with current valid IDs and returns count", async () => {
    mockIsAvailable(true);
    vi.mocked(vectorStore.listVectorIds).mockResolvedValue(["id-1", "id-2"]);
    vi.mocked(vectorStore.pruneOrphanedVectors).mockResolvedValue(3);

    const result = await pruneStaleEntries({ maxAgeDays: 30 });
    expect(result.prunedCount).toBe(3);
    expect(vi.mocked(vectorStore.pruneOrphanedVectors)).toHaveBeenCalledWith(
      "knowledge-base",
      ["id-1", "id-2"],
    );
  });

  it("returns prunedCount=0 when pruneOrphanedVectors returns 0", async () => {
    mockIsAvailable(true);
    vi.mocked(vectorStore.listVectorIds).mockResolvedValue([]);
    vi.mocked(vectorStore.pruneOrphanedVectors).mockResolvedValue(0);

    const result = await pruneStaleEntries({ maxAgeDays: 7 });
    expect(result.prunedCount).toBe(0);
    expect(result.error).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// test_api_connection
// ---------------------------------------------------------------------------

describe("testApiConnection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("returns { reachable: false } for an unreachable URL without throwing", async () => {
    // Use a URL that will fail with a connection error
    const result = await testApiConnection({
      sourceId: "test-src",
      url: "http://127.0.0.1:1", // port 1 is always refused
    });
    expect(result.reachable).toBe(false);
    expect(typeof result.latencyMs).toBe("number");
    expect(typeof result.errorMessage).toBe("string");
  });

  it("returns { reachable: true } when fetch succeeds", async () => {
    const mockFetch = vi.fn(async () => new Response("OK", { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    const result = await testApiConnection({
      sourceId: "test-src",
      url: "https://example.com",
    });
    expect(result.reachable).toBe(true);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.errorMessage).toBeUndefined();
  });

  it("returns { reachable: false } when fetch returns a non-ok status", async () => {
    const mockFetch = vi.fn(async () => new Response("Not Found", { status: 404 }));
    vi.stubGlobal("fetch", mockFetch);

    const result = await testApiConnection({
      sourceId: "test-src",
      url: "https://example.com/missing",
    });
    expect(result.reachable).toBe(false);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("returns { reachable: false } when fetch throws (AbortError / network error)", async () => {
    const mockFetch = vi.fn(async () => {
      throw new Error("Network error");
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await testApiConnection({
      sourceId: "test-src",
      url: "https://example.com",
    });
    expect(result.reachable).toBe(false);
    expect(result.errorMessage).toMatch(/Network error/);
  });
});

// ---------------------------------------------------------------------------
// evaluate_retrieval_quality
// ---------------------------------------------------------------------------

describe("evaluateRetrievalQuality", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns pass=false, count=0 when vector store is unavailable", async () => {
    mockIsAvailable(false);
    const result = await evaluateRetrievalQuality({
      testQuery: "hotel revenue",
      minExpectedResults: 1,
    });
    expect(result).toEqual({ pass: false, count: 0, testQuery: "hotel revenue" });
  });

  it("returns pass=false, count=0 when queryChunks returns empty (empty KB)", async () => {
    mockIsAvailable(true);
    vi.mocked(vectorStore.queryChunks).mockResolvedValue([]);

    const result = await evaluateRetrievalQuality({
      testQuery: "cap rate analysis",
      minExpectedResults: 1,
    });
    expect(result).toEqual({ pass: false, count: 0, testQuery: "cap rate analysis" });
  });

  it("returns pass=true when result count meets minExpectedResults", async () => {
    mockIsAvailable(true);
    vi.mocked(vectorStore.queryChunks).mockResolvedValue([
      { id: "1", text: "a", score: 0.9, metadata: {} },
      { id: "2", text: "b", score: 0.8, metadata: {} },
    ]);

    const result = await evaluateRetrievalQuality({
      testQuery: "occupancy rate",
      minExpectedResults: 2,
    });
    expect(result.pass).toBe(true);
    expect(result.count).toBe(2);
  });

  it("returns pass=false when result count falls below minExpectedResults", async () => {
    mockIsAvailable(true);
    vi.mocked(vectorStore.queryChunks).mockResolvedValue([
      { id: "1", text: "a", score: 0.9, metadata: {} },
    ]);

    const result = await evaluateRetrievalQuality({
      testQuery: "market research",
      minExpectedResults: 3,
    });
    expect(result.pass).toBe(false);
    expect(result.count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// sync_data_source
// ---------------------------------------------------------------------------

describe("syncDataSource", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns error for non-numeric sourceId", async () => {
    const result = await syncDataSource({ sourceId: "abc" });
    expect(result.synced).toBe(false);
    expect(result.error).toMatch(/Invalid sourceId/);
  });

  it("returns error when source not found in registry", async () => {
    vi.mocked(storage.getSourceRegistryEntry).mockResolvedValue(undefined);
    const result = await syncDataSource({ sourceId: "99" });
    expect(result.synced).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it("returns error when source has no endpoint", async () => {
    vi.mocked(storage.getSourceRegistryEntry).mockResolvedValue({
      id: 1,
      endpoint: null,
      category: "apis",
    } as never);
    const result = await syncDataSource({ sourceId: "1" });
    expect(result.synced).toBe(false);
    expect(result.error).toMatch(/no endpoint/i);
  });

  it("calls ingestDocument with source endpoint and returns result", async () => {
    vi.mocked(storage.getSourceRegistryEntry).mockResolvedValue({
      id: 1,
      endpoint: "https://example.com/data",
      category: "apis",
    } as never);
    mockIsAvailable(true);

    const fakeChunks = [
      { title: "T", content: "C", source: "https://example.com/data", category: "apis" },
    ];
    vi.mocked(kb.splitIntoChunks).mockReturnValue(fakeChunks);
    const mockFetch = vi.fn(async () => new Response("# Data\n\nContent here.", { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    const result = await syncDataSource({ sourceId: "1" });
    expect(result.synced).toBe(true);
    expect(result.chunksIndexed).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// write_health_report
// ---------------------------------------------------------------------------

describe("writeHealthReport", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls writeIrisHealth with a markdown report and returns { written: true }", async () => {
    const results = [
      { tool: "test_api_connection", success: true, details: "200 OK in 45ms" },
      { tool: "evaluate_retrieval_quality", success: false, details: "0 results returned" },
    ];

    const result = await writeHealthReport({ results });
    expect(result.written).toBe(true);
    expect(vi.mocked(workspaceModule.writeIrisHealth)).toHaveBeenCalledOnce();

    const markdown = vi.mocked(workspaceModule.writeIrisHealth).mock.calls[0][0];
    expect(markdown).toContain("# Iris Health Report");
    expect(markdown).toContain("test_api_connection");
    expect(markdown).toContain("PASS");
    expect(markdown).toContain("evaluate_retrieval_quality");
    expect(markdown).toContain("FAIL");
  });

  it("returns { written: false } when writeIrisHealth throws", async () => {
    vi.mocked(workspaceModule.writeIrisHealth).mockRejectedValueOnce(new Error("disk full"));

    const result = await writeHealthReport({
      results: [{ tool: "test_api_connection", success: true }],
    });
    expect(result.written).toBe(false);
  });

  it("formats summary line with pass count", async () => {
    const results = [
      { tool: "a", success: true },
      { tool: "b", success: true },
      { tool: "c", success: false },
    ];

    await writeHealthReport({ results });
    const markdown = vi.mocked(workspaceModule.writeIrisHealth).mock.calls[0][0];
    expect(markdown).toContain("2/3 tools passed");
  });
});
