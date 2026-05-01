import { BaseIntegrationService } from "./BaseIntegrationService";
import { cache } from "../cache";
import type { SPGlobalMarketData, DataPoint } from "../../shared/market-intelligence";

interface SPGlobalQuery {
  location: string;
  propertyType?: string;
  state?: string;
}

const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;

export class SPGlobalService extends BaseIntegrationService {
  private apiKey: string | undefined;
  private baseUrl: string | undefined;

  constructor() {
    super("SPGlobal", 15_000);
    this.apiKey = process.env.SPGLOBAL_API_KEY;
    this.baseUrl = process.env.SPGLOBAL_API_URL || "https://api.spglobal.com/v1";
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async fetchMarketData(query: SPGlobalQuery): Promise<SPGlobalMarketData | null> {
    if (!this.apiKey) return null;

    const cacheKey = `spglobal:${query.location}-${query.state || ""}-${query.propertyType || ""}`.toLowerCase();

    return cache.staleWhileRevalidate<SPGlobalMarketData | null>(
      cacheKey,
      CACHE_TTL_SECONDS,
      async () => {
        try {
          return await this.queryApi(query);
        } catch (error: unknown) {
          this.warn(`Failed to fetch market data for ${query.location}`, error);
          return null;
        }
      }
    );
  }

  private async queryApi(query: SPGlobalQuery): Promise<SPGlobalMarketData | null> {
    const params = new URLSearchParams({
      location: query.location,
      ...(query.state ? { state: query.state } : {}),
      ...(query.propertyType ? { property_type: query.propertyType } : {}),
    });

    const response = await this.fetchWithTimeout(`${this.baseUrl}/market-intelligence/real-estate?${params}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    return this.parseResponse(data);
  }

  private parseResponse(data: any): SPGlobalMarketData {
    const now = new Date().toISOString();
    const source = "S&P Global Market Intelligence";
    const sourceUrl = "https://www.spglobal.com/marketintelligence";

    const makePoint = <T = number>(value: T): DataPoint<T> => ({
      value,
      source,
      sourceUrl,
      fetchedAt: now,
      provenance: "verified",
      confidence: "high",
    });

    return {
      ...(data.caseShillerIndex != null ? { caseShillerIndex: makePoint(data.caseShillerIndex) } : {}),
      ...(data.caseShillerYoY != null ? { caseShillerYoY: makePoint(data.caseShillerYoY) } : {}),
      ...(data.sectorOutlook != null ? { sectorOutlook: makePoint<string>(data.sectorOutlook) } : {}),
      ...(data.economicForecast ? {
        economicForecast: makePoint({
          gdpGrowth: data.economicForecast.gdpGrowth ?? 0,
          employmentGrowth: data.economicForecast.employmentGrowth ?? 0,
          inflationForecast: data.economicForecast.inflationForecast ?? 0,
        }),
      } : {}),
      ...(data.capRateForecast ? {
        capRateForecast: makePoint({
          current: data.capRateForecast.current ?? 0,
          forecast12m: data.capRateForecast.forecast12m ?? 0,
        }),
      } : {}),
      ...(data.marketTier != null ? { marketTier: makePoint<string>(data.marketTier) } : {}),
    };
  }
}
