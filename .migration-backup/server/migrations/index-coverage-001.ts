/**
 * Index coverage backfill (April 25, 2026).
 *
 * Codifies the index changes from the April 25 DB audit so fresh DBs and
 * future operators get them through the standard migration path (rather than
 * relying on ad-hoc `db:push` or manual psql).
 *
 * Three FK covering indexes that were declared in shared/schema/notifications.ts
 * but never built (db:push drift): event_type, status, created_at, alert_rule_id,
 * property_id on notification_logs.
 *
 * One genuinely-missing FK covering index: scenario_shares.granted_by (added to
 * shared/schema/scenarios.ts in the same change set).
 *
 * All idempotent — safe to re-run, safe on DBs that already had them built
 * via the manual SQL push that bridged the gap on the live Neon DB.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] index-coverage-001";

export async function runIndexCoverage001(): Promise<void> {
  await db.execute(sql`CREATE INDEX IF NOT EXISTS notification_logs_event_type_idx     ON notification_logs (event_type)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS notification_logs_status_idx         ON notification_logs (status)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS notification_logs_created_at_idx     ON notification_logs (created_at)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS notification_logs_alert_rule_id_idx  ON notification_logs (alert_rule_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS notification_logs_property_id_idx    ON notification_logs (property_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS scenario_shares_granted_by_idx       ON scenario_shares (granted_by)`);
  logger.info(`${TAG} notification_logs (5) + scenario_shares (1) FK covering indexes ready`);
}
