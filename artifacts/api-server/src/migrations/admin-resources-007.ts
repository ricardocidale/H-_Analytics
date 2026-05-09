/**
 * admin-resources-007 — Tripadvisor Content API live tool row.
 *
 * Seeds the admin_resources table with a row for the Tripadvisor Content API
 * source. This is a live on-demand tool (not a scheduled minion): Rebecca
 * calls get_tripadvisor_hotels to fetch competitor hotel ratings/reviews for
 * a given market during a chat session.
 *
 * Idempotent — uses ON CONFLICT (kind, slug) DO NOTHING.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] admin-resources-007";

export async function runAdminResources007(): Promise<void> {
  const result = await db.execute(sql`
    INSERT INTO admin_resources (kind, slug, display_name, description, config)
    VALUES (
      'source',
      'tripadvisor-content-api',
      'Tripadvisor Content API',
      'Live on-demand hotel search tool for Rebecca. Fetches competitor hotel ratings, review counts, city rankings, and price tiers for a given market via the official Tripadvisor Content API. Requires TRIPADVISOR_API_KEY (register at tripadvisor.com/developers — free tier: 5000 req/month).',
      '{"apiBase": "https://api.content.tripadvisor.com/api/v1", "secretEnvVar": "TRIPADVISOR_API_KEY", "category": "hotels", "freeMonthlyQuota": 5000}'::jsonb
    )
    ON CONFLICT (kind, slug) DO NOTHING
    RETURNING id
  `);
  const inserted = Array.isArray(result.rows) ? result.rows.length : 0;
  logger.info(`${TAG} tripadvisor-content-api row: ${inserted === 1 ? "seeded" : "already existed"}`);
}
