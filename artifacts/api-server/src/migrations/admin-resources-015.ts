/**
 * admin-resources-015 — Seed Valentina LLM slot + feature flag.
 *
 * Provisions:
 *   1. llm_slot row for Valentina (Model Defaults Research specialist).
 *      Uses Claude Sonnet for structured benchmark research (Opus is reserved
 *      for financial engine work per CLAUDE.md §12).
 *   2. parameter row as a feature flag: valentina-enabled ships at 0 (dark).
 *      Admin flips config.value to 1 to enable.
 *
 * Idempotent — ON CONFLICT (kind, slug) DO NOTHING.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";
import { VALENTINA_LLM_SLOT, VALENTINA_ENABLED_PARAM } from "../ai/valentina-model-defaults";

const TAG = "[migration] admin-resources-015";
const VALENTINA_DEFAULT_MODEL_SLUG = "claude-sonnet-4-6";

export async function runAdminResources015(): Promise<void> {
  // LLM slot — points to claude-sonnet-4-6; admin can retarget via LLM Config UI.
  const slotResult = await db.execute(sql`
    INSERT INTO admin_resources (kind, slug, display_name, description, config)
    VALUES (
      'llm_slot',
      ${VALENTINA_LLM_SLOT},
      'Valentina — Model Defaults Research',
      'LLM slot for Valentina, the specialist that researches current industry benchmarks for model_defaults rows where lastSetSource=''seed'' and writes structured proposals for admin review. Uses Claude Sonnet for cost-efficient structured benchmark research.',
      ${JSON.stringify({ modelSlug: VALENTINA_DEFAULT_MODEL_SLUG })}::jsonb
    )
    ON CONFLICT (kind, slug) DO NOTHING
  `);
  const slotInserted = Number((slotResult as { rowCount?: number }).rowCount ?? 0);
  if (slotInserted > 0) {
    logger.info(`${TAG} seeded llm_slot ${VALENTINA_LLM_SLOT} → ${VALENTINA_DEFAULT_MODEL_SLUG}`);
  } else {
    logger.info(`${TAG} llm_slot ${VALENTINA_LLM_SLOT} already exists — skipping`);
  }

  // Feature flag — ships dark (value: 0); admin enables via admin_resources editor.
  const flagResult = await db.execute(sql`
    INSERT INTO admin_resources (kind, slug, display_name, description, config)
    VALUES (
      'parameter',
      ${VALENTINA_ENABLED_PARAM},
      'Valentina — Enabled',
      'Feature flag for Valentina model-defaults research specialist. Set config.value to 1 to enable the POST /api/admin/model-defaults/research route and the Rebecca trigger_model_defaults_research tool.',
      ${JSON.stringify({ value: 0 })}::jsonb
    )
    ON CONFLICT (kind, slug) DO NOTHING
  `);
  const flagInserted = Number((flagResult as { rowCount?: number }).rowCount ?? 0);
  if (flagInserted > 0) {
    logger.info(`${TAG} seeded parameter ${VALENTINA_ENABLED_PARAM} = 0 (ships dark)`);
  } else {
    logger.info(`${TAG} parameter ${VALENTINA_ENABLED_PARAM} already exists — skipping`);
  }
}
