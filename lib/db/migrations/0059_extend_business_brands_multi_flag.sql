-- 0059_extend_business_brands_multi_flag
--
-- Extends business_brands for the multi-flag brand family model (Plan 006).
--
-- New columns:
--   slug          — unique join key for brand_fees linkage (mirrors icp_brackets pattern)
--   business_model— "hotel" | "str" — drives which fee schedule applies
--   segment       — optional brand tier (e.g. "ultra-luxury", "luxury", "upscale")
--   sort_order    — admin-controlled display order
--   is_active     — soft-delete / hide-from-picker flag
--   updated_at    — last-modified timestamp
--
-- Changes is_default column default from true → false. The one seed row
-- (H+ Hotel) retains is_default = true; all future brands default to false.
--
-- Properties FK:
--   Drops the existing ON DELETE SET NULL constraint and re-adds it as
--   ON DELETE RESTRICT so brand deletion is blocked while properties exist.
--   Backfills any NULL brand_id rows to the default brand before setting
--   brand_id NOT NULL.
--
-- Idempotent.

-- 1. New columns on business_brands
ALTER TABLE "business_brands" ADD COLUMN IF NOT EXISTS "slug" text;
ALTER TABLE "business_brands" ADD COLUMN IF NOT EXISTS "business_model" text NOT NULL DEFAULT 'hotel';
ALTER TABLE "business_brands" ADD COLUMN IF NOT EXISTS "segment" text;
ALTER TABLE "business_brands" ADD COLUMN IF NOT EXISTS "sort_order" integer NOT NULL DEFAULT 0;
ALTER TABLE "business_brands" ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true;
ALTER TABLE "business_brands" ADD COLUMN IF NOT EXISTS "updated_at" timestamp NOT NULL DEFAULT now();

-- 2. Change is_default column default to false (new brands are not fallbacks by default)
ALTER TABLE "business_brands" ALTER COLUMN "is_default" SET DEFAULT false;

-- 3. Partial unique index on slug (NULL slugs are excluded — allows rows without a slug)
CREATE UNIQUE INDEX IF NOT EXISTS "business_brands_slug_idx"
  ON "business_brands" ("slug") WHERE slug IS NOT NULL;

-- 4. Seed slug for the existing default brand
UPDATE "business_brands"
  SET "slug" = 'h-plus-hotel'
  WHERE "is_default" = true AND "slug" IS NULL;

-- 5. Backfill NULL brand_id on properties to the default brand
UPDATE "properties"
  SET "brand_id" = (SELECT "id" FROM "business_brands" WHERE "is_default" = true LIMIT 1)
  WHERE "brand_id" IS NULL;

-- 6. Drop old FK (ON DELETE SET NULL) and re-add with RESTRICT
ALTER TABLE "properties"
  DROP CONSTRAINT IF EXISTS "properties_brand_id_business_brands_id_fk";

ALTER TABLE "properties"
  ADD CONSTRAINT "properties_brand_id_business_brands_id_fk"
  FOREIGN KEY ("brand_id") REFERENCES "business_brands"("id")
  ON DELETE RESTRICT ON UPDATE NO ACTION;

-- 7. Set brand_id NOT NULL (safe: all rows backfilled above)
ALTER TABLE "properties" ALTER COLUMN "brand_id" SET NOT NULL;
