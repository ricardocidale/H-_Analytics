/**
 * users-google-drive-connected-001 — Add the `users.google_drive_connected`
 * column from Drizzle migration 0005_google_drive_tokens.sql.
 *
 * The legacy bootstrapDrizzleMigrationState() pre-marked migrations 0005–0027
 * as applied on the production Neon DB before they had run. Drizzle's
 * migrate() then silently skipped them. Audit (Task #919) found that 83/84
 * DDL artifacts from 0005–0027 were already present on production from
 * other ad-hoc schema work — the only genuine gap is this single boolean
 * column.
 *
 * This runtime migration follows the same belt-and-suspenders pattern
 * established in reference-brands-001.ts: idempotent IF NOT EXISTS so it is
 * a safe no-op on any DB where the column already exists (fresh DBs created
 * after the bootstrap fix, future re-bootstraps, etc.).
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "users-google-drive-connected-001";

export async function runUsersGoogleDriveConnected001(): Promise<void> {
  try {
    await db.execute(sql`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "google_drive_connected" boolean NOT NULL DEFAULT false
    `);
    logger.info(`[${TAG}] users.google_drive_connected column ensured`);
  } catch (error: unknown) {
    logger.error(`[${TAG}] Migration failed: ${String(error)}`, TAG);
    throw error;
  }
}
