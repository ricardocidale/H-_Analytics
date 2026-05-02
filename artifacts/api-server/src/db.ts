import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@workspace/db";
import { requireDbUrl } from "@shared/db-url";
import {
  DB_POOL_MAX_CONNECTIONS,
  DB_POOL_MIN_CONNECTIONS,
  DB_IDLE_TIMEOUT_MS,
  DB_CONNECTION_TIMEOUT_MS,
  DB_CONNECTION_MAX_USES,
  DB_POOL_ALLOW_EXIT_ON_IDLE,
} from "./constants";
import { logger } from "./logger";

const { Pool } = pg;

// Resolution: POSTGRES_URL ?? DATABASE_URL — see shared/db-url.ts for the
// rationale (Replit reserves DATABASE_URL for its managed Helium Postgres,
// so the Neon/Vercel cutover routes through POSTGRES_URL).
const connectionString = normalizeSslMode(requireDbUrl());

/**
 * Upgrade legacy `sslmode=require|prefer|verify-ca` to `sslmode=verify-full`
 * in production. `pg-connection-string` (and `pg` v9) will stop treating the
 * legacy modes as aliases for verify-full and adopt libpq semantics, which
 * silently DOWNGRADES Neon TLS to no cert verification. Locking it to
 * `verify-full` here pins current behavior and makes the next pg major a
 * no-op. We deliberately leave dev/CI alone because local Postgres often
 * runs without a verifiable certificate.
 *
 * Do NOT remove this — see Task #949.
 */
function normalizeSslMode(url: string): string {
  if (process.env.NODE_ENV !== "production") return url;
  try {
    const parsed = new URL(url);
    const mode = parsed.searchParams.get("sslmode");
    if (mode && (mode === "require" || mode === "prefer" || mode === "verify-ca")) {
      parsed.searchParams.set("sslmode", "verify-full");
      return parsed.toString();
    }
    return url;
  } catch {
    // If the URL isn't parseable by WHATWG URL, leave it alone — pg will
    // surface a clearer error than we could.
    return url;
  }
}

export const pool = new Pool({
  connectionString,
  max: DB_POOL_MAX_CONNECTIONS,
  min: DB_POOL_MIN_CONNECTIONS,
  idleTimeoutMillis: DB_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_MS,
  maxUses: DB_CONNECTION_MAX_USES,
  allowExitOnIdle: DB_POOL_ALLOW_EXIT_ON_IDLE,
});

pool.on("error", (err) => {
  logger.error(`Unexpected pool error — connection will be replaced: ${err.message}`, "db");
});

export const db = drizzle(pool, { schema });

export async function withRetry<T>(
  fn: () => Promise<T>,
  { retries = 3, baseDelayMs = 500, label = "db-op" } = {},
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const code = (err as { code?: string }).code;
      const message = err instanceof Error ? err.message : String(err);
      const isTransient =
        code === "ECONNREFUSED" ||
        code === "ECONNRESET" ||
        code === "57P01" ||
        message.includes("timeout") ||
        message.includes("Connection terminated") ||
        message.includes("connection will be replaced");
      if (!isTransient || attempt === retries) break;
      // eslint-disable-next-line no-restricted-syntax -- retry backoff, non-financial
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      logger.warn(`Attempt ${attempt}/${retries} failed (${message}), retrying in ${delay}ms…`, label);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}
