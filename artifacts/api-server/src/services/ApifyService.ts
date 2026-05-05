/**
 * ApifyService — Web scraping for STR competitive set analysis.
 *
 * Runs Apify actors to pull live pricing from Airbnb, Booking.com,
 * and TripAdvisor for a given location. Results feed the research AI with
 * real comp-set ADR, occupancy signals, and rating benchmarks.
 *
 * Actor IDs (public Apify store):
 *   Airbnb:      tri_angle/new-fast-airbnb-scraper
 *   Booking.com: voyager/booking-scraper
 *   TripAdvisor: maxcopell/tripadvisor
 *
 * Note: VRBO omitted — no maintained public actor available as of 2025-05.
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
import type { ApifyMarketData, ApifyListingSnapshot } from "@shared/market-intelligence";

// Forward import used by ApifyBizIntelService (declared after this class)
// We import here at module level to avoid the require() anti-pattern.
import { BaseIntegrationService as _BaseForBizIntel } from "./BaseIntegrationService";

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
   * Main entry point — runs Airbnb, Booking.com, and TripAdvisor scrapers
   * in parallel for a location. Each scraper is independently fault-tolerant;
   * one failure doesn't block others.
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

    const [airbnbResult, bookingResult, tripAdvisorResult] = await Promise.allSettled([
      this.scrapeAirbnb(location, checkIn, checkOut, roomCount),
      this.scrapeBooking(location, checkIn, checkOut),
      this.scrapeTripAdvisor(location),
    ]);

    return {
      airbnb:      airbnbResult.status === "fulfilled"      ? airbnbResult.value      : undefined,
      vrbo:        undefined,
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
    const actorId = "tri_angle/new-fast-airbnb-scraper";
    const items = await this.runActor(actorId, {
      location,
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
        ? this.toDataPoint(this.avg(prices), "Airbnb scrape", actorId)
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

  // ─── Booking.com ──────────────────────────────────────────────────────────

  private async scrapeBooking(
    location: string,
    checkIn: string,
    checkOut: string
  ): Promise<ApifyMarketData["booking"]> {
    const actorId = "voyager/booking-scraper";
    const items = await this.runActor(actorId, {
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
        ? this.toDataPoint(this.avg(prices), "Booking.com scrape", actorId)
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
    const actorId = "maxcopell/tripadvisor";
    const items = await this.runActor(actorId, {
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
        ? this.toDataPoint(this.avg(ratings), "TripAdvisor scrape", actorId)
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
      `?timeout=${ACTOR_TIMEOUT_SECONDS}`,
      `&memory=${ACTOR_MEMORY_MB}`,
    ].join("");

    try {
      const response = await this.fetchWithTimeout(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiToken}`,
        },
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

// ─── Business Intelligence Scrapers ──────────────────────────────────────────
//
// Lightweight output shapes from Apify business-intel actors.
// Used as background context for Overhead (NAI-34) and Revenue (NAI-33)
// specialist research. Actors run async/cached — not in the hot specialist path.

/** Minimal profile returned by the LinkedIn company scraper. */
export interface LinkedInCompanySnap {
  name: string;
  industry?: string;
  employeeCount?: number;
  description?: string;
  url?: string;
}

/** Minimal funding entry from the Crunchbase scraper. */
export interface CrunchbaseFundingSnap {
  organizationName: string;
  totalFundingUsd?: number;
  lastFundingType?: string;
  lastFundingDate?: string;
  url?: string;
}

/** Minimal news article from Bloomberg or WSJ scrapers. */
export interface NewsArticleSnap {
  headline: string;
  summary?: string;
  publishedAt?: string;
  url?: string;
  source: "bloomberg" | "wsj";
}

/** Aggregated business intelligence result. */
export interface ApifyBizIntelData {
  linkedIn?: LinkedInCompanySnap[];
  crunchbase?: CrunchbaseFundingSnap[];
  bloomberg?: NewsArticleSnap[];
  wsj?: NewsArticleSnap[];
  fetchedAt: string;
}

/**
 * ApifyBizIntelService — business intelligence scrapers for the Overhead and
 * Revenue specialist research pipeline.
 *
 * Actor IDs (Apify public store):
 *   LinkedIn company: bebity/linkedin-company-scraper
 *   Crunchbase:       epctex/crunchbase-scraper
 *   Bloomberg:        epctex/bloomberg-scraper
 *   WSJ:              epctex/the-wall-street-journal-scraper
 *
 * Auth: APIFY_API_TOKEN environment variable (shared with ApifyService).
 * Cache TTL: 24 h — business profile data changes slowly.
 */
export class ApifyBizIntelService extends _BaseForBizIntel {
  private readonly apiToken: string | undefined;

  constructor() {
    super("ApifyBizIntel", 120_000); // 120 s — biz-intel actors can be slow
    this.apiToken = process.env.APIFY_API_TOKEN;
  }

  isAvailable(): boolean {
    return !!this.apiToken;
  }

  /**
   * Fetch business intelligence for a hospitality query (e.g. "boutique hotel
   * management company New York"). Runs LinkedIn, Crunchbase, Bloomberg, and
   * WSJ scrapers in parallel; each is independently fault-tolerant.
   */
  async fetchBizIntel(query: string): Promise<ApifyBizIntelData> {
    const cacheKey = `apify:bizintel:${query.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 64)}`;
    const { cache: cacheModule } = await import("../cache");
    return cacheModule.staleWhileRevalidate<ApifyBizIntelData>(
      cacheKey,
      BIZ_INTEL_CACHE_TTL_SECONDS,
      () => this.fetchBizIntelFresh(query),
    );
  }

  private async fetchBizIntelFresh(query: string): Promise<ApifyBizIntelData> {
    const [linkedInResult, crunchbaseResult, bloombergResult, wsjResult] =
      await Promise.allSettled([
        this.scrapeLinkedIn(query),
        this.scrapeCrunchbase(query),
        this.scrapeBloomberg(query),
        this.scrapeWSJ(query),
      ]);

    return {
      linkedIn:   linkedInResult.status   === "fulfilled" ? linkedInResult.value   : undefined,
      crunchbase: crunchbaseResult.status === "fulfilled" ? crunchbaseResult.value : undefined,
      bloomberg:  bloombergResult.status  === "fulfilled" ? bloombergResult.value  : undefined,
      wsj:        wsjResult.status        === "fulfilled" ? wsjResult.value        : undefined,
      fetchedAt:  new Date().toISOString(),
    };
  }

  // ─── LinkedIn ─────────────────────────────────────────────────────────────

  private async scrapeLinkedIn(query: string): Promise<LinkedInCompanySnap[]> {
    const actorId = "bebity/linkedin-company-scraper";
    const items = await this.runActor(actorId, {
      searchQueries: [query],
      maxResults: BIZ_INTEL_MAX_ITEMS,
    });
    return items.map((i: Record<string, unknown>) => ({
      name:          String(i.name ?? i.companyName ?? ""),
      industry:      i.industry != null ? String(i.industry) : undefined,
      employeeCount: typeof i.employeeCount === "number" ? i.employeeCount : undefined,
      description:   i.description != null ? String(i.description).slice(0, BIZ_INTEL_DESCRIPTION_MAX_CHARS) : undefined,
      url:           i.url != null ? String(i.url) : undefined,
    })).filter((s: LinkedInCompanySnap) => s.name);
  }

  // ─── Crunchbase ───────────────────────────────────────────────────────────

  private async scrapeCrunchbase(query: string): Promise<CrunchbaseFundingSnap[]> {
    const actorId = "epctex/crunchbase-scraper";
    const items = await this.runActor(actorId, {
      search: query,
      maxItems: BIZ_INTEL_MAX_ITEMS,
      type: "organizations",
    });
    return items.map((i: Record<string, unknown>) => ({
      organizationName: String(i.name ?? i.organizationName ?? ""),
      totalFundingUsd:  typeof i.totalFunding === "number" ? i.totalFunding
                        : typeof i.total_funding_usd === "number" ? i.total_funding_usd
                        : undefined,
      lastFundingType:  i.lastFundingType != null ? String(i.lastFundingType) : undefined,
      lastFundingDate:  i.lastFundingDate != null ? String(i.lastFundingDate) : undefined,
      url:              i.url != null ? String(i.url) : undefined,
    })).filter((s: CrunchbaseFundingSnap) => s.organizationName);
  }

  // ─── Bloomberg ────────────────────────────────────────────────────────────

  private async scrapeBloomberg(query: string): Promise<NewsArticleSnap[]> {
    const actorId = "epctex/bloomberg-scraper";
    const items = await this.runActor(actorId, {
      search: query,
      maxItems: BIZ_INTEL_MAX_ITEMS,
    });
    return items.map((i: Record<string, unknown>) => ({
      headline:    String(i.title ?? i.headline ?? ""),
      summary:     i.summary != null ? String(i.summary).slice(0, BIZ_INTEL_DESCRIPTION_MAX_CHARS) : undefined,
      publishedAt: i.publishedAt != null ? String(i.publishedAt) : undefined,
      url:         i.url != null ? String(i.url) : undefined,
      source:      "bloomberg" as const,
    })).filter((s: NewsArticleSnap) => s.headline);
  }

  // ─── WSJ ──────────────────────────────────────────────────────────────────

  private async scrapeWSJ(query: string): Promise<NewsArticleSnap[]> {
    const actorId = "epctex/the-wall-street-journal-scraper";
    const items = await this.runActor(actorId, {
      search: query,
      maxItems: BIZ_INTEL_MAX_ITEMS,
    });
    return items.map((i: Record<string, unknown>) => ({
      headline:    String(i.title ?? i.headline ?? ""),
      summary:     i.summary != null ? String(i.summary).slice(0, BIZ_INTEL_DESCRIPTION_MAX_CHARS) : undefined,
      publishedAt: i.publishedAt != null ? String(i.publishedAt) : undefined,
      url:         i.url != null ? String(i.url) : undefined,
      source:      "wsj" as const,
    })).filter((s: NewsArticleSnap) => s.headline);
  }

  // ─── Actor runner (mirrors ApifyService.runActor) ─────────────────────────

  private async runActor(actorId: string, input: Record<string, unknown>): Promise<Record<string, unknown>[]> {
    if (!this.apiToken) return [];
    const url = [
      `${APIFY_BIZ_BASE_URL}/${encodeURIComponent(actorId)}/run-sync-get-dataset-items`,
      `?timeout=${BIZ_INTEL_ACTOR_TIMEOUT_SECONDS}`,
      `&memory=${BIZ_INTEL_ACTOR_MEMORY_MB}`,
    ].join("");
    try {
      const response = await this.fetchWithTimeout(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiToken}`,
        },
        body: JSON.stringify(input),
      });
      const data = await response.json();
      return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
    } catch {
      return [];
    }
  }
}

// ─── Module-level constants for ApifyBizIntelService ─────────────────────────
const APIFY_BIZ_BASE_URL              = "https://api.apify.com/v2/acts";
const BIZ_INTEL_CACHE_TTL_SECONDS     = 24 * 60 * 60; // 24 h
const BIZ_INTEL_ACTOR_TIMEOUT_SECONDS = 90;
const BIZ_INTEL_ACTOR_MEMORY_MB       = 256;
const BIZ_INTEL_MAX_ITEMS             = 10;
const BIZ_INTEL_DESCRIPTION_MAX_CHARS = 500;
