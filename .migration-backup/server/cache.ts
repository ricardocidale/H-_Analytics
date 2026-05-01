/**
 * Postgres-backed cache (Neon).
 *
 * Replaces the previous Upstash Redis implementation per the
 * "Neon and Neon Vector are the only databases" directive. The public API
 * surface (`CacheService`, `cache`, `hashKey`) is identical so the 17+
 * services that import it do not change.
 *
 * Storage: a single `cache_entries` table on the same Neon Postgres pool
 * the rest of the app uses. Entries carry an optional `expires_at`; reads
 * filter expired rows so a background sweeper isn't strictly required for
 * correctness, only for housekeeping. A best-effort sweep runs on every
 * write (cheap LRU-style: deletes a small batch of expired rows).
 *
 * Trade-offs vs Redis:
 *   - Higher per-op latency (~1–5 ms vs sub-ms).
 *   - Acceptable for this app's workload: research result caching, rate-feed
 *     caching, market-intel aggregation — all high-latency upstream calls
 *     where 1–5 ms is irrelevant.
 *   - Shared across multiple instances at deploy time (matches Redis behavior).
 */

import { createHash } from "crypto";
import { pool } from "./db";
import { logger } from "./logger";

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

/**
 * Convert a Redis-style glob pattern (e.g. "research:*") to a SQL LIKE
 * pattern (e.g. "research:%"). Escapes existing SQL wildcards so callers
 * can keep using their Redis-style patterns unchanged.
 */
function globToLike(pattern: string): string {
  return pattern.replace(/([%_])/g, "\\$1").replace(/\*/g, "%");
}

let lastSweepAt = 0;
const SWEEP_INTERVAL_MS = 60_000;

async function maybeSweepExpired(): Promise<void> {
  const now = Date.now();
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;
  try {
    await pool.query(
      `DELETE FROM cache_entries
       WHERE cache_key IN (
         SELECT cache_key FROM cache_entries
         WHERE expires_at IS NOT NULL AND expires_at <= NOW()
         LIMIT 500
       )`,
    );
  } catch (err: unknown) {
    logger.warn(`Cache sweep error: ${err instanceof Error ? err.message : String(err)}`, "cache");
  }
}

export class CacheService {
  async get<T>(key: string): Promise<T | null> {
    try {
      const res = await pool.query<{ value: T }>(
        `SELECT value FROM cache_entries
         WHERE cache_key = $1
           AND (expires_at IS NULL OR expires_at > NOW())`,
        [key],
      );
      if (res.rowCount && res.rowCount > 0) {
        stats.hits++;
        return res.rows[0].value;
      }
      stats.misses++;
      return null;
    } catch (err: unknown) {
      logger.warn(`Cache get error for ${key}: ${err instanceof Error ? err.message : String(err)}`, "cache");
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      const expiresAt = ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000) : null;
      await pool.query(
        `INSERT INTO cache_entries (cache_key, value, expires_at, updated_at)
         VALUES ($1, $2::jsonb, $3, NOW())
         ON CONFLICT (cache_key) DO UPDATE
           SET value = EXCLUDED.value,
               expires_at = EXCLUDED.expires_at,
               updated_at = NOW()`,
        [key, JSON.stringify(value), expiresAt],
      );
      stats.sets++;
      void maybeSweepExpired();
    } catch (err: unknown) {
      logger.warn(`Cache set error for ${key}: ${err instanceof Error ? err.message : String(err)}`, "cache");
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
    try {
      const likePattern = globToLike(pattern);
      const res = await pool.query(
        `DELETE FROM cache_entries WHERE cache_key LIKE $1 ESCAPE '\\'`,
        [likePattern],
      );
      const deleted = res.rowCount ?? 0;
      stats.invalidations += deleted;
      return deleted;
    } catch (err: unknown) {
      logger.warn(`Cache invalidate error for ${pattern}: ${err instanceof Error ? err.message : String(err)}`, "cache");
      return 0;
    }
  }

  async getStats(): Promise<CacheStats & { keyCount: number; connected: boolean }> {
    try {
      const res = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM cache_entries
         WHERE expires_at IS NULL OR expires_at > NOW()`,
      );
      return { ...stats, keyCount: Number(res.rows[0]?.count ?? 0), connected: true };
    } catch {
      return { ...stats, keyCount: 0, connected: false };
    }
  }

  async clearAll(): Promise<void> {
    try {
      await pool.query(`TRUNCATE TABLE cache_entries`);
    } catch (err: unknown) {
      logger.warn(`Cache clearAll error: ${err instanceof Error ? err.message : String(err)}`, "cache");
    }
  }
}

export const cache = new CacheService();
