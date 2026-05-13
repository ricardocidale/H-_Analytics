/**
 * icp-brackets-004 — Geography-tier catalog rewrite + match-rule columns
 *
 * Plan 2026-05-13-001 U7. Belt-and-suspenders runtime migration that runs
 * after Drizzle SQL migration 0065_icp_brackets_match_rules.sql. Idempotent.
 *
 * Does three things in order:
 *   1. ADD COLUMN IF NOT EXISTS for the 6 match-rule columns (mirrors the
 *      SQL migration so dev DBs whose _journal.json has drifted past 0065
 *      still get them).
 *   2. DELETEs the 4 retired service-profile bracket slugs from
 *      `icp_brackets` (these have no match rules and don't fit the new
 *      geography-tier dimension).
 *   3. UPSERTs the 5 geography-tier brackets from BRACKET_CATALOG +
 *      BEST_FIT_RULES_SEED, populating slug, name, archetype, customer_type,
 *      service_consumption_profile, default_exit_cap_rate,
 *      default_refi_max_ltv_to_original, and all 6 match-rule columns.
 *
 * After this guard runs, Davi (per-property best-fit classifier minion)
 * loads its rule set from these rows — the seed const exists only to
 * bootstrap the table.
 *
 * Safety note for prod: the four DELETEd slugs were never referenced by
 * any persisted bracket_mix on prod (catalog Phase C was never merged —
 * PR #138 closed). Deleting them removes orphan catalog rows; no FK
 * cascade follows.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";
import {
  BRACKET_CATALOG,
  BEST_FIT_RULES_SEED,
  SERVICE_CONSUMPTION_HOTEL,
  SERVICE_CONSUMPTION_STR,
  type BracketId,
  type BestFitRuleSeed,
} from "../ai/icp/bracket-catalog";

const TAG = "[migration] icp-brackets-004";

/** Retired service-profile slugs from the icp-brackets-001 seed. */
const RETIRED_BRACKET_SLUGS = [
  "boutique-upscale-hotel",
  "branded-full-service-hotel",
  "performance-str-cluster",
  "agritourism-experiential-lodge",
] as const;

/** Service-consumption type → DB enum (`customer_type`/`service_consumption_profile`). */
function serviceConsumptionToDbColumns(c: string): { customerType: string; serviceConsumptionProfile: string } {
  if (c === SERVICE_CONSUMPTION_STR) {
    return { customerType: "str", serviceConsumptionProfile: "str_only" };
  }
  if (c === SERVICE_CONSUMPTION_HOTEL) {
    return { customerType: "hotel", serviceConsumptionProfile: "full" };
  }
  // SERVICE_CONSUMPTION_MIXED maps to the hotel column with full profile —
  // the engine's mix mechanism reads the bracket's own serviceConsumption
  // flag (returned by the route layer), not the catalog enum columns, when
  // splitting blended consumption. The DB enum doesn't model 'mixed' yet;
  // a future schema extension can split it out.
  return { customerType: "hotel", serviceConsumptionProfile: "full" };
}

export async function runIcpBrackets004(): Promise<void> {
  logger.info(`${TAG} Step 1/3: ensure match-rule columns exist`);

  await db.execute(sql`ALTER TABLE "icp_brackets" ADD COLUMN IF NOT EXISTS "match_countries" jsonb`);
  await db.execute(sql`ALTER TABLE "icp_brackets" ADD COLUMN IF NOT EXISTS "match_business_models" jsonb`);
  await db.execute(sql`ALTER TABLE "icp_brackets" ADD COLUMN IF NOT EXISTS "match_quality_tiers" jsonb`);
  await db.execute(sql`ALTER TABLE "icp_brackets" ADD COLUMN IF NOT EXISTS "match_keywords" jsonb`);
  await db.execute(sql`ALTER TABLE "icp_brackets" ADD COLUMN IF NOT EXISTS "match_priority" integer NOT NULL DEFAULT 0`);
  await db.execute(sql`ALTER TABLE "icp_brackets" ADD COLUMN IF NOT EXISTS "match_rationale" text`);

  logger.info(`${TAG} Step 2/3: delete retired service-profile bracket slugs`);

  const retiredResult = await db.execute(sql`
    DELETE FROM icp_brackets
    WHERE slug = ANY(${RETIRED_BRACKET_SLUGS as unknown as string[]}::text[])
  `);
  const retiredDeleted = Number((retiredResult as { rowCount?: number }).rowCount ?? 0);
  if (retiredDeleted > 0) {
    logger.info(`${TAG} deleted ${retiredDeleted} retired bracket row(s)`);
  } else {
    logger.info(`${TAG} no retired bracket rows present — skip`);
  }

  logger.info(`${TAG} Step 3/3: upsert ${BRACKET_CATALOG.length} geography-tier brackets`);

  // Index seed rules by bracketId so we can join catalog rows with their
  // match-rule predicates in one pass without N² scans.
  const seedByBracket = new Map<BracketId, BestFitRuleSeed>();
  for (const rule of BEST_FIT_RULES_SEED) {
    seedByBracket.set(rule.bracketId, rule);
  }

  let upserted = 0;
  for (const cat of BRACKET_CATALOG) {
    const rule = seedByBracket.get(cat.id);
    const { customerType, serviceConsumptionProfile } = serviceConsumptionToDbColumns(cat.serviceConsumption);

    const matchCountries = rule?.countries ? JSON.stringify(rule.countries) : null;
    const matchBusinessModels = rule?.businessModels ? JSON.stringify(rule.businessModels) : null;
    const matchQualityTiers = rule?.qualityTiers ? JSON.stringify(rule.qualityTiers) : null;
    const matchKeywords = rule?.marketKeywords ? JSON.stringify(rule.marketKeywords) : null;
    const matchPriority = rule?.priority ?? 0;
    const matchRationale = rule?.rationale ?? null;

    const result = await db.execute(sql`
      INSERT INTO icp_brackets (
        slug, name, archetype_label, customer_type, service_consumption_profile,
        description, is_active,
        default_exit_cap_rate, default_refi_max_ltv_to_original,
        match_countries, match_business_models, match_quality_tiers, match_keywords,
        match_priority, match_rationale
      ) VALUES (
        ${cat.id},
        ${cat.name},
        ${cat.archetypeLabel},
        ${customerType},
        ${serviceConsumptionProfile},
        ${cat.description},
        true,
        ${cat.defaultExitCapRate},
        ${cat.defaultRefiMaxLtvToOriginal},
        ${matchCountries}::jsonb,
        ${matchBusinessModels}::jsonb,
        ${matchQualityTiers}::jsonb,
        ${matchKeywords}::jsonb,
        ${matchPriority},
        ${matchRationale}
      )
      ON CONFLICT (slug) DO UPDATE SET
        name = EXCLUDED.name,
        archetype_label = EXCLUDED.archetype_label,
        customer_type = EXCLUDED.customer_type,
        service_consumption_profile = EXCLUDED.service_consumption_profile,
        description = EXCLUDED.description,
        is_active = EXCLUDED.is_active,
        default_exit_cap_rate = EXCLUDED.default_exit_cap_rate,
        default_refi_max_ltv_to_original = EXCLUDED.default_refi_max_ltv_to_original,
        match_countries = EXCLUDED.match_countries,
        match_business_models = EXCLUDED.match_business_models,
        match_quality_tiers = EXCLUDED.match_quality_tiers,
        match_keywords = EXCLUDED.match_keywords,
        match_priority = EXCLUDED.match_priority,
        match_rationale = EXCLUDED.match_rationale,
        updated_at = now()
    `);
    upserted += Number((result as { rowCount?: number }).rowCount ?? 0);
  }

  logger.info(`${TAG} upserted ${upserted}/${BRACKET_CATALOG.length} geography-tier bracket row(s)`);
}
