import { BaseIntegrationService } from "./BaseIntegrationService";
import { cache } from "../cache";
import type { FREDRateData } from "../../shared/market-intelligence";

interface FredObservation {
  date: string;
  value: string;
}

const FRED_SERIES = {
  sofr: "SOFR",
  treasury2y: "DGS2",
  treasury5y: "DGS5",
  treasury10y: "DGS10",
  primeRate: "DPRIME",
  cpi: "CPIAUCSL",
} as const;

export const FRED_BASE_URL = "https://api.stlouisfed.org/fred/series/observations";
const CACHE_TTL_SECONDS = 24 * 60 * 60;

export type FREDSeriesKey = keyof typeof FRED_SERIES;

export class FREDService extends BaseIntegrationService {
  private apiKey: string | undefined;

  constructor() {
    super("FRED", 8_000);
    this.apiKey = process.env.FRED_API_KEY;
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async fetchRate(seriesKey: FREDSeriesKey): Promise<FREDRateData | null> {
    if (!this.apiKey) return null;

    const cacheKey = `fred:${seriesKey}`;
    return cache.staleWhileRevalidate<FREDRateData | null>(
      cacheKey,
      CACHE_TTL_SECONDS,
      () => this.fetchFresh(seriesKey)
    );
  }

  private async fetchFresh(seriesKey: FREDSeriesKey): Promise<FREDRateData | null> {
    try {
      const seriesId = FRED_SERIES[seriesKey];
      const [current, history] = await Promise.all([
        this.fetchLatestObservation(seriesId),
        this.fetchHistoricalSeries(seriesId, 5),
      ]);

      if (!current) return null;

      return {
        current: {
          value: current.value,
          source: `FRED ${seriesId}`,
          sourceUrl: `https://fred.stlouisfed.org/series/${seriesId}`,
          publishedAt: current.date,
          fetchedAt: new Date().toISOString(),
          provenance: "verified",
          confidence: "high",
        },
        history: history,
      };
    } catch (error: unknown) {
      this.warn(`Failed to fetch ${seriesKey}`, error);
      return null;
    }
  }

  async fetchAllRates(): Promise<Record<string, FREDRateData>> {
    const results: Record<string, FREDRateData> = {};
    const keys = Object.keys(FRED_SERIES) as FREDSeriesKey[];

    const settled = await Promise.allSettled(
      keys.map(async (key) => {
        const data = await this.fetchRate(key);
        return { key, data };
      })
    );

    for (const result of settled) {
      if (result.status === "fulfilled" && result.value.data) {
        results[result.value.key] = result.value.data;
      }
    }

    return results;
  }

  private async fetchLatestObservation(seriesId: string): Promise<{ value: number; date: string } | null> {
    const params = new URLSearchParams({
      series_id: seriesId,
      api_key: this.apiKey!,
      file_type: "json",
      sort_order: "desc",
      limit: "5",
    });

    const response = await this.fetchWithTimeout(`${FRED_BASE_URL}?${params}`);
    const data = await response.json();
    const obs = data.observations?.find((o: FredObservation) => o.value !== ".");

    if (!obs) return null;
    return { value: parseFloat(obs.value), date: obs.date };
  }

  private async fetchHistoricalSeries(seriesId: string, years: number): Promise<{ date: string; value: number }[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - years);

    const isMonthlySeries = seriesId === "CPIAUCSL";

    const params = new URLSearchParams({
      series_id: seriesId,
      api_key: this.apiKey!,
      file_type: "json",
      observation_start: startDate.toISOString().split("T")[0],
      observation_end: endDate.toISOString().split("T")[0],
      ...(isMonthlySeries ? {} : { frequency: "m" }),
    });

    try {
      const response = await this.fetchWithTimeout(`${FRED_BASE_URL}?${params}`);
      const data = await response.json();

      return (data.observations ?? [])
        .filter((o: FredObservation) => o.value !== ".")
        .map((o: FredObservation) => ({
          date: o.date,
          value: parseFloat(o.value),
        }));
    } catch (error: unknown) {
      this.warn(`Historical fetch failed for ${seriesId}`, error);
      return [];
    }
  }

  getSeriesId(key: FREDSeriesKey): string {
    return FRED_SERIES[key];
  }

  static getSeriesKeys(): FREDSeriesKey[] {
    return Object.keys(FRED_SERIES) as FREDSeriesKey[];
  }
}
