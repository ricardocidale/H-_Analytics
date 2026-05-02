-- 0029_batch10_slide_decks_and_constraints.sql
--
-- Phase C batch 10: consolidate 6 runtime DDL gates into Drizzle.
--
-- Migrations consolidated:
--   property_slide_decks_001         → CREATE TABLE property_slide_decks (interim; superseded below)
--   property_slide_decks_002         → ADD FK + CHECK constraint to property_slide_decks
--   property_slide_deck_variants_001 → CREATE TABLE property_slide_deck_variants; migrate+drop old
--   reference_brands_001             → CREATE TABLE reference_brands (already in 0028, belt+suspenders)
--   reference_brands_run_fk_001      → ADD FK + index for reference_brands.refreshed_by_run_id
--   property_photos_hero_unique_001  → Deduplicate heroes; CREATE UNIQUE INDEX IF NOT EXISTS
--
-- All statements are idempotent (IF NOT EXISTS / DO blocks).
-- On fresh DBs: Drizzle migrate() runs this before the runtime gates execute.
-- On existing DBs: gates have already applied these; IF NOT EXISTS / DO checks make this a no-op.

--> statement-breakpoint
-- Step 1: property_slide_deck_variants (final table; supersedes property_slide_decks)
CREATE TABLE IF NOT EXISTS property_slide_deck_variants (
  property_id     integer    NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  format          text       NOT NULL,
  status          text       NOT NULL DEFAULT 'idle',
  r2_key          text,
  file_size_bytes integer,
  generated_at    timestamptz,
  triggered_by    text,
  error_message   text,
  updated_at      timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (property_id, format),
  CONSTRAINT property_slide_deck_variants_format_check
    CHECK (format IN ('pptx', 'image')),
  CONSTRAINT property_slide_deck_variants_status_check
    CHECK (status IN ('idle', 'generating', 'ready', 'error'))
);
--> statement-breakpoint
-- Step 2: if the old property_slide_decks table exists, migrate rows then drop it
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'property_slide_decks'
  ) THEN
    INSERT INTO property_slide_deck_variants
      (property_id, format, status, r2_key, file_size_bytes, generated_at, triggered_by, error_message, updated_at)
    SELECT
      property_id, 'pptx', status, r2_key, file_size_bytes, generated_at, triggered_by, error_message, updated_at
    FROM property_slide_decks
    ON CONFLICT (property_id, format) DO NOTHING;
    DROP TABLE property_slide_decks;
  END IF;
END
$$;
--> statement-breakpoint
-- Step 3: reference_brands table (0028_reference_brands.sql covers this for fresh DBs;
-- belt-and-suspenders for the legacy Neon path where 0028 was pre-marked but never ran)
CREATE TABLE IF NOT EXISTS reference_brands (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  brand_name TEXT NOT NULL,
  niche TEXT,
  positioning_summary TEXT,
  guest_segment TEXT,
  property_count INTEGER,
  key_count_min INTEGER,
  key_count_max INTEGER,
  geographic_focus TEXT,
  adr_usd REAL,
  occupancy_pct REAL,
  revpar_usd REAL,
  revenue_range_low_usd REAL,
  revenue_range_high_usd REAL,
  ownership_model TEXT,
  acquisition_context TEXT,
  description TEXT,
  reference_disclaimer BOOLEAN NOT NULL DEFAULT TRUE,
  data_year INTEGER,
  source_urls JSONB,
  last_refreshed_at TIMESTAMP,
  refreshed_by_run_id INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS reference_brands_name_idx ON reference_brands (brand_name);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS reference_brands_refreshed_idx ON reference_brands (last_refreshed_at);
--> statement-breakpoint
-- Step 4: FK from reference_brands.refreshed_by_run_id → research_runs.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'reference_brands_refreshed_by_run_id_fk'
      AND table_name = 'reference_brands'
  ) THEN
    ALTER TABLE reference_brands
      ADD CONSTRAINT reference_brands_refreshed_by_run_id_fk
      FOREIGN KEY (refreshed_by_run_id)
      REFERENCES research_runs(id)
      ON DELETE SET NULL;
  END IF;
END
$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS reference_brands_refreshed_by_run_id_idx
  ON reference_brands (refreshed_by_run_id)
  WHERE refreshed_by_run_id IS NOT NULL;
--> statement-breakpoint
-- Step 5: deduplicate is_hero flags (keep lowest sort_order, tie-break on lowest id)
UPDATE property_photos
SET is_hero = false
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY property_id
        ORDER BY sort_order ASC, id ASC
      ) AS rn
    FROM property_photos
    WHERE is_hero = true
  ) ranked
  WHERE rn > 1
);
--> statement-breakpoint
-- Step 6: partial unique index — at most one hero per property
CREATE UNIQUE INDEX IF NOT EXISTS property_photos_single_hero_idx
  ON property_photos (property_id)
  WHERE is_hero = true;
