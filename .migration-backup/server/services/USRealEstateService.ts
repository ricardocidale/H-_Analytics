import { BaseIntegrationService } from "./BaseIntegrationService";
import { cache } from "../cache";

const RAPIDAPI_HOST = "us-real-estate.p.rapidapi.com";
const CACHE_TTL_SECONDS = 60 * 60;

interface ValueEstimate {
  date: string;
  estimate: number;
}

interface HistoricalValues {
  estimates: ValueEstimate[];
  source: { type: string; name: string };
}

interface PropertyDetailResponse {
  data?: {
    estimates?: {
      historical_values?: HistoricalValues[];
    };
    location?: {
      address?: {
        line?: string;
        city?: string;
        state_code?: string;
        postal_code?: string;
      };
    };
    description?: {
      beds?: number;
      baths?: number;
      sqft?: number;
      lot_sqft?: number;
      type?: string;
      year_built?: number;
    };
  };
}

interface MedianPriceCity {
  state_code: string;
  city: string;
  geo_type: string;
  slug_id: string;
  geo_statistics?: {
    housing_market?: {
      median_listing_price?: number;
      by_prop_type?: Array<{
        type: string;
        attributes: { median_listing_price?: number };
      }>;
    };
  };
}

interface ForSaleResponse {
  data?: {
    geo?: {
      recommended_cities?: {
        geos?: MedianPriceCity[];
      };
    };
    home_search?: {
      total?: number;
      results?: Array<Record<string, unknown>>;
    };
  };
}

export interface PropertyValueHistory {
  propertyId: string;
  currentEstimate: number | null;
  estimates: Array<{ date: string; estimate: number; source: string }>;
  appreciation12mo: number | null;
  appreciation24mo: number | null;
  fetchedAt: string;
}

export interface CityMarketMedian {
  city: string;
  stateCode: string;
  medianListingPrice: number;
  medianByType: Record<string, number>;
}

export interface RegionalMarketData {
  searchCity: string;
  searchState: string;
  medians: CityMarketMedian[];
  avgMedian: number | null;
  fetchedAt: string;
}

export class USRealEstateService extends BaseIntegrationService {
  constructor() {
    super("USRealEstate", 15_000);
  }

  isAvailable(): boolean {
    return !!process.env.RAPIDAPI_KEY;
  }

  async getPropertyValueHistory(propertyId: string): Promise<PropertyValueHistory | null> {
    const key = process.env.RAPIDAPI_KEY;
    if (!key) return null;

    const cacheKey = `usre:detail:${propertyId}`;
    return cache.staleWhileRevalidate<PropertyValueHistory | null>(cacheKey, CACHE_TTL_SECONDS, async () => {
      const url = `https://${RAPIDAPI_HOST}/v3/property-detail?property_id=${encodeURIComponent(propertyId)}`;
      const response = await this.fetchWithTimeout(url, {
        headers: {
          "x-rapidapi-key": key,
          "x-rapidapi-host": RAPIDAPI_HOST,
        },
      });

      const data: PropertyDetailResponse = await response.json();
      const historicalSets = data.data?.estimates?.historical_values;
      if (!historicalSets?.length) {
        this.log(`No value history for property ${propertyId}`);
        return null;
      }

      const allEstimates: Array<{ date: string; estimate: number; source: string }> = [];
      for (const set of historicalSets) {
        for (const est of set.estimates) {
          allEstimates.push({
            date: est.date,
            estimate: est.estimate,
            source: set.source.name,
          });
        }
      }

      allEstimates.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      const latest = allEstimates[0]?.estimate ?? null;

      let appreciation12mo: number | null = null;
      let appreciation24mo: number | null = null;
      const now = new Date();
      const oneYearAgo = new Date(now);
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const twoYearsAgo = new Date(now);
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

      if (latest) {
        const est12 = allEstimates.find((e) => new Date(e.date) <= oneYearAgo);
        const est24 = allEstimates.find((e) => new Date(e.date) <= twoYearsAgo);
        if (est12) appreciation12mo = Math.round(((latest - est12.estimate) / est12.estimate) * 10000) / 100;
        if (est24) appreciation24mo = Math.round(((latest - est24.estimate) / est24.estimate) * 10000) / 100;
      }

      this.log(`Property ${propertyId}: ${allEstimates.length} value estimates, latest $${latest?.toLocaleString()}`);
      return {
        propertyId,
        currentEstimate: latest,
        estimates: allEstimates.slice(0, 60),
        appreciation12mo,
        appreciation24mo,
        fetchedAt: new Date().toISOString(),
      };
    });
  }

  async getRegionalMedians(city: string, stateCode: string): Promise<RegionalMarketData | null> {
    const key = process.env.RAPIDAPI_KEY;
    if (!key) return null;

    const cacheKey = `usre:medians:${city.toLowerCase()}:${stateCode.toUpperCase()}`;
    return cache.staleWhileRevalidate<RegionalMarketData | null>(cacheKey, CACHE_TTL_SECONDS, async () => {
      const qs = new URLSearchParams({
        state_code: stateCode.toUpperCase(),
        city: city,
        limit: "1",
      }).toString();
      const url = `https://${RAPIDAPI_HOST}/v3/for-sale?${qs}`;

      const response = await this.fetchWithTimeout(url, {
        headers: {
          "x-rapidapi-key": key,
          "x-rapidapi-host": RAPIDAPI_HOST,
        },
      });

      const data: ForSaleResponse = await response.json();
      const cities = data.data?.geo?.recommended_cities?.geos ?? [];
      if (!cities.length) {
        this.log(`No median data for ${city}, ${stateCode}`);
        return null;
      }

      const medians: CityMarketMedian[] = cities
        .filter((c) => c.geo_statistics?.housing_market?.median_listing_price)
        .map((c) => {
          const market = c.geo_statistics!.housing_market!;
          const byType: Record<string, number> = {};
          for (const pt of market.by_prop_type ?? []) {
            if (pt.attributes.median_listing_price) {
              byType[pt.type] = pt.attributes.median_listing_price;
            }
          }
          return {
            city: c.city,
            stateCode: c.state_code,
            medianListingPrice: market.median_listing_price!,
            medianByType: byType,
          };
        });

      const avg = medians.length
        ? Math.round(medians.reduce((s, m) => s + m.medianListingPrice, 0) / medians.length)
        : null;

      this.log(`Regional medians for ${city}, ${stateCode}: ${medians.length} cities, avg $${avg?.toLocaleString()}`);
      return {
        searchCity: city,
        searchState: stateCode,
        medians,
        avgMedian: avg,
        fetchedAt: new Date().toISOString(),
      };
    });
  }
}
