/**
 * properties-demo-seed-overrides-001 — U1 demo property exit-cap calibration
 *
 * Plan 2026-05-13-001 Unit 1 (feat seed-calibration-bracket-defaults-and-irr-views).
 *
 * Sets calibrated exit_cap_rate per-entity values on the 6 INITIAL demo
 * properties and the Medellin Duplex. Also corrects Duplex max_occupancy.
 *
 * These are Layer-3 per-entity overrides that reflect the intended IRR target
 * band (28–38% for the demo portfolio). They replace seed constants that were
 * either under-benchmarked (US Catskill boutiques seeded at 8.0–8.5%) or
 * under-priced for country risk (Colombia hacienda at 9.0%).
 *
 * Property-by-property rationale:
 *
 *   Belleayre Mountain / Loch Sheldrake / Lakeview Haven Lodge / Scott's House
 *     → 9.75%  US tertiary boutique resort tier; PwC/CBRE/HVS 2025 H2 going-in
 *               + 75bp terminal spread; Catskills/Adirondacks/Northeast mountain market
 *
 *   Jano Grande Ranch
 *     → 12.00%  LatAm rural/illiquid hacienda; Colombia country-risk premium
 *                + illiquidity discount; HVS Latin America 2024 + 200bp spread
 *
 *   San Diego (Cartagena)
 *     → 10.50%  LatAm prime urban boutique; Caribbean historic-core premium;
 *                CBRE Colombia prime coastal Q4 2024 + 50bp terminal
 *
 *   Medellin Duplex — exit_cap_rate
 *     →  7.50%  exception: package-sale to LP / trophy buyer; El Poblado prime
 *                residential-hospitality; confirmed strategic override per plan R1
 *
 *   Medellin Duplex — max_occupancy
 *     →  0.30   AirDNA Q1-2026 El Poblado top-decile 2BR STR occupancy ceiling;
 *                confirmed strategic override per plan R1
 *
 * Scope: INITIAL_PROPERTIES + Duplex only. SYNC_PROPERTIES (Hudson Estate,
 * Eden Summit, Austin Hillside, Casa Medellín, Blue Ridge Manor) carry
 * independent pipeline assumptions and are intentionally excluded.
 *
 * Idempotent: WHERE clauses match on property name; re-running sets the
 * same values. Source: Plan 2026-05-13-001 U1 table.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";

const TAG = "[migration] properties-demo-seed-overrides-001";

// ── Per-entity seed overrides (SEED_* per CLAUDE.md §2 taxonomy rule) ───────
// US tertiary boutique resort tier: PwC/CBRE/HVS 2025 H2 going-in + 75bp terminal
const SEED_DEMO_EXIT_CAP_US_TERTIARY_RESORT = 0.0975;
// LatAm rural/illiquid hacienda: Colombia country-risk + illiquidity; HVS LatAm 2024 + 200bp
const SEED_DEMO_EXIT_CAP_LATAM_RURAL = 0.12;
// LatAm prime urban boutique: CBRE Colombia prime coastal Q4 2024 + 50bp terminal
const SEED_DEMO_EXIT_CAP_LATAM_PRIME_URBAN = 0.105;
// Medellin Duplex: LP package-sale / trophy buyer exception; El Poblado prime residential-hospitality
const SEED_DEMO_EXIT_CAP_DUPLEX = 0.075;
// Medellin Duplex: AirDNA Q1-2026 El Poblado top-decile 2BR STR occupancy ceiling
const SEED_DEMO_MAX_OCC_DUPLEX = 0.30;

export async function runPropertiesDemoSeedOverrides001(): Promise<void> {
  logger.info(`${TAG} Applying U1 calibrated exit_cap_rate overrides to 7 demo properties`);

  // ── US tertiary boutique resort (4 properties) ───────────────────────────
  const usResort = await db.execute(sql`
    UPDATE properties
    SET exit_cap_rate = ${SEED_DEMO_EXIT_CAP_US_TERTIARY_RESORT}
    WHERE name IN ('Belleayre Mountain', 'Loch Sheldrake', 'Lakeview Haven Lodge', 'Scott''s House')
  `);
  logger.info(`${TAG} US tertiary resort exit cap → ${SEED_DEMO_EXIT_CAP_US_TERTIARY_RESORT} (${(usResort as { rowCount?: number }).rowCount ?? 0} rows)`);

  // ── LatAm rural / illiquid (Jano Grande Ranch) ───────────────────────────
  const latamRural = await db.execute(sql`
    UPDATE properties
    SET exit_cap_rate = ${SEED_DEMO_EXIT_CAP_LATAM_RURAL}
    WHERE name = 'Jano Grande Ranch'
  `);
  logger.info(`${TAG} Jano Grande Ranch exit cap → ${SEED_DEMO_EXIT_CAP_LATAM_RURAL} (${(latamRural as { rowCount?: number }).rowCount ?? 0} row)`);

  // ── LatAm prime urban boutique (San Diego / Cartagena) ───────────────────
  const latamUrban = await db.execute(sql`
    UPDATE properties
    SET exit_cap_rate = ${SEED_DEMO_EXIT_CAP_LATAM_PRIME_URBAN}
    WHERE name = 'San Diego'
  `);
  logger.info(`${TAG} San Diego (Cartagena) exit cap → ${SEED_DEMO_EXIT_CAP_LATAM_PRIME_URBAN} (${(latamUrban as { rowCount?: number }).rowCount ?? 0} row)`);

  // ── Medellin Duplex — exit cap + max occupancy (strategic overrides) ──────
  const duplex = await db.execute(sql`
    UPDATE properties
    SET exit_cap_rate = ${SEED_DEMO_EXIT_CAP_DUPLEX},
        max_occupancy = ${SEED_DEMO_MAX_OCC_DUPLEX}
    WHERE name = 'Medellin Duplex'
  `);
  logger.info(`${TAG} Medellin Duplex exit_cap → ${SEED_DEMO_EXIT_CAP_DUPLEX}, max_occ → ${SEED_DEMO_MAX_OCC_DUPLEX} (${(duplex as { rowCount?: number }).rowCount ?? 0} row)`);
}
