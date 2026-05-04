-- 0034_fk_indexes.sql
--
-- Task #971 — add btree indexes on foreign-key columns that were missing
-- supporting indexes in the Drizzle schema.
--
-- Missing FK indexes cause sequential scans on join lookups and force full
-- child-table scans on every ON DELETE CASCADE / SET NULL from the parent.
-- The 13 columns below were audited from lib/db/src/schema/ against the
-- migration history and confirmed absent from any prior migration.
--
-- Note: CONCURRENTLY is intentionally not used — Drizzle migrate() wraps
-- every statement in a transaction, and CREATE INDEX CONCURRENTLY cannot
-- run inside a transaction block. IF NOT EXISTS makes each statement safe
-- to re-run if the migration is ever re-applied.

--> statement-breakpoint
-- admin_resources: audit trail back to the users who created / last updated each resource.
CREATE INDEX IF NOT EXISTS admin_resources_created_by_user_idx
  ON admin_resources (created_by_user_id);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS admin_resources_updated_by_user_idx
  ON admin_resources (updated_by_user_id);

--> statement-breakpoint
-- audit_break_glass_overrides: cascade support from admin_resources and users.
CREATE INDEX IF NOT EXISTS break_glass_override_resource_idx
  ON audit_break_glass_overrides (override_resource_id);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS break_glass_created_by_user_idx
  ON audit_break_glass_overrides (created_by_user_id);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS break_glass_revoked_by_user_idx
  ON audit_break_glass_overrides (revoked_by_user_id);

--> statement-breakpoint
-- resource_health_checks: cascade support from users (scheduler-triggered vs user-triggered).
CREATE INDEX IF NOT EXISTS resource_health_checks_triggered_by_user_idx
  ON resource_health_checks (triggered_by_user_id);

--> statement-breakpoint
-- global_assumptions: cascade support from logos (ON DELETE SET NULL).
CREATE INDEX IF NOT EXISTS global_assumptions_company_logo_id_idx
  ON global_assumptions (company_logo_id);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS global_assumptions_asset_logo_id_idx
  ON global_assumptions (asset_logo_id);

--> statement-breakpoint
-- business_brands: cascade support from logos (ON DELETE SET NULL).
CREATE INDEX IF NOT EXISTS business_brands_logo_id_idx
  ON business_brands (logo_id);

--> statement-breakpoint
-- rebecca_context_contract_turns: cascade support from rebecca_messages and users.
CREATE INDEX IF NOT EXISTS rebecca_ctx_contract_message_idx
  ON rebecca_context_contract_turns (message_id);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS rebecca_ctx_contract_user_idx
  ON rebecca_context_contract_turns (user_id);

--> statement-breakpoint
-- assumption_change_log: cascade support from scenarios, users, and research_runs.
CREATE INDEX IF NOT EXISTS assumption_change_log_scenario_idx
  ON assumption_change_log (scenario_id);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS assumption_change_log_user_idx
  ON assumption_change_log (user_id);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS assumption_change_log_research_run_idx
  ON assumption_change_log (research_run_id);

--> statement-breakpoint
-- integration_key_rotations: cascade support from users (ON DELETE SET NULL).
CREATE INDEX IF NOT EXISTS integration_key_rotations_rotated_by_idx
  ON integration_key_rotations (rotated_by);
