/**
 * cache_entries — simple key/value cache table with optional TTL.
 *
 * Created by runtime migration `cache-entries-001.ts`. This Drizzle schema
 * declaration brings the table into the type-safe schema graph so queries
 * can use the ORM helpers and so drizzle-kit generate can track it.
 *
 * The `expires_at` partial index (WHERE expires_at IS NOT NULL) is registered
 * here; the idempotent SQL is emitted in migration 0026.
 */
import { pgTable, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const cacheEntries = pgTable("cache_entries", {
  cacheKey: text("cache_key").primaryKey(),
  value: jsonb("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // Partial index: only index rows that actually expire (saves space and
  // keeps the TTL-cleanup query fast). The WHERE clause matches the SQL
  // migration in 0026_scenario_share_consolidation.sql.
  index("cache_entries_expires_idx").on(table.expiresAt).where(sql`"expires_at" IS NOT NULL`),
]);

export type CacheEntry = typeof cacheEntries.$inferSelect;
export type InsertCacheEntry = typeof cacheEntries.$inferInsert;
