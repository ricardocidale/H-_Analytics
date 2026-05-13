-- 0065_icp_brackets_match_rules.sql
--
-- Mirror of lib/db/migrations/0058_icp_brackets_match_rules.sql for the
-- api-server's migrate() runner. The artifacts/api-server/migrations folder
-- has drifted past lib/db/migrations/ (see docs/runbooks/schema-migrations.md),
-- so new migrations are mirrored with non-colliding slot numbers.
--
-- Plan 2026-05-13-001 U7 — persist Davi's best-fit match rules on icp_brackets.

ALTER TABLE "icp_brackets"
  ADD COLUMN IF NOT EXISTS "match_countries" jsonb;

ALTER TABLE "icp_brackets"
  ADD COLUMN IF NOT EXISTS "match_business_models" jsonb;

ALTER TABLE "icp_brackets"
  ADD COLUMN IF NOT EXISTS "match_quality_tiers" jsonb;

ALTER TABLE "icp_brackets"
  ADD COLUMN IF NOT EXISTS "match_keywords" jsonb;

ALTER TABLE "icp_brackets"
  ADD COLUMN IF NOT EXISTS "match_priority" integer NOT NULL DEFAULT 0;

ALTER TABLE "icp_brackets"
  ADD COLUMN IF NOT EXISTS "match_rationale" text;
