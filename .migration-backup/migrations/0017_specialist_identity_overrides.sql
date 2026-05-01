-- Phase 3 (Task #453) — Admin-editable Specialist identity (humanName + gender).
-- The catalog (engine/analyst/registry/specialist-catalog.ts) supplies factory
-- defaults; an override row in `specialist_identity_overrides` wins per-field
-- when present. The orchestrator "gaspar" is editable through the same routes
-- (its catalog default lives in engine/analyst/identity.ts, not the catalog).
--
-- Audit lives in `specialist_identity_override_versions`: every upsert/reset
-- writes a snapshot of prior + next state inside the same transaction so the
-- SpecialistPage Identity tab can render an edit history.

CREATE TABLE IF NOT EXISTS specialist_identity_overrides (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  specialist_id text NOT NULL,
  human_name text,
  gender text,
  updated_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS specialist_identity_overrides_uniq
  ON specialist_identity_overrides (specialist_id);

CREATE TABLE IF NOT EXISTS specialist_identity_override_versions (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  specialist_id text NOT NULL,
  action text NOT NULL,
  prev_human_name text,
  prev_gender text,
  next_human_name text,
  next_gender text,
  change_summary text,
  changed_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  changed_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS specialist_identity_versions_specialist_idx
  ON specialist_identity_override_versions (specialist_id);
