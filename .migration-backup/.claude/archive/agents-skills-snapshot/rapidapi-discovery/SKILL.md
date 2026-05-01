---
name: rapidapi-discovery
description: Search and evaluate RapidAPI marketplace APIs when a feature request could benefit from external data. Use when building features that need market data, competitive analysis, economic indicators, travel/tourism stats, property valuations, company enrichment, review aggregation, or any external dataset. Triggers on rapidapi, external api, market data, third-party data, api marketplace, data source, property search api, travel api, economic data api.
---

# RapidAPI Discovery

## When to Use

Check RapidAPI **before** building stubs or asking the user for data sources whenever a feature involves:

| Scenario | Example APIs |
|----------|-------------|
| **Real estate / property search** | Realty in US, Zillow, Realtor |
| **Market data & benchmarking** | STR/hotel market data, OTA rate shoppers |
| **Economic indicators** | Trading Economics, FRED, World Bank |
| **Travel & tourism statistics** | Skyscanner, Booking.com, TripAdvisor |
| **Company enrichment** | Crunchbase, LinkedIn, company data APIs |
| **Review aggregation** | Google Reviews, TripAdvisor Reviews, Yelp |
| **Geospatial & location data** | Google Places alternatives, POI databases |
| **Weather & climate** | Visual Crossing, OpenWeatherMap |
| **Demographics & census** | US Census, population data APIs |
| **Currency & exchange rates** | Exchange Rates, currency conversion |

If the feature does **not** need external data, skip this skill entirely.

## How to Search RapidAPI

1. Go to [rapidapi.com/hub](https://rapidapi.com/hub) and search by keyword
2. Filter by: **Free** tier available, **Popularity** (high), **Latency** (low)
3. Check the API's test endpoint in the browser to verify response format and data quality
4. Read reviews and check the "API Health" score on the listing page

## Evaluation Criteria

Before recommending or integrating any RapidAPI, evaluate against these criteria:

| Criterion | What to Check | Minimum Bar |
|-----------|--------------|-------------|
| **Free tier** | Monthly request limit on the Basic/Free plan | ≥ 100 requests/month for dev; paid tier reasonable for production |
| **Rate limits** | Requests per second / minute | Must support at least 1 req/sec |
| **Data freshness** | How often the data updates | Appropriate for the use case (real-time for rates, daily for market data) |
| **Response format** | JSON structure, consistency, field coverage | Clean JSON with documented fields; no HTML scraping artifacts |
| **Reliability** | Uptime, API Health score, last-updated date | Health score ≥ 80%, updated within last 6 months |
| **Documentation** | Endpoint docs, example responses | Must have working examples for all endpoints we'd use |
| **Pricing trajectory** | Cost at 1K, 10K, 100K requests/month | No surprise pricing cliffs |

**Red flags to reject an API:**
- No free tier and no way to test before subscribing
- Last updated > 12 months ago
- Health score < 60%
- Response contains HTML or inconsistent JSON structures
- Required fields frequently null/empty in test responses

## Integration Pattern

The Property Finder feature (`server/routes/property-finder.ts`, `client/src/pages/PropertyFinder.tsx`) is designed around the **Realty in US** RapidAPI. The route currently returns a 501 stub for search until the `RAPIDAPI_KEY` secret is configured and the fetch logic is wired up. It demonstrates the correct error-handling and UI patterns (501 response, setup banner) that all new RapidAPI integrations must follow. The integration file structure and fetch patterns below define the standard for new APIs.

### Header Format

Every RapidAPI call uses two required headers:

```typescript
const headers = {
  'x-rapidapi-key': process.env.RAPIDAPI_KEY,
  'x-rapidapi-host': 'api-host-from-rapidapi.p.rapidapi.com'
};
```

### Environment Variable Convention

| Variable | Purpose |
|----------|---------|
| `RAPIDAPI_KEY` | Single shared API key for all RapidAPI subscriptions (already established) |

The same `RAPIDAPI_KEY` works across all subscribed APIs — only the `x-rapidapi-host` header changes per API. No need for separate keys per API.

### Server Integration File Structure

Create a dedicated integration file per API. Follow the project's existing patterns: AI clients in `server/ai/clients.ts` use a lazy-singleton factory (created once on first use, reused thereafter). For RapidAPI integrations, use the same approach — a module-scoped client instance initialized on first call:

```
server/integrations/rapidapi-{api-name}.ts   — API client, types, fetch functions
server/routes/{feature}.ts                    — Express routes (thin, delegates to integration)
```

**Integration file template:**

```typescript
import { log } from "../logger";

const API_HOST = "{api-name}.p.rapidapi.com";

function getHeaders(): Record<string, string> {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) {
    throw new Error("RapidAPI key not configured. Add RAPIDAPI_KEY to Secrets.");
  }
  return {
    "x-rapidapi-key": key,
    "x-rapidapi-host": API_HOST,
  };
}

interface SearchResult {
  // typed per API response
}

export async function searchEndpoint(params: Record<string, string>): Promise<SearchResult[]> {
  const url = new URL(`https://${API_HOST}/endpoint`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: getHeaders(),
  });

  if (!response.ok) {
    const text = await response.text();
    log(`RapidAPI ${API_HOST} error ${response.status}: ${text}`, "rapidapi");
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json() as Promise<SearchResult[]>;
}
```

### Route Pattern

```typescript
app.get("/api/{feature}/search", requireAuth, async (req, res) => {
  try {
    const results = await searchEndpoint(req.query as Record<string, string>);
    res.json(results);
  } catch (error) {
    if (error instanceof Error && error.message.includes("RapidAPI key not configured")) {
      return res.status(501).json({
        error: "RapidAPI key not configured",
        message: "This feature requires a RapidAPI subscription. See admin settings.",
        results: [],
      });
    }
    logAndSendError(res, "Search failed", error);
  }
});
```

### Error Handling & Graceful Degradation

1. **Missing API key** → Return 501 with clear setup instructions (not a 500)
2. **API rate limit hit** → Return 429 with retry-after guidance
3. **API down / timeout** → Return 503 with fallback message; never crash the server
4. **Bad response data** → Log the raw response, return a sanitized error to the client
5. **Client UI** → Show an informative banner (see `PropertyFinder.tsx` `isNoApiKey` pattern) explaining the setup steps

### Frontend Pattern

When the API key is missing, display a setup banner like Property Finder does:

```tsx
{isNoApiKey && (
  <div className="bg-card rounded-lg shadow-sm border border-border p-6">
    <h3 className="font-semibold">API Key Required</h3>
    <p className="text-sm text-muted-foreground">
      Subscribe to the "{API Name}" API on RapidAPI (free tier available),
      then add your <code>RAPIDAPI_KEY</code> in the Secrets tab.
    </p>
  </div>
)}
```

## Adding a New RapidAPI Subscription

Step-by-step for the developer (or to instruct the user):

1. Find the API on [rapidapi.com](https://rapidapi.com)
2. Subscribe to the **Free** or **Basic** plan
3. The API is automatically available via the existing `RAPIDAPI_KEY` — no new secret needed
4. Create the integration file at `server/integrations/rapidapi-{name}.ts`
5. Add routes in `server/routes/{feature}.ts`
6. Update the `integrations-infrastructure` skill with the new API entry
7. Add the `x-rapidapi-host` value to the integration file

## Hospitality-Relevant API Categories

Curated categories most likely to benefit the HBG Portal:

### Tier 1 — High Value for Current Product

| Category | Example APIs on RapidAPI | Use Case in HBG Portal |
|----------|------------------------|----------------------|
| **Real Estate** | Realty in US *(Property Finder is wired to use this)*, Zillow, Realtor | Property Finder, acquisition pipeline |
| **Hotel Market Data** | Booking.com, Hotels.com | Competitive rate benchmarking, market positioning |
| **Reviews & Ratings** | Google Maps Reviews, TripAdvisor | Competitive landscape, reputation monitoring |
| **Economic Data** | Trading Economics, Alpha Vantage | Market research reports, investment thesis support |

### Tier 2 — Medium Value for Roadmap Features

| Category | Example APIs on RapidAPI | Use Case in HBG Portal |
|----------|------------------------|----------------------|
| **Travel & Tourism** | Skyscanner, Amadeus | Tourism demand forecasting, airlift analysis |
| **Demographics** | US Census, Population data | Market sizing for property locations |
| **Weather** | Visual Crossing, WeatherAPI | Seasonality modeling, climate risk assessment |
| **Company Data** | Crunchbase, LinkedIn | Investor/partner research, management company analysis |

### Tier 3 — Future / Niche

| Category | Example APIs on RapidAPI | Use Case in HBG Portal |
|----------|------------------------|----------------------|
| **Currency** | Exchange Rates API | International investor reporting |
| **News & Media** | News API, Google News | Market sentiment, press monitoring |
| **Social Media** | Instagram, Twitter | Marketing channel analysis, brand monitoring |
| **Construction** | Building permit APIs | Development feasibility, renovation cost estimation |

## Cross-References

| Skill | Relationship |
|-------|-------------|
| `integrations-infrastructure` | Add new RapidAPI entries to the Integration File Map table when integrating a new API |
| `marcela-ai-system` | New data APIs can feed into Marcela's research pipeline as server tools |
| `hbg-product-vision` | API selection should align with the hospitality-native vocabulary and product direction |

## Decision Checklist

Before integrating a new RapidAPI, confirm:

- [ ] Does this API solve a real feature need (not speculative)?
- [ ] Is there a free tier sufficient for development and testing?
- [ ] Is the API health score ≥ 80% and recently updated?
- [ ] Does the response format map cleanly to our data model?
- [ ] Have you tested the key endpoints with real parameters?
- [ ] Is graceful degradation implemented (missing key, API down, rate limits)?
- [ ] Is the `integrations-infrastructure` skill updated with the new entry?
