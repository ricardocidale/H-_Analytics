-- 0060_icp_peer_companies
-- Phase A1 of the ICP bracket-mix peer-derived rebuild plan
-- (docs/plans/2026-05-13-001-refactor-icp-bracket-mix-peer-derived-plan.md).
--
-- Creates icp_peer_companies — the registry of peer brands whose property
-- rosters drive the management-co-level bracket mix. Replaces the prior
-- (incorrect) algorithm that classified the mgmt co's own portfolio.
--
-- Also adds nullable bracket_slug columns to the two national rate caches
-- so future research can attach per-bracket rate breakdowns. NULL means the
-- rate is universal (current behavior unchanged).
--
-- Self-idempotent: every statement guarded with IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS icp_peer_companies (
  id                 integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name               text NOT NULL,
  niche_tags         text[],
  is_active          boolean NOT NULL DEFAULT true,
  source_url         text,
  last_researched_at timestamp,
  created_at         timestamp NOT NULL DEFAULT now(),
  updated_at         timestamp NOT NULL DEFAULT now(),
  CONSTRAINT icp_peer_companies_name_uq UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS icp_peer_companies_active_idx
  ON icp_peer_companies (is_active);

ALTER TABLE vendor_passthrough_costs
  ADD COLUMN IF NOT EXISTS bracket_slug text;

ALTER TABLE mgmt_co_markup_factors
  ADD COLUMN IF NOT EXISTS bracket_slug text;
