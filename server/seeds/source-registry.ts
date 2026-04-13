import { db } from "../db";
import { sourceRegistry } from "@shared/schema";
import { eq } from "drizzle-orm";
import { logger } from "../logger";

interface SourceSeed {
  serviceKey: string;
  name: string;
  sourceType: "api" | "llm" | "sdk" | "db";
  category: string;
  endpoint: string | null;
  apiKeyRef: string | null;
  rateLimitPerMin: number | null;
  isActive: boolean;
  description: string;
}

const SOURCE_SEEDS: SourceSeed[] = [
  // ── Macro Economic Data ──────────────────────────────────────────────────
  {
    serviceKey: "fred",
    name: "FRED API",
    sourceType: "api",
    category: "macro_economic",
    endpoint: "https://api.stlouisfed.org/fred/series/observations",
    apiKeyRef: "FRED_API_KEY",
    rateLimitPerMin: 120,
    isActive: true,
    description: "Federal Reserve Economic Data — interest rates (SOFR, Treasuries, Fed Funds), inflation (CPI, PPI), and labor metrics (unemployment). Primary source for all macro assumptions in financial models.",
  },
  {
    serviceKey: "frankfurter",
    name: "Frankfurter ECB FX Rates",
    sourceType: "api",
    category: "fx_rates",
    endpoint: "https://api.frankfurter.app/latest",
    apiKeyRef: null,
    rateLimitPerMin: 60,
    isActive: true,
    description: "European Central Bank foreign-exchange rates for USD/COP, USD/MXN, USD/BRL, and 30+ currencies. No API key required. Used to convert international property financials to USD.",
  },

  // ── AI Research Providers ────────────────────────────────────────────────
  {
    serviceKey: "anthropic",
    name: "Anthropic Claude",
    sourceType: "llm",
    category: "ai_research",
    endpoint: "https://api.anthropic.com/v1/messages",
    apiKeyRef: "ANTHROPIC_API_KEY",
    rateLimitPerMin: 60,
    isActive: true,
    description: "Anthropic Claude LLM for research synthesis, Rebecca chat, and agentic analysis. Primary model for financial reasoning and multi-step research workflows.",
  },
  {
    serviceKey: "openai",
    name: "OpenAI",
    sourceType: "llm",
    category: "ai_research",
    endpoint: "https://api.openai.com/v1/chat/completions",
    apiKeyRef: "AI_INTEGRATIONS_OPENAI_API_KEY",
    rateLimitPerMin: 60,
    isActive: true,
    description: "OpenAI GPT models for research cross-validation and secondary analysis. Used for multi-model consensus on market data and risk assessments.",
  },
  {
    serviceKey: "google_ai",
    name: "Google Gemini",
    sourceType: "llm",
    category: "ai_research",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models",
    apiKeyRef: "AI_INTEGRATIONS_GEMINI_API_KEY",
    rateLimitPerMin: 60,
    isActive: true,
    description: "Google Gemini models for multi-model research synthesis. Primary research provider with strong grounding capabilities and large context window.",
  },
  {
    serviceKey: "perplexity",
    name: "Perplexity Sonar",
    sourceType: "llm",
    category: "web_research",
    endpoint: "https://api.perplexity.ai/chat/completions",
    apiKeyRef: "PERPLEXITY_API_KEY",
    rateLimitPerMin: 20,
    isActive: true,
    description: "Perplexity Sonar for grounded web research with source citations. Returns real-time web data with provenance — critical for regulatory lookups and market news.",
  },
  {
    serviceKey: "tavily",
    name: "Tavily Search",
    sourceType: "api",
    category: "web_research",
    endpoint: "https://api.tavily.com/search",
    apiKeyRef: "TAVILY_API_KEY",
    rateLimitPerMin: 60,
    isActive: true,
    description: "Tavily AI-powered web search for real-time market data and regulatory info. Fallback grounded search when Perplexity is unavailable or rate-limited.",
  },

  // ── Vector Search ────────────────────────────────────────────────────────
  {
    serviceKey: "pinecone",
    name: "Pinecone Vector DB",
    sourceType: "sdk",
    category: "vector_search",
    endpoint: "https://api.pinecone.io",
    apiKeyRef: "PINECONE_API_KEY",
    rateLimitPerMin: 100,
    isActive: true,
    description: "Pinecone vector database for property profiles, benchmark embeddings, and Rebecca RAG knowledge base. Enables semantic search across research results and historical analyses.",
  },

  // ── Communication ────────────────────────────────────────────────────────
  {
    serviceKey: "resend",
    name: "Resend Email",
    sourceType: "api",
    category: "communication",
    endpoint: "https://api.resend.com/emails",
    apiKeyRef: "RESEND_API_KEY",
    rateLimitPerMin: 10,
    isActive: true,
    description: "Resend transactional email service for user invitations, scenario sharing, and Rebecca email delivery. Supports branded HTML templates.",
  },

  // ── Observability ────────────────────────────────────────────────────────
  {
    serviceKey: "sentry",
    name: "Sentry",
    sourceType: "sdk",
    category: "observability",
    endpoint: "https://sentry.io",
    apiKeyRef: "SENTRY_DSN",
    rateLimitPerMin: null,
    isActive: true,
    description: "Sentry error tracking and performance monitoring. Captures frontend and backend exceptions with source maps for rapid debugging.",
  },
  {
    serviceKey: "posthog",
    name: "PostHog",
    sourceType: "sdk",
    category: "observability",
    endpoint: "https://app.posthog.com",
    apiKeyRef: "POSTHOG_KEY",
    rateLimitPerMin: null,
    isActive: true,
    description: "PostHog product analytics for feature usage, research engine engagement, and user behavior tracking. Powers feature flags and A/B testing.",
  },

  // ── Caching ──────────────────────────────────────────────────────────────
  {
    serviceKey: "upstash_redis",
    name: "Upstash Redis",
    sourceType: "sdk",
    category: "caching",
    endpoint: null,
    apiKeyRef: "UPSTASH_REDIS_REST_URL",
    rateLimitPerMin: null,
    isActive: true,
    description: "Upstash serverless Redis for caching research results, FRED data, comp-set scrapes, and rate limiting. Provides stale-while-revalidate pattern for all external API data.",
  },

  // ── Geospatial ───────────────────────────────────────────────────────────
  {
    serviceKey: "google_maps",
    name: "Google Maps",
    sourceType: "api",
    category: "geospatial",
    endpoint: "https://maps.googleapis.com/maps/api",
    apiKeyRef: "GOOGLE_MAPS_API_KEY",
    rateLimitPerMin: 50,
    isActive: true,
    description: "Google Maps Platform for geocoding, distance matrix, and location intelligence. Provides lat/lng for Walk Score, nearby amenities, and property finder map views.",
  },
  {
    serviceKey: "walk_score",
    name: "Walk Score",
    sourceType: "api",
    category: "geospatial",
    endpoint: "https://api.walkscore.com/score",
    apiKeyRef: "WALK_SCORE_API_KEY",
    rateLimitPerMin: 30,
    isActive: true,
    description: "Walk Score API for walkability, transit, and bike scores (0-100) by property location. Walkable areas command premium ADR — a key location quality signal for hospitality research.",
  },

  // ── Market Data (RapidAPI) ───────────────────────────────────────────────
  {
    serviceKey: "rapidapi_primary",
    name: "RapidAPI Slot 1 (Primary)",
    sourceType: "api",
    category: "market_data",
    endpoint: "https://rapidapi.com",
    apiKeyRef: "RAPIDAPI_KEY",
    rateLimitPerMin: 30,
    isActive: true,
    description: "Primary RapidAPI key — subscribed to GeoDB Cities, WeatherAPI, CNBC, Realty in US, US Real Estate. Routes to weather, real estate comps, and news headline APIs.",
  },
  {
    serviceKey: "rapidapi_secondary",
    name: "RapidAPI Slot 2 (Secondary)",
    sourceType: "api",
    category: "market_data",
    endpoint: "https://rapidapi.com",
    apiKeyRef: "RAPIDAPI_KEY_2",
    rateLimitPerMin: 30,
    isActive: true,
    description: "Secondary RapidAPI key — subscribed to Booking.com (Api Dojo), Visual Crossing, Realty in US, US Real Estate, GeoDB Cities, WeatherAPI, CNBC. Primary key for Booking.com hotel searches.",
  },
  {
    serviceKey: "rapidapi_tertiary",
    name: "RapidAPI Slot 3 (Tertiary)",
    sourceType: "api",
    category: "market_data",
    endpoint: "https://rapidapi.com",
    apiKeyRef: "RAPIDAPI_KEY_3",
    rateLimitPerMin: 30,
    isActive: true,
    description: "Tertiary RapidAPI key — subscribed to Airbnb (InsideBnB), Hotels.com, Google Hotels, Google Maps Reviews, Zillow, Alpha Vantage, Skyscanner, Realtor Search. Primary key for STR comp-set scraping.",
  },

  // ── Hotel Pricing Data ──────────────────────────────────────────────────
  {
    serviceKey: "amadeus",
    name: "Amadeus Hotel API",
    sourceType: "api",
    category: "market_data",
    endpoint: "https://api.amadeus.com",
    apiKeyRef: "AMADEUS_CLIENT_ID",
    rateLimitPerMin: 10,
    isActive: true,
    description: "Live hotel pricing data across 770K+ properties. Free tier: 2-10K req/month. Provides comp-set analysis and market rate intelligence for competitive positioning.",
  },

  // ── Enterprise Market Data (aspirational — code exists, not yet subscribed) ──
  {
    serviceKey: "costar",
    name: "CoStar Analytics",
    sourceType: "api",
    category: "market_data",
    endpoint: "https://api.costar.com/v1/analytics/market",
    apiKeyRef: "COSTAR_API_KEY",
    rateLimitPerMin: 10,
    isActive: false,
    description: "CoStar commercial real estate data — hotel comps, cap rates, market analytics. Enterprise API (not yet subscribed). Service code ready in CoStarService.ts; will activate when subscription obtained.",
  },

  // ── Image Generation ─────────────────────────────────────────────────────
  {
    serviceKey: "replicate",
    name: "Replicate Images",
    sourceType: "api",
    category: "image_gen",
    endpoint: "https://api.replicate.com/v1/predictions",
    apiKeyRef: "REPLICATE_API_TOKEN",
    rateLimitPerMin: 10,
    isActive: true,
    description: "Replicate image generation for AI-powered property renders and investor materials. Uses Flux/SDXL models via HTTP API (no SDK needed).",
  },

  // ── Web Scraping ─────────────────────────────────────────────────────────
  {
    serviceKey: "apify",
    name: "Apify Scrapers",
    sourceType: "api",
    category: "scraping",
    endpoint: "https://api.apify.com/v2/acts",
    apiKeyRef: "APIFY_API_TOKEN",
    rateLimitPerMin: 20,
    isActive: true,
    description: "Apify web scrapers for live STR comp-set data from Airbnb, VRBO, Booking.com, and TripAdvisor. Runs sync actor jobs returning pricing, ratings, and listing details for competitive analysis.",
  },

  // ── Free Economic APIs ───────────────────────────────────────────────────
  {
    serviceKey: "world_bank",
    name: "World Bank Open Data",
    sourceType: "api",
    category: "macro_economic",
    endpoint: "https://api.worldbank.org/v2/country",
    apiKeyRef: null,
    rateLimitPerMin: 60,
    isActive: true,
    description: "World Bank country-level economic indicators — GDP growth, inflation, tourism arrivals, unemployment, GNI per capita. Free API, no key required. Essential for underwriting international hospitality properties.",
  },
  {
    serviceKey: "open_exchange_rates",
    name: "Open Exchange Rates",
    sourceType: "api",
    category: "fx_rates",
    endpoint: "https://openexchangerates.org/api/latest.json",
    apiKeyRef: "OPEN_EXCHANGE_RATES_APP_ID",
    rateLimitPerMin: 10,
    isActive: true,
    description: "Live USD-based FX rates for portfolio currencies (COP, BRL, ARS, MXN, EUR, CAD). Supplements Frankfurter with broader currency coverage including ARS and PAB.",
  },

  // ── Internal ─────────────────────────────────────────────────────────────
  {
    serviceKey: "hospitality_benchmarks",
    name: "H+ Benchmark DB",
    sourceType: "db",
    category: "benchmarks",
    endpoint: null,
    apiKeyRef: null,
    rateLimitPerMin: null,
    isActive: true,
    description: "Internal hospitality benchmarks table — ADR, occupancy, RevPAR, cap rates, cost rates, fee rates, and depreciation schedules by country. Seeded from industry reports (STR, CBRE, HVS, PKF, IRS).",
  },
];

export async function seedSourceRegistry(): Promise<void> {
  logger.info(`Seeding source registry (${SOURCE_SEEDS.length} sources)...`, "seed");

  let inserted = 0;
  let skipped = 0;

  for (const seed of SOURCE_SEEDS) {
    const [existing] = await db
      .select({ id: sourceRegistry.id })
      .from(sourceRegistry)
      .where(eq(sourceRegistry.serviceKey, seed.serviceKey))
      .limit(1);

    if (existing) {
      skipped++;
      continue;
    }

    await db.insert(sourceRegistry).values({
      serviceKey: seed.serviceKey,
      name: seed.name,
      sourceType: seed.sourceType,
      category: seed.category,
      endpoint: seed.endpoint,
      apiKeyRef: seed.apiKeyRef,
      rateLimitPerMin: seed.rateLimitPerMin,
      isActive: seed.isActive,
      description: seed.description,
      trustScore: "unverified",
      successRate: null,
      avgLatencyMs: null,
      costPerCall: null,
      dataProvided: null,
    } as typeof sourceRegistry.$inferInsert);

    inserted++;
  }

  logger.info(`Source registry seed complete: ${inserted} inserted, ${skipped} already existed`, "seed");
}
