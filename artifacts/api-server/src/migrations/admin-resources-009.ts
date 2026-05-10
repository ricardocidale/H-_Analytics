/**
 * admin-resources-009 — Patch stale claude-opus-4-7 references in global_assumptions.
 *
 * Migration 008 correctly upgraded the llm_slots in admin_resources to
 * claude-opus-4-7, but at some point the global_assumptions.research_config
 * JSONB column accumulated claude-opus-4-7 model IDs under both per-domain
 * keys and the nested tabDefaults structure. When claude-opus-4-7 was retired
 * by Anthropic the research pipeline started surfacing "model does not exist"
 * errors.
 *
 * This migration idempotently replaces every occurrence of "claude-opus-4-7"
 * with "claude-sonnet-4-5" in the research_config JSON text for all
 * global_assumptions rows, and normalises the llmVendor to "anthropic"
 * wherever it was incorrectly set to "google" alongside a claude model.
 *
 * Idempotent — only runs the UPDATE when the old string is present;
 * subsequent boots are a no-op.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] admin-resources-009";

export async function runAdminResources009(): Promise<void> {
  const result = await db.execute(sql`
    UPDATE global_assumptions
    SET research_config = replace(
          replace(
            research_config::text,
            'claude-opus-4-7',
            'claude-sonnet-4-5'
          ),
          '"llmVendor":"google"',
          '"llmVendor":"anthropic"'
        )::jsonb
    WHERE research_config::text LIKE '%claude-opus-4-7%'
  `);

  const rowCount = Number((result as { rowCount?: number }).rowCount ?? 0);
  if (rowCount > 0) {
    logger.info(`${TAG} patched ${rowCount} global_assumptions row(s): claude-opus-4-7 → claude-sonnet-4-5`);
  } else {
    logger.info(`${TAG} no stale claude-opus-4-7 references found — skipping`);
  }
}
