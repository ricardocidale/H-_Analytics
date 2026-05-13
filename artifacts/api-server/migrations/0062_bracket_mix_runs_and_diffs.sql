-- 0062_bracket_mix_runs_and_diffs
-- Phase B U2 of the ICP bracket-mix peer-derived rebuild plan
-- (docs/plans/2026-05-13-001-feat-icp-bracket-mix-peer-derived-phase-b-plan.md).
--
-- Adds:
--   1. bracket_mix_runs              — provenance per Tiago Specialist run.
--   2. bracket_mix_dual_run_diffs    — Phase B vs legacy diff log per recompute.
--   3. global_assumptions.bracket_mix_override_run_id (nullable FK to bracket_mix_runs.id).
--   4. icp_peer_companies.last_research_run_id FK constraint to bracket_mix_runs.id.
--
-- Self-idempotent: every statement guarded with IF NOT EXISTS; FK additions
-- guarded by pg_constraint lookups inside DO blocks.

CREATE TABLE IF NOT EXISTS "bracket_mix_runs" (
  "id"                    integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "target_kind"           text NOT NULL,
  "target_id"             integer,
  "model"                 text,
  "sources"               jsonb,
  "mix_value"             jsonb NOT NULL,
  "roster_size_estimate"  integer,
  "run_at"                timestamp NOT NULL DEFAULT now(),
  "provisional"           boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS "bracket_mix_runs_target_idx"
  ON "bracket_mix_runs" ("target_kind", "target_id");

CREATE INDEX IF NOT EXISTS "bracket_mix_runs_run_at_idx"
  ON "bracket_mix_runs" ("run_at");

CREATE TABLE IF NOT EXISTS "bracket_mix_dual_run_diffs" (
  "id"               integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "recompute_at"     timestamp NOT NULL DEFAULT now(),
  "phase_b_mix"      jsonb,
  "legacy_mix"       jsonb,
  "phase_b_run_id"   integer REFERENCES "bracket_mix_runs"("id") ON DELETE SET NULL,
  "notes"            text
);

CREATE INDEX IF NOT EXISTS "bracket_mix_dual_run_diffs_recompute_at_idx"
  ON "bracket_mix_dual_run_diffs" ("recompute_at");

ALTER TABLE "global_assumptions"
  ADD COLUMN IF NOT EXISTS "bracket_mix_override_run_id" integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'global_assumptions_bracket_mix_override_run_id_fk'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'global_assumptions'
      AND column_name = 'bracket_mix_override_run_id'
  ) THEN
    ALTER TABLE "global_assumptions"
      ADD CONSTRAINT "global_assumptions_bracket_mix_override_run_id_fk"
      FOREIGN KEY ("bracket_mix_override_run_id")
      REFERENCES "bracket_mix_runs"("id") ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'icp_peer_companies_last_research_run_id_fk'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'icp_peer_companies'
      AND column_name = 'last_research_run_id'
  ) THEN
    ALTER TABLE "icp_peer_companies"
      ADD CONSTRAINT "icp_peer_companies_last_research_run_id_fk"
      FOREIGN KEY ("last_research_run_id")
      REFERENCES "bracket_mix_runs"("id") ON DELETE SET NULL;
  END IF;
END $$;
