/**
 * PineconeService — Persistent vector store for the full H+ Analytics intelligence layer.
 *
 * Index: "lb-hospitality"
 * Namespaces:
 *   knowledge-base       — Methodology docs, platform guides, attached_assets, photos, logos.
 *   research-history     — Completed research results for prior-knowledge retrieval.
 *   comparables          — Benchmark snapshots (ADR, occupancy, cap rates) for relaxation engine.
 *   assumption-guidance  — Validated assumption ranges (Low/Mid/High) seeding new research.
 *   documents            — Chunked property documents (PDFs/OMs) for semantic search.
 *   scenarios            — Financial scenario summaries for semantic retrieval by Rebecca.
 *   properties           — Property profiles (metadata, location, type) for semantic search.
 *
 * Embedding model: text-embedding-3-small (1536 dims, cosine)
 */

import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from "openai";
import { logger } from "../logger";

const INDEX_NAME     = "lb-hospitality";
const EMBED_MODEL    = "text-embedding-3-small";
const EMBED_DIMS     = 1536;
const EMBED_BATCH    = 20;
const PINECONE_REGION = process.env.PINECONE_REGION || "us-east-1";
const _DOC_MAX_CHARS  = 100_000;

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

export type PineconeNamespace = "knowledge-base" | "research-history" | "comparables" | "assumption-guidance" | "documents" | "scenarios" | "properties";

export const ALL_NAMESPACES: PineconeNamespace[] = [
  "knowledge-base", "research-history", "comparables",
  "assumption-guidance", "documents", "scenarios", "properties",
];

export interface PineconeChunk {
  id: string;
  text: string;
  metadata: Record<string, string | number | boolean>;
}

export interface QueryMatch {
  id: string;
  score: number;
  metadata: Record<string, string | number | boolean>;
}

// ── Singleton client ──────────────────────────────────────────────────────────

let _pc: Pinecone | null = null;
let _indexReady = false;

function getPC(): Pinecone {
  if (_pc) return _pc;
  const key = process.env.PINECONE_API_KEY;
  if (!key) throw new Error("PINECONE_API_KEY not configured");
  _pc = new Pinecone({ apiKey: key });
  return _pc;
}

export function isPineconeAvailable(): boolean {
  return !!process.env.PINECONE_API_KEY;
}

// ── Index lifecycle ───────────────────────────────────────────────────────────

// Mutex — prevents concurrent index creation during startup
let _ensureIndexPromise: Promise<void> | null = null;

async function ensureIndex(): Promise<void> {
  if (_indexReady) return;
  if (_ensureIndexPromise) return _ensureIndexPromise;

  _ensureIndexPromise = (async () => {
    if (_indexReady) return; // re-check after acquiring

    const pc = getPC();
    const list = await pc.listIndexes();
    const names = list.indexes?.map(i => i.name) ?? [];

    if (!names.includes(INDEX_NAME)) {
      logger.info(`Creating Pinecone index "${INDEX_NAME}"`, "pinecone");
      await pc.createIndex({
        name: INDEX_NAME,
        dimension: EMBED_DIMS,
        metric: "cosine",
        spec: { serverless: { cloud: "aws", region: PINECONE_REGION } },
      });
      // Wait for index to initialise
      await new Promise(r => setTimeout(r, 8_000));
      logger.info(`Pinecone index "${INDEX_NAME}" ready`, "pinecone");
    }

    _indexReady = true;
  })().finally(() => { _ensureIndexPromise = null; });

  return _ensureIndexPromise;
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
    const batch = texts.slice(i, i + EMBED_BATCH).map(t => t.slice(0, 8_000));
    const res = await client.embeddings.create({ model: EMBED_MODEL, input: batch });
    out.push(...res.data.map((d: { embedding: number[] }) => d.embedding));
  }
  return out;
}

// ── Core operations ───────────────────────────────────────────────────────────

/**
 * Upsert text chunks — embeds each and uploads to the given namespace.
 * Metadata must fit within Pinecone's 40KB per-vector limit.
 * Store `content` in metadata so retrieval needs no secondary lookup.
 */
export async function upsertChunks(
  namespace: PineconeNamespace,
  chunks: PineconeChunk[],
): Promise<void> {
  if (!isPineconeAvailable() || chunks.length === 0) return;
  if (!isEmbeddingAvailable()) return;
  await ensureIndex();

  const embeddings = await embedBatch(chunks.map(c => c.text));
  const index = getPC().index(INDEX_NAME).namespace(namespace);

  for (let i = 0; i < chunks.length; i += 100) {
    const records = chunks.slice(i, i + 100).map((c, j) => ({
      id:       c.id,
      values:   embeddings[i + j],
      metadata: c.metadata,
    }));
    await index.upsert({ records } as any);
  }
}

/**
 * Query by natural-language text — returns top-K matches with scores and metadata.
 */
export async function queryChunks(
  namespace: PineconeNamespace,
  query: string,
  topK = 8,
  filter?: Record<string, unknown>,
): Promise<QueryMatch[]> {
  if (!isPineconeAvailable() || !isEmbeddingAvailable()) return [];
  await ensureIndex();

  const vector = await embed(query);
  const index  = getPC().index(INDEX_NAME).namespace(namespace);
  const queryParams: Record<string, unknown> = { vector, topK, includeMetadata: true };
  if (filter) queryParams.filter = filter;
  const res    = await index.query(queryParams as Parameters<typeof index.query>[0]);

  return (res.matches ?? []).map(m => ({
    id:       m.id,
    score:    m.score ?? 0,
    metadata: (m.metadata ?? {}) as Record<string, string | number | boolean>,
  }));
}

export async function deleteVectors(
  namespace: PineconeNamespace,
  ids: string[],
): Promise<void> {
  if (!isPineconeAvailable() || ids.length === 0) return;
  await ensureIndex();
  const index = getPC().index(INDEX_NAME).namespace(namespace);
  for (let i = 0; i < ids.length; i += 100) {
    await index.deleteMany(ids.slice(i, i + 100));
  }
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
  await ensureIndex();

  const vector = await embed(query);
  const index = getPC().index(INDEX_NAME);

  const results = await Promise.all(
    namespaces.map(async (ns) => {
      try {
        const queryParams: Record<string, unknown> = { vector, topK, includeMetadata: true };
        if (filter) queryParams.filter = filter;
        const res = await index.namespace(ns).query(queryParams as Parameters<ReturnType<typeof index.namespace>["query"]>[0]);
        return (res.matches ?? []).map(m => ({
          id: m.id,
          score: m.score ?? 0,
          metadata: (m.metadata ?? {}) as Record<string, string | number | boolean>,
          namespace: ns,
        }));
      } catch (err: unknown) {
        logger.warn(`Pinecone query failed for namespace ${ns}: ${err instanceof Error ? err.message : err}`, "pinecone");
        return [];
      }
    }),
  );

  return results.flat().sort((a, b) => b.score - a.score).slice(0, topK * 2);
}

/**
 * Returns the vector count for a namespace — used to skip re-indexing.
 */
export async function vectorCount(namespace: PineconeNamespace): Promise<number> {
  if (!isPineconeAvailable()) return 0;
  try {
    await ensureIndex();
    const stats = await getPC().index(INDEX_NAME).describeIndexStats();
    return stats.namespaces?.[namespace]?.recordCount ?? 0;
  } catch {
    return 0;
  }
}

export async function getNamespaceStats(): Promise<Record<PineconeNamespace, number>> {
  const stats: Record<string, number> = {};
  for (const ns of ALL_NAMESPACES) stats[ns] = 0;

  if (!isPineconeAvailable()) return stats as Record<PineconeNamespace, number>;

  try {
    await ensureIndex();
    const indexStats = await getPC().index(INDEX_NAME).describeIndexStats();
    for (const ns of ALL_NAMESPACES) {
      stats[ns] = indexStats.namespaces?.[ns]?.recordCount ?? 0;
    }
  } catch (err: unknown) {
    logger.warn(`Failed to get namespace stats: ${err instanceof Error ? err.message : err}`, "pinecone");
  }

  return stats as Record<PineconeNamespace, number>;
}

export async function deleteNamespace(namespace: PineconeNamespace): Promise<void> {
  if (!isPineconeAvailable()) return;

  try {
    await ensureIndex();
    const index = getPC().index(INDEX_NAME).namespace(namespace);
    await index.deleteAll();
    logger.info(`Cleared all vectors from namespace "${namespace}"`, "pinecone");
  } catch (err: unknown) {
    logger.warn(`Failed to clear namespace ${namespace}: ${err instanceof Error ? err.message : err}`, "pinecone");
    throw err;
  }
}

export async function cleanupPropertyVectors(propertyId: number): Promise<void> {
  if (!isPineconeAvailable()) return;
  await ensureIndex();
  const index = getPC().index(INDEX_NAME);

  const namespacesToClean: PineconeNamespace[] = [
    "properties", "research-history", "assumption-guidance", "documents", "scenarios",
  ];

  for (const ns of namespacesToClean) {
    try {
      const nsIndex = index.namespace(ns);
      const listed = await nsIndex.listPaginated({ prefix: `property:${propertyId}` });
      const prefixIds = listed.vectors?.map(v => v.id).filter((id): id is string => !!id) ?? [];
      if (prefixIds.length > 0) {
        await nsIndex.deleteMany(prefixIds);
      }

      await nsIndex.deleteMany([
        `property:${propertyId}`,
        `guidance:property:${propertyId}`,
        `scenario:${propertyId}`,
      ]);
    } catch (err: unknown) {
      logger.warn(`Pinecone cleanup for namespace ${ns} (property ${propertyId}) failed: ${err instanceof Error ? err.message : err}`, "pinecone");
    }
  }

  logger.info(`Cleaned Pinecone vectors for property ${propertyId}`, "pinecone");
}

export async function getTotalVectorCount(): Promise<number> {
  if (!isPineconeAvailable()) return 0;
  try {
    await ensureIndex();
    const stats = await getPC().index(INDEX_NAME).describeIndexStats();
    return stats.totalRecordCount ?? 0;
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
  indexDocumentExtraction,
  retrieveDocumentContext,
  indexScenarioSummary,
  retrieveScenarioContext,
  indexPropertyProfile,
  retrievePropertyContext,
  indexToKnowledgeBase,
} from "./pinecone-indexing";
