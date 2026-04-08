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
const DOC_MAX_CHARS  = 100_000;

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
): Promise<QueryMatch[]> {
  if (!isPineconeAvailable() || !isEmbeddingAvailable()) return [];
  await ensureIndex();

  const vector = await embed(query);
  const index  = getPC().index(INDEX_NAME).namespace(namespace);
  const res    = await index.query({ vector, topK, includeMetadata: true });

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
): Promise<MultiNamespaceMatch[]> {
  if (!isPineconeAvailable() || !isEmbeddingAvailable() || namespaces.length === 0) return [];
  await ensureIndex();

  const vector = await embed(query);
  const index = getPC().index(INDEX_NAME);

  const results = await Promise.all(
    namespaces.map(async (ns) => {
      try {
        const res = await index.namespace(ns).query({ vector, topK, includeMetadata: true });
        return (res.matches ?? []).map(m => ({
          id: m.id,
          score: m.score ?? 0,
          metadata: (m.metadata ?? {}) as Record<string, string | number | boolean>,
          namespace: ns,
        }));
      } catch (err) {
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
  } catch (err) {
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
  } catch (err) {
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
    } catch (err) {
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

// ── Research history ──────────────────────────────────────────────────────────

/**
 * Index a completed research result so future research on similar properties
 * can retrieve it as prior-knowledge context.
 */
export async function indexResearchResult(params: {
  propertyId?: number;
  location: string;
  propertyType: string;
  type: "property" | "company" | "global";
  /** A compact textual summary of key findings — what gets embedded. */
  summary: string;
  keyMetrics?: Record<string, number>;
  completedAt: string;
}): Promise<void> {
  if (!isPineconeAvailable()) return;

  const id   = `research:${params.type}:${params.location.toLowerCase().replace(/\s+/g, "-")}:${Date.now()}`;
  const text = `${params.location} ${params.propertyType} ${params.type} research\n\n${params.summary}`;

  const metricFields: Record<string, number> = {};
  for (const [k, v] of Object.entries(params.keyMetrics ?? {})) {
    metricFields[`metric_${k}`] = v;
  }

  await upsertChunks("research-history", [{
    id,
    text,
    metadata: {
      propertyId:   params.propertyId ?? 0,
      location:     params.location,
      propertyType: params.propertyType,
      type:         params.type,
      completedAt:  params.completedAt,
      summary:      params.summary.slice(0, 2_000),
      ...metricFields,
    },
  }]);

  logger.info(`Indexed research result for ${params.location} (${params.type})`, "pinecone");
}

/**
 * Retrieve the most similar past research results by location + property type.
 * Used to prime analyst prompts with prior knowledge.
 */
export async function retrieveSimilarResearch(
  location: string,
  propertyType: string,
  type: "property" | "company" | "global",
  topK = 3,
): Promise<QueryMatch[]> {
  const query = `${location} ${propertyType} ${type} hospitality research market analysis ADR occupancy cap rate`;
  return queryChunks("research-history", query, topK);
}

// ── Assumption guidance ──────────────────────────────────────────────────────

/**
 * Index an assumption guidance record so it can be retrieved by
 * similar market/property type in future research runs.
 */
export async function indexAssumptionGuidance(params: {
  entityType: "property" | "company";
  entityId: number;
  location: string;
  propertyType: string;
  assumptionKey: string;
  valueLow: number | null;
  valueMid: number | null;
  valueHigh: number | null;
  confidence: number;
  reasoning: string | null;
}): Promise<void> {
  if (!isPineconeAvailable()) return;

  try {
    const id = `guidance:${params.entityType}:${params.entityId}:${params.assumptionKey}`;
    const text = `${params.location} ${params.propertyType} ${params.assumptionKey} hospitality assumption guidance`;

    await upsertChunks("assumption-guidance", [{
      id,
      text,
      metadata: {
        entityType:    params.entityType,
        entityId:      params.entityId,
        location:      params.location,
        propertyType:  params.propertyType,
        assumptionKey: params.assumptionKey,
        valueLow:      params.valueLow ?? 0,
        valueMid:      params.valueMid ?? 0,
        valueHigh:     params.valueHigh ?? 0,
        confidence:    params.confidence,
        reasoning:     (params.reasoning ?? "").slice(0, 2_000),
      },
    }]);

    logger.info(`Indexed assumption guidance: ${params.assumptionKey} for ${params.location}`, "pinecone");
  } catch (err) {
    logger.warn(`Failed to index assumption guidance: ${err instanceof Error ? err.message : err}`, "pinecone");
  }
}

/**
 * Retrieve assumption guidance records for similar markets/property types.
 * Used to seed new research runs with prior knowledge.
 */
export async function retrieveSimilarGuidance(params: {
  location: string;
  propertyType: string;
  assumptionKeys?: string[];
  topK?: number;
}): Promise<Array<{
  assumptionKey: string;
  valueLow: number | null;
  valueMid: number | null;
  valueHigh: number | null;
  confidence: number;
  location: string;
  propertyType: string;
  reasoning: string | null;
  score: number;
}>> {
  if (!isPineconeAvailable()) return [];

  try {
    const keyPart = params.assumptionKeys?.length
      ? params.assumptionKeys.join(" ")
      : "ADR occupancy capRate costs fees";
    const query = `${params.location} ${params.propertyType} ${keyPart} hospitality assumption guidance`;
    const matches = await queryChunks("assumption-guidance", query, params.topK ?? 10);

    return matches
      .filter(m => m.score > 0.6)
      .filter(m => !params.assumptionKeys?.length || params.assumptionKeys.includes(String(m.metadata.assumptionKey)))
      .map(m => ({
        assumptionKey: String(m.metadata.assumptionKey),
        valueLow:      m.metadata.valueLow === 0 ? null : Number(m.metadata.valueLow),
        valueMid:      m.metadata.valueMid === 0 ? null : Number(m.metadata.valueMid),
        valueHigh:     m.metadata.valueHigh === 0 ? null : Number(m.metadata.valueHigh),
        confidence:    Number(m.metadata.confidence),
        location:      String(m.metadata.location),
        propertyType:  String(m.metadata.propertyType),
        reasoning:     m.metadata.reasoning ? String(m.metadata.reasoning) : null,
        score:         m.score,
      }));
  } catch (err) {
    logger.warn(`Failed to retrieve similar guidance: ${err instanceof Error ? err.message : err}`, "pinecone");
    return [];
  }
}

// ── Benchmark snapshots ──────────────────────────────────────────────────────

/**
 * Index a benchmark snapshot into the comparables namespace so the
 * relaxation engine can retrieve it during comparable search.
 */
export async function indexBenchmarkSnapshot(params: {
  market: string;
  propertyType: string;
  adr?: number | null;
  occupancy?: number | null;
  capRate?: number | null;
  revpar?: number | null;
  source: string;
  snapshotDate: string;
}): Promise<void> {
  if (!isPineconeAvailable()) return;

  try {
    const id = `benchmark:${params.market.toLowerCase().replace(/\s+/g, "-")}:${params.propertyType}:${params.source}`;
    const text = `${params.market} ${params.propertyType} hospitality benchmark ADR occupancy cap rate RevPAR market data`;

    await upsertChunks("comparables", [{
      id,
      text,
      metadata: {
        market:       params.market,
        propertyType: params.propertyType,
        adr:          params.adr ?? 0,
        occupancy:    params.occupancy ?? 0,
        capRate:      params.capRate ?? 0,
        revpar:       params.revpar ?? 0,
        source:       params.source,
        snapshotDate: params.snapshotDate,
        isBenchmark:  true,
      },
    }]);

    logger.info(`Indexed benchmark snapshot: ${params.market} (${params.source})`, "pinecone");
  } catch (err) {
    logger.warn(`Failed to index benchmark snapshot: ${err instanceof Error ? err.message : err}`, "pinecone");
  }
}

// ── Document intelligence ────────────────────────────────────────────────────

/**
 * Index extracted document content for semantic retrieval.
 */
export async function indexDocumentExtraction(params: {
  extractionId: number;
  propertyId: number;
  propertyName: string;
  documentType: string;
  extractedText: string;
  location: string;
}): Promise<void> {
  if (!isPineconeAvailable()) return;

  try {
    // Chunk the text into ~2000 char segments for Pinecone metadata limits
    const maxChunkSize = 2_000;
    const chunks: PineconeChunk[] = [];
    const fullText = params.extractedText.slice(0, DOC_MAX_CHARS);

    for (let i = 0; i < fullText.length; i += maxChunkSize) {
      const chunkIdx = Math.floor(i / maxChunkSize);
      const chunkText = fullText.slice(i, i + maxChunkSize);
      chunks.push({
        id: `doc:${params.extractionId}:chunk:${chunkIdx}`,
        text: `${params.propertyName} ${params.location} ${params.documentType} document: ${chunkText.slice(0, 500)}`,
        metadata: {
          extractionId: params.extractionId,
          propertyId:   params.propertyId,
          propertyName: params.propertyName,
          documentType: params.documentType,
          location:     params.location,
          content:      chunkText,
          chunkIndex:   chunkIdx,
        },
      });
    }

    if (chunks.length > 0) {
      await upsertChunks("documents", chunks);
      logger.info(`Indexed document extraction ${params.extractionId}: ${chunks.length} chunks for ${params.propertyName}`, "pinecone");
    }
  } catch (err) {
    logger.warn(`Failed to index document extraction: ${err instanceof Error ? err.message : err}`, "pinecone");
  }
}

/**
 * Retrieve relevant document content for a property or similar properties.
 */
export async function retrieveDocumentContext(params: {
  query: string;
  propertyId?: number;
  topK?: number;
}): Promise<Array<{
  extractionId: number;
  propertyId: number;
  propertyName: string;
  documentType: string;
  content: string;
  score: number;
}>> {
  if (!isPineconeAvailable()) return [];

  try {
    const matches = await queryChunks("documents", params.query, params.topK ?? 5);

    return matches
      .filter(m => m.score > 0.5)
      .filter(m => !params.propertyId || Number(m.metadata.propertyId) === params.propertyId)
      .map(m => ({
        extractionId: Number(m.metadata.extractionId),
        propertyId:   Number(m.metadata.propertyId),
        propertyName: String(m.metadata.propertyName),
        documentType: String(m.metadata.documentType),
        content:      String(m.metadata.content),
        score:        m.score,
      }));
  } catch (err) {
    logger.warn(`Failed to retrieve document context: ${err instanceof Error ? err.message : err}`, "pinecone");
    return [];
  }
}

// ── Scenario indexing ─────────────────────────────────────────────────────────

export async function indexScenarioSummary(params: {
  scenarioId: number;
  scenarioName: string;
  propertyId: number;
  propertyName: string;
  location: string;
  propertyType: string;
  totalRevenue?: number | null;
  totalExpenses?: number | null;
  noi?: number | null;
  adr?: number | null;
  occupancy?: number | null;
  revpar?: number | null;
  years?: number;
  createdBy?: string;
}): Promise<void> {
  if (!isPineconeAvailable()) return;

  try {
    const metrics: string[] = [];
    if (params.totalRevenue) metrics.push(`Revenue: $${Math.round(params.totalRevenue).toLocaleString()}`);
    if (params.totalExpenses) metrics.push(`Expenses: $${Math.round(params.totalExpenses).toLocaleString()}`);
    if (params.noi) metrics.push(`NOI: $${Math.round(params.noi).toLocaleString()}`);
    if (params.adr) metrics.push(`ADR: $${Math.round(params.adr)}`);
    if (params.occupancy) metrics.push(`Occupancy: ${(params.occupancy * 100).toFixed(1)}%`);
    if (params.revpar) metrics.push(`RevPAR: $${Math.round(params.revpar)}`);

    const id = `scenario:${params.scenarioId}`;
    const text = [
      `Financial scenario "${params.scenarioName}" for ${params.propertyName}`,
      `located in ${params.location}, ${params.propertyType} property`,
      params.years ? `${params.years}-year projection` : "",
      metrics.join(", "),
      "hotel hospitality financial analysis scenario projection budget forecast",
    ].filter(Boolean).join(". ");

    await upsertChunks("scenarios", [{
      id,
      text,
      metadata: {
        scenarioId:    params.scenarioId,
        scenarioName:  params.scenarioName.slice(0, 500),
        propertyId:    params.propertyId,
        propertyName:  params.propertyName.slice(0, 200),
        location:      params.location,
        propertyType:  params.propertyType,
        totalRevenue:  params.totalRevenue ?? 0,
        totalExpenses: params.totalExpenses ?? 0,
        noi:           params.noi ?? 0,
        adr:           params.adr ?? 0,
        occupancy:     params.occupancy ?? 0,
        revpar:        params.revpar ?? 0,
        years:         params.years ?? 0,
        createdBy:     (params.createdBy ?? "").slice(0, 100),
      },
    }]);

    logger.info(`Indexed scenario ${params.scenarioId}: "${params.scenarioName}" for ${params.propertyName}`, "pinecone");
  } catch (err) {
    logger.warn(`Failed to index scenario: ${err instanceof Error ? err.message : err}`, "pinecone");
  }
}

export async function retrieveScenarioContext(params: {
  query: string;
  propertyId?: number;
  topK?: number;
}): Promise<Array<{
  scenarioId: number;
  scenarioName: string;
  propertyId: number;
  propertyName: string;
  location: string;
  noi: number;
  adr: number;
  occupancy: number;
  score: number;
}>> {
  if (!isPineconeAvailable()) return [];

  try {
    const matches = await queryChunks("scenarios", params.query, params.topK ?? 5);

    return matches
      .filter(m => m.score > 0.4)
      .filter(m => !params.propertyId || Number(m.metadata.propertyId) === params.propertyId)
      .map(m => ({
        scenarioId:   Number(m.metadata.scenarioId),
        scenarioName: String(m.metadata.scenarioName),
        propertyId:   Number(m.metadata.propertyId),
        propertyName: String(m.metadata.propertyName),
        location:     String(m.metadata.location),
        noi:          Number(m.metadata.noi),
        adr:          Number(m.metadata.adr),
        occupancy:    Number(m.metadata.occupancy),
        score:        m.score,
      }));
  } catch (err) {
    logger.warn(`Failed to retrieve scenario context: ${err instanceof Error ? err.message : err}`, "pinecone");
    return [];
  }
}

// ── Property indexing ─────────────────────────────────────────────────────────

export async function indexPropertyProfile(params: {
  propertyId: number;
  name: string;
  location: string;
  propertyType: string;
  roomCount?: number | null;
  starRating?: number | null;
  status?: string;
  purchasePrice?: number | null;
  market?: string;
  description?: string | null;
  streetAddress?: string | null;
}): Promise<void> {
  if (!isPineconeAvailable()) return;

  try {
    const details: string[] = [];
    if (params.roomCount) details.push(`${params.roomCount} rooms`);
    if (params.starRating) details.push(`${params.starRating}-star`);
    if (params.purchasePrice) details.push(`$${Math.round(params.purchasePrice).toLocaleString()} purchase price`);

    const address = params.streetAddress ? `${params.streetAddress}, ${params.location}` : params.location;

    const id = `property:${params.propertyId}`;
    const text = [
      `${params.name} — ${params.propertyType} hotel property at ${address}`,
      params.market ? `${params.market} market` : "",
      details.join(", "),
      params.description ?? "",
      "hotel hospitality property portfolio real estate investment",
    ].filter(Boolean).join(". ");

    await upsertChunks("properties", [{
      id,
      text,
      metadata: {
        propertyId:    params.propertyId,
        name:          params.name.slice(0, 200),
        location:      params.location,
        propertyType:  params.propertyType,
        roomCount:     params.roomCount ?? 0,
        starRating:    params.starRating ?? 0,
        status:        params.status ?? "active",
        purchasePrice: params.purchasePrice ?? 0,
        market:        (params.market ?? "").slice(0, 200),
        streetAddress: (params.streetAddress ?? "").slice(0, 200),
      },
    }]);

    logger.info(`Indexed property profile ${params.propertyId}: "${params.name}"`, "pinecone");
  } catch (err) {
    logger.warn(`Failed to index property profile: ${err instanceof Error ? err.message : err}`, "pinecone");
  }
}

export async function retrievePropertyContext(params: {
  query: string;
  topK?: number;
}): Promise<Array<{
  propertyId: number;
  name: string;
  location: string;
  propertyType: string;
  roomCount: number;
  score: number;
}>> {
  if (!isPineconeAvailable()) return [];

  try {
    const matches = await queryChunks("properties", params.query, params.topK ?? 5);

    return matches
      .filter(m => m.score > 0.4)
      .map(m => ({
        propertyId:   Number(m.metadata.propertyId),
        name:         String(m.metadata.name),
        location:     String(m.metadata.location),
        propertyType: String(m.metadata.propertyType),
        roomCount:    Number(m.metadata.roomCount),
        score:        m.score,
      }));
  } catch (err) {
    logger.warn(`Failed to retrieve property context: ${err instanceof Error ? err.message : err}`, "pinecone");
    return [];
  }
}

export async function indexToKnowledgeBase(id: string, text: string, metadata: Record<string, unknown>): Promise<void> {
  if (!isPineconeAvailable() || !isEmbeddingAvailable()) return;
  await upsertChunks("knowledge-base", [{
    id: `kb:${id}`,
    text: text.slice(0, 8_000),
    metadata: { ...metadata, content: text.slice(0, 2_000) },
  }]);
}
