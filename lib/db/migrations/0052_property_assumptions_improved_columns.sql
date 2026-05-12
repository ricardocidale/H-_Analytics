-- 0052_property_assumptions_improved_columns
--
-- Task #1404 — Property Assumptions Restructure — Milestone A.
-- Adds six nullable "As-Improved" counterpart columns to the properties table.
-- Each column mirrors an As-Purchased field and holds the projected post-renovation
-- value. NULL = user has not yet set an improved value.
--
-- Idempotent: ALTER TABLE … ADD COLUMN IF NOT EXISTS.

ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "fb_venues_improved" integer;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "fb_seats_improved" integer;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "event_space_sqft_improved" integer;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "total_building_sqft_improved" integer;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "planned_reopening_year" integer;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "description_improved" text;
