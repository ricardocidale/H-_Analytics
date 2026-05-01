-- 0032_batch3_rebecca.sql
--
-- Phase C batch 3: consolidate 4 Rebecca-related runtime migrations.
--
-- Migrations consolidated:
--   rebecca_chat_engine_001     → ADD COLUMN rebecca_chat_engine on global_assumptions
--   rebecca_fixture_replay_001  → ADD COLUMN ×4 on rebecca_preview_fixtures
--   rebecca_fixtures_001        → CREATE TABLE rebecca_preview_fixtures + indexes
--   rebecca_opt_out_001         → ADD COLUMN rebecca_opt_out on users
--
-- Notes:
--   rebecca_chat_engine_001 had no boot-sequence gate in index.ts (was never wired in).
--   rebecca_fixtures_001 must appear before rebecca_fixture_replay_001 (table must exist).
--   All statements use IF NOT EXISTS / idempotent DDL.

-- source: rebecca-fixtures-001.ts
CREATE TABLE IF NOT EXISTS rebecca_preview_fixtures (
  id             integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name           text NOT NULL,
  description    text,
  settings       jsonb NOT NULL,
  turns          jsonb NOT NULL,
  created_by_id  integer REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamp DEFAULT now() NOT NULL,
  updated_at     timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE rebecca_preview_fixtures
    ADD CONSTRAINT rebecca_preview_fixtures_name_uq UNIQUE (name);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS rebecca_preview_fixtures_created_by_idx
  ON rebecca_preview_fixtures (created_by_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS rebecca_preview_fixtures_created_at_idx
  ON rebecca_preview_fixtures (created_at);
--> statement-breakpoint

-- source: rebecca-fixture-replay-001.ts
ALTER TABLE "rebecca_preview_fixtures" ADD COLUMN IF NOT EXISTS "last_replay_at" timestamp;
--> statement-breakpoint
ALTER TABLE "rebecca_preview_fixtures" ADD COLUMN IF NOT EXISTS "last_replay_status" text;
--> statement-breakpoint
ALTER TABLE "rebecca_preview_fixtures" ADD COLUMN IF NOT EXISTS "last_replay_summary" jsonb;
--> statement-breakpoint
ALTER TABLE "rebecca_preview_fixtures" ADD COLUMN IF NOT EXISTS "last_replay_fingerprint" text;
--> statement-breakpoint

-- source: rebecca-chat-engine-001.ts
ALTER TABLE "global_assumptions" ADD COLUMN IF NOT EXISTS "rebecca_chat_engine" text NOT NULL DEFAULT 'gemini';
--> statement-breakpoint

-- source: rebecca-opt-out-001.ts
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "rebecca_opt_out" boolean NOT NULL DEFAULT false;
