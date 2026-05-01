import { BaseIntegrationService } from "./BaseIntegrationService";
import { cache } from "../cache";
import type { MoodysRiskData, DataPoint } from "../../shared/market-intelligence";

interface MoodysQuery {
  location: string;
  propertyType?: string;
  propertyClass?: string;
}

const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;

export class MoodysService extends BaseIntegrationService {
  private apiKey: string | undefined;
  private baseUrl: string | undefined;

  constructor() {
    super("Moodys", 15_000);
    this.apiKey = process.env.MOODYS_API_KEY;
    this.baseUrl = process.env.MOODYS_API_URL || "https://api.moodys.com/v1";
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async fetchRiskData(query: MoodysQuery): Promise<MoodysRiskData | null> {
    if (!this.apiKey) return null;

    const cacheKey = `moodys:${query.location}-${query.propertyType || ""}-${query.propertyClass || ""}`.toLowerCase();

    return cache.staleWhileRevalidate<MoodysRiskData | null>(
      cacheKey,
      CACHE_TTL_SECONDS,
      async () => {
        try {
          return await this.queryApi(query);
        } catch (error: unknown) {
          this.warn(`Failed to fetch risk data for ${query.location}`, error);
          return null;
        }
      }
    );
  }

  private async queryApi(query: MoodysQuery): Promise<MoodysRiskData | null> {
    const params = new URLSearchParams({
      location: query.location,
      ...(query.propertyType ? { property_type: query.propertyType } : {}),
      ...(query.propertyClass ? { property_class: query.propertyClass } : {}),
    });

    const response = await this.fetchWithTimeout(`${this.baseUrl}/credit-risk/property?${params}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    return this.parseResponse(data);
  }

  private parseResponse(data: any): MoodysRiskData {
    const now = new Date().toISOString();
    const source = "Moody's Analytics";
    const sourceUrl = "https://www.moodys.com";

    const makePoint = <T = number>(value: T): DataPoint<T> => ({
      value,
      source,
      sourceUrl,
      fetchedAt: now,
      provenance: "verified",
      confidence: "high",
    });

    return {
      ...(data.propertyRiskScore != null ? { propertyRiskScore: makePoint(data.propertyRiskScore) } : {}),
      ...(data.defaultProbability != null ? { defaultProbability: makePoint(data.defaultProbability) } : {}),
      ...(data.creditRating != null ? { creditRating: makePoint<string>(data.creditRating) } : {}),
      ...(data.riskPremiumBps != null ? { riskPremiumBps: makePoint(data.riskPremiumBps) } : {}),
      ...(data.lossGivenDefault != null ? { lossGivenDefault: makePoint(data.lossGivenDefault) } : {}),
      ...(data.watchlistStatus != null ? { watchlistStatus: makePoint<string>(data.watchlistStatus) } : {}),
    };
  }
}
