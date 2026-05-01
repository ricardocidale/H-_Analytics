import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "specialist-multi-model-001";

export async function runSpecialistMultiModel001(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE specialist_configs
        ADD COLUMN IF NOT EXISTS analyst_a_model_resource_id integer
          REFERENCES admin_resources(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS analyst_b_model_resource_id integer
          REFERENCES admin_resources(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS synthesis_model_resource_id integer
          REFERENCES admin_resources(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS fallback_model_resource_id integer
          REFERENCES admin_resources(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS multi_model_enabled boolean,
        ADD COLUMN IF NOT EXISTS workflow_overrides jsonb
    `);

    await db.execute(sql`
      ALTER TABLE specialist_config_versions
        ADD COLUMN IF NOT EXISTS analyst_a_model_resource_id integer
          REFERENCES admin_resources(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS analyst_b_model_resource_id integer
          REFERENCES admin_resources(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS synthesis_model_resource_id integer
          REFERENCES admin_resources(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS fallback_model_resource_id integer
          REFERENCES admin_resources(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS multi_model_enabled boolean,
        ADD COLUMN IF NOT EXISTS workflow_overrides jsonb
    `);

    logger.info(`[${TAG}] N+1 multi-model columns added (or already existed)`);
  } catch (error: unknown) {
    logger.error(`[${TAG}] Migration failed: ${String(error)}`, TAG);
    throw error;
  }
}
