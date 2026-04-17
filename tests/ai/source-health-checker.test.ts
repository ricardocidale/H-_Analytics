/**
 * Tests for server/ai/source-health-checker.ts
 *
 * All external dependencies (DB, fetch, env vars, dynamic imports) are mocked
 * so these run without any real API calls or database connections.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock db module — must come before importing the module under test
// ---------------------------------------------------------------------------
const mockDbExecute = vi.fn();
const mockDbUpdate = vi.fn();
const mockSelectWhere = vi.fn().mockResolvedValue([]);
const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
const mockDbSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });

vi.mock("../../server/db", () => ({
  db: {
    execute: (...args: unknown[]) => mockDbExecute(...args),
    update: (...args: unknown[]) => {
      mockDbUpdate(...args);
      return {
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      };
    },
    select: (...args: unknown[]) => mockDbSelect(...args),
  },
}));

vi.mock("../../server/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@shared/schema", () => ({
  sourceRegistry: {
    serviceKey: "service_key",
    isActive: "is_active",
    category: "category",
    trustScore: "trust_score",
    successRate: "success_rate",
    avgLatencyMs: "avg_latency_ms",
    lastHealthCheck: "last_health_check",
  },
  hospitalityBenchmarks: {},
}));

const mockGetHospitalityBenchmarks = vi.fn().mockResolvedValue([]);
const mockGetHealthySourceKeys = vi.fn().mockResolvedValue([]);

vi.mock("../../server/storage", () => ({
  storage: {
    getHospitalityBenchmarks: (...args: unknown[]) => mockGetHospitalityBenchmarks(...args),
    getHealthySourceKeys: (...args: unknown[]) => mockGetHealthySourceKeys(...args),
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: unknown, val: unknown) => ({ op: "eq", val })),
  sql: (() => {
    const tagged = (strings: TemplateStringsArray, ..._values: unknown[]) =>
      strings.join("?");
    return tagged;
  })(),
}));

// ---------------------------------------------------------------------------
// Import module under test AFTER mocks are set up
// ---------------------------------------------------------------------------
import {
  checkSourceHealth,
  checkAllSources,
  getHealthySources,
} from "../../server/ai/source-health-checker";
import type { HealthCheckResult } from "../../server/ai/source-health-checker";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const savedEnv = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  // Re-establish the select chain after clearAllMocks
  mockSelectWhere.mockResolvedValue([]);
  mockSelectFrom.mockReturnValue({ where: mockSelectWhere });
  mockDbSelect.mockReturnValue({ from: mockSelectFrom });
  // Ensure the DB update mock always resolves (used by every checkSourceHealth call)
  mockDbUpdate.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  });
});

afterEach(() => {
  process.env = { ...savedEnv };
  vi.restoreAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════
// checkSourceHealth
// ═══════════════════════════════════════════════════════════════════════════

describe("checkSourceHealth", () => {
  // 1. env var present → healthy
  it("returns healthy=true when the env var is present (env-only source)", async () => {
    process.env.TAVILY_API_KEY = "test-key-123";
    const result = await checkSourceHealth("tavily");

    expect(result.serviceKey).toBe("tavily");
    expect(result.healthy).toBe(true);
    expect(result.error).toBeUndefined();
  });

  // 2. env var missing → healthy=false
  it("returns healthy=false with 'not configured' when env var is missing", async () => {
    delete process.env.TAVILY_API_KEY;
    const result = await checkSourceHealth("tavily");

    expect(result.serviceKey).toBe("tavily");
    expect(result.healthy).toBe(false);
    expect(result.error).toMatch(/not configured/i);
  });

  // 3. hospitality_benchmarks — DB count > 0 → healthy
  it("returns healthy=true for hospitality_benchmarks when DB has rows", async () => {
    mockGetHospitalityBenchmarks.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const result = await checkSourceHealth("hospitality_benchmarks");

    expect(result.serviceKey).toBe("hospitality_benchmarks");
    expect(result.healthy).toBe(true);
  });

  // 3b. hospitality_benchmarks — DB count = 0 → unhealthy
  it("returns healthy=false for hospitality_benchmarks when DB is empty", async () => {
    mockGetHospitalityBenchmarks.mockResolvedValue([]);
    const result = await checkSourceHealth("hospitality_benchmarks");

    expect(result.serviceKey).toBe("hospitality_benchmarks");
    expect(result.healthy).toBe(false);
    expect(result.error).toMatch(/no benchmark/i);
  });

  // 4. frankfurter — mock fetch to succeed → healthy
  it("returns healthy=true for frankfurter when fetch succeeds", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ rates: { EUR: 0.92 } }), { status: 200 }),
    );

    const result = await checkSourceHealth("frankfurter");

    expect(result.serviceKey).toBe("frankfurter");
    expect(result.healthy).toBe(true);
    expect(fetchSpy).toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  // 5. fetch timeout → healthy=false, latencyMs > 0
  it("returns healthy=false when fetch rejects (timeout)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("The operation was aborted"),
    );

    const result = await checkSourceHealth("frankfurter");

    expect(result.healthy).toBe(false);
    expect(result.error).toMatch(/aborted/i);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);

    fetchSpy.mockRestore();
  });

  // 9. latencyMs is measured
  it("returns latencyMs >= 0 on successful env-only checks", async () => {
    process.env.RESEND_API_KEY = "re_test_latency";
    const result = await checkSourceHealth("resend");

    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(typeof result.latencyMs).toBe("number");
  });

  // 10. checkedAt is set
  it("sets checkedAt to a valid Date", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const before = new Date();
    const result = await checkSourceHealth("resend");
    const after = new Date();

    expect(result.checkedAt).toBeInstanceOf(Date);
    expect(result.checkedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(result.checkedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  // Unknown service
  it("returns healthy=false for an unknown service key", async () => {
    const result = await checkSourceHealth("nonexistent_service");

    expect(result.healthy).toBe(false);
    expect(result.error).toMatch(/unknown service key/i);
  });

  // FRED with missing key
  it("returns healthy=false for fred when FRED_API_KEY is missing", async () => {
    delete process.env.FRED_API_KEY;
    const result = await checkSourceHealth("fred");

    expect(result.serviceKey).toBe("fred");
    expect(result.healthy).toBe(false);
    expect(result.error).toMatch(/not configured/i);
  });

  // FRED with key present and successful fetch
  it("returns healthy=true for fred when API key is set and fetch succeeds", async () => {
    process.env.FRED_API_KEY = "test-fred-key";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ seriess: [] }), { status: 200 }),
    );

    const result = await checkSourceHealth("fred");

    expect(result.serviceKey).toBe("fred");
    expect(result.healthy).toBe(true);

    fetchSpy.mockRestore();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// checkAllSources
// ═══════════════════════════════════════════════════════════════════════════

describe("checkAllSources", () => {
  // 6. returns array of HealthCheckResult
  it("returns an array of HealthCheckResult objects", async () => {
    // Set a few env vars so some pass
    process.env.ANTHROPIC_API_KEY = "sk-test";
    process.env.TAVILY_API_KEY = "tvly-test";
    // Mock fetch for frankfurter/fred
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 200 }),
    );
    // Mock storage for hospitality_benchmarks
    mockGetHospitalityBenchmarks.mockResolvedValue([{ id: 1 }]);

    // Mock LLM client imports to avoid real module loading
    vi.doMock("../../server/ai/clients", () => ({
      getAnthropicClient: vi.fn(),
      getOpenAIClient: vi.fn(),
      getGeminiClient: vi.fn(),
      getPerplexityClient: vi.fn(),
    }));

    const results = await checkAllSources();

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);

    // Every item matches the HealthCheckResult shape
    for (const r of results) {
      expect(r).toHaveProperty("serviceKey");
      expect(r).toHaveProperty("healthy");
      expect(r).toHaveProperty("latencyMs");
      expect(r).toHaveProperty("checkedAt");
      expect(typeof r.serviceKey).toBe("string");
      expect(typeof r.healthy).toBe("boolean");
      expect(typeof r.latencyMs).toBe("number");
    }

    fetchSpy.mockRestore();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// getHealthySources
// ═══════════════════════════════════════════════════════════════════════════

describe("getHealthySources", () => {
  // 7. filters correctly — returns only active, non-unreliable sources
  it("returns service keys from DB rows", async () => {
    mockGetHealthySourceKeys.mockResolvedValue(["fred", "frankfurter", "anthropic"]);

    const keys = await getHealthySources();

    expect(keys).toEqual(["fred", "frankfurter", "anthropic"]);
  });

  // 8. category filter
  it("returns only sources matching a category filter", async () => {
    mockGetHealthySourceKeys.mockResolvedValue(["fred"]);

    const keys = await getHealthySources("macro_economic");

    expect(keys).toEqual(["fred"]);
  });

  // empty result
  it("returns empty array when no healthy sources exist", async () => {
    mockGetHealthySourceKeys.mockResolvedValue([]);

    const keys = await getHealthySources();

    expect(keys).toEqual([]);
  });
});
