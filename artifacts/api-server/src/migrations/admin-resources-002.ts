/**
 * P3 — Resource health checks bootstrap.
 *
 * Adds the append-only `resource_health_checks` table that backs the health
 * dot + Test button in the Resources UI. Non-destructive (CREATE IF NOT
 * EXISTS); safe to run repeatedly and on existing prod DBs.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] admin-resources-002";

export async function runAdminResources002(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS resource_health_checks (
      id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      resource_id integer NOT NULL REFERENCES admin_resources(id) ON DELETE CASCADE,
      kind text NOT NULL,
      status text NOT NULL,
      latency_ms integer,
      error_code text,
      error_message text,
      triggered_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
      checked_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS resource_health_checks_resource_idx ON resource_health_checks (resource_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS resource_health_checks_resource_time_idx ON resource_health_checks (resource_id, checked_at)`);

  logger.info(`${TAG} resource_health_checks table ready`);
}
