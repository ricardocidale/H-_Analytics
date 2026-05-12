-- 0055_vendor_passthrough_and_markup_factors
-- ICP simplification (R11-R14): two national research cache tables.
--
--   vendor_passthrough_costs  — national vendor cost as % of revenue per service line
--                               populated by MinionVendorPassthroughCosts (Gaetano)
--   mgmt_co_markup_factors    — Mgmt Co markup as % of revenue per service line
--                               populated by MinionMgmtCoMarkupFactors (Renato)
--
-- Both tables are self-idempotent (CREATE TABLE IF NOT EXISTS + IF NOT EXISTS indexes).

CREATE TABLE IF NOT EXISTS vendor_passthrough_costs (
  id               integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  service_line     text NOT NULL,
  cost_pct_revenue double precision NOT NULL,
  period           text NOT NULL,
  source           text NOT NULL,
  source_url       text,
  fetched_at       timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS vendor_passthrough_costs_line_source_period_uniq
  ON vendor_passthrough_costs (service_line, source, period);

CREATE INDEX IF NOT EXISTS vendor_passthrough_costs_service_line_idx
  ON vendor_passthrough_costs (service_line);

CREATE INDEX IF NOT EXISTS vendor_passthrough_costs_fetched_idx
  ON vendor_passthrough_costs (fetched_at);

CREATE TABLE IF NOT EXISTS mgmt_co_markup_factors (
  id                  integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  service_line        text NOT NULL,
  markup_pct_revenue  double precision NOT NULL,
  period              text NOT NULL,
  source              text NOT NULL,
  source_url          text,
  fetched_at          timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS mgmt_co_markup_factors_line_source_period_uniq
  ON mgmt_co_markup_factors (service_line, source, period);

CREATE INDEX IF NOT EXISTS mgmt_co_markup_factors_service_line_idx
  ON mgmt_co_markup_factors (service_line);

CREATE INDEX IF NOT EXISTS mgmt_co_markup_factors_fetched_idx
  ON mgmt_co_markup_factors (fetched_at);
