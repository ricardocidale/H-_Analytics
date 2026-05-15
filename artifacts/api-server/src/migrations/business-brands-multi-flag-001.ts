/**
 * business-brands-multi-flag-001 — Extend business_brands for multi-flag model
 *
 * Belt-and-suspenders companion to 0065_extend_business_brands_multi_flag.sql.
 *
 * Adds slug, business_model, segment, sort_order, is_active, updated_at columns
 * to business_brands. Changes the FK on properties.brand_id from ON DELETE SET NULL
 * to ON DELETE RESTRICT, backfills any NULL brand_id rows to the default brand,
 * then sets brand_id NOT NULL.
 *
 * Idempotent: all DDL uses ADD COLUMN IF NOT EXISTS and existence checks for the
 * FK constraint. Safe to run against already-migrated databases.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] business-brands-multi-flag-001";

export async function runBusinessBrandsMultiFlag001(): Promise<void> {
  logger.info(`${TAG} Extending business_brands for multi-flag brand family model`);

  // 1. New columns on business_brands
  await db.execute(sql`
    ALTER TABLE "business_brands"
    ADD COLUMN IF NOT EXISTS "slug" text
  `);
  await db.execute(sql`
    ALTER TABLE "business_brands"
    ADD COLUMN IF NOT EXISTS "business_model" text NOT NULL DEFAULT 'hotel'
  `);
  await db.execute(sql`
    ALTER TABLE "business_brands"
    ADD COLUMN IF NOT EXISTS "segment" text
  `);
  await db.execute(sql`
    ALTER TABLE "business_brands"
    ADD COLUMN IF NOT EXISTS "sort_order" integer NOT NULL DEFAULT 0
  `);
  await db.execute(sql`
    ALTER TABLE "business_brands"
    ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true
  `);
  await db.execute(sql`
    ALTER TABLE "business_brands"
    ADD COLUMN IF NOT EXISTS "updated_at" timestamp NOT NULL DEFAULT now()
  `);

  // 2. Change is_default column default to false
  await db.execute(sql`
    ALTER TABLE "business_brands" ALTER COLUMN "is_default" SET DEFAULT false
  `);

  // 3. Partial unique index on slug
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "business_brands_slug_idx"
    ON "business_brands" ("slug") WHERE slug IS NOT NULL
  `);

  // 4. Seed slug for the existing default brand
  await db.execute(sql`
    UPDATE "business_brands"
    SET "slug" = 'h-plus-hotel'
    WHERE "is_default" = true AND "slug" IS NULL
  `);

  // 5. Backfill NULL brand_id on properties to the default brand
  await db.execute(sql`
    UPDATE "properties"
    SET "brand_id" = (SELECT "id" FROM "business_brands" WHERE "is_default" = true LIMIT 1)
    WHERE "brand_id" IS NULL
  `);

  // 6. Drop old FK (ON DELETE SET NULL) and re-add with RESTRICT, idempotently.
  //    confdeltype 'n' = SET NULL; 'r' = RESTRICT. If already RESTRICT, skip.
  await db.execute(sql`
    DO $$
    BEGIN
      -- Drop the SET NULL variant if it still exists
      IF EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        WHERE c.conname = 'properties_brand_id_business_brands_id_fk'
          AND t.relname = 'properties'
          AND c.confdeltype = 'n'
      ) THEN
        ALTER TABLE "properties"
          DROP CONSTRAINT "properties_brand_id_business_brands_id_fk";
      END IF;

      -- Add RESTRICT variant if no FK exists yet
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        WHERE c.conname = 'properties_brand_id_business_brands_id_fk'
          AND t.relname = 'properties'
      ) THEN
        ALTER TABLE "properties"
          ADD CONSTRAINT "properties_brand_id_business_brands_id_fk"
          FOREIGN KEY ("brand_id") REFERENCES "business_brands"("id")
          ON DELETE RESTRICT ON UPDATE NO ACTION;
      END IF;
    END $$
  `);

  // 7. Set brand_id NOT NULL (no-op if already NOT NULL; all rows backfilled above)
  await db.execute(sql`
    ALTER TABLE "properties" ALTER COLUMN "brand_id" SET NOT NULL
  `);

  logger.info(`${TAG} business_brands multi-flag columns and FK RESTRICT ensured`);
}
