import { logger } from "../../logger";
import { getMarketIntelligenceAggregator } from "../../services/MarketIntelligenceAggregator";
import {
  fetchMultipleFields,
  getRoutableFields,
  type RoutingContext,
  type DataRouteResult,
} from "../../ai/data-routing";
import { buildPromptInjectionBlock } from "../../ai/research-data-injector";
import {
  conductWebResearch,
  isWebResearchAvailable,
  type WebResearchRequest,
  type WebResearchResult,
} from "../../ai/web-research";

export interface IntelligenceGatherInput {
  type: "property" | "company" | "global";
  propertyId: number | undefined;
  propertyContext: any;
  assetDefinition: any;
}

export interface IntelligenceGatherResult {
  marketIntelligence: any;
  webResearchResults: WebResearchResult[];
  smartRouterResults: Map<string, DataRouteResult>;
  smartRouterInjection: string;
}

/**
 * Runs the parallel market-intelligence + standalone web-research fetch and
 * the smart data router in a non-blocking, best-effort fashion. All errors
 * are logged but never thrown — callers receive whatever data was available.
 */
export async function gatherIntelligence(
  input: IntelligenceGatherInput,
): Promise<IntelligenceGatherResult> {
  const { type, propertyId, propertyContext, assetDefinition } = input;

  let marketIntelligence: any;
  let webResearchResults: WebResearchResult[] = [];

  try {
    const aggregator = getMarketIntelligenceAggregator();

    // Build web research request from property context (runs in parallel with MI)
    const webResearchRequest: WebResearchRequest | null =
      isWebResearchAvailable() && propertyContext?.location
        ? {
            propertyContext: {
              name: propertyContext.name || "Property",
              location:
                propertyContext.location || propertyContext.market || "",
              qualityTier: propertyContext.qualityTier,
              roomCount: propertyContext.roomCount,
              businessModel: propertyContext.businessModel,
            },
            researchType: "market_adr",
            country: propertyContext.country,
          }
        : null;

    const [miResult, wrResult] = await Promise.allSettled([
      aggregator.gather({
        location: propertyContext?.location || propertyContext?.market,
        propertyType: assetDefinition?.level || "boutique hotel",
        propertyId: propertyId || undefined,
      }),
      webResearchRequest
        ? conductWebResearch(webResearchRequest)
        : Promise.resolve([]),
    ]);

    if (miResult.status === "fulfilled") {
      marketIntelligence = miResult.value;
    } else {
      logger.warn(
        `Market intelligence fetch failed (non-blocking): ${miResult.reason}`,
        "research",
      );
    }

    if (wrResult.status === "fulfilled") {
      webResearchResults = wrResult.value;
    } else {
      logger.warn(
        `Web research failed (non-blocking): ${wrResult.reason}`,
        "research",
      );
    }
  } catch (err: unknown) {
    logger.warn(
      `Market intelligence / web research fetch failed (non-blocking): ${err instanceof Error ? err.message : err}`,
      "research",
    );
  }

  // ── Smart Data Router: targeted field-level data gathering ──────────
  // Runs in parallel with (or after) the shotgun MI aggregator.
  // Fetches ONLY the specific services needed for each assumption field,
  // with progressive relaxation if exact matches return nothing.
  let smartRouterResults: Map<string, DataRouteResult> = new Map();
  let smartRouterInjection = "";
  try {
    if (type === "property" && propertyContext) {
      const routingCtx: RoutingContext = {
        location: propertyContext.location || propertyContext.market,
        city: propertyContext.location?.split(",")[0]?.trim(),
        state: undefined,
        country: propertyContext.country,
        qualityTier: propertyContext.qualityTier,
        businessModel: propertyContext.businessModel,
        roomCount: propertyContext.roomCount,
        latitude: undefined,
        longitude: undefined,
        propertyType: assetDefinition?.level || "boutique hotel",
        propertyId: propertyId || undefined,
      };

      // Try to extract state from location string (e.g., "Catskills, NY" -> "NY")
      if (propertyContext.location) {
        const parts = propertyContext.location
          .split(",")
          .map((s: string) => s.trim());
        if (parts.length >= 2) {
          routingCtx.state = parts[parts.length - 1];
        }
      }

      // Fetch targeted data for all routable assumption fields
      const fieldsToFetch = getRoutableFields();
      smartRouterResults = await fetchMultipleFields(fieldsToFetch, routingCtx);

      // Build the prompt injection block
      smartRouterInjection = buildPromptInjectionBlock(
        smartRouterResults,
        fieldsToFetch,
      );

      if (smartRouterResults.size > 0) {
        logger.info(
          `Smart data router: ${smartRouterResults.size} fields verified for property research`,
          "research",
        );
      }
    }
  } catch (err: unknown) {
    logger.warn(
      `Smart data router failed (non-blocking, falling back to MI aggregator): ${err instanceof Error ? err.message : err}`,
      "research",
    );
  }

  return {
    marketIntelligence,
    webResearchResults,
    smartRouterResults,
    smartRouterInjection,
  };
}
