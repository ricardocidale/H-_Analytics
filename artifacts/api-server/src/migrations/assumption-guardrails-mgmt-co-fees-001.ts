/**
 * assumption-guardrails-mgmt-co-fees-001 — Seed assumption guardrails for
 * management company and brand fee columns.
 *
 * Runtime-only migration (no SQL file — no journal entry). Inserts guardrail
 * rows for the 7 fee columns surfaced by the mgmt-co fee cascade. All
 * assumption_key values match the property column names used by the engine.
 *
 * Idempotent: ON CONFLICT (assumption_key) DO NOTHING.
 *
 * SEED_* constants carry source citations per CLAUDE.md §1 — bootstrap-only;
 * never imported by runtime code.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] assumption-guardrails-mgmt-co-fees-001";

// ── Management company fee guardrails ─────────────────────────────────────────
// Source: HVS 2024 Hotel Management Agreement Survey (typical range across
// full-service, upscale, and boutique independent segments)
const SEED_GUARDRAIL_BASE_MGMT_LOW  = 0.05;
const SEED_GUARDRAIL_BASE_MGMT_HIGH = 0.15;

const SEED_GUARDRAIL_INCENTIVE_LOW  = 0.06;
const SEED_GUARDRAIL_INCENTIVE_HIGH = 0.18;

// ── Brand fee guardrails ───────────────────────────────────────────────────────
// Source: CBRE Hotels 2024 Franchise Fee Survey (upscale soft-flag segment)
const SEED_GUARDRAIL_ROYALTY_LOW  = 0.03;
const SEED_GUARDRAIL_ROYALTY_HIGH = 0.09;

const SEED_GUARDRAIL_BRAND_MARKETING_LOW  = 0.01;
const SEED_GUARDRAIL_BRAND_MARKETING_HIGH = 0.04;

const SEED_GUARDRAIL_LOYALTY_LOW  = 0.002;
const SEED_GUARDRAIL_LOYALTY_HIGH = 0.012;

const SEED_GUARDRAIL_RESERVATION_LOW  = 0.005;
const SEED_GUARDRAIL_RESERVATION_HIGH = 0.02;

const SEED_GUARDRAIL_BRAND_TECH_LOW  = 0.002;
const SEED_GUARDRAIL_BRAND_TECH_HIGH = 0.01;

export async function runAssumptionGuardrailsMgmtCoFees001(): Promise<void> {
  logger.info(`${TAG} Seeding assumption guardrails for mgmt co + brand fee columns`);

  await db.execute(sql`
    INSERT INTO "assumption_guardrails"
      ("assumption_key", "low", "high", "unit", "rationale", "source")
    VALUES
      (
        'mgmt_co_fee.base_mgmt',
        ${SEED_GUARDRAIL_BASE_MGMT_LOW},
        ${SEED_GUARDRAIL_BASE_MGMT_HIGH},
        'fraction',
        'Base management fee as % of gross revenue for hotel and STR properties',
        'HVS 2024 Hotel Management Agreement Survey'
      ),
      (
        'mgmt_co_fee.incentive',
        ${SEED_GUARDRAIL_INCENTIVE_LOW},
        ${SEED_GUARDRAIL_INCENTIVE_HIGH},
        'fraction',
        'Incentive management fee as % of GOP; tier triggers above breakeven',
        'HVS 2024 Hotel Management Agreement Survey'
      ),
      (
        'brand_fee.royalty',
        ${SEED_GUARDRAIL_ROYALTY_LOW},
        ${SEED_GUARDRAIL_ROYALTY_HIGH},
        'fraction',
        'Brand royalty fee as % of gross revenue; varies by flag tier and brand strength',
        'CBRE Hotels 2024 Franchise Fee Survey'
      ),
      (
        'brand_fee.brand_marketing',
        ${SEED_GUARDRAIL_BRAND_MARKETING_LOW},
        ${SEED_GUARDRAIL_BRAND_MARKETING_HIGH},
        'fraction',
        'Brand marketing program contribution as % of gross revenue',
        'CBRE Hotels 2024 Franchise Fee Survey'
      ),
      (
        'brand_fee.loyalty',
        ${SEED_GUARDRAIL_LOYALTY_LOW},
        ${SEED_GUARDRAIL_LOYALTY_HIGH},
        'fraction',
        'Loyalty program fee as % of gross revenue for participating branded hotels',
        'CBRE Hotels 2024 Franchise Fee Survey'
      ),
      (
        'brand_fee.reservation',
        ${SEED_GUARDRAIL_RESERVATION_LOW},
        ${SEED_GUARDRAIL_RESERVATION_HIGH},
        'fraction',
        'Central reservations fee as % of gross revenue (brand-operated booking channels)',
        'CBRE Hotels 2024 Franchise Fee Survey'
      ),
      (
        'brand_fee.brand_tech',
        ${SEED_GUARDRAIL_BRAND_TECH_LOW},
        ${SEED_GUARDRAIL_BRAND_TECH_HIGH},
        'fraction',
        'Brand technology fee as % of gross revenue (PMS, CRS, digital tools)',
        'CBRE Hotels 2024 Franchise Fee Survey'
      )
    ON CONFLICT ("assumption_key") DO NOTHING
  `);

  logger.info(`${TAG} Guardrail rows seeded (7 rows, ON CONFLICT DO NOTHING)`);
}
