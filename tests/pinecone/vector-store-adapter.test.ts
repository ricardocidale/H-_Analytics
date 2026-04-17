import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../server/storage/vector-store", () => {
  const query = vi.fn();
  return { vectorStorePool: { query } };
});

vi.mock("openai", () => ({
  default: class {
    embeddings = {
      create: vi.fn(async ({ input }: { input: string | string[] }) => {
        const items = Array.isArray(input) ? input : [input];
        return {
          data: items.map(() => ({ embedding: Array.from({ length: 1536 }, (_, i) => i / 1536) })),
        };
      }),
    };
  },
}));

import {
  upsertChunks,
  queryChunks,
  multiNamespaceQuery,
  deleteVectors,
  vectorCount,
  getNamespaceStats,
  cleanupPropertyVectors,
  checkVectorStoreReady,
  isVectorStoreAvailable,
  __resetVectorStoreAvailabilityCache,
  ALL_NAMESPACES,
} from "../../server/ai/pinecone-service";
import { vectorStorePool } from "../../server/storage/vector-store";

const query = vectorStorePool.query as unknown as ReturnType<typeof vi.fn>;

function mockReady() {
  query.mockResolvedValueOnce({ rows: [{ has_table: true, has_ext: true }] });
}

async function primeReady() {
  mockReady();
  await checkVectorStoreReady();
}

describe("pgvector adapter — public API contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetVectorStoreAvailabilityCache();
    process.env.DATABASE_URL = "postgres://test";
    process.env.OPENAI_API_KEY = "sk-test";
  });

  it("checkVectorStoreReady returns true when extension and table exist", async () => {
    await primeReady();
    await expect(checkVectorStoreReady()).resolves.toBe(true);
    expect(isVectorStoreAvailable()).toBe(true);
  });

  it("checkVectorStoreReady returns false when extension is missing", async () => {
    query.mockResolvedValueOnce({ rows: [{ has_table: true, has_ext: false }] });
    await expect(checkVectorStoreReady()).resolves.toBe(false);
  });

  it("upsertChunks issues a parameterized INSERT … ON CONFLICT per namespace", async () => {
    await primeReady();
    query.mockResolvedValueOnce({ rows: [] });
    await upsertChunks("knowledge-base", [
      { id: "kb:1", text: "hello", metadata: { foo: "bar" } },
    ]);
    const insertCall = query.mock.calls.find(([sql]) => /INSERT INTO vector_chunks/i.test(String(sql)));
    expect(insertCall).toBeDefined();
    expect(String(insertCall![0])).toMatch(/ON CONFLICT \(namespace, id\) DO UPDATE/);
    expect(insertCall![1]).toEqual(
      expect.arrayContaining(["knowledge-base", "kb:1", "hello"]),
    );
  });

  it("queryChunks orders by cosine distance and returns score = 1 - distance", async () => {
    await primeReady();
    query.mockResolvedValueOnce({
      rows: [
        { id: "a", metadata: {}, score: 0.9 },
        { id: "b", metadata: {}, score: 0.7 },
      ],
    });
    const matches = await queryChunks("research-history", "savannah hotel adr", 5);
    const sql = String(query.mock.calls.at(-1)![0]);
    expect(sql).toMatch(/embedding <=> \$2::vector/);
    expect(sql).toMatch(/ORDER BY embedding <=> \$2::vector ASC/);
    expect(matches.map((m) => m.id)).toEqual(["a", "b"]);
    expect(matches[0].score).toBeCloseTo(0.9);
  });

  it("queryChunks adds metadata @> filter when provided", async () => {
    await primeReady();
    query.mockResolvedValueOnce({ rows: [] });
    await queryChunks("documents", "operating agreement", 3, { propertyId: 7 });
    const sql = String(query.mock.calls.at(-1)![0]);
    expect(sql).toMatch(/metadata @> \$3::jsonb/);
  });

  it("multiNamespaceQuery isolates each namespace and merges by score", async () => {
    await primeReady();
    query
      .mockResolvedValueOnce({ rows: [{ id: "kb-1", metadata: {}, score: 0.95 }] })
      .mockResolvedValueOnce({ rows: [{ id: "rh-1", metadata: {}, score: 0.85 }] });
    const merged = await multiNamespaceQuery("hotel benchmarks", [
      "knowledge-base",
      "research-history",
    ], 3);
    expect(merged).toHaveLength(2);
    expect(merged[0].score).toBeGreaterThanOrEqual(merged[1].score);
    expect(new Set(merged.map((m) => m.namespace))).toEqual(
      new Set(["knowledge-base", "research-history"]),
    );
  });

  it("deleteVectors deletes by namespace + id ANY()", async () => {
    await primeReady();
    query.mockResolvedValueOnce({ rows: [] });
    await deleteVectors("scenarios", ["scenario:1", "scenario:2"]);
    const sql = String(query.mock.calls.at(-1)![0]);
    expect(sql).toMatch(/DELETE FROM vector_chunks WHERE namespace = \$1 AND id = ANY\(\$2::text\[\]\)/);
  });

  it("vectorCount returns COUNT(*) for a single namespace", async () => {
    await primeReady();
    query.mockResolvedValueOnce({ rows: [{ count: "42" }] });
    await expect(vectorCount("comparables")).resolves.toBe(42);
  });

  it("getNamespaceStats returns counts for every known namespace", async () => {
    await primeReady();
    query.mockResolvedValueOnce({
      rows: [
        { namespace: "knowledge-base", count: "10" },
        { namespace: "comparables", count: "3" },
      ],
    });
    const stats = await getNamespaceStats();
    for (const ns of ALL_NAMESPACES) expect(stats[ns]).toBeGreaterThanOrEqual(0);
    expect(stats["knowledge-base"]).toBe(10);
    expect(stats["comparables"]).toBe(3);
    expect(stats["scenarios"]).toBe(0);
  });

  it("cleanupPropertyVectors deletes from each property-bearing namespace", async () => {
    await primeReady();
    for (let i = 0; i < 5; i++) query.mockResolvedValueOnce({ rows: [] });
    await cleanupPropertyVectors(99);
    const deletes = query.mock.calls.filter(([sql]) =>
      /DELETE FROM vector_chunks/.test(String(sql)),
    );
    expect(deletes.length).toBeGreaterThanOrEqual(5);
    for (const [, params] of deletes) {
      expect((params as unknown[])[1]).toBe("property:99%");
    }
  });
});
