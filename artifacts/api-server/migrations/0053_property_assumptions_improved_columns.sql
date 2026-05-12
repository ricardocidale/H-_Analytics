-- 0053_property_assumptions_improved_columns
--
-- Task #1404 Milestone A — Add As-Improved counterpart columns to the
-- properties table. Each mirrors its As-Purchased twin but represents the
-- projected post-renovation state. NULL = not set; UI shows As-Purchased
-- value as faded placeholder. IF NOT EXISTS guards idempotent re-runs.

ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "fb_venues_improved" integer;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "fb_seats_improved" integer;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "event_space_sqft_improved" integer;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "total_building_sqft_improved" integer;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "planned_reopening_year" integer;
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "description_improved" text;
