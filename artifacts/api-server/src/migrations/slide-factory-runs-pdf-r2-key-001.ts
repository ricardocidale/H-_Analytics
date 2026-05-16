/**
 * slide-factory-runs-pdf-r2-key-001 — ADD COLUMN pdf_r2_key
 *
 * Belt-and-suspenders companion to 0069_slide_factory_runs_pdf_r2_key.sql.
 * The original 0062 slot collided with 0068 in the api-server migrations
 * folder, so the Drizzle journal entry was never applied. This guard
 * ensures the column exists on every environment.
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS is a no-op on already-migrated DBs.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] slide-factory-runs-pdf-r2-key-001";

export async function runSlideFactoryRunsPdfR2Key001(): Promise<void> {
  logger.info(`${TAG} Adding pdf_r2_key column to slide_factory_runs (idempotent)`);

  await db.execute(sql`
    ALTER TABLE "slide_factory_runs"
    ADD COLUMN IF NOT EXISTS "pdf_r2_key" text
  `);

  logger.info(`${TAG} pdf_r2_key column ensured on slide_factory_runs`);
}
