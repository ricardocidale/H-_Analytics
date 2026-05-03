-- 0037_batch8_datafix_and_unique.sql
--
-- Phase C batch 8: consolidate 10 remaining runtime migrations that are
-- either pure data-fixes or MIXED (DDL + data-fix) migrations.
-- For MIXED migrations, both the DDL and data-fix parts are included
-- here so the runtime gates can be removed entirely.
--
-- Migrations consolidated:
--   db_hygiene_001                   → DROP duplicate FKs + DELETE orphaned logos
--   fix_shared_ownership             → UPDATE user_id to NULL + dedup global_assumptions
--   role_partner_to_user_001         → UPDATE users.role from 'partner' to 'user'
--   role_checker_investor_to_user_001 → UPDATE users.role from 'checker'/'investor' to 'user'
--   property_notnull_001             → UPDATE property defaults + SET NOT NULL ×9
--   app_logo_001                     → ADD COLUMN is_app_logo + UPDATE
--   admin_resources_004 (DDL part)   → CREATE TABLE ×2 + indexes (seed stays as runtime gate)
--   assumption_guidance_dedupe_001   → DELETE duplicates + ADD UNIQUE constraint
--   benchmark_snapshots_unique_001   → DELETE duplicates + ADD UNIQUE constraint
--   audit_unique_constraints_001     → DELETE duplicates + ADD UNIQUE constraints ×9
--   financials_computed_at_backfill_001 → UPDATE financials_computed_at from updated_at
--
-- Note: spo_scenario_property_unique skipped — already exists as UNIQUE INDEX from
-- 0036_batch7_pure_ddl.sql (scenario_overrides_001).

-- source: db-hygiene-001.ts — drop legacy duplicate FK names
ALTER TABLE "notification_logs" DROP CONSTRAINT IF EXISTS "notification_logs_alert_rule_id_fkey";
--> statement-breakpoint
ALTER TABLE "notification_logs" DROP CONSTRAINT IF EXISTS "notification_logs_property_id_fkey";
--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT IF EXISTS "conversations_user_id_fkey";
--> statement-breakpoint
-- db-hygiene-001 — delete orphaned logos (non-default, not referenced anywhere)
DELETE FROM logos
  WHERE is_default = false
    AND url NOT LIKE '/logos/h-plus-%'
    AND id NOT IN (
      SELECT logo_id FROM companies WHERE logo_id IS NOT NULL
      UNION
      SELECT company_logo_id FROM global_assumptions WHERE company_logo_id IS NOT NULL
      UNION
      SELECT asset_logo_id FROM global_assumptions WHERE asset_logo_id IS NOT NULL
    );
--> statement-breakpoint

-- source: fix-shared-ownership.ts — all portfolio data must be shared (user_id = NULL)
UPDATE properties SET user_id = NULL WHERE user_id IS NOT NULL;
--> statement-breakpoint
UPDATE global_assumptions SET user_id = NULL WHERE user_id IS NOT NULL;
--> statement-breakpoint
-- Keep only the newest shared global_assumptions row
DELETE FROM global_assumptions
  WHERE user_id IS NULL
    AND id < (SELECT MAX(id) FROM global_assumptions WHERE user_id IS NULL);
--> statement-breakpoint

-- source: role-partner-to-user-001.ts
UPDATE users SET role = 'user' WHERE role = 'partner';
--> statement-breakpoint

-- source: role-checker-investor-to-user-001.ts
UPDATE users SET role = 'user' WHERE role IN ('checker', 'investor');
--> statement-breakpoint

-- source: financials-computed-at-backfill-001.ts
UPDATE properties SET financials_computed_at = updated_at WHERE financials_computed_at IS NULL;
--> statement-breakpoint

-- source: property-notnull-001.ts — backfill defaults before adding NOT NULL
UPDATE properties SET ar_days = 30 WHERE ar_days IS NULL;
--> statement-breakpoint
UPDATE properties SET ap_days = 45 WHERE ap_days IS NULL;
--> statement-breakpoint
UPDATE properties SET reinvestment_rate = 0.05 WHERE reinvestment_rate IS NULL;
--> statement-breakpoint
UPDATE properties SET day_count_convention = '30/360' WHERE day_count_convention IS NULL;
--> statement-breakpoint
UPDATE properties SET escalation_method = 'annual' WHERE escalation_method IS NULL;
--> statement-breakpoint
UPDATE properties SET cost_seg_enabled = false WHERE cost_seg_enabled IS NULL;
--> statement-breakpoint
UPDATE properties SET cost_seg_5yr_pct = 0.15 WHERE cost_seg_5yr_pct IS NULL;
--> statement-breakpoint
UPDATE properties SET cost_seg_7yr_pct = 0.10 WHERE cost_seg_7yr_pct IS NULL;
--> statement-breakpoint
UPDATE properties SET cost_seg_15yr_pct = 0.05 WHERE cost_seg_15yr_pct IS NULL;
--> statement-breakpoint
ALTER TABLE properties ALTER COLUMN ar_days SET NOT NULL;
--> statement-breakpoint
ALTER TABLE properties ALTER COLUMN ap_days SET NOT NULL;
--> statement-breakpoint
ALTER TABLE properties ALTER COLUMN reinvestment_rate SET NOT NULL;
--> statement-breakpoint
ALTER TABLE properties ALTER COLUMN day_count_convention SET NOT NULL;
--> statement-breakpoint
ALTER TABLE properties ALTER COLUMN escalation_method SET NOT NULL;
--> statement-breakpoint
ALTER TABLE properties ALTER COLUMN cost_seg_enabled SET NOT NULL;
--> statement-breakpoint
ALTER TABLE properties ALTER COLUMN cost_seg_5yr_pct SET NOT NULL;
--> statement-breakpoint
ALTER TABLE properties ALTER COLUMN cost_seg_7yr_pct SET NOT NULL;
--> statement-breakpoint
ALTER TABLE properties ALTER COLUMN cost_seg_15yr_pct SET NOT NULL;
--> statement-breakpoint

-- source: app-logo-001.ts
ALTER TABLE logos ADD COLUMN IF NOT EXISTS is_app_logo boolean NOT NULL DEFAULT false;
--> statement-breakpoint
UPDATE logos SET is_app_logo = true
  WHERE is_default = true
    AND NOT EXISTS (SELECT 1 FROM logos WHERE is_app_logo = true);
--> statement-breakpoint

-- source: admin-resources-004.ts (DDL part; seed INSERT stays in runtime gate)
CREATE TABLE IF NOT EXISTS specialist_research_quality_snapshots (
  id            integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  specialist_id text NOT NULL,
  score         integer NOT NULL,
  gaps          jsonb NOT NULL DEFAULT '[]'::jsonb,
  signals       jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at   timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS specialist_quality_specialist_idx
  ON specialist_research_quality_snapshots (specialist_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS specialist_quality_specialist_time_idx
  ON specialist_research_quality_snapshots (specialist_id, computed_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS resource_specialist_connections (
  id          integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  resource_id integer NOT NULL REFERENCES admin_resources(id) ON DELETE CASCADE,
  target      text NOT NULL,
  created_at  timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS resource_specialist_connections_uniq
  ON resource_specialist_connections (resource_id, target);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS resource_specialist_connections_target_idx
  ON resource_specialist_connections (target);
--> statement-breakpoint

-- source: assumption-guidance-dedupe-001.ts
-- Dedup: keep highest id per (scenario_id, entity_type, entity_id, assumption_key)
DELETE FROM assumption_guidance a
  USING assumption_guidance b
  WHERE a.id < b.id
    AND a.scenario_id    = b.scenario_id
    AND a.entity_type    = b.entity_type
    AND a.entity_id      = b.entity_id
    AND a.assumption_key = b.assumption_key;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE assumption_guidance
    ADD CONSTRAINT assumption_guidance_unique
    UNIQUE (scenario_id, entity_type, entity_id, assumption_key);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- source: benchmark-snapshots-unique-001.ts
DELETE FROM benchmark_snapshots a
  USING benchmark_snapshots b
  WHERE a.id < b.id AND a.snapshot_key = b.snapshot_key;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE benchmark_snapshots
    ADD CONSTRAINT benchmark_snapshots_snapshot_key_unique UNIQUE (snapshot_key);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- source: audit-unique-constraints-001.ts (9 of 10 targets; spo_scenario_property_unique
-- is already covered by the UNIQUE INDEX in 0036_batch7_pure_ddl.sql)

-- properties.stable_key
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='properties') THEN
    DELETE FROM properties a USING properties b WHERE a.id < b.id AND a.stable_key = b.stable_key;
    BEGIN
      ALTER TABLE properties ADD CONSTRAINT properties_stable_key_unique UNIQUE (stable_key);
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;
--> statement-breakpoint

-- media_assets.filename
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='media_assets') THEN
    DELETE FROM media_assets a USING media_assets b WHERE a.id < b.id AND a.filename = b.filename;
    BEGIN
      ALTER TABLE media_assets ADD CONSTRAINT media_assets_filename_unique UNIQUE (filename);
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;
--> statement-breakpoint

-- source_registry.service_key
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='source_registry') THEN
    DELETE FROM source_registry a USING source_registry b WHERE a.id < b.id AND a.service_key = b.service_key;
    BEGIN
      ALTER TABLE source_registry ADD CONSTRAINT source_registry_service_key_unique UNIQUE (service_key);
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;
--> statement-breakpoint

-- pipeline_policies.policy_key
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='pipeline_policies') THEN
    DELETE FROM pipeline_policies a USING pipeline_policies b WHERE a.id < b.id AND a.policy_key = b.policy_key;
    BEGIN
      ALTER TABLE pipeline_policies ADD CONSTRAINT pipeline_policies_policy_key_unique UNIQUE (policy_key);
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;
--> statement-breakpoint

-- scheduled_research_workflows.workflow_key
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='scheduled_research_workflows') THEN
    DELETE FROM scheduled_research_workflows a USING scheduled_research_workflows b WHERE a.id < b.id AND a.workflow_key = b.workflow_key;
    BEGIN
      ALTER TABLE scheduled_research_workflows ADD CONSTRAINT scheduled_research_workflows_workflow_key_unique UNIQUE (workflow_key);
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;
--> statement-breakpoint

-- external_integrations.service_key
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='external_integrations') THEN
    DELETE FROM external_integrations a USING external_integrations b WHERE a.id < b.id AND a.service_key = b.service_key;
    BEGIN
      ALTER TABLE external_integrations ADD CONSTRAINT external_integrations_service_key_unique UNIQUE (service_key);
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;
--> statement-breakpoint

-- capital_raise_benchmarks.dimension_key
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='capital_raise_benchmarks') THEN
    DELETE FROM capital_raise_benchmarks a USING capital_raise_benchmarks b WHERE a.id < b.id AND a.dimension_key = b.dimension_key;
    BEGIN
      ALTER TABLE capital_raise_benchmarks ADD CONSTRAINT capital_raise_benchmarks_dimension_key_unique UNIQUE (dimension_key);
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;
--> statement-breakpoint

-- exit_multiples.dimension_key
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='exit_multiples') THEN
    DELETE FROM exit_multiples a USING exit_multiples b WHERE a.id < b.id AND a.dimension_key = b.dimension_key;
    BEGIN
      ALTER TABLE exit_multiples ADD CONSTRAINT exit_multiples_dimension_key_unique UNIQUE (dimension_key);
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;
--> statement-breakpoint

-- hospitality_benchmarks(metric_key, country, source_year)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='hospitality_benchmarks') THEN
    DELETE FROM hospitality_benchmarks a USING hospitality_benchmarks b
      WHERE a.id < b.id AND a.metric_key = b.metric_key AND a.country = b.country AND a.source_year = b.source_year;
    BEGIN
      ALTER TABLE hospitality_benchmarks ADD CONSTRAINT hospitality_benchmarks_metric_country_year UNIQUE (metric_key, country, source_year);
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;
