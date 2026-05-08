/**
 * MinionBookingRates — competitor hotel rate snapshots via RapidAPI Booking.com.
 *
 * Fetches weekly rate snapshots for key US markets and upserts into
 * competitor_rates. Check-in date = next Friday from time of fetch.
 */
import { db } from "../../../db";
import { competitorRates, type InsertCompetitorRate } from "@workspace/db";
import { logger } from "../../../logger";
import { nextFriday, toIsoDate } from "./date-utils";
import type { MinionResult } from "./index";

const TAG = "[minion:booking-rates]";

const BOOKING_FETCH_TIMEOUT_MS = 20_000;
const BOOKING_HOST = "booking-com15.p.rapidapi.com";
const BOOKING_DEFAULT_ADULTS = 2;
const BOOKING_DEFAULT_ROOMS = 1;

const COMPETITOR_MARKETS = [
  "Miami, FL",
  "New York, NY",
  "Denver, CO",
  "Los Angeles, CA",
  "Chicago, IL",
] as const;

const NIGHTS_TO_FETCH = 2;

interface BookingHotel {
  min_total_price?: number;
  price_breakdown?: { all_inclusive_price?: number };
}

async function fetchBookingRates(market: string, apiKey: string, checkIn: string, checkOut: string): Promise<number | null> {
  const params = new URLSearchParams({
    dest_id: market,
    search_type: "city",
    arrival_date: checkIn,
    departure_date: checkOut,
    adults: String(BOOKING_DEFAULT_ADULTS),
    room_qty: String(BOOKING_DEFAULT_ROOMS),
    languagecode: "en-us",
    currency_code: "USD",
  });

  const response = await fetch(
    `https://${BOOKING_HOST}/api/v1/hotels/searchHotels?${params}`,
    {
      headers: {
        "x-rapidapi-host": BOOKING_HOST,
        "x-rapidapi-key": apiKey,
      },
      signal: AbortSignal.timeout(BOOKING_FETCH_TIMEOUT_MS),
    },
  );

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const data = (await response.json()) as { data?: { hotels?: BookingHotel[] } };
  const hotels = data.data?.hotels ?? [];
  if (hotels.length === 0) return null;

  const prices = hotels
    .map(h => h.min_total_price ?? h.price_breakdown?.all_inclusive_price)
    .filter((p): p is number => typeof p === "number" && p > 0);

  if (prices.length === 0) return null;
  return prices.reduce((sum, p) => sum + p, 0) / prices.length;
}

export async function runMinionBookingRates(): Promise<MinionResult> {
  const t0 = Date.now();
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) {
    logger.warn(`${TAG} RAPIDAPI_KEY not set — skipping`);
    return { source: "booking-rates", rowsUpserted: 0, rowsFailed: 0, errors: ["RAPIDAPI_KEY not set — skipping"], durationMs: Date.now() - t0 };
  }

  const friday = nextFriday();
  const sunday = new Date(friday);
  sunday.setDate(friday.getDate() + NIGHTS_TO_FETCH);
  const checkIn = toIsoDate(friday);
  const checkOut = toIsoDate(sunday);

  const results = await Promise.allSettled(
    COMPETITOR_MARKETS.map(market => fetchBookingRates(market, apiKey, checkIn, checkOut)),
  );

  let rowsUpserted = 0;
  const errors: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const market = COMPETITOR_MARKETS[i];
    const result = results[i];

    if (result.status === "rejected") {
      errors.push(`${market}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
      continue;
    }

    const avgRate = result.value;
    if (avgRate === null) continue; // no results for this market — skip, not an error

    const row: InsertCompetitorRate = {
      market,
      propertyCategory: "hotel",
      checkInDate: checkIn,
      avgRate,
      currency: "USD",
      source: "booking",
      fetchedAt: new Date(),
    };

    try {
      await db.insert(competitorRates)
        .values(row)
        .onConflictDoNothing();
      rowsUpserted++;
    } catch (err: unknown) {
      errors.push(`${market}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const durationMs = Date.now() - t0;
  if (errors.length > 0) {
    logger.warn(`${TAG} ${rowsUpserted} upserted, ${errors.length} errors (${durationMs}ms)`);
  } else {
    logger.info(`${TAG} ${rowsUpserted} upserted (${durationMs}ms)`);
  }

  return { source: "booking-rates", rowsUpserted, rowsFailed: errors.length, errors, durationMs };
}
