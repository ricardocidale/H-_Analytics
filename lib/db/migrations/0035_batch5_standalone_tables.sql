-- 0035_batch5_standalone_tables.sql
--
-- Phase C batch 5: consolidate 7 runtime migrations that each create a
-- new standalone table (no destructive DDL, pure CREATE TABLE / ADD COLUMN).
--
-- Migrations consolidated:
--   market_data_tables_001           → CREATE TABLE ×5 (market data lookups)
--   scheduler_runs_001               → CREATE TABLE scheduler_runs
--   scheduler_runs_002               → CREATE TABLE scheduler_run_history + index
--   storage_drift_sweep_runs_001     → CREATE TABLE storage_drift_sweep_runs
--   cache_entries_001                → CREATE TABLE cache_entries + partial index
--   reference_range_001              → CREATE TABLE reference_range + 4 indexes + ADD COLUMN
--   properties_financials_computed_at_001 → ADD COLUMN financials_computed_at on properties
--
-- Note: properties_financials_computed_at_001 was an inline DDL gate in
-- index.ts (no separate migration file). Folded here for consolidation.

-- source: market-data-tables-001.ts
CREATE TABLE IF NOT EXISTS market_adr_index (
  id              integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  market          text NOT NULL,
  country         text NOT NULL,
  quarter         text NOT NULL,
  avg_adr         real,
  luxury_adr      real,
  upscale_adr     real,
  midscale_adr    real,
  economy_adr     real,
  boutique_adr    real,
  avg_occupancy   real,
  avg_revpar      real,
  source          text,
  source_url      text,
  updated_at      timestamp DEFAULT now() NOT NULL,
  CONSTRAINT uq_market_adr_quarter UNIQUE (market, quarter)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS seasonal_calendars (
  id                  integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  market              text NOT NULL,
  country             text NOT NULL,
  month               integer NOT NULL,
  season_type         text NOT NULL,
  demand_multiplier   real NOT NULL DEFAULT 1.0,
  avg_adr_multiplier  real DEFAULT 1.0,
  notes               text,
  updated_at          timestamp DEFAULT now() NOT NULL,
  CONSTRAINT uq_seasonal_market_month UNIQUE (market, month)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS event_calendars (
  id                  integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  market              text NOT NULL,
  country             text NOT NULL,
  event_name          text NOT NULL,
  start_month         integer,
  end_month           integer,
  specific_date       text,
  demand_impact       text NOT NULL,
  is_recurring        boolean NOT NULL DEFAULT true,
  category            text,
  estimated_attendees integer,
  notes               text,
  updated_at          timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS labor_rates (
  id              integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  market          text NOT NULL,
  country         text NOT NULL,
  role            text NOT NULL,
  hourly_rate     real,
  annual_salary   real,
  currency        text NOT NULL DEFAULT 'USD',
  employment_type text NOT NULL DEFAULT 'fte',
  source          text,
  source_url      text,
  source_year     integer,
  updated_at      timestamp DEFAULT now() NOT NULL,
  CONSTRAINT uq_labor_market_role UNIQUE (market, role, employment_type)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS fb_benchmarks (
  id                       integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  market                   text NOT NULL,
  country                  text NOT NULL,
  property_type            text NOT NULL,
  avg_ticket_per_person    real,
  avg_breakfast_ticket     real,
  avg_lunch_ticket         real,
  avg_dinner_ticket        real,
  avg_bar_revenue_per_guest real,
  covers_per_room_night    real,
  catering_cost_per_event  real,
  fb_cost_of_goods_percent real,
  fb_labor_cost_percent    real,
  source                   text,
  source_url               text,
  source_year              integer,
  updated_at               timestamp DEFAULT now() NOT NULL,
  CONSTRAINT uq_fb_market_type UNIQUE (market, property_type)
);
--> statement-breakpoint

-- source: scheduler-runs-001.ts
CREATE TABLE IF NOT EXISTS scheduler_runs (
  scheduler_key    text PRIMARY KEY,
  scheduler_label  text NOT NULL,
  last_run_at      timestamp NOT NULL DEFAULT NOW(),
  considered       integer NOT NULL DEFAULT 0,
  succeeded        integer NOT NULL DEFAULT 0,
  failed           integer NOT NULL DEFAULT 0,
  status           text NOT NULL,
  notes            text,
  cycle_interval_ms bigint NOT NULL,
  duration_ms      integer,
  updated_at       timestamp NOT NULL DEFAULT NOW()
);
--> statement-breakpoint

-- source: scheduler-runs-002.ts
CREATE TABLE IF NOT EXISTS scheduler_run_history (
  id             serial PRIMARY KEY,
  scheduler_key  text NOT NULL,
  ran_at         timestamp NOT NULL DEFAULT NOW(),
  considered     integer NOT NULL DEFAULT 0,
  succeeded      integer NOT NULL DEFAULT 0,
  failed         integer NOT NULL DEFAULT 0,
  status         text NOT NULL,
  notes          text,
  duration_ms    integer
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS scheduler_run_history_key_ran_at_idx
  ON scheduler_run_history (scheduler_key, ran_at);
--> statement-breakpoint

-- source: storage-drift-sweep-runs-001.ts
CREATE TABLE IF NOT EXISTS storage_drift_sweep_runs (
  id             text PRIMARY KEY,
  finished_at    timestamp NOT NULL,
  exit_code      integer NOT NULL,
  status         text NOT NULL,
  rewrote_count  integer NOT NULL DEFAULT 0,
  copied_count   integer NOT NULL DEFAULT 0,
  skipped_count  integer NOT NULL DEFAULT 0,
  failed_count   integer NOT NULL DEFAULT 0,
  residual_count integer NOT NULL DEFAULT 0,
  run_id         text,
  run_url        text,
  trigger        text,
  trigger_reason text,
  notes          text,
  updated_at     timestamp NOT NULL DEFAULT NOW()
);
--> statement-breakpoint

-- source: cache-entries-001.ts
CREATE TABLE IF NOT EXISTS cache_entries (
  cache_key  text        PRIMARY KEY,
  value      jsonb       NOT NULL,
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS cache_entries_expires_idx
  ON cache_entries (expires_at)
  WHERE expires_at IS NOT NULL;
--> statement-breakpoint

-- source: reference-range-001.ts
CREATE TABLE IF NOT EXISTS reference_range (
  id              integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  domain          text    NOT NULL,
  metric_key      text    NOT NULL,
  label           text    NOT NULL,
  country         text    NOT NULL DEFAULT 'GLOBAL',
  subdivision     text,
  market          text,
  segment         text,
  property_type   text,
  year            integer NOT NULL,
  effective_from  date,
  effective_until date,
  low             real    NOT NULL,
  mid             real    NOT NULL,
  high            real    NOT NULL,
  unit            text    NOT NULL,
  source_id       integer REFERENCES source_registry(id) ON DELETE SET NULL,
  source_name     text,
  source_url      text,
  methodology     text,
  confidence      text    NOT NULL DEFAULT 'medium',
  details         jsonb,
  last_verified_at timestamp,
  verified_by     text,
  archived_at     timestamp,
  created_at      timestamp NOT NULL DEFAULT now(),
  updated_at      timestamp NOT NULL DEFAULT now(),
  CONSTRAINT reference_range_unique UNIQUE NULLS NOT DISTINCT (
    domain, metric_key, country, subdivision, market, segment, property_type, year
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS reference_range_lookup_idx
  ON reference_range (domain, metric_key, country, year);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS reference_range_jurisdiction_idx
  ON reference_range (country, subdivision, market);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS reference_range_source_idx
  ON reference_range (source_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS reference_range_verified_idx
  ON reference_range (last_verified_at);
--> statement-breakpoint
ALTER TABLE reference_range ADD COLUMN IF NOT EXISTS verified_by text;
--> statement-breakpoint

-- source: properties_financials_computed_at_001 (inline gate in index.ts)
ALTER TABLE properties ADD COLUMN IF NOT EXISTS financials_computed_at timestamp;
