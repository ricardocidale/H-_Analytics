/**
 * Unit + integration tests for the knowledge-registry admin routes.
 *
 * All heavy dependencies (DB, LLM, external APIs, auth) are mocked so the
 * test suite runs offline with no credentials.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import supertest from "supertest";

// ── Hoisted mock state ──────────────────────────────────────────────────────

const {
  mockGetEntry,
  mockGetAllCountryData,
  mockUpsertCountryData,
  mockUpdateRefreshed,
  mockIndexKnowledgeBase,
  mockIndexAllMarketResearch,
  mockAcquireInFlight,
  mockReleaseInFlight,
  mockResearchCapitalRaise,
  mockResearchExitMultiples,
  mockResearchReferenceBrands,
  mockGetCapitalRaiseBenchmarks,
  mockGetExitMultiples,
  mockGetReferenceBrands,
  mockUpsertCapitalRaiseBenchmark,
  mockUpsertExitMultiple,
} = vi.hoisted(() => ({
  mockGetEntry: vi.fn(),
  mockGetAllCountryData: vi.fn(),
  mockUpsertCountryData: vi.fn(),
  mockUpdateRefreshed: vi.fn(),
  mockIndexKnowledgeBase: vi.fn(),
  mockIndexAllMarketResearch: vi.fn(),
  mockAcquireInFlight: vi.fn(),
  mockReleaseInFlight: vi.fn(),
  mockResearchCapitalRaise: vi.fn(),
  mockResearchExitMultiples: vi.fn(),
  mockResearchReferenceBrands: vi.fn(),
  mockGetCapitalRaiseBenchmarks: vi.fn(),
  mockGetExitMultiples: vi.fn(),
  mockGetReferenceBrands: vi.fn(),
  mockUpsertCapitalRaiseBenchmark: vi.fn(),
  mockUpsertExitMultiple: vi.fn(),
}));

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("../../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../auth", () => ({
  requireAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock("../../routes/helpers", () => ({
  logAndSendError: (_res: Response, _msg: string, err: unknown) => {
    (_res as Response).status(500).json({ error: String(err) });
  },
  logActivity: vi.fn(),
}));

vi.mock("../../storage", () => ({
  storage: {
    getAllKnowledgeRegistry: vi.fn().mockResolvedValue([]),
    getKnowledgeRegistryEntry: (...args: unknown[]) => mockGetEntry(...args),
    updateKnowledgeRegistryRefreshed: (...args: unknown[]) => mockUpdateRefreshed(...args),
    getAllCountryEconomicData: (...args: unknown[]) => mockGetAllCountryData(...args),
    upsertCountryEconomicData: (...args: unknown[]) => mockUpsertCountryData(...args),
    getCapitalRaiseBenchmarks: (...args: unknown[]) => mockGetCapitalRaiseBenchmarks(...args),
    getExitMultiples: (...args: unknown[]) => mockGetExitMultiples(...args),
    getReferenceBrands: (...args: unknown[]) => mockGetReferenceBrands(...args),
    upsertCapitalRaiseBenchmark: (...args: unknown[]) => mockUpsertCapitalRaiseBenchmark(...args),
    upsertExitMultiple: (...args: unknown[]) => mockUpsertExitMultiple(...args),
  },
}));

vi.mock("../../ai/vector-store-service", () => ({
  getNamespaceStats: vi.fn().mockResolvedValue({}),
}));

vi.mock("../../storage/vector-store", () => ({
  vectorStorePool: {
    query: vi.fn().mockResolvedValue({ rows: [] }),
  },
}));

vi.mock("../../middleware/analyst-refresh-guards", () => ({
  acquireInFlight: (...args: unknown[]) => mockAcquireInFlight(...args),
  releaseInFlight: (...args: unknown[]) => mockReleaseInFlight(...args),
}));

vi.mock("../../ai/knowledge-base", () => ({
  indexKnowledgeBase: (...args: unknown[]) => mockIndexKnowledgeBase(...args),
}));

vi.mock("../../ai/vector-indexing", () => ({
  indexAllMarketResearch: (...args: unknown[]) => mockIndexAllMarketResearch(...args),
}));

vi.mock("../../ai/analyst-table-refresh", () => ({
  researchCapitalRaiseBenchmarks: (...args: unknown[]) => mockResearchCapitalRaise(...args),
  researchExitMultiples: (...args: unknown[]) => mockResearchExitMultiples(...args),
  researchReferenceBrands: (...args: unknown[]) => mockResearchReferenceBrands(...args),
}));

// ── Build test app ───────────────────────────────────────────────────────────

import { registerKnowledgeRegistryRoutes } from "../../routes/admin/knowledge-registry";

let agent: ReturnType<typeof supertest>;

beforeAll(() => {
  const app = express();
  app.use(express.json());
  registerKnowledgeRegistryRoutes(app);
  agent = supertest(app);
});

afterEach(() => {
  vi.clearAllMocks();
  // Default safe returns
  mockUpdateRefreshed.mockResolvedValue(undefined);
  mockUpsertCountryData.mockResolvedValue(undefined);
  mockUpsertCapitalRaiseBenchmark.mockResolvedValue({});
  mockUpsertExitMultiple.mockResolvedValue({});
  mockReleaseInFlight.mockReturnValue(undefined);
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: "market-research",
    displayName: "Market Research",
    assetType: "vector_namespace",
    assetRef: "market-research",
    lastRefreshedAt: null,
    ...overrides,
  };
}

// ── GET routes ───────────────────────────────────────────────────────────────

describe("GET /api/admin/knowledge-registry/:id", () => {
  it("returns 404 for unknown id", async () => {
    mockGetEntry.mockResolvedValue(undefined);
    const res = await agent.get("/api/admin/knowledge-registry/unknown-slug");
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("returns the entry for a known id", async () => {
    const entry = makeEntry();
    mockGetEntry.mockResolvedValue(entry);
    const res = await agent.get("/api/admin/knowledge-registry/market-research");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("market-research");
  });
});

// ── POST /:id/regenerate ─────────────────────────────────────────────────────

describe("POST /api/admin/knowledge-registry/:id/regenerate", () => {
  it("returns 404 when asset id is not found", async () => {
    mockGetEntry.mockResolvedValue(undefined);
    const res = await agent.post("/api/admin/knowledge-registry/does-not-exist/regenerate");
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("returns 422 for assumption-guidance (display-only, no batch path)", async () => {
    mockGetEntry.mockResolvedValue(makeEntry({ id: "assumption-guidance", assetRef: "assumption-guidance" }));
    const res = await agent.post("/api/admin/knowledge-registry/assumption-guidance/regenerate");
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/no portfolio-wide regeneration/i);
  });

  it("returns 422 for comparables (per-property only)", async () => {
    mockGetEntry.mockResolvedValue(makeEntry({ id: "comparables", assetRef: "comparables" }));
    const res = await agent.post("/api/admin/knowledge-registry/comparables/regenerate");
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/per-property/i);
  });

  it("calls indexAllMarketResearch for market-research and updates last_refreshed_at", async () => {
    mockGetEntry.mockResolvedValue(makeEntry());
    mockIndexAllMarketResearch.mockResolvedValue({ indexed: 42, skipped: 0 });

    const res = await agent.post("/api/admin/knowledge-registry/market-research/regenerate");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockIndexAllMarketResearch).toHaveBeenCalledOnce();
    expect(mockUpdateRefreshed).toHaveBeenCalledWith("market-research", expect.any(Date));
  });

  it("calls indexKnowledgeBase for knowledge-base and updates last_refreshed_at", async () => {
    mockGetEntry.mockResolvedValue(makeEntry({ id: "knowledge-base", assetRef: "knowledge-base" }));
    mockIndexKnowledgeBase.mockResolvedValue({ chunksIndexed: 100, timeMs: 500 });

    const res = await agent.post("/api/admin/knowledge-registry/knowledge-base/regenerate");

    expect(res.status).toBe(200);
    expect(mockIndexKnowledgeBase).toHaveBeenCalledOnce();
    expect(mockUpdateRefreshed).toHaveBeenCalledWith("knowledge-base", expect.any(Date));
  });

  it("returns 409 when a benchmark refresh is already in-flight", async () => {
    mockGetEntry.mockResolvedValue(makeEntry({
      id: "capital-raise",
      assetType: "benchmark_table",
      assetRef: "capital-raise",
    }));
    mockAcquireInFlight.mockReturnValue(false); // already locked

    const res = await agent.post("/api/admin/knowledge-registry/capital-raise/regenerate");
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/in flight/i);
  });

  it("runs benchmark refresh for capital-raise and auto-commits ranges", async () => {
    mockGetEntry.mockResolvedValue(makeEntry({
      id: "capital-raise",
      assetType: "benchmark_table",
      assetRef: "capital-raise",
    }));
    mockAcquireInFlight.mockReturnValue(true);
    mockGetCapitalRaiseBenchmarks.mockResolvedValue([]);
    mockResearchCapitalRaise.mockResolvedValue({
      proposedRanges: [{ dimensionKey: "d1", label: "Test", unit: "usd", valueLow: 1, valueMid: 2, valueHigh: 3 }],
      narration: [],
      sourceCount: 3,
      tokensUsed: 100,
      evidence: [],
    });

    const res = await agent.post("/api/admin/knowledge-registry/capital-raise/regenerate");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockResearchCapitalRaise).toHaveBeenCalledOnce();
    expect(mockUpsertCapitalRaiseBenchmark).toHaveBeenCalledOnce();
    expect(mockUpdateRefreshed).toHaveBeenCalledWith("capital-raise", expect.any(Date));
    expect(mockReleaseInFlight).toHaveBeenCalledWith("capital_raise_benchmarks");
  });
});

// ── POST /country-economic-data/regenerate ───────────────────────────────────

describe("POST /api/admin/knowledge-registry/country-economic-data/regenerate", () => {
  it("returns 200 and writes rows to DB using existing values when external APIs are unavailable", async () => {
    // Simulate all external API calls failing (no FRED_API_KEY, Frankfurter returns error)
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    mockGetAllCountryData.mockResolvedValue([
      { countryCode: "US", countryName: "United States", inflationRate: "3.2", fxRateToUsd: "1.0", gdpGrowthRate: "2.5", interestRate: "5.33", sourceNotes: "seed" },
    ]);

    const res = await agent.post("/api/admin/knowledge-registry/country-economic-data/regenerate");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.rowsUpdated).toBe(4);
    expect(mockUpsertCountryData).toHaveBeenCalledOnce();
    expect(mockUpdateRefreshed).toHaveBeenCalledWith("country-data", expect.any(Date));

    vi.unstubAllGlobals();
  });

  it("upserts 4 country rows even when no existing DB data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    mockGetAllCountryData.mockResolvedValue([]);

    const res = await agent.post("/api/admin/knowledge-registry/country-economic-data/regenerate");

    expect(res.status).toBe(200);
    const [rows] = mockUpsertCountryData.mock.calls[0] as [unknown[]];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toHaveLength(4);
    const codes = (rows as Array<{ countryCode: string }>).map(r => r.countryCode);
    expect(codes).toContain("US");
    expect(codes).toContain("MX");
    expect(codes).toContain("CO");
    expect(codes).toContain("BR");

    vi.unstubAllGlobals();
  });
});

// ── Integration: last_refreshed_at chain ─────────────────────────────────────

describe("integration: last_refreshed_at chain for vector_namespace assets", () => {
  it("last_refreshed_at is null before, non-null after successful regeneration", async () => {
    const entry = makeEntry({ lastRefreshedAt: null });
    mockGetEntry.mockResolvedValue(entry);
    mockIndexAllMarketResearch.mockResolvedValue({ indexed: 5, skipped: 0 });

    let capturedDate: Date | undefined;
    mockUpdateRefreshed.mockImplementation(async (_id: string, date: Date) => {
      capturedDate = date;
    });

    expect(entry.lastRefreshedAt).toBeNull();

    const res = await agent.post("/api/admin/knowledge-registry/market-research/regenerate");

    expect(res.status).toBe(200);
    expect(capturedDate).toBeInstanceOf(Date);
    expect(capturedDate!.getTime()).toBeLessThanOrEqual(Date.now());
    expect(capturedDate!.getTime()).toBeGreaterThan(Date.now() - 5000);
  });
});
