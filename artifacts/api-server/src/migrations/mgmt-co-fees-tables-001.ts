/**
 * mgmt-co-fees-tables-001 — Create management_company_fees + brand_fees + seed
 *
 * Belt-and-suspenders companion to 0066_create_mgmt_co_and_brand_fees.sql.
 *
 * Does five things in order:
 *   1. Ensures both tables exist (DDL guard, IF NOT EXISTS).
 *   2. Ensures business_brands.slug is NOT NULL + UNIQUE (so brand_fees FK works).
 *   3. Seeds management_company_fees rows (Tier A: base mgmt + incentive).
 *   4. Seeds the H+ STR Ultra-Luxury brand + brand_fees for both flags.
 *   5. Assigns Medellin Duplex to the H+ STR Ultra-Luxury flag.
 *
 * Idempotent: all DDL uses IF NOT EXISTS / DO $$ checks; all seed inserts use
 * ON CONFLICT DO NOTHING. Medellin Duplex reassignment is guarded by a slug check.
 *
 * SEED_* constants carry source citations per CLAUDE.md §1 — bootstrap-only;
 * never imported by runtime code.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] mgmt-co-fees-tables-001";

// ── Named constants (CLAUDE.md §1 — no magic numbers) ─────────────────────

// Management company fees — Tier A: Base Management + Incentive
// Source: HVS 2024 Hotel Management Agreement Survey
// (typical independent/boutique hotel range: base 8–10%, incentive 10–12% of GOP)
const SEED_MGMT_FEE_BASE_RATE = 0.085;
const SEED_MGMT_FEE_INCENTIVE_RATE = 0.12;

// Brand fees — H+ Hotel flag (business_model = 'hotel')
// Source: CBRE Hotels 2024 Franchise Fee Survey (upscale soft-flag segment)
const SEED_BRAND_FEE_ROYALTY_RATE = 0.05;
const SEED_BRAND_FEE_BRAND_MARKETING_RATE = 0.02;
const SEED_BRAND_FEE_LOYALTY_RATE = 0.005;
const SEED_BRAND_FEE_RESERVATION_RATE = 0.0125;
const SEED_BRAND_FEE_BRAND_TECH_RATE = 0.005;

// Brand fees — H+ STR Ultra-Luxury flag (business_model = 'str')
// H+ brand services: H+ internal STR benchmark
const SEED_STR_BRAND_FEE_RATE = 0.10;
// OTA channel commissions: verified from 2024 public rate cards
// Source: Airbnb Host Service Fee 2024 (15% host + 0.5% processing = 15.5%)
const SEED_STR_CHANNEL_AIRBNB_RATE = 0.155;
// Source: Vrbo Owner Service Fee 2024 (8% of rental amount)
const SEED_STR_CHANNEL_VRBO_RATE = 0.08;
// Source: Booking.com Commission Agreement 2024 (15% standard commission)
const SEED_STR_CHANNEL_BOOKING_RATE = 0.15;
// Source: Plum Guide Partner Rate Card 2024 (16.5% commission)
const SEED_STR_CHANNEL_PLUM_GUIDE_RATE = 0.165;

export async function runMgmtCoFeesTables001(): Promise<void> {
  logger.info(`${TAG} Creating management_company_fees + brand_fees tables`);

  // 1. Ensure management_company_fees table exists
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "management_company_fees" (
      "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      "fee_type" text NOT NULL,
      "rate" real NOT NULL,
      "label" text NOT NULL,
      "sort_order" integer NOT NULL DEFAULT 0,
      "source_url" text,
      "last_checked" timestamp,
      "created_at" timestamp NOT NULL DEFAULT now(),
      "updated_at" timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'management_company_fees_fee_type_unique'
      ) THEN
        ALTER TABLE "management_company_fees"
          ADD CONSTRAINT "management_company_fees_fee_type_unique" UNIQUE ("fee_type");
      END IF;
    END $$
  `);

  // 2. Ensure brand_fees table exists
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "brand_fees" (
      "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      "brand_slug" text NOT NULL,
      "fee_type" text NOT NULL,
      "rate" real NOT NULL,
      "label" text NOT NULL,
      "sort_order" integer NOT NULL DEFAULT 0,
      "source_url" text,
      "last_checked" timestamp,
      "created_at" timestamp NOT NULL DEFAULT now(),
      "updated_at" timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'brand_fees_brand_slug_fee_type_unique'
      ) THEN
        ALTER TABLE "brand_fees"
          ADD CONSTRAINT "brand_fees_brand_slug_fee_type_unique" UNIQUE ("brand_slug", "fee_type");
      END IF;
    END $$
  `);
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'brand_fees_brand_slug_business_brands_slug_fk'
      ) THEN
        ALTER TABLE "brand_fees"
          ADD CONSTRAINT "brand_fees_brand_slug_business_brands_slug_fk"
          FOREIGN KEY ("brand_slug") REFERENCES "business_brands"("slug")
          ON DELETE RESTRICT ON UPDATE NO ACTION;
      END IF;
    END $$
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "brand_fees_brand_slug_idx" ON "brand_fees" ("brand_slug")
  `);

  // 3. Ensure business_brands.slug is NOT NULL + UNIQUE (FK target for brand_fees)
  //    U1 already dropped the partial index and set slug for the default brand.
  //    Backfill any remaining NULLs before setting NOT NULL.
  await db.execute(sql`
    UPDATE "business_brands"
    SET "slug" = lower(regexp_replace(regexp_replace("name", '[^a-zA-Z0-9\s]', '', 'g'), '\s+', '-', 'g'))
    WHERE "slug" IS NULL
  `);
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'business_brands'
          AND column_name = 'slug'
          AND is_nullable = 'YES'
      ) THEN
        ALTER TABLE "business_brands" ALTER COLUMN "slug" SET NOT NULL;
      END IF;
    END $$
  `);
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'business_brands_slug_unique'
      ) THEN
        ALTER TABLE "business_brands"
          ADD CONSTRAINT "business_brands_slug_unique" UNIQUE ("slug");
      END IF;
    END $$
  `);

  // 4. Seed management_company_fees rows (Tier A: base management + incentive)
  await db.execute(sql`
    INSERT INTO "management_company_fees" ("fee_type", "rate", "label", "sort_order", "source_url")
    VALUES
      ('base_mgmt', ${SEED_MGMT_FEE_BASE_RATE}, 'Base Management Fee', 1, 'HVS 2024 Hotel Management Agreement Survey'),
      ('incentive', ${SEED_MGMT_FEE_INCENTIVE_RATE}, 'Incentive Management Fee', 2, 'HVS 2024 Hotel Management Agreement Survey')
    ON CONFLICT ("fee_type") DO NOTHING
  `);

  // 5. Ensure H+ STR Ultra-Luxury brand exists
  await db.execute(sql`
    INSERT INTO "business_brands" ("name", "slug", "business_model", "segment", "sort_order", "is_active", "is_default")
    VALUES ('H+ STR Ultra-Luxury', 'h-plus-str-ultra-luxury', 'str', 'ultra-luxury', 10, true, false)
    ON CONFLICT ("slug") DO NOTHING
  `);

  // 6. Seed brand_fees for H+ Hotel flag (royalty, brand_marketing, loyalty, reservation, brand_tech)
  await db.execute(sql`
    INSERT INTO "brand_fees" ("brand_slug", "fee_type", "rate", "label", "sort_order", "source_url")
    VALUES
      ('h-plus-hotel', 'royalty',         ${SEED_BRAND_FEE_ROYALTY_RATE},         'Brand Royalty Fee',         1, 'CBRE Hotels 2024 Franchise Fee Survey'),
      ('h-plus-hotel', 'brand_marketing', ${SEED_BRAND_FEE_BRAND_MARKETING_RATE}, 'Brand Marketing Program Fee', 2, 'CBRE Hotels 2024 Franchise Fee Survey'),
      ('h-plus-hotel', 'loyalty',         ${SEED_BRAND_FEE_LOYALTY_RATE},         'Loyalty Program Fee',       3, 'CBRE Hotels 2024 Franchise Fee Survey'),
      ('h-plus-hotel', 'reservation',     ${SEED_BRAND_FEE_RESERVATION_RATE},     'Central Reservations Fee',  4, 'CBRE Hotels 2024 Franchise Fee Survey'),
      ('h-plus-hotel', 'brand_tech',      ${SEED_BRAND_FEE_BRAND_TECH_RATE},      'Brand Technology Fee',      5, 'CBRE Hotels 2024 Franchise Fee Survey')
    ON CONFLICT ("brand_slug", "fee_type") DO NOTHING
  `);

  // 7. Seed brand_fees for H+ STR Ultra-Luxury flag (brand + OTA channels)
  await db.execute(sql`
    INSERT INTO "brand_fees" ("brand_slug", "fee_type", "rate", "label", "sort_order", "source_url")
    VALUES
      ('h-plus-str-ultra-luxury', 'h_plus_str_brand_fee',  ${SEED_STR_BRAND_FEE_RATE},          'H+ STR Brand Services Fee', 1, 'H+ Internal STR Benchmark 2024'),
      ('h-plus-str-ultra-luxury', 'channel_airbnb',        ${SEED_STR_CHANNEL_AIRBNB_RATE},      'Airbnb Host Service Fee',   2, 'Airbnb Host Service Fee Rate Card 2024'),
      ('h-plus-str-ultra-luxury', 'channel_vrbo',          ${SEED_STR_CHANNEL_VRBO_RATE},        'VRBO Owner Service Fee',    3, 'Vrbo Owner Service Fee 2024'),
      ('h-plus-str-ultra-luxury', 'channel_booking',       ${SEED_STR_CHANNEL_BOOKING_RATE},     'Booking.com Commission',    4, 'Booking.com Commission Agreement 2024'),
      ('h-plus-str-ultra-luxury', 'channel_plum_guide',    ${SEED_STR_CHANNEL_PLUM_GUIDE_RATE},  'Plum Guide Commission',     5, 'Plum Guide Partner Rate Card 2024')
    ON CONFLICT ("brand_slug", "fee_type") DO NOTHING
  `);

  // 8. Assign Medellin Duplex to H+ STR Ultra-Luxury flag (if not already assigned)
  await db.execute(sql`
    UPDATE "properties"
    SET "brand_id" = (
      SELECT "id" FROM "business_brands" WHERE "slug" = 'h-plus-str-ultra-luxury' LIMIT 1
    )
    WHERE "name" = 'Medellin Duplex'
      AND "brand_id" = (
        SELECT "id" FROM "business_brands" WHERE "is_default" = true LIMIT 1
      )
  `);

  logger.info(`${TAG} management_company_fees + brand_fees tables created and seeded`);
}
