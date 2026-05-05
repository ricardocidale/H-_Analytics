/**
 * webSearch.ts — Web search integration for AI research.
 *
 * Uses Google Custom Search API to fetch real-time market data during
 * research generation. Gracefully degrades if API keys are not configured —
 * returns an empty array so the AI proceeds with training knowledge only.
 */

import { z } from "zod";
import { EXTERNAL_API_TIMEOUT_MS } from "../constants";
import { logger } from "../logger";

const googleCseResponseSchema = z.object({
  items: z
    .array(
      z.object({
        title: z.string(),
        link: z.string(),
        snippet: z.string(),
      }),
    )
    .optional(),
});

interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export async function webSearch(
  query: string,
  numResults: number = 5
): Promise<WebSearchResult[]> {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_SEARCH_CX;

  if (!apiKey || !cx) {
    return [];
  }

  try {
    const params = new URLSearchParams({
      key: apiKey,
      cx,
      q: query,
      num: String(Math.min(numResults, 10)),
    });

    const response = await fetch(
      `https://www.googleapis.com/customsearch/v1?${params}`,
      { signal: AbortSignal.timeout(EXTERNAL_API_TIMEOUT_MS) }
    );

    if (!response.ok) {
      logger.warn(`Web search failed (${response.status}): ${response.statusText}`, "web-search");
      return [];
    }

    const parsed = googleCseResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      logger.warn(`Web search response parse error: ${parsed.error.message}`, "web-search");
      return [];
    }
    return (parsed.data.items ?? []).map((item) => ({
      title: item.title,
      url: item.link,
      snippet: item.snippet,
    }));
  } catch (error: unknown) {
    logger.warn(`Web search error: ${error instanceof Error ? error.message : error}`, "web-search");
    return [];
  }
}
