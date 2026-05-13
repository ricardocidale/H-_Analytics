/**
 * admin-resources-014 — Costantino freshness defaults for the icp-peer-companies row
 *
 * Phase B U7 of the ICP bracket-mix peer-derived rebuild plan
 * (docs/plans/2026-05-13-001-feat-icp-bracket-mix-peer-derived-phase-b-plan.md).
 *
 * Adds the per-peer freshness probe config to the icp-peer-companies
 * admin_resources row that icp-peer-companies-001 seeded:
 *
 *   config.peerFreshness = { staleAfterDays: 90, recheckCadence: 'weekly' }
 *
 * The defaults live in DB (per CLAUDE.md §1 no-magic-numbers and the
 * `analyst-intelligence-display` SUPERSEDING block) so admins can retune
 * the cadence without a code deploy. Per-peer overrides on
 * `icp_peer_companies.costantino_config` take precedence at probe time.
 *
 * Idempotent — only writes when peerFreshness is missing.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] admin-resources-014";

// Defaults live in this migration so the seeded values are visible at code
// review time; once admin-edited, the DB row is the source of truth.
const DEFAULT_STALE_AFTER_DAYS = 90;
const DEFAULT_RECHECK_CADENCE = "weekly";

export async function runAdminResources014(): Promise<void> {
  const result = await db.execute(sql`
    UPDATE admin_resources
    SET config = config
      || jsonb_build_object(
           'peerFreshness',
           jsonb_build_object(
             'staleAfterDays',   ${DEFAULT_STALE_AFTER_DAYS}::int,
             'recheckCadence',   ${DEFAULT_RECHECK_CADENCE}::text
           )
         )
    WHERE kind = 'table'
      AND slug = 'icp-peer-companies'
      AND NOT (config ? 'peerFreshness')
    RETURNING id
  `);
  const updated = Array.isArray(result.rows) ? result.rows.length : 0;
  if (updated > 0) {
    logger.info(
      `${TAG} seeded peerFreshness defaults (staleAfterDays=${DEFAULT_STALE_AFTER_DAYS}, recheckCadence=${DEFAULT_RECHECK_CADENCE})`,
    );
  } else {
    logger.info(`${TAG} icp-peer-companies row already has peerFreshness — skipping`);
  }
}
