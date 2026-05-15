/**
 * icp-brackets-006 — Replace service-profile brackets with geography-tier catalog.
 *
 * Plan 2026-05-13-001 U7 (geography-tier catalog rewrite).
 *
 * Replaces the 4 service-profile brackets seeded by earlier migrations with
 * 5 geography-tier brackets that Davi uses for per-property classification:
 *
 *   New bracket slugs (geography-tier):
 *     us-tertiary-boutique-resort    — US vacation / drive-to destinations
 *     us-gateway-boutique            — US primary / secondary gateway cities
 *     latam-prime-urban-boutique     — LATAM prime urban centres
 *     latam-rural-illiquid           — LATAM secondary / rural markets
 *     latam-luxury-str-single-key    — LATAM luxury STR / single-key
 *
 *   Old bracket slugs removed:
 *     boutique-upscale-hotel         (service-profile era)
 *     soft-brand-boutique            (service-profile era)
 *     performance-managed-str        (service-profile era)
 *     agritourism-experiential       (service-profile era)
 *
 * Existing global_assumptions.bracket_mix JSON data referencing old slugs
 * will gracefully fall through to Layer-1 model_defaults (applyBracketLayer
 * Defaults returns empty if no matching slug) until re-assigned by the user.
 *
 * Each UPSERT is idempotent (ON CONFLICT DO UPDATE). The DELETE of old brackets
 * is also idempotent (deletes 0 rows on a re-run after removal).
 *
 * Match rules follow Davi's predicate semantics:
 *   NULL or empty array = wildcard (no constraint on that dimension).
 *   Higher matchPriority fires first; within the LATAM group, the STR and
 *   prime-urban rules fire before the catch-all rural rule.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] icp-brackets-006";

// ── Layer-2 default values (SEED_* per CLAUDE.md §2 taxonomy rule) ──────────
// Source: HVS 2025 US cap rate survey; CBRE LATAM 2024; AirDNA LATAM 2024.
// All figures are going-in cap rates + 75bp terminal spread where applicable.
const SEED_EXIT_CAP_US_TERTIARY_RESORT  = 0.0950; // CBRE 2024 US tertiary resort benchmark + 75bp
const SEED_EXIT_CAP_US_GATEWAY_BOUTIQUE = 0.0750; // HVS 2025 US gateway city boutique
const SEED_EXIT_CAP_LATAM_PRIME_URBAN   = 0.0850; // JLL LATAM 2024 prime urban boutique going-in
const SEED_EXIT_CAP_LATAM_RURAL         = 0.1100; // H+ Analytics modeled; illiquid-market premium
const SEED_EXIT_CAP_LATAM_LUXURY_STR    = 0.0900; // AirDNA LATAM 2024 luxury STR portfolio
const SEED_REFI_LTV_STD                 = 0.70;   // Plan 2026-05-13-001; standard commercial refi LTV cap

// ── Match-rule seed data ──────────────────────────────────────────────────────
// LATAM country list used as matchCountries for all three LATAM brackets.
// Adding jsonb literals directly into SQL via drizzle sql tag.
const LATAM_COUNTRIES = JSON.stringify([
  "CO", "MX", "PE", "AR", "BR", "CL", "UY", "PA", "EC", "CR",
]);

// STR business-model values from BUSINESS_MODEL_TYPES enum (properties schema)
const STR_BUSINESS_MODELS = JSON.stringify(["vrbo", "vrbo_owner_managed"]);

// Luxury-tier quality values that qualify for LATAM Luxury STR
const LUXURY_QUALITY_TIERS = JSON.stringify(["luxury", "upper_upscale"]);

// Premium quality tiers for LATAM Prime Urban (includes upscale too)
const PRIME_QUALITY_TIERS = JSON.stringify(["luxury", "upper_upscale", "upscale"]);

// Urban keywords for LATAM Prime Urban (city names match against market/city/stateProvince/name)
const LATAM_URBAN_KEYWORDS = JSON.stringify([
  "medellin", "medellín", "bogota", "bogotá", "cartagena",
  "mexico city", "ciudad de mexico", "cdmx",
  "lima", "miraflores", "san isidro",
  "buenos aires", "palermo", "recoleta",
  "santiago", "providencia", "las condes",
  "rio de janeiro", "sao paulo", "panama city",
  "quito", "guayaquil", "san jose",
]);

// Resort/destination keywords for US Tertiary Boutique Resort
const US_RESORT_KEYWORDS = JSON.stringify([
  "resort", "mountain", "beach", "lake", "ski", "skiing",
  "spa", "canyon", "vineyard", "winery", "golf", "getaway",
  "lodge", "retreat", "coastal", "oceanfront", "lakefront",
  "island", "hot spring", "glamping", "ranch",
]);

export async function runIcpBrackets006(): Promise<void> {
  logger.info(`${TAG} — replacing service-profile brackets with geography-tier catalog`);

  try {
    await db.transaction(async (tx) => {
      // ── Step 1: DELETE old service-profile brackets ─────────────────────────
      const deleted = await tx.execute(sql`
        DELETE FROM icp_brackets
        WHERE slug IN (
          'boutique-upscale-hotel',
          'soft-brand-boutique',
          'performance-managed-str',
          'agritourism-experiential'
        )
      `);
      logger.info(`${TAG} — deleted ${(deleted as { rowCount?: number }).rowCount ?? 0} old service-profile bracket(s)`);

      // ── Step 2: UPSERT 5 geography-tier brackets ────────────────────────────

      // US Tertiary Boutique Resort (matchPriority=50; resort-keyword + US-country)
      await tx.execute(sql`
        INSERT INTO icp_brackets (
          slug, name, archetype_label,
          customer_type, service_consumption_profile,
          description, sort_order, is_active,
          default_exit_cap_rate, default_refi_max_ltv_to_original,
          match_countries, match_keywords,
          match_priority, match_rationale
        ) VALUES (
          'us-tertiary-boutique-resort',
          'US Tertiary Boutique Resort',
          'US tertiary boutique resort',
          'hotel', 'full',
          'Independently branded boutique hotels and resorts in US tertiary and drive-to vacation destinations.',
          10, true,
          ${SEED_EXIT_CAP_US_TERTIARY_RESORT}, ${SEED_REFI_LTV_STD},
          '["US"]'::jsonb, ${US_RESORT_KEYWORDS}::jsonb,
          50, 'US property with resort/vacation-destination keyword in market, city, or name'
        )
        ON CONFLICT (slug) DO UPDATE SET
          name                          = EXCLUDED.name,
          archetype_label               = EXCLUDED.archetype_label,
          customer_type                 = EXCLUDED.customer_type,
          service_consumption_profile   = EXCLUDED.service_consumption_profile,
          description                   = EXCLUDED.description,
          sort_order                    = EXCLUDED.sort_order,
          is_active                     = EXCLUDED.is_active,
          default_exit_cap_rate         = EXCLUDED.default_exit_cap_rate,
          default_refi_max_ltv_to_original = EXCLUDED.default_refi_max_ltv_to_original,
          match_countries               = EXCLUDED.match_countries,
          match_keywords                = EXCLUDED.match_keywords,
          match_priority                = EXCLUDED.match_priority,
          match_rationale               = EXCLUDED.match_rationale,
          updated_at                    = NOW()
      `);

      // US Gateway Boutique (matchPriority=10; US catch-all)
      await tx.execute(sql`
        INSERT INTO icp_brackets (
          slug, name, archetype_label,
          customer_type, service_consumption_profile,
          description, sort_order, is_active,
          default_exit_cap_rate, default_refi_max_ltv_to_original,
          match_countries,
          match_priority, match_rationale
        ) VALUES (
          'us-gateway-boutique',
          'US Gateway Boutique',
          'US gateway city boutique hotel',
          'hotel', 'full',
          'Boutique hotels in US primary and secondary gateway city markets.',
          20, true,
          ${SEED_EXIT_CAP_US_GATEWAY_BOUTIQUE}, ${SEED_REFI_LTV_STD},
          '["US"]'::jsonb,
          10, 'US property not matched by a higher-priority US rule (gateway city catch-all)'
        )
        ON CONFLICT (slug) DO UPDATE SET
          name                          = EXCLUDED.name,
          archetype_label               = EXCLUDED.archetype_label,
          customer_type                 = EXCLUDED.customer_type,
          service_consumption_profile   = EXCLUDED.service_consumption_profile,
          description                   = EXCLUDED.description,
          sort_order                    = EXCLUDED.sort_order,
          is_active                     = EXCLUDED.is_active,
          default_exit_cap_rate         = EXCLUDED.default_exit_cap_rate,
          default_refi_max_ltv_to_original = EXCLUDED.default_refi_max_ltv_to_original,
          match_countries               = EXCLUDED.match_countries,
          match_priority                = EXCLUDED.match_priority,
          match_rationale               = EXCLUDED.match_rationale,
          updated_at                    = NOW()
      `);

      // LATAM Prime Urban Boutique (matchPriority=200; LATAM + prime quality + urban keyword)
      await tx.execute(sql`
        INSERT INTO icp_brackets (
          slug, name, archetype_label,
          customer_type, service_consumption_profile,
          description, sort_order, is_active,
          default_exit_cap_rate, default_refi_max_ltv_to_original,
          match_countries, match_quality_tiers, match_keywords,
          match_priority, match_rationale
        ) VALUES (
          'latam-prime-urban-boutique',
          'LATAM Prime Urban Boutique',
          'LATAM prime urban boutique hotel',
          'hotel', 'full',
          'Upscale boutique hotels in Latin America prime urban markets (Medellín, Bogotá, Mexico City, Lima, Buenos Aires, Santiago).',
          30, true,
          ${SEED_EXIT_CAP_LATAM_PRIME_URBAN}, ${SEED_REFI_LTV_STD},
          ${LATAM_COUNTRIES}::jsonb, ${PRIME_QUALITY_TIERS}::jsonb, ${LATAM_URBAN_KEYWORDS}::jsonb,
          200, 'LATAM property in a prime urban market with upscale/luxury quality tier'
        )
        ON CONFLICT (slug) DO UPDATE SET
          name                          = EXCLUDED.name,
          archetype_label               = EXCLUDED.archetype_label,
          customer_type                 = EXCLUDED.customer_type,
          service_consumption_profile   = EXCLUDED.service_consumption_profile,
          description                   = EXCLUDED.description,
          sort_order                    = EXCLUDED.sort_order,
          is_active                     = EXCLUDED.is_active,
          default_exit_cap_rate         = EXCLUDED.default_exit_cap_rate,
          default_refi_max_ltv_to_original = EXCLUDED.default_refi_max_ltv_to_original,
          match_countries               = EXCLUDED.match_countries,
          match_quality_tiers           = EXCLUDED.match_quality_tiers,
          match_keywords                = EXCLUDED.match_keywords,
          match_priority                = EXCLUDED.match_priority,
          match_rationale               = EXCLUDED.match_rationale,
          updated_at                    = NOW()
      `);

      // LATAM Rural / Illiquid (matchPriority=100; LATAM catch-all)
      await tx.execute(sql`
        INSERT INTO icp_brackets (
          slug, name, archetype_label,
          customer_type, service_consumption_profile,
          description, sort_order, is_active,
          default_exit_cap_rate, default_refi_max_ltv_to_original,
          match_countries,
          match_priority, match_rationale
        ) VALUES (
          'latam-rural-illiquid',
          'LATAM Rural / Illiquid',
          'LATAM rural or illiquid market property',
          'hotel', 'mixed',
          'Hotels, lodges, and experiential properties in Latin America secondary and rural markets.',
          40, true,
          ${SEED_EXIT_CAP_LATAM_RURAL}, ${SEED_REFI_LTV_STD},
          ${LATAM_COUNTRIES}::jsonb,
          100, 'LATAM property not matched by a higher-priority LATAM rule (rural/secondary catch-all)'
        )
        ON CONFLICT (slug) DO UPDATE SET
          name                          = EXCLUDED.name,
          archetype_label               = EXCLUDED.archetype_label,
          customer_type                 = EXCLUDED.customer_type,
          service_consumption_profile   = EXCLUDED.service_consumption_profile,
          description                   = EXCLUDED.description,
          sort_order                    = EXCLUDED.sort_order,
          is_active                     = EXCLUDED.is_active,
          default_exit_cap_rate         = EXCLUDED.default_exit_cap_rate,
          default_refi_max_ltv_to_original = EXCLUDED.default_refi_max_ltv_to_original,
          match_countries               = EXCLUDED.match_countries,
          match_priority                = EXCLUDED.match_priority,
          match_rationale               = EXCLUDED.match_rationale,
          updated_at                    = NOW()
      `);

      // LATAM Luxury STR Single-Key (matchPriority=300; most specific LATAM rule)
      await tx.execute(sql`
        INSERT INTO icp_brackets (
          slug, name, archetype_label,
          customer_type, service_consumption_profile,
          description, sort_order, is_active,
          default_exit_cap_rate, default_refi_max_ltv_to_original,
          match_countries, match_business_models, match_quality_tiers,
          match_priority, match_rationale
        ) VALUES (
          'latam-luxury-str-single-key',
          'LATAM Luxury STR / Single-Key',
          'LATAM luxury short-term rental single-key',
          'str', 'str_only',
          'Luxury and upscale short-term rental properties in Latin America (villas, penthouses, curated vacation homes).',
          50, true,
          ${SEED_EXIT_CAP_LATAM_LUXURY_STR}, ${SEED_REFI_LTV_STD},
          ${LATAM_COUNTRIES}::jsonb, ${STR_BUSINESS_MODELS}::jsonb, ${LUXURY_QUALITY_TIERS}::jsonb,
          300, 'LATAM STR (vrbo/vrbo_owner_managed) property with luxury or upper-upscale quality tier'
        )
        ON CONFLICT (slug) DO UPDATE SET
          name                          = EXCLUDED.name,
          archetype_label               = EXCLUDED.archetype_label,
          customer_type                 = EXCLUDED.customer_type,
          service_consumption_profile   = EXCLUDED.service_consumption_profile,
          description                   = EXCLUDED.description,
          sort_order                    = EXCLUDED.sort_order,
          is_active                     = EXCLUDED.is_active,
          default_exit_cap_rate         = EXCLUDED.default_exit_cap_rate,
          default_refi_max_ltv_to_original = EXCLUDED.default_refi_max_ltv_to_original,
          match_countries               = EXCLUDED.match_countries,
          match_business_models         = EXCLUDED.match_business_models,
          match_quality_tiers           = EXCLUDED.match_quality_tiers,
          match_priority                = EXCLUDED.match_priority,
          match_rationale               = EXCLUDED.match_rationale,
          updated_at                    = NOW()
      `);

      logger.info(`${TAG} — geography-tier catalog ready (5 brackets seeded)`);
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`${TAG} — migration failed, rolled back: ${errorMessage}`);
    throw error;
  }
}
