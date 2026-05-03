-- 0034_batch6_ga_columns.sql
--
-- Phase C batch 6: consolidate 8 runtime migrations adding columns to
-- global_assumptions (and 2 that add columns to properties).
--
-- Migrations consolidated:
--   appearance_defaults_001    → ADD COLUMN ×3 on global_assumptions
--   country_risk_premium_001   → ADD COLUMN on properties
--   export_config_001          → ADD COLUMN on global_assumptions
--   funding_cascade_001        → ADD COLUMN ×4 on global_assumptions
--   funding_interest_001       → ADD COLUMN ×2 + ALTER COLUMN on global_assumptions
--   icp_config_001             → ADD COLUMN on global_assumptions
--   inflation_per_entity_001   → ADD COLUMN ×2 on properties + ×13 on global_assumptions
--   research_config_001        → ADD COLUMN on global_assumptions
--
-- Only appearance_defaults_001 and funding_cascade_001 had live boot-sequence
-- gates in index.ts; the other 6 gates were already removed.

-- source: appearance-defaults-001.ts
ALTER TABLE "global_assumptions" ADD COLUMN IF NOT EXISTS "default_color_mode" text;
--> statement-breakpoint
ALTER TABLE "global_assumptions" ADD COLUMN IF NOT EXISTS "default_bg_animation" text;
--> statement-breakpoint
ALTER TABLE "global_assumptions" ADD COLUMN IF NOT EXISTS "default_font_preference" text;
--> statement-breakpoint

-- source: country-risk-premium-001.ts
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "country_risk_premium" real;
--> statement-breakpoint

-- source: export-config-001.ts
ALTER TABLE "global_assumptions" ADD COLUMN IF NOT EXISTS "export_config" jsonb;
--> statement-breakpoint

-- source: funding-cascade-001.ts
ALTER TABLE "global_assumptions" ADD COLUMN IF NOT EXISTS "runway_buffer_months" real;
--> statement-breakpoint
ALTER TABLE "global_assumptions" ADD COLUMN IF NOT EXISTS "sizing_overshoot_pct" real;
--> statement-breakpoint
ALTER TABLE "global_assumptions" ADD COLUMN IF NOT EXISTS "revenue_ramp_delay_months" real;
--> statement-breakpoint
ALTER TABLE "global_assumptions" ADD COLUMN IF NOT EXISTS "burn_flex_down_pct" real;
--> statement-breakpoint

-- source: funding-interest-001.ts
ALTER TABLE "global_assumptions" ADD COLUMN IF NOT EXISTS "funding_interest_rate" real NOT NULL DEFAULT 0.08;
--> statement-breakpoint
ALTER TABLE "global_assumptions" ADD COLUMN IF NOT EXISTS "funding_interest_payment_frequency" text NOT NULL DEFAULT 'accrues_only';
--> statement-breakpoint
ALTER TABLE "global_assumptions" ALTER COLUMN "funding_interest_rate" SET DEFAULT 0.08;
--> statement-breakpoint

-- source: icp-config-001.ts
ALTER TABLE "global_assumptions" ADD COLUMN IF NOT EXISTS "icp_config" jsonb;
--> statement-breakpoint

-- source: inflation-per-entity-001.ts
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "inflation_rate" real;
--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "escalation_method" text DEFAULT 'annual';
--> statement-breakpoint
ALTER TABLE "global_assumptions" ADD COLUMN IF NOT EXISTS "company_inflation_rate" real;
--> statement-breakpoint
ALTER TABLE "global_assumptions" ADD COLUMN IF NOT EXISTS "company_phone" text;
--> statement-breakpoint
ALTER TABLE "global_assumptions" ADD COLUMN IF NOT EXISTS "company_email" text;
--> statement-breakpoint
ALTER TABLE "global_assumptions" ADD COLUMN IF NOT EXISTS "company_website" text;
--> statement-breakpoint
ALTER TABLE "global_assumptions" ADD COLUMN IF NOT EXISTS "company_ein" text;
--> statement-breakpoint
ALTER TABLE "global_assumptions" ADD COLUMN IF NOT EXISTS "company_founding_year" integer;
--> statement-breakpoint
ALTER TABLE "global_assumptions" ADD COLUMN IF NOT EXISTS "company_street_address" text;
--> statement-breakpoint
ALTER TABLE "global_assumptions" ADD COLUMN IF NOT EXISTS "company_city" text;
--> statement-breakpoint
ALTER TABLE "global_assumptions" ADD COLUMN IF NOT EXISTS "company_state_province" text;
--> statement-breakpoint
ALTER TABLE "global_assumptions" ADD COLUMN IF NOT EXISTS "company_country" text;
--> statement-breakpoint
ALTER TABLE "global_assumptions" ADD COLUMN IF NOT EXISTS "company_zip_postal_code" text;
--> statement-breakpoint

-- source: research-config-001.ts
ALTER TABLE "global_assumptions" ADD COLUMN IF NOT EXISTS "research_config" jsonb DEFAULT '{}'::jsonb;
