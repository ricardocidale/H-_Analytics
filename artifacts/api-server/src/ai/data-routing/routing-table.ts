/**
 * The DATA_ROUTING_TABLE maps each assumption field to the ordered list of
 * services that can supply it. Pure data — no runtime dependencies.
 */
import type { DataRoute } from "./types";

export const DATA_ROUTING_TABLE: Record<string, DataRoute[]> = {
  // ── Revenue assumptions ──────────────────────────────────────────────────

  startAdr: [
    { service: "market-adr-index", method: "lookup", priority: 0, description: "H+ pre-collected market ADR index" },
    { service: "amadeus", method: "searchCompSet", priority: 1, description: "Live hotel pricing from 770K+ hotels" },
    { service: "costar", method: "fetchMarketData", priority: 2, description: "CoStar ADR benchmarks" },
    { service: "rapidapi-booking", method: "fetchCompSetData", priority: 3, description: "Booking.com rates" },
    { service: "apify-airbnb", method: "fetchCompSetData", priority: 4, description: "Airbnb scraped rates" },
    { service: "xotelo", method: "fetchAdrBenchmark", priority: 5, description: "Xotelo ADR aggregation" },
    { service: "hospitality-benchmarks", method: "fetchBenchmarks", priority: 6, description: "H+ benchmark database" },
  ],

  startOccupancy: [
    { service: "market-adr-index", method: "lookup", priority: 0, description: "H+ pre-collected market occupancy data" },
    { service: "costar", method: "fetchMarketData", priority: 1, description: "CoStar occupancy rates" },
    { service: "hospitality-benchmarks", method: "fetchBenchmarks", priority: 2, description: "STR occupancy benchmarks" },
    { service: "fred", method: "fetchRate", priority: 3, description: "FRED hotel occupancy index" },
  ],

  adrGrowthRate: [
    { service: "seasonal-calendars", method: "lookup", priority: 0, description: "H+ pre-collected seasonal demand multipliers" },
    { service: "fred", method: "fetchRate", priority: 1, description: "CPI hotel component for inflation baseline" },
    { service: "costar", method: "fetchMarketData", priority: 2, description: "CoStar rent growth YoY" },
    { service: "hospitality-benchmarks", method: "fetchBenchmarks", priority: 3, description: "Historical ADR growth rates" },
  ],

  revShareFB: [
    { service: "hospitality-benchmarks", method: "fetchBenchmarks", priority: 1, description: "USALI F&B department ratios" },
    { service: "grounded-research", method: "search", priority: 2, description: "Web research on F&B revenue splits" },
  ],

  revShareEvents: [
    { service: "hospitality-benchmarks", method: "fetchBenchmarks", priority: 1, description: "Event venue revenue benchmarks" },
    { service: "grounded-research", method: "search", priority: 2, description: "Web research on event revenue" },
  ],

  // ── Operating costs ──────────────────────────────────────────────────────

  costRateRooms: [
    { service: "hospitality-benchmarks", method: "fetchBenchmarks", priority: 1, description: "USALI rooms department cost ratio" },
    { service: "costar", method: "fetchMarketData", priority: 2, description: "CoStar operating cost data" },
  ],

  costRateFB: [
    { service: "fb-benchmarks", method: "lookup", priority: 0, description: "H+ pre-collected F&B cost benchmarks" },
    { service: "hospitality-benchmarks", method: "fetchBenchmarks", priority: 1, description: "USALI F&B department cost ratio" },
  ],

  costRateAdmin: [
    { service: "hospitality-benchmarks", method: "fetchBenchmarks", priority: 1, description: "A&G expense benchmarks" },
    { service: "grounded-research", method: "search", priority: 2, description: "Web research on hotel admin costs" },
  ],

  costRateMarketing: [
    { service: "hospitality-benchmarks", method: "fetchBenchmarks", priority: 1, description: "Marketing expense benchmarks" },
  ],

  costRateUtilities: [
    { service: "hospitality-benchmarks", method: "fetchBenchmarks", priority: 1, description: "Utility cost benchmarks" },
    { service: "weather", method: "fetchWeatherData", priority: 2, description: "Climate data affecting utility costs" },
  ],

  // ── Capital structure ────────────────────────────────────────────────────

  acquisitionInterestRate: [
    { service: "fred", method: "fetchRate", priority: 1, description: "Current mortgage rates (30yr, SOFR)" },
    { service: "alpha-vantage", method: "fetchMarketData", priority: 2, description: "Treasury yields for spread calculation" },
  ],

  exitCapRate: [
    { service: "costar", method: "fetchMarketData", priority: 1, description: "CoStar cap rate survey" },
    { service: "hospitality-benchmarks", method: "fetchBenchmarks", priority: 2, description: "CBRE cap rate benchmarks" },
    { service: "fred", method: "fetchRate", priority: 3, description: "Treasury spread for cap rate estimation" },
  ],

  taxRate: [
    { service: "country-defaults", method: "lookup", priority: 1, description: "Country/state tax rates from H+ database" },
    { service: "world-bank", method: "fetchCountryData", priority: 2, description: "World Bank tax data" },
  ],

  depreciationYears: [
    { service: "country-defaults", method: "lookup", priority: 1, description: "IRS/local depreciation schedules" },
    { service: "regulatory-data", method: "lookup", priority: 2, description: "Country regulatory profiles" },
  ],

  // ── Management fees ──────────────────────────────────────────────────────

  baseFeePercent: [
    { service: "hospitality-benchmarks", method: "fetchBenchmarks", priority: 1, description: "HVS management fee surveys" },
    { service: "grounded-research", method: "search", priority: 2, description: "Web research on hotel management fees" },
  ],

  incentiveFeePercent: [
    { service: "hospitality-benchmarks", method: "fetchBenchmarks", priority: 1, description: "HVS incentive fee benchmarks" },
  ],

  // ── Location-dependent ───────────────────────────────────────────────────

  propertyTaxRate: [
    { service: "country-defaults", method: "lookup", priority: 1, description: "Country/state property tax rates" },
    { service: "rapidapi-zillow", method: "fetchPropertyData", priority: 2, description: "Zillow property tax data (US)" },
    { service: "world-bank", method: "fetchCountryData", priority: 3, description: "World Bank property tax data" },
  ],

  // ── Staffing ─────────────────────────────────────────────────────────────

  staffCompensation: [
    { service: "labor-rates", method: "lookup", priority: 0, description: "H+ pre-collected hospitality labor rates" },
    { service: "fred", method: "fetchRate", priority: 1, description: "BLS hospitality wage data" },
    { service: "grounded-research", method: "search", priority: 2, description: "Web research on hospitality salaries" },
  ],

  // ── Location quality ─────────────────────────────────────────────────────

  walkScore: [
    { service: "walk-score", method: "fetchScore", priority: 1, description: "Walk Score transit/walkability" },
  ],

  distanceToAirport: [
    { service: "airport-distances", method: "lookup", priority: 0, description: "H+ pre-computed airport distances" },
    { service: "grounded-research", method: "search", priority: 1, description: "Web research on airport proximity" },
  ],

  // ── Market context ───────────────────────────────────────────────────────

  hotelTaxRate: [
    { service: "grounded-research", method: "search", priority: 1, description: "Local hotel/tourism tax rates" },
    { service: "regulatory-data", method: "lookup", priority: 2, description: "Country regulatory profiles" },
  ],

  avgTicketFB: [
    { service: "fb-benchmarks", method: "lookup", priority: 0, description: "H+ pre-collected F&B ticket benchmarks" },
    { service: "grounded-research", method: "search", priority: 1, description: "Average F&B spend per guest in market" },
    { service: "apify-tripadvisor", method: "fetchCompSetData", priority: 2, description: "TripAdvisor restaurant pricing" },
  ],

  // ── Luxury rental specific (per_property pricing) ────────────────────────

  nightlyPropertyRate: [
    { service: "apify-airbnb", method: "fetchCompSetData", priority: 1, description: "Airbnb whole-property rental rates" },
    { service: "apify-vrbo", method: "fetchCompSetData", priority: 2, description: "VRBO luxury rental rates" },
    { service: "amadeus", method: "searchCompSet", priority: 3, description: "Amadeus hotel pricing as reference" },
  ],

  // ── Property valuation (US-specific) ─────────────────────────────────────

  propertyValue: [
    { service: "realty", method: "searchProperties", priority: 1, description: "Realty.com property listings" },
    { service: "us-real-estate", method: "fetchPropertyData", priority: 2, description: "US Real Estate valuation data" },
    { service: "grounded-research", method: "search", priority: 3, description: "Web research on property values" },
  ],
};
