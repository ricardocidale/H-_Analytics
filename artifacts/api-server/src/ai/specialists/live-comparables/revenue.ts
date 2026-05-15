/**
 * live-comparables/revenue.ts — Revenue specialist comparables (NAI-33).
 *
 * Canned core (STR Host / CBRE Hotel Horizons F&B + ancillary revenue mix)
 * enriched with a live cross-reference composite row when ≥ N Wikipedia /
 * CNBC sources respond.
 */

import { logger } from "../../../logger";
import {
  getCannedRevenueComparables,
  type RevenueComparableRow,
} from "../mgmt-co-revenue-orchestrator-adapter";
import { getFactoryNumber } from "@shared/model-constants-registry";
import { LIVE_MIN_REVENUE_LIVE_ROWS } from "../../../constants";
import {
  CHANNEL,
  fetchWikipediaSummary,
  fetchCNBCHeadlines,
} from "./shared";

const DEFAULT_MARKETING_RATE_BENCHMARK_MID       = getFactoryNumber("benchmarkRevMarketingRateMid");
const DEFAULT_FB_REVENUE_SHARE_BENCHMARK_MID     = getFactoryNumber("benchmarkRevFbRevenueShareMid");
const DEFAULT_EVENTS_REVENUE_SHARE_BENCHMARK_MID = getFactoryNumber("benchmarkRevEventsRevenueShareMid");
const DEFAULT_OTHER_REVENUE_SHARE_BENCHMARK_MID  = getFactoryNumber("benchmarkRevOtherRevenueShareMid");
const DEFAULT_CATERING_BOOST_PCT_BENCHMARK_MID   = getFactoryNumber("benchmarkRevCateringBoostPctMid");

// ────────────────────────────────────────────────────────────────────────────
// Revenue comparables — NAI-33

/**
 * NAI-33: Revenue mix comparables for the Revenue specialist.
 *
 * Live sources (tried in parallel, each independently fault-tolerant):
 *   1. Wikipedia "Hotel_food_and_beverage" — F&B share benchmark context.
 *   2. Wikipedia "Revenue_management" — hospitality revenue-mix methodology.
 *   3. CNBC autocomplete (RapidAPI KEY_3) — recent boutique hotel F&B news.
 *
 * If ≥ LIVE_MIN_REVENUE_LIVE_ROWS sources respond, prepends one "live
 * cross-reference" composite row (values = benchmark MIDs; source string
 * cites fetch date + live URLs/headlines). Falls back to full canned set.
 */
export async function getRevenueComparables(): Promise<readonly RevenueComparableRow[]> {
  const canned = getCannedRevenueComparables();
  const today  = new Date().toISOString().slice(0, 10);

  const [wikiHotelFnBResult, wikiRevMgmtResult, cnbcResult] = await Promise.allSettled([
    fetchWikipediaSummary("Hotel_food_and_beverage"),
    fetchWikipediaSummary("Revenue_management"),
    fetchCNBCHeadlines("boutique hotel food beverage revenue mix percentage"),
  ]);

  const liveSources: string[] = [];
  if (wikiHotelFnBResult.status === "fulfilled" && wikiHotelFnBResult.value) {
    liveSources.push(
      "Wikipedia: Hotel food and beverage (en.wikipedia.org/wiki/Hotel_food_and_beverage)",
    );
  }
  if (wikiRevMgmtResult.status === "fulfilled" && wikiRevMgmtResult.value) {
    liveSources.push(
      "Wikipedia: Revenue management (en.wikipedia.org/wiki/Revenue_management)",
    );
  }
  if (cnbcResult.status === "fulfilled" && cnbcResult.value.length > 0) {
    liveSources.push(`CNBC News (cnbc.p.rapidapi.com): "${cnbcResult.value[0]}"`);
  }

  logger.info(
    `getRevenueComparables: ${liveSources.length} live sources reached`,
    CHANNEL,
  );

  if (liveSources.length < LIVE_MIN_REVENUE_LIVE_ROWS) {
    return canned;
  }

  const liveRow: RevenueComparableRow = {
    property:              "Boutique-Luxury US Composite (live cross-reference)",
    city:                  "US Market",
    country:               "US",
    vertical:              "boutique-luxury",
    roomCount:             0,  // composite — not property-specific
    marketingRateFraction: DEFAULT_MARKETING_RATE_BENCHMARK_MID,
    fbShareFraction:       DEFAULT_FB_REVENUE_SHARE_BENCHMARK_MID,
    eventsShareFraction:   DEFAULT_EVENTS_REVENUE_SHARE_BENCHMARK_MID,
    otherShareFraction:    DEFAULT_OTHER_REVENUE_SHARE_BENCHMARK_MID,
    cateringBoostFraction: DEFAULT_CATERING_BOOST_PCT_BENCHMARK_MID,
    year:                  new Date().getFullYear(),
    source: `Live (${today}) | ${liveSources.join(" | ")}`,
  };

  return [liveRow, ...canned];
}
