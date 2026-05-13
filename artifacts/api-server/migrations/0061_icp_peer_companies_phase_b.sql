-- 0061_icp_peer_companies_phase_b
-- Phase B of the ICP bracket-mix peer-derived rebuild plan
-- (docs/plans/2026-05-13-001-feat-icp-bracket-mix-peer-derived-phase-b-plan.md).
--
-- Adds Tiago (Bracket-Mix Specialist) output columns to icp_peer_companies.
-- All columns nullable; NULL means the peer has not been researched yet.
--
-- Self-idempotent: every statement guarded with IF NOT EXISTS.

ALTER TABLE "icp_peer_companies"
  ADD COLUMN IF NOT EXISTS "brand_archetype_split" jsonb;

ALTER TABLE "icp_peer_companies"
  ADD COLUMN IF NOT EXISTS "roster_size_estimate" integer;

ALTER TABLE "icp_peer_companies"
  ADD COLUMN IF NOT EXISTS "split_evidence" jsonb;

ALTER TABLE "icp_peer_companies"
  ADD COLUMN IF NOT EXISTS "last_research_run_id" integer;

ALTER TABLE "icp_peer_companies"
  ADD COLUMN IF NOT EXISTS "costantino_config" jsonb;
