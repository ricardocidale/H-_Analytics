import { BaseIntegrationService } from "./BaseIntegrationService";
import { cache } from "../cache";
import type { DataPoint } from "../../shared/market-intelligence";

/**
 * Amadeus Hotel API integration — free tier (2,000–10,000 req/month).
 * Provides live hotel pricing across 770K+ properties for comp-set analysis.
 *
 * Authentication: OAuth2 client_credentials (SDK handles token refresh).
 * Env vars: AMADEUS_CLIENT_ID, AMADEUS_CLIENT_SECRET
 *
 * Note: The amadeus npm package must be installed (`npm install amadeus`).
 * Service degrades gracefully if the package is not available.
 */

// Dynamic require so TypeScript doesn't fail if amadeus is not installed
let Amadeus: any;
try {
  Amadeus = require("amadeus");
} catch {
  /* amadeus npm package not installed — service will be unavailable */
}

const CACHE_TTL_SECONDS = 24 * 60 * 60; // 24h — preserve free tier quota
const AMADEUS_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface AmadeusHotelOffer {
  hotelId: string;
  name: string;
  chainCode?: string;
  cityCode?: string;
  latitude?: number;
  longitude?: number;
  rating?: number;
  distance?: { value: number; unit: string };
  price?: {
    currency: string;
    total: string;
    base?: string;
  };
  roomType?: string;
  boardType?: string;
}

export interface AmadeusCompSetResult {
  propertyName: string;
  location: string;
  searchRadius: number;
  checkIn: string;
  checkOut: string;
  hotels: AmadeusHotelOffer[];
  marketStats: {
    avgRate: number | null;
    minRate: number | null;
    maxRate: number | null;
    medianRate: number | null;
    sampleSize: number;
    currency: string;
  };
  fetchedAt: string;
}

export interface AmadeusMarketRates {
  cityCode: string;
  checkIn: string;
  checkOut: string;
  avgRate: number | null;
  minRate: number | null;
  maxRate: number | null;
  medianRate: number | null;
  sampleSize: number;
  currency: string;
  fetchedAt: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AmadeusService extends BaseIntegrationService {
  private client: any = null;

  constructor() {
    super("Amadeus", AMADEUS_TIMEOUT_MS);
  }

  /** Check whether the SDK is installed and credentials are configured */
  isAvailable(): boolean {
    if (!Amadeus) return false;
    return !!(process.env.AMADEUS_CLIENT_ID && process.env.AMADEUS_CLIENT_SECRET);
  }

  private getClient(): any | null {
    if (!Amadeus) return null;
    if (this.client) return this.client;

    const clientId = process.env.AMADEUS_CLIENT_ID;
    const clientSecret = process.env.AMADEUS_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;

    this.client = new Amadeus({ clientId, clientSecret });
    return this.client;
  }

  // -------------------------------------------------------------------------
  // 1. Search hotels by geo coordinates
  // -------------------------------------------------------------------------

  async searchHotelsByLocation(
    latitude: number,
    longitude: number,
    radiusKm = 10,
    checkIn?: string,
    checkOut?: string,
  ): Promise<AmadeusHotelOffer[]> {
    const cacheKey = `amadeus:geo:${latitude.toFixed(4)},${longitude.toFixed(4)}:${radiusKm}:${checkIn ?? ""}:${checkOut ?? ""}`;
    return cache.staleWhileRevalidate<AmadeusHotelOffer[]>(
      cacheKey,
      CACHE_TTL_SECONDS,
      async () => {
        const client = this.getClient();
        if (!client) {
          this.warn("Amadeus client not available (missing SDK or credentials)");
          return [];
        }

        try {
          // Step 1: Find hotel IDs near the coordinates
          const hotelListResponse = await client.referenceData.locations.hotels.byGeocode.get({
            latitude,
            longitude,
            radius: radiusKm,
            radiusUnit: "KM",
          });

          const hotelData = hotelListResponse?.data ?? [];
          if (!hotelData.length) {
            this.log(`No hotels found near ${latitude},${longitude} within ${radiusKm}km`);
            return [];
          }

          // If no dates, return basic hotel info without pricing
          if (!checkIn || !checkOut) {
            return hotelData.slice(0, 50).map((h: any) => ({
              hotelId: h.hotelId ?? "",
              name: h.name ?? "Unknown",
              chainCode: h.chainCode,
              cityCode: h.iataCode,
              latitude: h.geoCode?.latitude,
              longitude: h.geoCode?.longitude,
              rating: h.rating ? parseInt(h.rating, 10) : undefined,
              distance: h.distance ? { value: h.distance.value, unit: h.distance.unit } : undefined,
            }));
          }

          // Step 2: Get pricing for the first 20 hotels (API limit)
          const hotelIds = hotelData.slice(0, 20).map((h: any) => h.hotelId).filter(Boolean);
          return this.getHotelPricing(hotelIds, checkIn, checkOut);
        } catch (error: unknown) {
          const err = error as Record<string, any>;
          const errMsg = err?.response?.result?.errors?.[0]?.detail ?? (error instanceof Error ? error.message : String(error));
          this.warn(`Hotel geo search failed: ${errMsg}`);
          return [];
        }
      },
    );
  }

  // -------------------------------------------------------------------------
  // 2. Get pricing for specific hotel IDs
  // -------------------------------------------------------------------------

  async getHotelPricing(
    hotelIds: string[],
    checkIn: string,
    checkOut: string,
  ): Promise<AmadeusHotelOffer[]> {
    if (!hotelIds.length) return [];

    const idsKey = hotelIds.sort().join(",");
    const cacheKey = `amadeus:pricing:${idsKey}:${checkIn}:${checkOut}`;
    return cache.staleWhileRevalidate<AmadeusHotelOffer[]>(
      cacheKey,
      CACHE_TTL_SECONDS,
      async () => {
        const client = this.getClient();
        if (!client) {
          this.warn("Amadeus client not available (missing SDK or credentials)");
          return [];
        }

        try {
          const response = await client.shopping.hotelOffersSearch.get({
            hotelIds: hotelIds.join(","),
            checkInDate: checkIn,
            checkOutDate: checkOut,
            adults: 2,
            currency: "USD",
            bestRateOnly: true,
          });

          const offers = response?.data ?? [];
          return offers.map((hotel: any) => {
            const offer = hotel.offers?.[0];
            return {
              hotelId: hotel.hotel?.hotelId ?? "",
              name: hotel.hotel?.name ?? "Unknown",
              chainCode: hotel.hotel?.chainCode,
              cityCode: hotel.hotel?.cityCode,
              latitude: hotel.hotel?.latitude,
              longitude: hotel.hotel?.longitude,
              rating: hotel.hotel?.rating ? parseInt(hotel.hotel.rating, 10) : undefined,
              price: offer?.price
                ? {
                    currency: offer.price.currency ?? "USD",
                    total: offer.price.total ?? "0",
                    base: offer.price.base,
                  }
                : undefined,
              roomType: offer?.room?.typeEstimated?.category,
              boardType: offer?.boardType,
            };
          });
        } catch (error: unknown) {
          const err = error as Record<string, any>;
          const errMsg = err?.response?.result?.errors?.[0]?.detail ?? (error instanceof Error ? error.message : String(error));
          this.warn(`Hotel pricing failed: ${errMsg}`);
          return [];
        }
      },
    );
  }

  // -------------------------------------------------------------------------
  // 3. Market-level rate aggregation
  // -------------------------------------------------------------------------

  async getMarketRates(
    cityCode: string,
    checkIn: string,
    checkOut: string,
  ): Promise<AmadeusMarketRates | null> {
    const cacheKey = `amadeus:market:${cityCode}:${checkIn}:${checkOut}`;
    return cache.staleWhileRevalidate<AmadeusMarketRates | null>(
      cacheKey,
      CACHE_TTL_SECONDS,
      async () => {
        const client = this.getClient();
        if (!client) {
          this.warn("Amadeus client not available (missing SDK or credentials)");
          return null;
        }

        try {
          // Find hotels in the city
          const hotelListResponse = await client.referenceData.locations.hotels.byCity.get({
            cityCode,
          });

          const hotelData = hotelListResponse?.data ?? [];
          if (!hotelData.length) {
            this.log(`No hotels found for city code ${cityCode}`);
            return null;
          }

          // Get pricing for up to 20 hotels (API constraint)
          const hotelIds = hotelData.slice(0, 20).map((h: any) => h.hotelId).filter(Boolean);
          const offers = await this.getHotelPricing(hotelIds, checkIn, checkOut);

          const rates = offers
            .map((o) => (o.price ? parseFloat(o.price.total) : NaN))
            .filter((r) => !isNaN(r) && r > 0);

          const currency = offers.find((o) => o.price?.currency)?.price?.currency ?? "USD";
          const stats = this.computeStats(rates);

          return {
            cityCode,
            checkIn,
            checkOut,
            ...stats,
            sampleSize: rates.length,
            currency,
            fetchedAt: new Date().toISOString(),
          };
        } catch (error: unknown) {
          const err = error as Record<string, any>;
          const errMsg = err?.response?.result?.errors?.[0]?.detail ?? (error instanceof Error ? error.message : String(error));
          this.warn(`Market rates failed for ${cityCode}: ${errMsg}`);
          return null;
        }
      },
    );
  }

  // -------------------------------------------------------------------------
  // 4. Competitive set builder — THE KEY FUNCTION
  // -------------------------------------------------------------------------

  async searchCompSet(property: {
    name: string;
    latitude: number;
    longitude: number;
    qualityTier?: string;
    location?: string;
    checkIn?: string;
    checkOut?: string;
  }): Promise<AmadeusCompSetResult | null> {
    const { latitude, longitude, qualityTier, name, location } = property;

    // Default to next week if no dates provided
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);
    const weekAfter = new Date(nextWeek);
    weekAfter.setDate(nextWeek.getDate() + 1);

    const checkIn = property.checkIn ?? nextWeek.toISOString().slice(0, 10);
    const checkOut = property.checkOut ?? weekAfter.toISOString().slice(0, 10);

    const cacheKey = `amadeus:compset:${latitude.toFixed(4)},${longitude.toFixed(4)}:${qualityTier ?? "all"}:${checkIn}:${checkOut}`;
    return cache.staleWhileRevalidate<AmadeusCompSetResult | null>(
      cacheKey,
      CACHE_TTL_SECONDS,
      async () => {
        try {
          // Search nearby hotels (15km radius for comp-set)
          const hotels = await this.searchHotelsByLocation(latitude, longitude, 15, checkIn, checkOut);

          if (!hotels.length) {
            this.log(`No comp-set hotels found near ${name}`);
            return null;
          }

          // Filter by similar star rating if quality tier is known
          const targetRating = this.qualityTierToStarRating(qualityTier);
          const filtered = targetRating
            ? hotels.filter((h) => {
                if (!h.rating) return true; // Include unrated hotels
                return Math.abs(h.rating - targetRating) <= 1; // Within 1 star
              })
            : hotels;

          // Take top 10 comp-set hotels
          const compSet = filtered.slice(0, 10);

          // Compute market stats from priced results
          const rates = compSet
            .map((h) => (h.price ? parseFloat(h.price.total) : NaN))
            .filter((r) => !isNaN(r) && r > 0);

          const currency = compSet.find((h) => h.price?.currency)?.price?.currency ?? "USD";
          const stats = this.computeStats(rates);

          return {
            propertyName: name,
            location: location ?? `${latitude},${longitude}`,
            searchRadius: 15,
            checkIn,
            checkOut,
            hotels: compSet,
            marketStats: {
              ...stats,
              sampleSize: rates.length,
              currency,
            },
            fetchedAt: new Date().toISOString(),
          };
        } catch (error: unknown) {
          this.warn(`Comp-set search failed for ${name}: ${error instanceof Error ? error.message : String(error)}`);
          return null;
        }
      },
    );
  }

  // -------------------------------------------------------------------------
  // ADR benchmark for research engine integration
  // -------------------------------------------------------------------------

  async fetchAdrBenchmark(
    latitude: number,
    longitude: number,
    qualityTier?: string,
  ): Promise<DataPoint | null> {
    try {
      const compSet = await this.searchCompSet({
        name: "benchmark",
        latitude,
        longitude,
        qualityTier,
      });

      if (!compSet || compSet.marketStats.avgRate == null) return null;

      return {
        value: compSet.marketStats.avgRate,
        source: `Amadeus Hotel API (${compSet.marketStats.sampleSize} hotels)`,
        sourceUrl: "https://developers.amadeus.com",
        fetchedAt: compSet.fetchedAt,
        provenance: "cited",
        confidence: compSet.marketStats.sampleSize >= 5 ? "medium" : "low",
      };
    } catch (error: unknown) {
      this.warn(`ADR benchmark failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private computeStats(rates: number[]): {
    avgRate: number | null;
    minRate: number | null;
    maxRate: number | null;
    medianRate: number | null;
  } {
    if (!rates.length) {
      return { avgRate: null, minRate: null, maxRate: null, medianRate: null };
    }

    const sorted = [...rates].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
      ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
      : sorted[mid];

    return {
      avgRate: Math.round(rates.reduce((a, b) => a + b, 0) / rates.length),
      minRate: Math.round(Math.min(...rates)),
      maxRate: Math.round(Math.max(...rates)),
      medianRate: Math.round(median),
    };
  }

  /** Map quality tier labels to approximate star ratings for filtering */
  private qualityTierToStarRating(tier?: string): number | null {
    if (!tier) return null;
    const map: Record<string, number> = {
      luxury: 5,
      upper_upscale: 5,
      upscale: 4,
      upper_midscale: 4,
      midscale: 3,
      economy: 2,
    };
    return map[tier.toLowerCase()] ?? null;
  }
}
