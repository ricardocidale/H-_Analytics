import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "fk-indexes-002";

/**
 * Adds the 13 missing FK indexes flagged by the 2026-05 DB audit.
 *
 * All targeted FKs reference admin_resources or users with ON DELETE SET NULL.
 * Without these indexes every cascade does a sequential scan on the child
 * table. Currently safe because most child tables are tiny/empty, but a
 * latent footgun the moment they grow.
 *
 * Tables touched (all small): pipeline_policies, specialist_configs,
 * specialist_config_versions, property_dd_items.
 *
 * Safe to run multiple times — uses IF NOT EXISTS.
 */
export async function runFkIndexes002(): Promise<void> {
  const indexes = [
    `CREATE INDEX IF NOT EXISTS pipeline_policies_analyst_a_model_idx ON pipeline_policies (analyst_a_model_resource_id)`,
    `CREATE INDEX IF NOT EXISTS pipeline_policies_analyst_b_model_idx ON pipeline_policies (analyst_b_model_resource_id)`,
    `CREATE INDEX IF NOT EXISTS pipeline_policies_synthesis_model_idx ON pipeline_policies (synthesis_model_resource_id)`,
    `CREATE INDEX IF NOT EXISTS pipeline_policies_fallback_model_idx ON pipeline_policies (fallback_model_resource_id)`,
    `CREATE INDEX IF NOT EXISTS specialist_configs_analyst_a_model_idx ON specialist_configs (analyst_a_model_resource_id)`,
    `CREATE INDEX IF NOT EXISTS specialist_configs_analyst_b_model_idx ON specialist_configs (analyst_b_model_resource_id)`,
    `CREATE INDEX IF NOT EXISTS specialist_configs_synthesis_model_idx ON specialist_configs (synthesis_model_resource_id)`,
    `CREATE INDEX IF NOT EXISTS specialist_configs_fallback_model_idx ON specialist_configs (fallback_model_resource_id)`,
    `CREATE INDEX IF NOT EXISTS specialist_config_versions_analyst_a_model_idx ON specialist_config_versions (analyst_a_model_resource_id)`,
    `CREATE INDEX IF NOT EXISTS specialist_config_versions_analyst_b_model_idx ON specialist_config_versions (analyst_b_model_resource_id)`,
    `CREATE INDEX IF NOT EXISTS specialist_config_versions_synthesis_model_idx ON specialist_config_versions (synthesis_model_resource_id)`,
    `CREATE INDEX IF NOT EXISTS specialist_config_versions_fallback_model_idx ON specialist_config_versions (fallback_model_resource_id)`,
    `CREATE INDEX IF NOT EXISTS property_dd_items_owner_user_id_idx ON property_dd_items (owner_user_id)`,
  ];

  for (const ddl of indexes) {
    try {
      await db.execute(sql.raw(ddl));
    } catch (error: unknown) {
      const pgCode = (error as { code?: string })?.code;
      if (pgCode === "42703" || pgCode === "42P01") {
        logger.error(
          `[${TAG}] Required table/column missing for: ${ddl.slice(0, 80)}… — schema may be out of sync`,
          TAG,
        );
        throw error;
      }
      logger.error(`[${TAG}] Migration failed: ${String(error)}`, TAG);
      throw error;
    }
  }
  logger.info(`[${TAG}] FK indexes migration complete (${indexes.length} indexes)`);
}
