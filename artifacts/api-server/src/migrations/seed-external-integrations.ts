import { db } from "../db";
import { externalIntegrations } from "@workspace/db";
import { log } from "../logger";

const DEFAULTS = [
  { kind: "api", serviceKey: "fred", name: "Federal Reserve (FRED)", sourceType: "Direct API", credentialEnvVar: "FRED_API_KEY", host: "api.stlouisfed.org", isEnabled: true, isSubscribed: true, notes: "SOFR, Treasury rates, CPI, economic series", sortOrder: 1 },
  { kind: "api", serviceKey: "open-exchange-rates", name: "Open Exchange Rates", sourceType: "Direct API", credentialEnvVar: "OPEN_EXCHANGE_RATES_APP_ID", host: "openexchangerates.org", isEnabled: true, isSubscribed: true, notes: "Currency exchange rates (USD base)", sortOrder: 2 },
  { kind: "api", serviceKey: "walkscore", name: "Walk Score", sourceType: "Direct API", credentialEnvVar: "WALK_SCORE_API_KEY", host: "api.walkscore.com", isEnabled: true, isSubscribed: true, notes: "Walk, transit, and bike scores", sortOrder: 3 },
  { kind: "api", serviceKey: "world-bank", name: "World Bank", sourceType: "Direct API", credentialEnvVar: null, host: "api.worldbank.org", isEnabled: true, isSubscribed: true, notes: "GDP, population, country indicators (no key needed)", sortOrder: 4 },
  { kind: "api", serviceKey: "moodys", name: "Moody's Analytics", sourceType: "Direct API", credentialEnvVar: "MOODYS_API_KEY", host: "www.moodys.com", isEnabled: true, isSubscribed: false, notes: "Credit risk scores (placeholder — requires enterprise license)", sortOrder: 5 },
  { kind: "api", serviceKey: "sp-global", name: "S&P Global", sourceType: "Direct API", credentialEnvVar: "SPGLOBAL_API_KEY", host: "www.spglobal.com", isEnabled: true, isSubscribed: false, notes: "Case-Shiller, cap rate forecasts (placeholder — requires license)", sortOrder: 6 },
  { kind: "api", serviceKey: "costar", name: "CoStar Group", sourceType: "Direct API", credentialEnvVar: "COSTAR_API_KEY", host: "www.costar.com", isEnabled: true, isSubscribed: false, notes: "RevPAR, ADR, supply pipeline (placeholder — requires license)", sortOrder: 7 },
  { kind: "api", serviceKey: "vecteezy", name: "Vecteezy", sourceType: "Direct API", credentialEnvVar: "VECTEEZY_API_KEY", host: "api.vecteezy.com", isEnabled: true, isSubscribed: true, notes: "Vector graphics and images", sortOrder: 8 },
  { kind: "api", serviceKey: "weather-api", name: "WeatherAPI", sourceType: "RapidAPI", credentialEnvVar: "RAPIDAPI_KEY", host: "weatherapi-com.p.rapidapi.com", isEnabled: true, isSubscribed: true, notes: "Current + 7-day forecast, historical averages (Key 1)", sortOrder: 9 },
  { kind: "api", serviceKey: "geodb-cities", name: "GeoDB Cities", sourceType: "RapidAPI", credentialEnvVar: "RAPIDAPI_KEY", host: "wft-geo-db.p.rapidapi.com", isEnabled: true, isSubscribed: true, notes: "City resolution, coordinates, population (Key 1)", sortOrder: 10 },
  { kind: "api", serviceKey: "realty-in-us", name: "Realty in US", sourceType: "RapidAPI", credentialEnvVar: "RAPIDAPI_KEY", host: "realty-in-us.p.rapidapi.com", isEnabled: true, isSubscribed: true, notes: "US property listings and details (Key 1)", sortOrder: 11 },
  { kind: "api", serviceKey: "us-real-estate", name: "US Real Estate", sourceType: "RapidAPI", credentialEnvVar: "RAPIDAPI_KEY", host: "us-real-estate.p.rapidapi.com", isEnabled: true, isSubscribed: true, notes: "US property listings alternative (Key 1)", sortOrder: 12 },
  { kind: "api", serviceKey: "cnbc-news", name: "CNBC News", sourceType: "RapidAPI", credentialEnvVar: "RAPIDAPI_KEY_3", host: "cnbc.p.rapidapi.com", isEnabled: true, isSubscribed: true, notes: "Financial and market news headlines (Key 3)", sortOrder: 13 },
  { kind: "api", serviceKey: "bloomberg-finance", name: "Bloomberg Finance", sourceType: "RapidAPI", credentialEnvVar: "RAPIDAPI_KEY_3", host: "bloomberg-finance.p.rapidapi.com", isEnabled: false, isSubscribed: false, notes: "Market data — endpoint returns 404 on all keys", sortOrder: 14 },
  { kind: "api", serviceKey: "xotelo", name: "Xotelo Hotel Prices", sourceType: "RapidAPI", credentialEnvVar: "RAPIDAPI_KEY_2", host: "xotelo-hotel-prices.p.rapidapi.com", isEnabled: false, isSubscribed: false, notes: "Hotel ADR benchmarks — NOT SUBSCRIBED on any key", sortOrder: 15 },
  { kind: "api", serviceKey: "alpha-vantage", name: "Alpha Vantage", sourceType: "RapidAPI", credentialEnvVar: "RAPIDAPI_KEY_3", host: "alpha-vantage.p.rapidapi.com", isEnabled: true, isSubscribed: true, notes: "Stock time series data (Key 3)", sortOrder: 16 },
  { kind: "api", serviceKey: "visual-crossing", name: "Visual Crossing Weather", sourceType: "RapidAPI", credentialEnvVar: "RAPIDAPI_KEY_2", host: "visual-crossing-weather.p.rapidapi.com", isEnabled: true, isSubscribed: true, notes: "Weather forecast alternative (Key 2)", sortOrder: 17 },
  { kind: "scraper", serviceKey: "apify", name: "Apify Actors", sourceType: "Apify Platform", credentialEnvVar: "APIFY_TOKEN", host: "api.apify.com", isEnabled: true, isSubscribed: true, notes: "STR & Airbnb scraping via Apify actors", sortOrder: 1 },
  { kind: "scraper", serviceKey: "rapidapi-airbnb", name: "Airbnb (RapidAPI)", sourceType: "RapidAPI", credentialEnvVar: "RAPIDAPI_KEY_3", host: "airbnb13.p.rapidapi.com", isEnabled: true, isSubscribed: true, notes: "Airbnb listing search & pricing (Key 3)", sortOrder: 2 },
  { kind: "scraper", serviceKey: "rapidapi-booking", name: "Booking.com (RapidAPI)", sourceType: "RapidAPI", credentialEnvVar: "RAPIDAPI_KEY_2", host: "booking-com.p.rapidapi.com", isEnabled: true, isSubscribed: true, notes: "Booking.com hotel search & pricing (Key 2)", sortOrder: 3 },
  { kind: "scraper", serviceKey: "rapidapi-hotels", name: "Hotels.com (RapidAPI)", sourceType: "RapidAPI", credentialEnvVar: "RAPIDAPI_KEY_3", host: "hotels-com-provider.p.rapidapi.com", isEnabled: true, isSubscribed: true, notes: "Hotels.com search & pricing (Key 3)", sortOrder: 4 },
  { kind: "scraper", serviceKey: "rapidapi-tripadvisor", name: "TripAdvisor (RapidAPI)", sourceType: "RapidAPI", credentialEnvVar: "RAPIDAPI_KEY_3", host: "tripadvisor16.p.rapidapi.com", isEnabled: false, isSubscribed: false, notes: "NOT SUBSCRIBED — returns 404 on all keys", sortOrder: 5 },
  // ── New RapidAPI source ────────────────────────────────────────────────────
  { kind: "scraper", serviceKey: "rapidapi-skyscanner", name: "Skyscanner Hotels (RapidAPI)", sourceType: "RapidAPI", credentialEnvVar: "RAPIDAPI_KEY_3", host: "skyscanner50.p.rapidapi.com", isEnabled: true, isSubscribed: true, notes: "Hotel and flight price benchmarking for boutique property rate context (Key 3)", sortOrder: 6 },
  // ── Apify business-intelligence scrapers ──────────────────────────────────
  { kind: "scraper", serviceKey: "apify-linkedin", name: "LinkedIn Company Scraper (Apify)", sourceType: "Apify Platform", credentialEnvVar: "APIFY_API_TOKEN", host: "api.apify.com", isEnabled: true, isSubscribed: true, notes: "Boutique hotel ManCo profiles, headcount, funding context — actor: bebity/linkedin-company-scraper", sortOrder: 7 },
  { kind: "scraper", serviceKey: "apify-crunchbase", name: "Crunchbase Scraper (Apify)", sourceType: "Apify Platform", credentialEnvVar: "APIFY_API_TOKEN", host: "api.apify.com", isEnabled: true, isSubscribed: true, notes: "Hospitality startup and ManCo funding data — actor: epctex/crunchbase-scraper", sortOrder: 8 },
  { kind: "scraper", serviceKey: "apify-bloomberg", name: "Bloomberg News Scraper (Apify)", sourceType: "Apify Platform", credentialEnvVar: "APIFY_API_TOKEN", host: "api.apify.com", isEnabled: true, isSubscribed: true, notes: "Hotel industry and F&B revenue news — actor: epctex/bloomberg-scraper", sortOrder: 9 },
  { kind: "scraper", serviceKey: "apify-wsj", name: "WSJ Scraper (Apify)", sourceType: "Apify Platform", credentialEnvVar: "APIFY_API_TOKEN", host: "api.apify.com", isEnabled: true, isSubscribed: true, notes: "Hotel industry and OTA distribution cost news — actor: epctex/the-wall-street-journal-scraper", sortOrder: 10 },
  // ── Free public APIs (no auth required) ───────────────────────────────────
  { kind: "api", serviceKey: "wikipedia", name: "Wikipedia REST API", sourceType: "Free Public API", credentialEnvVar: null, host: "en.wikipedia.org", isEnabled: true, isSubscribed: true, notes: "Hospitality benchmarks, OTA commission context, industry articles — no auth required (NAI-33, NAI-34, NAI-35)", sortOrder: 18 },
  { kind: "api", serviceKey: "restcountries", name: "REST Countries", sourceType: "Free Public API", credentialEnvVar: null, host: "restcountries.com", isEnabled: true, isSubscribed: true, notes: "Country economic context (name, currency, region) for non-US ManCo overhead calibration — no auth required (NAI-34)", sortOrder: 19 },
  { kind: "api", serviceKey: "cia-factbook-wiki", name: "CIA World Factbook (via Wikipedia)", sourceType: "Free Public API", credentialEnvVar: null, host: "en.wikipedia.org", isEnabled: true, isSubscribed: true, notes: "Country economic and political risk data via Wikipedia CIA Factbook pages — no auth required", sortOrder: 20 },
] as const;

export async function seedExternalIntegrations() {
  // Use upsert semantics (onConflictDoNothing) so this is safe to re-run:
  // new entries are inserted, existing rows are left untouched.
  let inserted = 0;
  for (const row of DEFAULTS) {
    const result = await db
      .insert(externalIntegrations)
      .values({
        kind: row.kind,
        serviceKey: row.serviceKey,
        name: row.name,
        sourceType: row.sourceType,
        credentialEnvVar: row.credentialEnvVar,
        host: row.host,
        isEnabled: row.isEnabled,
        isSubscribed: row.isSubscribed,
        notes: row.notes,
        sortOrder: row.sortOrder,
      })
      .onConflictDoNothing();
    if ((result.rowCount ?? 0) > 0) inserted++;
  }

  if (inserted > 0) {
    log(`Seeded ${inserted} new external integrations (${DEFAULTS.length} total configured)`, "migration");
  } else {
    log("external_integrations already up to date, nothing inserted", "migration");
  }
}
