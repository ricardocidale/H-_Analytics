/**
 * Grounded research dispatcher + the field-specific query builder used to
 * shape web-search prompts.
 */
import type { DispatchHandler, RelaxedContext, RoutingContext } from "./_shared";

interface GroundedResearchInstance {
  search: (queries: Array<{ query: string; focusSites?: string[] }>) => Promise<Array<{
    query: string;
    answer?: unknown;
    sources: unknown[];
  }>>;
}

const groundedResearch: DispatchHandler = async (_serviceKey, field, rCtx, ctx, svc) => {
  if (!rCtx.location) return null;
  const gr = svc.instance as GroundedResearchInstance;
  const queries = buildFieldSpecificQuery(field, rCtx, ctx);
  if (!queries.length) return null;

  const results = await gr.search(queries);
  if (!results.length || !results[0].answer) return null;

  return {
    value: null,
    provenance: `Web research: "${results[0].query}" — ${results[0].sources.length} sources, L${rCtx.level}`,
  };
};

export const handlers: Record<string, DispatchHandler> = {
  "grounded-research": groundedResearch,
};

/** Build field-specific search queries for grounded research */
export function buildFieldSpecificQuery(
  field: string,
  rCtx: RelaxedContext,
  ctx: RoutingContext,
): Array<{ query: string; focusSites?: string[] }> {
  const loc = rCtx.location || rCtx.city || rCtx.state || rCtx.country || "";
  const tier = rCtx.qualityTier || ctx.qualityTier || "boutique hotel";

  const hospitalitySites = ["str.com", "costar.com", "hotelnewsnow.com", "hospitalitynet.org", "hvs.com"];

  const queryMap: Record<string, Array<{ query: string; focusSites?: string[] }>> = {
    revShareFB: [{ query: `F&B revenue as percentage of total hotel revenue ${tier} ${loc}`, focusSites: hospitalitySites }],
    revShareEvents: [{ query: `event venue revenue share boutique hotel ${loc}`, focusSites: hospitalitySites }],
    costRateAdmin: [{ query: `hotel administrative and general expenses as percentage of revenue ${tier} ${loc}`, focusSites: hospitalitySites }],
    costRateMarketing: [{ query: `hotel marketing expenses percentage of revenue ${tier}`, focusSites: hospitalitySites }],
    baseFeePercent: [{ query: `hotel management company base fee percentage ${tier}`, focusSites: ["hvs.com", "hospitalitynet.org"] }],
    staffCompensation: [{ query: `hospitality industry average hourly wage ${loc}`, focusSites: ["bls.gov", "indeed.com"] }],
    hotelTaxRate: [{ query: `hotel occupancy tax rate ${loc}` }],
    avgTicketFB: [{ query: `average food and beverage spend per guest hotel ${loc}` }],
    distanceToAirport: [{ query: `nearest airport to ${loc} distance` }],
    propertyValue: [{ query: `commercial property values ${loc}` }],
  };

  return queryMap[field] || [{ query: `${field} benchmark ${tier} hotel ${loc}`, focusSites: hospitalitySites }];
}
