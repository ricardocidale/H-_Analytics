/**
 * slide-factory-runs-slot-content-hashes-001 — ADD COLUMN slot_content_hashes
 *
 * Belt-and-suspenders companion to 0047_enzo_slot_content_hashes.sql.
 * Drizzle migration tracking drift left this column absent on some environments.
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS is a no-op on already-migrated DBs.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] slide-factory-runs-slot-content-hashes-001";

export async function runSlideFactoryRunsSlotContentHashes001(): Promise<void> {
  logger.info(`${TAG} Adding slot_content_hashes column to slide_factory_runs (idempotent)`);

  await db.execute(sql`
    ALTER TABLE "slide_factory_runs"
    ADD COLUMN IF NOT EXISTS "slot_content_hashes" jsonb
  `);

  logger.info(`${TAG} slot_content_hashes column ensured on slide_factory_runs`);
}
