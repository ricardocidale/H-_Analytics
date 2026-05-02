import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "fk-indexes-003";

/**
 * Task #971 — Adds the 13 missing FK indexes flagged by the 2026-05 schema
 * audit. Each statement uses `CREATE INDEX CONCURRENTLY IF NOT EXISTS` so
 * the migration is safe to run against a populated production database
 * without taking a write lock on the parent table.
 *
 * `CONCURRENTLY` cannot run inside a transaction, so this runs as a runtime
 * patch (each db.execute() is its own implicit transaction) instead of as
 * part of a numbered Drizzle SQL migration (the migrator wraps each file
 * in a single transaction).
 *
 * Index → FK column → parent (all ON DELETE SET NULL except where noted):
 *   admin_resources.created_by_user_id              → users
 *   admin_resources.updated_by_user_id              → users
 *   audit_break_glass_overrides.override_resource_id→ admin_resources
 *   audit_break_glass_overrides.created_by_user_id  → users
 *   audit_break_glass_overrides.revoked_by_user_id  → users
 *   resource_health_checks.triggered_by_user_id     → users
 *   global_assumptions.company_logo_id              → logos
 *   global_assumptions.asset_logo_id                → logos
 *   business_brands.logo_id                         → logos
 *   rebecca_context_contract_turns.message_id       → rebecca_messages
 *   rebecca_context_contract_turns.user_id          → users
 *   assumption_change_log.scenario_id               → scenarios
 *   assumption_change_log.user_id                   → users
 *   assumption_change_log.research_run_id           → research_runs
 *   integration_key_rotations.rotated_by            → users
 *
 * Idempotent — safe to run multiple times.
 */
export async function runFkIndexes003(): Promise<{ allApplied: boolean }> {
  const indexes: Array<{ table: string; ddl: string }> = [
    { table: "admin_resources", ddl: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "admin_resources_created_by_user_idx" ON "admin_resources" USING btree ("created_by_user_id")` },
    { table: "admin_resources", ddl: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "admin_resources_updated_by_user_idx" ON "admin_resources" USING btree ("updated_by_user_id")` },
    { table: "audit_break_glass_overrides", ddl: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "break_glass_override_resource_idx" ON "audit_break_glass_overrides" USING btree ("override_resource_id")` },
    { table: "audit_break_glass_overrides", ddl: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "break_glass_created_by_user_idx" ON "audit_break_glass_overrides" USING btree ("created_by_user_id")` },
    { table: "audit_break_glass_overrides", ddl: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "break_glass_revoked_by_user_idx" ON "audit_break_glass_overrides" USING btree ("revoked_by_user_id")` },
    { table: "resource_health_checks", ddl: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "resource_health_checks_triggered_by_user_idx" ON "resource_health_checks" USING btree ("triggered_by_user_id")` },
    { table: "global_assumptions", ddl: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "global_assumptions_company_logo_id_idx" ON "global_assumptions" USING btree ("company_logo_id")` },
    { table: "global_assumptions", ddl: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "global_assumptions_asset_logo_id_idx" ON "global_assumptions" USING btree ("asset_logo_id")` },
    { table: "business_brands", ddl: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "business_brands_logo_id_idx" ON "business_brands" USING btree ("logo_id")` },
    { table: "rebecca_context_contract_turns", ddl: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "rebecca_ctx_contract_message_idx" ON "rebecca_context_contract_turns" USING btree ("message_id")` },
    { table: "rebecca_context_contract_turns", ddl: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "rebecca_ctx_contract_user_idx" ON "rebecca_context_contract_turns" USING btree ("user_id")` },
    { table: "assumption_change_log", ddl: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "assumption_change_log_scenario_idx" ON "assumption_change_log" USING btree ("scenario_id")` },
    { table: "assumption_change_log", ddl: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "assumption_change_log_user_idx" ON "assumption_change_log" USING btree ("user_id")` },
    { table: "assumption_change_log", ddl: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "assumption_change_log_research_run_idx" ON "assumption_change_log" USING btree ("research_run_id")` },
    { table: "integration_key_rotations", ddl: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "integration_key_rotations_rotated_by_idx" ON "integration_key_rotations" USING btree ("rotated_by")` },
  ];

  let created = 0;
  let skippedMissingTable = 0;
  for (const { table, ddl } of indexes) {
    // rebecca_context_contract_turns is created by rebecca-context-contract-001
    // which may not have run yet on a freshly-bootstrapped DB. Skip silently
    // — that runtime patch creates these FK indexes itself when it runs.
    const exists = await db.execute(
      sql`SELECT to_regclass(${"public." + table}) AS oid`,
    );
    const oid = (exists as unknown as { rows: Array<{ oid: string | null }> }).rows[0]?.oid;
    if (!oid) {
      skippedMissingTable += 1;
      continue;
    }
    try {
      await db.execute(sql.raw(ddl));
      created += 1;
    } catch (error: unknown) {
      const pgCode = (error as { code?: string })?.code;
      // 42P07 = duplicate_object — index already exists (race with IF NOT EXISTS
      // is not atomic under CONCURRENTLY in older PG versions). Treat as success.
      if (pgCode === "42P07") {
        created += 1;
        continue;
      }
      logger.error(`[${TAG}] Failed: ${ddl.slice(0, 100)}… — ${String(error)}`, TAG);
      throw error;
    }
  }

  logger.info(
    `[${TAG}] FK indexes applied (${created} created/present, ${skippedMissingTable} skipped: table not yet created)`,
  );

  // Only report fully-applied if every index was actually created. If a
  // target table was missing (currently only rebecca_context_contract_turns
  // when its runtime patch has not yet provisioned the table), leave the
  // migration unmarked so a later boot retries — this avoids permanently
  // masking schema drift.
  return { allApplied: skippedMissingTable === 0 };
}
