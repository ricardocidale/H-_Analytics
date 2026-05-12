-- 0055_icp_bracket_mix
--
-- Task #1412 — Add bracket_mix JSONB column to global_assumptions.
-- Stores the Management Company's weighted ICP bracket mix (array of
-- bracket entries with weights summing to 1.0). NULL = not yet assigned.
-- IF NOT EXISTS guards idempotent re-runs.

ALTER TABLE "global_assumptions" ADD COLUMN IF NOT EXISTS "bracket_mix" jsonb;
