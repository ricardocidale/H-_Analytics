-- Pietro data infrastructure: REIT benchmark and competitor rate cache tables.
-- These are written by Pietro minions on a schedule and read by Rebecca tools.

CREATE TABLE IF NOT EXISTS reit_benchmarks (
  id         integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  ticker     text NOT NULL,
  metric_key text NOT NULL,
  value      double precision,
  period     text NOT NULL,
  source     text NOT NULL,
  fetched_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS reit_benchmarks_ticker_metric_period_uniq
  ON reit_benchmarks (ticker, metric_key, period);

CREATE INDEX IF NOT EXISTS reit_benchmarks_ticker_idx
  ON reit_benchmarks (ticker);

CREATE INDEX IF NOT EXISTS reit_benchmarks_fetched_idx
  ON reit_benchmarks (fetched_at);

CREATE TABLE IF NOT EXISTS competitor_rates (
  id                integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  market            text NOT NULL,
  property_category text,
  check_in_date     date,
  avg_rate          double precision,
  currency          text NOT NULL DEFAULT 'USD',
  source            text NOT NULL,
  fetched_at        timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS competitor_rates_market_category_checkin_source_uniq
  ON competitor_rates (market, property_category, check_in_date, source);

CREATE INDEX IF NOT EXISTS competitor_rates_market_fetched_idx
  ON competitor_rates (market, fetched_at);
