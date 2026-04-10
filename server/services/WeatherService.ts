/**
 * WeatherService — Location weather data via WeatherAPI.com (RapidAPI).
 *
 * Weather affects hospitality occupancy and ADR seasonality. This service
 * provides current conditions, 7-day forecast, and historical monthly averages
 * to give the research AI seasonal demand context.
 *
 * Host: weatherapi-com.p.rapidapi.com (RAPIDAPI_KEY)
 * Docs: https://www.weatherapi.com/docs/
 *
 * Endpoints used:
 *   /forecast.json  — current + 7-day forecast (temp, precip, UV, humidity)
 *   /history.json   — historical day (used for seasonal monthly averages)
 *
 * Cache TTL:
 *   Forecast: 6 hours (weather changes meaningfully over 6h)
 *   Monthly averages: 30 days (stable seasonal patterns)
 */

import { BaseIntegrationService } from "./BaseIntegrationService";
import { cache } from "../cache";
import { rapidApiHeaders, isRapidApiAvailable } from "./rapidApiKeyRouter";
import type { WeatherData } from "../../shared/market-intelligence";

const HOST = "weatherapi-com.p.rapidapi.com";
const BASE_URL = `https://${HOST}`;
const FORECAST_TTL = 6 * 60 * 60;
const SEASONAL_TTL = 30 * 24 * 60 * 60;

export class WeatherService extends BaseIntegrationService {
  constructor() {
    super("WeatherAPI", 15_000);
  }

  isAvailable(): boolean {
    return isRapidApiAvailable("primary");
  }

  async fetchWeatherData(location: string): Promise<WeatherData | null> {
    if (!this.isAvailable()) return null;

    const cacheKey = `weather:forecast:${location.toLowerCase().replace(/\s+/g, "-")}`;
    return cache.staleWhileRevalidate<WeatherData | null>(
      cacheKey,
      FORECAST_TTL,
      () => this.fetchFresh(location)
    );
  }

  private async fetchFresh(location: string): Promise<WeatherData | null> {
    try {
      const url = `${BASE_URL}/forecast.json?` + new URLSearchParams({
        q:      location,
        days:   "7",
        aqi:    "no",
        alerts: "no",
      });

      const response = await this.fetchWithTimeout(url, {
        headers: rapidApiHeaders(HOST, "primary"),
      });
      const data = await response.json();

      if (!data?.current) return null;

      const current = data.current;
      const forecast: any[] = data.forecast?.forecastday ?? [];

      return {
        location:    data.location?.name ?? location,
        country:     data.location?.country,
        current: {
          tempC:       current.temp_c,
          tempF:       current.temp_f,
          condition:   current.condition?.text ?? "",
          humidity:    current.humidity,
          precipMm:    current.precip_mm,
          uvIndex:     current.uv,
          windKph:     current.wind_kph,
          feelsLikeC:  current.feelslike_c,
        },
        forecast: forecast.map(day => ({
          date:        day.date,
          maxTempC:    day.day?.maxtemp_c,
          minTempC:    day.day?.mintemp_c,
          avgTempC:    day.day?.avgtemp_c,
          totalPrecipMm: day.day?.totalprecip_mm,
          condition:   day.day?.condition?.text ?? "",
          uvIndex:     day.day?.uv,
          chanceOfRain: day.day?.daily_chance_of_rain,
        })),
        fetchedAt: new Date().toISOString(),
      };
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : String(err);
      this.warn(`Failed to fetch weather for "${location}": ${detail}`);
      return null;
    }
  }

  /** Fetch average conditions for a specific month (1-12) using a historical date. */
  async fetchMonthlyAverage(location: string, month: number): Promise<{ avgTempC: number; avgPrecipMm: number } | null> {
    if (!this.isAvailable()) return null;

    const cacheKey = `weather:monthly:${location.toLowerCase()}:m${month}`;
    return cache.staleWhileRevalidate(cacheKey, SEASONAL_TTL, async () => {
      try {
        // Use same month last year as proxy for seasonal average
        const year = new Date().getFullYear() - 1;
        const date = `${year}-${String(month).padStart(2, "0")}-15`;
        const url = `${BASE_URL}/history.json?` + new URLSearchParams({ q: location, dt: date });

        const response = await this.fetchWithTimeout(url, {
          headers: rapidApiHeaders(HOST, "primary"),
        });
        const data = await response.json();
        const day = data?.forecast?.forecastday?.[0]?.day;
        if (!day) return null;

        return { avgTempC: day.avgtemp_c, avgPrecipMm: day.totalprecip_mm };
      } catch {
        return null;
      }
    });
  }
}
