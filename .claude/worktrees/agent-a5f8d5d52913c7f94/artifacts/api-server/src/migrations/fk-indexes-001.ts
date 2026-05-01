import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "fk-indexes-001";

/**
 * Adds indexes on foreign key columns used in cascade deletes and joins.
 * Safe to run multiple times — uses IF NOT EXISTS.
 *
 * This migration must be called AFTER drizzle push (table creation) to ensure
 * all referenced tables and columns exist. It is invoked from server/index.ts
 * in the post-push sequential phase.
 */
export async function runFkIndexes001(): Promise<void> {
  const indexes = [
    `CREATE INDEX IF NOT EXISTS alert_rules_property_id_idx ON alert_rules (property_id)`,
    `CREATE INDEX IF NOT EXISTS notification_logs_alert_rule_id_idx ON notification_logs (alert_rule_id)`,
    `CREATE INDEX IF NOT EXISTS notification_logs_property_id_idx ON notification_logs (property_id)`,
  ];

  for (const ddl of indexes) {
    try {
      await db.execute(sql.raw(ddl));
    } catch (error: unknown) {
      const pgCode = (error as { code?: string })?.code;
      if (pgCode === "42703" || pgCode === "42P01") {
        logger.error(`[${TAG}] Required table/column missing for: ${ddl.slice(0, 60)}… — schema may be out of sync`, TAG);
        throw error;
      }
      logger.error(`[${TAG}] Migration failed: ${String(error)}`, TAG);
      throw error;
    }
  }
  logger.info(`[${TAG}] FK indexes migration complete`);
}
