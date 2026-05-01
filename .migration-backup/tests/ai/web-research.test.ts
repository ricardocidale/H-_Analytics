/**
 * Tests for server/ai/web-research.ts
 *
 * All external calls (Perplexity, Tavily, source-health-checker) are mocked.
 * No real API calls are made.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — set up BEFORE importing module under test
// ---------------------------------------------------------------------------

const mockPerplexityCreate = vi.fn();

vi.mock("../../server/ai/clients", () => ({
  getPerplexityClient: () => ({
    chat: {
      completions: {
        create: mockPerplexityCreate,
      },
    },
  }),
}));

vi.mock("../../server/ai/source-health-checker", () => ({
  getHealthySources: vi.fn().mockResolvedValue(["perplexity", "tavily"]),
}));

vi.mock("../../server/middleware/cost-logger", () => ({
  logApiCost: vi.fn(),
  estimateCost: vi.fn().mockReturnValue(0.002),
}));

vi.mock("../../server/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// We need to mock global fetch for Tavily
const mockFetch = vi.fn();

import {
  searchWithPerplexity,
  searchWithTavily,
  conductWebResearch,
  isWebResearchAvailable,
  type WebResearchRequest,
} from "../../server/ai/web-research";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(overrides: Partial<WebResearchRequest> = {}): WebResearchRequest {
  return {
    propertyContext: {
      name: "Casa Wellness",
      location: "Medellin, Colombia",
      qualityTier: "luxury",
      roomCount: 8,
      businessModel: "hotel",
    },
    researchType: "market_adr",
    country: "CO",
    ...overrides,
  };
}

function perplexityResponse(content: string, citations: string[] = []) {
  return {
    choices: [{ message: { content } }],
    citations,
    search_results: citations.map((url) => ({
      url,
      title: `Source: ${url}`,
      snippet: `Data from ${url}`,
    })),
  };
}

function tavilyResponse(answer: string, results: Array<{ url: string; title: string; content: string; score?: number }> = []) {
  return {
    ok: true,
    json: async () => ({ answer, results }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("web-research", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PERPLEXITY_API_KEY = "test-perplexity-key";
    process.env.TAVILY_API_KEY = "test-tavily-key";
    // Replace global fetch
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  // ── 1. buildMarketQuery generates correct queries ──────────────────────
  describe("buildMarketQuery via searchWithPerplexity", () => {
    const researchTypes = [
      "market_adr",
      "market_occupancy",
      "cap_rates",
      "operating_costs",
      "comparable_properties",
      "regulatory",
      "market_trends",
    ] as const;

    for (const rt of researchTypes) {
      it(`generates a non-empty query for researchType="${rt}"`, async () => {
        mockPerplexityCreate.mockResolvedValue(perplexityResponse("test"));
        const req = makeRequest({ researchType: rt });
        await searchWithPerplexity(req);

        expect(mockPerplexityCreate).toHaveBeenCalledTimes(1);
        const callArgs = mockPerplexityCreate.mock.calls[0][0];
        const userMessage = callArgs.messages.find((m: any) => m.role === "user");
        expect(userMessage.content.length).toBeGreaterThan(10);
        // Most query types include location; operating_costs uses tier/year instead
        if (rt !== "operating_costs") {
          expect(userMessage.content).toContain("Medellin");
        } else {
          expect(userMessage.content).toContain("USALI");
        }
        // Property context should always be in the system prompt
        const systemMessage = callArgs.messages.find((m: any) => m.role === "system");
        expect(systemMessage.content).toContain("Casa Wellness");
      });
    }
  });

  // ── 2. searchWithPerplexity formats request correctly ──────────────────
  it("searchWithPerplexity includes property context in system prompt", async () => {
    mockPerplexityCreate.mockResolvedValue(perplexityResponse("ADR data here"));
    const req = makeRequest();
    const result = await searchWithPerplexity(req);

    expect(mockPerplexityCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockPerplexityCreate.mock.calls[0][0];
    const systemMessage = callArgs.messages.find((m: any) => m.role === "system");
    expect(systemMessage.content).toContain("Casa Wellness");
    expect(systemMessage.content).toContain("Medellin, Colombia");
    expect(systemMessage.content).toContain("luxury");
    expect(callArgs.model).toBe("sonar");

    expect(result).not.toBeNull();
    expect(result!.source).toBe("perplexity");
    expect(result!.summary).toBe("ADR data here");
  });

  // ── 3. searchWithTavily uses correct domain filters ────────────────────
  it("searchWithTavily sends hospitality domains in request body", async () => {
    mockFetch.mockResolvedValue(tavilyResponse("Tavily answer", [
      { url: "https://str.com/data", title: "STR Data", content: "Trend report" },
    ]));

    const req = makeRequest();
    const result = await searchWithTavily(req);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.tavily.com/search");
    const body = JSON.parse(options.body);
    expect(body.include_domains).toContain("str.com");
    expect(body.include_domains).toContain("hvs.com");
    expect(body.include_domains).toContain("cbre.com");
    expect(body.search_depth).toBe("advanced");

    expect(result).not.toBeNull();
    expect(result!.source).toBe("tavily");
    expect(result!.summary).toBe("Tavily answer");
  });

  // ── 4. conductWebResearch runs both in parallel ────────────────────────
  it("conductWebResearch returns results from both providers", async () => {
    mockPerplexityCreate.mockResolvedValue(perplexityResponse("Perplexity data"));
    mockFetch.mockResolvedValue(tavilyResponse("Tavily data"));

    const results = await conductWebResearch(makeRequest());

    expect(results.length).toBe(2);
    const sources = results.map((r) => r.source);
    expect(sources).toContain("perplexity");
    expect(sources).toContain("tavily");
  });

  // ── 5. Graceful degradation: Perplexity fails ─────────────────────────
  it("returns Tavily result when Perplexity fails", async () => {
    mockPerplexityCreate.mockRejectedValue(new Error("Perplexity is down"));
    mockFetch.mockResolvedValue(tavilyResponse("Tavily still works"));

    const results = await conductWebResearch(makeRequest());

    expect(results.length).toBe(1);
    expect(results[0].source).toBe("tavily");
    expect(results[0].summary).toBe("Tavily still works");
  });

  // ── 6. Graceful degradation: both fail ─────────────────────────────────
  it("returns empty array when both providers fail", async () => {
    mockPerplexityCreate.mockRejectedValue(new Error("Perplexity down"));
    mockFetch.mockRejectedValue(new Error("Tavily down"));

    const results = await conductWebResearch(makeRequest());

    expect(results).toEqual([]);
  });

  // ── 7. Missing API keys: skip silently ─────────────────────────────────
  it("returns null silently when PERPLEXITY_API_KEY is missing", async () => {
    delete process.env.PERPLEXITY_API_KEY;
    const result = await searchWithPerplexity(makeRequest());
    expect(result).toBeNull();
    expect(mockPerplexityCreate).not.toHaveBeenCalled();
  });

  it("returns null silently when TAVILY_API_KEY is missing", async () => {
    delete process.env.TAVILY_API_KEY;
    const result = await searchWithTavily(makeRequest());
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // ── 8. Citations extracted ─────────────────────────────────────────────
  it("extracts citations from Perplexity response", async () => {
    const urls = [
      "https://str.com/report/2025",
      "https://hvs.com/publication/luxury-adr",
    ];
    mockPerplexityCreate.mockResolvedValue(perplexityResponse("Luxury ADR is $396", urls));

    const result = await searchWithPerplexity(makeRequest());

    expect(result).not.toBeNull();
    expect(result!.citations.length).toBe(2);
    expect(result!.citations[0].url).toBe(urls[0]);
    expect(result!.citations[1].url).toBe(urls[1]);
    expect(result!.citations[0].title).toContain("str.com");
  });

  it("extracts citations from Tavily response", async () => {
    mockFetch.mockResolvedValue(tavilyResponse("Cap rates at 7.5%", [
      { url: "https://cbre.com/cap-rates", title: "CBRE Cap Rates", content: "Survey data", score: 0.95 },
    ]));

    const result = await searchWithTavily(makeRequest({ researchType: "cap_rates" }));

    expect(result).not.toBeNull();
    expect(result!.citations.length).toBe(1);
    expect(result!.citations[0].url).toBe("https://cbre.com/cap-rates");
    expect(result!.citations[0].relevanceScore).toBe(0.95);
  });

  // ── 9. isWebResearchAvailable ──────────────────────────────────────────
  it("returns true when at least one API key is set", () => {
    process.env.PERPLEXITY_API_KEY = "key";
    delete process.env.TAVILY_API_KEY;
    expect(isWebResearchAvailable()).toBe(true);

    delete process.env.PERPLEXITY_API_KEY;
    process.env.TAVILY_API_KEY = "key";
    expect(isWebResearchAvailable()).toBe(true);
  });

  it("returns false when no API keys are set", () => {
    delete process.env.PERPLEXITY_API_KEY;
    delete process.env.TAVILY_API_KEY;
    expect(isWebResearchAvailable()).toBe(false);
  });
});
