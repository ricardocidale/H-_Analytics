import { BaseIntegrationService } from "./BaseIntegrationService";
import { getPerplexityClient } from "../ai/clients";
import type { GroundedSearchResult, CitedSource } from "../../shared/market-intelligence";

interface SearchQuery {
  query: string;
  focusSites?: string[];
}

export class GroundedResearchService extends BaseIntegrationService {
  private apiKey: string | undefined;
  private provider: "perplexity" | "tavily";

  constructor() {
    super("GroundedResearch", 30_000);
    if (process.env.PERPLEXITY_API_KEY) {
      this.apiKey = process.env.PERPLEXITY_API_KEY;
      this.provider = "perplexity";
    } else if (process.env.TAVILY_API_KEY) {
      this.apiKey = process.env.TAVILY_API_KEY;
      this.provider = "tavily";
    } else {
      this.provider = "perplexity";
    }
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async search(queries: SearchQuery[]): Promise<GroundedSearchResult[]> {
    if (!this.apiKey) return [];

    const results = await Promise.allSettled(
      queries.map((q) => this.executeSearch(q))
    );

    return results
      .filter((r): r is PromiseFulfilledResult<GroundedSearchResult | null> => r.status === "fulfilled")
      .map((r) => r.value)
      .filter((r): r is GroundedSearchResult => r !== null);
  }

  buildHospitalityQueries(location: string, propertyType: string): SearchQuery[] {
    const year = new Date().getFullYear();
    return [
      {
        query: `current ${year} hotel RevPAR ADR occupancy ${location} ${propertyType} segment`,
        focusSites: ["str.com", "costar.com", "hotelnewsnow.com", "hospitalitynet.org"],
      },
      {
        query: `${year} hotel market cap rate transaction ${location} hospitality investment`,
        focusSites: ["costar.com", "hvs.com", "cbre.com", "jll.com", "pages.stern.nyu.edu"],
      },
      {
        query: `${year} new hotel supply pipeline construction ${location}`,
        focusSites: ["hotelnewsnow.com", "costar.com", "lodgingmagazine.com"],
      },
    ];
  }

  private async executeSearch(query: SearchQuery): Promise<GroundedSearchResult | null> {
    try {
      if (this.provider === "perplexity") {
        return this.searchPerplexity(query);
      }
      return this.searchTavily(query);
    } catch (error: unknown) {
      this.warn(`Search failed: ${query.query.slice(0, 60)}...`, error);
      return null;
    }
  }

  private async searchPerplexity(query: SearchQuery): Promise<GroundedSearchResult | null> {
    const siteFilter = query.focusSites?.length
      ? ` site:${query.focusSites.join(" OR site:")}`
      : "";

    const client = getPerplexityClient();
    const response = await client.chat.completions.create({
      model: "sonar",
      messages: [
        {
          role: "system",
          content: "You are a hospitality market research analyst. Provide specific, data-backed answers with current statistics. Always cite your sources.",
        },
        {
          role: "user",
          content: query.query + siteFilter,
        },
      ],
      search_recency_filter: "year",
    });

    const message = response.choices?.[0]?.message;
    const citations = response.citations ?? [];
    const searchResults = response.search_results ?? [];

    const sources: CitedSource[] = citations.map((url: string) => {
      const match = searchResults.find((sr) => sr.url === url);
      return {
        title: match?.title || url,
        url,
        snippet: match?.snippet || "",
        publishedDate: match?.date || match?.last_updated || undefined,
      };
    });

    const content = message?.content;

    return {
      query: query.query,
      answer: (typeof content === "string" ? content : "") || "",
      sources,
      fetchedAt: new Date().toISOString(),
    };
  }

  private async searchTavily(query: SearchQuery): Promise<GroundedSearchResult | null> {
    const response = await this.fetchWithTimeout("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: this.apiKey,
        query: query.query,
        include_domains: query.focusSites,
        search_depth: "advanced",
        include_answer: true,
      }),
    });

    const data = await response.json();

    const sources: CitedSource[] = (data.results ?? []).map((r: any) => ({
      title: r.title || "Source",
      url: r.url || "",
      snippet: r.content || "",
      publishedDate: r.published_date || undefined,
    }));

    return {
      query: query.query,
      answer: data.answer || "",
      sources,
      fetchedAt: new Date().toISOString(),
    };
  }
}
