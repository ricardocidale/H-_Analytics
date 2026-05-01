-- 0036_batch7_pure_ddl.sql
--
-- Phase C batch 7: consolidate 17 pure-DDL runtime migrations.
-- Ordered by dependency (tables before their FK references).
--
-- Migrations consolidated:
--   can_manage_scenarios_001         → ADD COLUMN on users
--   fk_hardening_001                 → ADD FK constraints on existing tables
--   scenario_system_unique_001       → CREATE UNIQUE INDEX on scenarios
--   photo_image_data_001             → ADD COLUMN on property_photos
--   admin_resources_003              → ADD COLUMN on specialist_configs/versions
--   scenario_access_001              → CREATE TABLE scenario_access + indexes
--   source_call_logs_001             → CREATE TABLE source_call_logs + ADD COLUMNs on source_registry
--   property_urls_001                → CREATE TABLE property_urls + index
--   calc_audit_001                   → CREATE TABLE calculation_audit_logs + indexes
--   scenario_overrides_001           → CREATE TABLE scenario_property_overrides + ADD COLUMNs on scenarios
--   property_dd_001                  → CREATE TABLE dd_template_items + property_dd_items + indexes
--   admin_resources_001              → CREATE TABLE admin_resources + admin_resource_versions +
--                                      audit_break_glass_overrides + specialist_assignments
--   admin_resources_002              → CREATE TABLE resource_health_checks
--   pipeline_n1_global_models_001    → ADD COLUMN ×4 on pipeline_policies (refs admin_resources)
--   vector_chunks_gin_001            → CREATE GIN INDEX on vector_chunks.metadata
--   index_coverage_001               → CREATE 6 FK covering indexes
--   fk_indexes_002                   → CREATE 13 FK covering indexes

-- source: can-manage-scenarios-001.ts
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "can_manage_scenarios" boolean NOT NULL DEFAULT true;
--> statement-breakpoint

-- source: fk-hardening-001.ts
-- NOTE: users.company_id never existed in production; that FK was a no-op and
-- was intentionally excluded. If a future migration adds company_id, add the FK there.
DO $$ BEGIN
  ALTER TABLE "companies" ADD CONSTRAINT "companies_logo_id_logos_id_fk"
    FOREIGN KEY ("logo_id") REFERENCES "logos"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "companies" ADD CONSTRAINT "companies_theme_id_design_themes_id_fk"
    FOREIGN KEY ("theme_id") REFERENCES "design_themes"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_selected_theme_id_design_themes_id_fk"
    FOREIGN KEY ("selected_theme_id") REFERENCES "design_themes"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_alert_rule_id_alert_rules_id_fk"
    FOREIGN KEY ("alert_rule_id") REFERENCES "alert_rules"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_property_id_properties_id_fk"
    FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- source: scenario-system-unique-001.ts
CREATE UNIQUE INDEX IF NOT EXISTS "scenarios_user_kind_unique"
  ON "scenarios" ("user_id", "kind")
  WHERE "kind" IN ('default', 'autosave') AND "deleted_at" IS NULL;
--> statement-breakpoint

-- source: photo-image-data-001.ts
ALTER TABLE "property_photos" ADD COLUMN IF NOT EXISTS "image_data" text;
--> statement-breakpoint

-- source: admin-resources-003.ts
ALTER TABLE "specialist_configs" ADD COLUMN IF NOT EXISTS "refresh_cadence_days" integer;
--> statement-breakpoint
ALTER TABLE "specialist_config_versions" ADD COLUMN IF NOT EXISTS "refresh_cadence_days" integer;
--> statement-breakpoint

-- source: scenario-access-001.ts
CREATE TABLE IF NOT EXISTS scenario_access (
  id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scenario_id integer REFERENCES scenarios(id) ON DELETE CASCADE,
  owner_id   integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  grantee_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  grant_type text NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS scenario_access_owner_id_idx ON scenario_access (owner_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS scenario_access_grantee_id_idx ON scenario_access (grantee_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS scenario_access_scenario_id_idx ON scenario_access (scenario_id);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE scenario_access ADD CONSTRAINT scenario_access_unique_grant
    UNIQUE (scenario_id, owner_id, grantee_id, grant_type);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- source: source-call-logs-001.ts
CREATE TABLE IF NOT EXISTS source_call_logs (
  id          integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  source_id   integer NOT NULL REFERENCES source_registry(id) ON DELETE CASCADE,
  service_key text NOT NULL,
  timestamp   timestamp DEFAULT now() NOT NULL,
  http_status integer,
  latency_ms  integer,
  success     boolean NOT NULL,
  error_message text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS source_call_logs_source_idx ON source_call_logs (source_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS source_call_logs_ts_idx ON source_call_logs (timestamp);
--> statement-breakpoint
ALTER TABLE "source_registry" ADD COLUMN IF NOT EXISTS "description" text;
--> statement-breakpoint
ALTER TABLE "source_registry" ADD COLUMN IF NOT EXISTS "endpoint" text;
--> statement-breakpoint
ALTER TABLE "source_registry" ADD COLUMN IF NOT EXISTS "api_key_ref" text;
--> statement-breakpoint
ALTER TABLE "source_registry" ADD COLUMN IF NOT EXISTS "rate_limit_per_min" integer;
--> statement-breakpoint
ALTER TABLE "source_registry" ADD COLUMN IF NOT EXISTS "success_rate" real;
--> statement-breakpoint
ALTER TABLE "source_registry" ADD COLUMN IF NOT EXISTS "avg_latency_ms" real;
--> statement-breakpoint
ALTER TABLE "source_registry" ADD COLUMN IF NOT EXISTS "cost_per_call" text;
--> statement-breakpoint
ALTER TABLE "source_registry" ADD COLUMN IF NOT EXISTS "data_provided" jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint

-- source: property-urls-001.ts
CREATE TABLE IF NOT EXISTS property_urls (
  id              serial PRIMARY KEY,
  property_id     integer NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  url             text NOT NULL,
  label           varchar(200),
  is_valid        boolean,
  is_relevant     boolean,
  relevance_score real,
  last_checked_at timestamp,
  metadata        jsonb DEFAULT '{}'::jsonb,
  created_at      timestamp DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_property_urls_property_id ON property_urls (property_id);
--> statement-breakpoint

-- source: calc-audit-001.ts
CREATE TABLE IF NOT EXISTS calculation_audit_logs (
  id              integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  scenario_id     integer NOT NULL,
  property_id     integer NOT NULL,
  user_id         integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  computed_at     timestamp DEFAULT now() NOT NULL,
  engine_version  text NOT NULL,
  input_hash      text NOT NULL,
  output_hash     text NOT NULL,
  audit_opinion   text NOT NULL,
  duration_ms     real NOT NULL,
  total_steps     integer NOT NULL DEFAULT 0,
  log_entries     jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS calc_audit_scenario_idx ON calculation_audit_logs (scenario_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS calc_audit_property_idx ON calculation_audit_logs (property_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS calc_audit_user_idx ON calculation_audit_logs (user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS calc_audit_computed_at_idx ON calculation_audit_logs (computed_at);
--> statement-breakpoint

-- source: scenario-overrides-001.ts
CREATE TABLE IF NOT EXISTS "scenario_property_overrides" (
  "id"                    integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "scenario_id"           integer NOT NULL REFERENCES "scenarios"("id") ON DELETE CASCADE,
  "property_name"         text NOT NULL,
  "change_type"           text NOT NULL DEFAULT 'modified',
  "overrides"             jsonb NOT NULL DEFAULT '{}',
  "base_property_snapshot" jsonb,
  "created_at"            timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spo_scenario_id_idx" ON "scenario_property_overrides" ("scenario_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spo_property_name_idx" ON "scenario_property_overrides" ("property_name");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "spo_scenario_property_unique" ON "scenario_property_overrides" ("scenario_id", "property_name");
--> statement-breakpoint
ALTER TABLE "scenarios" ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "scenarios" ADD COLUMN IF NOT EXISTS "base_snapshot_hash" text;
--> statement-breakpoint
ALTER TABLE "scenario_property_overrides" ADD COLUMN IF NOT EXISTS "property_id" integer REFERENCES "properties"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spo_scenario_property_id_idx" ON "scenario_property_overrides" ("scenario_id", "property_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spo_overrides_gin_idx" ON "scenario_property_overrides" USING GIN ("overrides");
--> statement-breakpoint

-- source: property-dd-001.ts
CREATE TABLE IF NOT EXISTS dd_template_items (
  id               integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  key              text NOT NULL,
  workstream       text NOT NULL,
  label            text NOT NULL,
  description      text NOT NULL,
  is_stop_gate     boolean NOT NULL DEFAULT false,
  default_vendor_type text,
  sort_order       integer NOT NULL DEFAULT 0,
  archived         boolean NOT NULL DEFAULT false,
  template_version integer NOT NULL,
  updated_at       timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS dd_template_items_key_uniq ON dd_template_items (key);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS dd_template_items_workstream_idx ON dd_template_items (workstream);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE dd_template_items ADD CONSTRAINT dd_template_items_workstream_valid
    CHECK (workstream IN ('title-survey','environmental','physical','brand-pip',
      'operations-permits','employment-labor','insurance-risk','financial-tax',
      'contracts-assignability','legal-litigation'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS property_dd_items (
  id               integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  property_id      integer NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  template_item_key text NOT NULL,
  workstream       text NOT NULL,
  label            text NOT NULL,
  is_stop_gate     boolean NOT NULL DEFAULT false,
  sort_order       integer NOT NULL DEFAULT 0,
  status           text NOT NULL DEFAULT 'not_started',
  owner_user_id    integer REFERENCES users(id) ON DELETE SET NULL,
  owner_name       text,
  vendor           text,
  due_date         text,
  cost_estimate    real,
  cost_actual      real,
  findings         text,
  document_url     text,
  seeded_at        timestamp NOT NULL DEFAULT now(),
  updated_at       timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS property_dd_items_property_key_uniq ON property_dd_items (property_id, template_item_key);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS property_dd_items_property_idx ON property_dd_items (property_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS property_dd_items_workstream_idx ON property_dd_items (workstream);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE property_dd_items ADD CONSTRAINT property_dd_items_status_valid
    CHECK (status IN ('not_started','in_progress','complete','blocked','na'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- source: admin-resources-001.ts
CREATE TABLE IF NOT EXISTS admin_resources (
  id                  integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  kind                text NOT NULL,
  slug                text NOT NULL,
  display_name        text NOT NULL,
  description         text,
  config              jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_ref          text,
  version             integer NOT NULL DEFAULT 1,
  last_health_status  text NOT NULL DEFAULT 'gray',
  last_checked_at     timestamp,
  created_by_user_id  integer REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id  integer REFERENCES users(id) ON DELETE SET NULL,
  created_at          timestamp NOT NULL DEFAULT now(),
  updated_at          timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS admin_resources_kind_slug_uniq ON admin_resources (kind, slug);
--> statement-breakpoint
DROP INDEX IF EXISTS admin_resources_kind_slug_idx;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS admin_resources_kind_idx ON admin_resources (kind);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS admin_resource_versions (
  id                  integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  resource_id         integer NOT NULL REFERENCES admin_resources(id) ON DELETE CASCADE,
  version             integer NOT NULL,
  display_name        text NOT NULL,
  description         text,
  config              jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_ref          text,
  change_summary      text,
  changed_by_user_id  integer REFERENCES users(id) ON DELETE SET NULL,
  changed_at          timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS admin_resource_versions_resource_version_uniq ON admin_resource_versions (resource_id, version);
--> statement-breakpoint
DROP INDEX IF EXISTS admin_resource_versions_unique;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS admin_resource_versions_resource_idx ON admin_resource_versions (resource_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS audit_break_glass_overrides (
  id                    integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  specialist_id         text NOT NULL,
  assignment_kind       text NOT NULL,
  assignment_slug       text NOT NULL,
  assignment_role       text,
  override_resource_id  integer REFERENCES admin_resources(id) ON DELETE SET NULL,
  reason                text NOT NULL,
  expires_at            timestamp NOT NULL,
  created_by_user_id    integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at            timestamp NOT NULL DEFAULT now(),
  revoked_at            timestamp,
  revoked_by_user_id    integer REFERENCES users(id) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS break_glass_specialist_idx ON audit_break_glass_overrides (specialist_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS break_glass_expires_idx ON audit_break_glass_overrides (expires_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS specialist_assignments (
  id              integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  specialist_id   text NOT NULL,
  assignment_kind text NOT NULL,
  assignment_slug text NOT NULL,
  assignment_role text,
  resource_id     integer REFERENCES admin_resources(id) ON DELETE SET NULL,
  required        boolean NOT NULL DEFAULT true,
  synced_at       timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS specialist_assignments_uniq
  ON specialist_assignments (specialist_id, assignment_kind, assignment_slug, assignment_role);
--> statement-breakpoint
DROP INDEX IF EXISTS specialist_assignments_unique;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS specialist_assignments_specialist_idx ON specialist_assignments (specialist_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS specialist_assignments_resource_idx ON specialist_assignments (resource_id);
--> statement-breakpoint

-- source: admin-resources-002.ts
CREATE TABLE IF NOT EXISTS resource_health_checks (
  id                    integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  resource_id           integer NOT NULL REFERENCES admin_resources(id) ON DELETE CASCADE,
  kind                  text NOT NULL,
  status                text NOT NULL,
  latency_ms            integer,
  error_code            text,
  error_message         text,
  triggered_by_user_id  integer REFERENCES users(id) ON DELETE SET NULL,
  checked_at            timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS resource_health_checks_resource_idx ON resource_health_checks (resource_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS resource_health_checks_resource_time_idx ON resource_health_checks (resource_id, checked_at);
--> statement-breakpoint

-- source: pipeline-n1-global-models-001.ts
ALTER TABLE "pipeline_policies"
  ADD COLUMN IF NOT EXISTS "analyst_a_model_resource_id" integer REFERENCES admin_resources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "analyst_b_model_resource_id" integer REFERENCES admin_resources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "synthesis_model_resource_id" integer REFERENCES admin_resources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "fallback_model_resource_id" integer REFERENCES admin_resources(id) ON DELETE SET NULL;
--> statement-breakpoint

-- source: vector-chunks-gin-001.ts
CREATE INDEX IF NOT EXISTS vector_chunks_metadata_gin_idx
  ON vector_chunks USING gin (metadata jsonb_path_ops);
--> statement-breakpoint

-- source: index-coverage-001.ts
CREATE INDEX IF NOT EXISTS notification_logs_event_type_idx    ON notification_logs (event_type);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS notification_logs_status_idx        ON notification_logs (status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS notification_logs_created_at_idx    ON notification_logs (created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS notification_logs_alert_rule_id_idx ON notification_logs (alert_rule_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS notification_logs_property_id_idx   ON notification_logs (property_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS scenario_shares_granted_by_idx      ON scenario_shares (granted_by);
--> statement-breakpoint

-- source: fk-indexes-002.ts
CREATE INDEX IF NOT EXISTS pipeline_policies_analyst_a_model_idx          ON pipeline_policies (analyst_a_model_resource_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS pipeline_policies_analyst_b_model_idx          ON pipeline_policies (analyst_b_model_resource_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS pipeline_policies_synthesis_model_idx          ON pipeline_policies (synthesis_model_resource_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS pipeline_policies_fallback_model_idx           ON pipeline_policies (fallback_model_resource_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS specialist_configs_analyst_a_model_idx         ON specialist_configs (analyst_a_model_resource_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS specialist_configs_analyst_b_model_idx         ON specialist_configs (analyst_b_model_resource_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS specialist_configs_synthesis_model_idx         ON specialist_configs (synthesis_model_resource_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS specialist_configs_fallback_model_idx          ON specialist_configs (fallback_model_resource_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS specialist_config_versions_analyst_a_model_idx ON specialist_config_versions (analyst_a_model_resource_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS specialist_config_versions_analyst_b_model_idx ON specialist_config_versions (analyst_b_model_resource_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS specialist_config_versions_synthesis_model_idx ON specialist_config_versions (synthesis_model_resource_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS specialist_config_versions_fallback_model_idx  ON specialist_config_versions (fallback_model_resource_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS property_dd_items_owner_user_id_idx            ON property_dd_items (owner_user_id);
