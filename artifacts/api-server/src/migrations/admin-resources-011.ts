/**
 * admin-resources-011 — Seed factory-v2-lorenzo-vision llm_slot.
 *
 * Provisions the runtime-editable llm_slot row that backs
 * resolveLorenzoVisionModelId() in factory-v2-llm-resolver.ts.
 *
 * The Lorenzo / Lucca pipeline previously read a hardcoded model string literal
 * (CLAUDE.md §1 violation). This migration is the DB half of the refactor:
 * the slot row is seeded here so the resolver has a
 * target on first boot, and admins can retarget it via the Admin UI
 * llm_slot editor without a code deploy.
 *
 * Model slug: claude-opus-4-7 — preserves the existing literal value.
 * The admin-resources-010 downgrade only affected five named slots
 * (vision, executive-summary-*, icp-intelligence, research-synthesis);
 * Lorenzo bypassed llm_slot entirely and was never in that migration's scope.
 *
 * Idempotent — ON CONFLICT (kind, slug) DO NOTHING.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] admin-resources-011";

const LORENZO_VISION_SLOT = "factory-v2-lorenzo-vision";
const LORENZO_VISION_SLUG = "claude-opus-4-7";

export async function runAdminResources011(): Promise<void> {
  const result = await db.execute(sql`
    INSERT INTO admin_resources (kind, slug, display_name, description, config)
    VALUES (
      'llm_slot',
      ${LORENZO_VISION_SLOT},
      'Factory v2 — Lorenzo Vision',
      'LLM slot for the Lorenzo / Lucca vision pipeline (slide inspectors, best-shot drafter). Targets the Opus-tier model for image analysis and verdict quality.',
      ${JSON.stringify({ modelSlug: LORENZO_VISION_SLUG })}::jsonb
    )
    ON CONFLICT (kind, slug) DO NOTHING
  `);

  const inserted = Number((result as { rowCount?: number }).rowCount ?? 0);
  if (inserted > 0) {
    logger.info(`${TAG} seeded ${LORENZO_VISION_SLOT} → ${LORENZO_VISION_SLUG}`);
  } else {
    logger.info(`${TAG} ${LORENZO_VISION_SLOT} already exists — skipping`);
  }
}
