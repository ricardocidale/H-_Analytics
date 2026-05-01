export type DataProvenance = "verified" | "cited" | "estimated";

export interface DataPoint<T = number> {
  value: T;
  source: string;
  sourceUrl?: string;
  publishedAt?: string;
  fetchedAt: string;
  provenance: DataProvenance;
  confidence: "high" | "medium" | "low";
}

export interface FREDRateData {
  current: DataPoint;
  history: { date: string; value: number }[];
}

export interface HospitalityBenchmarks {
  revpar?: DataPoint;
  adr?: DataPoint;
  occupancy?: DataPoint;
  supplyPipeline?: DataPoint<{ newRooms: number; underConstruction: number }>;
  capRate?: DataPoint;
  submarket: string;
}

export interface CitedSource {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
}

export interface GroundedSearchResult {
  query: string;
  answer: string;
  sources: CitedSource[];
  fetchedAt: string;
}

export interface MoodysRiskData {
  propertyRiskScore?: DataPoint;
  defaultProbability?: DataPoint;
  creditRating?: DataPoint<string>;
  riskPremiumBps?: DataPoint;
  lossGivenDefault?: DataPoint;
  watchlistStatus?: DataPoint<string>;
}

export interface SPGlobalMarketData {
  caseShillerIndex?: DataPoint;
  caseShillerYoY?: DataPoint;
  sectorOutlook?: DataPoint<string>;
  economicForecast?: DataPoint<{
    gdpGrowth: number;
    employmentGrowth: number;
    inflationForecast: number;
  }>;
  capRateForecast?: DataPoint<{ current: number; forecast12m: number }>;
  marketTier?: DataPoint<string>;
}

export interface CoStarMarketData {
  revpar?: DataPoint;
  adr?: DataPoint;
  occupancyRate?: DataPoint;
  rentGrowthYoY?: DataPoint;
  demandGrowthYoY?: DataPoint;
  submarketCapRate?: DataPoint;
  marketScore?: DataPoint;
  marketVacancy?: DataPoint;
  submarketTier?: DataPoint<string>;
  supplyPipeline?: DataPoint<{
    newRooms: number;
    underConstruction: number;
    deliverySchedule12m: number;
  }>;
  transactionVolume?: DataPoint<{
    totalSales: number;
    avgPricePerKey: number;
  }>;
}

export interface XoteloOTARate {
  code: string;
  name: string;
  rate: number;
}

export interface XoteloMarketData {
  adrBenchmark?: DataPoint;
  otaRates?: XoteloOTARate[];
  hotelCount?: number;
  avgPriceMin?: number;
  avgPriceMax?: number;
  location?: string;
}

// ─── FX Rates ────────────────────────────────────────────────────────────────

export interface FxRates {
  base: "USD";
  fetchedAt: string;
  /** Local units per 1 USD (e.g. COP: 4100 means $1 = 4,100 COP) */
  rates: Record<string, number>;
  /** USD per 1 local unit (convenience inverse) */
  usdPer: Record<string, number>;
}

// ─── World Bank Country Economics ────────────────────────────────────────────

export interface WorldBankCountryData {
  country: string;
  iso2: string;
  gdpGrowth?:       DataPoint;   // annual % growth
  inflation?:       DataPoint;   // CPI annual %
  tourismArrivals?: DataPoint;   // international arrivals (count)
  unemployment?:    DataPoint;   // % of labor force
  gniPerCapita?:    DataPoint;   // USD, Atlas method
  fetchedAt: string;
}

// ─── Walk Score (property-level) ─────────────────────────────────────────────

export interface WalkScoreData {
  walkScore:    number | null;
  walkDesc:     string | null;
  transitScore: number | null;
  transitDesc:  string | null;
  bikeScore:    number | null;
  bikeDesc:     string | null;
  wsUrl:        string | null;
  fetchedAt:    string;
}

// ─── RapidAPI STR Comp-Set Data ──────────────────────────────────────────────
// Runs alongside ApifyMarketData for parallel comparison.

export interface StrListingSnapshot {
  name: string;
  pricePerNight?: number;
  rating?: number;
  reviewCount?: number;
  bedrooms?: number;
  maxGuests?: number;
  url?: string;
}

export interface RapidApiCompSetData {
  airbnb?: {
    avgNightlyRate?: DataPoint;
    priceRange?: { min: number; max: number };
    listingCount: number;
    avgRating?: number;
    sampleListings: StrListingSnapshot[];
    fetchedAt: string;
  };
  booking?: {
    avgNightlyRate?: DataPoint;
    priceRange?: { min: number; max: number };
    hotelCount: number;
    sampleHotels: StrListingSnapshot[];
    fetchedAt: string;
  };
  hotels?: {
    avgNightlyRate?: DataPoint;
    priceRange?: { min: number; max: number };
    hotelCount: number;
    sampleHotels: StrListingSnapshot[];
    fetchedAt: string;
  };
  tripadvisor?: {
    avgRating?: DataPoint;
    topHotels: StrListingSnapshot[];
    fetchedAt: string;
  };
}

// ─── Weather Data ─────────────────────────────────────────────────────────────

export interface WeatherData {
  location: string;
  country?: string;
  current: {
    tempC: number;
    tempF: number;
    condition: string;
    humidity: number;
    precipMm: number;
    uvIndex: number;
    windKph: number;
    feelsLikeC: number;
  };
  forecast: {
    date: string;
    maxTempC: number;
    minTempC: number;
    avgTempC: number;
    totalPrecipMm: number;
    condition: string;
    uvIndex: number;
    chanceOfRain: number;
  }[];
  fetchedAt: string;
}

// ─── Alpha Vantage — Hospitality REIT & Macro ────────────────────────────────

export interface ReitSnapshot {
  symbol: string;
  name: string;
  latestClose: number;
  weekAgo: number;
  monthAgo: number;
  weekChangePct: number;
  monthChangePct: number;
  fetchedAt: string;
}

export interface AlphaVantageData {
  reits: ReitSnapshot[];
  gdpGrowthQoQ?: number;
  inflationYoY?: number;
  fetchedAt: string;
}

// ─── Financial News Headlines ────────────────────────────────────────────────

export interface NewsHeadline {
  title: string;
  description?: string;
  url?: string;
  publishedAt?: string;
  source: "cnbc" | "bloomberg";
  category?: string;
}

export interface FinancialNewsData {
  headlines: NewsHeadline[];
  fetchedAt: string;
}

// ─── Apify STR Comp-Set Data ─────────────────────────────────────────────────

export interface ApifyListingSnapshot {
  name: string;
  pricePerNight?: number;
  rating?: number;
  reviewCount?: number;
  bedrooms?: number;
  maxGuests?: number;
  url?: string;
}

export interface ApifyMarketData {
  airbnb?: {
    avgNightlyRate?: DataPoint;
    priceRange?: { min: number; max: number };
    listingCount: number;
    avgRating?: number;
    sampleListings: ApifyListingSnapshot[];
    fetchedAt: string;
  };
  vrbo?: {
    avgNightlyRate?: DataPoint;
    priceRange?: { min: number; max: number };
    listingCount: number;
    sampleListings: ApifyListingSnapshot[];
    fetchedAt: string;
  };
  booking?: {
    avgNightlyRate?: DataPoint;
    priceRange?: { min: number; max: number };
    hotelCount: number;
    sampleHotels: ApifyListingSnapshot[];
    fetchedAt: string;
  };
  tripadvisor?: {
    avgRating?: DataPoint;
    topHotels: ApifyListingSnapshot[];
    fetchedAt: string;
  };
}

export interface DataRecencyWarning {
  source: string;
  field: string;
  publishedAt: string;
  ageInDays: number;
  severity: "info" | "warning" | "critical";
}

export interface MarketIntelligence {
  rates: {
    sofr?: FREDRateData;
    treasury2y?: FREDRateData;
    treasury5y?: FREDRateData;
    treasury10y?: FREDRateData;
    primeRate?: FREDRateData;
    cpi?: FREDRateData;
  };
  benchmarks?: HospitalityBenchmarks;
  moodys?: MoodysRiskData;
  spGlobal?: SPGlobalMarketData;
  costar?: CoStarMarketData;
  xotelo?: XoteloMarketData;
  apify?: ApifyMarketData;
  rapidApiComps?: RapidApiCompSetData;
  weather?: WeatherData;
  fx?: FxRates;
  worldBank?: WorldBankCountryData;
  groundedResearch: GroundedSearchResult[];
  financialNews?: FinancialNewsData;
  alphaVantage?: AlphaVantageData;
  fetchedAt: string;
  errors: string[];
  recencyWarnings?: DataRecencyWarning[];
}
