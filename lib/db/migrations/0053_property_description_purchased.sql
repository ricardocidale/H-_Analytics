-- Migration: add description_purchased column (Milestone A, task #1404)
-- Adds an explicit As-Purchased description field, seeded from the legacy description column.
-- The legacy description column is kept for backward compatibility with all existing consumers.

ALTER TABLE "properties" ADD COLUMN "description_purchased" text;

UPDATE "properties"
  SET "description_purchased" = "description"
  WHERE "description" IS NOT NULL;
