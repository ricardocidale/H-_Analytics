import { BaseIntegrationService } from "./BaseIntegrationService";
import { cache } from "../cache";
import type { CoStarMarketData, DataPoint } from "../../shared/market-intelligence";

interface CoStarQuery {
  location: string;
  state?: string;
  propertyType?: string;
  submarket?: string;
}

const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;

export class CoStarService extends BaseIntegrationService {
  private apiKey: string | undefined;
  private baseUrl: string | undefined;

  constructor() {
    super("CoStar", 15_000);
    this.apiKey = process.env.COSTAR_API_KEY;
    this.baseUrl = process.env.COSTAR_API_URL || "https://api.costar.com/v1";
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async fetchMarketData(query: CoStarQuery): Promise<CoStarMarketData | null> {
    if (!this.apiKey) return null;

    const cacheKey = `costar:${query.location}-${query.state || ""}-${query.propertyType || ""}-${query.submarket || ""}`.toLowerCase();

    return cache.staleWhileRevalidate<CoStarMarketData | null>(
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

  private async queryApi(query: CoStarQuery): Promise<CoStarMarketData | null> {
    const params = new URLSearchParams({
      market: query.location,
      ...(query.state ? { state: query.state } : {}),
      ...(query.propertyType ? { property_type: query.propertyType } : {}),
      ...(query.submarket ? { submarket: query.submarket } : {}),
    });

    const response = await this.fetchWithTimeout(`${this.baseUrl}/analytics/market?${params}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    return this.parseResponse(data);
  }

  private parseResponse(data: any): CoStarMarketData {
    const now = new Date().toISOString();
    const source = "CoStar Group";
    const sourceUrl = "https://www.costar.com";

    const makePoint = <T = number>(value: T): DataPoint<T> => ({
      value,
      source,
      sourceUrl,
      fetchedAt: now,
      provenance: "verified",
      confidence: "high",
    });

    return {
      ...(data.revpar != null ? { revpar: makePoint(data.revpar) } : {}),
      ...(data.adr != null ? { adr: makePoint(data.adr) } : {}),
      ...(data.occupancyRate != null ? { occupancyRate: makePoint(data.occupancyRate) } : {}),
      ...(data.rentGrowthYoY != null ? { rentGrowthYoY: makePoint(data.rentGrowthYoY) } : {}),
      ...(data.demandGrowthYoY != null ? { demandGrowthYoY: makePoint(data.demandGrowthYoY) } : {}),
      ...(data.submarketCapRate != null ? { submarketCapRate: makePoint(data.submarketCapRate) } : {}),
      ...(data.marketScore != null ? { marketScore: makePoint(data.marketScore) } : {}),
      ...(data.marketVacancy != null ? { marketVacancy: makePoint(data.marketVacancy) } : {}),
      ...(data.submarketTier != null ? { submarketTier: makePoint<string>(data.submarketTier) } : {}),
      ...(data.supplyPipeline ? {
        supplyPipeline: makePoint({
          newRooms: data.supplyPipeline.newRooms ?? 0,
          underConstruction: data.supplyPipeline.underConstruction ?? 0,
          deliverySchedule12m: data.supplyPipeline.deliverySchedule12m ?? 0,
        }),
      } : {}),
      ...(data.transactionVolume ? {
        transactionVolume: makePoint({
          totalSales: data.transactionVolume.totalSales ?? 0,
          avgPricePerKey: data.transactionVolume.avgPricePerKey ?? 0,
        }),
      } : {}),
    };
  }
}
