/**
 * icp-brackets-003 — Layer-2 default-value overlay columns
 *
 * Plan 2026-05-13-001 (feat seed-calibration-bracket-defaults-and-irr-views) U5.
 *
 * Belt-and-suspenders runtime migration that runs after the Drizzle SQL
 * migration 0063_icp_brackets_default_overlay.sql. Idempotent.
 *
 * Adds two NULL-able real columns to icp_brackets so each bracket can carry an
 * optional Layer-2 overlay value for the layered defaults resolver:
 *   default_exit_cap_rate              (overlays mc.tax_exit.exitCapRate)
 *   default_refi_max_ltv_to_original   (overlays mc.funding.refiMaxLtvToOriginal)
 *
 * NULL = "this bracket carries no opinion on this field; fall through to the
 * universal Layer-1 model_defaults row." Populated values participate in the
 * weight-blended overlay applied at entity creation by POST /api/properties
 * (the layered resolver — see plan U6).
 *
 * Why a runtime guard in addition to the SQL migration? Mirrors the
 * icp-brackets-001 / icp-brackets-002 pattern: dev DBs whose _journal.json
 * has drifted past 0063 still need these columns. ADD COLUMN IF NOT EXISTS
 * is a no-op on already-migrated DBs.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] icp-brackets-003";

export async function runIcpBrackets003(): Promise<void> {
  logger.info(`${TAG} Adding Layer-2 default-overlay columns to icp_brackets (idempotent)`);

  // Both ALTERs are independently idempotent — no transaction needed. Running
  // them serially keeps the log output ordered and any unexpected error
  // surfaces with the column name attached.
  await db.execute(sql`
    ALTER TABLE "icp_brackets"
    ADD COLUMN IF NOT EXISTS "default_exit_cap_rate" real
  `);

  await db.execute(sql`
    ALTER TABLE "icp_brackets"
    ADD COLUMN IF NOT EXISTS "default_refi_max_ltv_to_original" real
  `);

  logger.info(`${TAG} Layer-2 overlay columns ensured on icp_brackets`);
}
