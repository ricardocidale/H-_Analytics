-- 0040_property_slide_deck_pdf_format.sql
--
-- Extend the format check constraint on property_slide_deck_variants to allow
-- the new 'pdf' format (rendered by Playwright headless Chromium). Existing
-- 'pptx' and 'image' values remain valid until the legacy generators are
-- demolished in a later migration.
--
-- Idempotent: drops the old constraint if present (matching either the old
-- or new allow-list) and recreates with the union.

ALTER TABLE "property_slide_deck_variants"
  DROP CONSTRAINT IF EXISTS "property_slide_deck_variants_format_check";
--> statement-breakpoint
ALTER TABLE "property_slide_deck_variants"
  ADD CONSTRAINT "property_slide_deck_variants_format_check"
  CHECK ("format" IN ('pptx', 'image', 'pdf'));
