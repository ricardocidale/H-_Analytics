/**
 * Integration tests for the pgvector-backed vector store.
 *
 * Runs the real `vector-store-service` (pgvector) against a live Postgres +
 * pgvector instance. The OpenAI client is mocked so embeddings are
 * deterministic — every test text is mapped to a sparse 1536-dim vector
 * whose nonzero slots determine cosine similarity in a predictable way.
 *
 * The suite skips itself gracefully if `DATABASE_URL` is unset or the
 * `vector` extension cannot be created (e.g. running locally against vanilla
 * Postgres). CI provisions `pgvector/pgvector:pg16` so the suite always
 * runs there.
 *
 * Coverage:
 *   - upsertChunks (insert + ON CONFLICT update)
 *   - queryChunks (cosine ordering, with and without metadata @> filter)
 *   - multiNamespaceQuery (namespace isolation, score-merged top-K)
 *   - deleteVectors
 *   - cleanupPropertyVectors (prefix + exact-id deletion across namespaces)
 *   - getNamespaceStats
 *   - vectorCount
 *   - HNSW index existence (best-effort) and namespace isolation invariant
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Deterministic embedding registry ─────────────────────────────────────────
//
// Each test string maps to a sparse unit vector with a single 1.0 in a known
// slot. Cosine similarity is then exactly 1 between identical "concepts" and
// 0 between distinct ones. A few "blended" vectors (two slots) let us exercise
// strict ordering: query close to A returns A before B.

const EMBED_DIMS = 1536;
const SLOT = {
  alpha: 1,
  beta: 2,
  gamma: 3,
  delta: 4,
  epsilon: 5,
} as const;

function unitVec(slot: number): number[] {
  const v = new Array<number>(EMBED_DIMS).fill(0);
  v[slot] = 1;
  return v;
}

function blendedVec(primarySlot: number, secondarySlot: number): number[] {
  // |v| = sqrt(1 + 0.25) ≈ 1.118 — primary dominates so cosine to primary
  // unit vector ≈ 0.894 vs ≈ 0.447 to the secondary one.
  const v = new Array<number>(EMBED_DIMS).fill(0);
  v[primarySlot] = 1;
  v[secondarySlot] = 0.5;
  return v;
}

const EMBEDDING_REGISTRY: Record<string, number[]> = {
  "text:alpha": unitVec(SLOT.alpha),
  "text:beta": unitVec(SLOT.beta),
  "text:gamma": unitVec(SLOT.gamma),
  "text:delta": unitVec(SLOT.delta),
  "text:epsilon": unitVec(SLOT.epsilon),
  "query:alpha-leaning": blendedVec(SLOT.alpha, SLOT.beta),
  "query:beta-leaning": blendedVec(SLOT.beta, SLOT.alpha),
  "query:gamma-only": unitVec(SLOT.gamma),
};

function embeddingFor(text: string): number[] {
  if (text in EMBEDDING_REGISTRY) return EMBEDDING_REGISTRY[text];
  // Anything outside the registry gets a stable but distinct slot derived from
  // a tiny string hash — used only for "doesn't matter" inputs.
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return unitVec(100 + (h % 1000));
}

vi.mock("openai", () => ({
  default: class FakeOpenAI {
    embeddings = {
      create: async ({ input }: { input: string | string[] }) => {
        const items = Array.isArray(input) ? input : [input];
        return { data: items.map((t) => ({ embedding: embeddingFor(t) })) };
      },
    };
  },
}));

// ── Live DB plumbing ─────────────────────────────────────────────────────────

// We import the real service (no pool mock). server/db.ts requires
// DATABASE_URL — guard the import behind a runtime check so the suite skips
// cleanly when the env var is missing.

const HAS_DB = !!process.env.DATABASE_URL;
process.env.OPENAI_API_KEY ||= "sk-test";

// Test namespace prefix isolates rows from any pre-existing data and from
// other suites that share the same database.
const NS_PREFIX = "__pgvtest__";
const TEST_NAMESPACES = [
  "knowledge-base",
  "research-history",
  "documents",
  "scenarios",
  "properties",
  "comparables",
  "assumption-guidance",
] as const;

let pgvectorAvailable = false;
let svc: typeof import("../../server/ai/vector-store-service");
let pool: import("../../server/storage/vector-store")["vectorStorePool"];

async function loadMigration(): Promise<string> {
  const file = path.resolve(__dirname, "../../migrations/0012_pgvector_store.sql");
  return fs.readFileSync(file, "utf8");
}

async function applyMigration(): Promise<void> {
  const sql = await loadMigration();
  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of statements) {
    await pool.query(stmt);
  }
}

async function clearTestRows(): Promise<void> {
  await pool.query(
    `DELETE FROM vector_chunks WHERE namespace LIKE $1`,
    [`${NS_PREFIX}%`],
  );
}

// ── Suite ────────────────────────────────────────────────────────────────────

const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb("pgvector integration — vector store backend", () => {
  beforeAll(async () => {
    svc = await import("../../server/ai/vector-store-service");
    ({ vectorStorePool: pool } = await import("../../server/storage/vector-store"));

    try {
      await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
      const { rows } = await pool.query<{ has_ext: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname='vector') AS has_ext`,
      );
      pgvectorAvailable = !!rows[0]?.has_ext;
    } catch {
      pgvectorAvailable = false;
    }

    if (!pgvectorAvailable) return;

    await applyMigration();
    svc.__resetVectorStoreAvailabilityCache();
    const ready = await svc.checkVectorStoreReady();
    if (!ready) {
      pgvectorAvailable = false;
    }
  }, 30_000);

  beforeEach(async () => {
    if (!pgvectorAvailable) return;
    await clearTestRows();
  });

  afterAll(async () => {
    if (!pgvectorAvailable) return;
    await clearTestRows();
  });

  const itPg = (name: string, fn: () => Promise<void>) =>
    it(name, async () => {
      if (!pgvectorAvailable) {
        // eslint-disable-next-line no-console
        console.warn(`[pgvector-integration] skipping "${name}": pgvector not available`);
        return;
      }
      await fn();
    });

  // Cast namespaces — they don't have to be in ALL_NAMESPACES for the SQL
  // layer (it's just a text column), but keeping them within the union pleases
  // the typed signatures of the public API.
  const ns = (suffix: string) =>
    (`${NS_PREFIX}${suffix}` as unknown) as (typeof TEST_NAMESPACES)[number];

  itPg("upserts chunks and is idempotent on (namespace, id)", async () => {
    const N = ns("kb-1");
    await svc.upsertChunks(N, [
      { id: "doc-1", text: "text:alpha", metadata: { source: "v1" } },
    ]);
    await svc.upsertChunks(N, [
      { id: "doc-1", text: "text:alpha", metadata: { source: "v2" } },
    ]);
    const { rows } = await pool.query<{ count: string; metadata: { source: string } }>(
      `SELECT COUNT(*)::text AS count, MAX(metadata::text) AS metadata
         FROM vector_chunks WHERE namespace = $1`,
      [N],
    );
    expect(Number(rows[0].count)).toBe(1);

    const matches = await svc.queryChunks(N, "text:alpha", 1);
    expect(matches[0].id).toBe("doc-1");
    expect((matches[0].metadata as { source: string }).source).toBe("v2");
  });

  itPg("queryChunks returns matches ordered by cosine similarity", async () => {
    const N = ns("kb-rank");
    await svc.upsertChunks(N, [
      { id: "alpha", text: "text:alpha", metadata: {} },
      { id: "beta", text: "text:beta", metadata: {} },
      { id: "gamma", text: "text:gamma", metadata: {} },
    ]);

    const matches = await svc.queryChunks(N, "query:alpha-leaning", 3);
    expect(matches.map((m) => m.id)[0]).toBe("alpha");
    // Strictly higher similarity to alpha than to gamma (gamma is orthogonal).
    const score = (id: string) =>
      matches.find((m) => m.id === id)?.score ?? Number.NaN;
    expect(score("alpha")).toBeGreaterThan(score("beta"));
    expect(score("beta")).toBeGreaterThan(score("gamma") - 1e-9);
    expect(score("gamma")).toBeCloseTo(0, 5);
  });

  itPg("queryChunks honours metadata @> filter", async () => {
    const N = ns("docs");
    await svc.upsertChunks(N, [
      { id: "p7-a", text: "text:alpha", metadata: { propertyId: 7 } },
      { id: "p9-a", text: "text:alpha", metadata: { propertyId: 9 } },
    ]);

    const filtered = await svc.queryChunks(N, "text:alpha", 5, { propertyId: 7 });
    expect(filtered.map((m) => m.id)).toEqual(["p7-a"]);

    const all = await svc.queryChunks(N, "text:alpha", 5);
    expect(all.map((m) => m.id).sort()).toEqual(["p7-a", "p9-a"]);
  });

  itPg("multiNamespaceQuery isolates each namespace and merges by score", async () => {
    const A = ns("kb-multi");
    const B = ns("rh-multi");
    await svc.upsertChunks(A, [{ id: "a-alpha", text: "text:alpha", metadata: {} }]);
    await svc.upsertChunks(B, [{ id: "b-beta", text: "text:beta", metadata: {} }]);

    const merged = await svc.multiNamespaceQuery(
      "query:alpha-leaning",
      [A, B],
      5,
    );

    expect(merged.length).toBe(2);
    const namespaces = new Set(merged.map((m) => m.namespace));
    expect(namespaces).toEqual(new Set([A, B]));
    // Sorted descending by score; alpha-leaning query is closer to alpha.
    expect(merged[0].id).toBe("a-alpha");
    expect(merged[0].score).toBeGreaterThan(merged[1].score);

    // Ensure A query alone never sees B's row — namespace isolation invariant.
    const onlyA = await svc.queryChunks(A, "text:beta", 5);
    expect(onlyA.find((m) => m.id === "b-beta")).toBeUndefined();
  });

  itPg("deleteVectors removes specified ids only", async () => {
    const N = ns("scenarios");
    await svc.upsertChunks(N, [
      { id: "s-1", text: "text:alpha", metadata: {} },
      { id: "s-2", text: "text:beta", metadata: {} },
      { id: "s-3", text: "text:gamma", metadata: {} },
    ]);

    await svc.deleteVectors(N, ["s-1", "s-3"]);

    const remaining = await svc.queryChunks(N, "text:alpha", 10);
    expect(remaining.map((m) => m.id).sort()).toEqual(["s-2"]);
  });

  itPg("cleanupPropertyVectors removes property-scoped rows across the real namespaces", async () => {
    // Use property ids that are extremely unlikely to collide with any
    // real-world data so we can run against the production namespace names
    // (which is what cleanupPropertyVectors targets) without side-effects.
    const TARGET = 987654321;
    const SIBLING = 987654322;

    const inserts: Array<{
      ns: import("../../server/ai/vector-store-service").VectorNamespace;
      id: string;
    }> = [
      // Should be deleted (LIKE 'property:TARGET%' or exact ids):
      { ns: "properties", id: `property:${TARGET}` },
      { ns: "properties", id: `property:${TARGET}:profile` },
      { ns: "research-history", id: `property:${TARGET}:research` },
      { ns: "assumption-guidance", id: `guidance:property:${TARGET}` },
      { ns: "scenarios", id: `scenario:${TARGET}` },
      { ns: "scenarios", id: `property:${TARGET}:scenario` },
      { ns: "documents", id: `property:${TARGET}:doc-1` },
      // Should survive (different property id):
      { ns: "properties", id: `property:${SIBLING}` },
      { ns: "documents", id: `property:${SIBLING}:doc-1` },
      // Should survive (cleanup skips knowledge-base + comparables):
      { ns: "knowledge-base", id: `property:${TARGET}:kb-untouched` },
      { ns: "comparables", id: `property:${TARGET}:comp-untouched` },
    ];

    const allIds = inserts.map((i) => i.id);

    try {
      // Group by namespace and upsert.
      const byNs = new Map<typeof inserts[number]["ns"], typeof inserts>();
      for (const r of inserts) {
        const list = byNs.get(r.ns) ?? [];
        list.push(r);
        byNs.set(r.ns, list);
      }
      for (const [n, rows] of byNs) {
        await svc.upsertChunks(
          n,
          rows.map((r) => ({ id: r.id, text: "text:alpha", metadata: {} })),
        );
      }

      // Sanity: everything we inserted is present.
      const before = await pool.query<{ namespace: string; id: string }>(
        `SELECT namespace, id FROM vector_chunks WHERE id = ANY($1::text[])`,
        [allIds],
      );
      expect(before.rows.length).toBe(inserts.length);

      // Exercise the real production function.
      await svc.cleanupPropertyVectors(TARGET);

      const after = await pool.query<{ namespace: string; id: string }>(
        `SELECT namespace, id FROM vector_chunks
          WHERE id = ANY($1::text[])
       ORDER BY namespace, id`,
        [allIds],
      );
      const survivors = after.rows.map((r) => `${r.namespace}|${r.id}`).sort();

      // Survivors: sibling property + the two namespaces cleanup intentionally
      // leaves alone (knowledge-base, comparables).
      expect(survivors).toEqual(
        [
          `comparables|property:${TARGET}:comp-untouched`,
          `documents|property:${SIBLING}:doc-1`,
          `knowledge-base|property:${TARGET}:kb-untouched`,
          `properties|property:${SIBLING}`,
        ].sort(),
      );
    } finally {
      // Always clean up rows we wrote into the real namespaces, even on
      // assertion failure, to avoid contaminating other tests / runs.
      await pool.query(`DELETE FROM vector_chunks WHERE id = ANY($1::text[])`, [
        allIds,
      ]);
    }
  });

  itPg("getNamespaceStats returns counts for every known namespace", async () => {
    // Insert rows under the real namespace names so getNamespaceStats picks
    // them up — but use ids that we can clean up unambiguously.
    const TAG = "__pgvtest_stats__";
    const ids = [
      { ns: "knowledge-base" as const, id: `${TAG}-1` },
      { ns: "knowledge-base" as const, id: `${TAG}-2` },
      { ns: "comparables" as const, id: `${TAG}-1` },
    ];
    try {
      await svc.upsertChunks("knowledge-base", [
        { id: ids[0].id, text: "text:alpha", metadata: {} },
        { id: ids[1].id, text: "text:beta", metadata: {} },
      ]);
      await svc.upsertChunks("comparables", [
        { id: ids[2].id, text: "text:gamma", metadata: {} },
      ]);
      const stats = await svc.getNamespaceStats();
      for (const n of svc.ALL_NAMESPACES) {
        expect(typeof stats[n]).toBe("number");
        expect(stats[n]).toBeGreaterThanOrEqual(0);
      }
      expect(stats["knowledge-base"]).toBeGreaterThanOrEqual(2);
      expect(stats["comparables"]).toBeGreaterThanOrEqual(1);
    } finally {
      await pool.query(
        `DELETE FROM vector_chunks WHERE id LIKE $1`,
        [`${TAG}%`],
      );
    }
  });

  itPg("vectorCount reports per-namespace totals", async () => {
    const N = ns("count");
    expect(await svc.vectorCount(N)).toBe(0);
    await svc.upsertChunks(N, [
      { id: "c-1", text: "text:alpha", metadata: {} },
      { id: "c-2", text: "text:beta", metadata: {} },
    ]);
    expect(await svc.vectorCount(N)).toBe(2);
  });

  itPg("HNSW (or ivfflat) index exists on the embedding column", async () => {
    const { rows } = await pool.query<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef FROM pg_indexes
        WHERE tablename = 'vector_chunks' AND indexdef ILIKE '%embedding%'`,
    );
    expect(rows.length).toBeGreaterThan(0);
    const defs = rows.map((r) => r.indexdef.toLowerCase()).join("\n");
    expect(/hnsw|ivfflat/.test(defs)).toBe(true);
  });
});
