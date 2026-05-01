import { logger } from "../logger";
import {
  isVectorStoreAvailable,
  isEmbeddingAvailable,
  upsertChunks,
  queryChunks,
  type VectorChunk,
  type QueryMatch,
} from "./vector-store-service";

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
  // Phase 3 entity-aware fields for better semantic retrieval
  qualityTier?: string;
  pricingModel?: string;
  country?: string;
  marketTier?: string;
  locationType?: string;
}): Promise<void> {
  if (!isVectorStoreAvailable()) return;

  const bm = params.businessModel ?? "hotel";
  const qt = params.qualityTier ?? "";
  const pm = params.pricingModel ?? "per_room";
  const id   = `research:${params.type}:${params.location.toLowerCase().replace(/\s+/g, "-")}:${Date.now()}`;
  // Enriched text for better embedding — includes entity context
  const entityContext = [qt, bm, pm, params.country, params.marketTier, params.locationType].filter(Boolean).join(" ");
  const text = `${params.location} ${params.propertyType} ${entityContext} ${params.type} research\n\n${params.summary}`;

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
      qualityTier:  qt,
      pricingModel: pm,
      country:      params.country ?? "",
      marketTier:   params.marketTier ?? "",
      locationType: params.locationType ?? "",
      type:         params.type,
      completedAt:  params.completedAt,
      summary:      params.summary.slice(0, 2_000),
      ...metricFields,
    },
  }]);

  logger.info(`Indexed research result for ${params.location} (${params.type}, ${bm})`, "vector-store");
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
  /** Scenario this guidance belongs to; null = global / cross-scenario default. */
  scenarioId?: number | null;
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
  if (!isVectorStoreAvailable()) return;

  try {
    // Vector ID must mirror the relational uniqueness key
    // (scenarioId, entityType, entityId, assumptionKey) so scenario-specific
    // and global guidance never overwrite each other in the store.
    const scenarioPart = params.scenarioId == null ? "global" : String(params.scenarioId);
    const id = `guidance:${scenarioPart}:${params.entityType}:${params.entityId}:${params.assumptionKey}`;
    const bm = params.businessModel ?? "hotel";
    const text = `${params.location} ${params.propertyType} ${bm} ${params.assumptionKey} hospitality assumption guidance`;

    await upsertChunks("assumption-guidance", [{
      id,
      text,
      metadata: {
        entityType:    params.entityType,
        entityId:      params.entityId,
        scenarioId:    params.scenarioId ?? 0,
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

    logger.info(`Indexed assumption guidance: ${params.assumptionKey} for ${params.location} (${bm})`, "vector-store");
  } catch (err: unknown) {
    logger.warn(`Failed to index assumption guidance: ${err instanceof Error ? err.message : err}`, "vector-store");
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
  if (!isVectorStoreAvailable()) return [];

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
    logger.warn(`Failed to retrieve similar guidance: ${err instanceof Error ? err.message : err}`, "vector-store");
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
  if (!isVectorStoreAvailable()) return;

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

    logger.info(`Indexed benchmark snapshot: ${params.market} (${params.source})`, "vector-store");
  } catch (err: unknown) {
    logger.warn(`Failed to index benchmark snapshot: ${err instanceof Error ? err.message : err}`, "vector-store");
  }
}

// ── Pre-collected Market Data Indexing ───────────────────────────────────────
// These index rows from the 6 pre-collected tables into Vector store for RAG access.
// Dual access: relational DB for exact tool lookups, Vector store vectors for semantic search.

export async function indexMarketAdrData(params: {
  market: string; country: string; quarter: string;
  avgAdr: number | null; luxuryAdr: number | null; boutiqueAdr: number | null;
  avgOccupancy: number | null; avgRevpar: number | null;
  source: string | null;
}): Promise<void> {
  if (!isVectorStoreAvailable()) return;
  try {
    const id = `market-adr:${params.market.toLowerCase().replace(/\s+/g, "-")}:${params.quarter}`;
    const parts = [`${params.market} ${params.country} hotel market data ${params.quarter}`];
    if (params.avgAdr) parts.push(`average ADR $${params.avgAdr}`);
    if (params.luxuryAdr) parts.push(`luxury ADR $${params.luxuryAdr}`);
    if (params.boutiqueAdr) parts.push(`boutique ADR $${params.boutiqueAdr}`);
    if (params.avgOccupancy) parts.push(`occupancy ${params.avgOccupancy}%`);
    if (params.avgRevpar) parts.push(`RevPAR $${params.avgRevpar}`);

    await upsertChunks("comparables", [{ id, text: parts.join(", "), metadata: {
      market: params.market, country: params.country, quarter: params.quarter,
      adr: params.avgAdr ?? 0, occupancy: params.avgOccupancy ?? 0,
      revpar: params.avgRevpar ?? 0, source: params.source ?? "", isBenchmark: true,
    }}]);
  } catch (err: unknown) {
    logger.warn(`Failed to index market ADR: ${err instanceof Error ? err.message : err}`, "vector-store");
  }
}

export async function indexSeasonalCalendar(params: {
  market: string; country: string;
  months: Array<{ month: number; seasonType: string; demandMultiplier: number }>;
}): Promise<void> {
  if (!isVectorStoreAvailable()) return;
  try {
    const peak = params.months.reduce((best, m) => m.demandMultiplier > best.demandMultiplier ? m : best);
    const trough = params.months.reduce((best, m) => m.demandMultiplier < best.demandMultiplier ? m : best);
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const id = `seasonal:${params.market.toLowerCase().replace(/\s+/g, "-")}`;
    const text = `${params.market} ${params.country} seasonal demand pattern. Peak: ${monthNames[peak.month - 1]} (${peak.demandMultiplier.toFixed(2)}x). Trough: ${monthNames[trough.month - 1]} (${trough.demandMultiplier.toFixed(2)}x).`;

    await upsertChunks("research-history", [{ id, text, metadata: {
      market: params.market, country: params.country, type: "seasonal",
      peakMonth: peak.month, troughMonth: trough.month,
    }}]);
  } catch (err: unknown) {
    logger.warn(`Failed to index seasonal calendar: ${err instanceof Error ? err.message : err}`, "vector-store");
  }
}

export async function indexEventCalendar(params: {
  market: string; country: string;
  events: Array<{ name: string; startMonth: number | null; impact: string; category: string | null; attendees: number | null }>;
}): Promise<void> {
  if (!isVectorStoreAvailable()) return;
  try {
    const id = `events:${params.market.toLowerCase().replace(/\s+/g, "-")}`;
    const eventList = params.events.map(e =>
      `${e.name} (${e.impact} impact${e.attendees ? `, ~${(e.attendees / 1000).toFixed(0)}K attendees` : ""})`
    ).join("; ");
    const text = `${params.market} ${params.country} demand-driving events: ${eventList}`;

    await upsertChunks("research-history", [{ id, text, metadata: {
      market: params.market, country: params.country, type: "events",
      eventCount: params.events.length,
      highImpactCount: params.events.filter(e => e.impact === "high").length,
    }}]);
  } catch (err: unknown) {
    logger.warn(`Failed to index event calendar: ${err instanceof Error ? err.message : err}`, "vector-store");
  }
}

export async function indexLaborRates(params: {
  market: string; country: string;
  roles: Array<{ role: string; annualSalary: number | null; currency: string }>;
}): Promise<void> {
  if (!isVectorStoreAvailable()) return;
  try {
    const id = `labor:${params.market.toLowerCase().replace(/\s+/g, "-")}`;
    const roleList = params.roles.map(r =>
      `${r.role}: ${r.annualSalary ? `$${r.annualSalary.toLocaleString("en-US")}` : "N/A"}/yr`
    ).join("; ");
    const text = `${params.market} ${params.country} hospitality labor rates: ${roleList}`;

    await upsertChunks("research-history", [{ id, text, metadata: {
      market: params.market, country: params.country, type: "labor",
      roleCount: params.roles.length,
    }}]);
  } catch (err: unknown) {
    logger.warn(`Failed to index labor rates: ${err instanceof Error ? err.message : err}`, "vector-store");
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
  if (!isVectorStoreAvailable()) return;

  try {
    const maxChunkSize = 2_000;
    const chunks: VectorChunk[] = [];
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
      logger.info(`Indexed document extraction ${params.extractionId}: ${chunks.length} chunks for ${params.propertyName}`, "vector-store");
    }
  } catch (err: unknown) {
    logger.warn(`Failed to index document extraction: ${err instanceof Error ? err.message : err}`, "vector-store");
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
  if (!isVectorStoreAvailable()) return [];

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
    logger.warn(`Failed to retrieve document context: ${err instanceof Error ? err.message : err}`, "vector-store");
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
  if (!isVectorStoreAvailable()) return;

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

    logger.info(`Indexed scenario ${params.scenarioId}: "${params.scenarioName}" for ${params.propertyName}`, "vector-store");
  } catch (err: unknown) {
    logger.warn(`Failed to index scenario: ${err instanceof Error ? err.message : err}`, "vector-store");
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
  if (!isVectorStoreAvailable()) return [];

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
    logger.warn(`Failed to retrieve scenario context: ${err instanceof Error ? err.message : err}`, "vector-store");
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
  if (!isVectorStoreAvailable()) return;

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

    logger.info(`Indexed property profile ${params.propertyId}: "${params.name}"`, "vector-store");
  } catch (err: unknown) {
    logger.warn(`Failed to index property profile: ${err instanceof Error ? err.message : err}`, "vector-store");
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
  if (!isVectorStoreAvailable()) return [];

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
    logger.warn(`Failed to retrieve property context: ${err instanceof Error ? err.message : err}`, "vector-store");
    return [];
  }
}

export async function indexToKnowledgeBase(id: string, text: string, metadata: Record<string, unknown>): Promise<void> {
  if (!isVectorStoreAvailable() || !isEmbeddingAvailable()) return;
  await upsertChunks("knowledge-base", [{
    id: `kb:${id}`,
    text: text.slice(0, 8_000),
    metadata: { ...metadata, content: text.slice(0, 2_000) },
  }]);
}
