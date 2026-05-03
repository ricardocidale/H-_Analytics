-- 0041_property_slide_deck_drop_image_format.sql
--
-- Demolish the Track 2 satori → image-PPTX generator. Drop 'image' from the
-- format check constraint on property_slide_deck_variants and delete any
-- leftover 'image' rows. Cached R2 objects under slides/image/* become
-- orphaned and are cleaned up by R2 lifecycle rules.
--
-- Idempotent: drops the old constraint if present and recreates with the
-- reduced allow-list ('pptx', 'pdf').

DELETE FROM "property_slide_deck_variants" WHERE "format" = 'image';
--> statement-breakpoint
ALTER TABLE "property_slide_deck_variants"
  DROP CONSTRAINT IF EXISTS "property_slide_deck_variants_format_check";
--> statement-breakpoint
ALTER TABLE "property_slide_deck_variants"
  ADD CONSTRAINT "property_slide_deck_variants_format_check"
  CHECK ("format" IN ('pptx', 'pdf'));
