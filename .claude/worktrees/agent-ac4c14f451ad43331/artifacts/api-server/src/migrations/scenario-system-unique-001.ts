import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "scenario-system-unique-001";

export async function runScenarioSystemUnique001(): Promise<void> {
  const indexExists = await db.execute(sql`
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'scenarios_user_kind_unique'
  `);
  if (indexExists.rows.length > 0) {
    logger.info(`[${TAG}] Partial unique index already exists, skipping`);
    return;
  }

  await db.execute(sql`
    CREATE UNIQUE INDEX "scenarios_user_kind_unique"
    ON "scenarios" ("user_id", "kind")
    WHERE "kind" IN ('default', 'autosave') AND "deleted_at" IS NULL
  `);
  logger.info(`[${TAG}] Created partial unique index on (user_id, kind) for system scenarios`);
}
