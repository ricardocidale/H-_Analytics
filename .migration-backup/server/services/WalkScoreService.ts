/**
 * WalkScoreService — Walkability, transit, and bike scores per property.
 *
 * Walk Score provides location quality scores that directly correlate with
 * hospitality demand (walkable areas command premium ADR, attract more guests).
 *
 * Scores returned (0–100):
 *   Walk Score  — pedestrian friendliness
 *   Transit Score — public transit access
 *   Bike Score  — bikeability
 *
 * Free tier: 5,000 requests/day (requires free registration).
 * Env: WALK_SCORE_API_KEY
 * Docs: https://www.walkscore.com/professional/api.php
 *
 * Note: Walk Score is property-level, not market-level.
 * It is NOT added to MarketIntelligenceAggregator.
 * Instead it is fetched on-demand via GET /api/properties/:id/walk-score.
 * Cache TTL: 30 days — scores change only when neighborhood infrastructure changes.
 */

import { BaseIntegrationService } from "./BaseIntegrationService";
import { cache } from "../cache";
import type { WalkScoreData } from "../../shared/market-intelligence";

const BASE_URL = "https://api.walkscore.com/score";
const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export class WalkScoreService extends BaseIntegrationService {
  private readonly apiKey: string | undefined;

  constructor() {
    super("WalkScore", 10_000);
    this.apiKey = process.env.WALK_SCORE_API_KEY;
  }

  isAvailable(): boolean {
    return !!this.apiKey;
  }

  async fetchScores(params: {
    address: string;
    lat: number;
    lng: number;
    propertyId: number;
  }): Promise<WalkScoreData | null> {
    if (!this.apiKey) return null;

    const cacheKey = `walkscore:property:${params.propertyId}`;
    return cache.staleWhileRevalidate<WalkScoreData | null>(
      cacheKey,
      CACHE_TTL_SECONDS,
      () => this.fetchFresh(params)
    );
  }

  private async fetchFresh(params: {
    address: string;
    lat: number;
    lng: number;
  }): Promise<WalkScoreData | null> {
    try {
      const query = new URLSearchParams({
        format: "json",
        address: params.address,
        lat: params.lat.toString(),
        lon: params.lng.toString(),
        wsapikey: this.apiKey!,
        transit: "1",
        bike: "1",
      });

      const response = await this.fetchWithTimeout(`${BASE_URL}?${query}`);
      const data = await response.json();

      if (data.status !== 1 && data.status !== 2) {
        this.warn(`Walk Score API returned status ${data.status} for ${params.address}`);
        return null;
      }

      return {
        walkScore:    data.walkscore ?? null,
        walkDesc:     data.description ?? null,
        transitScore: data.transit?.score ?? null,
        transitDesc:  data.transit?.description ?? null,
        bikeScore:    data.bike?.score ?? null,
        bikeDesc:     data.bike?.description ?? null,
        wsUrl:        data.ws_link ?? null,
        fetchedAt:    new Date().toISOString(),
      };
    } catch (err: unknown) {
      this.warn(`Failed to fetch Walk Score for ${params.address}`, err);
      return null;
    }
  }
}
