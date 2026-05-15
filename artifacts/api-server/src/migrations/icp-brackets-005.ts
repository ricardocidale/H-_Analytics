/**
 * icp-brackets-005 — Add Davi best-fit match-rule columns to icp_brackets.
 *
 * Plan 2026-05-13-001 U7. Belt-and-suspenders companion to
 * 0067_icp_brackets_match_rules.sql. Idempotent (IF NOT EXISTS on every
 * ALTER). Runs after icp-brackets-004 so the guard ordering is stable.
 *
 * Adds six columns that Davi (per-property best-fit classifier minion,
 * artifacts/api-server/src/ai/ambient/minions/davi.ts) uses to match
 * properties to ICP brackets at entity creation time:
 *   - match_countries       jsonb — country allowlist (NULL = wildcard)
 *   - match_business_models jsonb — business-model allowlist (NULL = wildcard)
 *   - match_quality_tiers   jsonb — quality-tier allowlist (NULL = wildcard)
 *   - match_keywords        jsonb — keyword substring list (NULL = wildcard)
 *   - match_priority        integer NOT NULL DEFAULT 0 — higher fires first
 *   - match_rationale       text — human-readable rule description
 *
 * Does NOT seed bracket rows — those live in the bracket-catalog.ts UPSERT
 * which runs as part of the full geography-tier catalog migration.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] icp-brackets-005";

export async function runIcpBrackets005(): Promise<void> {
  logger.info(`${TAG} — adding match-rule columns to icp_brackets`);

  await db.execute(sql`
    ALTER TABLE "icp_brackets"
      ADD COLUMN IF NOT EXISTS "match_countries" jsonb
  `);
  await db.execute(sql`
    ALTER TABLE "icp_brackets"
      ADD COLUMN IF NOT EXISTS "match_business_models" jsonb
  `);
  await db.execute(sql`
    ALTER TABLE "icp_brackets"
      ADD COLUMN IF NOT EXISTS "match_quality_tiers" jsonb
  `);
  await db.execute(sql`
    ALTER TABLE "icp_brackets"
      ADD COLUMN IF NOT EXISTS "match_keywords" jsonb
  `);
  await db.execute(sql`
    ALTER TABLE "icp_brackets"
      ADD COLUMN IF NOT EXISTS "match_priority" integer NOT NULL DEFAULT 0
  `);
  await db.execute(sql`
    ALTER TABLE "icp_brackets"
      ADD COLUMN IF NOT EXISTS "match_rationale" text
  `);

  logger.info(`${TAG} — match-rule columns ready`);
}
