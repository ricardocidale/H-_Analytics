import { LRUCache } from "lru-cache";
import { stableHash } from "../scenarios/stable-json";
import type { PortfolioComputeResult } from "./core/types";
import { logger } from "../logger";

const CACHE_MAX_ENTRIES = 200;
const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  result: PortfolioComputeResult;
  computedAt: number;
  inputHash: string;
}

const cache = new LRUCache<string, CacheEntry>({
  max: CACHE_MAX_ENTRIES,
  ttl: CACHE_TTL_MS,
});

let hits = 0;
let misses = 0;

export function computeCacheKey(input: unknown): string {
  return stableHash(input);
}

export function getCachedResult(inputHash: string): PortfolioComputeResult | null {
  const entry = cache.get(inputHash);
  if (entry) {
    hits++;
    return entry.result;
  }
  misses++;
  return null;
}

export function setCachedResult(inputHash: string, result: PortfolioComputeResult): void {
  cache.set(inputHash, {
    result,
    computedAt: Date.now(),
    inputHash,
  });
}

export function invalidateComputeCache(): void {
  const size = cache.size;
  cache.clear();
  if (size > 0) {
    logger.info(`[finance-cache] Invalidated ${size} cached computation(s)`);
  }
}

export function getCacheStatus() {
  return {
    size: cache.size,
    maxSize: CACHE_MAX_ENTRIES,
    ttlMs: CACHE_TTL_MS,
    hits,
    misses,
    hitRate: hits + misses > 0 ? hits / (hits + misses) : 0,
  };
}

export function resetCacheStats(): void {
  hits = 0;
  misses = 0;
}
