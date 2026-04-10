import { Redis } from "@upstash/redis";
import { createHash } from "crypto";
import { logger } from "./logger";

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  invalidations: number;
}

const stats: CacheStats = { hits: 0, misses: 0, sets: 0, invalidations: 0 };

export function hashKey(inputs: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(inputs)).digest("hex").slice(0, 16);
}

export class CacheService {
  async get<T>(key: string): Promise<T | null> {
    const r = getRedis();
    if (!r) return null;
    try {
      const val = await r.get<T>(key);
      if (val !== null && val !== undefined) {
        stats.hits++;
        return val;
      }
      stats.misses++;
      return null;
    } catch (err: unknown) {
      logger.warn(`Cache get error for ${key}: ${err}`, "cache");
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const r = getRedis();
    if (!r) return;
    try {
      if (ttlSeconds) {
        await r.set(key, value, { ex: ttlSeconds });
      } else {
        await r.set(key, value);
      }
      stats.sets++;
    } catch (err: unknown) {
      logger.warn(`Cache set error for ${key}: ${err}`, "cache");
    }
  }

  async cacheThrough<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const result = await fn();
    await this.set(key, result, ttlSeconds);
    return result;
  }

  async staleWhileRevalidate<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      fn()
        .then((fresh) => {
          if (fresh !== null && fresh !== undefined) {
            this.set(key, fresh, ttlSeconds);
          }
        })
        .catch((err) => logger.warn(`SWR background refresh failed for ${key}: ${err}`, "cache"));
      return cached;
    }

    const result = await fn();
    if (result !== null && result !== undefined) {
      await this.set(key, result, ttlSeconds);
    }
    return result;
  }

  async invalidate(pattern: string): Promise<number> {
    const r = getRedis();
    if (!r) return 0;
    try {
      let cursor = "0";
      let deleted = 0;
      do {
        const [nextCursor, keys] = await r.scan(Number(cursor), { match: pattern, count: 100 });
        cursor = String(nextCursor);
        if (keys.length > 0) {
          await r.del(...keys);
          deleted += keys.length;
        }
      } while (cursor !== "0");
      stats.invalidations += deleted;
      return deleted;
    } catch (err: unknown) {
      logger.warn(`Cache invalidate error for ${pattern}: ${err}`, "cache");
      return 0;
    }
  }

  async getStats(): Promise<CacheStats & { keyCount: number; connected: boolean }> {
    const r = getRedis();
    if (!r) return { ...stats, keyCount: 0, connected: false };
    try {
      const dbSize = await r.dbsize();
      return { ...stats, keyCount: dbSize, connected: true };
    } catch {
      return { ...stats, keyCount: 0, connected: false };
    }
  }

  async clearAll(): Promise<void> {
    const r = getRedis();
    if (!r) return;
    try {
      await r.flushdb();
    } catch (err: unknown) {
      logger.warn(`Cache clearAll error: ${err}`, "cache");
    }
  }
}

export const cache = new CacheService();
