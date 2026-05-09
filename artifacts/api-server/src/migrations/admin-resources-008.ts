/**
 * admin-resources-008 — Upgrade stale llm_slot model references.
 *
 * Seven llm_slots were seeded in admin-resources-005 pointing to
 * claude-opus-4-6 and claude-sonnet-4-5. The 4-7 Opus and 4-6 Sonnet
 * models are now registered and used by the specialist slots; these
 * general-purpose slots should match.
 *
 * Upgrades:
 *   vision                    claude-opus-4-6  → claude-opus-4-7
 *   executive-summary-property claude-opus-4-6  → claude-opus-4-7
 *   executive-summary-portfolio claude-opus-4-6 → claude-opus-4-7
 *   icp-intelligence          claude-opus-4-6  → claude-opus-4-7
 *   research-synthesis         claude-opus-4-6  → claude-opus-4-7
 *   risk-brief                 claude-sonnet-4-5 → claude-sonnet-4-6
 *   research-analyst-b         claude-sonnet-4-5 → claude-sonnet-4-6
 *
 * Idempotent — uses jsonb_set; re-running writes the same value.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] admin-resources-008";

export async function runAdminResources008(): Promise<void> {
  const opusSlots = [
    "vision",
    "executive-summary-property",
    "executive-summary-portfolio",
    "icp-intelligence",
    "research-synthesis",
  ];

  const sonnetSlots = [
    "risk-brief",
    "research-analyst-b",
  ];

  for (const slug of opusSlots) {
    await db.execute(sql`
      UPDATE admin_resources
      SET config = jsonb_set(config, '{modelSlug}', '"claude-opus-4-7"')
      WHERE kind = 'llm_slot' AND slug = ${slug}
        AND config->>'modelSlug' = 'claude-opus-4-6'
    `);
    logger.info(`${TAG} ${slug}: upgraded to claude-opus-4-7`);
  }

  for (const slug of sonnetSlots) {
    await db.execute(sql`
      UPDATE admin_resources
      SET config = jsonb_set(config, '{modelSlug}', '"claude-sonnet-4-6"')
      WHERE kind = 'llm_slot' AND slug = ${slug}
        AND config->>'modelSlug' = 'claude-sonnet-4-5'
    `);
    logger.info(`${TAG} ${slug}: upgraded to claude-sonnet-4-6`);
  }

  logger.info(`${TAG} completed — ${opusSlots.length + sonnetSlots.length} slots updated`);
}
