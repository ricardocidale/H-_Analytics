import { BaseIntegrationService } from "./BaseIntegrationService";
import { cache } from "../cache";
import type { HospitalityBenchmarks, DataPoint } from "../../shared/market-intelligence";

interface SubmarketQuery {
  city: string;
  state?: string;
  propertyClass?: string;
  chainScale?: string;
}

const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;

export class HospitalityBenchmarkService extends BaseIntegrationService {
  private apiKey: string | undefined;

  constructor() {
    super("HospitalityBenchmark", 15_000);
    this.apiKey = process.env.COSTAR_API_KEY || process.env.STR_API_KEY || process.env.AIRDNA_API_KEY;
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async fetchBenchmarks(query: SubmarketQuery): Promise<HospitalityBenchmarks | null> {
    if (!this.apiKey) return null;

    const cacheKey = `hosp:${query.city}-${query.state || ""}-${query.propertyClass || ""}-${query.chainScale || ""}`.toLowerCase();

    return cache.staleWhileRevalidate<HospitalityBenchmarks | null>(
      cacheKey,
      CACHE_TTL_SECONDS,
      async () => {
        try {
          return await this.queryApi(query);
        } catch (error: unknown) {
          this.warn(`Failed to fetch benchmarks for ${query.city}`, error);
          return null;
        }
      }
    );
  }

  private async queryApi(query: SubmarketQuery): Promise<HospitalityBenchmarks | null> {
    const providerUrl = process.env.COSTAR_API_URL || process.env.STR_API_URL || process.env.AIRDNA_API_URL;
    if (!providerUrl) return null;

    const params = new URLSearchParams({
      city: query.city,
      ...(query.state ? { state: query.state } : {}),
      ...(query.propertyClass ? { property_class: query.propertyClass } : {}),
      ...(query.chainScale ? { chain_scale: query.chainScale } : {}),
    });

    const response = await this.fetchWithTimeout(`${providerUrl}?${params}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    return this.parseResponse(data, query);
  }

  private parseResponse(data: any, query: SubmarketQuery): HospitalityBenchmarks {
    const now = new Date().toISOString();
    const source = data.provider || "CoStar/STR";

    const makePoint = <T = number>(value: T): DataPoint<T> => ({
      value,
      source,
      fetchedAt: now,
      provenance: "verified",
      confidence: "high",
    });

    return {
      submarket: `${query.city}${query.state ? `, ${query.state}` : ""}`,
      ...(data.revpar != null ? { revpar: makePoint(data.revpar) } : {}),
      ...(data.adr != null ? { adr: makePoint(data.adr) } : {}),
      ...(data.occupancy != null ? { occupancy: makePoint(data.occupancy) } : {}),
      ...(data.capRate != null ? { capRate: makePoint(data.capRate) } : {}),
      ...(data.supplyPipeline ? {
        supplyPipeline: makePoint({
          newRooms: data.supplyPipeline.newRooms ?? 0,
          underConstruction: data.supplyPipeline.underConstruction ?? 0,
        }),
      } : {}),
    };
  }
}
