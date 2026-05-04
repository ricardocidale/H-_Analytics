/**
 * regenerate-market-data — Analyst-driven refresh of market data reference
 * tables (hospitality_benchmarks, market_adr_index, labor_rates,
 * fb_benchmarks, seasonal_calendars).
 *
 * Pattern mirrors regenerate-constants.ts:
 *   1. Build focused web-search queries for the table + optional market.
 *   2. Run GroundedResearchService; fall back gracefully if no provider.
 *   3. Ask Claude to extract typed rows as JSON.
 *   4. Upsert into the appropriate DB table.
 *   5. Persist a research_runs audit row.
 *   6. Return a typed summary of what changed.
 *
 * Pure-function side-effect-wise: only LLM + web-search IO + DB upserts.
 * Routes call this; routes own auth and HTTP shape.
 */

import { getAnthropicClient, normalizeModelId } from "./clients";
import { GroundedResearchService } from "../services/GroundedResearchService";
import { storage } from "../storage";
import { logger } from "../logger";
import type { CitedSource } from "@shared/market-intelligence";

const ANALYST_MODEL = normalizeModelId("claude-sonnet-4-6");
const MARKET_DATA_ENTITY_TYPE = "market-data-table";
const MARKET_DATA_ENTITY_ID = 0;

export type MarketDataTableName =
  | "hospitality-benchmarks"
  | "market-adr-index"
  | "labor-rates"
  | "fb-benchmarks"
  | "seasonal-calendars";

export interface MarketDataRefreshResult {
  table: MarketDataTableName;
  market: string | null;
  rowsUpserted: number;
  sources: CitedSource[];
  researchRunId: number | null;
  reasoning: string;
}

interface TableSpec {
  searchQueries: string[];
  systemPrompt: string;
  extractionPrompt: (searchResults: string, market: string | null) => string;
}

function buildTableSpec(table: MarketDataTableName, market: string | null): TableSpec {
  const marketClause = market ? ` for ${market}` : " across major hospitality markets";
  const year = new Date().getFullYear();

  switch (table) {
    case "hospitality-benchmarks":
      return {
        searchQueries: [
          `hotel ADR average daily rate benchmarks by segment ${year} STR CBRE report`,
          `boutique luxury upscale hotel occupancy RevPAR benchmarks ${year}`,
          `hotel management fee structure benchmarks HVS ${year}`,
          `hotel cap rate benchmarks full service limited service ${year} CBRE JLL`,
        ],
        systemPrompt: `You are an expert hospitality analyst extracting benchmark data from research reports. Extract only data that is explicitly stated in the sources. Never fabricate values.`,
        extractionPrompt: (results, _market) => `
From the following research results, extract hospitality benchmark values${marketClause}.

Return a JSON array of objects. Each object MUST match exactly:
{
  "category": "adr" | "occupancy" | "revpar" | "cap_rate" | "management_fee" | "cost_rate",
  "segment": string (e.g. "us_all", "us_luxury", "us_boutique", "us_economy", "us_upscale"),
  "metricKey": string (snake_case unique key, e.g. "us_luxury_adr_2025"),
  "metricLabel": string (human readable, e.g. "US Luxury Hotel ADR"),
  "value": number,
  "unit": "usd" | "percent" | "ratio" | "years",
  "sourceYear": number (e.g. ${year}),
  "sourceName": string (e.g. "STR/CoStar"),
  "sourceUrl": string | null,
  "country": "US" | "CO" | "MX" | "BR" | "PT" | "ES",
  "notes": string | null
}

Research results:
${results}

Return ONLY the JSON array. No markdown, no explanation.`,
      };

    case "market-adr-index":
      return {
        searchQueries: [
          `hotel ADR average daily rate major US markets ${year} quarterly STR data`,
          `hotel RevPAR occupancy rate by city market ${year} CBRE hotel data`,
          `boutique hotel ADR${marketClause} ${year}`,
        ],
        systemPrompt: `You are an expert hospitality analyst extracting market ADR index data. Extract only data explicitly stated in the sources.`,
        extractionPrompt: (results, mkt) => `
Extract quarterly hotel ADR data by market${mkt ? ` (focus on ${mkt})` : ""}.

Return a JSON array. Each object MUST match:
{
  "market": string (city name, e.g. "New York", "Miami", "Cartagena"),
  "country": string (2-letter ISO, e.g. "US", "CO"),
  "quarter": string (e.g. "2025-Q1"),
  "avgAdr": number | null,
  "luxuryAdr": number | null,
  "upscaleAdr": number | null,
  "midscaleAdr": number | null,
  "economyAdr": number | null,
  "boutiqueAdr": number | null,
  "avgOccupancy": number | null (as decimal 0-1, e.g. 0.72),
  "avgRevpar": number | null,
  "source": string,
  "sourceUrl": string | null
}

Research results:
${results}

Return ONLY the JSON array.`,
      };

    case "labor-rates":
      return {
        searchQueries: [
          `hotel hospitality staff labor costs wages ${year}${marketClause}`,
          `front desk housekeeping food beverage staff hourly wage hotel ${year}`,
          `hospitality workforce compensation benchmarks ${year} BLS AHLA`,
        ],
        systemPrompt: `You are an expert hospitality HR analyst extracting labor rate data.`,
        extractionPrompt: (results, mkt) => `
Extract hospitality labor rates${mkt ? ` for ${mkt}` : " for major markets"}.

Return a JSON array. Each object MUST match:
{
  "market": string (city or region),
  "country": string (2-letter ISO),
  "role": string (e.g. "Front Desk Agent", "Housekeeper", "F&B Server", "General Manager"),
  "hourlyRate": number | null (USD),
  "annualSalary": number | null (USD),
  "currency": "USD" | "COP" | "EUR" | "BRL",
  "employmentType": "fte" | "part_time" | "contract",
  "source": string,
  "sourceUrl": string | null,
  "sourceYear": number
}

Research results:
${results}

Return ONLY the JSON array.`,
      };

    case "fb-benchmarks":
      return {
        searchQueries: [
          `hotel food beverage revenue benchmarks ${year} AHLA NRA`,
          `hotel restaurant F&B cost of goods labor percent ${year}`,
          `boutique hotel food beverage ticket averages covers per room ${year}`,
        ],
        systemPrompt: `You are an expert F&B analyst extracting hospitality food and beverage benchmark data.`,
        extractionPrompt: (results, mkt) => `
Extract hotel F&B benchmark data${mkt ? ` for ${mkt}` : ""}.

Return a JSON array. Each object MUST match:
{
  "market": string,
  "country": string (2-letter ISO),
  "propertyType": string (e.g. "boutique_luxury", "full_service", "lifestyle"),
  "avgTicketPerPerson": number | null (USD),
  "avgBreakfastTicket": number | null,
  "avgLunchTicket": number | null,
  "avgDinnerTicket": number | null,
  "avgBarRevenuePerGuest": number | null,
  "coversPerRoomNight": number | null,
  "fbCostOfGoodsPercent": number | null (as decimal, e.g. 0.28),
  "fbLaborCostPercent": number | null (as decimal),
  "source": string,
  "sourceUrl": string | null,
  "sourceYear": number
}

Research results:
${results}

Return ONLY the JSON array.`,
      };

    case "seasonal-calendars":
      return {
        searchQueries: [
          `hotel demand seasonality pattern${marketClause} peak shoulder trough months`,
          `boutique hotel occupancy by month seasonal trends ${year}`,
        ],
        systemPrompt: `You are an expert hospitality analyst extracting seasonal demand patterns.`,
        extractionPrompt: (results, mkt) => `
Extract hotel seasonal demand patterns${mkt ? ` for ${mkt}` : " for major markets"}.

Return a JSON array. Each object MUST match:
{
  "market": string,
  "country": string (2-letter ISO),
  "month": number (1-12),
  "seasonType": "peak" | "shoulder" | "trough",
  "demandMultiplier": number (1.0 = baseline, e.g. 1.25 for peak),
  "avgAdrMultiplier": number | null,
  "notes": string | null
}

Research results:
${results}

Return ONLY the JSON array.`,
      };
  }
}

async function searchForTableData(queries: string[]): Promise<{ text: string; sources: CitedSource[] }> {
  try {
    const grs = new GroundedResearchService();
    const results = await grs.search(queries.map((q) => ({ query: q, recency: "month" as const })));
    const allSources: CitedSource[] = results.flatMap((r) => r.sources);
    const text = results
      .map((r) => `[Query: ${r.query}]\n${r.answer}\n${r.sources.map((s) => `- ${s.title}: ${s.snippet}`).join("\n")}`)
      .join("\n\n");
    return { text, sources: allSources };
  } catch {
    logger.warn("[market-data] Grounded search unavailable — proceeding with LLM knowledge only", "market-data");
    return { text: "(No grounded search available; reasoning from LLM training data.)", sources: [] };
  }
}

async function callClaude(systemPrompt: string, userPrompt: string): Promise<string> {
  const client = getAnthropicClient();
  const response = await client.messages.create({
    model: ANALYST_MODEL,
    max_tokens: 4096,
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userPrompt }],
  });
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("No text response from Claude");
  return block.text.trim();
}

function parseJsonArray(raw: string): unknown[] {
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) throw new Error("Expected a JSON array");
  return parsed;
}

async function upsertRows(table: MarketDataTableName, rows: unknown[]): Promise<number> {
  let count = 0;
  for (const row of rows) {
    try {
      const r = row as Record<string, unknown>;
      switch (table) {
        case "hospitality-benchmarks":
          await storage.upsertHospitalityBenchmark({
            category: String(r.category ?? ""),
            segment: String(r.segment ?? ""),
            metricKey: String(r.metricKey ?? ""),
            metricLabel: String(r.metricLabel ?? ""),
            value: Number(r.value ?? 0),
            unit: String(r.unit ?? "usd"),
            sourceYear: Number(r.sourceYear ?? new Date().getFullYear()),
            sourceName: r.sourceName != null ? String(r.sourceName) : undefined,
            sourceUrl: r.sourceUrl != null ? String(r.sourceUrl) : undefined,
            country: r.country != null ? String(r.country) : "US",
            notes: r.notes != null ? String(r.notes) : undefined,
          });
          break;
        case "market-adr-index":
          await storage.upsertMarketAdrIndex({
            market: String(r.market ?? ""),
            country: String(r.country ?? "US"),
            quarter: String(r.quarter ?? ""),
            avgAdr: r.avgAdr != null ? Number(r.avgAdr) : undefined,
            luxuryAdr: r.luxuryAdr != null ? Number(r.luxuryAdr) : undefined,
            upscaleAdr: r.upscaleAdr != null ? Number(r.upscaleAdr) : undefined,
            midscaleAdr: r.midscaleAdr != null ? Number(r.midscaleAdr) : undefined,
            economyAdr: r.economyAdr != null ? Number(r.economyAdr) : undefined,
            boutiqueAdr: r.boutiqueAdr != null ? Number(r.boutiqueAdr) : undefined,
            avgOccupancy: r.avgOccupancy != null ? Number(r.avgOccupancy) : undefined,
            avgRevpar: r.avgRevpar != null ? Number(r.avgRevpar) : undefined,
            source: r.source != null ? String(r.source) : undefined,
            sourceUrl: r.sourceUrl != null ? String(r.sourceUrl) : undefined,
          });
          break;
        case "labor-rates":
          await storage.upsertLaborRate({
            market: String(r.market ?? ""),
            country: String(r.country ?? "US"),
            role: String(r.role ?? ""),
            hourlyRate: r.hourlyRate != null ? Number(r.hourlyRate) : undefined,
            annualSalary: r.annualSalary != null ? Number(r.annualSalary) : undefined,
            currency: r.currency != null ? String(r.currency) : "USD",
            employmentType: r.employmentType != null ? String(r.employmentType) : "fte",
            source: r.source != null ? String(r.source) : undefined,
            sourceUrl: r.sourceUrl != null ? String(r.sourceUrl) : undefined,
            sourceYear: r.sourceYear != null ? Number(r.sourceYear) : undefined,
          });
          break;
        case "fb-benchmarks":
          await storage.upsertFbBenchmark({
            market: String(r.market ?? ""),
            country: String(r.country ?? "US"),
            propertyType: String(r.propertyType ?? ""),
            avgTicketPerPerson: r.avgTicketPerPerson != null ? Number(r.avgTicketPerPerson) : undefined,
            avgBreakfastTicket: r.avgBreakfastTicket != null ? Number(r.avgBreakfastTicket) : undefined,
            avgLunchTicket: r.avgLunchTicket != null ? Number(r.avgLunchTicket) : undefined,
            avgDinnerTicket: r.avgDinnerTicket != null ? Number(r.avgDinnerTicket) : undefined,
            avgBarRevenuePerGuest: r.avgBarRevenuePerGuest != null ? Number(r.avgBarRevenuePerGuest) : undefined,
            coversPerRoomNight: r.coversPerRoomNight != null ? Number(r.coversPerRoomNight) : undefined,
            fbCostOfGoodsPercent: r.fbCostOfGoodsPercent != null ? Number(r.fbCostOfGoodsPercent) : undefined,
            fbLaborCostPercent: r.fbLaborCostPercent != null ? Number(r.fbLaborCostPercent) : undefined,
            source: r.source != null ? String(r.source) : undefined,
            sourceUrl: r.sourceUrl != null ? String(r.sourceUrl) : undefined,
            sourceYear: r.sourceYear != null ? Number(r.sourceYear) : undefined,
          });
          break;
        case "seasonal-calendars":
          await storage.upsertSeasonalCalendar({
            market: String(r.market ?? ""),
            country: String(r.country ?? "US"),
            month: Number(r.month ?? 1),
            seasonType: String(r.seasonType ?? "shoulder"),
            demandMultiplier: Number(r.demandMultiplier ?? 1.0),
            avgAdrMultiplier: r.avgAdrMultiplier != null ? Number(r.avgAdrMultiplier) : undefined,
            notes: r.notes != null ? String(r.notes) : undefined,
          });
          break;
      }
      count++;
    } catch (err) {
      logger.warn(
        `[market-data] Row upsert failed: ${err instanceof Error ? err.message : String(err)}`,
        "market-data",
      );
    }
  }
  return count;
}

export async function refreshMarketDataTable(
  table: MarketDataTableName,
  market: string | null,
  userId?: number,
): Promise<MarketDataRefreshResult> {
  const startedAt = Date.now();
  const runRow = await storage.createResearchRun({
    userId: userId ?? null,
    entityType: MARKET_DATA_ENTITY_TYPE,
    entityId: MARKET_DATA_ENTITY_ID,
    tier: 1,
    status: "running",
    metadata: { table, market },
  });

  try {
    const spec = buildTableSpec(table, market);
    const { text: searchText, sources } = await searchForTableData(spec.searchQueries);
    const prompt = spec.extractionPrompt(searchText, market);
    const raw = await callClaude(spec.systemPrompt, prompt);
    const rows = parseJsonArray(raw);

    const rowsUpserted = await upsertRows(table, rows);
    const reasoning = `The Analyst reviewed ${sources.length} source(s) and extracted ${rows.length} row(s) for ${table}${market ? ` (${market})` : ""}. ${rowsUpserted} rows were upserted successfully.`;

    await storage.updateResearchRun(runRow.id, {
      status: "completed",
      completedAt: new Date(),
      durationMs: Date.now() - startedAt,
      metadata: { table, market, rowsUpserted, sourceCount: sources.length },
    });

    return { table, market, rowsUpserted, sources, researchRunId: runRow.id, reasoning };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[market-data] Refresh failed for ${table}: ${msg}`, "market-data");
    await storage.updateResearchRun(runRow.id, {
      status: "failed",
      completedAt: new Date(),
      durationMs: Date.now() - startedAt,
      error: msg,
    });
    throw err;
  }
}
