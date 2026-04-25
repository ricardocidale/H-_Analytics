-- Task #495 — Per-Specialist LLM Configuration overrides.
-- The Drizzle schema in shared/schema/specialist.ts (Task #495) introduces
-- six new override columns on `specialist_configs` and the parallel snapshot
-- columns on `specialist_config_versions`:
--
--   • analyst_a_model_resource_id      (FK admin_resources, nullable)
--   • analyst_b_model_resource_id      (FK admin_resources, nullable)
--   • synthesis_model_resource_id      (FK admin_resources, nullable)
--   • fallback_model_resource_id       (FK admin_resources, nullable)
--   • multi_model_enabled              (boolean, nullable — null = inherit)
--   • workflow_overrides               (jsonb,   nullable — null = inherit)
--
-- All six are nullable because "no row value" is the canonical signal that
-- the field is INHERITING the global default (see specialist-llm-resolver).
-- ON DELETE SET NULL on the model FKs mirrors the existing
-- `model_resource_id` column behavior so deleting a model resource never
-- orphans a Specialist row.
--
-- IF NOT EXISTS guards keep this idempotent: environments where the columns
-- were previously created via direct ALTER (e.g. drizzle-kit push blocked by
-- an unrelated TTY rename prompt) will skip cleanly.

ALTER TABLE specialist_configs
  ADD COLUMN IF NOT EXISTS analyst_a_model_resource_id integer
    REFERENCES admin_resources(id) ON DELETE SET NULL;
ALTER TABLE specialist_configs
  ADD COLUMN IF NOT EXISTS analyst_b_model_resource_id integer
    REFERENCES admin_resources(id) ON DELETE SET NULL;
ALTER TABLE specialist_configs
  ADD COLUMN IF NOT EXISTS synthesis_model_resource_id integer
    REFERENCES admin_resources(id) ON DELETE SET NULL;
ALTER TABLE specialist_configs
  ADD COLUMN IF NOT EXISTS fallback_model_resource_id integer
    REFERENCES admin_resources(id) ON DELETE SET NULL;
ALTER TABLE specialist_configs
  ADD COLUMN IF NOT EXISTS multi_model_enabled boolean;
ALTER TABLE specialist_configs
  ADD COLUMN IF NOT EXISTS workflow_overrides jsonb;

ALTER TABLE specialist_config_versions
  ADD COLUMN IF NOT EXISTS analyst_a_model_resource_id integer
    REFERENCES admin_resources(id) ON DELETE SET NULL;
ALTER TABLE specialist_config_versions
  ADD COLUMN IF NOT EXISTS analyst_b_model_resource_id integer
    REFERENCES admin_resources(id) ON DELETE SET NULL;
ALTER TABLE specialist_config_versions
  ADD COLUMN IF NOT EXISTS synthesis_model_resource_id integer
    REFERENCES admin_resources(id) ON DELETE SET NULL;
ALTER TABLE specialist_config_versions
  ADD COLUMN IF NOT EXISTS fallback_model_resource_id integer
    REFERENCES admin_resources(id) ON DELETE SET NULL;
ALTER TABLE specialist_config_versions
  ADD COLUMN IF NOT EXISTS multi_model_enabled boolean;
ALTER TABLE specialist_config_versions
  ADD COLUMN IF NOT EXISTS workflow_overrides jsonb;
