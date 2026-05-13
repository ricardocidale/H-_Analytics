/**
 * icp-peer-companies-001 — ICP Peer Company Registry seed + admin_resources registration
 *
 * Phase A2 of the ICP bracket-mix peer-derived rebuild plan
 * (docs/plans/2026-05-13-001-refactor-icp-bracket-mix-peer-derived-plan.md).
 *
 * Belt-and-suspenders companion to 0060_icp_peer_companies.sql. Idempotent.
 *
 * Does three things in order:
 *   1. Ensures the icp_peer_companies table + bracket_slug columns exist (DDL guard).
 *   2. Seeds the initial peer roster (ON CONFLICT DO NOTHING).
 *   3. Registers the registry in admin_resources (ON CONFLICT DO NOTHING).
 *
 * Initial roster sourced from the existing comp_set_names lists in
 * starter brackets (icp-brackets-001.ts STARTER_BRACKETS). These are the
 * peer brands whose property rosters Phase B's algorithm will fetch and
 * classify into the 4 archetype buckets.
 *
 * Admin can toggle individual peers off via the per-row switch. The card-
 * level Analyst button regenerates the bracket mix across all active peers.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] icp-peer-companies-001";

// ── Named constants (no magic numbers / no magic strings) ───────────────────

const PEER_REGISTRY_ADMIN_RESOURCE_SLUG = "icp-peer-companies";
const PEER_REGISTRY_ADMIN_RESOURCE_KIND = "table";
const PEER_REGISTRY_ADMIN_RESOURCE_NAME = "ICP Peer Company Registry";
const PEER_REGISTRY_ADMIN_RESOURCE_DESCRIPTION =
  "Registry of peer brands whose property rosters drive the management-co-level " +
  "bracket mix. Replaces the prior algorithm that classified the management co's " +
  "own portfolio. Admin toggles peers on/off; the Analyst button regenerates the " +
  "mix across all active peers.";

const SEED_BATCH_SOURCE = "phase-a-seed-2026-05-13";

/**
 * Initial peer roster.
 *
 * Drawn from the existing comp_set_names arrays in starter brackets so the
 * Phase B algorithm has a known seed list of brands to research before any
 * regeneration run. niche_tags guide weighting in the classifier.
 */
const SEED_PEERS = [
  // Boutique upscale hotels
  { name: "Auberge Resorts", niche_tags: ["luxury", "boutique-upscale", "resort"] },
  { name: "Kimpton", niche_tags: ["boutique-upscale", "lifestyle", "urban"] },
  { name: "Autograph Collection", niche_tags: ["soft-brand", "boutique-upscale", "marriott"] },
  { name: "Small Luxury Hotels", niche_tags: ["luxury", "boutique-upscale", "independent-collection"] },
  // Branded full-service / soft-brand hotels
  { name: "Marriott Autograph", niche_tags: ["soft-brand", "full-service", "marriott"] },
  { name: "Hyatt Unbound", niche_tags: ["soft-brand", "full-service", "hyatt"] },
  { name: "IHG Voco", niche_tags: ["soft-brand", "full-service", "ihg"] },
  { name: "Curio Collection", niche_tags: ["soft-brand", "full-service", "hilton"] },
  // Performance-managed STR clusters
  { name: "Vacasa Premium", niche_tags: ["str", "performance-managed", "vacation-rental"] },
  { name: "Sonder", niche_tags: ["str", "performance-managed", "urban-lifestyle"] },
  { name: "AvantStay", niche_tags: ["str", "performance-managed", "group-travel"] },
  { name: "Evolve", niche_tags: ["str", "performance-managed", "vacation-rental"] },
  // Agritourism / experiential lodges
  { name: "Under Canvas", niche_tags: ["agritourism", "glamping", "experiential"] },
  { name: "Collective Retreats", niche_tags: ["agritourism", "glamping", "experiential"] },
  { name: "Farm at Propeller Island", niche_tags: ["agritourism", "experiential", "lodge"] },
  { name: "Glamping Hub", niche_tags: ["agritourism", "glamping", "marketplace"] },
] as const;

const SEED_PEER_COUNT = SEED_PEERS.length;

export async function runIcpPeerCompanies001(): Promise<void> {
  // ── Step 1: DDL guard (idempotent) ────────────────────────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "icp_peer_companies" (
      "id"                 integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
      "name"               text NOT NULL,
      "niche_tags"         text[],
      "is_active"          boolean NOT NULL DEFAULT true,
      "source_url"         text,
      "last_researched_at" timestamp,
      "created_at"         timestamp NOT NULL DEFAULT now(),
      "updated_at"         timestamp NOT NULL DEFAULT now(),
      CONSTRAINT "icp_peer_companies_name_uq" UNIQUE("name")
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "icp_peer_companies_active_idx"
      ON "icp_peer_companies" ("is_active")
  `);

  await db.execute(sql`
    ALTER TABLE "vendor_passthrough_costs"
    ADD COLUMN IF NOT EXISTS "bracket_slug" text
  `);

  await db.execute(sql`
    ALTER TABLE "mgmt_co_markup_factors"
    ADD COLUMN IF NOT EXISTS "bracket_slug" text
  `);

  // ── Step 2: Seed initial peer roster ────────────────────────────────────
  let seeded = 0;
  for (const peer of SEED_PEERS) {
    const result = await db.execute(sql`
      INSERT INTO icp_peer_companies (name, niche_tags, source_url)
      VALUES (
        ${peer.name},
        ${peer.niche_tags as unknown as string[]}::text[],
        ${SEED_BATCH_SOURCE}
      )
      ON CONFLICT (name) DO NOTHING
    `);
    seeded += Number((result as { rowCount?: number }).rowCount ?? 0);
  }

  if (seeded > 0) {
    logger.info(`${TAG} seeded ${seeded}/${SEED_PEER_COUNT} peer companies`);
  } else {
    logger.info(`${TAG} all ${SEED_PEER_COUNT} peer companies already exist — skipping seed`);
  }

  // ── Step 3: Register in admin_resources ───────────────────────────────────
  const arResult = await db.execute(sql`
    INSERT INTO admin_resources (kind, slug, display_name, description, config)
    VALUES (
      ${PEER_REGISTRY_ADMIN_RESOURCE_KIND},
      ${PEER_REGISTRY_ADMIN_RESOURCE_SLUG},
      ${PEER_REGISTRY_ADMIN_RESOURCE_NAME},
      ${PEER_REGISTRY_ADMIN_RESOURCE_DESCRIPTION},
      ${JSON.stringify({
        tableRef: "icp_peer_companies",
        vectorIndexed: false,
        readOnly: true,
        agentsUsing: ["Cecília", "Marco"],
      })}::jsonb
    )
    ON CONFLICT (kind, slug) DO NOTHING
  `);

  const arInserted = Number((arResult as { rowCount?: number }).rowCount ?? 0);
  if (arInserted > 0) {
    logger.info(`${TAG} registered admin_resources entry for ${PEER_REGISTRY_ADMIN_RESOURCE_SLUG}`);
  } else {
    logger.info(`${TAG} admin_resources entry already exists — skipping`);
  }
}
