-- =============================================================================
-- H+ Analytics — Production Schema Reconciliation
-- Date:   2026-04-21
-- Goal:   Bring prod schema in line with main so the next deploy's drizzle-kit
--         push step has only additive (zero-prompt, zero-data-loss) changes.
-- Linear: NAI-26 (deploy blocker) + clears path for NAI-13 Phase 1 dry-run.
--
-- Verified prod data (read at 2026-04-21):
--   global_assumptions: 1 row with safe_* values ($1M / $1M / $2.5M / 20%)
--                      → renamed in place, values preserved.
--   users.company_id:   4 non-null rows; users.company text already matches
--                      (KIT Capital ×3, Numeratti Endeavors ×1) → safe to drop.
--   users.google_drive_connected: 19 non-null rows, 0 true → safe to drop.
--
-- Run via:  Database tool → Production tab → SQL editor → paste & execute.
-- All work is wrapped in one transaction; rollback on any failure.
-- =============================================================================

BEGIN;

-- 1) Install pgvector (the original deploy blocker; needed for vector_chunks).
CREATE EXTENSION IF NOT EXISTS vector;

-- 2) Apply 0011_capital_raise_rename in place (preserves all values).
ALTER TABLE global_assumptions RENAME COLUMN safe_tranche1_amount  TO capital_raise_1_amount;
ALTER TABLE global_assumptions RENAME COLUMN safe_tranche1_date    TO capital_raise_1_date;
ALTER TABLE global_assumptions RENAME COLUMN safe_tranche2_amount  TO capital_raise_2_amount;
ALTER TABLE global_assumptions RENAME COLUMN safe_tranche2_date    TO capital_raise_2_date;
ALTER TABLE global_assumptions RENAME COLUMN safe_valuation_cap    TO capital_raise_valuation_cap;
ALTER TABLE global_assumptions RENAME COLUMN safe_discount_rate    TO capital_raise_discount_rate;

-- 3) Apply 0013 (additive, idempotent).
ALTER TABLE global_assumptions ADD COLUMN IF NOT EXISTS industry_vertical     text;
ALTER TABLE global_assumptions ADD COLUMN IF NOT EXISTS exit_revenue_multiple real;

-- 4) Apply 0014 (additive, idempotent).
ALTER TABLE global_assumptions
  ADD COLUMN IF NOT EXISTS saved_tabs jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 5) Drop deprecated users.company_id (text 'company' field already mirrors).
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_company_id_companies_id_fk;
DROP INDEX IF EXISTS users_company_id_idx;
ALTER TABLE users DROP COLUMN IF EXISTS company_id;

-- 6) Drop deprecated users.google_drive_connected (all 19 rows are false).
ALTER TABLE users DROP COLUMN IF EXISTS google_drive_connected;

-- 7) Mark migrations 0011–0014 as applied so the boot-time drizzle migrator
--    skips them (it would otherwise attempt the renames again and fail).
--    Hashes computed locally with sha256(file) — verified against the existing
--    row for 0010 (id=12, hash 9fe156…fbc554).
INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES
  ('ee16a854fc5f04aeaebd3aafdccce253fda5b8ad4af71903a8115f23a67d8b3f', 1776470400000),  -- 0011_capital_raise_rename
  ('678975e9a74075348977c2fa70a4cdf6da0213536ed8d539391ca20bb90b21e2', 1776643200000),  -- 0012_pgvector_store
  ('fb149dcee4867eb25639baa6b3d39273089357f29cdc869063c31f07cc3693ea', 1776816000000),  -- 0013_industry_vertical_exit_multiple
  ('2f69bbc6e611c381c6bdcd6b9148515b10acbc7b06f16aea7b62f60c1dc7b15b', 1776902400000)   -- 0014_saved_tabs
ON CONFLICT DO NOTHING;

-- 8) Sanity checks — these should all succeed inside the same transaction.
DO $$
BEGIN
  -- Renamed columns exist with the data preserved.
  PERFORM 1 FROM global_assumptions WHERE capital_raise_valuation_cap IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'capital_raise_valuation_cap missing or null after rename';
  END IF;

  -- Old columns are gone.
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='users' AND column_name='company_id') THEN
    RAISE EXCEPTION 'users.company_id still present after drop';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='users' AND column_name='google_drive_connected') THEN
    RAISE EXCEPTION 'users.google_drive_connected still present after drop';
  END IF;

  -- pgvector available.
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname='vector') THEN
    RAISE EXCEPTION 'vector extension not installed';
  END IF;
END $$;

COMMIT;

-- =============================================================================
-- After this commits, the next deploy's drizzle-kit push step should see only
-- ADDITIVE drift: new tables (vector_chunks, analyst_*, model_*, market_*,
-- airport_distances, event_calendars, etc.) and additive columns on
-- assumption_guidance / logos / properties / research_runs / users
-- (rebecca_opt_out). No prompts, no data loss, deploy proceeds.
-- =============================================================================
