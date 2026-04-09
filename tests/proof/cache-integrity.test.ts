import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  computeCacheKey,
  getCachedResult,
  setCachedResult,
  invalidateComputeCache,
  getCacheStatus,
  resetCacheStats,
} from "../../server/finance/cache";
import { stableHash } from "../../server/scenarios/stable-json";
import type { PortfolioComputeResult } from "../../server/finance/core/types";

function makeDummyResult(tag: string): PortfolioComputeResult {
  return { _tag: tag } as unknown as PortfolioComputeResult;
}

describe("T017 — Cache Integrity", () => {
  beforeEach(() => {
    invalidateComputeCache();
    resetCacheStats();
  });

  describe("hash determinism", () => {
    it("same input always produces the same cache key", () => {
      const input = { properties: [{ id: 1, adr: 250 }], projectionYears: 5 };
      const k1 = computeCacheKey(input);
      const k2 = computeCacheKey(input);
      expect(k1).toBe(k2);
    });

    it("key order does not affect hash", () => {
      const a = computeCacheKey({ x: 1, y: 2 });
      const b = computeCacheKey({ y: 2, x: 1 });
      expect(a).toBe(b);
    });

    it("different input produces different cache key", () => {
      const k1 = computeCacheKey({ adr: 250 });
      const k2 = computeCacheKey({ adr: 251 });
      expect(k1).not.toBe(k2);
    });

    it("cache key matches stableHash output", () => {
      const input = { rooms: 10, rate: 0.05 };
      expect(computeCacheKey(input)).toBe(stableHash(input));
    });

    it("nested object order does not affect hash", () => {
      const a = computeCacheKey({ p: { b: 2, a: 1 } });
      const b = computeCacheKey({ p: { a: 1, b: 2 } });
      expect(a).toBe(b);
    });
  });

  describe("get/set cycle", () => {
    it("returns null for cache miss", () => {
      const result = getCachedResult("nonexistent");
      expect(result).toBeNull();
    });

    it("returns cached result for cache hit", () => {
      const key = computeCacheKey({ test: true });
      const dummy = makeDummyResult("hit");
      setCachedResult(key, dummy);
      const cached = getCachedResult(key);
      expect(cached).toBe(dummy);
    });

    it("same key overwrites previous entry", () => {
      const key = computeCacheKey({ overwrite: true });
      setCachedResult(key, makeDummyResult("v1"));
      setCachedResult(key, makeDummyResult("v2"));
      const cached = getCachedResult(key) as unknown as { _tag: string };
      expect(cached._tag).toBe("v2");
    });
  });

  describe("invalidation", () => {
    it("invalidateComputeCache clears all entries", () => {
      setCachedResult("k1", makeDummyResult("a"));
      setCachedResult("k2", makeDummyResult("b"));
      expect(getCacheStatus().size).toBe(2);
      invalidateComputeCache();
      expect(getCacheStatus().size).toBe(0);
      expect(getCachedResult("k1")).toBeNull();
      expect(getCachedResult("k2")).toBeNull();
    });

    it("invalidation is idempotent (double clear does not throw)", () => {
      invalidateComputeCache();
      invalidateComputeCache();
      expect(getCacheStatus().size).toBe(0);
    });
  });

  describe("stats tracking", () => {
    it("tracks hits and misses accurately", () => {
      const key = computeCacheKey({ stats: true });
      setCachedResult(key, makeDummyResult("s"));

      getCachedResult(key);
      getCachedResult(key);
      getCachedResult("miss1");

      const status = getCacheStatus();
      expect(status.hits).toBe(2);
      expect(status.misses).toBe(1);
      expect(status.hitRate).toBeCloseTo(2 / 3, 5);
    });

    it("resetCacheStats zeroes counters", () => {
      getCachedResult("miss");
      expect(getCacheStatus().misses).toBe(1);
      resetCacheStats();
      const status = getCacheStatus();
      expect(status.hits).toBe(0);
      expect(status.misses).toBe(0);
      expect(status.hitRate).toBe(0);
    });

    it("reports correct max size and TTL", () => {
      const status = getCacheStatus();
      expect(status.maxSize).toBe(200);
      expect(status.ttlMs).toBe(60_000);
    });
  });

  describe("data integrity", () => {
    it("cached result is reference-identical to stored result", () => {
      const key = computeCacheKey({ ref: true });
      const result = makeDummyResult("ref-test");
      setCachedResult(key, result);
      const cached = getCachedResult(key);
      expect(cached).toBe(result);
    });

    it("different inputs never collide", () => {
      const inputs = Array.from({ length: 50 }, (_, i) => ({ id: i, adr: 100 + i }));
      const keys = inputs.map(computeCacheKey);
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(50);
    });

    it("numeric precision differences produce different cache keys", () => {
      const k1 = computeCacheKey({ rate: 0.0875 });
      const k2 = computeCacheKey({ rate: 0.09 });
      expect(k1).not.toBe(k2);
    });

    it("cached result object is not cloned (reference semantics)", () => {
      const key = computeCacheKey({ mutation: true });
      const original = makeDummyResult("mutable") as unknown as Record<string, unknown>;
      setCachedResult(key, original as unknown as PortfolioComputeResult);
      const cached = getCachedResult(key) as unknown as Record<string, unknown>;
      cached["injected"] = "poison";
      const refetch = getCachedResult(key) as unknown as Record<string, unknown>;
      expect(refetch["injected"]).toBe("poison");
    });
  });

  describe("LRU eviction behavior", () => {
    it("cache does not exceed maxSize entries (LRU eviction)", () => {
      for (let i = 0; i < 210; i++) {
        setCachedResult(`key-${i}`, makeDummyResult(`v-${i}`));
      }
      const status = getCacheStatus();
      expect(status.size).toBeLessThanOrEqual(200);
    });

    it("oldest entries are evicted first", () => {
      for (let i = 0; i < 205; i++) {
        setCachedResult(`lru-${i}`, makeDummyResult(`lru-v-${i}`));
      }
      expect(getCachedResult("lru-0")).toBeNull();
      expect(getCachedResult("lru-204")).not.toBeNull();
    });
  });

  describe("invalidation triggers exist on mutation routes", () => {
    const mutationRouteFiles = [
      "server/routes/properties.ts",
      "server/routes/global-assumptions.ts",
      "server/routes/scenarios.ts",
      "server/routes/finance.ts",
    ];

    for (const file of mutationRouteFiles) {
      it(`${file} imports invalidateComputeCache`, () => {
        const fs = require("fs");
        const content = fs.readFileSync(file, "utf-8");
        expect(content).toContain("invalidateComputeCache");
      });
    }
  });
});
