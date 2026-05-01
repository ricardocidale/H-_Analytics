/**
 * RapidAPI Key Router
 *
 * Routes API calls to the correct RapidAPI key based on actual account subscriptions.
 * Each key has different API subscriptions — routing is by subscription, not load.
 *
 * Verified 2026-04-05 via live probing:
 *
 *   RAPIDAPI_KEY (primary)   — GeoDB Cities, WeatherAPI, CNBC, Realty in US, US Real Estate
 *   RAPIDAPI_KEY_2 (secondary) — Booking.com, Visual Crossing, Realty in US, US Real Estate,
 *                                 GeoDB Cities, WeatherAPI, CNBC
 *   RAPIDAPI_KEY_3 (tertiary)  — Airbnb (x2), Hotels.com, Google Hotels, Google Maps Reviews,
 *                                 Zillow, Alpha Vantage, Skyscanner, Realtor Search,
 *                                 Realty in US, US Real Estate, GeoDB Cities, WeatherAPI, CNBC
 *
 *   NOT SUBSCRIBED (any key):  Xotelo, TripAdvisor (404), Bloomberg (404)
 */

export type RapidApiSlot = "primary" | "secondary" | "tertiary";

export function getRapidApiKey(slot: RapidApiSlot = "primary"): string | undefined {
  switch (slot) {
    case "primary":   return process.env.RAPIDAPI_KEY;
    case "secondary": return process.env.RAPIDAPI_KEY_2;
    case "tertiary":  return process.env.RAPIDAPI_KEY_3;
  }
}

export function rapidApiHeaders(host: string, slot: RapidApiSlot = "primary"): Record<string, string> {
  return {
    "x-rapidapi-key":  getRapidApiKey(slot) ?? "",
    "x-rapidapi-host": host,
  };
}

export function isRapidApiAvailable(slot: RapidApiSlot = "primary"): boolean {
  return !!getRapidApiKey(slot);
}
