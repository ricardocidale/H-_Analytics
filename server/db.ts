import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
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

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
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
