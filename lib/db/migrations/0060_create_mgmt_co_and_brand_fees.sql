-- Plan 2026-05-13-006 U2 — Create management_company_fees + brand_fees tables
--
-- Depends on U1 (0059_extend_business_brands_multi_flag.sql):
--   - business_brands.slug exists (nullable)
--
-- This migration:
--   1. Drops the partial unique index on business_brands.slug (created in U1)
--   2. Backfills any remaining NULL slugs (safety measure)
--   3. Makes business_brands.slug NOT NULL
--   4. Adds a full UNIQUE constraint on business_brands.slug (FK target for brand_fees)
--   5. Creates management_company_fees table (global Tier-A fee schedule)
--   6. Creates brand_fees table (per-flag fee schedule)

--> statement-breakpoint
DROP INDEX IF EXISTS "business_brands_slug_idx";
--> statement-breakpoint
UPDATE "business_brands"
SET "slug" = lower(regexp_replace(regexp_replace("name", '[^a-zA-Z0-9\s]', '', 'g'), '\s+', '-', 'g'))
WHERE "slug" IS NULL;
--> statement-breakpoint
ALTER TABLE "business_brands" ALTER COLUMN "slug" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "business_brands" ADD CONSTRAINT "business_brands_slug_unique" UNIQUE ("slug");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "management_company_fees" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "management_company_fees_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"fee_type" text NOT NULL,
	"rate" real NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"source_url" text,
	"last_checked" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "management_company_fees_fee_type_unique" UNIQUE("fee_type")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "brand_fees" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "brand_fees_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"brand_slug" text NOT NULL,
	"fee_type" text NOT NULL,
	"rate" real NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"source_url" text,
	"last_checked" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "brand_fees_brand_slug_fee_type_unique" UNIQUE("brand_slug","fee_type")
);
--> statement-breakpoint
ALTER TABLE "brand_fees" ADD CONSTRAINT "brand_fees_brand_slug_business_brands_slug_fk" FOREIGN KEY ("brand_slug") REFERENCES "business_brands"("slug") ON DELETE RESTRICT ON UPDATE NO ACTION;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brand_fees_brand_slug_idx" ON "brand_fees" ("brand_slug");
