import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "scenario-access-001";

export async function runScenarioAccess001(): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS scenario_access (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      scenario_id integer REFERENCES scenarios(id) ON DELETE CASCADE,
      owner_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      grantee_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      grant_type text NOT NULL,
      created_at timestamp DEFAULT now() NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS scenario_access_owner_id_idx ON scenario_access (owner_id)`,
    `CREATE INDEX IF NOT EXISTS scenario_access_grantee_id_idx ON scenario_access (grantee_id)`,
    `CREATE INDEX IF NOT EXISTS scenario_access_scenario_id_idx ON scenario_access (scenario_id)`,
    `DO $$ BEGIN
       ALTER TABLE scenario_access ADD CONSTRAINT scenario_access_unique_grant
         UNIQUE (scenario_id, owner_id, grantee_id, grant_type);
     EXCEPTION WHEN duplicate_table THEN NULL;
               WHEN duplicate_object THEN NULL;
     END $$`,
  ];

  for (const stmt of statements) {
    try {
      await db.execute(sql.raw(stmt));
    } catch (err: any) {
      logger.warn(`[${TAG}] Statement skipped: ${err.message}`, TAG);
    }
  }

  logger.info(`[${TAG}] Migration complete`, TAG);
}
