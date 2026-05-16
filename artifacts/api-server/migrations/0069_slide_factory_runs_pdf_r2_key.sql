-- 0068_slide_factory_runs_pdf_r2_key.sql
--
-- Mirror of lib/db/migrations/0062_slide_factory_runs_pdf_r2_key.sql for the
-- api-server's migrate() runner (non-colliding slot in the drifted numbering).
--
-- Factory v2 (R10) — add pdf_r2_key column to slide_factory_runs.

ALTER TABLE "slide_factory_runs"
  ADD COLUMN IF NOT EXISTS "pdf_r2_key" text;
