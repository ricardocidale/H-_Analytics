/**
 * server/ai/source-health-checker.ts
 *
 * Health-check engine for every data source in the source_registry.
 * Verifies env vars, client initialization, and (for select APIs) reachability.
 * Updates the source_registry row with latency, trust score, and success rate.
 */
import { db } from "../db";
import { sourceRegistry } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { logger } from "../logger";
import { sanitizeError } from "../lib/sanitize-error";

export interface HealthCheckResult {
  serviceKey: string;
  healthy: boolean;
  latencyMs: number;
  error?: string;
  checkedAt: Date;
}

// ---------------------------------------------------------------------------
// Individual source checkers
// ---------------------------------------------------------------------------

function envSet(varName: string): boolean {
  return !!process.env[varName];
}

async function checkLLMProvider(serviceKey: string, envVar: string): Promise<HealthCheckResult> {
  const start = Date.now();
  const checkedAt = new Date();

  if (!envSet(envVar)) {
    return { serviceKey, healthy: false, latencyMs: Date.now() - start, error: "API key not configured", checkedAt };
  }

  try {
    // Attempt lazy client initialization — don't make an actual API call (costs money)
    switch (serviceKey) {
      case "anthropic": {
        const { getAnthropicClient } = await import("./clients");
        getAnthropicClient();
        break;
      }
      case "openai": {
        const { getOpenAIClient } = await import("./clients");
        getOpenAIClient();
        break;
      }
      case "google_ai": {
        const { getGeminiClient } = await import("./clients");
        getGeminiClient();
        break;
      }
      case "perplexity": {
        const { getPerplexityClient } = await import("./clients");
        getPerplexityClient();
        break;
      }
    }
    return { serviceKey, healthy: true, latencyMs: Date.now() - start, checkedAt };
  } catch (err: unknown) {
    return {
      serviceKey,
      healthy: false,
      latencyMs: Date.now() - start,
      error: sanitizeError(err instanceof Error ? err.message : String(err)),
      checkedAt,
    };
  }
}

async function checkFred(): Promise<HealthCheckResult> {
  const start = Date.now();
  const checkedAt = new Date();
  const apiKey = process.env.FRED_API_KEY;

  if (!apiKey) {
    return { serviceKey: "fred", healthy: false, latencyMs: Date.now() - start, error: "API key not configured", checkedAt };
  }

  try {
    const url = `https://api.stlouisfed.org/fred/series?series_id=DFF&api_key=${apiKey}&file_type=json&limit=1`;
    const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      return { serviceKey: "fred", healthy: false, latencyMs: Date.now() - start, error: `HTTP ${res.status}`, checkedAt };
    }
    return { serviceKey: "fred", healthy: true, latencyMs: Date.now() - start, checkedAt };
  } catch (err: unknown) {
    return { serviceKey: "fred", healthy: false, latencyMs: Date.now() - start, error: sanitizeError(err instanceof Error ? err.message : String(err)), checkedAt };
  }
}

async function checkFrankfurter(): Promise<HealthCheckResult> {
  const start = Date.now();
  const checkedAt = new Date();

  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=EUR", {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return { serviceKey: "frankfurter", healthy: false, latencyMs: Date.now() - start, error: `HTTP ${res.status}`, checkedAt };
    }
    return { serviceKey: "frankfurter", healthy: true, latencyMs: Date.now() - start, checkedAt };
  } catch (err: unknown) {
    return { serviceKey: "frankfurter", healthy: false, latencyMs: Date.now() - start, error: sanitizeError(err instanceof Error ? err.message : String(err)), checkedAt };
  }
}

function checkEnvOnly(serviceKey: string, envVar: string): HealthCheckResult {
  const start = Date.now();
  const checkedAt = new Date();
  if (!envSet(envVar)) {
    return { serviceKey, healthy: false, latencyMs: Date.now() - start, error: "API key not configured", checkedAt };
  }
  return { serviceKey, healthy: true, latencyMs: Date.now() - start, checkedAt };
}

let _redisClient: { ping(): Promise<string> } | null = null;

async function checkRedis(): Promise<HealthCheckResult> {
  const start = Date.now();
  const checkedAt = new Date();

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return { serviceKey: "upstash_redis", healthy: false, latencyMs: Date.now() - start, error: "Redis URL or token not configured", checkedAt };
  }

  try {
    if (!_redisClient) {
      const { Redis } = await import("@upstash/redis");
      _redisClient = new Redis({ url, token });
    }
    await _redisClient.ping();
    return { serviceKey: "upstash_redis", healthy: true, latencyMs: Date.now() - start, checkedAt };
  } catch (err: unknown) {
    _redisClient = null; // Reset on failure so next check creates a fresh client
    return { serviceKey: "upstash_redis", healthy: false, latencyMs: Date.now() - start, error: sanitizeError(err instanceof Error ? err.message : String(err)), checkedAt };
  }
}

async function checkHospitalityBenchmarksDB(): Promise<HealthCheckResult> {
  const start = Date.now();
  const checkedAt = new Date();

  try {
    const rows = await db.execute(sql`SELECT count(*)::int AS count FROM hospitality_benchmarks`);
    const count = ((rows.rows ?? [])[0] as { count: number } | undefined)?.count ?? 0;
    if (count > 0) {
      return { serviceKey: "hospitality_benchmarks", healthy: true, latencyMs: Date.now() - start, checkedAt };
    }
    return { serviceKey: "hospitality_benchmarks", healthy: false, latencyMs: Date.now() - start, error: "No benchmark rows found", checkedAt };
  } catch (err: unknown) {
    return { serviceKey: "hospitality_benchmarks", healthy: false, latencyMs: Date.now() - start, error: sanitizeError(err instanceof Error ? err.message : String(err)), checkedAt };
  }
}

async function checkWorldBank(): Promise<HealthCheckResult> {
  const start = Date.now();
  const checkedAt = new Date();

  try {
    const res = await fetch("https://api.worldbank.org/v2/country/US/indicator/NY.GDP.MKTP.CD?format=json&per_page=1", {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return { serviceKey: "world_bank", healthy: false, latencyMs: Date.now() - start, error: `HTTP ${res.status}`, checkedAt };
    }
    return { serviceKey: "world_bank", healthy: true, latencyMs: Date.now() - start, checkedAt };
  } catch (err: unknown) {
    return { serviceKey: "world_bank", healthy: false, latencyMs: Date.now() - start, error: sanitizeError(err instanceof Error ? err.message : String(err)), checkedAt };
  }
}

async function checkOpenExchangeRates(): Promise<HealthCheckResult> {
  const start = Date.now();
  const checkedAt = new Date();
  const appId = process.env.OPEN_EXCHANGE_RATES_APP_ID;

  if (!appId) {
    return { serviceKey: "open_exchange_rates", healthy: false, latencyMs: Date.now() - start, error: "API key not configured", checkedAt };
  }

  try {
    const res = await fetch(`https://openexchangerates.org/api/latest.json?app_id=${appId}&symbols=EUR`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return { serviceKey: "open_exchange_rates", healthy: false, latencyMs: Date.now() - start, error: `HTTP ${res.status}`, checkedAt };
    }
    return { serviceKey: "open_exchange_rates", healthy: true, latencyMs: Date.now() - start, checkedAt };
  } catch (err: unknown) {
    return { serviceKey: "open_exchange_rates", healthy: false, latencyMs: Date.now() - start, error: sanitizeError(err instanceof Error ? err.message : String(err)), checkedAt };
  }
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

const LLM_SOURCES: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "AI_INTEGRATIONS_OPENAI_API_KEY",
  google_ai: "AI_INTEGRATIONS_GEMINI_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
};

const ENV_ONLY_SOURCES: Record<string, string> = {
  tavily: "TAVILY_API_KEY",
  pinecone: "PINECONE_API_KEY",
  resend: "RESEND_API_KEY",
  sentry: "SENTRY_DSN",
  posthog: "POSTHOG_KEY",
  google_maps: "GOOGLE_MAPS_API_KEY",
  walk_score: "WALK_SCORE_API_KEY",
  rapidapi_primary: "RAPIDAPI_KEY",
  rapidapi_secondary: "RAPIDAPI_KEY_2",
  rapidapi_tertiary: "RAPIDAPI_KEY_3",
  costar: "COSTAR_API_KEY",
  replicate: "REPLICATE_API_TOKEN",
  apify: "APIFY_API_TOKEN",
  amadeus: "AMADEUS_CLIENT_ID",
};

export async function checkSourceHealth(serviceKey: string): Promise<HealthCheckResult> {
  let result: HealthCheckResult;

  if (LLM_SOURCES[serviceKey]) {
    result = await checkLLMProvider(serviceKey, LLM_SOURCES[serviceKey]);
  } else if (serviceKey === "fred") {
    result = await checkFred();
  } else if (serviceKey === "frankfurter") {
    result = await checkFrankfurter();
  } else if (serviceKey === "upstash_redis") {
    result = await checkRedis();
  } else if (serviceKey === "hospitality_benchmarks") {
    result = await checkHospitalityBenchmarksDB();
  } else if (serviceKey === "world_bank") {
    result = await checkWorldBank();
  } else if (serviceKey === "open_exchange_rates") {
    result = await checkOpenExchangeRates();
  } else if (ENV_ONLY_SOURCES[serviceKey]) {
    result = checkEnvOnly(serviceKey, ENV_ONLY_SOURCES[serviceKey]);
  } else {
    result = {
      serviceKey,
      healthy: false,
      latencyMs: 0,
      error: `Unknown service key: ${serviceKey}`,
      checkedAt: new Date(),
    };
  }

  // Update source_registry row with EWMA success rate and derived trust score
  try {
    // Trust score derived from the EWMA success rate, not a single check:
    //   ≥ 0.95 → "verified"  |  ≥ 0.70 → "degraded"  |  < 0.70 → "unreliable"
    await db.update(sourceRegistry)
      .set({
        lastHealthCheck: result.checkedAt,
        avgLatencyMs: result.latencyMs,
        successRate: sql`COALESCE(${sourceRegistry.successRate}, 1.0) * 0.9 + ${result.healthy ? 1 : 0} * 0.1`,
        trustScore: sql`CASE
          WHEN COALESCE(${sourceRegistry.successRate}, 1.0) * 0.9 + ${result.healthy ? 1 : 0} * 0.1 >= 0.95 THEN 'verified'
          WHEN COALESCE(${sourceRegistry.successRate}, 1.0) * 0.9 + ${result.healthy ? 1 : 0} * 0.1 >= 0.70 THEN 'degraded'
          ELSE 'unreliable'
        END`,
      })
      .where(eq(sourceRegistry.serviceKey, serviceKey));
  } catch (err: unknown) {
    logger.warn(`Failed to update source_registry for ${serviceKey}: ${err instanceof Error ? err.message : String(err)}`, "health-checker");
  }

  return result;
}

export async function checkAllSources(): Promise<HealthCheckResult[]> {
  const allKeys = [
    ...Object.keys(LLM_SOURCES),
    "fred",
    "frankfurter",
    "world_bank",
    "open_exchange_rates",
    "upstash_redis",
    "hospitality_benchmarks",
    ...Object.keys(ENV_ONLY_SOURCES),
  ];

  const results = await Promise.allSettled(
    allKeys.map(key => checkSourceHealth(key))
  );

  const out: HealthCheckResult[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      out.push(r.value);
    } else {
      out.push({
        serviceKey: "unknown",
        healthy: false,
        latencyMs: 0,
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        checkedAt: new Date(),
      });
    }
  }

  const healthy = out.filter(r => r.healthy).length;
  logger.info(`Health check complete: ${healthy}/${out.length} sources healthy`, "health-checker");

  return out;
}

export async function getHealthySources(category?: string): Promise<string[]> {
  // Only return sources that have been health-checked and passed.
  // 'unverified' (never checked) is excluded — we don't know if they work.
  // 'degraded' (EWMA 0.70-0.95) is included — still usable, just less reliable.
  const rows = await db.select({
    serviceKey: sourceRegistry.serviceKey,
  }).from(sourceRegistry)
    .where(
      category
        ? sql`${sourceRegistry.isActive} = true AND ${sourceRegistry.category} = ${category} AND ${sourceRegistry.trustScore} IN ('verified', 'degraded')`
        : sql`${sourceRegistry.isActive} = true AND ${sourceRegistry.trustScore} IN ('verified', 'degraded')`
    );

  return rows.map(r => r.serviceKey);
}
