-- 0033_batch4_specialists.sql
--
-- Phase C batch 4: consolidate 3 Specialist runtime migrations.
--
-- Migrations consolidated:
--   specialist_observed_missing_001          → ADD COLUMN ×2 on specialist_configs
--   specialist_recommendation_counters_001   → CREATE TABLE specialist_recommendation_counters
--   specialist_recommendation_events_001     → CREATE TABLE specialist_recommendation_events
--
-- Note: specialist_multi_model_001 is already a no-op shim superseded by
-- 0022_specialist_llm_overrides.sql. Not included here.

-- source: specialist-observed-missing-001.ts
ALTER TABLE "specialist_configs" ADD COLUMN IF NOT EXISTS "last_observed_missing" jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "specialist_configs" ADD COLUMN IF NOT EXISTS "last_observed_missing_at" timestamp;
--> statement-breakpoint

-- source: specialist-recommendation-counters-001.ts
CREATE TABLE IF NOT EXISTS specialist_recommendation_counters (
  id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  specialist_id   text NOT NULL,
  field_key       text NOT NULL,
  appearances     integer NOT NULL DEFAULT 0,
  first_observed_at timestamp NOT NULL DEFAULT now(),
  last_observed_at  timestamp NOT NULL DEFAULT now(),
  last_promoted_at  timestamp
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS specialist_rec_counters_uniq
  ON specialist_recommendation_counters (specialist_id, field_key);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS specialist_rec_counters_specialist_idx
  ON specialist_recommendation_counters (specialist_id);
--> statement-breakpoint

-- source: specialist-recommendation-events-001.ts
CREATE TABLE IF NOT EXISTS specialist_recommendation_events (
  id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  specialist_id   text NOT NULL,
  field_key       text NOT NULL,
  action          text NOT NULL,
  actor_user_id   integer REFERENCES users(id) ON DELETE SET NULL,
  occurred_at     timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS specialist_rec_events_specialist_idx
  ON specialist_recommendation_events (specialist_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS specialist_rec_events_specialist_field_idx
  ON specialist_recommendation_events (specialist_id, field_key);
