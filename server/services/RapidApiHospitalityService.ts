/**
 * RapidApiHospitalityService — STR comp-set data via RapidAPI subscriptions.
 *
 * Runs in PARALLEL with ApifyService (not a replacement). Both sources feed
 * the research AI until RapidAPI quality is verified superior, at which point
 * Apify actors can be phased out per source.
 *
 * Sources:
 *   Airbnb    — InsideBnB Team     (airbnb13.p.rapidapi.com)       → RAPIDAPI_KEY_3
 *   Booking   — Api Dojo           (booking-com.p.rapidapi.com)    → RAPIDAPI_KEY_2
 *   Hotels.com — Things4u          (hotels-com-provider.p.rapidapi.com) → RAPIDAPI_KEY_3
 *   TripAdvisor — apiheya          (tripadvisor16.p.rapidapi.com)  → NOT SUBSCRIBED (404 on all keys)
 *
 * Cache TTL: 12h — same as ApifyService for fair comparison.
 */

import { BaseIntegrationService } from "./BaseIntegrationService";
import { cache } from "../cache";
import { storage } from "../storage";
import { rapidApiHeaders, isRapidApiAvailable, type RapidApiSlot } from "./rapidApiKeyRouter";
import type { RapidApiCompSetData, StrListingSnapshot, DataPoint } from "../../shared/market-intelligence";

const CACHE_TTL_SECONDS = 12 * 60 * 60;
const MAX_RESULTS = 15;

const HOSTS = {
  airbnb:      "airbnb13.p.rapidapi.com",
  booking:     "booking-com.p.rapidapi.com",
  hotels:      "hotels-com-provider.p.rapidapi.com",
  tripadvisor: "tripadvisor16.p.rapidapi.com",
} as const;

export class RapidApiHospitalityService extends BaseIntegrationService {
  constructor() {
    super("RapidApiHospitality", 30_000);
  }

  isAvailable(): boolean {
    // Airbnb + Hotels.com use KEY_3 (tertiary); Booking.com uses KEY_2 (secondary).
    // The service is useful if either slot is available.
    return isRapidApiAvailable("tertiary") || isRapidApiAvailable("secondary");
  }

  async fetchCompSetData(location: string, roomCount = 1): Promise<RapidApiCompSetData> {
    const cacheKey = `rapidapi:compset:${location.toLowerCase()}:rooms${roomCount}`;
    return cache.staleWhileRevalidate<RapidApiCompSetData>(
      cacheKey,
      CACHE_TTL_SECONDS,
      () => this.fetchFresh(location, roomCount)
    );
  }

  private async fetchFresh(location: string, roomCount: number): Promise<RapidApiCompSetData> {
    const checkIn  = this.dateOffset(14);
    const checkOut = this.dateOffset(17);

    let enabledMap: Record<string, boolean> = {};
    try {
      enabledMap = await storage.getIntegrationEnabledMap();
    } catch {
      // table may not exist yet — treat all as enabled
    }
    const isOn = (key: string) => enabledMap[key] !== false;

    const [airbnbRes, bookingRes, hotelsRes, tripRes] = await Promise.allSettled([
      isOn("rapidapi-airbnb") ? this.scrapeAirbnb(location, checkIn, checkOut, roomCount) : Promise.resolve(undefined),
      isOn("rapidapi-booking") ? this.scrapeBooking(location, checkIn, checkOut) : Promise.resolve(undefined),
      isOn("rapidapi-hotels") ? this.scrapeHotelsCom(location, checkIn, checkOut) : Promise.resolve(undefined),
      isOn("rapidapi-tripadvisor") ? this.scrapeTripAdvisor(location) : Promise.resolve(undefined),
    ]);

    return {
      airbnb:      airbnbRes.status  === "fulfilled" ? airbnbRes.value  : undefined,
      booking:     bookingRes.status === "fulfilled" ? bookingRes.value : undefined,
      hotels:      hotelsRes.status  === "fulfilled" ? hotelsRes.value  : undefined,
      tripadvisor: tripRes.status    === "fulfilled" ? tripRes.value    : undefined,
    };
  }

  // ─── Airbnb (InsideBnB) ───────────────────────────────────────────────────

  private async scrapeAirbnb(
    location: string,
    checkIn: string,
    checkOut: string,
    roomCount: number
  ): Promise<RapidApiCompSetData["airbnb"]> {
    const url = `https://${HOSTS.airbnb}/search_rooms?` + new URLSearchParams({
      location,
      checkin:  checkIn,
      checkout: checkOut,
      adults:   String(Math.max(roomCount * 2, 2)),
      currency: "USD",
      offset:   "0",
    });

    const data = await this.get(url, "airbnb", "tertiary");
    if (!data) return undefined;

    const items: any[] = data?.results ?? data?.data ?? [];
    if (!items.length) return undefined;

    const prices = items
      .map((i: any) => i?.price?.rate?.amount ?? i?.price ?? i?.nightly_price)
      .filter((p: any): p is number => typeof p === "number" && p > 0);

    return {
      avgNightlyRate: prices.length ? this.point(this.avg(prices), "Airbnb via RapidAPI", HOSTS.airbnb) : undefined,
      priceRange:     prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : undefined,
      listingCount:   items.length,
      avgRating:      this.avgOpt(items.map((i: any) => i?.avgRating ?? i?.rating)),
      sampleListings: items.slice(0, 8).map((i: any) => ({
        name:          i.name ?? i.title ?? "Listing",
        pricePerNight: i?.price?.rate?.amount ?? i?.price,
        rating:        i.avgRating ?? i.rating,
        reviewCount:   i.reviewsCount ?? i.reviews_count,
        bedrooms:      i.bedrooms,
        maxGuests:     i.personCapacity ?? i.maxGuests,
        url:           i.url,
      }) as StrListingSnapshot),
      fetchedAt: new Date().toISOString(),
    };
  }

  // ─── Booking.com (Api Dojo) ───────────────────────────────────────────────

  private async scrapeBooking(
    location: string,
    checkIn: string,
    checkOut: string
  ): Promise<RapidApiCompSetData["booking"]> {
    // Step 1: resolve destination ID
    const locUrl = `https://${HOSTS.booking}/v1/hotels/locations?` + new URLSearchParams({
      name:   location,
      locale: "en-us",
    });
    const locData = await this.get(locUrl, "booking-location", "secondary");
    const destId = locData?.[0]?.dest_id;
    if (!destId) return undefined;

    // Step 2: search hotels
    const url = `https://${HOSTS.booking}/v1/hotels/search?` + new URLSearchParams({
      dest_id:        destId,
      dest_type:      "city",
      checkin_date:   checkIn,
      checkout_date:  checkOut,
      adults_number:  "2",
      room_number:    "1",
      units:          "imperial",
      currency:       "USD",
      order_by:       "popularity",
      filter_by_currency: "USD",
      locale:         "en-us",
      page_number:    "0",
    });

    const data = await this.get(url, "booking-search", "secondary");
    if (!data) return undefined;

    const items: any[] = data?.result ?? [];
    if (!items.length) return undefined;

    const prices = items
      .map((i: any) => i?.min_total_price ?? i?.price_breakdown?.gross_price)
      .filter((p: any): p is number => typeof p === "number" && p > 0)
      .map(p => Math.round(p / 3)); // 3-night stay → per night

    return {
      avgNightlyRate: prices.length ? this.point(this.avg(prices), "Booking.com via RapidAPI", HOSTS.booking) : undefined,
      priceRange:     prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : undefined,
      hotelCount:     items.length,
      sampleHotels:   items.slice(0, 8).map((i: any) => ({
        name:          i.hotel_name ?? i.name ?? "Hotel",
        pricePerNight: Math.round((i?.min_total_price ?? 0) / 3),
        rating:        i.review_score ?? i.rating,
        reviewCount:   i.review_nr,
        url:           i.url,
      }) as StrListingSnapshot),
      fetchedAt: new Date().toISOString(),
    };
  }

  // ─── Hotels.com (Things4u) ────────────────────────────────────────────────

  private async scrapeHotelsCom(
    location: string,
    checkIn: string,
    checkOut: string
  ): Promise<RapidApiCompSetData["hotels"]> {
    const url = `https://${HOSTS.hotels}/v2/hotel/search?` + new URLSearchParams({
      domain:         "US",
      locale:         "en_US",
      checkin_date:   checkIn,
      checkout_date:  checkOut,
      destination:    location,
      adults_number:  "2",
      sort_order:     "BEST_SELLER",
      page_number:    "1",
      currency_code:  "USD",
    });

    const data = await this.get(url, "hotels-com", "tertiary");
    if (!data) return undefined;

    const items: any[] = data?.data?.body?.searchResults?.results ?? data?.results ?? [];
    if (!items.length) return undefined;

    const prices = items
      .map((i: any) => i?.ratePlan?.price?.current ?? i?.price)
      .filter((p: any): p is number => typeof p === "number" && p > 0);

    return {
      avgNightlyRate: prices.length ? this.point(this.avg(prices), "Hotels.com via RapidAPI", HOSTS.hotels) : undefined,
      priceRange:     prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : undefined,
      hotelCount:     items.length,
      sampleHotels:   items.slice(0, 8).map((i: any) => ({
        name:          i.name ?? "Hotel",
        pricePerNight: i?.ratePlan?.price?.current,
        rating:        i?.guestReviews?.rating,
        reviewCount:   i?.guestReviews?.total,
        url:           i?.optimizedThumbUrls?.srpDesktop ?? i?.urls?.link,
      }) as StrListingSnapshot),
      fetchedAt: new Date().toISOString(),
    };
  }

  // ─── TripAdvisor (apiheya) ────────────────────────────────────────────────

  private async scrapeTripAdvisor(location: string): Promise<RapidApiCompSetData["tripadvisor"]> {
    // Search for hotels by location name
    const searchUrl = `https://${HOSTS.tripadvisor}/api/v1/hotels/searchLocation?` + new URLSearchParams({
      query: location,
    });
    const searchData = await this.get(searchUrl, "tripadvisor-search", "tertiary");
    const geoId = searchData?.data?.[0]?.geoId ?? searchData?.[0]?.geoId;
    if (!geoId) return undefined;

    const checkIn  = this.dateOffset(14);
    const checkOut = this.dateOffset(17);

    const url = `https://${HOSTS.tripadvisor}/api/v1/hotels/searchHotels?` + new URLSearchParams({
      geoId,
      checkIn,
      checkOut,
      adults:         "2",
      currency:       "USD",
      sort:           "POPULARITY",
    });

    const data = await this.get(url, "tripadvisor-hotels", "tertiary");
    if (!data) return undefined;

    const items: any[] = data?.data?.data ?? data?.results ?? [];
    if (!items.length) return undefined;

    const ratings = items
      .map((i: any) => i?.bubbleRating?.rating ?? i?.rating)
      .filter((r: any): r is number => typeof r === "number" && r > 0);

    return {
      avgRating:  ratings.length ? this.point(this.avg(ratings), "TripAdvisor via RapidAPI", HOSTS.tripadvisor) : undefined,
      topHotels:  items.slice(0, 8).map((i: any) => ({
        name:        i.title ?? i.name ?? "Hotel",
        rating:      i?.bubbleRating?.rating ?? i?.rating,
        reviewCount: i?.reviewCount ?? i?.reviews,
        url:         i?.commerceInfo?.externalUrl ?? i?.url,
      }) as StrListingSnapshot),
      fetchedAt: new Date().toISOString(),
    };
  }

  // ─── Shared helpers ───────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- external API responses are untyped
  private async get(url: string, label: string, slot: RapidApiSlot): Promise<any> {
    try {
      const host = new URL(url).hostname;
      const response = await this.fetchWithTimeout(url, {
        headers: rapidApiHeaders(host, slot),
      });
      return await response.json();
    } catch (err: unknown) {
      this.warn(`${label} fetch failed`, err);
      return null;
    }
  }

  private avg(nums: number[]): number {
    return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length * 100) / 100;
  }

  private avgOpt(nums: (number | undefined)[]): number | undefined {
    const valid = nums.filter((n): n is number => typeof n === "number" && n > 0);
    return valid.length ? this.avg(valid) : undefined;
  }

  private point(value: number, source: string, host: string): DataPoint {
    return { value, source, sourceUrl: `https://${host}`, fetchedAt: new Date().toISOString(), provenance: "cited", confidence: "medium" };
  }

  private dateOffset(days: number): string {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }
}
