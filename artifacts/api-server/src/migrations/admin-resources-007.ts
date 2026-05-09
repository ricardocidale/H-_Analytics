/**
 * admin-resources-007 — Seed Exa Answer API, flag Perplexity as search
 * provider, and seed Tripadvisor Content API live tool row.
 *
 * Three operations:
 *
 * 1. INSERT admin_resources row for Exa Answer API (kind='api', slug='exa')
 *    with config.rebeccaChatProvider=true so the chat route can discover it
 *    as a web-answer API without hardcoded strings.
 *
 * 2. UPDATE the Perplexity API row (kind='api', slug='perplexity') to add
 *    config.rebeccaSearchProvider=true, marking it as the configurable
 *    web-search provider for Rebecca's research augmentation.
 *
 * 3. INSERT admin_resources row for Tripadvisor Content API (kind='source',
 *    slug='tripadvisor-content-api') used as a live on-demand Rebecca tool.
 *
 * Idempotent — INSERTs use ON CONFLICT DO NOTHING; UPDATE is safe to re-run.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] admin-resources-007";

export async function runAdminResources007(): Promise<void> {
  // 1. Seed Exa Answer API row
  const exaResult = await db.execute(sql`
    INSERT INTO admin_resources (kind, slug, display_name, description, config)
    VALUES (
      'api',
      'exa',
      'Exa Answer',
      'Exa neural web-answer API — returns a synthesised answer over live web results with source citations. Used as Rebecca''s web-grounded chat provider when selected.',
      ${JSON.stringify({
        rebeccaChatProvider: true,
        apiKeyRef: "EXA_API_KEY",
        endpoint: "https://api.exa.ai/answer",
        rateLimitPerMin: 20,
      })}::jsonb
    )
    ON CONFLICT (kind, slug) DO NOTHING
    RETURNING id
  `);
  const exaSeeded = Array.isArray(exaResult.rows) ? exaResult.rows.length : 0;
  logger.info(`${TAG} exa row: ${exaSeeded ? "seeded" : "already existed"}`);

  // 2. Flag Perplexity row as Rebecca's search provider
  await db.execute(sql`
    UPDATE admin_resources
    SET config = config || '{"rebeccaSearchProvider": true}'::jsonb
    WHERE kind = 'api' AND slug = 'perplexity'
  `);
  logger.info(`${TAG} perplexity row: flagged as rebeccaSearchProvider`);

  // 3. Seed Tripadvisor Content API row
  const taResult = await db.execute(sql`
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
  const taSeeded = Array.isArray(taResult.rows) ? taResult.rows.length : 0;
  logger.info(`${TAG} tripadvisor-content-api row: ${taSeeded ? "seeded" : "already existed"}`);
}
