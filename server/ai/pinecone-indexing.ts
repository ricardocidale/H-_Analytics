import { logger } from "../logger";
import {
  isPineconeAvailable,
  isEmbeddingAvailable,
  upsertChunks,
  queryChunks,
  type PineconeChunk,
  type QueryMatch,
} from "./pinecone-service";

const DOC_MAX_CHARS = 100_000;

type KpiField = "adr" | "occupancy" | "capRate" | "revpar";

const CATEGORY_TO_KPI: Record<string, KpiField> = {
  hospitality_adr:       "adr",
  adr:                   "adr",
  hospitality_occupancy: "occupancy",
  occupancy:             "occupancy",
  hospitality_revpar:    "revpar",
  revpar:                "revpar",
  cap_rates:             "capRate",
  caprate:               "capRate",
};

const NULL_KPIS = { adr: null, occupancy: null, capRate: null, revpar: null } as const;

const FRESHNESS_THRESHOLD_DAYS = 90;

export function computeBenchmarkFreshness(fetchedAt: Date | string): "fresh" | "stale" {
  const fetched = typeof fetchedAt === "string" ? new Date(fetchedAt) : fetchedAt;
  const ageMs = Date.now() - fetched.getTime();
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  return ageDays <= FRESHNESS_THRESHOLD_DAYS ? "fresh" : "stale";
}

export function mapCategoryToKpis(category: string, value: number | null): {
  adr: number | null;
  occupancy: number | null;
  capRate: number | null;
  revpar: number | null;
} {
  const field = CATEGORY_TO_KPI[category.toLowerCase()];
  if (!field) return { ...NULL_KPIS };
  return { ...NULL_KPIS, [field]: value };
}

export async function indexResearchResult(params: {
  propertyId?: number;
  userId?: number;
  location: string;
  propertyType: string;
  businessModel?: string;
  type: "property" | "company" | "global";
  summary: string;
  keyMetrics?: Record<string, number>;
  completedAt: string;
}): Promise<void> {
  if (!isPineconeAvailable()) return;

  const bm = params.businessModel ?? "hotel";
  const id   = `research:${params.type}:${params.location.toLowerCase().replace(/\s+/g, "-")}:${Date.now()}`;
  const text = `${params.location} ${params.propertyType} ${bm} ${params.type} research\n\n${params.summary}`;

  const metricFields: Record<string, number> = {};
  for (const [k, v] of Object.entries(params.keyMetrics ?? {})) {
    metricFields[`metric_${k}`] = v;
  }

  await upsertChunks("research-history", [{
    id,
    text,
    metadata: {
      propertyId:   params.propertyId ?? 0,
      userId:       params.userId ?? 0,
      location:     params.location,
      propertyType: params.propertyType,
      businessModel: bm,
      type:         params.type,
      completedAt:  params.completedAt,
      summary:      params.summary.slice(0, 2_000),
      ...metricFields,
    },
  }]);

  logger.info(`Indexed research result for ${params.location} (${params.type}, ${bm})`, "pinecone");
}

export async function retrieveSimilarResearch(
  location: string,
  propertyType: string,
  type: "property" | "company" | "global",
  topK = 3,
): Promise<QueryMatch[]> {
  const query = `${location} ${propertyType} ${type} hospitality research market analysis ADR occupancy cap rate`;
  return queryChunks("research-history", query, topK);
}

export async function indexAssumptionGuidance(params: {
  entityType: "property" | "company";
  entityId: number;
  userId?: number;
  location: string;
  propertyType: string;
  businessModel?: string;
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
    const bm = params.businessModel ?? "hotel";
    const text = `${params.location} ${params.propertyType} ${bm} ${params.assumptionKey} hospitality assumption guidance`;

    await upsertChunks("assumption-guidance", [{
      id,
      text,
      metadata: {
        entityType:    params.entityType,
        entityId:      params.entityId,
        userId:        params.userId ?? 0,
        location:      params.location,
        propertyType:  params.propertyType,
        businessModel: bm,
        assumptionKey: params.assumptionKey,
        valueLow:      params.valueLow ?? 0,
        valueMid:      params.valueMid ?? 0,
        valueHigh:     params.valueHigh ?? 0,
        confidence:    params.confidence,
        reasoning:     (params.reasoning ?? "").slice(0, 2_000),
      },
    }]);

    logger.info(`Indexed assumption guidance: ${params.assumptionKey} for ${params.location} (${bm})`, "pinecone");
  } catch (err: unknown) {
    logger.warn(`Failed to index assumption guidance: ${err instanceof Error ? err.message : err}`, "pinecone");
  }
}

export async function retrieveSimilarGuidance(params: {
  location: string;
  propertyType: string;
  businessModel?: string;
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
  businessModel: string;
  reasoning: string | null;
  score: number;
}>> {
  if (!isPineconeAvailable()) return [];

  try {
    const bm = params.businessModel ?? "hotel";
    const keyPart = params.assumptionKeys?.length
      ? params.assumptionKeys.join(" ")
      : "ADR occupancy capRate costs fees";
    const query = `${params.location} ${params.propertyType} ${bm} ${keyPart} hospitality assumption guidance`;
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
        businessModel: String(m.metadata.businessModel ?? "hotel"),
        reasoning:     m.metadata.reasoning ? String(m.metadata.reasoning) : null,
        score:         m.score,
      }));
  } catch (err: unknown) {
    logger.warn(`Failed to retrieve similar guidance: ${err instanceof Error ? err.message : err}`, "pinecone");
    return [];
  }
}

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
  } catch (err: unknown) {
    logger.warn(`Failed to index benchmark snapshot: ${err instanceof Error ? err.message : err}`, "pinecone");
  }
}

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
  } catch (err: unknown) {
    logger.warn(`Failed to index document extraction: ${err instanceof Error ? err.message : err}`, "pinecone");
  }
}

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
  } catch (err: unknown) {
    logger.warn(`Failed to retrieve document context: ${err instanceof Error ? err.message : err}`, "pinecone");
    return [];
  }
}

export async function indexScenarioSummary(params: {
  scenarioId: number;
  scenarioName: string;
  propertyId: number;
  propertyName: string;
  userId?: number;
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
        userId:        params.userId ?? 0,
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
  } catch (err: unknown) {
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
  } catch (err: unknown) {
    logger.warn(`Failed to retrieve scenario context: ${err instanceof Error ? err.message : err}`, "pinecone");
    return [];
  }
}

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
  } catch (err: unknown) {
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
  } catch (err: unknown) {
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
