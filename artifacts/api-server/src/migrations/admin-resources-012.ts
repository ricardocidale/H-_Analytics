/**
 * admin-resources-012 — Add quarterly Pietro cadence and freshness probe
 * config to the two national benchmark feed rows.
 *
 * vendor-passthrough-costs and mgmt-co-markup-factors are annual/quarterly
 * benchmark feeds seeded from STR, CBRE, HVS, PKF industry reports. Their
 * admin_resources rows were originally seeded (pietro-resources-002) with
 * cadence: "weekly" in config but no Pietro TTL override, so the Pietro
 * scheduler would dispatch them on every 60-minute tick (PROBE_PROFILES.source
 * TTL = 300 s — stale before the next tick if lastCheckedAt was never set).
 *
 * This migration:
 *   1. Sets `config.pietroTtlDays = 90` so Pietro's staleness check treats
 *      these rows as fresh for 90 days after the last successful minion run.
 *   2. Adds `config.freshnessProbe` so Costantino's `check_table_freshness`
 *      tool knows which table/column to query when auditing data staleness.
 *   3. Corrects `config.cadence` from "weekly" → "quarterly" for clarity.
 *
 * Idempotent — uses jsonb_set so re-running is a no-op when the keys already
 * hold the target values.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";
import { NATIONAL_FEED_QUARTERLY_TTL_DAYS } from "@shared/constants-research";

const TAG = "[migration] admin-resources-012";

const UPDATES: Array<{ slug: string; table: string; column: string }> = [
  {
    slug: "vendor-passthrough-costs",
    table: "vendor_passthrough_costs",
    column: "fetched_at",
  },
  {
    slug: "mgmt-co-markup-factors",
    table: "mgmt_co_markup_factors",
    column: "fetched_at",
  },
];

export async function runAdminResources012(): Promise<void> {
  let updated = 0;
  let skipped = 0;

  for (const { slug, table, column } of UPDATES) {
    try {
      const freshnessProbe = JSON.stringify({
        table,
        column,
        thresholdDays: NATIONAL_FEED_QUARTERLY_TTL_DAYS,
      });

      const result = await db.execute(sql`
        UPDATE admin_resources
        SET config = config
          || jsonb_build_object(
               'pietroTtlDays',    ${NATIONAL_FEED_QUARTERLY_TTL_DAYS}::int,
               'cadence',          'quarterly',
               'freshnessProbe',   ${freshnessProbe}::jsonb
             )
        WHERE kind = 'source'
          AND slug = ${slug}
          AND NOT (config ? 'pietroTtlDays')
        RETURNING id
      `);

      if (Array.isArray(result.rows) && result.rows.length > 0) {
        updated++;
        logger.info(`${TAG} updated config for ${slug}`);
      } else {
        skipped++;
        logger.info(`${TAG} ${slug} already has pietroTtlDays — skipped`);
      }
    } catch (err: unknown) {
      logger.error(
        `${TAG} failed to update ${slug}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  logger.info(`${TAG} done — ${updated} updated, ${skipped} already current`);
}
