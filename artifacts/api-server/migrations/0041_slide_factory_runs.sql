-- 0041_slide_factory_runs
--
-- Creates the slide_factory_runs table for the LB slide factory pipeline (V2).
--
-- One row per factory run. Status encodes both pipeline position and phase
-- state — no separate currentTab column (would drift). Property assignments
-- are snapshotted as FK columns so ON DELETE SET NULL fires automatically if
-- a property is deleted while a run is paused.
--
-- Status CHECK constraint enforces valid transitions at the DB layer.

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS slide_factory_runs (
  id                   SERIAL PRIMARY KEY,
  user_id              INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  status               TEXT NOT NULL DEFAULT 'new'
                         CHECK (status IN (
                           'new', 'brief_ready', 'ingesting', 'ingested',
                           'drafting', 'draft_review', 'building', 'complete', 'error'
                         )),

  -- Tab 1: Brief
  brief_r2_key         TEXT,
  brief_filename       TEXT,
  brief_accepted       BOOLEAN NOT NULL DEFAULT FALSE,

  -- Tab 2: Lorenzo canonical ingestion output
  canonical_spec       JSONB,
  canonical_png_keys   JSONB,

  -- Tab 3: Property assignments (snapshotted FKs)
  slide1_property_id   INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  slide2_property_id   INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  slide3_property_id   INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  slide5_property_id   INTEGER REFERENCES properties(id) ON DELETE SET NULL,

  -- Tab 4: Lucca narrative slot draft
  lucca_draft          JSONB,

  -- Tab 5: Per-slide agent results
  agent_results        JSONB,

  -- Tab 6: Final rendered deck
  deck_r2_key          TEXT,

  -- Timestamps
  started_at           TIMESTAMP WITH TIME ZONE,
  completed_at         TIMESTAMP WITH TIME ZONE,
  created_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS slide_factory_runs_user_id_idx
  ON slide_factory_runs (user_id);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS slide_factory_runs_status_created_idx
  ON slide_factory_runs (status, created_at);
