/**
 * Tripadvisor Content API client.
 *
 * Two-step pattern (sequential, rate-limit safe):
 *   1. Location search  — returns location_ids for a market query (hard cap from shared constants)
 *   2. Location details — rating, num_reviews, ranking, price_level, web_url
 *
 * Auth: TRIPADVISOR_API_KEY passed as `key` query param.
 * Base URL: https://api.content.tripadvisor.com/api/v1/
 * Free tier: 5 000 requests/month — register at tripadvisor.com/developers.
 *
 * All fetch errors are non-fatal; callers receive structured warnings[].
 */
import { logger } from "../logger";
import {
  TRIPADVISOR_MAX_HOTEL_RESULTS,
  TRIPADVISOR_DEFAULT_HOTEL_LIMIT,
} from "@shared/constants";

// Re-export so callers can import these via dynamic import("../data/tripadvisor.js")
export { TRIPADVISOR_MAX_HOTEL_RESULTS, TRIPADVISOR_DEFAULT_HOTEL_LIMIT };

// Named constants (Category 2 — DEFAULT VARIABLE: operational config)
const TRIPADVISOR_API_BASE = "https://api.content.tripadvisor.com/api/v1";
const TRIPADVISOR_FETCH_TIMEOUT_MS = 15_000;
const TRIPADVISOR_SEARCH_LANGUAGE = "en";
const TRIPADVISOR_DETAILS_CURRENCY = "USD";
const TRIPADVISOR_HOTEL_CATEGORY = "hotels";

const TAG = "[tripadvisor]";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TripadvisorHotel {
  name: string;
  locationId: string;
  rating: number | null;
  reviewCount: number | null;
  cityRanking: string | null;
  rankingOutOf: number | null;
  priceTier: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  tripadvisorUrl: string | null;
  awards: string[];
}

export interface TripadvisorSearchResult {
  market: string;
  query: string;
  source: "tripadvisor-content-api";
  fetchedAt: string;
  hotels: TripadvisorHotel[];
  summary: {
    totalFound: number;
    returned: number;
    topRatedName: string | null;
    avgRating: number | null;
  };
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildUrl(path: string, params: Record<string, string>): string {
  const url = new URL(`${TRIPADVISOR_API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRIPADVISOR_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function emptyResult(
  market: string,
  query: string,
  fetchedAt: string,
  warnings: string[],
): TripadvisorSearchResult {
  return {
    market,
    query,
    source: "tripadvisor-content-api",
    fetchedAt,
    hotels: [],
    summary: { totalFound: 0, returned: 0, topRatedName: null, avgRating: null },
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function searchTripadvisorHotels(
  market: string,
  searchQuery: string,
  limit: number,
): Promise<TripadvisorSearchResult> {
  const warnings: string[] = [];
  const hotels: TripadvisorHotel[] = [];
  const fetchedAt = new Date().toISOString();

  const apiKey = process.env.TRIPADVISOR_API_KEY;
  if (!apiKey) {
    return emptyResult(market, searchQuery, fetchedAt, [
      "TRIPADVISOR_API_KEY is not configured. Register at tripadvisor.com/developers to enable live hotel data.",
    ]);
  }

  const clampedLimit = Math.min(Math.max(1, limit), TRIPADVISOR_MAX_HOTEL_RESULTS);

  // ── Step 1: Location search ──────────────────────────────────────────────

  let locationIds: string[] = [];
  try {
    const searchUrl = buildUrl("/location/search", {
      key: apiKey,
      searchQuery: `${searchQuery} ${market}`.trim(),
      category: TRIPADVISOR_HOTEL_CATEGORY,
      language: TRIPADVISOR_SEARCH_LANGUAGE,
    });
    const res = await fetchWithTimeout(searchUrl);
    if (!res.ok) {
      const body = await res.text();
      const isAuth =
        body.toLowerCase().includes("invalid key") ||
        body.toLowerCase().includes("api key");
      warnings.push(
        isAuth
          ? "Tripadvisor API key is invalid or expired."
          : `Tripadvisor location search returned HTTP ${res.status}.`,
      );
      return emptyResult(market, searchQuery, fetchedAt, warnings);
    }
    const json = (await res.json()) as {
      data?: Array<{ location_id: string }>;
    };
    locationIds = (json.data ?? [])
      .map((d) => d.location_id)
      .slice(0, clampedLimit);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`${TAG} location search failed: ${msg}`);
    return emptyResult(market, searchQuery, fetchedAt, [
      `Tripadvisor search request failed: ${msg}`,
    ]);
  }

  // ── Step 2: Sequential location details fetch ────────────────────────────

  for (const locationId of locationIds) {
    try {
      const detailUrl = buildUrl(`/location/${locationId}/details`, {
        key: apiKey,
        language: TRIPADVISOR_SEARCH_LANGUAGE,
        currency: TRIPADVISOR_DETAILS_CURRENCY,
      });
      const res = await fetchWithTimeout(detailUrl);
      if (!res.ok) {
        warnings.push(
          `Tripadvisor details failed for location ${locationId}: HTTP ${res.status}`,
        );
        continue;
      }
      const d = (await res.json()) as {
        name?: string;
        rating?: number;
        num_reviews?: string;
        ranking?: number;
        ranking_out_of?: number;
        price_level?: string;
        latitude?: number;
        longitude?: number;
        address_obj?: { address_string?: string };
        web_url?: string;
        awards?: Array<{ display_name?: string; award_type?: string }>;
      };
      hotels.push({
        name: d.name ?? `Location ${locationId}`,
        locationId,
        rating: d.rating ?? null,
        reviewCount: (() => {
          if (d.num_reviews == null) return null;
          // Strip commas and other non-digit chars (e.g. "1,234" → 1234)
          const n = Number(String(d.num_reviews).replace(/[^0-9]/g, ""));
          return Number.isFinite(n) ? n : null;
        })(),
        cityRanking: d.ranking != null ? String(d.ranking) : null,
        rankingOutOf: d.ranking_out_of ?? null,
        priceTier: d.price_level ?? null,
        latitude: d.latitude ?? null,
        longitude: d.longitude ?? null,
        address: d.address_obj?.address_string ?? null,
        tripadvisorUrl: d.web_url ?? null,
        awards: (d.awards ?? [])
          .map((a) => a.display_name ?? a.award_type ?? "")
          .filter(Boolean),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`${TAG} details fetch for ${locationId} failed: ${msg}`);
      warnings.push(`Details unavailable for location ${locationId}: ${msg}`);
    }
  }

  // Sort: highest rating first, then by review count descending
  hotels.sort((a, b) => {
    const ratingDiff = (b.rating ?? 0) - (a.rating ?? 0);
    if (ratingDiff !== 0) return ratingDiff;
    return (b.reviewCount ?? 0) - (a.reviewCount ?? 0);
  });

  const hotelsWithRating = hotels.filter((h) => h.rating !== null);
  const avgRating =
    hotelsWithRating.length > 0
      ? parseFloat(
          (
            hotelsWithRating.reduce((sum, h) => sum + h.rating!, 0) /
            hotelsWithRating.length
          ).toFixed(1),
        )
      : null;

  return {
    market,
    query: searchQuery,
    source: "tripadvisor-content-api",
    fetchedAt,
    hotels,
    summary: {
      totalFound: locationIds.length,
      returned: hotels.length,
      topRatedName: hotels[0]?.name ?? null,
      avgRating,
    },
    warnings,
  };
}
