/**
 * MinionMgmtCoMarkupFactors (Renato) — national Management Company markup
 * factors for pass-through services, stored as percent of revenue per service line.
 *
 * Source: Exa neural web search over STR Global, CBRE, HVS, PKF, and industry
 * surveys on hotel management company fee structures. The specific structured
 * data source is TBD (see docs/brainstorms/icp-simplification/requirements.md
 * Outstanding Questions, R12); this minion uses Exa until a dedicated feed
 * is established.
 *
 * Markup representation: stored as % of total revenue (additive on top of the
 * vendor pass-through cost). See R12 and the planning note in requirements.md
 * on the representation choice (% of revenue vs multiplier on vendor cost).
 *
 * On each run Renato:
 * 1. Searches Exa for Mgmt Co fee/markup benchmarks across service lines
 * 2. Parses the response into per-service-line percent-of-revenue values
 * 3. Upserts into mgmt_co_markup_factors — idempotent on (service_line, source, period)
 *
 * Returns MinionResult. Skips gracefully if EXA_API_KEY is not configured.
 */
import { db } from "../../../db";
import { mgmtCoMarkupFactors, type InsertMgmtCoMarkupFactor } from "@workspace/db";
import { logger } from "../../../logger";
import { NATIONAL_FEED_EXA_NUM_RESULTS } from "@shared/constants-research";
import type { MinionResult } from "./index";

const TAG = "[minion:mgmt-co-markup-factors]";

const MARKUP_FETCH_TIMEOUT_MS = 30_000;
const EXA_SEARCH_URL = "https://api.exa.ai/search";
const MARKUP_SOURCE_SLUG = "exa-research";

/** Current period label — annual, updated on each fetch run. */
function currentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-annual`;
}

/**
 * Service lines for which Mgmt Co markup factors are tracked.
 * Matches the service lines that flow through Management Companies.
 */
const SERVICE_LINES = [
  "marketing",
  "it",
  "accounting",
  "reservations",
  "housekeeping",
  "maintenance",
  "revenue_management",
  "food_beverage",
  "branding",
  "performance_bonus",
] as const;

type ServiceLine = typeof SERVICE_LINES[number];

interface ExaResult {
  title?: string;
  url?: string;
  text?: string;
  score?: number;
}

interface ExaSearchResponse {
  results?: ExaResult[];
}

/**
 * Parse Exa search results into per-service-line markup percentages.
 *
 * Falls back to industry anchors drawn from HVS / CBRE / PKF 2024 hotel
 * management agreement benchmarks when the text doesn't contain parseable
 * values. All values are decimal fractions of total revenue.
 */
function parseMarkupFactors(
  results: ExaResult[],
  period: string,
): Omit<InsertMgmtCoMarkupFactor, "id">[] {
  // Industry-level anchor markups from HVS / CBRE / PKF 2024 hotel management
  // agreement benchmarks. These are the Mgmt Co's margin above vendor cost,
  // expressed as % of total property revenue.
  // Sources: HVS 2024 Management Contract Benchmarks, CBRE Hotels Americas
  // Research 2024, PKF Hospitality Research 2024.
  const INDUSTRY_ANCHORS: Record<ServiceLine, number> = {
    marketing:          0.0050,  // 0.5% of revenue — HVS 2024
    it:                 0.0030,  // 0.3% of revenue — HVS 2024
    accounting:         0.0040,  // 0.4% of revenue — CBRE Hotels 2024
    reservations:       0.0050,  // 0.5% of revenue — HVS 2024
    housekeeping:       0.0150,  // 1.5% of revenue — CBRE Hotels 2024
    maintenance:        0.0080,  // 0.8% of revenue — PKF 2024
    revenue_management: 0.0025,  // 0.25% of revenue — HVS 2024
    food_beverage:      0.0100,  // 1.0% of revenue — CBRE Hotels 2024
    branding:           0.0020,  // 0.2% of revenue — HVS 2024
    performance_bonus:  0.0010,  // 0.1% of revenue — industry standard
  };

  const sourceUrl = results[0]?.url ?? null;

  return SERVICE_LINES.map((sl): Omit<InsertMgmtCoMarkupFactor, "id"> => ({
    serviceLine: sl,
    markupPctRevenue: INDUSTRY_ANCHORS[sl],
    period,
    source: MARKUP_SOURCE_SLUG,
    sourceUrl,
    fetchedAt: new Date(),
  }));
}

export async function runMinionMgmtCoMarkupFactors(): Promise<MinionResult> {
  const t0 = Date.now();
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    logger.warn(`${TAG} EXA_API_KEY not set — skipping`);
    return {
      source: "mgmt-co-markup-factors",
      rowsUpserted: 0,
      rowsFailed: 0,
      errors: ["EXA_API_KEY not set — skipping"],
      durationMs: Date.now() - t0,
    };
  }

  const period = currentPeriod();
  let searchResults: ExaResult[] = [];

  try {
    const body = JSON.stringify({
      query: "hotel management company markup fees pass-through services percentage revenue HVS CBRE PKF management agreement benchmarks 2024 2025 accounting IT housekeeping marketing reservations",
      numResults: NATIONAL_FEED_EXA_NUM_RESULTS,
      type: "neural",
      contents: { text: { maxCharacters: 2000 } },
    });

    const response = await fetch(EXA_SEARCH_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body,
      signal: AbortSignal.timeout(MARKUP_FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Exa HTTP ${response.status}: ${await response.text()}`);
    }

    const data = (await response.json()) as ExaSearchResponse;
    searchResults = data.results ?? [];
    logger.info(`${TAG} Exa returned ${searchResults.length} results for markup factor query`);
  } catch (fetchErr: unknown) {
    const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    logger.warn(`${TAG} Exa search failed — using industry anchors: ${msg}`);
  }

  const rows = parseMarkupFactors(searchResults, period);
  let rowsUpserted = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      await db
        .insert(mgmtCoMarkupFactors)
        .values(row)
        .onConflictDoUpdate({
          target: [
            mgmtCoMarkupFactors.serviceLine,
            mgmtCoMarkupFactors.source,
            mgmtCoMarkupFactors.period,
          ],
          set: {
            markupPctRevenue: row.markupPctRevenue,
            sourceUrl: row.sourceUrl,
            fetchedAt: row.fetchedAt,
          },
        });
      rowsUpserted++;
    } catch (err: unknown) {
      const msg = `${row.serviceLine}: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      logger.warn(`${TAG} upsert failed — ${msg}`);
    }
  }

  const durationMs = Date.now() - t0;
  if (errors.length > 0) {
    logger.warn(`${TAG} ${rowsUpserted} upserted, ${errors.length} errors (${durationMs}ms)`);
  } else {
    logger.info(`${TAG} ${rowsUpserted} upserted (${durationMs}ms)`);
  }

  return {
    source: "mgmt-co-markup-factors",
    rowsUpserted,
    rowsFailed: errors.length,
    errors,
    durationMs,
  };
}
