-- 0033_property_slide_deck_variants_pdf_format
--
-- Allow `format = 'pdf'` in property_slide_deck_variants.
--
-- Background: migration 0029 created the table with
--   CHECK (format IN ('pptx', 'image'))
-- but the only writer in the codebase — `upsertPdfVariantRow` in
-- `routes/property-deck-pdf.ts` — inserts `format = 'pdf'`. Until this
-- migration runs, the INSERT fails the CHECK and PDF caching is broken.
--
-- We keep 'pptx' and 'image' in the allowed set for backward compatibility
-- with historical rows migrated from the old `property_slide_decks` table
-- (see property-slide-deck-variants-001.ts) and to leave room for future
-- image-variant work.
--
-- Idempotent: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT. Re-running drops
-- and re-adds the same constraint definition, which is a no-op net change.

ALTER TABLE property_slide_deck_variants
  DROP CONSTRAINT IF EXISTS property_slide_deck_variants_format_check;
--> statement-breakpoint
ALTER TABLE property_slide_deck_variants
  ADD CONSTRAINT property_slide_deck_variants_format_check
  CHECK (format IN ('pptx', 'image', 'pdf'));
