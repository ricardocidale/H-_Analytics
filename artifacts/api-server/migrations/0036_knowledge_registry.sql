-- 0036_knowledge_registry
--
-- Creates two tables for the Knowledge Registry feature (U1):
--
--   knowledge_registry  — catalog of all knowledge assets (vector namespaces,
--                         benchmark tables, brand comps, country economic data).
--                         Keyed by a slug id (e.g. "market-research").
--
--   country_economic_data — macro-economic indicators per country (ISO 3166-1
--                           alpha-2 code), upserted on each refresh cycle.

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS knowledge_registry (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL,
  how_built TEXT NOT NULL,
  source_description TEXT NOT NULL,
  renewal_mechanism TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  asset_ref TEXT NOT NULL,
  last_refreshed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS country_economic_data (
  id SERIAL PRIMARY KEY,
  country_code TEXT NOT NULL UNIQUE,
  country_name TEXT NOT NULL,
  inflation_rate NUMERIC,
  fx_rate_to_usd NUMERIC,
  gdp_growth_rate NUMERIC,
  interest_rate NUMERIC,
  sourced_at TIMESTAMPTZ,
  source_notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
