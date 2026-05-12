/**
 * icp-brackets-001 — ICP Bracket Catalog seed + admin_resources registration
 *
 * Task #1409 — belt-and-suspenders runtime migration that runs after the
 * Drizzle SQL migration 0056_icp_bracket_catalog.sql. Idempotent.
 *
 * Does three things in order:
 *   1. Ensures the icp_brackets table exists (DDL guard).
 *   2. Seeds the 4 starter brackets (ON CONFLICT DO NOTHING).
 *   3. Registers the catalog in admin_resources (ON CONFLICT DO NOTHING).
 *
 * Bracket design (requirements.md R1–R10):
 *   - customer_type 'hotel' → service_consumption_profile 'full'
 *   - customer_type 'str'   → service_consumption_profile 'str_only'
 *     (STR brackets only consume ICP_STR_ELIGIBLE_SERVICE_CATEGORIES)
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] icp-brackets-001";

// ── Named constants (R24 / CLAUDE.md §1 — no magic numbers) ──────────────────

const BRACKET_CATALOG_ADMIN_RESOURCE_SLUG = "icp-bracket-catalog";
const BRACKET_CATALOG_ADMIN_RESOURCE_KIND = "table";
const BRACKET_CATALOG_ADMIN_RESOURCE_NAME = "ICP Bracket Catalog";
const BRACKET_CATALOG_ADMIN_RESOURCE_DESCRIPTION =
  "Shared catalog of 3–5 reusable customer-property archetypes (brackets) that " +
  "drive Management Company revenue and expense calculations. Hotels consume all " +
  "service lines; STR clusters consume marketing/branding only plus incentive fee.";

/**
 * Starter brackets — 4 archetypes covering the primary H+ customer segments.
 *
 * ADR bands reference HTM/STR Research 2024 boutique lodging benchmarks and
 * internal HVS fee survey data. Weights are not stored here (they live in
 * global_assumptions.bracket_mix per company).
 *
 * Column mapping:
 *   slug                      — machine-readable identifier
 *   name                      — human display name
 *   archetype_label           — short UI badge label
 *   customer_type             — 'hotel' | 'str'
 *   service_consumption_profile — 'full' | 'str_only'
 *   target_adr_band_low/high  — USD, per-night
 *   comp_set_names            — JSON array of comparable brand names
 *   description               — short paragraph for card views
 *   source_note               — data provenance
 *   sort_order                — display ordering
 */
const STARTER_BRACKETS = [
  {
    slug: "boutique-upscale-hotel",
    name: "Boutique Upscale Hotel",
    archetype_label: "Hotel · Upscale",
    customer_type: "hotel",
    service_consumption_profile: "full",
    target_adr_band_low: 200,
    target_adr_band_high: 400,
    comp_set_names: JSON.stringify(["Auberge Resorts", "Kimpton", "Autograph Collection", "Small Luxury Hotels"]),
    description:
      "Independent or softly-branded upscale hotel (10–80 keys) with F&B, concierge, " +
      "and full service-line coverage. Typical markets: Hudson Valley, Catskills, coastal towns.",
    source_note: "HVS Fee Survey 2024 · STR Boutique Benchmarking Report 2024",
    sort_order: 1,
  },
  {
    slug: "branded-full-service-hotel",
    name: "Branded Full-Service Hotel",
    archetype_label: "Hotel · Full Service",
    customer_type: "hotel",
    service_consumption_profile: "full",
    target_adr_band_low: 150,
    target_adr_band_high: 350,
    comp_set_names: JSON.stringify(["Marriott Autograph", "Hyatt Unbound", "IHG Voco", "Curio Collection"]),
    description:
      "Branded full-service hotel operating under a soft-flag agreement. Consumes all " +
      "ManCo service lines. Revenue management and procurement savings are amplified " +
      "by brand distribution leverage.",
    source_note: "HVS Fee Survey 2024 · Lodging Econometrics Q4 2024",
    sort_order: 2,
  },
  {
    slug: "performance-str-cluster",
    name: "Performance STR Cluster",
    archetype_label: "STR · Performance",
    customer_type: "str",
    service_consumption_profile: "str_only",
    target_adr_band_low: 300,
    target_adr_band_high: 700,
    comp_set_names: JSON.stringify(["Vacasa Premium", "Sonder", "AvantStay", "Evolve"]),
    description:
      "Portfolio of short-term rental properties managed as a coordinated cluster. " +
      "Consumes ManCo marketing/branding and earns performance (incentive) fees. " +
      "Technology, accounting, and general management services are not provided by ManCo.",
    source_note: "AirDNA Market Report 2024 · STR Research Annual Survey 2024",
    sort_order: 3,
  },
  {
    slug: "agritourism-experiential-lodge",
    name: "Agritourism & Experiential Lodge",
    archetype_label: "Hotel · Experiential",
    customer_type: "hotel",
    service_consumption_profile: "full",
    target_adr_band_low: 250,
    target_adr_band_high: 550,
    comp_set_names: JSON.stringify(["Under Canvas", "Collective Retreats", "Farm at Propeller Island", "Glamping Hub"]),
    description:
      "Unique-stay lodge, glamping resort, or agritourism property positioned around " +
      "experiential programming. Treated as hotel for service-consumption: full ManCo " +
      "service-line coverage applies. High ADR offsets lower occupancy.",
    source_note: "Glamping Hub Outlook 2024 · HVS Boutique Lodging Report 2024",
    sort_order: 4,
  },
] as const;

const STARTER_BRACKET_COUNT = STARTER_BRACKETS.length;

export async function runIcpBrackets001(): Promise<void> {
  // ── Step 1: DDL guard (idempotent) ────────────────────────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "icp_brackets" (
      "id"                          integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      "slug"                        text NOT NULL,
      "name"                        text NOT NULL,
      "archetype_label"             text NOT NULL,
      "customer_type"               text NOT NULL,
      "service_consumption_profile" text NOT NULL,
      "target_adr_band_low"         real,
      "target_adr_band_high"        real,
      "comp_set_names"              jsonb,
      "description"                 text,
      "source_note"                 text,
      "is_active"                   boolean NOT NULL DEFAULT true,
      "sort_order"                  integer NOT NULL DEFAULT 0,
      "created_at"                  timestamp NOT NULL DEFAULT now(),
      "updated_at"                  timestamp NOT NULL DEFAULT now(),
      CONSTRAINT "icp_brackets_slug_uq" UNIQUE("slug")
    )
  `);

  await db.execute(sql`
    ALTER TABLE "global_assumptions"
    ADD COLUMN IF NOT EXISTS "bracket_mix" jsonb
  `);

  // ── Step 2: Seed starter brackets ────────────────────────────────────────
  let seeded = 0;
  for (const bracket of STARTER_BRACKETS) {
    const result = await db.execute(sql`
      INSERT INTO icp_brackets (
        slug, name, archetype_label, customer_type, service_consumption_profile,
        target_adr_band_low, target_adr_band_high, comp_set_names,
        description, source_note, sort_order
      ) VALUES (
        ${bracket.slug},
        ${bracket.name},
        ${bracket.archetype_label},
        ${bracket.customer_type},
        ${bracket.service_consumption_profile},
        ${bracket.target_adr_band_low},
        ${bracket.target_adr_band_high},
        ${bracket.comp_set_names}::jsonb,
        ${bracket.description},
        ${bracket.source_note},
        ${bracket.sort_order}
      )
      ON CONFLICT (slug) DO NOTHING
    `);
    seeded += Number((result as { rowCount?: number }).rowCount ?? 0);
  }

  if (seeded > 0) {
    logger.info(`${TAG} seeded ${seeded}/${STARTER_BRACKET_COUNT} starter brackets`);
  } else {
    logger.info(`${TAG} all ${STARTER_BRACKET_COUNT} starter brackets already exist — skipping seed`);
  }

  // ── Step 3: Register in admin_resources ───────────────────────────────────
  const arResult = await db.execute(sql`
    INSERT INTO admin_resources (kind, slug, display_name, description, config)
    VALUES (
      ${BRACKET_CATALOG_ADMIN_RESOURCE_KIND},
      ${BRACKET_CATALOG_ADMIN_RESOURCE_SLUG},
      ${BRACKET_CATALOG_ADMIN_RESOURCE_NAME},
      ${BRACKET_CATALOG_ADMIN_RESOURCE_DESCRIPTION},
      ${JSON.stringify({
        tableRef: "icp_brackets",
        vectorIndexed: false,
        readOnly: false,
        agentsUsing: ["Cecília", "Marco"],
      })}::jsonb
    )
    ON CONFLICT (kind, slug) DO NOTHING
  `);

  const arInserted = Number((arResult as { rowCount?: number }).rowCount ?? 0);
  if (arInserted > 0) {
    logger.info(`${TAG} registered admin_resources entry for ${BRACKET_CATALOG_ADMIN_RESOURCE_SLUG}`);
  } else {
    logger.info(`${TAG} admin_resources entry already exists — skipping`);
  }
}
