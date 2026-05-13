/**
 * icp-peer-companies-002 — Phase B Specialist output columns on icp_peer_companies
 *
 * Phase B of the ICP bracket-mix peer-derived rebuild plan
 * (docs/plans/2026-05-13-001-feat-icp-bracket-mix-peer-derived-phase-b-plan.md).
 *
 * Belt-and-suspenders runtime companion to the U1 schema change. Idempotent.
 *
 * Adds five nullable columns Tiago (Bracket-Mix Specialist) writes per peer:
 *   - brand_archetype_split    jsonb     — slug→weight, sums to 1.0
 *   - roster_size_estimate     integer   — estimated active property count
 *   - split_evidence           jsonb     — citations + 5–10 sample properties
 *   - last_research_run_id     integer   — FK target on bracket_mix_runs (U2)
 *   - costantino_config        jsonb     — per-peer freshness override (R13)
 *
 * NULL on every column = peer has not yet been researched (cold start).
 *
 * The `last_research_run_id` FK constraint is added in the U2 migration
 * (bracket-mix-runs-001.ts) once the target table exists.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] icp-peer-companies-002";

export async function runIcpPeerCompanies002(): Promise<void> {
  await db.execute(sql`
    DO $$
    BEGIN
      ALTER TABLE "icp_peer_companies"
        ADD COLUMN IF NOT EXISTS "brand_archetype_split" jsonb;

      ALTER TABLE "icp_peer_companies"
        ADD COLUMN IF NOT EXISTS "roster_size_estimate" integer;

      ALTER TABLE "icp_peer_companies"
        ADD COLUMN IF NOT EXISTS "split_evidence" jsonb;

      ALTER TABLE "icp_peer_companies"
        ADD COLUMN IF NOT EXISTS "last_research_run_id" integer;

      ALTER TABLE "icp_peer_companies"
        ADD COLUMN IF NOT EXISTS "costantino_config" jsonb;
    END $$;
  `);

  logger.info(`${TAG} ensured 5 Phase B Specialist columns on icp_peer_companies`);
}
