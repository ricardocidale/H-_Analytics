-- 0050_factory_v2_runs_columns
--
-- Factory v2 schema extension for slide_factory_runs (Factory v2 plan U3).
-- See docs/plans/2026-05-11-001-feat-factory-v2-pptx-substitution-plan.md.
--
-- Adds three new columns:
--   * slide4_property_id  — FK to properties (ON DELETE SET NULL). Slide 4
--                            gains a single-property assignment under Factory
--                            v2 R11 (Hazelnis in the current canonical set).
--   * wish_list_log        — JSONB array of wish-list entries (R8); Lucca
--                            appends one per LLM "best-shot" decision.
--   * pptx_r2_key          — text key for the substituted PPTX in R2 (R10);
--                            paired with deck_r2_key (PDF) for dual delivery.
--
-- Extends the status CHECK constraint to allow `substituting` and
-- `converting_pdf` (the two new Factory v2 pipeline phases), and heals
-- pre-existing drift by including `rebuilding` (already referenced by the
-- TypeScript SLIDE_FACTORY_RUN_STATUSES enum but never landed in the DB CHECK).
--
-- Note on slide1_property_id: per the two-phase column-drop pattern from
-- docs/solutions/database-issues/drizzle-migration-state-drift-missing-tables-2026-05-07.md,
-- this migration adds columns but does NOT drop slide1_property_id. The TS
-- schema retains it with a TODO so the existing read sites (build-lb-payload,
-- marco-tools, lucca-draft, frontend SlideFactoryPanel, smoke-producer,
-- slide-factory route Zod schema) keep compiling. A follow-up PR drops the
-- column once those call sites are migrated to slide4_property_id under
-- Factory v2 U4 (substitution map), U8 (builder rewiring), and U11 (frontend).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS for all three columns; DROP CONSTRAINT
-- IF EXISTS + ADD CONSTRAINT for both the FK and the status CHECK (re-running
-- drops and re-adds the same constraint definitions for a net no-op).

--> statement-breakpoint
ALTER TABLE "slide_factory_runs"
  ADD COLUMN IF NOT EXISTS "slide4_property_id" integer;

--> statement-breakpoint
ALTER TABLE "slide_factory_runs"
  DROP CONSTRAINT IF EXISTS "slide_factory_runs_slide4_property_id_properties_id_fk";

--> statement-breakpoint
ALTER TABLE "slide_factory_runs"
  ADD CONSTRAINT "slide_factory_runs_slide4_property_id_properties_id_fk"
  FOREIGN KEY ("slide4_property_id") REFERENCES "properties"("id") ON DELETE set null ON UPDATE no action;

--> statement-breakpoint
ALTER TABLE "slide_factory_runs"
  ADD COLUMN IF NOT EXISTS "wish_list_log" jsonb NOT NULL DEFAULT '[]'::jsonb;

--> statement-breakpoint
ALTER TABLE "slide_factory_runs"
  ADD COLUMN IF NOT EXISTS "pptx_r2_key" text;

--> statement-breakpoint
ALTER TABLE "slide_factory_runs"
  DROP CONSTRAINT IF EXISTS "slide_factory_runs_status_check";

--> statement-breakpoint
ALTER TABLE "slide_factory_runs"
  ADD CONSTRAINT "slide_factory_runs_status_check"
  CHECK (status IN (
    'new', 'brief_ready', 'ingesting', 'ingested',
    'drafting', 'draft_review', 'building',
    'substituting', 'converting_pdf',
    'complete', 'rebuilding', 'error'
  ));
