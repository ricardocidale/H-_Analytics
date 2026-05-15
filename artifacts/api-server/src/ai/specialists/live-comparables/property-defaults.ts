/**
 * live-comparables/property-defaults.ts — PropertyDefaults specialist (NAI-35).
 *
 * Canned core (Kalibri Labs / AHLA distribution cost studies) enriched with
 * Booking.com RapidAPI live ADR per city → OTA commission rate, plus
 * Wikipedia + CNBC OTA-structure context. Results cached 12 h (OTA rate
 * data changes daily).
 */

import { logger } from "../../../logger";
import { cache } from "../../../cache";
import {
  getCannedPropertyDefaultsComparables,
  type PropertyDefaultsComparableRow,
} from "../mgmt-co-property-defaults-orchestrator-adapter";
import { getFactoryNumber } from "@shared/model-constants-registry";
import {
  LIVE_OTA_COMMISSION_BOOKING_COM_FRACTION,
  LIVE_OTA_MIX_HEAVY_FRACTION,
  LIVE_OTA_MIX_STANDARD_FRACTION,
  LIVE_MIN_PROPERTY_DEFAULTS_LIVE_ROWS,
  LIVE_BOOKING_REPRESENTATIVE_ROOM_COUNT,
  LIVE_BOOKING_ADR_BUDGET_THRESHOLD_USD,
  LIVE_BOOKING_CHECKIN_LEAD_DAYS,
  LIVE_BOOKING_CHECKOUT_LEAD_DAYS,
  LIVE_BOOKING_MAX_HOTELS_PER_CITY,
} from "../../../constants";
import {
  CHANNEL,
  FETCH_TIMEOUT_MS,
  liveCompDateOffset,
  fetchWikipediaSummary,
  fetchCNBCHeadlines,
} from "./shared";

const DEFAULT_EVENT_EXPENSE_RATE_BENCHMARK_MID       = getFactoryNumber("benchmarkPropDefaultsEventExpenseRateMid");
const DEFAULT_OTHER_EXPENSE_RATE_BENCHMARK_MID       = getFactoryNumber("benchmarkPropDefaultsOtherExpenseRateMid");
const DEFAULT_UTILITIES_VARIABLE_SPLIT_BENCHMARK_MID = getFactoryNumber("benchmarkPropDefaultsUtilitiesVarSplitMid");

const BOOKING_RAPIDAPI_HOST       = "booking-com.p.rapidapi.com";
// 12 h cache for OTA-rate data (Booking.com pricing varies daily)
const LIVE_OTA_CACHE_TTL_SECONDS  = 12 * 60 * 60;

/** Shape of a single Booking.com live hotel snap used for OTA commission derivation. */
interface BookingHotelSnap {
  name: string;
  city: string;
  avgPricePerNightUsd: number;
}

/**
 * Fetch top boutique hotels for a city via Booking.com RapidAPI (KEY_2).
 *
 * Step 1 — resolve city → dest_id via /v1/hotels/locations.
 * Step 2 — search hotels ordered by review_score (quality proxy for boutique).
 * Avg nightly rate = min_total_price ÷ stay nights.
 *
 * Returns empty array on any API error or missing credential.
 */
async function fetchBookingComBoutiqueHotels(
  cityName: string,
): Promise<BookingHotelSnap[]> {
  const key = process.env.RAPIDAPI_KEY_2;
  if (!key) return [];
  try {
    const locUrl =
      `https://${BOOKING_RAPIDAPI_HOST}/v1/hotels/locations?` +
      new URLSearchParams({ name: cityName, locale: "en-us" });
    const locRes = await fetch(locUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "x-rapidapi-key": key, "x-rapidapi-host": BOOKING_RAPIDAPI_HOST },
    });
    if (!locRes.ok) return [];
    const locData = await locRes.json() as Array<{
      dest_id?: string;
      dest_type?: string;
    }>;
    const loc = locData?.[0];
    if (!loc?.dest_id) return [];

    const checkIn    = liveCompDateOffset(LIVE_BOOKING_CHECKIN_LEAD_DAYS);
    const checkOut   = liveCompDateOffset(LIVE_BOOKING_CHECKOUT_LEAD_DAYS);
    const stayNights = LIVE_BOOKING_CHECKOUT_LEAD_DAYS - LIVE_BOOKING_CHECKIN_LEAD_DAYS;
    const params = new URLSearchParams({
      dest_id:            loc.dest_id,
      dest_type:          loc.dest_type ?? "city",
      checkin_date:       checkIn,
      checkout_date:      checkOut,
      room_number:        "1",
      adults_number:      "1",
      order_by:           "review_score",
      locale:             "en-us",
      currency:           "USD",
      filter_by_currency: "USD",
      page_number:        "0",
    });
    const searchRes = await fetch(
      `https://${BOOKING_RAPIDAPI_HOST}/v1/hotels/search?${params}`,
      {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { "x-rapidapi-key": key, "x-rapidapi-host": BOOKING_RAPIDAPI_HOST },
      },
    );
    if (!searchRes.ok) return [];
    const searchData = await searchRes.json() as {
      result?: Array<{ hotel_name?: string; min_total_price?: number; city?: string }>;
    };

    return (searchData.result ?? [])
      .slice(0, LIVE_BOOKING_MAX_HOTELS_PER_CITY)
      .filter((h) => (h.min_total_price ?? 0) > 0)
      .map((h) => ({
        name: h.hotel_name ?? cityName,
        city: h.city ?? cityName,
        avgPricePerNightUsd: Math.round((h.min_total_price ?? 0) / stayNights),
      }));
  } catch {
    return [];
  }
}

// ────────────────────────────────────────────────────────────────────────────
// PropertyDefaults comparables — NAI-35

/**
 * NAI-35: Property-defaults comparables for the PropertyDefaults specialist.
 *
 * Live sources (tried in parallel):
 *   1. Booking.com (RapidAPI KEY_2) — live boutique hotel search in NYC,
 *      Miami, and Bogotá. Average ADR drives OTA booking-mix calibration:
 *        salesCommissionRate = adjustedMixFraction × BOOKING_COM_COMMISSION
 *      Hotels with ADR < LIVE_BOOKING_ADR_BUDGET_THRESHOLD_USD get the
 *      HEAVY OTA mix assumption; others use the city default.
 *   2. Wikipedia "Online_travel_agency" — OTA commission structure context.
 *   3. CNBC autocomplete (RapidAPI KEY_3) — recent OTA commission news.
 *
 * Falls back to full canned set if < LIVE_MIN_PROPERTY_DEFAULTS_LIVE_ROWS
 * live rows are returned. Canned rows for uncovered locales are appended.
 * Results cached 12 h (OTA rate data changes daily).
 */
export async function getPropertyDefaultsComparables(): Promise<
  readonly PropertyDefaultsComparableRow[]
> {
  const canned = getCannedPropertyDefaultsComparables();

  const liveRows = await cache.staleWhileRevalidate<PropertyDefaultsComparableRow[]>(
    "live-comparables:property-defaults:booking-com",
    LIVE_OTA_CACHE_TTL_SECONDS,
    () => fetchPropertyDefaultsLive(),
  );

  if (liveRows.length < LIVE_MIN_PROPERTY_DEFAULTS_LIVE_ROWS) {
    return canned;
  }

  const liveLocales = new Set(liveRows.map((r) => r.locale));
  const cannedFill  = canned.filter((r) => !liveLocales.has(r.locale));
  return [...liveRows, ...cannedFill];
}

/** Inner fetch function wrapped by the 12-h stale-while-revalidate cache. */
async function fetchPropertyDefaultsLive(): Promise<PropertyDefaultsComparableRow[]> {
  const today = new Date().toISOString().slice(0, 10);

  type CityConfig = {
    city: string;
    locale: string;
    vertical: "boutique-luxury" | "wellness" | "lifestyle";
    otaMixFraction: number;
  };

  const cities: CityConfig[] = [
    { city: "New York", locale: "US", vertical: "boutique-luxury", otaMixFraction: LIVE_OTA_MIX_HEAVY_FRACTION    },
    { city: "Miami",    locale: "US", vertical: "boutique-luxury", otaMixFraction: LIVE_OTA_MIX_STANDARD_FRACTION },
    { city: "Bogota",   locale: "CO", vertical: "boutique-luxury", otaMixFraction: LIVE_OTA_MIX_STANDARD_FRACTION },
  ];

  const [nyResult, miamiResult, bogotaResult, wikiOtaResult, cnbcResult] =
    await Promise.allSettled([
      fetchBookingComBoutiqueHotels(cities[0].city),
      fetchBookingComBoutiqueHotels(cities[1].city),
      fetchBookingComBoutiqueHotels(cities[2].city),
      fetchWikipediaSummary("Online_travel_agency"),
      fetchCNBCHeadlines(
        "OTA commission hotel distribution cost Booking Expedia Airbnb",
      ),
    ]);

  const cityResults = [
    { result: nyResult,     ...cities[0] },
    { result: miamiResult,  ...cities[1] },
    { result: bogotaResult, ...cities[2] },
  ];

  const otaContextSources: string[] = [];
  if (wikiOtaResult.status === "fulfilled" && wikiOtaResult.value) {
    otaContextSources.push(
      "Wikipedia: Online travel agency (en.wikipedia.org/wiki/Online_travel_agency)",
    );
  }
  if (cnbcResult.status === "fulfilled" && cnbcResult.value.length > 0) {
    otaContextSources.push(`CNBC News: "${cnbcResult.value[0]}"`);
  }

  const liveRows: PropertyDefaultsComparableRow[] = [];

  for (const { result, city, locale, vertical, otaMixFraction } of cityResults) {
    if (result.status !== "fulfilled" || !result.value.length) continue;
    const hotels = result.value.filter((h) => h.avgPricePerNightUsd > 0);
    if (!hotels.length) continue;

    const avgAdr = Math.round(
      hotels.reduce((s, h) => s + h.avgPricePerNightUsd, 0) / hotels.length,
    );
    const adjustedMix = avgAdr < LIVE_BOOKING_ADR_BUDGET_THRESHOLD_USD
      ? LIVE_OTA_MIX_HEAVY_FRACTION
      : otaMixFraction;
    const salesCommissionRate = parseFloat(
      (adjustedMix * LIVE_OTA_COMMISSION_BOOKING_COM_FRACTION).toFixed(4),
    );

    const rowSources = [
      `Booking.com live search (${city}, ${today}, avg $${avgAdr}/night, n=${hotels.length})`,
      ...otaContextSources,
      `OTA mix ${(adjustedMix * 100).toFixed(0)}% × ${(LIVE_OTA_COMMISSION_BOOKING_COM_FRACTION * 100).toFixed(0)}% commission = ${(salesCommissionRate * 100).toFixed(1)}% blended`,
    ];

    liveRows.push({
      propertyName:           `${city} Boutique Comp (Booking.com live, avg $${avgAdr}/night)`,
      locale,
      vertical,
      roomCount:              LIVE_BOOKING_REPRESENTATIVE_ROOM_COUNT,
      eventExpenseRate:       DEFAULT_EVENT_EXPENSE_RATE_BENCHMARK_MID,
      otherExpenseRate:       DEFAULT_OTHER_EXPENSE_RATE_BENCHMARK_MID,
      utilitiesVariableSplit: DEFAULT_UTILITIES_VARIABLE_SPLIT_BENCHMARK_MID,
      salesCommissionRate,
      vintage:                new Date().getFullYear(),
      source:                 rowSources.join(" | "),
    });
  }

  logger.info(
    `fetchPropertyDefaultsLive: ${liveRows.length} live rows from Booking.com`,
    CHANNEL,
  );
  return liveRows;
}
