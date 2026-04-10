/**
 * ApifyService — Web scraping for STR competitive set analysis.
 *
 * Runs Apify actors to pull live pricing from Airbnb, VRBO, Booking.com,
 * and TripAdvisor for a given location. Results feed the research AI with
 * real comp-set ADR, occupancy signals, and rating benchmarks.
 *
 * Actor IDs (public Apify store):
 *   Airbnb:      apify/airbnb-scraper
 *   VRBO:        tri_angle/vrbo-scraper
 *   Booking.com: apify/booking-scraper
 *   TripAdvisor: apify/tripadvisor-scraper
 *
 * Auth: APIFY_API_TOKEN environment variable.
 *
 * Sync run endpoint:
 *   POST https://api.apify.com/v2/acts/{actorId}/run-sync-get-dataset-items
 *   ?token={token}&timeout=90&memory=256
 *
 * Cache TTL: 12 hours — STR pricing changes daily, but same-day re-fetches
 * are wasteful. 12h balances freshness vs. cost.
 */

import { BaseIntegrationService } from "./BaseIntegrationService";
import { cache } from "../cache";
import type { ApifyMarketData, ApifyListingSnapshot } from "../../shared/market-intelligence";

const APIFY_BASE_URL = "https://api.apify.com/v2/acts";
const CACHE_TTL_SECONDS = 12 * 60 * 60; // 12 hours
const ACTOR_TIMEOUT_SECONDS = 90;
const ACTOR_MEMORY_MB = 256;
const MAX_ITEMS = 15; // cap results per actor run to control cost + latency

export class ApifyService extends BaseIntegrationService {
  private readonly apiToken: string | undefined;

  constructor() {
    super("Apify", 100_000); // 100s — actor runs are slow
    this.apiToken = process.env.APIFY_API_TOKEN;
  }

  isAvailable(): boolean {
    return !!this.apiToken;
  }

  /**
   * Main entry point — runs all four scrapers in parallel for a location.
   * Each scraper is independently fault-tolerant; one failure doesn't block others.
   */
  async fetchCompSetData(location: string, roomCount = 1): Promise<ApifyMarketData> {
    const cacheKey = `apify:compset:${location.toLowerCase()}:rooms${roomCount}`;
    return cache.staleWhileRevalidate<ApifyMarketData>(
      cacheKey,
      CACHE_TTL_SECONDS,
      () => this.fetchFresh(location, roomCount)
    );
  }

  private async fetchFresh(location: string, roomCount: number): Promise<ApifyMarketData> {
    // Use a 3-night stay window starting 14 days from now
    const checkIn = this.dateOffsetDays(14);
    const checkOut = this.dateOffsetDays(17);

    const [airbnbResult, vrboResult, bookingResult, tripAdvisorResult] = await Promise.allSettled([
      this.scrapeAirbnb(location, checkIn, checkOut, roomCount),
      this.scrapeVrbo(location, checkIn, checkOut, roomCount),
      this.scrapeBooking(location, checkIn, checkOut),
      this.scrapeTripAdvisor(location),
    ]);

    return {
      airbnb:      airbnbResult.status === "fulfilled"      ? airbnbResult.value      : undefined,
      vrbo:        vrboResult.status === "fulfilled"         ? vrboResult.value         : undefined,
      booking:     bookingResult.status === "fulfilled"      ? bookingResult.value      : undefined,
      tripadvisor: tripAdvisorResult.status === "fulfilled"  ? tripAdvisorResult.value  : undefined,
    };
  }

  // ─── Airbnb ───────────────────────────────────────────────────────────────

  private async scrapeAirbnb(
    location: string,
    checkIn: string,
    checkOut: string,
    roomCount: number
  ): Promise<ApifyMarketData["airbnb"]> {
    const items = await this.runActor("apify/airbnb-scraper", {
      locationQueries: [location],
      checkIn,
      checkOut,
      currency: "USD",
      minBedrooms: roomCount > 1 ? roomCount - 1 : 1,
      maxItems: MAX_ITEMS,
      includeReviews: false,
    });

    if (!items.length) return undefined;

    const prices = items
      .map((i: any) => i.pricing?.rate?.amount ?? i.price ?? i.nightly_price)
      .filter((p: any): p is number => typeof p === "number" && p > 0);

    const listings: ApifyListingSnapshot[] = items.slice(0, 8).map((i: any) => ({
      name: i.name ?? i.title ?? "Listing",
      pricePerNight: i.pricing?.rate?.amount ?? i.price,
      rating: i.avgRating ?? i.rating,
      reviewCount: i.reviewsCount ?? i.reviews_count,
      bedrooms: i.bedrooms,
      maxGuests: i.personCapacity ?? i.maxGuests,
      url: i.url,
    }));

    return {
      avgNightlyRate: prices.length
        ? this.toDataPoint(this.avg(prices), "Airbnb scrape", "apify/airbnb-scraper")
        : undefined,
      priceRange: prices.length
        ? { min: Math.min(...prices), max: Math.max(...prices) }
        : undefined,
      listingCount: items.length,
      avgRating: this.avgOptional(items.map((i: any) => i.avgRating ?? i.rating)),
      sampleListings: listings,
      fetchedAt: new Date().toISOString(),
    };
  }

  // ─── VRBO ─────────────────────────────────────────────────────────────────

  private async scrapeVrbo(
    location: string,
    checkIn: string,
    checkOut: string,
    roomCount: number
  ): Promise<ApifyMarketData["vrbo"]> {
    const items = await this.runActor("tri_angle/vrbo-scraper", {
      location,
      checkin: checkIn,
      checkout: checkOut,
      minBedrooms: roomCount > 1 ? roomCount - 1 : 1,
      maxItems: MAX_ITEMS,
    });

    if (!items.length) return undefined;

    const prices = items
      .map((i: any) => i.pricePerNight ?? i.price?.perNight ?? i.averagePrice)
      .filter((p: any): p is number => typeof p === "number" && p > 0);

    const listings: ApifyListingSnapshot[] = items.slice(0, 8).map((i: any) => ({
      name: i.name ?? i.headline ?? "Vacation Rental",
      pricePerNight: i.pricePerNight ?? i.price?.perNight,
      rating: i.reviewAverage ?? i.rating,
      reviewCount: i.reviewCount,
      bedrooms: i.bedrooms,
      maxGuests: i.sleepCount ?? i.maxGuests,
      url: i.propertyUrl ?? i.url,
    }));

    return {
      avgNightlyRate: prices.length
        ? this.toDataPoint(this.avg(prices), "VRBO scrape", "tri_angle/vrbo-scraper")
        : undefined,
      priceRange: prices.length
        ? { min: Math.min(...prices), max: Math.max(...prices) }
        : undefined,
      listingCount: items.length,
      sampleListings: listings,
      fetchedAt: new Date().toISOString(),
    };
  }

  // ─── Booking.com ──────────────────────────────────────────────────────────

  private async scrapeBooking(
    location: string,
    checkIn: string,
    checkOut: string
  ): Promise<ApifyMarketData["booking"]> {
    const items = await this.runActor("apify/booking-scraper", {
      search: location,
      checkIn,
      checkOut,
      currency: "USD",
      maxItems: MAX_ITEMS,
      sortBy: "popularity",
    });

    if (!items.length) return undefined;

    const prices = items
      .map((i: any) => i.price ?? i.priceForDisplay)
      .filter((p: any): p is number => typeof p === "number" && p > 0);

    const hotels: ApifyListingSnapshot[] = items.slice(0, 8).map((i: any) => ({
      name: i.name ?? i.hotel_name ?? "Hotel",
      pricePerNight: i.price ?? i.priceForDisplay,
      rating: i.rating ?? i.reviewScore,
      reviewCount: i.reviews ?? i.reviewsCount,
      url: i.url,
    }));

    return {
      avgNightlyRate: prices.length
        ? this.toDataPoint(this.avg(prices), "Booking.com scrape", "apify/booking-scraper")
        : undefined,
      priceRange: prices.length
        ? { min: Math.min(...prices), max: Math.max(...prices) }
        : undefined,
      hotelCount: items.length,
      sampleHotels: hotels,
      fetchedAt: new Date().toISOString(),
    };
  }

  // ─── TripAdvisor ──────────────────────────────────────────────────────────

  private async scrapeTripAdvisor(location: string): Promise<ApifyMarketData["tripadvisor"]> {
    const items = await this.runActor("apify/tripadvisor-scraper", {
      locationFullName: location,
      includeTag: "Hotels",
      maxItems: MAX_ITEMS,
    });

    if (!items.length) return undefined;

    const ratings = items
      .map((i: any) => i.rating ?? i.reviewRating)
      .filter((r: any): r is number => typeof r === "number" && r > 0);

    const hotels: ApifyListingSnapshot[] = items.slice(0, 8).map((i: any) => ({
      name: i.name ?? i.title ?? "Hotel",
      rating: i.rating ?? i.reviewRating,
      reviewCount: i.numberOfReviews ?? i.reviews,
      url: i.url,
    }));

    return {
      avgRating: ratings.length
        ? this.toDataPoint(this.avg(ratings), "TripAdvisor scrape", "apify/tripadvisor-scraper")
        : undefined,
      topHotels: hotels,
      fetchedAt: new Date().toISOString(),
    };
  }

  // ─── Actor Runner ─────────────────────────────────────────────────────────

  private async runActor(actorId: string, input: Record<string, unknown>): Promise<any[]> {
    if (!this.apiToken) return [];

    const url = [
      `${APIFY_BASE_URL}/${encodeURIComponent(actorId)}/run-sync-get-dataset-items`,
      `?token=${this.apiToken}`,
      `&timeout=${ACTOR_TIMEOUT_SECONDS}`,
      `&memory=${ACTOR_MEMORY_MB}`,
    ].join("");

    try {
      const response = await this.fetchWithTimeout(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (err: unknown) {
      this.warn(`Actor ${actorId} failed`, err);
      return [];
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private avg(nums: number[]): number {
    return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length * 100) / 100;
  }

  private avgOptional(nums: (number | undefined)[]): number | undefined {
    const valid = nums.filter((n): n is number => typeof n === "number" && n > 0);
    return valid.length ? this.avg(valid) : undefined;
  }

  private toDataPoint(value: number, source: string, actorId: string) {
    return {
      value: Math.round(value * 100) / 100,
      source,
      sourceUrl: `https://apify.com/store/${actorId}`,
      fetchedAt: new Date().toISOString(),
      provenance: "cited" as const,
      confidence: "medium" as const,
    };
  }

  private dateOffsetDays(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }
}
