/**
 * admin-resources-014 — Seed Bianca verification llm_slot.
 *
 * Provisions the runtime-editable llm_slot row that backs
 * Bianca (visual quality verification agent). Uses Claude Haiku
 * for cost-efficient batch image analysis. Admins can retarget
 * to a stronger model via the Admin UI llm_slot editor.
 *
 * Model: claude-haiku-4-5 — vision-capable, fast, low per-image cost.
 * Idempotent — ON CONFLICT (kind, slug) DO NOTHING.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";
import { BIANCA_VERIFICATION_LLM_SLOT } from "../slides/factory-v2-constants";

const TAG = "[migration] admin-resources-014";
const BIANCA_MODEL_SLUG = "claude-haiku-4-5";

export async function runAdminResources014(): Promise<void> {
  const result = await db.execute(sql`
    INSERT INTO admin_resources (kind, slug, display_name, description, config)
    VALUES (
      'llm_slot',
      ${BIANCA_VERIFICATION_LLM_SLOT},
      'Bianca — Visual Verification',
      'LLM slot for Bianca (T2-4 visual quality verification agent). Checks rendered deck slides against a visual rubric (cut-off text, placeholders, readability, layout consistency). Defaults to Claude Haiku for cost-efficient batch image analysis.',
      ${JSON.stringify({ modelSlug: BIANCA_MODEL_SLUG })}::jsonb
    )
    ON CONFLICT (kind, slug) DO NOTHING
  `);

  const inserted = Number((result as { rowCount?: number }).rowCount ?? 0);
  if (inserted > 0) {
    logger.info(`${TAG} seeded ${BIANCA_VERIFICATION_LLM_SLOT} → ${BIANCA_MODEL_SLUG}`);
  } else {
    logger.info(`${TAG} ${BIANCA_VERIFICATION_LLM_SLOT} already exists — skipping`);
  }
}
