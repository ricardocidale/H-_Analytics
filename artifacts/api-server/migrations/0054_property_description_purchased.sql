-- 0054_property_description_purchased
--
-- Task #1404 Milestone A — Add description_purchased column to properties.
-- Explicit As-Purchased description field; seeded from legacy description.
-- The legacy description column is kept for backward compatibility.
-- IF NOT EXISTS guards idempotent re-runs.

ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "description_purchased" text;

UPDATE "properties"
  SET "description_purchased" = "description"
  WHERE "description" IS NOT NULL AND "description_purchased" IS NULL;
