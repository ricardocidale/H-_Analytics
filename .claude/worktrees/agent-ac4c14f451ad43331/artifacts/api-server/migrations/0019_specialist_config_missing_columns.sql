-- Task #488 — Add missing Specialist config columns.
-- The Drizzle schema in shared/schema/specialist.ts declares several columns
-- on `specialist_configs` and `specialist_config_versions` that no prior
-- migration created, so `getOrCreateSpecialistConfig` blew up the moment
-- the Specialist page tried to read or insert a row. Add them idempotently
-- so an already-patched DB and a fresh-from-zero DB both end up consistent
-- with the Drizzle definitions.

ALTER TABLE specialist_configs
  ADD COLUMN IF NOT EXISTS field_requirements jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE specialist_configs
  ADD COLUMN IF NOT EXISTS prerequisite_toggles jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE specialist_configs
  ADD COLUMN IF NOT EXISTS refresh_cadence_days integer;

ALTER TABLE specialist_configs
  ADD COLUMN IF NOT EXISTS last_observed_missing jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE specialist_configs
  ADD COLUMN IF NOT EXISTS last_observed_missing_at timestamp;

ALTER TABLE specialist_config_versions
  ADD COLUMN IF NOT EXISTS field_requirements jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE specialist_config_versions
  ADD COLUMN IF NOT EXISTS prerequisite_toggles jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE specialist_config_versions
  ADD COLUMN IF NOT EXISTS refresh_cadence_days integer;
