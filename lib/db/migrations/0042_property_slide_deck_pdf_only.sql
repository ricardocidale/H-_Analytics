-- 0042_property_slide_deck_pdf_only
--
-- Demolish the python-pptx generator. PDF (Playwright HTML→PDF) is now the
-- sole investor-facing deck format.
--
-- 1. Delete any leftover 'pptx' rows from property_slide_deck_variants.
-- 2. Narrow the format check constraint to ('pdf') only.
-- 3. Drop the slide_recipe_elements table (was the satori Track 2 inventory
--    seeded from scripts/src/slide-slot-recipe.json — both gone in T002/T006).

DELETE FROM property_slide_deck_variants WHERE format = 'pptx';

ALTER TABLE property_slide_deck_variants
  DROP CONSTRAINT IF EXISTS property_slide_deck_variants_format_check;

ALTER TABLE property_slide_deck_variants
  ADD CONSTRAINT property_slide_deck_variants_format_check
  CHECK (format IN ('pdf'));

DROP TABLE IF EXISTS slide_recipe_elements;
