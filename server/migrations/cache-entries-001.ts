import { db } from "../db";
import { sql } from "drizzle-orm";

const TAG = "[migration] cache-entries-001";

export async function runCacheEntries001(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS cache_entries (
      cache_key  text        PRIMARY KEY,
      value      jsonb       NOT NULL,
      expires_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS cache_entries_expires_idx
      ON cache_entries (expires_at)
      WHERE expires_at IS NOT NULL
  `);
}
