-- 0058_icp_brackets_match_rules.sql
--
-- Plan 2026-05-13-001 U7 — persist Davi's best-fit match rules on icp_brackets.
--
-- Adds six NULL-able columns + match_priority (default 0). Davi (per-property
-- best-fit classifier minion) loads rows WHERE match_priority > 0 and picks
-- the highest-priority match per property. NULL or empty array on any
-- match_* column = wildcard for that dimension. Predicates are AND-ed within
-- a row.
--
-- All statements use ADD COLUMN IF NOT EXISTS → re-running via migrate() is
-- a no-op. The matching runtime guard `icp-brackets-004.ts` re-applies the
-- same ALTERs at boot and seeds the rule rows for the 5 geography-tier
-- brackets via the BEST_FIT_RULES_SEED const in bracket-catalog.ts.

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
