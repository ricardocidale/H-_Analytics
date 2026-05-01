-- Consolidated schema migration: combines all prior runtime ADD COLUMN / CREATE TABLE / CREATE INDEX
-- migrations into a single Drizzle migration. All statements use IF NOT EXISTS or EXCEPTION guards
-- for idempotency on databases that already have these objects.

-- notification_logs schema fixes
DO $$ BEGIN ALTER TABLE notification_logs RENAME COLUMN "error" TO "error_message"; EXCEPTION WHEN undefined_column THEN NULL; END $$;
--> statement-breakpoint
ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS "alert_rule_id" integer;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE notification_logs ADD CONSTRAINT notification_logs_alert_rule_id_fk FOREIGN KEY (alert_rule_id) REFERENCES alert_rules(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS "property_id" integer;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE notification_logs ADD CONSTRAINT notification_logs_property_id_fk FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS "retry_count" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now() NOT NULL;
--> statement-breakpoint
UPDATE notification_logs SET created_at = now() WHERE created_at IS NULL;
--> statement-breakpoint
ALTER TABLE notification_logs ALTER COLUMN "created_at" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE notification_logs ALTER COLUMN "created_at" SET DEFAULT now();
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE notification_settings RENAME COLUMN "key" TO "setting_key"; EXCEPTION WHEN undefined_column THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE notification_settings RENAME COLUMN "value" TO "setting_value"; EXCEPTION WHEN undefined_column THEN NULL; END $$;
--> statement-breakpoint
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS "user_id" integer;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE conversations ADD CONSTRAINT conversations_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS conversations_user_id_idx ON conversations (user_id);
--> statement-breakpoint
UPDATE user_groups SET theme_id = NULL WHERE theme_id IS NOT NULL AND theme_id NOT IN (SELECT id FROM design_themes);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE alert_rules RENAME COLUMN "enabled" TO "is_active"; EXCEPTION WHEN undefined_column THEN NULL; END $$;
--> statement-breakpoint
ALTER TABLE alert_rules DROP COLUMN IF EXISTS "channels";
--> statement-breakpoint
ALTER TABLE alert_rules DROP COLUMN IF EXISTS "created_by";
--> statement-breakpoint
ALTER TABLE notification_preferences DROP COLUMN IF EXISTS "channels";
--> statement-breakpoint
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS "channel" text NOT NULL DEFAULT 'email';
--> statement-breakpoint
ALTER TABLE notification_preferences DROP COLUMN IF EXISTS "updated_at";
--> statement-breakpoint
DELETE FROM notification_preferences a USING notification_preferences b WHERE a.id > b.id AND a.user_id = b.user_id AND a.event_type = b.event_type AND a.channel = b.channel;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS notification_pref_unique ON notification_preferences (user_id, event_type, channel);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS notification_prefs_user_id_idx ON notification_preferences (user_id);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE companies ADD CONSTRAINT companies_logo_id_fk FOREIGN KEY (logo_id) REFERENCES logos(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE companies ADD CONSTRAINT companies_theme_id_fk FOREIGN KEY (theme_id) REFERENCES design_themes(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE users ADD CONSTRAINT users_user_group_id_fk FOREIGN KEY (user_group_id) REFERENCES user_groups(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE users ADD CONSTRAINT users_selected_theme_id_fk FOREIGN KEY (selected_theme_id) REFERENCES design_themes(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE users ADD CONSTRAINT users_company_id_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE user_groups ADD CONSTRAINT user_groups_asset_description_id_fk FOREIGN KEY (asset_description_id) REFERENCES asset_descriptions(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE user_groups ADD CONSTRAINT user_groups_logo_id_fk FOREIGN KEY (logo_id) REFERENCES logos(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE user_groups ADD CONSTRAINT user_groups_theme_id_fk FOREIGN KEY (theme_id) REFERENCES design_themes(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE notification_preferences ADD CONSTRAINT notification_preferences_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE alert_rules ADD CONSTRAINT alert_rules_property_id_fk FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE property_fee_categories ADD CONSTRAINT property_fee_categories_property_id_fk FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE property_photos ADD CONSTRAINT property_photos_property_id_fk FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE property_photos ADD CONSTRAINT property_photos_before_photo_id_fk FOREIGN KEY (before_photo_id) REFERENCES property_photos(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE global_assumptions ADD CONSTRAINT ga_asset_logo_id_fk FOREIGN KEY (asset_logo_id) REFERENCES logos(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE global_assumptions ADD CONSTRAINT ga_company_logo_id_fk FOREIGN KEY (company_logo_id) REFERENCES logos(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE user_group_properties ADD CONSTRAINT ugp_user_group_id_fk FOREIGN KEY (user_group_id) REFERENCES user_groups(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE user_group_properties ADD CONSTRAINT ugp_property_id_fk FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

-- global_assumptions columns
ALTER TABLE global_assumptions
  ADD COLUMN IF NOT EXISTS research_config jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS icp_config jsonb,
  ADD COLUMN IF NOT EXISTS export_config jsonb,
  ADD COLUMN IF NOT EXISTS auto_research_refresh_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rebecca_chat_engine text NOT NULL DEFAULT 'gemini',
  ADD COLUMN IF NOT EXISTS company_inflation_rate real,
  ADD COLUMN IF NOT EXISTS company_phone text,
  ADD COLUMN IF NOT EXISTS company_email text,
  ADD COLUMN IF NOT EXISTS company_website text,
  ADD COLUMN IF NOT EXISTS company_ein text,
  ADD COLUMN IF NOT EXISTS company_founding_year integer,
  ADD COLUMN IF NOT EXISTS company_street_address text,
  ADD COLUMN IF NOT EXISTS company_city text,
  ADD COLUMN IF NOT EXISTS company_state_province text,
  ADD COLUMN IF NOT EXISTS company_country text,
  ADD COLUMN IF NOT EXISTS company_zip_postal_code text,
  ADD COLUMN IF NOT EXISTS funding_interest_rate real NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS funding_interest_payment_frequency text NOT NULL DEFAULT 'quarterly';
--> statement-breakpoint

-- properties columns
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS inflation_rate real,
  ADD COLUMN IF NOT EXISTS escalation_method text DEFAULT 'annual',
  ADD COLUMN IF NOT EXISTS country_risk_premium real;
--> statement-breakpoint

-- companies columns
ALTER TABLE companies ADD COLUMN IF NOT EXISTS theme_id integer;
--> statement-breakpoint

-- design_themes columns
ALTER TABLE design_themes
  ADD COLUMN IF NOT EXISTS icon_set text NOT NULL DEFAULT 'lucide',
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;
--> statement-breakpoint

-- users columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id text;
--> statement-breakpoint

-- scenarios columns
ALTER TABLE scenarios ADD COLUMN IF NOT EXISTS property_photos jsonb;
--> statement-breakpoint

-- property_photos table
CREATE TABLE IF NOT EXISTS property_photos (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_hero BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  variants JSONB,
  generation_style TEXT,
  before_photo_id INTEGER
);
--> statement-breakpoint
ALTER TABLE property_photos
  ADD COLUMN IF NOT EXISTS variants JSONB,
  ADD COLUMN IF NOT EXISTS generation_style TEXT,
  ADD COLUMN IF NOT EXISTS before_photo_id INTEGER;
--> statement-breakpoint

-- document_extractions table
CREATE TABLE IF NOT EXISTS document_extractions (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_content_type TEXT NOT NULL,
  object_path TEXT NOT NULL,
  document_type TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'pending',
  raw_extraction_data JSONB,
  error_message TEXT,
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);
--> statement-breakpoint

-- extraction_fields table
CREATE TABLE IF NOT EXISTS extraction_fields (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  extraction_id INTEGER NOT NULL REFERENCES document_extractions(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  field_label TEXT NOT NULL,
  extracted_value TEXT NOT NULL,
  mapped_property_field TEXT,
  confidence REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  current_value TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);
--> statement-breakpoint

-- seed_defaults table
CREATE TABLE IF NOT EXISTS seed_defaults (
  id INTEGER PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  entity_type text NOT NULL,
  entity_key text NOT NULL,
  field_name text NOT NULL,
  seed_value jsonb NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_seed_defaults_entity_field UNIQUE (entity_type, entity_key, field_name)
);
--> statement-breakpoint

-- All indexes (consolidated)
CREATE INDEX IF NOT EXISTS properties_created_at_idx ON properties (created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS market_research_updated_at_idx ON market_research (updated_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx ON activity_logs (created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS property_photos_property_id_idx ON property_photos (property_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS doc_extractions_property_id_idx ON document_extractions(property_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS doc_extractions_user_id_idx ON document_extractions(user_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS extraction_fields_extraction_id_idx ON extraction_fields(extraction_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS market_research_type_updated_idx ON market_research (type, updated_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS scenarios_user_updated_idx ON scenarios (user_id, updated_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_seed_defaults_lookup ON seed_defaults(entity_type, entity_key);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS alert_rules_property_id_idx ON alert_rules (property_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS notification_logs_alert_rule_id_idx ON notification_logs (alert_rule_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS notification_logs_property_id_idx ON notification_logs (property_id);
--> statement-breakpoint

-- Drop removed tables
DROP TABLE IF EXISTS docusign_envelopes CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS plaid_categorization_cache CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS plaid_transactions CASCADE;
--> statement-breakpoint
DROP TABLE IF EXISTS plaid_connections CASCADE;
