-- 0054_property_descriptor_catalog
--
-- Task #1407 — Property Assumptions Restructure — Milestone B.
--
-- 1) Create the `property_descriptor_catalog` table that defines the universe
--    of valid property descriptor keys, their temporal scope (identity /
--    parallel / purchased_only / improved_only), data type, and the typed
--    column they currently map to during the dual-write window.
--    The catalog is code-defined; this migration seeds it from
--    `property-descriptor-catalog-seed.ts`.
--
-- 2) Add `descriptors_purchased` and `descriptors_improved` JSONB columns to
--    `properties` so the dual-write helper can mirror typed-column writes
--    into a structured blob without losing data when typed columns are
--    eventually dropped.
--
-- 3) Backfill the JSONB blobs from existing typed columns so the accessor
--    sees a consistent view immediately and drift instrumentation has a
--    clean baseline.
--
-- All steps are idempotent.

CREATE TABLE IF NOT EXISTS "property_descriptor_catalog" (
  "field_key" text PRIMARY KEY,
  "group_name" text NOT NULL,
  "scope" text NOT NULL,
  "data_type" text NOT NULL,
  "enum_values" jsonb,
  "unit" text,
  "display_label" text NOT NULL,
  "help_text" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "typed_column_purchased" text,
  "typed_column_improved" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

ALTER TABLE "properties"
  ADD COLUMN IF NOT EXISTS "descriptors_purchased" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "properties"
  ADD COLUMN IF NOT EXISTS "descriptors_improved" jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Seed catalog rows. ON CONFLICT keeps the migration idempotent if it is
-- replayed on a database where the rows already exist (the application can
-- also re-seed at boot from the same code-defined source of truth).
INSERT INTO "property_descriptor_catalog"
  ("field_key", "group_name", "scope", "data_type", "unit", "display_label", "help_text", "sort_order", "typed_column_purchased", "typed_column_improved")
VALUES
  ('yearBuilt', 'identity', 'identity', 'int', 'year', 'Year Built', 'Original construction year. Does not change after renovation.', 10, 'year_built', NULL),
  ('locationType', 'identity', 'identity', 'text', NULL, 'Location Type', 'Urban / suburban / rural / resort. Geographic context, not a renovation outcome.', 20, 'location_type', NULL),
  ('marketTier', 'identity', 'identity', 'text', NULL, 'Market Tier', 'Primary / secondary / tertiary market classification.', 30, 'market_tier', NULL),
  ('fbVenues', 'envelope', 'parallel', 'int', 'venues', 'F&B Venues', 'Number of food & beverage outlets on the property.', 100, 'fb_venues', 'fb_venues_improved'),
  ('fbSeats', 'envelope', 'parallel', 'int', 'seats', 'F&B Seating Capacity', 'Total seating capacity across all F&B venues.', 110, 'fb_seats', 'fb_seats_improved'),
  ('eventSpaceSqft', 'envelope', 'parallel', 'int', 'sqft', 'Event Space (sq ft)', 'Bookable event / meeting / banquet square footage.', 120, 'event_space_sqft', 'event_space_sqft_improved'),
  ('totalBuildingSqft', 'envelope', 'parallel', 'int', 'sqft', 'Total Building (sq ft)', 'Conditioned/improved building footprint across all structures.', 130, 'total_building_sqft', 'total_building_sqft_improved'),
  ('description', 'narrative', 'parallel', 'text', NULL, 'Property Description', 'Free-text narrative of the property''s character and amenities.', 200, 'description_purchased', 'description_improved'),
  ('lastRenovationYear', 'envelope', 'purchased_only', 'int', 'year', 'Last Renovation Year', 'Year of the most recent renovation prior to acquisition.', 140, 'last_renovation_year', NULL),
  ('totalPropertyAcreage', 'envelope', 'purchased_only', 'float', 'acres', 'Total Acreage', 'Total land area in acres. Treated as fixed for the holding period.', 150, 'total_property_acreage', NULL),
  ('guestMixBusiness', 'demand', 'purchased_only', 'float', 'ratio', 'Guest Mix — Business', 'Share of room-nights from business travelers (0–1).', 300, 'guest_mix_business', NULL),
  ('guestMixLeisure', 'demand', 'purchased_only', 'float', 'ratio', 'Guest Mix — Leisure', 'Share of room-nights from leisure travelers (0–1).', 310, 'guest_mix_leisure', NULL),
  ('guestMixGroup', 'demand', 'purchased_only', 'float', 'ratio', 'Guest Mix — Group', 'Share of room-nights from group bookings (0–1).', 320, 'guest_mix_group', NULL),
  ('serviceLevel', 'posture', 'purchased_only', 'text', NULL, 'Service Level', 'Full service / select service / limited service.', 400, 'service_level', NULL),
  ('managementType', 'posture', 'purchased_only', 'text', NULL, 'Management Type', 'Owner-operated / third-party-managed / brand-managed.', 410, 'management_type', NULL),
  ('onMunicipalSewer', 'posture', 'purchased_only', 'bool', NULL, 'On Municipal Sewer', 'True if connected to municipal sewer; false if septic.', 420, 'on_municipal_sewer', NULL),
  ('plannedReopeningYear', 'envelope', 'improved_only', 'int', 'year', 'Planned Reopening Year', 'Calendar year the renovated property is projected to reopen.', 160, NULL, 'planned_reopening_year')
ON CONFLICT ("field_key") DO UPDATE SET
  "group_name" = EXCLUDED."group_name",
  "scope" = EXCLUDED."scope",
  "data_type" = EXCLUDED."data_type",
  "unit" = EXCLUDED."unit",
  "display_label" = EXCLUDED."display_label",
  "help_text" = EXCLUDED."help_text",
  "sort_order" = EXCLUDED."sort_order",
  "typed_column_purchased" = EXCLUDED."typed_column_purchased",
  "typed_column_improved" = EXCLUDED."typed_column_improved";

-- Backfill JSONB blobs from existing typed columns so the accessor sees a
-- consistent view from day one and drift detection has a clean baseline.
-- Uses jsonb_strip_nulls so missing values stay absent rather than appearing
-- as explicit nulls in the blob.
UPDATE "properties" SET "descriptors_purchased" = jsonb_strip_nulls(jsonb_build_object(
  'yearBuilt',            to_jsonb("year_built"),
  'locationType',         to_jsonb("location_type"),
  'marketTier',           to_jsonb("market_tier"),
  'fbVenues',             to_jsonb("fb_venues"),
  'fbSeats',              to_jsonb("fb_seats"),
  'eventSpaceSqft',       to_jsonb("event_space_sqft"),
  'totalBuildingSqft',    to_jsonb("total_building_sqft"),
  'description',          to_jsonb("description_purchased"),
  'lastRenovationYear',   to_jsonb("last_renovation_year"),
  'totalPropertyAcreage', to_jsonb("total_property_acreage"),
  'guestMixBusiness',     to_jsonb("guest_mix_business"),
  'guestMixLeisure',      to_jsonb("guest_mix_leisure"),
  'guestMixGroup',        to_jsonb("guest_mix_group"),
  'serviceLevel',         to_jsonb("service_level"),
  'managementType',       to_jsonb("management_type"),
  'onMunicipalSewer',     to_jsonb("on_municipal_sewer")
))
WHERE "descriptors_purchased" = '{}'::jsonb;

UPDATE "properties" SET "descriptors_improved" = jsonb_strip_nulls(jsonb_build_object(
  'fbVenues',             to_jsonb("fb_venues_improved"),
  'fbSeats',              to_jsonb("fb_seats_improved"),
  'eventSpaceSqft',       to_jsonb("event_space_sqft_improved"),
  'totalBuildingSqft',    to_jsonb("total_building_sqft_improved"),
  'description',          to_jsonb("description_improved"),
  'plannedReopeningYear', to_jsonb("planned_reopening_year")
))
WHERE "descriptors_improved" = '{}'::jsonb;
