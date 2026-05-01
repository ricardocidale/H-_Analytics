import { describe, it, expect, beforeEach } from "vitest";
import {
  computeCacheKey,
  getCachedResult,
  setCachedResult,
  invalidateComputeCache,
  getCacheStatus,
  resetCacheStats,
} from "../../server/finance/cache";
import type { PortfolioComputeResult } from "../../server/finance/core/types";
import { computePortfolioProjection, computeSingleProperty } from "../../server/finance/service";

function makeMockResult(overrides?: Partial<PortfolioComputeResult>): PortfolioComputeResult {
  return {
    engineVersion: "1.0.0",
    computedAt: new Date().toISOString(),
    perPropertyYearly: {},
    perPropertyMonthly: {},
    consolidatedYearly: [],
    companyMonthly: [],
    companyYearly: [],
    outputHash: "mock-hash-" + Math.random().toString(36).slice(2),
    propertyCount: 1,
    projectionYears: 10,
    cached: false,
    validationSummary: {
      opinion: "UNQUALIFIED",
      identityChecks: 5,
      passed: 5,
      failed: 0,
    },
    ...overrides,
  };
}

describe("Finance Compute Cache", () => {
  beforeEach(() => {
    invalidateComputeCache();
    resetCacheStats();
  });

  describe("computeCacheKey", () => {
    it("produces deterministic hashes for identical inputs", () => {
      const input = { properties: [{ id: 1, name: "Hotel A" }], assumptions: { inflationRate: 0.03 } };
      const hash1 = computeCacheKey(input);
      const hash2 = computeCacheKey(input);
      expect(hash1).toBe(hash2);
    });

    it("produces deterministic hashes regardless of key order", () => {
      const input1 = { a: 1, b: 2, c: 3 };
      const input2 = { c: 3, a: 1, b: 2 };
      expect(computeCacheKey(input1)).toBe(computeCacheKey(input2));
    });

    it("produces different hashes for different inputs", () => {
      const hash1 = computeCacheKey({ rate: 0.05 });
      const hash2 = computeCacheKey({ rate: 0.06 });
      expect(hash1).not.toBe(hash2);
    });

    it("returns a non-empty string", () => {
      const hash = computeCacheKey({ foo: "bar" });
      expect(hash).toBeTruthy();
      expect(typeof hash).toBe("string");
      expect(hash.length).toBeGreaterThan(0);
    });
  });

  describe("get / set cached results", () => {
    it("returns null for a cache miss", () => {
      const result = getCachedResult("nonexistent-hash");
      expect(result).toBeNull();
    });

    it("returns cached result on hit", () => {
      const mockResult = makeMockResult({ propertyCount: 7 });
      const hash = "test-hash-1";
      setCachedResult(hash, mockResult);
      const cached = getCachedResult(hash);
      expect(cached).not.toBeNull();
      expect(cached!.propertyCount).toBe(7);
    });

    it("tracks hit/miss statistics correctly", () => {
      const hash = "stats-test";
      setCachedResult(hash, makeMockResult());

      getCachedResult("miss-1");
      getCachedResult("miss-2");
      getCachedResult(hash);

      const status = getCacheStatus();
      expect(status.hits).toBe(1);
      expect(status.misses).toBe(2);
      expect(status.hitRate).toBeCloseTo(1 / 3, 5);
    });

    it("stores multiple entries independently", () => {
      setCachedResult("hash-a", makeMockResult({ propertyCount: 3 }));
      setCachedResult("hash-b", makeMockResult({ propertyCount: 5 }));

      expect(getCachedResult("hash-a")!.propertyCount).toBe(3);
      expect(getCachedResult("hash-b")!.propertyCount).toBe(5);
    });
  });

  describe("invalidateComputeCache", () => {
    it("clears all cached entries", () => {
      setCachedResult("hash-1", makeMockResult());
      setCachedResult("hash-2", makeMockResult());
      expect(getCacheStatus().size).toBe(2);

      invalidateComputeCache();
      expect(getCacheStatus().size).toBe(0);
      expect(getCachedResult("hash-1")).toBeNull();
      expect(getCachedResult("hash-2")).toBeNull();
    });

    it("is safe to call when cache is empty", () => {
      expect(() => invalidateComputeCache()).not.toThrow();
      expect(getCacheStatus().size).toBe(0);
    });
  });

  describe("getCacheStatus", () => {
    it("returns correct structure with zero stats initially", () => {
      const status = getCacheStatus();
      expect(status.size).toBe(0);
      expect(status.maxSize).toBe(200);
      expect(status.ttlMs).toBe(60_000);
      expect(status.hits).toBe(0);
      expect(status.misses).toBe(0);
      expect(status.hitRate).toBe(0);
    });

    it("reflects cache size after insertions", () => {
      setCachedResult("a", makeMockResult());
      setCachedResult("b", makeMockResult());
      setCachedResult("c", makeMockResult());
      expect(getCacheStatus().size).toBe(3);
    });
  });

  describe("resetCacheStats", () => {
    it("resets hit/miss counters without clearing cache entries", () => {
      setCachedResult("keep-me", makeMockResult());
      getCachedResult("keep-me");
      getCachedResult("nope");

      resetCacheStats();
      const status = getCacheStatus();
      expect(status.hits).toBe(0);
      expect(status.misses).toBe(0);
      expect(status.size).toBe(1);
    });
  });

  describe("end-to-end cache workflow", () => {
    it("cache key → set → get → invalidate → miss", () => {
      const input = { properties: [{ id: 42 }], assumptions: { capRate: 0.07 } };
      const key = computeCacheKey(input);
      const result = makeMockResult({ projectionYears: 10 });

      setCachedResult(key, result);
      expect(getCachedResult(key)).not.toBeNull();
      expect(getCachedResult(key)!.projectionYears).toBe(10);

      invalidateComputeCache();
      expect(getCachedResult(key)).toBeNull();
    });
  });

  describe("integration: real compute through service", () => {
    const testProperty = {
      id: 1,
      name: "Test Hotel",
      operationsStartDate: "2025-01-01",
      roomCount: 100,
      startAdr: 150,
      adrGrowthRate: 0.03,
      startOccupancy: 0.6,
      maxOccupancy: 0.85,
      occupancyRampMonths: 12,
      occupancyGrowthStep: 0.02,
      purchasePrice: 10_000_000,
      type: "hotel",
      costRateRooms: 0.25,
      costRateFB: 0.35,
      costRateAdmin: 0.08,
      costRateMarketing: 0.05,
      costRatePropertyOps: 0.04,
      costRateUtilities: 0.04,
      costRateTaxes: 0.03,
      costRateIT: 0.02,
      costRateFFE: 0.03,
      costRateOther: 0.01,
      costRateInsurance: 0.02,
      revShareEvents: 0.05,
      revShareFB: 0.10,
      revShareOther: 0.05,
    };

    const testGlobal = {
      modelStartDate: "2025-01-01",
      inflationRate: 0.03,
      marketingRate: 0.05,
      debtAssumptions: {
        interestRate: 0.065,
        amortizationYears: 25,
      },
    };

    it("portfolio compute returns valid result with correct structure", () => {
      const result = computePortfolioProjection({
        properties: [testProperty],
        globalAssumptions: testGlobal,
        projectionYears: 3,
      });

      expect(result.engineVersion).toBe("1.0.0");
      expect(result.propertyCount).toBe(1);
      expect(result.projectionYears).toBe(3);
      expect(result.outputHash).toBeTruthy();
      expect(result.validationSummary.opinion).toBe("UNQUALIFIED");
      expect(Object.keys(result.perPropertyYearly)).toHaveLength(1);
      expect(Object.keys(result.perPropertyMonthly)).toHaveLength(1);
      expect(result.consolidatedYearly).toHaveLength(3);
      expect(result.companyMonthly).toBeDefined();
      expect(result.companyMonthly!.length).toBe(36);
      expect(result.companyYearly).toBeDefined();
      expect(result.companyYearly!.length).toBe(3);
      expect(result.companyYearly![0]).toHaveProperty("totalRevenue");
      expect(result.companyYearly![0]).toHaveProperty("netIncome");
      expect(result.companyYearly![0]).toHaveProperty("endingCash");
      expect(result.cached).toBeUndefined();
    });

    it("identical input returns cached result on second call", () => {
      const input = {
        properties: [testProperty],
        globalAssumptions: testGlobal,
        projectionYears: 3,
      };

      const result1 = computePortfolioProjection(input);
      expect(result1.cached).toBeUndefined();

      const result2 = computePortfolioProjection(input);
      expect(result2.cached).toBe(true);
      expect(result2.outputHash).toBe(result1.outputHash);
    });

    it("invalidateComputeCache forces recomputation", () => {
      const input = {
        properties: [testProperty],
        globalAssumptions: testGlobal,
        projectionYears: 3,
      };

      computePortfolioProjection(input);
      const status1 = getCacheStatus();
      expect(status1.size).toBeGreaterThan(0);

      invalidateComputeCache();
      expect(getCacheStatus().size).toBe(0);

      const result = computePortfolioProjection(input);
      expect(result.cached).toBeUndefined();
    });

    it("single property compute returns valid structure", () => {
      const result = computeSingleProperty({
        property: testProperty,
        globalAssumptions: testGlobal,
        projectionYears: 3,
      });

      expect(result.engineVersion).toBe("1.0.0");
      expect(result.projectionYears).toBe(3);
      expect(result.monthly).toHaveLength(36);
      expect(result.yearly).toHaveLength(3);
      expect(result.validationSummary.opinion).toBe("UNQUALIFIED");
    });

    it("different inputs produce different output hashes", () => {
      const result1 = computePortfolioProjection({
        properties: [testProperty],
        globalAssumptions: testGlobal,
        projectionYears: 3,
      });

      const result2 = computePortfolioProjection({
        properties: [{ ...testProperty, startAdr: 200 }],
        globalAssumptions: testGlobal,
        projectionYears: 3,
      });

      expect(result1.outputHash).not.toBe(result2.outputHash);
    });
  });
});
