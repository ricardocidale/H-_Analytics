/**
 * pietro-tables-001 — REIT benchmark and competitor rate cache tables.
 *
 * Belt-and-suspenders for 0045 SQL migration. Ensures both Pietro cache
 * tables exist on any DB regardless of Drizzle journal state.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] pietro-tables-001";

export async function runPietroTables001(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS reit_benchmarks (
      id         integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      ticker     text NOT NULL,
      metric_key text NOT NULL,
      value      double precision,
      period     text NOT NULL,
      source     text NOT NULL,
      fetched_at timestamp NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS reit_benchmarks_ticker_metric_period_uniq
      ON reit_benchmarks (ticker, metric_key, period)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS reit_benchmarks_ticker_idx
      ON reit_benchmarks (ticker)
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS reit_benchmarks_fetched_idx
      ON reit_benchmarks (fetched_at)
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS competitor_rates (
      id                integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      market            text NOT NULL,
      property_category text,
      check_in_date     date,
      avg_rate          double precision,
      currency          text NOT NULL DEFAULT 'USD',
      source            text NOT NULL,
      fetched_at        timestamp NOT NULL DEFAULT now()
    )
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS competitor_rates_market_category_checkin_source_uniq
      ON competitor_rates (market, property_category, check_in_date, source) NULLS NOT DISTINCT
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS competitor_rates_market_fetched_idx
      ON competitor_rates (market, fetched_at)
  `);

  logger.info(`${TAG} reit_benchmarks and competitor_rates tables ensured`);
}
