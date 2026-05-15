/**
 * icp-brackets-004 — Slug rename + Layer-2 overlay value backfill
 *
 * Plan 2026-05-13-001 (feat seed-calibration-bracket-defaults-and-irr-views) Path A.
 *
 * Three of the four starter bracket slugs seeded by icp-brackets-001 do not
 * match the catalog IDs declared in bracket-catalog.ts, which are the strings
 * the bracket-assignment-minion writes into global_assumptions.bracket_mix.
 * The mismatch means applyBracketLayerDefaults() finds no rows for 3 of 4
 * entries when blending Layer-2 defaults — rendering the U6 overlay 75% inert.
 *
 * Concept merge: "Branded Full-Service Hotel" was recharacterised as
 * "Soft-Brand Boutique" between the initial catalog seed and the current
 * bracket-catalog.ts definition. The DB row is renamed to reflect that
 * evolution; customer_type (hotel) and service_consumption_profile (full)
 * are unchanged because the service profile is identical.
 *
 * Agritourism: service_consumption_profile corrected from "full" to "mixed"
 * to match bracket-catalog.ts SERVICE_CONSUMPTION_MIXED.
 *
 * After this migration:
 *   DB slug                    ← was
 *   boutique-upscale-hotel       (already correct — untouched by renames)
 *   soft-brand-boutique          branded-full-service-hotel
 *   performance-managed-str      performance-str-cluster
 *   agritourism-experiential     agritourism-experiential-lodge
 *
 * All four brackets receive default_exit_cap_rate and
 * default_refi_max_ltv_to_original so applyBracketLayerDefaults() can
 * produce meaningful weight-blended Layer-2 overlays going forward.
 *
 * Idempotent: rename UPDATEs match on old slug — no-op if row already has
 * the new slug. Overlay SET is unconditional — safe to re-run.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] icp-brackets-004";

// ── Layer-2 overlay defaults (SEED_* per CLAUDE.md §2 taxonomy rule) ────────
// HVS 2025 US Boutique Lodging cap rate survey; going-in + 75bp terminal spread
const SEED_OVERLAY_EXIT_CAP_BOUTIQUE_UPSCALE = 0.085;
// HVS 2025 US Boutique Lodging — soft-brand tier ≈ independent upscale going-in
const SEED_OVERLAY_EXIT_CAP_SOFT_BRAND = 0.085;
// AirDNA 2024 US performance-STR portfolio cap rate benchmark
const SEED_OVERLAY_EXIT_CAP_STR_CLUSTER = 0.10;
// HVS 2024 US tertiary / experiential lodge going-in + 75bp terminal
const SEED_OVERLAY_EXIT_CAP_AGRITOURISM = 0.0975;
// Plan 2026-05-13-001; standard US commercial refi LTV cap (matches SEED_REFI_MAX_LTV_TO_ORIGINAL)
const SEED_OVERLAY_REFI_LTV_STD = 0.70;

export async function runIcpBrackets004(): Promise<void> {
  logger.info(`${TAG} Renaming mismatched bracket slugs and backfilling Layer-2 overlay values`);

  // ── Step 1: Slug renames ──────────────────────────────────────────────────
  // Each UPDATE is a no-op when the row already carries the new slug.

  const r1 = await db.execute(sql`
    UPDATE icp_brackets
    SET slug             = 'soft-brand-boutique',
        name             = 'Soft-Brand Boutique',
        archetype_label  = 'soft-brand boutique hotel'
    WHERE slug = 'branded-full-service-hotel'
  `);
  logger.info(`${TAG} branded-full-service-hotel → soft-brand-boutique (${(r1 as { rowCount?: number }).rowCount ?? 0} row)`);

  const r2 = await db.execute(sql`
    UPDATE icp_brackets
    SET slug             = 'performance-managed-str',
        name             = 'Performance-Managed STR Cluster',
        archetype_label  = 'performance-managed short-term rental cluster'
    WHERE slug = 'performance-str-cluster'
  `);
  logger.info(`${TAG} performance-str-cluster → performance-managed-str (${(r2 as { rowCount?: number }).rowCount ?? 0} row)`);

  const r3 = await db.execute(sql`
    UPDATE icp_brackets
    SET slug                        = 'agritourism-experiential',
        name                        = 'Agritourism / Experiential Lodge',
        archetype_label             = 'agritourism or experiential lodge',
        service_consumption_profile = 'mixed'
    WHERE slug = 'agritourism-experiential-lodge'
  `);
  logger.info(`${TAG} agritourism-experiential-lodge → agritourism-experiential (${(r3 as { rowCount?: number }).rowCount ?? 0} row)`);

  // ── Step 2: Populate Layer-2 overlay columns on all four brackets ─────────
  // Executed after renames so WHERE clauses use the canonical catalog IDs.
  // SET is unconditional — idempotent on repeat run.

  await db.execute(sql`
    UPDATE icp_brackets
    SET default_exit_cap_rate            = ${SEED_OVERLAY_EXIT_CAP_BOUTIQUE_UPSCALE},
        default_refi_max_ltv_to_original = ${SEED_OVERLAY_REFI_LTV_STD}
    WHERE slug = 'boutique-upscale-hotel'
  `);

  await db.execute(sql`
    UPDATE icp_brackets
    SET default_exit_cap_rate            = ${SEED_OVERLAY_EXIT_CAP_SOFT_BRAND},
        default_refi_max_ltv_to_original = ${SEED_OVERLAY_REFI_LTV_STD}
    WHERE slug = 'soft-brand-boutique'
  `);

  await db.execute(sql`
    UPDATE icp_brackets
    SET default_exit_cap_rate            = ${SEED_OVERLAY_EXIT_CAP_STR_CLUSTER},
        default_refi_max_ltv_to_original = ${SEED_OVERLAY_REFI_LTV_STD}
    WHERE slug = 'performance-managed-str'
  `);

  await db.execute(sql`
    UPDATE icp_brackets
    SET default_exit_cap_rate            = ${SEED_OVERLAY_EXIT_CAP_AGRITOURISM},
        default_refi_max_ltv_to_original = ${SEED_OVERLAY_REFI_LTV_STD}
    WHERE slug = 'agritourism-experiential'
  `);

  logger.info(`${TAG} Layer-2 overlay values set on all 4 brackets`);
}
