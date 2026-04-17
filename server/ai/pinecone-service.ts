/**
 * Vector store service — pgvector-backed (Neon PostgreSQL) replacement for the
 * legacy Pinecone implementation. The public API is preserved so all existing
 * call sites continue to work; only the storage backend has changed.
 *
 * Storage: `vector_chunks` table in the primary Neon database (see migration
 * `0012_pgvector_store.sql`). Embeddings are stored as `vector(1536)` and
 * indexed with HNSW using cosine distance. The legacy "namespace" concept is
 * kept as a column so `knowledge-base`, `research-history`, `comparables`,
 * `assumption-guidance`, `documents`, `scenarios`, and `properties` continue
 * to behave as logically isolated buckets.
 *
 * Embedding model: text-embedding-3-small (1536 dims, cosine).
 *
 * NOTE: The file is still named `pinecone-service.ts` to avoid a sweeping
 * rename across ~30 call sites. Type and helper names that mention "Pinecone"
 * are kept as aliases for the same reason; user-facing labels say "vector
 * store".
 */

import OpenAI from "openai";
import { logger } from "../logger";
import { vectorStorePool as pool } from "../storage/vector-store";

const EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIMS = 1536;
const EMBED_BATCH = 20;

let _embeddingClient: OpenAI | null = null;
let _embeddingAvailable: boolean | null = null;

function getEmbeddingClient(): OpenAI | null {
  if (_embeddingAvailable === false) return null;
  if (_embeddingClient) return _embeddingClient;

  const directKey = process.env.OPENAI_EMBEDDING_KEY || process.env.OPENAI_API_KEY;
  if (directKey) {
    _embeddingClient = new OpenAI({ apiKey: directKey });
    _embeddingAvailable = true;
    return _embeddingClient;
  }

  const integrationKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const integrationBase = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (integrationKey && !integrationBase) {
    _embeddingClient = new OpenAI({ apiKey: integrationKey });
    _embeddingAvailable = true;
    return _embeddingClient;
  }

  _embeddingAvailable = false;
  return null;
}

export function isEmbeddingAvailable(): boolean {
  if (_embeddingAvailable !== null) return _embeddingAvailable;
  return getEmbeddingClient() !== null;
}

export type PineconeNamespace =
  | "knowledge-base"
  | "research-history"
  | "comparables"
  | "assumption-guidance"
  | "documents"
  | "scenarios"
  | "properties";

/** Alias kept for new call sites that want a non-vendor-specific name. */
export type VectorNamespace = PineconeNamespace;

export const ALL_NAMESPACES: PineconeNamespace[] = [
  "knowledge-base",
  "research-history",
  "comparables",
  "assumption-guidance",
  "documents",
  "scenarios",
  "properties",
];

export interface PineconeChunk {
  id: string;
  text: string;
  metadata: Record<string, string | number | boolean>;
}

export type VectorChunk = PineconeChunk;

export interface QueryMatch {
  id: string;
  score: number;
  metadata: Record<string, string | number | boolean>;
}

// ── Availability ──────────────────────────────────────────────────────────────

let _storeReady: boolean | null = null;
let _ensureStorePromise: Promise<void> | null = null;
let _availabilityProbe: Promise<boolean> | null = null;
let _availabilityCachedAt = 0;
const AVAILABILITY_TTL_MS = 60_000;

/**
 * Synchronous availability check. Returns the cached readiness result if a
 * probe has run recently. Returns `false` (closed) until the first probe has
 * completed, kicking off a background probe so the next call sees the real
 * answer.
 *
 * Callers that need a guaranteed-accurate answer should `await
 * checkVectorStoreReady()` instead.
 */
export function isPineconeAvailable(): boolean {
  if (!process.env.DATABASE_URL) return false;
  if (_storeReady !== null && Date.now() - _availabilityCachedAt < AVAILABILITY_TTL_MS) {
    return _storeReady;
  }
  // Kick off a probe so subsequent sync calls see the real answer.
  void checkVectorStoreReady().catch(() => {});
  // Fail closed until the first probe completes — strict readiness reporting.
  return _storeReady === true;
}

/** New-style alias for `isPineconeAvailable`. */
export const isVectorStoreAvailable = isPineconeAvailable;

/**
 * Async readiness check that verifies DATABASE_URL is set, the `vector`
 * extension is installed, and the `vector_chunks` table exists. Result is
 * cached for {@link AVAILABILITY_TTL_MS} ms.
 */
export async function checkVectorStoreReady(): Promise<boolean> {
  if (!process.env.DATABASE_URL) {
    _storeReady = false;
    _availabilityCachedAt = Date.now();
    return false;
  }
  if (_storeReady !== null && Date.now() - _availabilityCachedAt < AVAILABILITY_TTL_MS) {
    return _storeReady;
  }
  if (_availabilityProbe) return _availabilityProbe;

  _availabilityProbe = (async () => {
    try {
      const { rows } = await pool.query<{ has_table: boolean; has_ext: boolean }>(
        `SELECT
           EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vector_chunks') AS has_table,
           EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS has_ext`,
      );
      const ok = !!(rows[0]?.has_table && rows[0]?.has_ext);
      _storeReady = ok;
      _availabilityCachedAt = Date.now();
      if (!ok) {
        logger.warn(
          "Vector store not ready: " +
            (!rows[0]?.has_ext ? "pgvector extension missing. " : "") +
            (!rows[0]?.has_table ? "vector_chunks table missing. " : "") +
            "Run migration 0012_pgvector_store.sql (db:push --force).",
          "vector-store",
        );
      }
      return ok;
    } catch (err: unknown) {
      _storeReady = false;
      _availabilityCachedAt = Date.now();
      logger.warn(
        `Vector store readiness probe failed: ${err instanceof Error ? err.message : err}`,
        "vector-store",
      );
      return false;
    } finally {
      _availabilityProbe = null;
    }
  })();

  return _availabilityProbe;
}

async function ensureStore(): Promise<void> {
  if (_storeReady) return;
  if (_ensureStorePromise) return _ensureStorePromise;

  _ensureStorePromise = (async () => {
    if (_storeReady) return;
    const ok = await checkVectorStoreReady();
    if (!ok) {
      throw new Error(
        "vector_chunks table or pgvector extension missing — run migration 0012_pgvector_store.sql (db:push --force)",
      );
    }
  })().finally(() => {
    _ensureStorePromise = null;
  });

  return _ensureStorePromise;
}

/** Test-only: reset the cached availability state. */
export function __resetVectorStoreAvailabilityCache(): void {
  _storeReady = null;
  _availabilityCachedAt = 0;
  _availabilityProbe = null;
  _ensureStorePromise = null;
}

// ── Embedding helpers ─────────────────────────────────────────────────────────

async function embed(text: string): Promise<number[]> {
  const client = getEmbeddingClient();
  if (!client) throw new Error("Embedding client not available");
  const res = await client.embeddings.create({
    model: EMBED_MODEL,
    input: text.slice(0, 8_000),
  });
  return res.data[0].embedding;
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const client = getEmbeddingClient();
  if (!client) throw new Error("Embedding client not available");
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH).map((t) => t.slice(0, 8_000));
    const res = await client.embeddings.create({ model: EMBED_MODEL, input: batch });
    out.push(...res.data.map((d: { embedding: number[] }) => d.embedding));
  }
  return out;
}

function toVectorLiteral(vec: number[]): string {
  if (vec.length !== EMBED_DIMS) {
    throw new Error(`Embedding has ${vec.length} dims, expected ${EMBED_DIMS}`);
  }
  return `[${vec.join(",")}]`;
}

// ── Core operations ───────────────────────────────────────────────────────────

/**
 * Upsert text chunks — embeds each and writes to the given namespace.
 * Idempotent on (namespace, id): re-indexing the same id replaces the row.
 */
export async function upsertChunks(
  namespace: PineconeNamespace,
  chunks: PineconeChunk[],
): Promise<void> {
  if (!isPineconeAvailable() || chunks.length === 0) return;
  if (!isEmbeddingAvailable()) return;
  await ensureStore();

  const embeddings = await embedBatch(chunks.map((c) => c.text));

  const BATCH = 100;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const slice = chunks.slice(i, i + BATCH);
    const embedSlice = embeddings.slice(i, i + BATCH);

    const values: unknown[] = [];
    const placeholders: string[] = [];
    slice.forEach((c, j) => {
      const base = j * 5;
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::jsonb, $${base + 5}::vector)`,
      );
      values.push(
        namespace,
        c.id,
        c.text,
        JSON.stringify(c.metadata ?? {}),
        toVectorLiteral(embedSlice[j]),
      );
    });

    await pool.query(
      `INSERT INTO vector_chunks (namespace, id, text, metadata, embedding)
       VALUES ${placeholders.join(", ")}
       ON CONFLICT (namespace, id) DO UPDATE SET
         text = EXCLUDED.text,
         metadata = EXCLUDED.metadata,
         embedding = EXCLUDED.embedding,
         updated_at = now()`,
      values,
    );
  }
}

/**
 * Query by natural-language text — returns top-K matches by cosine similarity.
 * `filter` matches against metadata using JSON containment (`metadata @> ...`).
 */
export async function queryChunks(
  namespace: PineconeNamespace,
  query: string,
  topK = 8,
  filter?: Record<string, unknown>,
): Promise<QueryMatch[]> {
  if (!isPineconeAvailable() || !isEmbeddingAvailable()) return [];
  await ensureStore();

  const vector = await embed(query);
  const literal = toVectorLiteral(vector);

  if (filter && Object.keys(filter).length > 0) {
    const sql = `
      SELECT id, metadata, 1 - (embedding <=> $2::vector) AS score
        FROM vector_chunks
       WHERE namespace = $1
         AND metadata @> $3::jsonb
    ORDER BY embedding <=> $2::vector ASC
       LIMIT $4`;
    const { rows } = await pool.query<{
      id: string;
      metadata: Record<string, string | number | boolean>;
      score: number;
    }>(sql, [namespace, literal, JSON.stringify(filter), topK]);
    return rows.map((r) => ({ id: r.id, score: Number(r.score) || 0, metadata: r.metadata ?? {} }));
  }

  const sql = `
    SELECT id, metadata, 1 - (embedding <=> $2::vector) AS score
      FROM vector_chunks
     WHERE namespace = $1
  ORDER BY embedding <=> $2::vector ASC
     LIMIT $3`;
  const { rows } = await pool.query<{
    id: string;
    metadata: Record<string, string | number | boolean>;
    score: number;
  }>(sql, [namespace, literal, topK]);
  return rows.map((r) => ({ id: r.id, score: Number(r.score) || 0, metadata: r.metadata ?? {} }));
}

export async function deleteVectors(
  namespace: PineconeNamespace,
  ids: string[],
): Promise<void> {
  if (!isPineconeAvailable() || ids.length === 0) return;
  await ensureStore();
  await pool.query(
    `DELETE FROM vector_chunks WHERE namespace = $1 AND id = ANY($2::text[])`,
    [namespace, ids],
  );
}

export interface MultiNamespaceMatch extends QueryMatch {
  namespace: PineconeNamespace;
}

export async function multiNamespaceQuery(
  query: string,
  namespaces: PineconeNamespace[],
  topK = 5,
  filter?: Record<string, unknown>,
): Promise<MultiNamespaceMatch[]> {
  if (!isPineconeAvailable() || !isEmbeddingAvailable() || namespaces.length === 0) return [];
  await ensureStore();

  const vector = await embed(query);
  const literal = toVectorLiteral(vector);

  const results = await Promise.all(
    namespaces.map(async (ns) => {
      try {
        let rows: Array<{
          id: string;
          metadata: Record<string, string | number | boolean>;
          score: number;
        }>;
        if (filter && Object.keys(filter).length > 0) {
          ({ rows } = await pool.query(
            `SELECT id, metadata, 1 - (embedding <=> $2::vector) AS score
               FROM vector_chunks
              WHERE namespace = $1
                AND metadata @> $3::jsonb
           ORDER BY embedding <=> $2::vector ASC
              LIMIT $4`,
            [ns, literal, JSON.stringify(filter), topK],
          ));
        } else {
          ({ rows } = await pool.query(
            `SELECT id, metadata, 1 - (embedding <=> $2::vector) AS score
               FROM vector_chunks
              WHERE namespace = $1
           ORDER BY embedding <=> $2::vector ASC
              LIMIT $3`,
            [ns, literal, topK],
          ));
        }
        return rows.map((r) => ({
          id: r.id,
          score: Number(r.score) || 0,
          metadata: r.metadata ?? {},
          namespace: ns,
        }));
      } catch (err: unknown) {
        logger.warn(
          `Vector query failed for namespace ${ns}: ${err instanceof Error ? err.message : err}`,
          "vector-store",
        );
        return [];
      }
    }),
  );

  return results.flat().sort((a, b) => b.score - a.score).slice(0, topK * 2);
}

export async function vectorCount(namespace: PineconeNamespace): Promise<number> {
  if (!isPineconeAvailable()) return 0;
  try {
    await ensureStore();
    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM vector_chunks WHERE namespace = $1`,
      [namespace],
    );
    return Number(rows[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

export async function getNamespaceStats(): Promise<Record<PineconeNamespace, number>> {
  const stats: Record<string, number> = {};
  for (const ns of ALL_NAMESPACES) stats[ns] = 0;

  if (!isPineconeAvailable()) return stats as Record<PineconeNamespace, number>;

  try {
    await ensureStore();
    const { rows } = await pool.query<{ namespace: string; count: string }>(
      `SELECT namespace, COUNT(*)::text AS count FROM vector_chunks GROUP BY namespace`,
    );
    for (const r of rows) {
      if ((ALL_NAMESPACES as string[]).includes(r.namespace)) {
        stats[r.namespace] = Number(r.count);
      }
    }
  } catch (err: unknown) {
    logger.warn(
      `Failed to get namespace stats: ${err instanceof Error ? err.message : err}`,
      "vector-store",
    );
  }

  return stats as Record<PineconeNamespace, number>;
}

export async function deleteNamespace(namespace: PineconeNamespace): Promise<void> {
  if (!isPineconeAvailable()) return;
  try {
    await ensureStore();
    await pool.query(`DELETE FROM vector_chunks WHERE namespace = $1`, [namespace]);
    logger.info(`Cleared all vectors from namespace "${namespace}"`, "vector-store");
  } catch (err: unknown) {
    logger.warn(
      `Failed to clear namespace ${namespace}: ${err instanceof Error ? err.message : err}`,
      "vector-store",
    );
    throw err;
  }
}

export async function cleanupPropertyVectors(propertyId: number): Promise<void> {
  if (!isPineconeAvailable()) return;
  await ensureStore();

  const namespacesToClean: PineconeNamespace[] = [
    "properties",
    "research-history",
    "assumption-guidance",
    "documents",
    "scenarios",
  ];

  const prefix = `property:${propertyId}`;
  const exactIds = [
    `property:${propertyId}`,
    `guidance:property:${propertyId}`,
    `scenario:${propertyId}`,
  ];

  for (const ns of namespacesToClean) {
    try {
      await pool.query(
        `DELETE FROM vector_chunks
          WHERE namespace = $1
            AND (id LIKE $2 OR id = ANY($3::text[]))`,
        [ns, `${prefix}%`, exactIds],
      );
    } catch (err: unknown) {
      logger.warn(
        `Vector cleanup for namespace ${ns} (property ${propertyId}) failed: ${err instanceof Error ? err.message : err}`,
        "vector-store",
      );
    }
  }

  logger.info(`Cleaned vector store entries for property ${propertyId}`, "vector-store");
}

export async function getTotalVectorCount(): Promise<number> {
  if (!isPineconeAvailable()) return 0;
  try {
    await ensureStore();
    const { rows } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM vector_chunks`,
    );
    return Number(rows[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

// ── Domain indexing functions delegated to pinecone-indexing.ts ──────────────
export {
  indexResearchResult,
  retrieveSimilarResearch,
  indexAssumptionGuidance,
  retrieveSimilarGuidance,
  indexBenchmarkSnapshot,
  indexMarketAdrData,
  indexSeasonalCalendar,
  indexEventCalendar,
  indexLaborRates,
  indexDocumentExtraction,
  retrieveDocumentContext,
  indexScenarioSummary,
  retrieveScenarioContext,
  indexPropertyProfile,
  retrievePropertyContext,
  indexToKnowledgeBase,
} from "./pinecone-indexing";
