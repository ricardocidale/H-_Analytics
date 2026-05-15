-- 0062_slide_factory_runs_pdf_r2_key.sql
--
-- Factory v2 (R10) — add pdf_r2_key column to slide_factory_runs.
--
-- soffice headless converts the substituted PPTX to PDF; the resulting PDF's
-- R2 key is stored here so both artifacts (PPTX + PDF) are retrievable by
-- run ID. pptx_r2_key already exists from R10 phase 1; this column completes
-- the pair.

ALTER TABLE "slide_factory_runs"
  ADD COLUMN IF NOT EXISTS "pdf_r2_key" text;
