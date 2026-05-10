/**
 * admin-resources-010 — Correct llm_slot targets written by migration 008.
 *
 * Migration 008 upgraded five opus llm_slots from claude-opus-4-6 to
 * claude-opus-4-7, but claude-opus-4-7 has since been retired (it is now
 * listed in DEPRECATED_MODEL_MAP → claude-sonnet-4-5). This caused a boot
 * loop: 008 kept writing the deprecated ID, and 009 had to patch it back out
 * of global_assumptions on every restart.
 *
 * This migration corrects the admin_resources llm_slots directly so that
 * subsequent boots of 008 and 009 both become true no-ops:
 *   - 008 finds no rows still on claude-opus-4-6  → no-op
 *   - 009 finds no claude-opus-4-7 in global_assumptions → no-op
 *   - 010 finds no rows still on claude-opus-4-7   → no-op
 *
 * Slots corrected (claude-opus-4-7 → claude-sonnet-4-5):
 *   vision
 *   executive-summary-property
 *   executive-summary-portfolio
 *   icp-intelligence
 *   research-synthesis
 *
 * Idempotent — only updates rows whose modelSlug is still claude-opus-4-7.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] admin-resources-010";

const DEPRECATED = "claude-opus-4-7";
const REPLACEMENT = "claude-sonnet-4-5";

const opusSlots = [
  "vision",
  "executive-summary-property",
  "executive-summary-portfolio",
  "icp-intelligence",
  "research-synthesis",
];

export async function runAdminResources010(): Promise<void> {
  let updated = 0;

  for (const slug of opusSlots) {
    const result = await db.execute(sql`
      UPDATE admin_resources
      SET config = jsonb_set(config, '{modelSlug}', ${JSON.stringify(REPLACEMENT)}::jsonb)
      WHERE kind = 'llm_slot' AND slug = ${slug}
        AND config->>'modelSlug' = ${DEPRECATED}
    `);
    const rows = Number((result as { rowCount?: number }).rowCount ?? 0);
    if (rows > 0) {
      logger.info(`${TAG} ${slug}: ${DEPRECATED} → ${REPLACEMENT}`);
      updated += rows;
    }
  }

  if (updated === 0) {
    logger.info(`${TAG} no stale ${DEPRECATED} slots found — skipping`);
  } else {
    logger.info(`${TAG} completed — ${updated} slot(s) corrected`);
  }
}
