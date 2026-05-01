/**
 * Service registry — lazy singletons for every data-source service the router
 * may call, plus the integration-enabled gating function.
 *
 * Cache state for the integration-enabled map is kept in
 * `integration-status-sink.ts` so this module is purely constructor + lookup.
 */
import { FREDService } from "../../services/FREDService";
import { HospitalityBenchmarkService } from "../../services/HospitalityBenchmarkService";
import { GroundedResearchService } from "../../services/GroundedResearchService";
import { CoStarService } from "../../services/CoStarService";
import { XoteloService } from "../../services/XoteloService";
import { ApifyService } from "../../services/ApifyService";
import { RapidApiHospitalityService } from "../../services/RapidApiHospitalityService";
import { WeatherService } from "../../services/WeatherService";
import { WorldBankService } from "../../services/WorldBankService";
import { AlphaVantageService } from "../../services/AlphaVantageService";
import { AmadeusService } from "../../services/AmadeusService";
import { WalkScoreService } from "../../services/WalkScoreService";
import { RealtyService } from "../../services/RealtyService";
import { USRealEstateService } from "../../services/USRealEstateService";
import { getIntegrationStatusSink } from "./integration-status-sink";

export interface ServiceEntry {
  instance: any;
  isAvailable: () => boolean;
}

let _services: Record<string, ServiceEntry> | null = null;

export function getServiceRegistry(): Record<string, ServiceEntry> {
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

/** Map service keys in the routing table to integration-enabled-map keys. */
export const SERVICE_TO_INTEGRATION_KEY: Record<string, string> = {
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

export async function isServiceEnabled(serviceKey: string): Promise<boolean> {
  const integrationKey = SERVICE_TO_INTEGRATION_KEY[serviceKey];
  if (!integrationKey || integrationKey === "__always__") return true;
  const map = await getIntegrationStatusSink().getEnabledMap();
  return map[integrationKey] !== false;
}
