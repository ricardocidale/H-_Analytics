-- 0055_icp_bracket_catalog
--
-- Task #1409 — ICP Bracket Catalog foundation.
--
-- Creates:
--   icp_brackets — shared catalog of 3–5 customer-property archetypes that
--                  drive Management Company revenue/expense calculations.
--
-- Modifies:
--   global_assumptions — adds bracket_mix JSONB (weighted distribution across
--                        the catalog, weights sum to 1.0, per-company).
--
-- IF NOT EXISTS guards make this idempotent on re-run.

CREATE TABLE IF NOT EXISTS "icp_brackets" (
  "id"                          integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "slug"                        text NOT NULL,
  "name"                        text NOT NULL,
  "archetype_label"             text NOT NULL,
  "customer_type"               text NOT NULL,
  "service_consumption_profile" text NOT NULL,
  "target_adr_band_low"         real,
  "target_adr_band_high"        real,
  "comp_set_names"              jsonb,
  "description"                 text,
  "source_note"                 text,
  "is_active"                   boolean NOT NULL DEFAULT true,
  "sort_order"                  integer NOT NULL DEFAULT 0,
  "created_at"                  timestamp NOT NULL DEFAULT now(),
  "updated_at"                  timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "icp_brackets_slug_uq" UNIQUE("slug")
);

DO $$ BEGIN
  ALTER TABLE "global_assumptions" ADD COLUMN IF NOT EXISTS "bracket_mix" jsonb;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;
