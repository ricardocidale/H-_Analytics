/**
 * properties-refi-ltv-cap-001 — ADD COLUMN refi_max_ltv_to_original
 *
 * Belt-and-suspenders companion to 0064_properties_refi_ltv_cap.sql.
 *
 * Caps the refi loan at (refi_max_ltv_to_original × purchase_price). NULL =
 * uncapped (legacy behaviour for all pre-existing rows). Prevents equity
 * stripping on Full Equity properties where high in-place NOI could otherwise
 * justify a refi loan that exceeds the original cost basis.
 *
 * Idempotent: ADD COLUMN IF NOT EXISTS is a no-op on already-migrated DBs.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] properties-refi-ltv-cap-001";

export async function runPropertiesRefiLtvCap001(): Promise<void> {
  logger.info(`${TAG} Adding refi_max_ltv_to_original column to properties (idempotent)`);

  await db.execute(sql`
    ALTER TABLE "properties"
    ADD COLUMN IF NOT EXISTS "refi_max_ltv_to_original" real
  `);

  logger.info(`${TAG} refi_max_ltv_to_original column ensured on properties`);
}
