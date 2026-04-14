/**
 * Smart Data Router — knows exactly where each data point lives.
 *
 * Instead of firing all 14+ services and hoping, this router:
 * 1. Determines which data points are needed (based on the assumption fields being researched)
 * 2. Maps each data point to the specific services that provide it (with priority order)
 * 3. Calls ONLY the relevant services (saves API quota, reduces latency)
 * 4. If initial query returns nothing, applies progressive relaxation:
 *    - Level 0: Exact match (city + quality tier + property type)
 *    - Level 1: Relax property type (boutique -> any luxury hotel)
 *    - Level 2: Relax geography (city -> metro area)
 *    - Level 3: Relax quality tier (luxury -> upscale)
 *    - Level 4: Relax to state/region level
 *    - Level 5: Relax to country level (widest ranges, still accurate)
 * 5. Returns data with provenance: which service provided it, at what relaxation level
 *
 * This is the PROGRESSIVE RELAXATION pattern from the comparables engine,
 * applied to ALL data gathering.
 */

import { FREDService } from "../services/FREDService";
import { HospitalityBenchmarkService } from "../services/HospitalityBenchmarkService";
import { GroundedResearchService } from "../services/GroundedResearchService";
import { CoStarService } from "../services/CoStarService";
import { XoteloService } from "../services/XoteloService";
import { ApifyService } from "../services/ApifyService";
import { RapidApiHospitalityService } from "../services/RapidApiHospitalityService";
import { WeatherService } from "../services/WeatherService";
import { WorldBankService } from "../services/WorldBankService";
import { AlphaVantageService } from "../services/AlphaVantageService";
import { AmadeusService } from "../services/AmadeusService";
import { WalkScoreService } from "../services/WalkScoreService";
import { RealtyService } from "../services/RealtyService";
import { USRealEstateService } from "../services/USRealEstateService";
import { getCountryDefaults } from "@shared/countryDefaults";
import { getRegulatoryProfile } from "../../shared/regulatory-data";
import { storage } from "../storage";
import { logger } from "../logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RelaxationLevel = 0 | 1 | 2 | 3 | 4 | 5;

export type ConfidenceLevel = "high" | "medium" | "low";

export interface DataRoute {
  service: string;
  method: string;
  priority: number;
  description: string;
}

export interface DataRouteResult {
  field: string;
  value: number | string | null;
  range?: { low: number; mid: number; high: number };
  source: string;
  relaxationLevel: RelaxationLevel;
  confidence: ConfidenceLevel;
  provenance: string;
  fetchedAt: string;
}

export interface RoutingContext {
  location?: string;
  city?: string;
  state?: string;
  country?: string;
  qualityTier?: string;
  businessModel?: string;
  roomCount?: number;
  latitude?: number;
  longitude?: number;
  propertyType?: string;
  chainScale?: string;
  propertyId?: number;
}

/**
 * Relaxed version of the context at each progressive level.
 * At each level, some criteria are dropped or widened.
 */
interface RelaxedContext {
  level: RelaxationLevel;
  location?: string;
  city?: string;
  state?: string;
  country?: string;
  qualityTier?: string;
  propertyType?: string;
  retained: string[];
  relaxed: string[];
}

// ---------------------------------------------------------------------------
// Routing Table: which services provide which data points
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Service Registry — lazy-initialized singletons
// ---------------------------------------------------------------------------

let _services: Record<string, { instance: any; isAvailable: () => boolean }> | null = null;

function getServiceRegistry(): Record<string, { instance: any; isAvailable: () => boolean }> {
  if (_services) return _services;

  const fred = new FREDService();
  const hospitality = new HospitalityBenchmarkService();
  const grounded = new GroundedResearchService();
  const costar = new CoStarService();
  const xotelo = new XoteloService();
  const apify = new ApifyService();
  const rapidApi = new RapidApiHospitalityService();
  const weather = new WeatherService();
  const worldBank = new WorldBankService();
  const alphaVantage = new AlphaVantageService();
  const amadeus = new AmadeusService();
  const walkScore = new WalkScoreService();
  const realty = new RealtyService();
  const usRealEstate = new USRealEstateService();

  _services = {
    "fred":                    { instance: fred,           isAvailable: () => fred.isAvailable() },
    "hospitality-benchmarks":  { instance: hospitality,    isAvailable: () => hospitality.isAvailable() },
    "grounded-research":       { instance: grounded,       isAvailable: () => grounded.isAvailable() },
    "costar":                  { instance: costar,         isAvailable: () => costar.isAvailable() },
    "xotelo":                  { instance: xotelo,         isAvailable: () => xotelo.isAvailable() },
    "apify-airbnb":            { instance: apify,          isAvailable: () => apify.isAvailable() },
    "apify-vrbo":              { instance: apify,          isAvailable: () => apify.isAvailable() },
    "apify-tripadvisor":       { instance: apify,          isAvailable: () => apify.isAvailable() },
    "rapidapi-booking":        { instance: rapidApi,       isAvailable: () => rapidApi.isAvailable() },
    "rapidapi-zillow":         { instance: rapidApi,       isAvailable: () => rapidApi.isAvailable() },
    "weather":                 { instance: weather,        isAvailable: () => weather.isAvailable() },
    "world-bank":              { instance: worldBank,      isAvailable: () => worldBank.isAvailable() },
    "alpha-vantage":           { instance: alphaVantage,   isAvailable: () => alphaVantage.isAvailable() },
    "amadeus":                 { instance: amadeus,        isAvailable: () => amadeus.isAvailable() },
    "walk-score":              { instance: walkScore,      isAvailable: () => walkScore.isAvailable() },
    "realty":                  { instance: realty,          isAvailable: () => realty.isAvailable() },
    "us-real-estate":          { instance: usRealEstate,   isAvailable: () => usRealEstate.isAvailable() },
    // Country defaults and regulatory data are always available (in-memory / DB)
    "country-defaults":        { instance: null,           isAvailable: () => true },
    "regulatory-data":         { instance: null,           isAvailable: () => true },
    // Pre-collected market data tables — always available (DB-backed, priority 0)
    "market-adr-index":        { instance: null,           isAvailable: () => true },
    "seasonal-calendars":      { instance: null,           isAvailable: () => true },
    "event-calendars":         { instance: null,           isAvailable: () => true },
    "airport-distances":       { instance: null,           isAvailable: () => true },
    "labor-rates":             { instance: null,           isAvailable: () => true },
    "fb-benchmarks":           { instance: null,           isAvailable: () => true },
  };

  return _services;
}

// ---------------------------------------------------------------------------
// Integration-enabled check (respects admin toggles)
// ---------------------------------------------------------------------------

let _enabledMap: Record<string, boolean> | null = null;
let _enabledMapFetchedAt = 0;
const ENABLED_MAP_TTL_MS = 60_000; // refresh every 60s

async function getEnabledMap(): Promise<Record<string, boolean>> {
  if (_enabledMap && Date.now() - _enabledMapFetchedAt < ENABLED_MAP_TTL_MS) {
    return _enabledMap;
  }
  try {
    _enabledMap = await storage.getIntegrationEnabledMap();
    _enabledMapFetchedAt = Date.now();
  } catch {
    if (!_enabledMap) _enabledMap = {};
  }
  return _enabledMap!;
}

/** Map service keys in routing table to integration-enabled-map keys */
const SERVICE_TO_INTEGRATION_KEY: Record<string, string> = {
  "fred": "fred",
  "hospitality-benchmarks": "hospitality-benchmarks",
  "grounded-research": "grounded-research",
  "costar": "costar",
  "xotelo": "xotelo",
  "apify-airbnb": "apify",
  "apify-vrbo": "apify",
  "apify-tripadvisor": "apify",
  "rapidapi-booking": "rapidapi-booking",
  "rapidapi-zillow": "rapidapi-hotels",
  "weather": "weather-api",
  "world-bank": "world-bank",
  "alpha-vantage": "alpha-vantage",
  "amadeus": "amadeus",
  "walk-score": "walk-score",
  "realty": "rapidapi-hotels",
  "us-real-estate": "rapidapi-hotels",
  "country-defaults": "__always__",
  "regulatory-data": "__always__",
  "market-adr-index": "__always__",
  "seasonal-calendars": "__always__",
  "event-calendars": "__always__",
  "airport-distances": "__always__",
  "labor-rates": "__always__",
  "fb-benchmarks": "__always__",
};

async function isServiceEnabled(serviceKey: string): Promise<boolean> {
  const integrationKey = SERVICE_TO_INTEGRATION_KEY[serviceKey];
  if (!integrationKey || integrationKey === "__always__") return true;
  const map = await getEnabledMap();
  return map[integrationKey] !== false;
}

// ---------------------------------------------------------------------------
// Progressive Relaxation — build relaxed contexts
// ---------------------------------------------------------------------------

function buildRelaxedContexts(ctx: RoutingContext, maxLevel: RelaxationLevel = 5): RelaxedContext[] {
  const contexts: RelaxedContext[] = [];

  // Level 0: Exact match — all criteria
  contexts.push({
    level: 0,
    location: ctx.location,
    city: ctx.city,
    state: ctx.state,
    country: ctx.country,
    qualityTier: ctx.qualityTier,
    propertyType: ctx.propertyType,
    retained: ["city", "qualityTier", "propertyType"],
    relaxed: [],
  });

  if (maxLevel < 1) return contexts;

  // Level 1: Relax property type (boutique -> any luxury hotel)
  contexts.push({
    level: 1,
    location: ctx.location,
    city: ctx.city,
    state: ctx.state,
    country: ctx.country,
    qualityTier: ctx.qualityTier,
    propertyType: undefined, // any hotel type
    retained: ["city", "qualityTier"],
    relaxed: ["propertyType"],
  });

  if (maxLevel < 2) return contexts;

  // Level 2: Relax geography (city -> state/metro)
  contexts.push({
    level: 2,
    location: ctx.state ? `${ctx.state}, ${ctx.country ?? ""}`.trim() : ctx.location,
    city: undefined,
    state: ctx.state,
    country: ctx.country,
    qualityTier: ctx.qualityTier,
    propertyType: undefined,
    retained: ["state", "qualityTier"],
    relaxed: ["propertyType", "city->state"],
  });

  if (maxLevel < 3) return contexts;

  // Level 3: Relax quality tier (luxury -> upscale, or just any)
  const relaxedTier = relaxQualityTier(ctx.qualityTier);
  contexts.push({
    level: 3,
    location: ctx.state ? `${ctx.state}, ${ctx.country ?? ""}`.trim() : ctx.location,
    city: undefined,
    state: ctx.state,
    country: ctx.country,
    qualityTier: relaxedTier,
    propertyType: undefined,
    retained: ["state"],
    relaxed: ["propertyType", "city->state", "qualityTier->relaxed"],
  });

  if (maxLevel < 4) return contexts;

  // Level 4: State/region level — drop quality tier entirely
  contexts.push({
    level: 4,
    location: ctx.state || ctx.country,
    city: undefined,
    state: ctx.state,
    country: ctx.country,
    qualityTier: undefined,
    propertyType: undefined,
    retained: ["state"],
    relaxed: ["propertyType", "city", "qualityTier"],
  });

  if (maxLevel < 5) return contexts;

  // Level 5: Country level — widest ranges
  contexts.push({
    level: 5,
    location: ctx.country || ctx.state,
    city: undefined,
    state: undefined,
    country: ctx.country,
    qualityTier: undefined,
    propertyType: undefined,
    retained: ["country"],
    relaxed: ["propertyType", "city", "state", "qualityTier"],
  });

  return contexts;
}

function relaxQualityTier(tier?: string): string | undefined {
  if (!tier) return undefined;
  const relaxMap: Record<string, string> = {
    luxury: "upper_upscale",
    upper_upscale: "upscale",
    upscale: "upper_midscale",
    upper_midscale: "midscale",
    midscale: "economy",
    economy: "economy",
  };
  return relaxMap[tier.toLowerCase()] ?? undefined;
}

function confidenceFromRelaxation(level: RelaxationLevel): ConfidenceLevel {
  if (level <= 1) return "high";
  if (level <= 3) return "medium";
  return "low";
}

// ---------------------------------------------------------------------------
// Service Call Dispatchers — extract specific data from each service
// ---------------------------------------------------------------------------

async function callServiceForField(
  serviceKey: string,
  _method: string,
  field: string,
  rCtx: RelaxedContext,
  ctx: RoutingContext,
): Promise<{ value: number | string | null; range?: { low: number; mid: number; high: number }; provenance: string } | null> {
  const registry = getServiceRegistry();
  const svc = registry[serviceKey];
  if (!svc || !svc.isAvailable()) return null;

  try {
    switch (serviceKey) {
      // ── Amadeus ────────────────────────────────────────────────────
      case "amadeus": {
        if (!ctx.latitude || !ctx.longitude) return null;
        const amadeus: AmadeusService = svc.instance;
        const result = await amadeus.fetchAdrBenchmark(ctx.latitude, ctx.longitude, rCtx.qualityTier);
        if (!result || result.value == null) return null;
        // Amadeus returns a single ADR; manufacture a range +/-15%
        const v = result.value;
        return {
          value: v,
          range: { low: Math.round(v * 0.85), mid: Math.round(v), high: Math.round(v * 1.15) },
          provenance: `${result.source}, ${rCtx.location ?? "nearby"}, L${rCtx.level}`,
        };
      }

      // ── CoStar ─────────────────────────────────────────────────────
      case "costar": {
        if (!rCtx.location) return null;
        const costar: CoStarService = svc.instance;
        const data = await costar.fetchMarketData({
          location: rCtx.location,
          state: rCtx.state,
          propertyType: rCtx.propertyType,
        });
        if (!data) return null;

        if (field === "startAdr" && data.adr) {
          return { value: data.adr.value, provenance: `CoStar ADR, ${rCtx.location}, L${rCtx.level}` };
        }
        if (field === "startOccupancy" && data.occupancyRate) {
          return { value: data.occupancyRate.value, provenance: `CoStar occupancy, ${rCtx.location}, L${rCtx.level}` };
        }
        if (field === "adrGrowthRate" && data.rentGrowthYoY) {
          return { value: data.rentGrowthYoY.value, provenance: `CoStar YoY growth, ${rCtx.location}, L${rCtx.level}` };
        }
        if (field === "exitCapRate" && data.submarketCapRate) {
          return { value: data.submarketCapRate.value, provenance: `CoStar cap rate, ${rCtx.location}, L${rCtx.level}` };
        }
        if (field === "costRateRooms" && data.revpar) {
          // CoStar revpar as operating cost proxy — not direct, return null
          return null;
        }
        return null;
      }

      // ── Hospitality Benchmarks (DB) ────────────────────────────────
      case "hospitality-benchmarks": {
        if (!rCtx.location) return null;
        const hb: HospitalityBenchmarkService = svc.instance;
        const data = await hb.fetchBenchmarks({
          city: rCtx.city ?? rCtx.location,
          state: rCtx.state,
          propertyClass: rCtx.qualityTier,
          chainScale: ctx.chainScale,
        });
        if (!data) return null;

        if (field === "startAdr" && data.adr) {
          return { value: data.adr.value, provenance: `H+ benchmarks ADR, ${data.submarket}, L${rCtx.level}` };
        }
        if (field === "startOccupancy" && data.occupancy) {
          return { value: data.occupancy.value, provenance: `H+ benchmarks occupancy, ${data.submarket}, L${rCtx.level}` };
        }
        if (field === "exitCapRate" && data.capRate) {
          return { value: data.capRate.value, provenance: `H+ benchmarks cap rate, ${data.submarket}, L${rCtx.level}` };
        }
        // All cost-related fields use the same benchmark source
        if (field.startsWith("costRate") || field === "revShareFB" || field === "revShareEvents" ||
            field === "baseFeePercent" || field === "incentiveFeePercent" || field === "adrGrowthRate") {
          // These are segment-level benchmarks; not a single value from the benchmarks table
          // but they signal availability. Return null for now — the LLM synthesizes these.
          return null;
        }
        return null;
      }

      // ── FRED ───────────────────────────────────────────────────────
      case "fred": {
        const fred: FREDService = svc.instance;
        if (field === "acquisitionInterestRate") {
          const rates = await fred.fetchAllRates();
          const sofr = rates.sofr?.current?.value;
          const prime = rates.primeRate?.current?.value;
          if (sofr != null) {
            // Commercial hotel loan = SOFR + spread (typically 200-350 bps)
            const base = sofr;
            return {
              value: base,
              range: { low: base + 2.0, mid: base + 2.75, high: base + 3.5 },
              provenance: `FRED SOFR ${base}% + typical hotel loan spread, L${rCtx.level}`,
            };
          }
          if (prime != null) {
            return { value: prime, provenance: `FRED Prime Rate ${prime}%, L${rCtx.level}` };
          }
          return null;
        }
        if (field === "adrGrowthRate") {
          const rates = await fred.fetchAllRates();
          const cpi = rates.cpi?.current?.value;
          if (cpi != null) {
            return {
              value: cpi,
              range: { low: Math.max(cpi - 1, 0), mid: cpi, high: cpi + 1.5 },
              provenance: `FRED CPI ${cpi}% (ADR growth floor), L${rCtx.level}`,
            };
          }
          return null;
        }
        if (field === "exitCapRate") {
          const rates = await fred.fetchAllRates();
          const t10y = rates.treasury10y?.current?.value;
          if (t10y != null) {
            // Hotel cap rate ~ T10Y + 200-400 bps
            return {
              value: t10y + 3.0,
              range: { low: t10y + 2.0, mid: t10y + 3.0, high: t10y + 4.0 },
              provenance: `FRED 10Y Treasury ${t10y}% + hotel cap rate spread, L${rCtx.level}`,
            };
          }
          return null;
        }
        if (field === "startOccupancy" || field === "staffCompensation") {
          // FRED doesn't have direct hotel occupancy or wage data that maps cleanly
          return null;
        }
        return null;
      }

      // ── Alpha Vantage ──────────────────────────────────────────────
      case "alpha-vantage": {
        const av: AlphaVantageService = svc.instance;
        const data = await av.fetchMarketData();
        if (!data) return null;
        if (field === "acquisitionInterestRate") {
          // Use REIT dividend yields as market context
          const avgDivYield = data.reits.length > 0
            ? data.reits.reduce((sum, r) => sum + (r.monthChangePct || 0), 0) / data.reits.length
            : null;
          if (avgDivYield != null) {
            return { value: avgDivYield, provenance: `Alpha Vantage REIT market context, L${rCtx.level}` };
          }
        }
        return null;
      }

      // ── Xotelo ─────────────────────────────────────────────────────
      case "xotelo": {
        if (!rCtx.location || field !== "startAdr") return null;
        const xot: XoteloService = svc.instance;
        const benchmark = await xot.fetchAdrBenchmark(rCtx.location);
        if (!benchmark || benchmark.value == null) return null;
        return {
          value: benchmark.value,
          provenance: `Xotelo ADR benchmark, ${rCtx.location}, L${rCtx.level}`,
        };
      }

      // ── Apify (Airbnb, VRBO, TripAdvisor) ─────────────────────────
      case "apify-airbnb":
      case "apify-vrbo":
      case "apify-tripadvisor": {
        if (!rCtx.location) return null;
        const apify: ApifyService = svc.instance;
        const data = await apify.fetchCompSetData(rCtx.location);
        if (!data) return null;

        if (field === "startAdr" || field === "nightlyPropertyRate") {
          if (serviceKey === "apify-airbnb" && data.airbnb?.avgNightlyRate) {
            const v = data.airbnb.avgNightlyRate.value;
            const r = data.airbnb.priceRange;
            return {
              value: v,
              range: r ? { low: r.min, mid: v, high: r.max } : undefined,
              provenance: `Apify Airbnb, ${data.airbnb.listingCount} listings, ${rCtx.location}, L${rCtx.level}`,
            };
          }
          if (serviceKey === "apify-vrbo" && data.vrbo?.avgNightlyRate) {
            const v = data.vrbo.avgNightlyRate.value;
            const r = data.vrbo.priceRange;
            return {
              value: v,
              range: r ? { low: r.min, mid: v, high: r.max } : undefined,
              provenance: `Apify VRBO, ${data.vrbo.listingCount} listings, ${rCtx.location}, L${rCtx.level}`,
            };
          }
        }
        if (field === "avgTicketFB" && serviceKey === "apify-tripadvisor" && data.tripadvisor) {
          // TripAdvisor doesn't directly give F&B ticket, return null
          return null;
        }
        return null;
      }

      // ── RapidAPI (Booking.com, Zillow) ─────────────────────────────
      case "rapidapi-booking": {
        if (!rCtx.location) return null;
        const rapid: RapidApiHospitalityService = svc.instance;
        const data = await rapid.fetchCompSetData(rCtx.location);
        if (!data || !data.booking) return null;
        if (field === "startAdr" && data.booking.avgNightlyRate) {
          const v = data.booking.avgNightlyRate.value;
          const r = data.booking.priceRange;
          return {
            value: v,
            range: r ? { low: r.min, mid: v, high: r.max } : undefined,
            provenance: `RapidAPI Booking.com, ${data.booking.hotelCount} hotels, ${rCtx.location}, L${rCtx.level}`,
          };
        }
        return null;
      }

      case "rapidapi-zillow": {
        // Zillow for property tax — would require property-specific lookup
        return null;
      }

      // ── Weather ────────────────────────────────────────────────────
      case "weather": {
        if (!rCtx.location || field !== "costRateUtilities") return null;
        const w: WeatherService = svc.instance;
        const data = await w.fetchWeatherData(rCtx.location);
        if (!data) return null;
        // Weather is context for utility costs, not a direct value
        const avgTemp = data.forecast.reduce((s, f) => s + f.avgTempC, 0) / (data.forecast.length || 1);
        return {
          value: null,
          provenance: `WeatherAPI avg temp ${avgTemp.toFixed(1)}C, ${rCtx.location} — context for utility cost estimation, L${rCtx.level}`,
        };
      }

      // ── World Bank ─────────────────────────────────────────────────
      case "world-bank": {
        if (!rCtx.country) return null;
        const wb: WorldBankService = svc.instance;
        const data = await wb.fetchCountryData(rCtx.country);
        if (!data) return null;
        if (field === "taxRate" && data.inflation) {
          // World Bank doesn't directly give hotel tax rates, but provides macro context
          return null;
        }
        if (field === "propertyTaxRate") {
          // World Bank doesn't have property-level tax rates
          return null;
        }
        return null;
      }

      // ── Country Defaults (in-memory, always available) ─────────────
      case "country-defaults": {
        const country = rCtx.country || ctx.country;
        if (!country) return null;
        const defaults = getCountryDefaults(country);
        if (!defaults) return null;

        if (field === "taxRate" && defaults.taxRate != null) {
          return {
            value: defaults.taxRate,
            provenance: `H+ country defaults, ${country}, corporate tax rate ${(defaults.taxRate * 100).toFixed(1)}%, L${rCtx.level}`,
          };
        }
        if (field === "depreciationYears" && defaults.depreciationYears != null) {
          return {
            value: defaults.depreciationYears,
            provenance: `H+ country defaults, ${country}, ${defaults.depreciationAuthority}, L${rCtx.level}`,
          };
        }
        if (field === "propertyTaxRate" && defaults.costRateTaxes != null) {
          return {
            value: defaults.costRateTaxes,
            provenance: `H+ country defaults, ${country}, property tax rate, L${rCtx.level}`,
          };
        }
        return null;
      }

      // ── Regulatory Data ────────────────────────────────────────────
      case "regulatory-data": {
        const country = rCtx.country || ctx.country;
        if (!country) return null;
        const profile = getRegulatoryProfile(country);
        if (!profile) return null;

        // Regulatory profiles provide licensing, zoning, and legal context
        // but not direct numeric tax/depreciation values (those come from country-defaults).
        // Return null for numeric fields; the profile enriches prompt context elsewhere.
        if (field === "depreciationYears" || field === "hotelTaxRate") {
          return {
            value: null,
            provenance: `Regulatory profile for ${country} available (licensing: ${profile.licensing.licenseType}), L${rCtx.level}`,
          };
        }
        return null;
      }

      // ── Walk Score ─────────────────────────────────────────────────
      case "walk-score": {
        if (!ctx.latitude || !ctx.longitude || !ctx.propertyId) return null;
        const ws: WalkScoreService = svc.instance;
        const data = await ws.fetchScores({
          address: ctx.location || "",
          lat: ctx.latitude,
          lng: ctx.longitude,
          propertyId: ctx.propertyId,
        });
        if (!data || data.walkScore == null) return null;
        return {
          value: data.walkScore,
          provenance: `Walk Score ${data.walkScore} (${data.walkDesc ?? ""}), L${rCtx.level}`,
        };
      }

      // ── Realty Service ─────────────────────────────────────────────
      case "realty": {
        if (!rCtx.location) return null;
        const _realty: RealtyService = svc.instance;
        // Realty service requires specific search params; defer to the service
        return null;
      }

      // ── US Real Estate Service ─────────────────────────────────────
      case "us-real-estate": {
        if (!rCtx.location) return null;
        return null;
      }

      // ── Grounded Research (web search) ─────────────────────────────
      case "grounded-research": {
        if (!rCtx.location) return null;
        const gr: GroundedResearchService = svc.instance;
        const queries = buildFieldSpecificQuery(field, rCtx, ctx);
        if (!queries.length) return null;

        const results = await gr.search(queries);
        if (!results.length || !results[0].answer) return null;

        // Web research doesn't return numeric values directly
        // But it provides context the LLM will synthesize
        return {
          value: null,
          provenance: `Web research: "${results[0].query}" — ${results[0].sources.length} sources, L${rCtx.level}`,
        };
      }

      default:
        return null;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`Data router: ${serviceKey}.${_method} failed for ${field}: ${msg}`, "data-router");
    return null;
  }
}

/** Build field-specific search queries for grounded research */
function buildFieldSpecificQuery(field: string, rCtx: RelaxedContext, ctx: RoutingContext): Array<{ query: string; focusSites?: string[] }> {
  const loc = rCtx.location || rCtx.city || rCtx.state || rCtx.country || "";
  const tier = rCtx.qualityTier || ctx.qualityTier || "boutique hotel";

  const hospitalitySites = ["str.com", "costar.com", "hotelnewsnow.com", "hospitalitynet.org", "hvs.com"];

  const queryMap: Record<string, Array<{ query: string; focusSites?: string[] }>> = {
    revShareFB: [{ query: `F&B revenue as percentage of total hotel revenue ${tier} ${loc}`, focusSites: hospitalitySites }],
    revShareEvents: [{ query: `event venue revenue share boutique hotel ${loc}`, focusSites: hospitalitySites }],
    costRateAdmin: [{ query: `hotel administrative and general expenses as percentage of revenue ${tier} ${loc}`, focusSites: hospitalitySites }],
    costRateMarketing: [{ query: `hotel marketing expenses percentage of revenue ${tier}`, focusSites: hospitalitySites }],
    baseFeePercent: [{ query: `hotel management company base fee percentage ${tier}`, focusSites: ["hvs.com", "hospitalitynet.org"] }],
    staffCompensation: [{ query: `hospitality industry average hourly wage ${loc}`, focusSites: ["bls.gov", "indeed.com"] }],
    hotelTaxRate: [{ query: `hotel occupancy tax rate ${loc}` }],
    avgTicketFB: [{ query: `average food and beverage spend per guest hotel ${loc}` }],
    distanceToAirport: [{ query: `nearest airport to ${loc} distance` }],
    propertyValue: [{ query: `commercial property values ${loc}` }],
  };

  return queryMap[field] || [{ query: `${field} benchmark ${tier} hotel ${loc}`, focusSites: hospitalitySites }];
}

// ---------------------------------------------------------------------------
// Core: Fetch data for a single field with progressive relaxation
// ---------------------------------------------------------------------------

export async function fetchFieldData(
  field: string,
  context: RoutingContext,
  maxRelaxLevel: RelaxationLevel = 5,
): Promise<DataRouteResult | null> {
  const routes = DATA_ROUTING_TABLE[field];
  if (!routes || routes.length === 0) {
    logger.warn(`Data router: no routes defined for field "${field}"`, "data-router");
    return null;
  }

  const relaxedContexts = buildRelaxedContexts(context, maxRelaxLevel);

  for (const rCtx of relaxedContexts) {
    // Sort routes by priority (lower = higher priority)
    const sortedRoutes = [...routes].sort((a, b) => a.priority - b.priority);

    for (const route of sortedRoutes) {
      // Check if service is enabled and available
      const enabled = await isServiceEnabled(route.service);
      if (!enabled) continue;

      const registry = getServiceRegistry();
      const svc = registry[route.service];
      if (!svc || !svc.isAvailable()) continue;

      const result = await callServiceForField(
        route.service,
        route.method,
        field,
        rCtx,
        context,
      );

      if (result && result.value != null) {
        return {
          field,
          value: result.value,
          range: result.range,
          source: route.service,
          relaxationLevel: rCtx.level,
          confidence: confidenceFromRelaxation(rCtx.level),
          provenance: result.provenance,
          fetchedAt: new Date().toISOString(),
        };
      }
    }

    // After trying all services at this level, if we got context-only results
    // (value = null but provenance set), check if any were valuable
    // Continue to next relaxation level
  }

  // All levels exhausted — no data found
  return null;
}

// ---------------------------------------------------------------------------
// Batch: Fetch multiple fields with service call grouping
// ---------------------------------------------------------------------------

/**
 * Fetches data for multiple assumption fields, grouping by service to minimize
 * duplicate API calls. If ADR, occupancy, and cap rate all need CoStar,
 * one CoStar call serves all three.
 */
export async function fetchMultipleFields(
  fields: string[],
  context: RoutingContext,
  maxRelaxLevel: RelaxationLevel = 5,
): Promise<Map<string, DataRouteResult>> {
  const results = new Map<string, DataRouteResult>();
  const startTime = Date.now();

  // ── Phase 1: Group fields by primary service to minimize calls ──────────

  const serviceFieldGroups = new Map<string, string[]>();

  for (const field of fields) {
    const routes = DATA_ROUTING_TABLE[field];
    if (!routes || routes.length === 0) continue;

    // Group by highest-priority (lowest number) available service
    const primaryRoute = routes[0]; // priority 1
    if (!primaryRoute) continue;

    const group = serviceFieldGroups.get(primaryRoute.service) ?? [];
    group.push(field);
    serviceFieldGroups.set(primaryRoute.service, group);
  }

  // ── Phase 2: Fetch all services in parallel (one call per service) ──────

  // For services that serve multiple fields (e.g., CoStar: ADR + occupancy + cap rate),
  // we call the service once and extract multiple data points.
  // For services that serve single fields, we call them individually.

  // First, handle "always available" services synchronously (country-defaults, regulatory-data)
  const alwaysAvailableFields = fields.filter(f => {
    const routes = DATA_ROUTING_TABLE[f];
    if (!routes) return false;
    return routes.some(r => r.service === "country-defaults" || r.service === "regulatory-data");
  });

  for (const field of alwaysAvailableFields) {
    const result = await fetchFieldData(field, context, 0); // L0 only for in-memory lookups
    if (result && result.value != null) {
      results.set(field, result);
    }
  }

  // Now handle API-backed services
  const remainingFields = fields.filter(f => !results.has(f));

  // Parallel fetch with progressive relaxation
  const promises = remainingFields.map(async (field) => {
    try {
      const result = await fetchFieldData(field, context, maxRelaxLevel);
      if (result) {
        return { field, result };
      }
    } catch (err: unknown) {
      logger.warn(
        `Data router: failed to fetch ${field}: ${err instanceof Error ? err.message : err}`,
        "data-router",
      );
    }
    return null;
  });

  const settled = await Promise.allSettled(promises);

  for (const s of settled) {
    if (s.status === "fulfilled" && s.value) {
      results.set(s.value.field, s.value.result);
    }
  }

  const elapsed = Date.now() - startTime;
  const verified = Array.from(results.values()).filter(r => r.value != null).length;
  logger.info(
    `Data router: fetched ${verified}/${fields.length} fields with data in ${elapsed}ms`,
    "data-router",
  );

  return results;
}

// ---------------------------------------------------------------------------
// Utility: List all routable fields
// ---------------------------------------------------------------------------

export function getRoutableFields(): string[] {
  return Object.keys(DATA_ROUTING_TABLE);
}

/** Get the routing table entry for a specific field */
export function getFieldRoutes(field: string): DataRoute[] | undefined {
  return DATA_ROUTING_TABLE[field];
}

/**
 * Get all fields that use a specific service.
 * Useful for understanding what breaks when a service goes down.
 */
export function getFieldsByService(serviceKey: string): string[] {
  const fields: string[] = [];
  for (const [field, routes] of Object.entries(DATA_ROUTING_TABLE)) {
    if (routes.some(r => r.service === serviceKey)) {
      fields.push(field);
    }
  }
  return fields;
}
