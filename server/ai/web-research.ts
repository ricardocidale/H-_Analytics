/**
 * server/ai/web-research.ts — Live web research via Perplexity and Tavily
 *
 * Supplements comparable data by running entity-aware queries against both
 * Perplexity (sonar model — synthesized answers with citations) and Tavily
 * (factual search with advanced depth). Both sources run in parallel;
 * if one fails the other is still returned (graceful degradation).
 */

import { getPerplexityClient } from "./clients";
import { logApiCost, estimateCost } from "../middleware/cost-logger";
import { logger } from "../logger";

// ── Interfaces ──────────────────────────────────────────────────────────────

export interface WebResearchCitation {
  title: string;
  url: string;
  snippet: string;
  relevanceScore?: number;
}

export interface WebResearchResult {
  source: "perplexity" | "tavily";
  query: string;
  summary: string;
  citations: WebResearchCitation[];
  retrievedAt: Date;
  tokenCost?: number;
}

export interface WebResearchRequest {
  propertyContext: {
    name: string;
    location: string;
    qualityTier?: string;
    roomCount?: number;
    businessModel?: string;
  };
  researchType:
    | "market_adr"
    | "market_occupancy"
    | "cap_rates"
    | "operating_costs"
    | "comparable_properties"
    | "regulatory"
    | "market_trends";
  country?: string;
  focusField?: string;
}

// ── Startup warnings (logged once) ──────────────────────────────────────────

let _perplexityWarned = false;
let _tavilyWarned = false;

function warnMissingKey(provider: "perplexity" | "tavily"): void {
  if (provider === "perplexity" && !_perplexityWarned) {
    _perplexityWarned = true;
    logger.warn("PERPLEXITY_API_KEY not set — Perplexity web research disabled", "web-research");
  }
  if (provider === "tavily" && !_tavilyWarned) {
    _tavilyWarned = true;
    logger.warn("TAVILY_API_KEY not set — Tavily web research disabled", "web-research");
  }
}

// ── Query Builders ──────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();

function buildMarketQuery(request: WebResearchRequest): string {
  const { propertyContext, researchType, country, focusField } = request;
  const tier = propertyContext.qualityTier || "boutique";
  const loc = propertyContext.location;
  const rooms = propertyContext.roomCount;
  const bm = propertyContext.businessModel || "hotel";
  const yr = `${CURRENT_YEAR - 1} ${CURRENT_YEAR}`;

  switch (researchType) {
    case "market_adr":
      return `${tier} ${bm} ADR ${loc} ${yr} average daily rate trends revenue per available room`;

    case "market_occupancy":
      return `${tier} ${bm} occupancy rates ${loc} ${yr} seasonal trends`;

    case "cap_rates":
      return `hotel capitalization rate ${tier} ${loc} ${yr} investment transaction`;

    case "operating_costs": {
      const focus = focusField
        ? ` ${focusField.replace(/([A-Z])/g, " $1").toLowerCase()} department`
        : "";
      return `hotel operating expenses${focus} percentage ${tier} ${yr} USALI`;
    }

    case "comparable_properties":
      return `boutique hotel comparable sales ${loc} ${rooms ? `${rooms} rooms` : ""} ${yr} transaction price per key`;

    case "regulatory":
      return `hotel zoning requirements ${loc} building codes hospitality conversion ${country || ""}`.trim();

    case "market_trends":
      return `hospitality market outlook ${loc} ${yr} investment forecast supply demand ${tier}`;

    default:
      return `${tier} hotel market data ${loc} ${yr}`;
  }
}

// Hospitality-specific domains for Tavily filtering
const HOSPITALITY_DOMAINS = [
  "str.com",
  "cbre.com",
  "hvs.com",
  "hospitalitynet.org",
  "hotelmanagement.net",
  "hotelnewsnow.com",
  "costar.com",
  "jll.com",
  "lodgingmagazine.com",
  "pkfhotels.com",
  "hotstats.com",
];

// ── Perplexity Search ───────────────────────────────────────────────────────

export async function searchWithPerplexity(
  request: WebResearchRequest,
): Promise<WebResearchResult | null> {
  if (!process.env.PERPLEXITY_API_KEY) {
    warnMissingKey("perplexity");
    return null;
  }

  const query = buildMarketQuery(request);
  const startTime = Date.now();

  try {
    const client = getPerplexityClient();

    const systemPrompt = [
      "You are a hospitality market research analyst specializing in hotel investment analysis.",
      "Provide specific, data-backed answers with current statistics, dollar amounts, percentages, and ranges.",
      "Always cite your sources with URLs when possible.",
      "Focus on quantitative data points useful for financial modeling — ADR, occupancy, cap rates, operating ratios.",
      `Property context: ${request.propertyContext.name} in ${request.propertyContext.location}`,
      request.propertyContext.qualityTier ? `Quality tier: ${request.propertyContext.qualityTier}` : "",
      request.propertyContext.roomCount ? `Room count: ${request.propertyContext.roomCount}` : "",
      request.propertyContext.businessModel ? `Business model: ${request.propertyContext.businessModel}` : "",
    ].filter(Boolean).join("\n");

    const response = await client.chat.completions.create({
      model: "sonar",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ],
      search_recency_filter: "year",
    });

    const message = response.choices?.[0]?.message;
    const rawCitations: string[] = (response as any).citations ?? [];
    const searchResults: Array<{ url?: string; title?: string; snippet?: string; date?: string; last_updated?: string }> =
      (response as any).search_results ?? [];

    const citations: WebResearchCitation[] = rawCitations.map((url: string) => {
      const match = searchResults.find((sr) => sr.url === url);
      return {
        title: match?.title || url,
        url,
        snippet: match?.snippet || "",
      };
    });

    const content = message?.content;
    const summary = typeof content === "string" ? content : "";

    // Approximate token cost
    const inTok = Math.round((systemPrompt.length + query.length) / 4);
    const outTok = Math.round(summary.length / 4);
    const costUsd = estimateCost("perplexity", "sonar", inTok, outTok);

    try {
      logApiCost({
        timestamp: new Date().toISOString(),
        service: "perplexity",
        model: "sonar",
        operation: "web-research",
        inputTokens: inTok,
        outputTokens: outTok,
        estimatedCostUsd: costUsd,
        durationMs: Date.now() - startTime,
        route: "/api/research/web-search",
      });
    } catch {
      // non-blocking
    }

    return {
      source: "perplexity",
      query,
      summary,
      citations,
      retrievedAt: new Date(),
      tokenCost: costUsd,
    };
  } catch (error: unknown) {
    logger.warn(
      `Perplexity web research failed: ${error instanceof Error ? error.message : error}`,
      "web-research",
    );
    return null;
  }
}

// ── Tavily Search ───────────────────────────────────────────────────────────

export async function searchWithTavily(
  request: WebResearchRequest,
): Promise<WebResearchResult | null> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    warnMissingKey("tavily");
    return null;
  }

  const query = buildMarketQuery(request);
  const startTime = Date.now();

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        include_domains: HOSPITALITY_DOMAINS,
        search_depth: "advanced",
        include_answer: true,
        max_results: 10,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`Tavily HTTP ${response.status}`);
    }

    const data = await response.json() as {
      answer?: string;
      results?: Array<{
        title?: string;
        url?: string;
        content?: string;
        score?: number;
        published_date?: string;
      }>;
    };

    const citations: WebResearchCitation[] = (data.results ?? []).map((r) => ({
      title: r.title || "Source",
      url: r.url || "",
      snippet: r.content || "",
      relevanceScore: r.score,
    }));

    const summary = data.answer || "";

    return {
      source: "tavily",
      query,
      summary,
      citations,
      retrievedAt: new Date(),
    };
  } catch (error: unknown) {
    logger.warn(
      `Tavily web research failed: ${error instanceof Error ? error.message : error}`,
      "web-research",
    );
    return null;
  }
}

// ── Combined Research ───────────────────────────────────────────────────────

/**
 * Run both Perplexity and Tavily in parallel. Returns all successful results.
 * If both fail, returns an empty array (never throws).
 */
export async function conductWebResearch(
  request: WebResearchRequest,
): Promise<WebResearchResult[]> {
  const [perplexityResult, tavilyResult] = await Promise.allSettled([
    searchWithPerplexity(request),
    searchWithTavily(request),
  ]);

  const results: WebResearchResult[] = [];

  if (perplexityResult.status === "fulfilled" && perplexityResult.value) {
    results.push(perplexityResult.value);
  } else if (perplexityResult.status === "rejected") {
    logger.warn(`Perplexity rejected: ${perplexityResult.reason}`, "web-research");
  }

  if (tavilyResult.status === "fulfilled" && tavilyResult.value) {
    results.push(tavilyResult.value);
  } else if (tavilyResult.status === "rejected") {
    logger.warn(`Tavily rejected: ${tavilyResult.reason}`, "web-research");
  }

  if (results.length > 0) {
    logger.info(
      `Web research returned ${results.length} source(s) for "${request.researchType}" — ${request.propertyContext.location}`,
      "web-research",
    );
  }

  return results;
}

/**
 * Check whether at least one web research provider is configured.
 */
export function isWebResearchAvailable(): boolean {
  return !!(process.env.PERPLEXITY_API_KEY || process.env.TAVILY_API_KEY);
}
