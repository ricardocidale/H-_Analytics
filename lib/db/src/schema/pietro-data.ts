import {
  pgTable,
  integer,
  text,
  doublePrecision,
  date,
  timestamp,
  unique,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ────────────────────────────────────────────────────────────────────────────
// reit_benchmarks — quarterly REIT financial metrics pre-populated by
// MinionFmpReit and MinionDaloopaReit on a weekly schedule.
//
// Unique key: (ticker, metric_key, period). Upserts update value + source
// when the same ticker+period is re-fetched.
// ────────────────────────────────────────────────────────────────────────────

export const reitBenchmarks = pgTable(
  "reit_benchmarks",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    ticker: text("ticker").notNull(),
    metricKey: text("metric_key").notNull(),
    value: doublePrecision("value"),
    // Quarterly period string, e.g. "2024-Q4".
    period: text("period").notNull(),
    // "fmp" | "daloopa"
    source: text("source").notNull(),
    fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("reit_benchmarks_ticker_metric_period_uniq").on(t.ticker, t.metricKey, t.period),
    index("reit_benchmarks_ticker_idx").on(t.ticker),
    index("reit_benchmarks_fetched_idx").on(t.fetchedAt),
  ],
);

export type ReitBenchmarkRow = typeof reitBenchmarks.$inferSelect;
export type InsertReitBenchmark = typeof reitBenchmarks.$inferInsert;

// ────────────────────────────────────────────────────────────────────────────
// competitor_rates — weekly hotel rate snapshots pre-populated by
// MinionBookingRates and MinionExpediaRates.
//
// Unique key: (market, property_category, check_in_date, source). Weekly
// snapshots are additive; queries use ORDER BY fetched_at DESC for freshest.
// ────────────────────────────────────────────────────────────────────────────

export const competitorRates = pgTable(
  "competitor_rates",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    market: text("market").notNull(),
    propertyCategory: text("property_category"),
    checkInDate: date("check_in_date"),
    avgRate: doublePrecision("avg_rate"),
    currency: text("currency").notNull().default("USD"),
    // "booking" | "expedia"
    source: text("source").notNull(),
    fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  },
  (t) => [
    // NULLS NOT DISTINCT: treat NULL nullable columns as equal for dedup purposes.
    // Prevents unbounded duplicate rows from weekly re-fetches that omit optional fields.
    unique("competitor_rates_market_category_checkin_source_uniq")
      .on(t.market, t.propertyCategory, t.checkInDate, t.source)
      .nullsNotDistinct(),
    index("competitor_rates_market_fetched_idx").on(t.market, t.fetchedAt),
  ],
);

export type CompetitorRateRow = typeof competitorRates.$inferSelect;
export type InsertCompetitorRate = typeof competitorRates.$inferInsert;
