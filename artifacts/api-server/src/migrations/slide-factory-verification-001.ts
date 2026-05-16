/**
 * slide-factory-verification-001 — Add Bianca verification columns to slide_factory_runs.
 *
 * Adds:
 *   - verification_status text (nullable)
 *   - verification_log    jsonb (nullable)
 *
 * Idempotent — ADD COLUMN IF NOT EXISTS guards each ALTER.
 * Mirrors migration 0073_slide_factory_verification.sql.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] slide-factory-verification-001";

export async function runSlideFactoryVerification001(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE slide_factory_runs
    ADD COLUMN IF NOT EXISTS verification_status text
  `);

  await db.execute(sql`
    ALTER TABLE slide_factory_runs
    ADD COLUMN IF NOT EXISTS verification_log jsonb
  `);

  logger.info(`${TAG} verification columns ensured on slide_factory_runs`);
}
