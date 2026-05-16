-- Fix brand_id FK constraint to explicitly declare ON DELETE RESTRICT.
-- Migration 0065 added this FK without the ON DELETE clause, which defaults
-- to NO ACTION (functionally identical for non-deferred constraints, but the
-- Drizzle schema explicitly declares onDelete: "restrict" and the live
-- constraint should match).
ALTER TABLE "properties"
  DROP CONSTRAINT IF EXISTS "properties_brand_id_business_brands_id_fk",
  ADD CONSTRAINT "properties_brand_id_business_brands_id_fk"
    FOREIGN KEY ("brand_id") REFERENCES "business_brands"("id")
    ON DELETE RESTRICT;
