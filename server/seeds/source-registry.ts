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
  {
    serviceKey: "fred",
    name: "FRED API",
    sourceType: "api",
    category: "macro_economic",
    endpoint: "https://api.stlouisfed.org/fred",
    apiKeyRef: "FRED_API_KEY",
    rateLimitPerMin: 120,
    isActive: true,
    description: "Federal Reserve Economic Data — interest rates, inflation, labor metrics.",
  },
  {
    serviceKey: "frankfurter",
    name: "Frankfurter ECB FX Rates",
    sourceType: "api",
    category: "fx_rates",
    endpoint: "https://api.frankfurter.app",
    apiKeyRef: null,
    rateLimitPerMin: 60,
    isActive: true,
    description: "European Central Bank foreign-exchange rates. No API key required.",
  },
  {
    serviceKey: "anthropic",
    name: "Anthropic Claude",
    sourceType: "llm",
    category: "ai_research",
    endpoint: "https://api.anthropic.com",
    apiKeyRef: "ANTHROPIC_API_KEY",
    rateLimitPerMin: 60,
    isActive: true,
    description: "Anthropic Claude LLM for research synthesis, Rebecca chat, and agentic analysis.",
  },
  {
    serviceKey: "openai",
    name: "OpenAI",
    sourceType: "llm",
    category: "ai_research",
    endpoint: "https://api.openai.com",
    apiKeyRef: "AI_INTEGRATIONS_OPENAI_API_KEY",
    rateLimitPerMin: 60,
    isActive: true,
    description: "OpenAI GPT models for research cross-validation and secondary analysis.",
  },
  {
    serviceKey: "google_ai",
    name: "Google Gemini",
    sourceType: "llm",
    category: "ai_research",
    endpoint: "https://generativelanguage.googleapis.com",
    apiKeyRef: "AI_INTEGRATIONS_GEMINI_API_KEY",
    rateLimitPerMin: 60,
    isActive: true,
    description: "Google Gemini models for multi-model research synthesis.",
  },
  {
    serviceKey: "perplexity",
    name: "Perplexity Sonar",
    sourceType: "llm",
    category: "web_research",
    endpoint: "https://api.perplexity.ai",
    apiKeyRef: "PERPLEXITY_API_KEY",
    rateLimitPerMin: 20,
    isActive: true,
    description: "Perplexity Sonar for grounded web research with source citations.",
  },
  {
    serviceKey: "tavily",
    name: "Tavily Search",
    sourceType: "api",
    category: "web_research",
    endpoint: "https://api.tavily.com",
    apiKeyRef: "TAVILY_API_KEY",
    rateLimitPerMin: 60,
    isActive: true,
    description: "Tavily AI-powered web search for real-time market data and regulatory info.",
  },
  {
    serviceKey: "pinecone",
    name: "Pinecone Vector DB",
    sourceType: "sdk",
    category: "vector_search",
    endpoint: "https://api.pinecone.io",
    apiKeyRef: "PINECONE_API_KEY",
    rateLimitPerMin: 100,
    isActive: true,
    description: "Pinecone vector database for property profiles, benchmarks, and Rebecca RAG.",
  },
  {
    serviceKey: "resend",
    name: "Resend Email",
    sourceType: "api",
    category: "communication",
    endpoint: "https://api.resend.com",
    apiKeyRef: "RESEND_API_KEY",
    rateLimitPerMin: 10,
    isActive: true,
    description: "Resend transactional email service for invitations and Rebecca email delivery.",
  },
  {
    serviceKey: "sentry",
    name: "Sentry",
    sourceType: "sdk",
    category: "observability",
    endpoint: "https://sentry.io",
    apiKeyRef: "SENTRY_DSN",
    rateLimitPerMin: null,
    isActive: true,
    description: "Sentry error tracking and performance monitoring.",
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
    description: "PostHog product analytics for feature usage and user behavior tracking.",
  },
  {
    serviceKey: "upstash_redis",
    name: "Upstash Redis",
    sourceType: "sdk",
    category: "caching",
    endpoint: null,
    apiKeyRef: "UPSTASH_REDIS_REST_URL",
    rateLimitPerMin: null,
    isActive: true,
    description: "Upstash serverless Redis for caching research results and rate limiting.",
  },
  {
    serviceKey: "google_maps",
    name: "Google Maps",
    sourceType: "api",
    category: "geospatial",
    endpoint: "https://maps.googleapis.com",
    apiKeyRef: "GOOGLE_MAPS_API_KEY",
    rateLimitPerMin: 50,
    isActive: true,
    description: "Google Maps Platform for geocoding, distance, and location intelligence.",
  },
  {
    serviceKey: "walk_score",
    name: "Walk Score",
    sourceType: "api",
    category: "geospatial",
    endpoint: "https://api.walkscore.com",
    apiKeyRef: "WALK_SCORE_API_KEY",
    rateLimitPerMin: 30,
    isActive: true,
    description: "Walk Score API for walkability, transit, and bike scores by location.",
  },
  {
    serviceKey: "rapidapi_primary",
    name: "RapidAPI Slot 1",
    sourceType: "api",
    category: "market_data",
    endpoint: "https://rapidapi.com",
    apiKeyRef: "RAPIDAPI_KEY",
    rateLimitPerMin: 30,
    isActive: true,
    description: "Primary RapidAPI key for hotel comps, real estate, and market data APIs.",
  },
  {
    serviceKey: "rapidapi_secondary",
    name: "RapidAPI Slot 2",
    sourceType: "api",
    category: "market_data",
    endpoint: "https://rapidapi.com",
    apiKeyRef: "RAPIDAPI_KEY_2",
    rateLimitPerMin: 30,
    isActive: true,
    description: "Secondary RapidAPI key for overflow and rate-limit rotation.",
  },
  {
    serviceKey: "rapidapi_tertiary",
    name: "RapidAPI Slot 3",
    sourceType: "api",
    category: "market_data",
    endpoint: "https://rapidapi.com",
    apiKeyRef: "RAPIDAPI_KEY_3",
    rateLimitPerMin: 30,
    isActive: true,
    description: "Tertiary RapidAPI key for additional rate-limit headroom.",
  },
  {
    serviceKey: "costar",
    name: "CoStar Analytics",
    sourceType: "api",
    category: "market_data",
    endpoint: "https://api.costar.com",
    apiKeyRef: "COSTAR_API_KEY",
    rateLimitPerMin: 10,
    isActive: true,
    description: "CoStar commercial real estate data — hotel comps, cap rates, market analytics.",
  },
  {
    serviceKey: "replicate",
    name: "Replicate Images",
    sourceType: "api",
    category: "image_gen",
    endpoint: "https://api.replicate.com",
    apiKeyRef: "REPLICATE_API_TOKEN",
    rateLimitPerMin: 10,
    isActive: true,
    description: "Replicate image generation for property renders and investor materials.",
  },
  {
    serviceKey: "apify",
    name: "Apify Scrapers",
    sourceType: "api",
    category: "scraping",
    endpoint: "https://api.apify.com",
    apiKeyRef: "APIFY_API_TOKEN",
    rateLimitPerMin: 20,
    isActive: true,
    description: "Apify web scrapers for regulatory filings, comp set data, and public records.",
  },
  {
    serviceKey: "hospitality_benchmarks",
    name: "H+ Benchmark DB",
    sourceType: "db",
    category: "benchmarks",
    endpoint: null,
    apiKeyRef: null,
    rateLimitPerMin: null,
    isActive: true,
    description: "Internal hospitality benchmarks table — ADR, occupancy, cap rates, cost rates.",
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
