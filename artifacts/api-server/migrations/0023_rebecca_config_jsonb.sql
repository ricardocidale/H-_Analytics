-- Task #499 — Rebecca deep admin configuration.
-- Adds a single nullable jsonb column that holds persona/voice/behavior/llm/source
-- settings. Existing rows are unaffected; defaults are merged at read-time by
-- mergeRebeccaSettings() in shared/rebecca-settings.ts so rows with NULL
-- continue to use the prior baseline behavior.
ALTER TABLE global_assumptions
  ADD COLUMN IF NOT EXISTS rebecca_config jsonb;
