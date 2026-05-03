/**
 * Vector store service — pgvector-backed (Neon PostgreSQL).
 *
 * Storage: `vector_chunks` table in the primary Neon database (see migration
 * `0012_pgvector_store.sql`). Embeddings are stored as `vector(1536)` and
 * indexed with HNSW using cosine distance. The "namespace" column keeps
 * `knowledge-base`, `research-history`, `comparables`, `assumption-guidance`,
 * `documents`, `scenarios`, and `properties` as logically isolated buckets.
 *
 * Embedding model: text-embedding-3-small (1536 dims, cosine).
 */

import OpenAI from "openai";
import { hasDbUrl } from "@shared/db-url";
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

  // IMPORTANT: always pass baseURL explicitly to prevent the OpenAI SDK from
  // reading OPENAI_BASE_URL from the environment. On Replit, OPENAI_BASE_URL
  // is set to the AI proxy which does NOT support the /embeddings endpoint
  // (returns 400). We must bypass that proxy for embedding calls.
  const DIRECT_BASE = "https://api.openai.com/v1";

  const directKey = process.env.OPENAI_EMBEDDING_KEY || process.env.OPENAI_API_KEY;
  if (directKey) {
    logger.info(
      `[embedding-client] Using ${process.env.OPENAI_EMBEDDING_KEY ? "OPENAI_EMBEDDING_KEY" : "OPENAI_API_KEY"} → ${DIRECT_BASE}`,
      "vector-store",
    );
    _embeddingClient = new OpenAI({ apiKey: directKey, baseURL: DIRECT_BASE });
    _embeddingAvailable = true;
    return _embeddingClient;
  }

  _embeddingAvailable = false;
  logger.warn("[embedding-client] No direct OpenAI key found — embeddings disabled", "vector-store");
  return null;
}

export function isEmbeddingAvailable(): boolean {
  if (_embeddingAvailable !== null) return _embeddingAvailable;
  return getEmbeddingClient() !== null;
}

export type VectorNamespace =
  | "knowledge-base"
  | "research-history"
  | "comparables"
  | "assumption-guidance"
  | "documents"
  | "scenarios"
  | "properties"
  | "market-research";

export const ALL_NAMESPACES: VectorNamespace[] = [
  "knowledge-base",
  "research-history",
  "comparables",
  "assumption-guidance",
  "documents",
  "scenarios",
  "properties",
  "market-research",
];

export interface VectorChunk {
  id: string;
  text: string;
  metadata: Record<string, string | number | boolean>;
}

export interface QueryMatch {
  id: string;
  text: string;
  score: number;
  metadata: Record<string, string | number | boolean>;
}

/**
 * Exact metadata filter query — no embedding needed. Uses jsonb @> containment.
 * Returns chunks matching ALL supplied filter keys within the namespace.
 */
export async function queryByMetadataExact(
  namespace: VectorNamespace,
  filters: Record<string, unknown>,
  limit = 10,
): Promise<QueryMatch[]> {
  if (!isVectorStoreAvailable()) return [];
  await ensureStore();

  const sql = `
    SELECT id, text, metadata, 1.0 AS score
      FROM vector_chunks
     WHERE namespace = $1
       AND metadata @> $2::jsonb
     LIMIT $3`;
  
  const { rows } = await pool.query<{
    id: string;
    text: string;
    metadata: Record<string, string | number | boolean>;
  }>(sql, [namespace, JSON.stringify(filters), limit]);

  return rows.map((r) => ({
    id: r.id,
    text: r.text ?? "",
    score: 1.0,
    metadata: r.metadata ?? {},
  }));
}

export type HybridQueryResult = {
  mode: "exact" | "semantic" | "none";
  matches: QueryMatch[];
};

/**
 * Try exact metadata filter first; fall back to semantic if no exact hits.
 * Returns the mode used so callers can record it on the manifest entry.
 */
export async function hybridQuery(params: {
  namespace: VectorNamespace;
  exactFilters: Record<string, unknown>;
  semanticQuery: string;
  topK?: number;
}): Promise<HybridQueryResult> {
  // 1. Try exact match
  const exactMatches = await queryByMetadataExact(
    params.namespace,
    params.exactFilters,
    params.topK ?? 10,
  );

  if (exactMatches.length > 0) {
    return {
      mode: "exact",
      matches: exactMatches,
    };
  }

  // 2. Fall back to semantic match
  const semanticMatches = await queryChunks(
    params.namespace,
    params.semanticQuery,
    params.topK ?? 8,
    // We don't necessarily want to apply the same filters to the semantic query
    // unless the caller wants to. For "assumption-guidance", we might want to
    // fall back to a broader semantic search if no exact match for (entityId, entityType, assumptionKey)
    // is found.
  );

  if (semanticMatches.length > 0) {
    return {
      mode: "semantic",
      matches: semanticMatches,
    };
  }

  return {
    mode: "none",
    matches: [],
  };
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
export function isVectorStoreAvailable(): boolean {
  if (!hasDbUrl()) return false;
  if (_storeReady !== null && Date.now() - _availabilityCachedAt < AVAILABILITY_TTL_MS) {
    return _storeReady;
  }
  // Kick off a probe so subsequent sync calls see the real answer.
  void checkVectorStoreReady().catch(() => { /* ignore — fire-and-forget probe; readiness is reported below */ });
  // Fail closed until the first probe completes — strict readiness reporting.
  return _storeReady === true;
}

/**
 * Async readiness check that verifies the database URL is set
 * (`POSTGRES_URL ?? DATABASE_URL`), the `vector` extension is installed, and
 * the `vector_chunks` table exists. Result is cached for
 * {@link AVAILABILITY_TTL_MS} ms.
 */
export async function checkVectorStoreReady(): Promise<boolean> {
  if (!hasDbUrl()) {
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

export async function embed(text: string): Promise<number[]> {
  const client = getEmbeddingClient();
  if (!client) throw new Error("Embedding client not available");
  const res = await client.embeddings.create({
    model: EMBED_MODEL,
    input: text.slice(0, 8_000),
  });
  return res.data[0].embedding;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
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
  namespace: VectorNamespace,
  chunks: VectorChunk[],
): Promise<void> {
  if (!isVectorStoreAvailable() || chunks.length === 0) return;
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
  namespace: VectorNamespace,
  query: string,
  topK = 8,
  filter?: Record<string, unknown>,
): Promise<QueryMatch[]> {
  if (!isVectorStoreAvailable() || !isEmbeddingAvailable()) return [];
  await ensureStore();

  const vector = await embed(query);
  const literal = toVectorLiteral(vector);

  if (filter && Object.keys(filter).length > 0) {
    const sql = `
      SELECT id, text, metadata, 1 - (embedding <=> $2::vector) AS score
        FROM vector_chunks
       WHERE namespace = $1
         AND metadata @> $3::jsonb
    ORDER BY embedding <=> $2::vector ASC
       LIMIT $4`;
    const { rows } = await pool.query<{
      id: string;
      text: string;
      metadata: Record<string, string | number | boolean>;
      score: number;
    }>(sql, [namespace, literal, JSON.stringify(filter), topK]);
    return rows.map((r) => ({ id: r.id, text: r.text ?? "", score: (Number.isFinite(Number(r.score)) ? Number(r.score) : 0), metadata: r.metadata ?? {} }));
  }

  const sql = `
    SELECT id, text, metadata, 1 - (embedding <=> $2::vector) AS score
      FROM vector_chunks
     WHERE namespace = $1
  ORDER BY embedding <=> $2::vector ASC
     LIMIT $3`;
  const { rows } = await pool.query<{
    id: string;
    text: string;
    metadata: Record<string, string | number | boolean>;
    score: number;
  }>(sql, [namespace, literal, topK]);
  return rows.map((r) => ({ id: r.id, text: r.text ?? "", score: (Number.isFinite(Number(r.score)) ? Number(r.score) : 0), metadata: r.metadata ?? {} }));
}

export async function deleteVectors(
  namespace: VectorNamespace,
  ids: string[],
): Promise<void> {
  if (!isVectorStoreAvailable() || ids.length === 0) return;
  await ensureStore();
  await pool.query(
    `DELETE FROM vector_chunks WHERE namespace = $1 AND id = ANY($2::text[])`,
    [namespace, ids],
  );
}

export interface MultiNamespaceMatch extends QueryMatch {
  namespace: VectorNamespace;
}

export async function multiNamespaceQuery(
  query: string,
  namespaces: VectorNamespace[],
  topK = 5,
  filter?: Record<string, unknown>,
): Promise<MultiNamespaceMatch[]> {
  if (!isVectorStoreAvailable() || !isEmbeddingAvailable() || namespaces.length === 0) return [];
  await ensureStore();

  const vector = await embed(query);
  const literal = toVectorLiteral(vector);

  const results = await Promise.all(
    namespaces.map(async (ns) => {
      try {
        let rows: Array<{
          id: string;
          text: string;
          metadata: Record<string, string | number | boolean>;
          score: number;
        }>;
        if (filter && Object.keys(filter).length > 0) {
          ({ rows } = await pool.query(
            `SELECT id, text, metadata, 1 - (embedding <=> $2::vector) AS score
               FROM vector_chunks
              WHERE namespace = $1
                AND metadata @> $3::jsonb
           ORDER BY embedding <=> $2::vector ASC
              LIMIT $4`,
            [ns, literal, JSON.stringify(filter), topK],
          ));
        } else {
          ({ rows } = await pool.query(
            `SELECT id, text, metadata, 1 - (embedding <=> $2::vector) AS score
               FROM vector_chunks
              WHERE namespace = $1
           ORDER BY embedding <=> $2::vector ASC
              LIMIT $3`,
            [ns, literal, topK],
          ));
        }
        return rows.map((r) => ({
          id: r.id,
          text: r.text ?? "",
          score: (Number.isFinite(Number(r.score)) ? Number(r.score) : 0),
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

export async function vectorCount(namespace: VectorNamespace): Promise<number> {
  if (!isVectorStoreAvailable()) return 0;
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

export async function getNamespaceStats(): Promise<Record<VectorNamespace, number>> {
  const stats: Record<string, number> = {};
  for (const ns of ALL_NAMESPACES) stats[ns] = 0;

  if (!isVectorStoreAvailable()) return stats as Record<VectorNamespace, number>;

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

  return stats as Record<VectorNamespace, number>;
}

export async function deleteNamespace(namespace: VectorNamespace): Promise<void> {
  if (!isVectorStoreAvailable()) return;
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

/**
 * Return all vector IDs in a namespace. Useful for backfill/cleanup jobs that
 * need to detect orphaned rows (vectors whose underlying entity no longer
 * exists in the relational store).
 */
export async function listVectorIds(namespace: VectorNamespace): Promise<string[]> {
  if (!isVectorStoreAvailable()) return [];
  await ensureStore();
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM vector_chunks WHERE namespace = $1`,
    [namespace],
  );
  return rows.map((r) => r.id);
}

/**
 * Delete all vectors in a namespace whose id is NOT in `validIds`.
 *
 * Intended for namespaces with a single deterministic id format (e.g.
 * `properties` → `property:<id>`, `scenarios` → `scenario:<id>`). Do NOT use
 * on namespaces with multi-format ids unless every live id is included in
 * `validIds`, otherwise valid rows will be deleted.
 *
 * Returns the number of rows deleted.
 */
export async function pruneOrphanedVectors(
  namespace: VectorNamespace,
  validIds: string[],
): Promise<number> {
  if (!isVectorStoreAvailable()) return 0;
  await ensureStore();
  const { rows } = await pool.query<{ count: string }>(
    `WITH deleted AS (
       DELETE FROM vector_chunks
        WHERE namespace = $1
          AND NOT (id = ANY($2::text[]))
        RETURNING 1
     )
     SELECT COUNT(*)::text AS count FROM deleted`,
    [namespace, validIds],
  );
  const removed = Number(rows[0]?.count ?? 0);
  if (removed > 0) {
    logger.info(
      `Pruned ${removed} orphaned vector(s) from namespace "${namespace}"`,
      "vector-store",
    );
  }
  return removed;
}

export async function cleanupPropertyVectors(propertyId: number): Promise<void> {
  if (!isVectorStoreAvailable()) return;
  await ensureStore();

  // Namespaces whose ids start with `property:<id>` (properties + guidance).
  // For these we can match by id prefix safely.
  const idPrefixNamespaces: VectorNamespace[] = [
    "properties",
    "research-history",
    "assumption-guidance",
  ];
  const prefix = `property:${propertyId}`;
  const exactIds = [
    `property:${propertyId}`,
    `guidance:property:${propertyId}`,
  ];

  for (const ns of idPrefixNamespaces) {
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

  // Documents and scenarios are keyed by their own ids (extractionId,
  // scenarioId), not by propertyId — so a `scenario:${propertyId}` rule would
  // incorrectly delete an unrelated scenario whose id happens to equal the
  // propertyId. Match via metadata containment instead.
  const metadataPropertyNamespaces: VectorNamespace[] = [
    "documents",
    "scenarios",
  ];
  for (const ns of metadataPropertyNamespaces) {
    try {
      await pool.query(
        `DELETE FROM vector_chunks
          WHERE namespace = $1
            AND metadata @> $2::jsonb`,
        [ns, JSON.stringify({ propertyId })],
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

/**
 * Prune stale research-history entries for a given entity before a new one
 * is inserted. Keeps the namespace from growing without bound across
 * repeated regeneration cycles for the same location+type.
 */
export async function pruneResearchHistory(
  type: "property" | "company" | "global",
  encodedLocation: string,
): Promise<void> {
  if (!isVectorStoreAvailable()) return;
  try {
    await ensureStore();
    await pool.query(
      `DELETE FROM vector_chunks
        WHERE namespace = 'research-history'
          AND id LIKE $1`,
      [`research:${type}:${encodedLocation}:%`],
    );
  } catch (err: unknown) {
    logger.warn(
      `pruneResearchHistory failed for ${type}:${encodedLocation}: ${err instanceof Error ? err.message : err}`,
      "vector-store",
    );
  }
}

export async function getTotalVectorCount(): Promise<number> {
  if (!isVectorStoreAvailable()) return 0;
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

// ── Domain indexing functions delegated to vector-indexing.ts ────────────────
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
} from "./vector-indexing";
