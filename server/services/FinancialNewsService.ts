/**
 * FinancialNewsService — Financial news headlines from CNBC and Bloomberg Finance (RapidAPI).
 *
 * Provides recent market news and hospitality/real estate headlines to give the
 * research AI current market sentiment and macro context.
 *
 * CNBC host: cnbc.p.rapidapi.com (RAPIDAPI_KEY_3 — requires subscription)
 * Bloomberg host: bloomberg-finance.p.rapidapi.com (RAPIDAPI_KEY_3 — requires subscription)
 *
 * Cache TTL: 2 hours — news is time-sensitive but not real-time
 */

import { BaseIntegrationService } from "./BaseIntegrationService";
import { cache } from "../cache";
import { rapidApiHeaders, isRapidApiAvailable } from "./rapidApiKeyRouter";

const CNBC_HOST = "cnbc.p.rapidapi.com";
const BLOOMBERG_HOST = "bloomberg-finance.p.rapidapi.com";
const NEWS_TTL = 2 * 60 * 60;

export interface NewsHeadline {
  title: string;
  description?: string;
  url?: string;
  publishedAt?: string;
  source: "cnbc" | "bloomberg";
  category?: string;
}

export interface FinancialNewsData {
  headlines: NewsHeadline[];
  fetchedAt: string;
}

export class FinancialNewsService extends BaseIntegrationService {
  constructor() {
    super("FinancialNews", 12_000);
  }

  isAvailable(): boolean {
    return isRapidApiAvailable("tertiary");
  }

  async fetchMarketNews(topic?: string): Promise<FinancialNewsData | null> {
    if (!this.isAvailable()) return null;

    const key = topic ? topic.toLowerCase().replace(/\s+/g, "-") : "general";
    const cacheKey = `financial-news:${key}`;
    return cache.staleWhileRevalidate<FinancialNewsData | null>(
      cacheKey,
      NEWS_TTL,
      () => this.fetchFresh(topic)
    );
  }

  private async fetchFresh(topic?: string): Promise<FinancialNewsData | null> {
    const [cnbc, bloomberg] = await Promise.allSettled([
      this.fetchCNBC(topic),
      this.fetchBloomberg(topic),
    ]);

    const headlines: NewsHeadline[] = [];

    if (cnbc.status === "fulfilled" && cnbc.value) headlines.push(...cnbc.value);
    if (bloomberg.status === "fulfilled" && bloomberg.value) headlines.push(...bloomberg.value);

    // Return empty data with fetchedAt rather than null — lets aggregator distinguish
    // "no headlines available" from a hard failure, and avoids losing context slot
    if (!headlines.length) return { headlines: [], fetchedAt: new Date().toISOString() };

    // Sort by publishedAt descending if available
    headlines.sort((a, b) => {
      if (!a.publishedAt || !b.publishedAt) return 0;
      return b.publishedAt.localeCompare(a.publishedAt);
    });

    return { headlines: headlines.slice(0, 20), fetchedAt: new Date().toISOString() };
  }

  private async fetchCNBC(topic?: string): Promise<NewsHeadline[] | null> {
    try {
      // CNBC trending news endpoint
      const url = `https://${CNBC_HOST}/v2/auto-complete?q=${encodeURIComponent(topic ?? "hospitality real estate")}&limit=10`;
      const response = await this.fetchWithTimeout(url, {
        headers: rapidApiHeaders(CNBC_HOST, "tertiary"),
      });
      const data = await response.json();

      const articles: any[] = data?.data ?? data?.articles ?? data?.items ?? [];
      return articles.slice(0, 10).map((a: any) => ({
        title:       a.title ?? a.headline ?? a.name ?? "",
        description: a.description ?? a.summary ?? undefined,
        url:         a.url ?? a.canonicalUrl ?? undefined,
        publishedAt: a.datePublished ?? a.pubDate ?? undefined,
        source:      "cnbc" as const,
        category:    a.section ?? a.category ?? undefined,
      })).filter(h => h.title);
    } catch (err: unknown) {
      this.warn(`CNBC fetch failed for topic="${topic}"`, err);
      return null;
    }
  }

  private async fetchBloomberg(topic?: string): Promise<NewsHeadline[] | null> {
    try {
      // Bloomberg Finance news search
      const url = `https://${BLOOMBERG_HOST}/news/list?category=markets`;
      const response = await this.fetchWithTimeout(url, {
        headers: rapidApiHeaders(BLOOMBERG_HOST, "tertiary"),
      });
      const data = await response.json();

      const articles: any[] = data?.stories ?? data?.data ?? data?.articles ?? [];
      return articles.slice(0, 10).map((a: any) => ({
        title:       a.title ?? a.headline ?? a.name ?? "",
        description: a.summary ?? a.description ?? undefined,
        url:         a.url ?? a.shortUrl ?? undefined,
        publishedAt: a.publishedAt ?? a.updatedAt ?? undefined,
        source:      "bloomberg" as const,
        category:    a.type ?? a.category ?? undefined,
      })).filter(h => h.title);
    } catch (err: unknown) {
      this.warn(`Bloomberg fetch failed for topic="${topic}"`, err);
      return null;
    }
  }

  /** Fetch hospitality + real estate focused headlines for a specific market. */
  async fetchHospitalityNews(location: string): Promise<FinancialNewsData | null> {
    if (!this.isAvailable()) return null;

    const cacheKey = `financial-news:hospitality:${location.toLowerCase().replace(/\s+/g, "-")}`;
    return cache.staleWhileRevalidate<FinancialNewsData | null>(
      cacheKey,
      NEWS_TTL,
      () => this.fetchFresh(`${location} hotel hospitality real estate`)
    );
  }
}
