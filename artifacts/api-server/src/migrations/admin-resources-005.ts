/**
 * admin-resources-005 — P6f legacy data_sources adapter.
 *
 * Seeds `admin_resources` with two groups of rows:
 *
 *   1. MODEL_SEED_ROWS — one row per LLM model referenced by
 *      HARDCODED_LLM_DEFAULTS and RECOMMENDED_MODEL_SLUGS_BY_ROLE.
 *      These power the LLM Config tab dropdowns and the "Recommended"
 *      badge logic in P6g.
 *
 *   2. SOURCE_SEED_ROWS — one row per entry in the legacy source_registry
 *      seed (server/seeds/source-registry.ts), adapted to admin_resources
 *      kind/slug conventions:
 *        sourceType "api"  → kind "api"
 *        sourceType "llm"  → kind "api"   (provider-level API connection)
 *        sourceType "sdk"  → kind "source"
 *        sourceType "db"   → kind "benchmark"
 *
 * Idempotent — ON CONFLICT (kind, slug) DO NOTHING. Safe to re-run.
 * Exported arrays are imported by tests/proof/admin-resources-seed.test.ts.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] admin-resources-005";

type ResourceKind = "api" | "source" | "model" | "table" | "benchmark" | "llm_slot";

interface SeedRow {
  kind: ResourceKind;
  slug: string;
  displayName: string;
  description: string;
  config: Record<string, unknown>;
}

// ── Model rows ─────────────────────────────────────────────────────────────
// Slugs use hyphens — never periods. The API modelId (with period) lives in
// config.modelId and is used only at the LLM call site.

export const MODEL_SEED_ROWS: SeedRow[] = [
  {
    kind: "model",
    slug: "claude-sonnet-4-6",
    displayName: "Claude Sonnet 4.6",
    description: "Anthropic Claude Sonnet 4.6 — prompt engineer pre-stage, market panel, voice render",
    config: { vendor: "anthropic", modelId: "claude-sonnet-4-6" },
  },
  {
    kind: "model",
    slug: "claude-sonnet-4-5",
    displayName: "Claude Sonnet 4.5",
    description: "Anthropic Claude Sonnet 4.5 — quantitative panel alternative",
    config: { vendor: "anthropic", modelId: "claude-sonnet-4-5" },
  },
  {
    kind: "model",
    slug: "claude-opus-4-7",
    displayName: "Claude Opus 4.7",
    description: "Anthropic Claude Opus 4.7 — synthesis / final verdict (highest accuracy)",
    config: { vendor: "anthropic", modelId: "claude-opus-4-7" },
  },
  {
    kind: "model",
    slug: "claude-opus-4-6",
    displayName: "Claude Opus 4.6",
    description: "Anthropic Claude Opus 4.6 — synthesis tier, strong reasoning + persona discipline",
    config: { vendor: "anthropic", modelId: "claude-opus-4-6" },
  },
  {
    kind: "model",
    slug: "claude-haiku-4-5-20251001",
    displayName: "Claude Haiku 4.5",
    description: "Anthropic Claude Haiku 4.5 — lightweight voice render, N+2 failover (persona-safe)",
    config: { vendor: "anthropic", modelId: "claude-haiku-4-5-20251001" },
  },
  {
    kind: "model",
    slug: "gemini-2-5-pro",
    displayName: "Gemini 2.5 Pro",
    description: "Google Gemini 2.5 Pro — deep research synthesis, large context, strongest Gemini reasoning",
    config: { vendor: "google", modelId: "gemini-2.5-pro" },
  },
  {
    kind: "model",
    slug: "gemini-2-5-flash",
    displayName: "Gemini 2.5 Flash",
    description: "Google Gemini 2.5 Flash — quantitative panel, fast numeric extraction",
    config: { vendor: "google", modelId: "gemini-2.5-flash" },
  },
  // ── OpenAI models ──────────────────────────────────────────────────────────
  {
    kind: "model",
    slug: "gpt-4-1",
    displayName: "GPT-4.1",
    description: "OpenAI GPT-4.1 — general purpose reasoning",
    config: { vendor: "openai", modelId: "gpt-4.1" },
  },
  {
    kind: "model",
    slug: "gpt-4o",
    displayName: "GPT-4o",
    description: "OpenAI GPT-4o — high-capability multimodal model",
    config: { vendor: "openai", modelId: "gpt-4o" },
  },
  {
    kind: "model",
    slug: "gpt-4o-mini",
    displayName: "GPT-4o Mini",
    description: "OpenAI GPT-4o Mini — fast, cost-efficient model for structured tasks",
    config: { vendor: "openai", modelId: "gpt-4o-mini" },
  },
  {
    kind: "model",
    slug: "gpt-image-1",
    displayName: "GPT Image 1",
    description: "OpenAI GPT Image 1 — image generation model",
    config: { vendor: "openai", modelId: "gpt-image-1" },
  },
  // ── Perplexity models ──────────────────────────────────────────────────────
  {
    kind: "model",
    slug: "sonar",
    displayName: "Perplexity Sonar",
    description: "Perplexity Sonar — grounded web search with citations. Replaced by Exa; kept for legacy configurations.",
    config: { vendor: "perplexity", modelId: "sonar" },
  },
  // ── Exa ────────────────────────────────────────────────────────────────────
  {
    kind: "model",
    slug: "exa-search",
    displayName: "Exa Neural Search",
    description: "Exa neural web search — grounded market intelligence and property research. Primary web-search provider replacing Perplexity.",
    config: { vendor: "exa", modelId: "exa-search" },
  },
  // ── Google additional models ───────────────────────────────────────────────
  {
    kind: "model",
    slug: "gemini-2-5-flash-image",
    displayName: "Gemini 2.5 Flash Image",
    description: "Google Gemini 2.5 Flash Image — image generation and enhancement",
    config: { vendor: "google", modelId: "gemini-2.5-flash-image" },
  },
  {
    kind: "model",
    slug: "gemini-2-0-flash",
    displayName: "Gemini 2.0 Flash",
    description: "Google Gemini 2.0 Flash — fast multimodal tasks including URL extraction",
    config: { vendor: "google", modelId: "gemini-2.0-flash" },
  },
];

// ── LLM Slot rows ───────────────────────────────────────────────────────────
// Each row maps a named usage slot to the model slug that should be used at
// runtime. The resolver (ai/llm-config-resolver.ts) reads these at call time
// so admins can swap models without a code deploy.
//
// modelSlug must match a slug in MODEL_SEED_ROWS.

export const LLM_SLOT_SEED_ROWS: SeedRow[] = [
  {
    kind: "llm_slot",
    slug: "vision",
    displayName: "Property Vision (Slide Gen)",
    description: "LLM used to generate the investment vision narrative for property slide decks",
    config: { modelSlug: "claude-opus-4-6" },
  },
  {
    kind: "llm_slot",
    slug: "executive-summary-property",
    displayName: "Executive Summary — Property",
    description: "LLM used for per-property executive summary generation",
    config: { modelSlug: "claude-opus-4-6" },
  },
  {
    kind: "llm_slot",
    slug: "executive-summary-portfolio",
    displayName: "Executive Summary — Portfolio",
    description: "LLM used for portfolio-level executive summary generation",
    config: { modelSlug: "claude-opus-4-6" },
  },
  {
    kind: "llm_slot",
    slug: "risk-brief",
    displayName: "Risk Brief",
    description: "LLM used to generate the investor risk-and-opportunity brief",
    config: { modelSlug: "claude-sonnet-4-5" },
  },
  {
    kind: "llm_slot",
    slug: "icp-intelligence",
    displayName: "ICP Intelligence",
    description: "LLM used for ideal customer profile intelligence analysis",
    config: { modelSlug: "claude-opus-4-6" },
  },
  {
    kind: "llm_slot",
    slug: "image-generation",
    displayName: "Image Generation (Primary)",
    description: "Primary image model — tried first (Gemini). Admin can swap to any image-capable model.",
    config: { modelSlug: "gemini-2-5-flash-image" },
  },
  {
    kind: "llm_slot",
    slug: "image-generation-fallback",
    displayName: "Image Generation (Fallback)",
    description: "Fallback image model used when the primary is unavailable. Defaults to gpt-image-1.",
    config: { modelSlug: "gpt-image-1" },
  },
  {
    kind: "llm_slot",
    slug: "url-extraction",
    displayName: "URL Extraction",
    description: "LLM used to extract structured property data from URLs",
    config: { modelSlug: "gemini-2-0-flash" },
  },
  {
    kind: "llm_slot",
    slug: "grounded-web-research",
    displayName: "Grounded Web Research",
    description: "Provider used for live web research with citations. Default: Exa neural search (exa). Legacy: Perplexity Sonar (sonar).",
    config: { modelSlug: "exa-search" },
  },
  {
    kind: "llm_slot",
    slug: "research-analyst-a",
    displayName: "Research Analyst A (Quant)",
    description: "LLM for the quantitative analyst role in multi-model research orchestration",
    config: { modelSlug: "gemini-2-5-flash" },
  },
  {
    kind: "llm_slot",
    slug: "research-analyst-b",
    displayName: "Research Analyst B (Market)",
    description: "LLM for the market analyst role in multi-model research orchestration",
    config: { modelSlug: "claude-sonnet-4-5" },
  },
  {
    kind: "llm_slot",
    slug: "research-synthesis",
    displayName: "Research Synthesis",
    description: "LLM for the final synthesis / verdict role in multi-model research orchestration",
    config: { modelSlug: "claude-opus-4-6" },
  },
  {
    kind: "llm_slot",
    slug: "analyst-table-refresh",
    displayName: "Analyst Table Refresh",
    description: "LLM used to refresh analyst reference tables (benchmarks, brand data)",
    config: { modelSlug: "gpt-4o-mini" },
  },
  {
    kind: "llm_slot",
    slug: "regen-constants",
    displayName: "Constants Regeneration",
    description: "LLM used to propose regenerated model-constant values backed by research (OpenAI JSON-mode required)",
    config: { modelSlug: "gpt-4-1" },
  },
  {
    kind: "llm_slot",
    slug: "specialist-primary",
    displayName: "Specialist Primary (Synthesis)",
    description: "LLM for the final synthesis verdict across all Specialist panels (funding, revenue, compensation, overhead, company, risk, property-defaults)",
    config: { modelSlug: "claude-opus-4-7" },
  },
  {
    kind: "llm_slot",
    slug: "specialist-quant-panel",
    displayName: "Specialist Quant Panel",
    description: "LLM for the quantitative panel stage across all Specialist types",
    config: { modelSlug: "gemini-2-5-flash" },
  },
  {
    kind: "llm_slot",
    slug: "specialist-market-panel",
    displayName: "Specialist Market Panel",
    description: "LLM for the market intelligence panel stage across all Specialist types",
    config: { modelSlug: "claude-sonnet-4-6" },
  },
  {
    kind: "llm_slot",
    slug: "specialist-prompt-engineer",
    displayName: "Specialist Prompt Engineer",
    description: "LLM for the prompt-engineer pre-stage across all Specialist types",
    config: { modelSlug: "gemini-2-5-flash" },
  },
];

// ── Source / API / Benchmark rows ──────────────────────────────────────────
// Adapted from server/seeds/source-registry.ts.
// Slugs normalize serviceKey underscores to hyphens.

export const SOURCE_SEED_ROWS: SeedRow[] = [
  // Macro economic
  {
    kind: "api",
    slug: "fred",
    displayName: "FRED API",
    description: "Federal Reserve Economic Data — interest rates, inflation (CPI/PPI), and labor metrics. Primary macro assumption source.",
    config: { apiKeyRef: "FRED_API_KEY", endpoint: "https://api.stlouisfed.org/fred/series/observations", rateLimitPerMin: 120 },
  },
  {
    kind: "api",
    slug: "frankfurter",
    displayName: "Frankfurter ECB FX Rates",
    description: "European Central Bank FX rates for USD/COP, USD/MXN, USD/BRL, and 30+ currencies. No API key required.",
    config: { endpoint: "https://api.frankfurter.app/latest", rateLimitPerMin: 60 },
  },
  // AI research providers
  {
    kind: "api",
    slug: "anthropic",
    displayName: "Anthropic Claude",
    description: "Anthropic Claude LLM for research synthesis, Rebecca chat, and agentic analysis.",
    config: { apiKeyRef: "ANTHROPIC_API_KEY", endpoint: "https://api.anthropic.com/v1/messages", rateLimitPerMin: 60 },
  },
  {
    kind: "api",
    slug: "openai",
    displayName: "OpenAI",
    description: "OpenAI GPT models for research cross-validation and secondary analysis.",
    config: { apiKeyRef: "AI_INTEGRATIONS_OPENAI_API_KEY", endpoint: "https://api.openai.com/v1/chat/completions", rateLimitPerMin: 60 },
  },
  {
    kind: "api",
    slug: "google-ai",
    displayName: "Google Gemini",
    description: "Google Gemini models for multi-model research synthesis with large context window.",
    config: { apiKeyRef: "AI_INTEGRATIONS_GEMINI_API_KEY", endpoint: "https://generativelanguage.googleapis.com/v1beta/models", rateLimitPerMin: 60 },
  },
  {
    kind: "api",
    slug: "perplexity",
    displayName: "Perplexity Sonar",
    description: "Perplexity Sonar for grounded web research with source citations. Critical for regulatory lookups.",
    config: { apiKeyRef: "PERPLEXITY_API_KEY", endpoint: "https://api.perplexity.ai/chat/completions", rateLimitPerMin: 20 },
  },
  {
    kind: "api",
    slug: "tavily",
    displayName: "Tavily Search",
    description: "Tavily AI-powered web search for real-time market data and regulatory info. Fallback when Perplexity is unavailable.",
    config: { apiKeyRef: "TAVILY_API_KEY", endpoint: "https://api.tavily.com/search", rateLimitPerMin: 60 },
  },
  // Vector search
  {
    kind: "source",
    slug: "pgvector",
    displayName: "Neon pgvector",
    description: "Neon PostgreSQL with pgvector extension for semantic search across research results and Rebecca RAG knowledge base.",
    config: { apiKeyRef: "DATABASE_URL" },
  },
  // Communication
  {
    kind: "api",
    slug: "resend",
    displayName: "Resend Email",
    description: "Resend transactional email for user invitations, scenario sharing, and Rebecca email delivery.",
    config: { apiKeyRef: "RESEND_API_KEY", endpoint: "https://api.resend.com/emails", rateLimitPerMin: 10 },
  },
  // Observability
  {
    kind: "source",
    slug: "sentry",
    displayName: "Sentry",
    description: "Sentry error tracking and performance monitoring with source maps.",
    config: { apiKeyRef: "SENTRY_DSN" },
  },
  {
    kind: "source",
    slug: "posthog",
    displayName: "PostHog",
    description: "PostHog product analytics for feature usage and A/B testing.",
    config: { apiKeyRef: "POSTHOG_KEY" },
  },
  // Caching
  {
    kind: "source",
    slug: "upstash-redis",
    displayName: "Upstash Redis",
    description: "Upstash serverless Redis for research result caching and rate limiting.",
    config: { apiKeyRef: "UPSTASH_REDIS_REST_URL" },
  },
  // Geospatial
  {
    kind: "api",
    slug: "google-maps",
    displayName: "Google Maps",
    description: "Google Maps Platform for geocoding, distance matrix, and location intelligence.",
    config: { apiKeyRef: "GOOGLE_MAPS_API_KEY", endpoint: "https://maps.googleapis.com/maps/api", rateLimitPerMin: 50 },
  },
  {
    kind: "api",
    slug: "walk-score",
    displayName: "Walk Score",
    description: "Walk Score API for walkability, transit, and bike scores (0–100). Walkable locations command premium ADR.",
    config: { apiKeyRef: "WALK_SCORE_API_KEY", endpoint: "https://api.walkscore.com/score", rateLimitPerMin: 30 },
  },
  // Market data (RapidAPI)
  {
    kind: "api",
    slug: "rapidapi-primary",
    displayName: "RapidAPI Slot 1 (Primary)",
    description: "Primary RapidAPI key — GeoDB Cities, WeatherAPI, CNBC, Realty in US, US Real Estate.",
    config: { apiKeyRef: "RAPIDAPI_KEY", endpoint: "https://rapidapi.com", rateLimitPerMin: 30 },
  },
  {
    kind: "api",
    slug: "rapidapi-secondary",
    displayName: "RapidAPI Slot 2 (Secondary)",
    description: "Secondary RapidAPI key — Booking.com (Api Dojo), Visual Crossing, Realty in US, GeoDB Cities.",
    config: { apiKeyRef: "RAPIDAPI_KEY_2", endpoint: "https://rapidapi.com", rateLimitPerMin: 30 },
  },
  {
    kind: "api",
    slug: "rapidapi-tertiary",
    displayName: "RapidAPI Slot 3 (Tertiary)",
    description: "Tertiary RapidAPI key — Airbnb (InsideBnB), Hotels.com, Google Hotels, Zillow, Skyscanner. Primary for STR comp-set.",
    config: { apiKeyRef: "RAPIDAPI_KEY_3", endpoint: "https://rapidapi.com", rateLimitPerMin: 30 },
  },
  // Hotel pricing
  {
    kind: "api",
    slug: "amadeus",
    displayName: "Amadeus Hotel API",
    description: "Live hotel pricing data across 770K+ properties for comp-set analysis and market rate intelligence.",
    config: { apiKeyRef: "AMADEUS_CLIENT_ID", endpoint: "https://api.amadeus.com", rateLimitPerMin: 10 },
  },
  // Enterprise market data
  {
    kind: "api",
    slug: "costar",
    displayName: "CoStar Analytics",
    description: "CoStar commercial real estate data — hotel comps, cap rates, market analytics. Enterprise tier (subscription required).",
    config: { apiKeyRef: "COSTAR_API_KEY", endpoint: "https://api.costar.com/v1/analytics/market", rateLimitPerMin: 10 },
  },
  // Image generation
  {
    kind: "api",
    slug: "replicate",
    displayName: "Replicate Images",
    description: "Replicate image generation (Flux/SDXL) for AI-powered property renders and investor materials.",
    config: { apiKeyRef: "REPLICATE_API_TOKEN", endpoint: "https://api.replicate.com/v1/predictions", rateLimitPerMin: 10 },
  },
  // Web scraping
  {
    kind: "api",
    slug: "apify",
    displayName: "Apify Scrapers",
    description: "Apify web scrapers for live STR comp-set data from Airbnb, VRBO, Booking.com, and TripAdvisor.",
    config: { apiKeyRef: "APIFY_API_TOKEN", endpoint: "https://api.apify.com/v2/acts", rateLimitPerMin: 20 },
  },
  // Free economic APIs
  {
    kind: "api",
    slug: "world-bank",
    displayName: "World Bank Open Data",
    description: "World Bank country-level economic indicators — GDP, inflation, tourism arrivals, GNI. Free API, essential for international properties.",
    config: { endpoint: "https://api.worldbank.org/v2/country", rateLimitPerMin: 60 },
  },
  {
    kind: "api",
    slug: "open-exchange-rates",
    displayName: "Open Exchange Rates",
    description: "Live USD-based FX rates for portfolio currencies (COP, BRL, ARS, MXN, EUR, CAD). Supplements Frankfurter.",
    config: { apiKeyRef: "OPEN_EXCHANGE_RATES_APP_ID", endpoint: "https://openexchangerates.org/api/latest.json", rateLimitPerMin: 10 },
  },
  // Internal benchmark
  {
    kind: "benchmark",
    slug: "hospitality-benchmarks",
    displayName: "H+ Benchmark DB",
    description: "Internal hospitality benchmarks — ADR, occupancy, RevPAR, cap rates, cost/fee rates, depreciation by country. Seeded from STR, CBRE, HVS, PKF, IRS.",
    config: {},
  },
];

// ── Runner ─────────────────────────────────────────────────────────────────

async function batchInsert(rows: SeedRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const values = sql.join(
    rows.map(
      (r) =>
        sql`(${r.kind}, ${r.slug}, ${r.displayName}, ${r.description}, ${JSON.stringify(r.config)}::jsonb)`,
    ),
    sql`, `,
  );
  const result = await db.execute(sql`
    INSERT INTO admin_resources (kind, slug, display_name, description, config)
    VALUES ${values}
    ON CONFLICT (kind, slug) DO NOTHING
    RETURNING id
  `);
  return Array.isArray(result.rows) ? result.rows.length : 0;
}

export async function runAdminResources005(): Promise<void> {
  const modelsSeeded = await batchInsert(MODEL_SEED_ROWS);
  logger.info(
    `${TAG} model rows: ${modelsSeeded} seeded (${MODEL_SEED_ROWS.length - modelsSeeded} already existed)`,
  );

  const sourcesSeeded = await batchInsert(SOURCE_SEED_ROWS);
  logger.info(
    `${TAG} source/api/benchmark rows: ${sourcesSeeded} seeded (${SOURCE_SEED_ROWS.length - sourcesSeeded} already existed)`,
  );

  const slotsSeeded = await batchInsert(LLM_SLOT_SEED_ROWS);
  logger.info(
    `${TAG} llm_slot rows: ${slotsSeeded} seeded (${LLM_SLOT_SEED_ROWS.length - slotsSeeded} already existed)`,
  );
}
