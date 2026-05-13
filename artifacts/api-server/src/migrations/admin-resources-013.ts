/**
 * admin-resources-013 — Seed tiago-bracket-mix-specialist llm_slot.
 *
 * Phase B U3 of the ICP bracket-mix peer-derived rebuild plan
 * (docs/plans/2026-05-13-001-feat-icp-bracket-mix-peer-derived-phase-b-plan.md).
 *
 * Provisions the runtime-editable llm_slot row that backs Tiago's call to
 * `resolveLlmFor("tiago-bracket-mix-specialist")`. Admins can retarget Tiago
 * to any registered model via the Admin UI llm_slot editor without a code
 * deploy.
 *
 * Initial slug: claude-sonnet-4-5 — the current canonical analyst/specialist
 * tier in the repo (mirrors what admin-resources-010 standardized for
 * vision, executive-summary-*, icp-intelligence, and research-synthesis).
 *
 * Idempotent — ON CONFLICT (kind, slug) DO NOTHING.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] admin-resources-013";

const TIAGO_SLOT = "tiago-bracket-mix-specialist";
const TIAGO_MODEL_SLUG = "claude-sonnet-4-5";

export async function runAdminResources013(): Promise<void> {
  const result = await db.execute(sql`
    INSERT INTO admin_resources (kind, slug, display_name, description, config)
    VALUES (
      'llm_slot',
      ${TIAGO_SLOT},
      'Tiago — Bracket-Mix Specialist',
      'LLM slot for Tiago, the peer-derived bracket-mix Specialist. Tiago performs one grounded research pass per peer (or per Mgmt-Co comp set) and emits a brand-level archetype split with citations. Admins can retarget this slot to a different model via the Admin UI without redeploying.',
      ${JSON.stringify({ modelSlug: TIAGO_MODEL_SLUG })}::jsonb
    )
    ON CONFLICT (kind, slug) DO NOTHING
  `);

  const inserted = Number((result as { rowCount?: number }).rowCount ?? 0);
  if (inserted > 0) {
    logger.info(`${TAG} seeded ${TIAGO_SLOT} → ${TIAGO_MODEL_SLUG}`);
  } else {
    logger.info(`${TAG} ${TIAGO_SLOT} already exists — skipping`);
  }
}
