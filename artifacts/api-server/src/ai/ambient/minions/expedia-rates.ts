/**
 * MinionExpediaRates — competitor hotel rate snapshots via Apify Expedia scraper.
 *
 * Same markets and check-in cadence as MinionBookingRates; source = "expedia".
 * Uses the Apify actor API to trigger a run and poll for results.
 */
import { db } from "../../../db";
import { competitorRates, type InsertCompetitorRate } from "@workspace/db";
import { logger } from "../../../logger";
import type { MinionResult } from "./index";

const TAG = "[minion:expedia-rates]";

const APIFY_BASE_URL = "https://api.apify.com/v2";
const EXPEDIA_ACTOR_ID = "crawlerbros~expedia-hotels-scraper";
const APIFY_RUN_TIMEOUT_MS = 60_000;
const APIFY_POLL_INTERVAL_MS = 5_000;
const APIFY_MAX_POLLS = 10;

const COMPETITOR_MARKETS = [
  "Miami, FL",
  "New York, NY",
  "Denver, CO",
  "Los Angeles, CA",
  "Chicago, IL",
] as const;

const NIGHTS_TO_FETCH = 2;
// getDay() returns 0=Sunday … 5=Friday … 6=Saturday
const FRIDAY_DAY_OF_WEEK = 5;
const EXPEDIA_MAX_RESULTS_PER_MARKET = 20;

function nextFriday(): Date {
  const now = new Date();
  const day = now.getDay();
  const daysUntilFriday = day <= FRIDAY_DAY_OF_WEEK ? FRIDAY_DAY_OF_WEEK - day : 7 - day + FRIDAY_DAY_OF_WEEK;
  const friday = new Date(now);
  friday.setDate(now.getDate() + (daysUntilFriday === 0 ? 7 : daysUntilFriday));
  return friday;
}

function toIsoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

interface ApifyRunResponse {
  data?: { id?: string; status?: string };
}

interface ApifyDatasetItem {
  location?: string;
  price?: number;
  totalPrice?: number;
}

async function triggerApifyRun(
  market: string,
  apiKey: string,
  checkIn: string,
  checkOut: string,
): Promise<string> {
  const response = await fetch(
    `${APIFY_BASE_URL}/acts/${EXPEDIA_ACTOR_ID}/runs?token=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: market,
        checkIn,
        checkOut,
        adults: 2,
        rooms: 1,
        maxResults: EXPEDIA_MAX_RESULTS_PER_MARKET,
      }),
      signal: AbortSignal.timeout(APIFY_RUN_TIMEOUT_MS),
    },
  );
  if (!response.ok) throw new Error(`HTTP ${response.status} starting run`);
  const data = (await response.json()) as ApifyRunResponse;
  const runId = data.data?.id;
  if (!runId) throw new Error("No runId in Apify response");
  return runId;
}

async function pollApifyRun(runId: string, apiKey: string): Promise<ApifyDatasetItem[]> {
  for (let poll = 0; poll < APIFY_MAX_POLLS; poll++) {
    await new Promise(r => setTimeout(r, APIFY_POLL_INTERVAL_MS));

    const statusRes = await fetch(
      `${APIFY_BASE_URL}/actor-runs/${runId}?token=${apiKey}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!statusRes.ok) continue;

    const status = (await statusRes.json()) as ApifyRunResponse;
    if (status.data?.status !== "SUCCEEDED") continue;

    const dataRes = await fetch(
      `${APIFY_BASE_URL}/actor-runs/${runId}/dataset/items?token=${apiKey}&clean=true`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!dataRes.ok) throw new Error(`HTTP ${dataRes.status} fetching dataset`);
    return (await dataRes.json()) as ApifyDatasetItem[];
  }
  throw new Error(`Run ${runId} did not complete within polling window`);
}

function averagePrice(items: ApifyDatasetItem[]): number | null {
  const prices = items
    .map(i => i.totalPrice ?? i.price)
    .filter((p): p is number => typeof p === "number" && p > 0);
  if (prices.length === 0) return null;
  return prices.reduce((sum, p) => sum + p, 0) / prices.length;
}

export async function runMinionExpediaRates(): Promise<MinionResult> {
  const t0 = Date.now();
  const apiKey = process.env.APIFY_API_TOKEN;
  if (!apiKey) {
    logger.warn(`${TAG} APIFY_API_TOKEN not set — skipping`);
    return { source: "expedia-rates", rowsUpserted: 0, rowsFailed: 0, errors: ["APIFY_API_TOKEN not set — skipping"], durationMs: Date.now() - t0 };
  }

  const friday = nextFriday();
  const sunday = new Date(friday);
  sunday.setDate(friday.getDate() + NIGHTS_TO_FETCH);
  const checkIn = toIsoDate(friday);
  const checkOut = toIsoDate(sunday);

  let rowsUpserted = 0;
  const errors: string[] = [];

  // Apify runs are expensive — execute markets sequentially to control rate.
  for (const market of COMPETITOR_MARKETS) {
    try {
      const runId = await triggerApifyRun(market, apiKey, checkIn, checkOut);
      const items = await pollApifyRun(runId, apiKey);
      const avgRate = averagePrice(items);
      if (avgRate === null) continue;

      const row: InsertCompetitorRate = {
        market,
        propertyCategory: "hotel",
        checkInDate: checkIn,
        avgRate,
        currency: "USD",
        source: "expedia",
        fetchedAt: new Date(),
      };

      await db.insert(competitorRates)
        .values(row)
        .onConflictDoNothing();
      rowsUpserted++;
    } catch (err: unknown) {
      errors.push(`${market}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const durationMs = Date.now() - t0;
  if (errors.length > 0) {
    logger.warn(`${TAG} ${rowsUpserted} upserted, ${errors.length} errors (${durationMs}ms)`);
  } else {
    logger.info(`${TAG} ${rowsUpserted} upserted (${durationMs}ms)`);
  }

  return { source: "expedia-rates", rowsUpserted, rowsFailed: errors.length, errors, durationMs };
}
