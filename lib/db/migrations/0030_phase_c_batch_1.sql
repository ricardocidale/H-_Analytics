-- 0030_phase_c_batch_1.sql
--
-- Phase C batch 1: consolidate 4 PURE_DDL runtime migrations into Drizzle.
--
-- Migrations consolidated:
--   app_name_001        → ADD COLUMN app_name on global_assumptions
--   icp_model_tier_001  → ADD COLUMN icp_model_tier on global_assumptions
--   enhanced_photo_001  → ADD COLUMN enhanced_image_data on property_photos
--   rebecca_language_001 → ADD COLUMN language on rebecca_conversations
--
-- All columns are already declared in lib/db/src/schema/*.ts (the Drizzle
-- source of truth). These runtime migrations existed only because db:push
-- drifted from the live Neon DB. They are removed from the boot sequence
-- in artifacts/api-server/src/index.ts in the same commit.
--
-- Note: scenario_service_templates_001 (ADD COLUMN service_templates on
-- scenarios) is also removed from the boot sequence in this batch but does
-- NOT appear here — its DDL was already shipped via 0010_scenario_service_templates.sql.
--
-- All statements use IF NOT EXISTS / idempotent DDL so re-running on an
-- already-migrated DB is safe.

ALTER TABLE "global_assumptions" ADD COLUMN IF NOT EXISTS "app_name" text;
--> statement-breakpoint
ALTER TABLE "global_assumptions" ADD COLUMN IF NOT EXISTS "icp_model_tier" text;
--> statement-breakpoint
ALTER TABLE "property_photos" ADD COLUMN IF NOT EXISTS "enhanced_image_data" text;
--> statement-breakpoint
ALTER TABLE "rebecca_conversations" ADD COLUMN IF NOT EXISTS "language" text DEFAULT 'en';
