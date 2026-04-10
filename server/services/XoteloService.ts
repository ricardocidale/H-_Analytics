import { BaseIntegrationService } from "./BaseIntegrationService";
import { cache } from "../cache";
import type { DataPoint } from "../../shared/market-intelligence";

const BASE_URL = "https://data.xotelo.com/api";
const CACHE_TTL_SECONDS = 4 * 60 * 60;
const XOTELO_TIMEOUT_MS = 20_000;

interface XoteloApiResponse {
  error?: string | Record<string, unknown>;
  result?: Record<string, unknown>;
}

export interface XoteloRate {
  code: string;
  name: string;
  rate: number;
}

export interface XoteloHotelListItem {
  name: string;
  key: string;
  accommodation_type: string;
  image?: string;
  url?: string;
  review_summary?: { rating: number; count: number };
  price_ranges?: { maximum: number; minimum: number };
  geo?: { latitude: number; longitude: number };
  mentions?: string[];
}

export interface XoteloSearchResult {
  hotel_key: string;
  location_key: string;
  name: string;
  location_id: string;
  parent_id: string;
  place_name: string;
  street_address: string;
  short_place_name: string;
  url?: string;
  image?: string;
}

export interface XoteloRateComparison {
  hotelName: string;
  hotelKey: string;
  checkIn: string;
  checkOut: string;
  rates: XoteloRate[];
  avgRate: number | null;
  minRate: number | null;
  maxRate: number | null;
  fetchedAt: string;
}

export interface XoteloMarketSnapshot {
  location: string;
  hotels: Array<{
    name: string;
    key: string;
    type: string;
    priceMin?: number;
    priceMax?: number;
    rating?: number;
    reviewCount?: number;
    geo?: { latitude: number; longitude: number };
  }>;
  avgPriceMin: number | null;
  avgPriceMax: number | null;
  sampleSize: number;
  fetchedAt: string;
}

export class XoteloService extends BaseIntegrationService {
  constructor() {
    super("Xotelo", XOTELO_TIMEOUT_MS);
  }

  isAvailable(): boolean {
    return !!process.env.RAPIDAPI_KEY_2;
  }

  async searchHotels(query: string): Promise<XoteloSearchResult[]> {
    const cacheKey = `xotelo:search:${query.toLowerCase().trim()}`;
    return cache.staleWhileRevalidate<XoteloSearchResult[]>(
      cacheKey,
      CACHE_TTL_SECONDS,
      async () => {
        const rapidApiKey = process.env.RAPIDAPI_KEY_2;
        if (!rapidApiKey) {
          this.warn("Xotelo /search requires RAPIDAPI_KEY_2 subscription — skipping");
          return [];
        }
        const url = `https://xotelo-hotel-prices.p.rapidapi.com/api/search?query=${encodeURIComponent(query)}`;
        const response = await this.fetchWithTimeout(url, {
          headers: {
            "x-rapidapi-key": rapidApiKey,
            "x-rapidapi-host": "xotelo-hotel-prices.p.rapidapi.com",
          },
        });
        const data: XoteloApiResponse = await response.json();
        if (data.error) {
          this.warn(`Search error: ${JSON.stringify(data.error)}`);
          return [];
        }
        return (Array.isArray(data.result?.list) ? data.result.list : []) as XoteloSearchResult[];
      }
    );
  }

  async getHotelRates(
    hotelKey: string,
    checkIn: string,
    checkOut: string,
    currency = "USD"
  ): Promise<XoteloRateComparison | null> {
    const cacheKey = `xotelo:rates:${hotelKey}:${checkIn}:${checkOut}:${currency}`;
    return cache.staleWhileRevalidate<XoteloRateComparison | null>(
      cacheKey,
      CACHE_TTL_SECONDS,
      async () => {
        const params = new URLSearchParams({
          hotel_key: hotelKey,
          chk_in: checkIn,
          chk_out: checkOut,
          currency,
        });
        const url = `${BASE_URL}/rates?${params}`;
        const response = await this.fetchWithTimeout(url);
        const data: XoteloApiResponse = await response.json();
        if (data.error) {
          this.warn(`Rates error for ${hotelKey}: ${data.error}`);
          return null;
        }
        const rates: XoteloRate[] = (Array.isArray(data.result?.rates) ? data.result.rates : []) as XoteloRate[];
        const values = rates.map((r) => r.rate).filter((r) => r > 0);
        return {
          hotelName: hotelKey,
          hotelKey,
          checkIn: (typeof data.result?.chk_in === "string" ? data.result.chk_in : checkIn),
          checkOut: (typeof data.result?.chk_out === "string" ? data.result.chk_out : checkOut),
          rates,
          avgRate: values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null,
          minRate: values.length ? Math.min(...values) : null,
          maxRate: values.length ? Math.max(...values) : null,
          fetchedAt: new Date().toISOString(),
        };
      }
    );
  }

  async getHotelList(
    locationKey: string,
    limit = 30,
    offset = 0,
    sort: "best_value" | "popularity" | "distance" = "popularity"
  ): Promise<XoteloHotelListItem[]> {
    const cacheKey = `xotelo:list:${locationKey}:${limit}:${offset}:${sort}`;
    return cache.staleWhileRevalidate<XoteloHotelListItem[]>(
      cacheKey,
      CACHE_TTL_SECONDS,
      async () => {
        const params = new URLSearchParams({
          location_key: locationKey,
          limit: String(limit),
          offset: String(offset),
          sort,
        });
        const url = `${BASE_URL}/list?${params}`;
        const response = await this.fetchWithTimeout(url);
        const data: XoteloApiResponse = await response.json();
        if (data.error) {
          this.warn(`List error for ${locationKey}: ${data.error}`);
          return [];
        }
        return (Array.isArray(data.result?.list) ? data.result.list : []) as XoteloHotelListItem[];
      }
    );
  }

  async getMarketSnapshot(location: string): Promise<XoteloMarketSnapshot | null> {
    try {
      const searchResults = await this.searchHotels(location);
      if (!searchResults.length) {
        this.log(`No Xotelo search results for "${location}" (RapidAPI subscription may be needed for /search)`);
        return null;
      }

      const locationKey = searchResults[0]?.location_key;
      if (!locationKey) return null;

      return this.getMarketSnapshotByKey(locationKey, location);
    } catch (error: unknown) {
      this.warn(`Market snapshot failed for ${location}`, error);
      return null;
    }
  }

  async getMarketSnapshotByKey(locationKey: string, locationLabel?: string): Promise<XoteloMarketSnapshot | null> {
    try {
      const hotels = await this.getHotelList(locationKey, 30, 0, "popularity");
      if (!hotels.length) return null;

      const mapped = hotels.map((h) => ({
        name: h.name,
        key: h.key,
        type: h.accommodation_type,
        priceMin: h.price_ranges?.minimum,
        priceMax: h.price_ranges?.maximum,
        rating: h.review_summary?.rating,
        reviewCount: h.review_summary?.count,
        geo: h.geo,
      }));

      const withPrices = mapped.filter((h) => h.priceMin != null && h.priceMax != null);
      const avgPriceMin = withPrices.length
        ? Math.round(withPrices.reduce((s, h) => s + (h.priceMin ?? 0), 0) / withPrices.length)
        : null;
      const avgPriceMax = withPrices.length
        ? Math.round(withPrices.reduce((s, h) => s + (h.priceMax ?? 0), 0) / withPrices.length)
        : null;

      return {
        location: locationLabel ?? locationKey,
        hotels: mapped,
        avgPriceMin,
        avgPriceMax,
        sampleSize: mapped.length,
        fetchedAt: new Date().toISOString(),
      };
    } catch (error: unknown) {
      this.warn(`Market snapshot by key failed for ${locationKey}`, error);
      return null;
    }
  }

  async fetchAdrBenchmark(location: string): Promise<DataPoint | null> {
    try {
      const snapshot = await this.getMarketSnapshot(location);
      if (!snapshot || snapshot.avgPriceMin == null || snapshot.avgPriceMax == null) return null;

      const midpoint = Math.round((snapshot.avgPriceMin + snapshot.avgPriceMax) / 2);
      return {
        value: midpoint,
        source: `Xotelo (${snapshot.sampleSize} hotels)`,
        sourceUrl: "https://xotelo.com",
        fetchedAt: snapshot.fetchedAt,
        provenance: "cited",
        confidence: snapshot.sampleSize >= 10 ? "medium" : "low",
      };
    } catch (error: unknown) {
      this.warn(`ADR benchmark failed for ${location}`, error);
      return null;
    }
  }
}
