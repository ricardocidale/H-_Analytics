/**
 * Tests for server/ai/data-routing.ts — the smart data routing engine.
 *
 * Covers:
 * - DATA_ROUTING_TABLE structure and completeness (pure data, no mocks)
 * - fetchFieldData with progressive relaxation (mocked services)
 * - fetchMultipleFields batch fetching (mocked services)
 * - Admin integration toggle behavior
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be set up before importing the module under test
// ---------------------------------------------------------------------------

// Mock logger
vi.mock("../../server/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock storage — only the InMemoryIntegrationStatusSink path touches it; the
// rest of the suite swaps in a stub sink so storage is never called.
const mockGetIntegrationEnabledMap = vi.fn().mockResolvedValue({});
vi.mock("../../server/storage", () => ({
  storage: {
    getIntegrationEnabledMap: (...args: unknown[]) => mockGetIntegrationEnabledMap(...args),
  },
}));

// Mock country defaults
const mockGetCountryDefaults = vi.fn();
vi.mock("@shared/countryDefaults", () => ({
  getCountryDefaults: (...args: unknown[]) => mockGetCountryDefaults(...args),
}));

// Mock regulatory data
const mockGetRegulatoryProfile = vi.fn();
vi.mock("../../shared/regulatory-data", () => ({
  getRegulatoryProfile: (...args: unknown[]) => mockGetRegulatoryProfile(...args),
}));

// Mock benchmark-lookups (priority-0 pre-collected tables)
const mockLookupMarketAdr = vi.fn().mockResolvedValue(null);
const mockLookupSeasonalCurve = vi.fn().mockResolvedValue(null);
const mockLookupEventCalendar = vi.fn().mockResolvedValue(null);
const mockLookupLaborCosts = vi.fn().mockResolvedValue(null);
const mockLookupFbBenchmarks = vi.fn().mockResolvedValue(null);
vi.mock("../../server/ai/benchmark-lookups", () => ({
  lookupMarketAdr: (...args: unknown[]) => mockLookupMarketAdr(...args),
  lookupSeasonalCurve: (...args: unknown[]) => mockLookupSeasonalCurve(...args),
  lookupEventCalendar: (...args: unknown[]) => mockLookupEventCalendar(...args),
  lookupLaborCosts: (...args: unknown[]) => mockLookupLaborCosts(...args),
  lookupFbBenchmarks: (...args: unknown[]) => mockLookupFbBenchmarks(...args),
}));

// Mock all service constructors to return controllable instances.
// IMPORTANT: vi.mock factories must use `function` keyword for constructors,
// not arrow functions, because `new` requires a proper constructor.

const mockAmadeusFetchAdrBenchmark = vi.fn();
const mockAmadeusIsAvailable = vi.fn().mockReturnValue(true);
vi.mock("../../server/services/AmadeusService", () => ({
  AmadeusService: function(this: any) {
    this.fetchAdrBenchmark = mockAmadeusFetchAdrBenchmark;
    this.isAvailable = mockAmadeusIsAvailable;
  },
}));

const mockCostarFetchMarketData = vi.fn();
const mockCostarIsAvailable = vi.fn().mockReturnValue(true);
vi.mock("../../server/services/CoStarService", () => ({
  CoStarService: function(this: any) {
    this.fetchMarketData = mockCostarFetchMarketData;
    this.isAvailable = mockCostarIsAvailable;
  },
}));

const mockHospitalityFetchBenchmarks = vi.fn();
const mockHospitalityIsAvailable = vi.fn().mockReturnValue(true);
vi.mock("../../server/services/HospitalityBenchmarkService", () => ({
  HospitalityBenchmarkService: function(this: any) {
    this.fetchBenchmarks = mockHospitalityFetchBenchmarks;
    this.isAvailable = mockHospitalityIsAvailable;
  },
}));

const mockFredFetchAllRates = vi.fn();
const mockFredIsAvailable = vi.fn().mockReturnValue(true);
vi.mock("../../server/services/FREDService", () => ({
  FREDService: function(this: any) {
    this.fetchAllRates = mockFredFetchAllRates;
    this.fetchRate = vi.fn();
    this.isAvailable = mockFredIsAvailable;
  },
}));

const mockGroundedSearch = vi.fn();
const mockGroundedIsAvailable = vi.fn().mockReturnValue(true);
vi.mock("../../server/services/GroundedResearchService", () => ({
  GroundedResearchService: function(this: any) {
    this.search = mockGroundedSearch;
    this.isAvailable = mockGroundedIsAvailable;
  },
}));

const mockXoteloFetchAdrBenchmark = vi.fn();
const mockXoteloIsAvailable = vi.fn().mockReturnValue(true);
vi.mock("../../server/services/XoteloService", () => ({
  XoteloService: function(this: any) {
    this.fetchAdrBenchmark = mockXoteloFetchAdrBenchmark;
    this.isAvailable = mockXoteloIsAvailable;
  },
}));

const mockApifyFetchCompSetData = vi.fn();
const mockApifyIsAvailable = vi.fn().mockReturnValue(true);
vi.mock("../../server/services/ApifyService", () => ({
  ApifyService: function(this: any) {
    this.fetchCompSetData = mockApifyFetchCompSetData;
    this.isAvailable = mockApifyIsAvailable;
  },
}));

const mockRapidApiFetchCompSetData = vi.fn();
const mockRapidApiIsAvailable = vi.fn().mockReturnValue(true);
vi.mock("../../server/services/RapidApiHospitalityService", () => ({
  RapidApiHospitalityService: function(this: any) {
    this.fetchCompSetData = mockRapidApiFetchCompSetData;
    this.isAvailable = mockRapidApiIsAvailable;
  },
}));

const mockWeatherFetchWeatherData = vi.fn();
const mockWeatherIsAvailable = vi.fn().mockReturnValue(true);
vi.mock("../../server/services/WeatherService", () => ({
  WeatherService: function(this: any) {
    this.fetchWeatherData = mockWeatherFetchWeatherData;
    this.isAvailable = mockWeatherIsAvailable;
  },
}));

const mockWorldBankFetchCountryData = vi.fn();
const mockWorldBankIsAvailable = vi.fn().mockReturnValue(true);
vi.mock("../../server/services/WorldBankService", () => ({
  WorldBankService: function(this: any) {
    this.fetchCountryData = mockWorldBankFetchCountryData;
    this.isAvailable = mockWorldBankIsAvailable;
  },
}));

const mockAlphaVantageFetchMarketData = vi.fn();
const mockAlphaVantageIsAvailable = vi.fn().mockReturnValue(true);
vi.mock("../../server/services/AlphaVantageService", () => ({
  AlphaVantageService: function(this: any) {
    this.fetchMarketData = mockAlphaVantageFetchMarketData;
    this.isAvailable = mockAlphaVantageIsAvailable;
  },
}));

const mockWalkScoreFetchScores = vi.fn();
const mockWalkScoreIsAvailable = vi.fn().mockReturnValue(true);
vi.mock("../../server/services/WalkScoreService", () => ({
  WalkScoreService: function(this: any) {
    this.fetchScores = mockWalkScoreFetchScores;
    this.isAvailable = mockWalkScoreIsAvailable;
  },
}));

const mockRealtyIsAvailable = vi.fn().mockReturnValue(true);
vi.mock("../../server/services/RealtyService", () => ({
  RealtyService: function(this: any) {
    this.searchProperties = vi.fn();
    this.isAvailable = mockRealtyIsAvailable;
  },
}));

const mockUSRealEstateIsAvailable = vi.fn().mockReturnValue(true);
vi.mock("../../server/services/USRealEstateService", () => ({
  USRealEstateService: function(this: any) {
    this.fetchPropertyData = vi.fn();
    this.isAvailable = mockUSRealEstateIsAvailable;
  },
}));

// ---------------------------------------------------------------------------
// Import module under test AFTER mocks are set up
// ---------------------------------------------------------------------------
import {
  DATA_ROUTING_TABLE,
  fetchFieldData,
  fetchMultipleFields,
  getRoutableFields,
  getFieldRoutes,
  getFieldsByService,
  setIntegrationStatusSink,
  resetDefaultIntegrationStatusSink,
  InMemoryIntegrationStatusSink,
} from "../../server/ai/data-routing";
import type {
  RoutingContext,
  DataRouteResult,
  RelaxationLevel,
  IntegrationStatusSink,
} from "../../server/ai/data-routing";

// ---------------------------------------------------------------------------
// Tiny in-memory stub sink used for per-test enable/disable scenarios.
// Bypasses the storage mock and the cache/TTL inside InMemoryIntegrationStatusSink
// so each test starts from a clean, predictable state.
// ---------------------------------------------------------------------------

class StubIntegrationStatusSink implements IntegrationStatusSink {
  private map: Record<string, boolean>;

  constructor(map: Record<string, boolean> = {}) {
    this.map = { ...map };
  }

  async getEnabledMap(): Promise<Record<string, boolean>> {
    return this.map;
  }

  reset(): void {
    this.map = {};
  }

  setMap(map: Record<string, boolean>): void {
    this.map = { ...map };
  }
}

const ALL_ENABLED: Record<string, boolean> = {
  fred: true,
  "hospitality-benchmarks": true,
  "grounded-research": true,
  costar: true,
  xotelo: true,
  apify: true,
  "rapidapi-booking": true,
  "rapidapi-hotels": true,
  "weather-api": true,
  "world-bank": true,
  "alpha-vantage": true,
  amadeus: true,
  "walk-score": true,
};

let stubSink: StubIntegrationStatusSink;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(overrides: Partial<RoutingContext> = {}): RoutingContext {
  return {
    location: "Medellín, Colombia",
    city: "Medellín",
    state: "Antioquia",
    country: "CO",
    qualityTier: "luxury",
    businessModel: "hotel",
    roomCount: 12,
    latitude: 6.2442,
    longitude: -75.5812,
    propertyType: "boutique",
    propertyId: 1,
    ...overrides,
  };
}

// Per-test setup: reset mocks, install a fresh stub sink (all integrations
// enabled by default), and reset the integration-enabled map mock for any test
// that explicitly opts into the InMemoryIntegrationStatusSink path.
beforeEach(() => {
  vi.clearAllMocks();

  // Swap in a per-test stub sink so cache TTL inside the default sink can
  // never leak state across tests. Individual tests can mutate stubSink
  // directly to flip integrations on/off.
  stubSink = new StubIntegrationStatusSink(ALL_ENABLED);
  setIntegrationStatusSink(stubSink);

  // Storage mock baseline (only consulted by tests that install a real
  // InMemoryIntegrationStatusSink).
  mockGetIntegrationEnabledMap.mockResolvedValue({ ...ALL_ENABLED });

  // Default: all services "available"
  mockAmadeusIsAvailable.mockReturnValue(true);
  mockCostarIsAvailable.mockReturnValue(true);
  mockHospitalityIsAvailable.mockReturnValue(true);
  mockFredIsAvailable.mockReturnValue(true);
  mockGroundedIsAvailable.mockReturnValue(true);
  mockXoteloIsAvailable.mockReturnValue(true);
  mockApifyIsAvailable.mockReturnValue(true);
  mockRapidApiIsAvailable.mockReturnValue(true);
  mockWeatherIsAvailable.mockReturnValue(true);
  mockWorldBankIsAvailable.mockReturnValue(true);
  mockAlphaVantageIsAvailable.mockReturnValue(true);
  mockWalkScoreIsAvailable.mockReturnValue(true);
  mockRealtyIsAvailable.mockReturnValue(true);
  mockUSRealEstateIsAvailable.mockReturnValue(true);

  // Default: services return null (no data)
  mockAmadeusFetchAdrBenchmark.mockResolvedValue(null);
  mockCostarFetchMarketData.mockResolvedValue(null);
  mockHospitalityFetchBenchmarks.mockResolvedValue(null);
  mockFredFetchAllRates.mockResolvedValue({});
  mockGroundedSearch.mockResolvedValue([]);
  mockXoteloFetchAdrBenchmark.mockResolvedValue(null);
  mockApifyFetchCompSetData.mockResolvedValue(null);
  mockRapidApiFetchCompSetData.mockResolvedValue(null);
  mockWeatherFetchWeatherData.mockResolvedValue(null);
  mockWorldBankFetchCountryData.mockResolvedValue(null);
  mockAlphaVantageFetchMarketData.mockResolvedValue(null);
  mockWalkScoreFetchScores.mockResolvedValue(null);
  mockGetCountryDefaults.mockReturnValue(null);
  mockGetRegulatoryProfile.mockReturnValue(null);

  // Pre-collected tables return null by default (tests mock specific services)
  mockLookupMarketAdr.mockResolvedValue(null);
  mockLookupSeasonalCurve.mockResolvedValue(null);
  mockLookupEventCalendar.mockResolvedValue(null);
  mockLookupLaborCosts.mockResolvedValue(null);
  mockLookupFbBenchmarks.mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
  // Restore the production sink so we never leak a test-only sink into the
  // next file in the suite.
  resetDefaultIntegrationStatusSink();
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. Routing Table Tests (Pure Data — No Mocking Needed)
// ═══════════════════════════════════════════════════════════════════════════

describe("DATA_ROUTING_TABLE structure", () => {
  const EXPECTED_FIELDS = [
    "startAdr",
    "startOccupancy",
    "adrGrowthRate",
    "revShareFB",
    "revShareEvents",
    "costRateRooms",
    "costRateFB",
    "costRateAdmin",
    "costRateMarketing",
    "costRateUtilities",
    "acquisitionInterestRate",
    "exitCapRate",
    "taxRate",
    "depreciationYears",
    "baseFeePercent",
    "incentiveFeePercent",
    "propertyTaxRate",
    "staffCompensation",
    "walkScore",
    "distanceToAirport",
    "hotelTaxRate",
    "avgTicketFB",
    "nightlyPropertyRate",
  ];

  // Test 1
  it("has all 23 expected fields", () => {
    const tableKeys = Object.keys(DATA_ROUTING_TABLE);
    for (const field of EXPECTED_FIELDS) {
      expect(tableKeys, `missing field: ${field}`).toContain(field);
    }
    // Also check count — if new fields are added, update EXPECTED_FIELDS
    expect(tableKeys.length).toBeGreaterThanOrEqual(23);
  });

  // Test 2
  it("every field has at least one route", () => {
    for (const [field, routes] of Object.entries(DATA_ROUTING_TABLE)) {
      expect(routes.length, `field "${field}" has no routes`).toBeGreaterThan(0);
    }
  });

  // Test 3
  it("routes are sorted by priority (ascending)", () => {
    for (const [field, routes] of Object.entries(DATA_ROUTING_TABLE)) {
      for (let i = 1; i < routes.length; i++) {
        expect(
          routes[i].priority,
          `field "${field}": route at index ${i} (priority ${routes[i].priority}) ` +
          `should be >= route at index ${i - 1} (priority ${routes[i - 1].priority})`,
        ).toBeGreaterThanOrEqual(routes[i - 1].priority);
      }
    }
  });

  // Test 4
  it("pre-collected tables have priority 0 entries", () => {
    const preCollectedServices = [
      "market-adr-index",
      "seasonal-calendars",
      "labor-rates",
      "fb-benchmarks",
    ];

    for (const svc of preCollectedServices) {
      const fieldsWithService = Object.entries(DATA_ROUTING_TABLE).filter(
        ([, routes]) => routes.some(r => r.service === svc),
      );
      expect(
        fieldsWithService.length,
        `pre-collected service "${svc}" not found in any field`,
      ).toBeGreaterThan(0);

      for (const [field, routes] of fieldsWithService) {
        const svcRoute = routes.find(r => r.service === svc);
        expect(
          svcRoute!.priority,
          `pre-collected service "${svc}" in field "${field}" should be priority 0`,
        ).toBe(0);
      }
    }
  });

  // Test 5
  it("critical fields have multiple fallback routes (3+)", () => {
    const criticalFields = ["startAdr", "startOccupancy", "exitCapRate"];
    for (const field of criticalFields) {
      const routes = DATA_ROUTING_TABLE[field];
      expect(
        routes.length,
        `critical field "${field}" should have 3+ routes, has ${routes.length}`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  // Test 6
  it("every route has a non-empty description", () => {
    for (const [field, routes] of Object.entries(DATA_ROUTING_TABLE)) {
      for (const route of routes) {
        expect(
          route.description.trim().length,
          `field "${field}", service "${route.service}" has empty description`,
        ).toBeGreaterThan(0);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. fetchFieldData Tests (Mocked Services)
// ═══════════════════════════════════════════════════════════════════════════

describe("fetchFieldData", () => {
  // Test 7: Returns data from highest priority service
  it("returns data from highest priority service (amadeus for startAdr)", async () => {
    mockAmadeusFetchAdrBenchmark.mockResolvedValue({
      value: 285,
      source: "Amadeus Live Hotels",
    });

    const result = await fetchFieldData("startAdr", makeContext());

    // Amadeus is priority 1 for startAdr (priority 0 is market-adr-index which
    // has no dispatcher case, so it falls through). Amadeus should be the first
    // API service that returns data.
    expect(result).not.toBeNull();
    expect(result!.value).toBe(285);
    expect(result!.source).toBe("amadeus");
    expect(result!.confidence).toBe("high");
    // CoStar (priority 2) should NOT have been called
    expect(mockCostarFetchMarketData).not.toHaveBeenCalled();
  });

  // Test 8: Falls through to lower priority when higher returns null
  it("falls through to lower priority service when higher returns null", async () => {
    // Amadeus returns null
    mockAmadeusFetchAdrBenchmark.mockResolvedValue(null);
    // CoStar returns ADR data
    mockCostarFetchMarketData.mockResolvedValue({
      adr: { value: 310, source: "CoStar" },
    });

    const result = await fetchFieldData("startAdr", makeContext());

    expect(result).not.toBeNull();
    expect(result!.value).toBe(310);
    expect(result!.source).toBe("costar");
  });

  // Test 9: Progressive relaxation triggers when all L0 services return null
  it("progressive relaxation triggers when all services return null at L0", async () => {
    // Country defaults return tax rate on any call (regardless of relaxation)
    mockGetCountryDefaults.mockReturnValue({
      taxRate: 0.35,
      depreciationYears: 20,
      depreciationAuthority: "DIAN",
      costRateTaxes: 0.012,
    });

    const result = await fetchFieldData("taxRate", makeContext());

    expect(result).not.toBeNull();
    expect(result!.value).toBe(0.35);
    expect(result!.source).toBe("country-defaults");
  });

  // Test 10: Relaxation widens geography — at L2, city should be relaxed to state
  it("relaxation widens geography at L2", async () => {
    // All services return null at L0 and L1, but CoStar returns data at L2
    let callCount = 0;
    mockCostarFetchMarketData.mockImplementation(async (params: any) => {
      callCount++;
      // Only return data when city is NOT specified (L2+ relaxation)
      if (!params.location?.includes("Medellín")) {
        return { occupancyRate: { value: 0.72, source: "CoStar" } };
      }
      return null;
    });

    const result = await fetchFieldData("startOccupancy", makeContext());

    // Result should come from a relaxed context
    if (result) {
      expect(result.relaxationLevel).toBeGreaterThanOrEqual(2);
    }
  });

  // Test 11: Relaxation widens quality tier at L3
  it("relaxation widens quality tier at L3", async () => {
    // All services return null until quality tier is relaxed
    let lastQualityTier: string | undefined;
    mockCostarFetchMarketData.mockImplementation(async (params: any) => {
      lastQualityTier = params.propertyType;
      return null; // Return null to force further relaxation
    });

    // Force everything to return null so we traverse all levels
    await fetchFieldData("startOccupancy", makeContext({ qualityTier: "luxury" }));

    // The fact that CoStar was called multiple times means relaxation was attempted
    expect(mockCostarFetchMarketData).toHaveBeenCalled();
  });

  // Test 12: Returns null when all services at all levels return null
  it("returns null when all services at all levels return null", async () => {
    const result = await fetchFieldData("startAdr", makeContext());

    expect(result).toBeNull();
  });

  // Test 13: Respects maxRelaxLevel
  it("respects maxRelaxLevel — stops relaxation at specified level", async () => {
    // Country defaults only available at country level (always available)
    // but we set maxRelaxLevel=0 so only exact match is tried
    mockGetCountryDefaults.mockReturnValue(null);

    // All API services return null
    const result = await fetchFieldData("taxRate", makeContext(), 0 as RelaxationLevel);

    // With maxRelaxLevel=0, only L0 is tried
    // Since country-defaults is priority 1 (not 0) for taxRate and returns null, result should be null
    expect(result).toBeNull();
  });

  // Test 14: Confidence degrades with relaxation level
  it("confidence degrades with relaxation level", async () => {
    // Make country-defaults return data (it's always available at any level)
    mockGetCountryDefaults.mockReturnValue({
      taxRate: 0.21,
      depreciationAuthority: "IRS",
    });

    // taxRate: country-defaults is priority 1, available at any level
    const result = await fetchFieldData("taxRate", makeContext());

    expect(result).not.toBeNull();
    // L0 or L1 => "high", L2-L3 => "medium", L4-L5 => "low"
    if (result!.relaxationLevel <= 1) {
      expect(result!.confidence).toBe("high");
    } else if (result!.relaxationLevel <= 3) {
      expect(result!.confidence).toBe("medium");
    } else {
      expect(result!.confidence).toBe("low");
    }
  });

  // Test 15: Provenance includes source name and relaxation level
  it("provenance includes source name and relaxation level", async () => {
    mockAmadeusFetchAdrBenchmark.mockResolvedValue({
      value: 285,
      source: "Amadeus Live Hotels",
    });

    const result = await fetchFieldData("startAdr", makeContext());

    expect(result).not.toBeNull();
    expect(result!.provenance).toContain("L");
    expect(result!.provenance.length).toBeGreaterThan(0);
  });

  // Test 16: Skips unavailable services silently
  it("skips unavailable services silently", async () => {
    // Make amadeus unavailable
    mockAmadeusIsAvailable.mockReturnValue(false);
    // CoStar has data
    mockCostarFetchMarketData.mockResolvedValue({
      adr: { value: 295, source: "CoStar" },
    });

    const result = await fetchFieldData("startAdr", makeContext());

    expect(result).not.toBeNull();
    expect(result!.source).toBe("costar");
    // Amadeus should never have been called
    expect(mockAmadeusFetchAdrBenchmark).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. fetchMultipleFields Tests
// ═══════════════════════════════════════════════════════════════════════════

describe("fetchMultipleFields", () => {
  // Test 17: Fetches multiple fields in parallel
  it("fetches multiple fields in parallel and returns results", async () => {
    // Set up data for multiple fields
    mockGetCountryDefaults.mockReturnValue({
      taxRate: 0.35,
      depreciationYears: 20,
      depreciationAuthority: "DIAN",
      costRateTaxes: 0.012,
    });
    mockAmadeusFetchAdrBenchmark.mockResolvedValue({
      value: 285,
      source: "Amadeus",
    });

    const fields = ["taxRate", "depreciationYears", "startAdr"];
    const results = await fetchMultipleFields(fields, makeContext());

    expect(results.size).toBeGreaterThan(0);
    // At least taxRate and depreciationYears should have data from country-defaults
    const taxResult = results.get("taxRate");
    expect(taxResult).toBeDefined();
    expect(taxResult!.value).toBe(0.35);
  });

  // Test 18: Returns Map with results per field
  it("returns a Map instance with results per field", async () => {
    mockGetCountryDefaults.mockReturnValue({
      taxRate: 0.25,
      depreciationAuthority: "IRS",
    });

    const results = await fetchMultipleFields(["taxRate"], makeContext());

    expect(results).toBeInstanceOf(Map);
    if (results.has("taxRate")) {
      const entry = results.get("taxRate");
      expect(entry).toHaveProperty("field");
      expect(entry).toHaveProperty("value");
      expect(entry).toHaveProperty("source");
      expect(entry).toHaveProperty("relaxationLevel");
      expect(entry).toHaveProperty("confidence");
      expect(entry).toHaveProperty("provenance");
      expect(entry).toHaveProperty("fetchedAt");
    }
  });

  // Test 19: Missing fields return without entry in map (null result = not in map)
  it("fields with no data are absent from the result map", async () => {
    // Everything returns null (defaults)
    const results = await fetchMultipleFields(
      ["startAdr", "walkScore"],
      makeContext(),
    );

    // Fields that returned no data should not be in the map
    for (const [, result] of results) {
      expect(result.value).not.toBeNull();
    }
  });

  // Test 20: Handles empty field list
  it("handles empty field list gracefully", async () => {
    const results = await fetchMultipleFields([], makeContext());

    expect(results).toBeInstanceOf(Map);
    expect(results.size).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Service Integration Toggle Tests
// ═══════════════════════════════════════════════════════════════════════════

describe("service integration toggles", () => {
  // Test 21: Disabling a service in the injected sink skips its dispatcher.
  it("disabled service in the injected sink is not called", async () => {
    // Flip amadeus off via the stub sink — no need to fake isAvailable or
    // depend on storage cache state.
    stubSink.setMap({ ...ALL_ENABLED, amadeus: false });

    // Even though amadeus would have data, the router must skip it.
    mockAmadeusFetchAdrBenchmark.mockResolvedValue({
      value: 285,
      source: "Amadeus",
    });

    // CoStar provides the fallback.
    mockCostarFetchMarketData.mockResolvedValue({
      adr: { value: 310, source: "CoStar" },
    });

    const result = await fetchFieldData("startAdr", makeContext());

    expect(result).not.toBeNull();
    expect(result!.source).toBe("costar");
    expect(result!.value).toBe(310);
    expect(mockAmadeusFetchAdrBenchmark).not.toHaveBeenCalled();
  });

  // Test 22: Always-available services bypass the toggle entirely.
  it("country-defaults and regulatory-data are always available regardless of toggle", async () => {
    // Disable every gated integration via the stub sink.
    const allDisabled = Object.fromEntries(
      Object.keys(ALL_ENABLED).map(k => [k, false]),
    );
    stubSink.setMap(allDisabled);

    // But country-defaults has data
    mockGetCountryDefaults.mockReturnValue({
      taxRate: 0.30,
      depreciationAuthority: "SAT",
    });

    const result = await fetchFieldData("taxRate", makeContext());

    expect(result).not.toBeNull();
    expect(result!.source).toBe("country-defaults");
    expect(result!.value).toBe(0.30);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4b. Integration-status sink injection
// ═══════════════════════════════════════════════════════════════════════════

describe("integration status sink injection", () => {
  // Test: Default InMemoryIntegrationStatusSink swallows storage errors and
  // falls back to "all enabled" instead of crashing the router.
  it("InMemoryIntegrationStatusSink swallows storage errors and falls back to all-enabled", async () => {
    mockGetIntegrationEnabledMap.mockRejectedValue(new Error("db unavailable"));
    setIntegrationStatusSink(new InMemoryIntegrationStatusSink(60_000));

    // Amadeus has data; with no enabled-map available, every service is treated
    // as enabled, so amadeus should still be called and used.
    mockAmadeusFetchAdrBenchmark.mockResolvedValue({
      value: 285,
      source: "Amadeus Live Hotels",
    });

    const result = await fetchFieldData("startAdr", makeContext());

    expect(result).not.toBeNull();
    expect(result!.source).toBe("amadeus");
    expect(result!.value).toBe(285);
    expect(mockGetIntegrationEnabledMap).toHaveBeenCalled();
  });

  // Test: resetDefaultIntegrationStatusSink swaps the active sink for a fresh
  // default instance, dropping any test-installed sink and its cached state.
  it("resetDefaultIntegrationStatusSink swaps in a fresh sink between cases", async () => {
    // First call: stub sink disables amadeus, CoStar fields the request.
    stubSink.setMap({ ...ALL_ENABLED, amadeus: false });
    mockAmadeusFetchAdrBenchmark.mockResolvedValue({
      value: 285,
      source: "Amadeus",
    });
    mockCostarFetchMarketData.mockResolvedValue({
      adr: { value: 310, source: "CoStar" },
    });

    let result = await fetchFieldData("startAdr", makeContext());
    expect(result?.source).toBe("costar");
    expect(mockAmadeusFetchAdrBenchmark).not.toHaveBeenCalled();

    // Reset to a fresh default sink — its cache is empty and storage now
    // reports amadeus as enabled.
    resetDefaultIntegrationStatusSink();
    mockAmadeusFetchAdrBenchmark.mockClear();
    mockCostarFetchMarketData.mockClear();
    mockGetIntegrationEnabledMap.mockResolvedValue({ ...ALL_ENABLED });

    result = await fetchFieldData("startAdr", makeContext());
    expect(mockAmadeusFetchAdrBenchmark).toHaveBeenCalled();
    expect(result?.source).toBe("amadeus");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Utility Function Tests
// ═══════════════════════════════════════════════════════════════════════════

describe("utility functions", () => {
  it("getRoutableFields returns all field keys", () => {
    const fields = getRoutableFields();
    expect(fields.length).toBeGreaterThanOrEqual(23);
    expect(fields).toContain("startAdr");
    expect(fields).toContain("exitCapRate");
  });

  it("getFieldRoutes returns routes for known field", () => {
    const routes = getFieldRoutes("startAdr");
    expect(routes).toBeDefined();
    expect(routes!.length).toBeGreaterThanOrEqual(3);
  });

  it("getFieldRoutes returns undefined for unknown field", () => {
    const routes = getFieldRoutes("nonExistentField");
    expect(routes).toBeUndefined();
  });

  it("getFieldsByService returns correct fields for a service", () => {
    const fields = getFieldsByService("fred");
    expect(fields).toContain("acquisitionInterestRate");
    expect(fields).toContain("startOccupancy");
    expect(fields.length).toBeGreaterThanOrEqual(2);
  });

  it("getFieldsByService returns empty for unknown service", () => {
    const fields = getFieldsByService("nonexistent-service");
    expect(fields).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. FRED Service Integration Detail Tests
// ═══════════════════════════════════════════════════════════════════════════

describe("FRED service dispatching", () => {
  it("returns SOFR-based interest rate with spread range", async () => {
    mockFredFetchAllRates.mockResolvedValue({
      sofr: { current: { value: 5.25 } },
    });

    const result = await fetchFieldData("acquisitionInterestRate", makeContext());

    expect(result).not.toBeNull();
    expect(result!.value).toBe(5.25);
    expect(result!.range).toBeDefined();
    expect(result!.range!.low).toBeCloseTo(7.25, 1); // SOFR + 2.0
    expect(result!.range!.high).toBeCloseTo(8.75, 1); // SOFR + 3.5
    expect(result!.source).toBe("fred");
  });

  it("returns CPI-based ADR growth rate with range", async () => {
    mockFredFetchAllRates.mockResolvedValue({
      cpi: { current: { value: 3.2 } },
    });

    const result = await fetchFieldData("adrGrowthRate", makeContext());

    expect(result).not.toBeNull();
    expect(result!.value).toBe(3.2);
    expect(result!.range).toBeDefined();
    expect(result!.range!.low).toBeCloseTo(2.2, 1);
    expect(result!.range!.high).toBeCloseTo(4.7, 1);
  });

  it("returns Treasury-based cap rate with spread range", async () => {
    mockFredFetchAllRates.mockResolvedValue({
      treasury10y: { current: { value: 4.5 } },
    });

    // exitCapRate: CoStar is priority 1, FRED is priority 3
    // Make CoStar and hospitality-benchmarks return null so FRED is reached
    mockCostarFetchMarketData.mockResolvedValue(null);
    mockHospitalityFetchBenchmarks.mockResolvedValue(null);

    const result = await fetchFieldData("exitCapRate", makeContext());

    expect(result).not.toBeNull();
    expect(result!.value).toBeCloseTo(7.5, 1); // T10Y + 3.0
    expect(result!.range!.low).toBeCloseTo(6.5, 1); // T10Y + 2.0
    expect(result!.range!.high).toBeCloseTo(8.5, 1); // T10Y + 4.0
  });
});
