import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] calc-audit-001";

export async function runCalcAudit001(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS calculation_audit_logs (
      id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      scenario_id integer NOT NULL,
      property_id integer NOT NULL,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      computed_at timestamp DEFAULT now() NOT NULL,
      engine_version text NOT NULL,
      input_hash text NOT NULL,
      output_hash text NOT NULL,
      audit_opinion text NOT NULL,
      duration_ms real NOT NULL,
      total_steps integer NOT NULL DEFAULT 0,
      log_entries jsonb NOT NULL
    )
  `);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS calc_audit_scenario_idx ON calculation_audit_logs (scenario_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS calc_audit_property_idx ON calculation_audit_logs (property_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS calc_audit_user_idx ON calculation_audit_logs (user_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS calc_audit_computed_at_idx ON calculation_audit_logs (computed_at)`);

  logger.info(`${TAG} calculation_audit_logs table ready`);
}
