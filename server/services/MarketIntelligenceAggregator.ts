import { FREDService } from "./FREDService";
import { HospitalityBenchmarkService } from "./HospitalityBenchmarkService";
import { GroundedResearchService } from "./GroundedResearchService";
import { MoodysService } from "./MoodysService";
import { SPGlobalService } from "./SPGlobalService";
import { CoStarService } from "./CoStarService";
import { XoteloService } from "./XoteloService";
import { ApifyService } from "./ApifyService";
import { RapidApiHospitalityService } from "./RapidApiHospitalityService";
import { WeatherService } from "./WeatherService";
import { OpenExchangeRatesService } from "./OpenExchangeRatesService";
import { WorldBankService } from "./WorldBankService";
import { FinancialNewsService } from "./FinancialNewsService";
import { AlphaVantageService } from "./AlphaVantageService";
import { cache } from "../cache";
import { storage } from "../storage";
import type { MarketIntelligence, FREDRateData, HospitalityBenchmarks, GroundedSearchResult, MoodysRiskData, SPGlobalMarketData, CoStarMarketData, XoteloMarketData, ApifyMarketData, RapidApiCompSetData, WeatherData, FxRates, WorldBankCountryData, FinancialNewsData, AlphaVantageData, DataPoint, DataRecencyWarning } from "../../shared/market-intelligence";
import { logger } from "../logger";

const RECENCY_WARNING_DAYS = 90;
const RECENCY_CRITICAL_DAYS = 365;

function checkDataPointRecency(dp: DataPoint<any> | undefined, source: string, field: string): DataRecencyWarning | null {
  if (!dp) return null;
  const dateStr = dp.publishedAt || dp.fetchedAt;
  if (!dateStr) return null;
  try {
    const ageMs = Date.now() - new Date(dateStr).getTime();
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
    if (ageDays >= RECENCY_CRITICAL_DAYS) {
      return { source, field, publishedAt: dateStr, ageInDays: ageDays, severity: "critical" };
    }
    if (ageDays >= RECENCY_WARNING_DAYS) {
      return { source, field, publishedAt: dateStr, ageInDays: ageDays, severity: "warning" };
    }
  } catch {
    // invalid date
  }
  return null;
}

function validateRecency(mi: MarketIntelligence): DataRecencyWarning[] {
  const warnings: DataRecencyWarning[] = [];
  const push = (w: DataRecencyWarning | null) => { if (w) warnings.push(w); };

  for (const [key, rateData] of Object.entries(mi.rates)) {
    if (rateData) push(checkDataPointRecency(rateData.current, "FRED", key));
  }
  if (mi.benchmarks) {
    push(checkDataPointRecency(mi.benchmarks.adr, "Hospitality Benchmarks", "adr"));
    push(checkDataPointRecency(mi.benchmarks.revpar, "Hospitality Benchmarks", "revpar"));
    push(checkDataPointRecency(mi.benchmarks.occupancy, "Hospitality Benchmarks", "occupancy"));
    push(checkDataPointRecency(mi.benchmarks.capRate, "Hospitality Benchmarks", "capRate"));
  }
  if (mi.costar) {
    push(checkDataPointRecency(mi.costar.revpar, "CoStar", "revpar"));
    push(checkDataPointRecency(mi.costar.adr, "CoStar", "adr"));
    push(checkDataPointRecency(mi.costar.occupancyRate, "CoStar", "occupancyRate"));
    push(checkDataPointRecency(mi.costar.submarketCapRate, "CoStar", "submarketCapRate"));
  }
  if (mi.moodys) {
    push(checkDataPointRecency(mi.moodys.propertyRiskScore, "Moody's", "propertyRiskScore"));
    push(checkDataPointRecency(mi.moodys.creditRating, "Moody's", "creditRating"));
  }
  if (mi.spGlobal) {
    push(checkDataPointRecency(mi.spGlobal.caseShillerIndex, "S&P Global", "caseShillerIndex"));
    push(checkDataPointRecency(mi.spGlobal.sectorOutlook, "S&P Global", "sectorOutlook"));
  }

  for (const w of warnings) {
    const msg = `Data recency ${w.severity}: ${w.source} ${w.field} is ${w.ageInDays} days old (published ${w.publishedAt})`;
    if (w.severity === "critical") {
      logger.error(msg, "data-recency");
    } else {
      logger.warn(msg, "data-recency");
    }
  }
  return warnings;
}

interface AggregatorQuery {
  location?: string;
  state?: string;
  country?: string;
  propertyType?: string;
  propertyClass?: string;
  chainScale?: string;
  propertyId?: number;
}

const PROPERTY_MI_TTL_SECONDS = 7 * 24 * 60 * 60;

export class MarketIntelligenceAggregator {
  private fred: FREDService;
  private hospitality: HospitalityBenchmarkService;
  private grounded: GroundedResearchService;
  private moodys: MoodysService;
  private spGlobal: SPGlobalService;
  private costar: CoStarService;
  private xotelo: XoteloService;
  private apify: ApifyService;
  private rapidApiHospitality: RapidApiHospitalityService;
  private weather: WeatherService;
  private fx: OpenExchangeRatesService;
  private worldBank: WorldBankService;
  private financialNews: FinancialNewsService;
  private alphaVantage: AlphaVantageService;

  constructor() {
    this.fred = new FREDService();
    this.hospitality = new HospitalityBenchmarkService();
    this.grounded = new GroundedResearchService();
    this.moodys = new MoodysService();
    this.spGlobal = new SPGlobalService();
    this.costar = new CoStarService();
    this.xotelo = new XoteloService();
    this.apify = new ApifyService();
    this.rapidApiHospitality = new RapidApiHospitalityService();
    this.weather = new WeatherService();
    this.fx = new OpenExchangeRatesService();
    this.worldBank = new WorldBankService();
    this.financialNews = new FinancialNewsService();
    this.alphaVantage  = new AlphaVantageService();
  }

  async gather(query: AggregatorQuery): Promise<MarketIntelligence> {
    if (query.propertyId) {
      const fingerprint = [
        query.propertyId,
        query.location || "",
        query.state || "",
        query.propertyType || "",
        query.propertyClass || "",
        query.chainScale || "",
      ].join(":").toLowerCase();
      const cacheKey = `mi:property:${fingerprint}`;
      return cache.staleWhileRevalidate<MarketIntelligence>(
        cacheKey,
        PROPERTY_MI_TTL_SECONDS,
        () => this.gatherFresh(query)
      );
    }
    return this.gatherFresh(query);
  }

  private async gatherFresh(query: AggregatorQuery): Promise<MarketIntelligence> {
    const errors: string[] = [];

    let enabledMap: Record<string, boolean> = {};
    try {
      enabledMap = await storage.getIntegrationEnabledMap();
    } catch {
      // table may not exist yet during early boot — treat all as enabled
    }
    const isOn = (key: string) => enabledMap[key] !== false;

    const [ratesResult, benchmarksResult, searchResult, moodysResult, spGlobalResult, costarResult, xoteloResult, apifyResult, fxResult, worldBankResult, rapidApiCompsResult, weatherResult, financialNewsResult, alphaVantageResult] = await Promise.allSettled([
      isOn("fred") ? this.fetchRates() : Promise.resolve({}),
      query.location && isOn("hospitality-benchmarks")
        ? this.hospitality.fetchBenchmarks({
            city: query.location,
            state: query.state,
            propertyClass: query.propertyClass,
            chainScale: query.chainScale,
          })
        : Promise.resolve(null),
      query.location && this.grounded.isAvailable() && isOn("grounded-research")
        ? this.grounded.search(
            this.grounded.buildHospitalityQueries(
              `${query.location}${query.state ? `, ${query.state}` : ""}`,
              query.propertyType || "boutique hotel"
            )
          )
        : Promise.resolve([]),
      query.location && this.moodys.isAvailable() && isOn("moodys")
        ? this.moodys.fetchRiskData({
            location: query.location,
            propertyType: query.propertyType,
            propertyClass: query.propertyClass,
          })
        : Promise.resolve(null),
      query.location && this.spGlobal.isAvailable() && isOn("sp-global")
        ? this.spGlobal.fetchMarketData({
            location: query.location,
            state: query.state,
            propertyType: query.propertyType,
          })
        : Promise.resolve(null),
      query.location && this.costar.isAvailable() && isOn("costar")
        ? this.costar.fetchMarketData({
            location: query.location,
            state: query.state,
            propertyType: query.propertyType,
          })
        : Promise.resolve(null),
      query.location && isOn("xotelo")
        ? this.fetchXoteloData(query.location)
        : Promise.resolve(null),
      query.location && this.apify.isAvailable() && isOn("apify")
        ? this.apify.fetchCompSetData(query.location)
        : Promise.resolve(undefined),
      this.fx.isAvailable() && isOn("open-exchange-rates")
        ? this.fx.fetchRates()
        : Promise.resolve(null),
      query.country && isOn("world-bank")
        ? this.worldBank.fetchCountryData(query.country)
        : Promise.resolve(null),
      query.location && this.rapidApiHospitality.isAvailable()
        && (isOn("rapidapi-airbnb") || isOn("rapidapi-booking") || isOn("rapidapi-hotels") || isOn("rapidapi-tripadvisor"))
        ? this.rapidApiHospitality.fetchCompSetData(query.location)
        : Promise.resolve(undefined),
      query.location && this.weather.isAvailable() && isOn("weather-api")
        ? this.weather.fetchWeatherData(query.location)
        : Promise.resolve(null),
      query.location && this.financialNews.isAvailable() && (isOn("cnbc-news") || isOn("bloomberg-finance"))
        ? this.financialNews.fetchHospitalityNews(query.location)
        : Promise.resolve(null),
      this.alphaVantage.isAvailable() && isOn("alpha-vantage")
        ? this.alphaVantage.fetchMarketData()
        : Promise.resolve(null),
    ]);

    let rates: Record<string, FREDRateData> = {};
    if (ratesResult.status === "fulfilled") {
      rates = ratesResult.value;
    } else {
      errors.push(`FRED: ${ratesResult.reason?.message || "Unknown error"}`);
    }

    let benchmarks: HospitalityBenchmarks | undefined;
    if (benchmarksResult.status === "fulfilled" && benchmarksResult.value) {
      benchmarks = benchmarksResult.value;
    } else if (benchmarksResult.status === "rejected") {
      errors.push(`Hospitality benchmarks: ${benchmarksResult.reason?.message || "Unknown error"}`);
    }

    let groundedResearch: GroundedSearchResult[] = [];
    if (searchResult.status === "fulfilled") {
      groundedResearch = searchResult.value;
    } else {
      errors.push(`Grounded research: ${searchResult.reason?.message || "Unknown error"}`);
    }

    let moodys: MoodysRiskData | undefined;
    if (moodysResult.status === "fulfilled" && moodysResult.value) {
      moodys = moodysResult.value;
    } else if (moodysResult.status === "rejected") {
      errors.push(`Moody's: ${moodysResult.reason?.message || "Unknown error"}`);
    }

    let spGlobal: SPGlobalMarketData | undefined;
    if (spGlobalResult.status === "fulfilled" && spGlobalResult.value) {
      spGlobal = spGlobalResult.value;
    } else if (spGlobalResult.status === "rejected") {
      errors.push(`S&P Global: ${spGlobalResult.reason?.message || "Unknown error"}`);
    }

    let costar: CoStarMarketData | undefined;
    if (costarResult.status === "fulfilled" && costarResult.value) {
      costar = costarResult.value;
    } else if (costarResult.status === "rejected") {
      errors.push(`CoStar: ${costarResult.reason?.message || "Unknown error"}`);
    }

    let xotelo: XoteloMarketData | undefined;
    if (xoteloResult.status === "fulfilled" && xoteloResult.value) {
      xotelo = xoteloResult.value;
    } else if (xoteloResult.status === "rejected") {
      errors.push(`Xotelo: ${xoteloResult.reason?.message || "Unknown error"}`);
    }

    let apify: ApifyMarketData | undefined;
    if (apifyResult.status === "fulfilled" && apifyResult.value) {
      apify = apifyResult.value;
    } else if (apifyResult.status === "rejected") {
      errors.push(`Apify: ${apifyResult.reason?.message || "Unknown error"}`);
    }

    let fx: FxRates | undefined;
    if (fxResult.status === "fulfilled" && fxResult.value) {
      fx = fxResult.value;
    } else if (fxResult.status === "rejected") {
      errors.push(`FX rates: ${fxResult.reason?.message || "Unknown error"}`);
    }

    let worldBank: WorldBankCountryData | undefined;
    if (worldBankResult.status === "fulfilled" && worldBankResult.value) {
      worldBank = worldBankResult.value;
    } else if (worldBankResult.status === "rejected") {
      errors.push(`World Bank: ${worldBankResult.reason?.message || "Unknown error"}`);
    }

    let rapidApiComps: RapidApiCompSetData | undefined;
    if (rapidApiCompsResult.status === "fulfilled" && rapidApiCompsResult.value) {
      rapidApiComps = rapidApiCompsResult.value;
    } else if (rapidApiCompsResult.status === "rejected") {
      errors.push(`RapidAPI comps: ${rapidApiCompsResult.reason?.message || "Unknown error"}`);
    }

    let weather: WeatherData | undefined;
    if (weatherResult.status === "fulfilled" && weatherResult.value) {
      weather = weatherResult.value;
    } else if (weatherResult.status === "rejected") {
      errors.push(`Weather: ${weatherResult.reason?.message || "Unknown error"}`);
    }

    let financialNews: FinancialNewsData | undefined;
    if (financialNewsResult.status === "fulfilled" && financialNewsResult.value) {
      financialNews = financialNewsResult.value;
    } else if (financialNewsResult.status === "rejected") {
      errors.push(`Financial news: ${financialNewsResult.reason?.message || "Unknown error"}`);
    }

    let alphaVantage: AlphaVantageData | undefined;
    if (alphaVantageResult.status === "fulfilled" && alphaVantageResult.value) {
      alphaVantage = alphaVantageResult.value;
    } else if (alphaVantageResult.status === "rejected") {
      errors.push(`Alpha Vantage: ${alphaVantageResult.reason?.message || "Unknown error"}`);
    }

    const result: MarketIntelligence = {
      rates: {
        sofr: rates.sofr,
        treasury2y: rates.treasury2y,
        treasury5y: rates.treasury5y,
        treasury10y: rates.treasury10y,
        primeRate: rates.primeRate,
        cpi: rates.cpi,
      },
      benchmarks,
      moodys,
      spGlobal,
      costar,
      xotelo,
      apify,
      rapidApiComps,
      weather,
      fx,
      worldBank,
      groundedResearch,
      financialNews,
      alphaVantage,
      fetchedAt: new Date().toISOString(),
      errors,
    };

    result.recencyWarnings = validateRecency(result);
    return result;
  }

  async fetchRatesOnly(): Promise<Record<string, FREDRateData>> {
    return this.fred.fetchAllRates();
  }

  async fetchRateWithHistory(seriesKey: string): Promise<FREDRateData | null> {
    const validKeys = FREDService.getSeriesKeys();
    if (!validKeys.includes(seriesKey as any)) return null;
    return this.fred.fetchRate(seriesKey as any);
  }

  getServiceStatus(): { fred: boolean; hospitality: boolean; grounded: boolean; moodys: boolean; spGlobal: boolean; costar: boolean; xotelo: boolean; apify: boolean; rapidApiComps: boolean; weather: boolean; fx: boolean; worldBank: boolean; financialNews: boolean; alphaVantage: boolean } {
    return {
      fred: this.fred.isAvailable(),
      hospitality: this.hospitality.isAvailable(),
      grounded: this.grounded.isAvailable(),
      moodys: this.moodys.isAvailable(),
      spGlobal: this.spGlobal.isAvailable(),
      costar: this.costar.isAvailable(),
      xotelo: this.xotelo.isAvailable(),
      apify: this.apify.isAvailable(),
      rapidApiComps: this.rapidApiHospitality.isAvailable(),
      weather: this.weather.isAvailable(),
      fx: this.fx.isAvailable(),
      worldBank: this.worldBank.isAvailable(),
      financialNews: this.financialNews.isAvailable(),
      alphaVantage:  this.alphaVantage.isAvailable(),
    };
  }
  
  async refreshFREDRates(): Promise<void> {
    if (!this.fred.isAvailable()) return;
    await this.fred.fetchAllRates();
  }

  private async fetchRates(): Promise<Record<string, FREDRateData>> {
    if (!this.fred.isAvailable()) return {};
    return this.fred.fetchAllRates();
  }

  private async fetchXoteloData(location: string): Promise<XoteloMarketData | null> {
    try {
      const snapshot = await this.xotelo.getMarketSnapshot(location);
      if (!snapshot) return null;

      const adrBenchmark = await this.xotelo.fetchAdrBenchmark(location);

      return {
        adrBenchmark: adrBenchmark ?? undefined,
        hotelCount: snapshot.sampleSize,
        avgPriceMin: snapshot.avgPriceMin ?? undefined,
        avgPriceMax: snapshot.avgPriceMax ?? undefined,
        location: snapshot.location,
      };
    } catch {
      return null;
    }
  }

  getXoteloService(): XoteloService {
    return this.xotelo;
  }
}

let aggregatorInstance: MarketIntelligenceAggregator | null = null;

export function getMarketIntelligenceAggregator(): MarketIntelligenceAggregator {
  if (!aggregatorInstance) {
    aggregatorInstance = new MarketIntelligenceAggregator();
  }
  return aggregatorInstance;
}
