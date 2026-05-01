-- Task #424 — Admin Required Fields tab moved to per-Specialist surfaces.
-- The standalone global required-fields gate is gone (UI, route, and storage),
-- so the column that backed it is no longer read or written. Drop it.
ALTER TABLE "global_assumptions" DROP COLUMN IF EXISTS "required_fields_config";
