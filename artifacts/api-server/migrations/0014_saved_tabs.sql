-- Per-tab Save tracking for the Analyst watchdog (added in shared/schema/config.ts).
-- Stored as a jsonb array of TabKey strings; once all 6 Company Assumptions tabs
-- have been saved at least once, downstream pages unlock.
ALTER TABLE "global_assumptions" ADD COLUMN IF NOT EXISTS "saved_tabs" jsonb NOT NULL DEFAULT '[]'::jsonb;
