import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "pipeline-n1-global-models-001";

export async function runPipelineN1GlobalModels001(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE pipeline_policies
        ADD COLUMN IF NOT EXISTS analyst_a_model_resource_id integer
          REFERENCES admin_resources(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS analyst_b_model_resource_id integer
          REFERENCES admin_resources(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS synthesis_model_resource_id integer
          REFERENCES admin_resources(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS fallback_model_resource_id integer
          REFERENCES admin_resources(id) ON DELETE SET NULL
    `);
    logger.info(`[${TAG}] N+1 global model resource ID columns added (or already existed)`);
  } catch (error: unknown) {
    logger.error(`[${TAG}] Migration failed: ${String(error)}`, TAG);
    throw error;
  }
}
