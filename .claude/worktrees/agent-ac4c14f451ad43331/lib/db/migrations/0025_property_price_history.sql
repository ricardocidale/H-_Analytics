-- 0025_property_price_history.sql
--
-- Adds the acquisition price-history fields to both `prospective_properties`
-- (PropertyFinder targets) and `properties` (real portfolio rows). The
-- `price_events` jsonb is the canonical event log, the rest are denormalised
-- roll-ups maintained by shared/price-history.ts so the panel, the chip on
-- cards, the Analyst, and any export read the same numbers.
--
-- Defaults are deliberately wide (null for un-known roll-ups, '[]' for the
-- event log, 'firm'/0 for tier/relist count) so existing rows backfill into
-- a sane "no history yet" state without a separate data migration.

ALTER TABLE "prospective_properties"
  ADD COLUMN IF NOT EXISTS "price_events" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "original_list_price" real,
  ADD COLUMN IF NOT EXISTS "original_list_date" text,
  ADD COLUMN IF NOT EXISTS "prior_sale_price" real,
  ADD COLUMN IF NOT EXISTS "prior_sale_date" text,
  ADD COLUMN IF NOT EXISTS "cumulative_drop_pct" real,
  ADD COLUMN IF NOT EXISTS "current_dom" integer,
  ADD COLUMN IF NOT EXISTS "relist_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "motivation_tier" text NOT NULL DEFAULT 'firm';
--> statement-breakpoint
ALTER TABLE "properties"
  ADD COLUMN IF NOT EXISTS "price_events" jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "original_list_price" real,
  ADD COLUMN IF NOT EXISTS "original_list_date" text,
  ADD COLUMN IF NOT EXISTS "prior_sale_price" real,
  ADD COLUMN IF NOT EXISTS "prior_sale_date" text,
  ADD COLUMN IF NOT EXISTS "cumulative_drop_pct" real,
  ADD COLUMN IF NOT EXISTS "current_dom" integer,
  ADD COLUMN IF NOT EXISTS "relist_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "motivation_tier" text;
