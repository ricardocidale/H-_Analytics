import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

export async function runScenarioServiceTemplates001(): Promise<void> {
  const TAG = "scenario-service-templates-001";
  const check = await db.execute(sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scenarios' AND column_name = 'service_templates'
  `);
  if ((check as { rows: Array<Record<string, unknown>> }).rows.length > 0) {
    logger.info(`[${TAG}] Column already exists, skipping`);
    return;
  }

  await db.execute(sql`
    ALTER TABLE scenarios ADD COLUMN service_templates JSONB
  `);
  logger.info(`[${TAG}] Added service_templates JSONB column to scenarios table`);
}
