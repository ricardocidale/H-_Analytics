/**
 * sync-property-assumptions-001 — Backfills optimized financial assumptions
 * for all canonical seed properties.
 *
 * Matches rows by name. Uses UPDATE ... WHERE name = '...' so it is safe to
 * run on any DB state: rows that don't exist yet are silently skipped (0
 * rows updated), and rows that already have the correct values are no-ops.
 *
 * The authoritative source of these values is
 * `src/seeds/property-data.ts` — this migration snapshots that file's
 * intent into the DB so that Replit (and any environment where seedProperties()
 * never ran because rows already existed) gets the same numbers.
 *
 * Resolved values for SEED_SYNC_PROPERTIES incorporate SEED_PROPERTY_DEFAULTS:
 *   costRateRooms=0.20, costRateAdmin=0.08, costRateMarketing=0.01,
 *   costRatePropertyOps=0.04, costRateUtilities=0.05, costRateTaxes=0.012,
 *   costRateFFE=0.04, costRateOther=0.05, revShareFB=0.30, revShareOther=0.03,
 *   taxRate=0.25, stabilizationMonths=36
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";
import { SEED_MEDELLIN_DUPLEX_START_ADR } from "@shared/constants";

const TAG = "[migration] sync-property-assumptions-001";

interface PropertyAssumptions {
  name: string;
  startAdr: number;
  adrGrowthRate: number;
  startOccupancy: number;
  maxOccupancy: number;
  occupancyRampMonths: number;
  stabilizationMonths: number;
  occupancyGrowthStep: number;
  purchasePrice: number;
  buildingImprovements: number;
  preOpeningCosts: number;
  operatingReserve: number;
  roomCount: number;
  costRateRooms: number;
  costRateFB: number;
  costRateAdmin: number;
  costRateMarketing: number;
  costRatePropertyOps: number;
  costRateUtilities: number;
  costRateTaxes: number;
  costRateIT: number;
  costRateFFE: number;
  costRateOther: number;
  revShareEvents: number;
  revShareFB: number;
  revShareOther: number;
  cateringBoostPercent: number;
  exitCapRate: number;
  taxRate: number;
  type: string;
  willRefinance?: string | null;
  refinanceLtv?: number | null;
  refinanceInterestRate?: number | null;
  refinanceTermYears?: number | null;
  refinanceClosingCostRate?: number | null;
  acquisitionLtv?: number | null;
  acquisitionInterestRate?: number | null;
  acquisitionTermYears?: number | null;
  acquisitionClosingCostRate?: number | null;
  businessModel?: string | null;
  hospitalityType?: string | null;
  baseManagementFeeRate?: number | null;
  incentiveManagementFeeRate?: number | null;
  platformFeeRate?: number | null;
  costRateInsurance?: number | null;
}

// Fully-resolved values per src/seeds/property-data.ts (property-specific
// overrides applied on top of SEED_PROPERTY_DEFAULTS / SEED_INITIAL_PROPERTIES).
const PROPERTY_ASSUMPTIONS: PropertyAssumptions[] = [
  // ── SEED_INITIAL_PROPERTIES (portfolio properties with hand-tuned assumptions)
  {
    name: "Jano Grande Ranch",
    startAdr: 250, adrGrowthRate: 0.035,
    startOccupancy: 0.30, maxOccupancy: 0.72, occupancyRampMonths: 12, stabilizationMonths: 36, occupancyGrowthStep: 0.05,
    purchasePrice: 1200000, buildingImprovements: 400000, preOpeningCosts: 150000, operatingReserve: 300000, roomCount: 8,
    costRateRooms: 0.17, costRateFB: 0.10, costRateAdmin: 0.06, costRateMarketing: 0.015,
    costRatePropertyOps: 0.05, costRateUtilities: 0.04, costRateTaxes: 0.016,
    costRateIT: 0.005, costRateFFE: 0.04, costRateOther: 0.05,
    revShareEvents: 0.30, revShareFB: 0.25, revShareOther: 0.08, cateringBoostPercent: 0.25,
    exitCapRate: 0.10, taxRate: 0.35,
    type: "Full Equity", willRefinance: "Yes",
    refinanceLtv: 0.75, refinanceInterestRate: 0.09, refinanceTermYears: 25, refinanceClosingCostRate: 0.03,
    baseManagementFeeRate: 0.085, incentiveManagementFeeRate: 0.12,
  },
  {
    name: "Loch Sheldrake",
    startAdr: 280, adrGrowthRate: 0.035,
    startOccupancy: 0.50, maxOccupancy: 0.68, occupancyRampMonths: 4, stabilizationMonths: 18, occupancyGrowthStep: 0.05,
    purchasePrice: 3000000, buildingImprovements: 1000000, preOpeningCosts: 150000, operatingReserve: 400000, roomCount: 20,
    costRateRooms: 0.19, costRateFB: 0.09, costRateAdmin: 0.07, costRateMarketing: 0.02,
    costRatePropertyOps: 0.055, costRateUtilities: 0.055, costRateTaxes: 0.035,
    costRateIT: 0.005, costRateFFE: 0.04, costRateOther: 0.04,
    revShareEvents: 0.35, revShareFB: 0.25, revShareOther: 0.08, cateringBoostPercent: 0.22,
    exitCapRate: 0.09, taxRate: 0.25,
    type: "Full Equity", willRefinance: "Yes",
    refinanceLtv: 0.75, refinanceInterestRate: 0.09, refinanceTermYears: 25, refinanceClosingCostRate: 0.03,
    baseManagementFeeRate: 0.085, incentiveManagementFeeRate: 0.12,
  },
  {
    name: "Belleayre Mountain",
    startAdr: 320, adrGrowthRate: 0.035,
    startOccupancy: 0.40, maxOccupancy: 0.68, occupancyRampMonths: 12, stabilizationMonths: 36, occupancyGrowthStep: 0.05,
    purchasePrice: 3500000, buildingImprovements: 800000, preOpeningCosts: 250000, operatingReserve: 500000, roomCount: 20,
    costRateRooms: 0.20, costRateFB: 0.09, costRateAdmin: 0.08, costRateMarketing: 0.02,
    costRatePropertyOps: 0.06, costRateUtilities: 0.055, costRateTaxes: 0.035,
    costRateIT: 0.005, costRateFFE: 0.04, costRateOther: 0.04,
    revShareEvents: 0.30, revShareFB: 0.28, revShareOther: 0.07, cateringBoostPercent: 0.20,
    exitCapRate: 0.085, taxRate: 0.25,
    type: "Full Equity", willRefinance: "Yes",
    refinanceLtv: 0.75, refinanceInterestRate: 0.09, refinanceTermYears: 25, refinanceClosingCostRate: 0.03,
    baseManagementFeeRate: 0.085, incentiveManagementFeeRate: 0.12,
  },
  {
    name: "Scott's House",
    startAdr: 350, adrGrowthRate: 0.03,
    startOccupancy: 0.45, maxOccupancy: 0.65, occupancyRampMonths: 6, stabilizationMonths: 24, occupancyGrowthStep: 0.05,
    purchasePrice: 3200000, buildingImprovements: 800000, preOpeningCosts: 200000, operatingReserve: 400000, roomCount: 20,
    costRateRooms: 0.20, costRateFB: 0.08, costRateAdmin: 0.07, costRateMarketing: 0.02,
    costRatePropertyOps: 0.05, costRateUtilities: 0.05, costRateTaxes: 0.02,
    costRateIT: 0.005, costRateFFE: 0.04, costRateOther: 0.04,
    revShareEvents: 0.30, revShareFB: 0.20, revShareOther: 0.08, cateringBoostPercent: 0.20,
    exitCapRate: 0.085, taxRate: 0.22,
    type: "Financed",
    acquisitionLtv: 0.60, acquisitionInterestRate: 0.07, acquisitionTermYears: 25, acquisitionClosingCostRate: 0.025,
    baseManagementFeeRate: 0.085, incentiveManagementFeeRate: 0.12,
  },
  {
    name: "Lakeview Haven Lodge",
    startAdr: 450, adrGrowthRate: 0.03,
    startOccupancy: 0.50, maxOccupancy: 0.70, occupancyRampMonths: 3, stabilizationMonths: 18, occupancyGrowthStep: 0.05,
    purchasePrice: 3800000, buildingImprovements: 1500000, preOpeningCosts: 250000, operatingReserve: 500000, roomCount: 14,
    costRateRooms: 0.20, costRateFB: 0.09, costRateAdmin: 0.07, costRateMarketing: 0.02,
    costRatePropertyOps: 0.055, costRateUtilities: 0.05, costRateTaxes: 0.02,
    costRateIT: 0.005, costRateFFE: 0.04, costRateOther: 0.04,
    revShareEvents: 0.15, revShareFB: 0.25, revShareOther: 0.05, cateringBoostPercent: 0.15,
    exitCapRate: 0.08, taxRate: 0.22,
    type: "Financed",
    acquisitionLtv: 0.65, acquisitionInterestRate: 0.07, acquisitionTermYears: 25, acquisitionClosingCostRate: 0.025,
    baseManagementFeeRate: 0.085, incentiveManagementFeeRate: 0.12,
  },
  {
    name: "San Diego",
    startAdr: 240, adrGrowthRate: 0.035,
    startOccupancy: 0.42, maxOccupancy: 0.72, occupancyRampMonths: 10, stabilizationMonths: 36, occupancyGrowthStep: 0.05,
    purchasePrice: 2000000, buildingImprovements: 1000000, preOpeningCosts: 250000, operatingReserve: 500000, roomCount: 20,
    costRateRooms: 0.17, costRateFB: 0.09, costRateAdmin: 0.07, costRateMarketing: 0.015,
    costRatePropertyOps: 0.035, costRateUtilities: 0.04, costRateTaxes: 0.025,
    costRateIT: 0.005, costRateFFE: 0.04, costRateOther: 0.04,
    revShareEvents: 0.30, revShareFB: 0.24, revShareOther: 0.06, cateringBoostPercent: 0.20,
    exitCapRate: 0.09, taxRate: 0.35,
    type: "Financed",
    acquisitionLtv: 0.60, acquisitionInterestRate: 0.095, acquisitionTermYears: 25, acquisitionClosingCostRate: 0.02,
    baseManagementFeeRate: 0.085, incentiveManagementFeeRate: 0.12,
  },
  // ── SEED_MEDELLIN_DUPLEX (vrbo_owner_managed — distinct cost model)
  // Task #931: ADR/maxOccupancy/exitCapRate uplifted to clear 20% LP-credible IRR
  // floor on a stand-alone basis. See SEED_MEDELLIN_DUPLEX block in
  // src/seeds/property-data.ts for sourced rationale (AirDNA Q1-2026 El Poblado
  // luxury STR comp set + Galería Inmobiliaria / Fedelonjas Q4-2025 stratum 6
  // residential cap rates).
  {
    name: "Medellin Duplex",
    startAdr: SEED_MEDELLIN_DUPLEX_START_ADR, adrGrowthRate: 0.04,
    startOccupancy: 0.30, maxOccupancy: 0.65, occupancyRampMonths: 4, stabilizationMonths: 12, occupancyGrowthStep: 0.04,
    purchasePrice: 800000, buildingImprovements: 150000, preOpeningCosts: 15000, operatingReserve: 60000, roomCount: 1,
    costRateRooms: 0.06, costRateFB: 0, costRateAdmin: 0, costRateMarketing: 0,
    costRatePropertyOps: 0.04, costRateUtilities: 0.04, costRateTaxes: 0.018,
    costRateIT: 0, costRateFFE: 0.03, costRateOther: 0, costRateInsurance: 0.025,
    revShareEvents: 0, revShareFB: 0, revShareOther: 0, cateringBoostPercent: 0,
    exitCapRate: 0.06, taxRate: 0.35,
    type: "Full Equity", willRefinance: "No",
    businessModel: "vrbo_owner_managed", hospitalityType: "extended_stay",
    baseManagementFeeRate: 0.10, incentiveManagementFeeRate: 0, platformFeeRate: 0.14,
  },
  // ── SEED_SYNC_PROPERTIES (pipeline properties — defaults + per-property overrides)
  // Unoverridden fields use SEED_PROPERTY_DEFAULTS resolved values.
  {
    name: "The Hudson Estate",
    startAdr: 385, adrGrowthRate: 0.025,
    startOccupancy: 0.55, maxOccupancy: 0.82, occupancyRampMonths: 6, stabilizationMonths: 36, occupancyGrowthStep: 0.05,
    purchasePrice: 3800000, buildingImprovements: 1200000, preOpeningCosts: 200000, operatingReserve: 250000, roomCount: 20,
    costRateRooms: 0.20, costRateFB: 0.085, costRateAdmin: 0.08, costRateMarketing: 0.01,
    costRatePropertyOps: 0.04, costRateUtilities: 0.05, costRateTaxes: 0.012,
    costRateIT: 0.005, costRateFFE: 0.04, costRateOther: 0.05,
    revShareEvents: 0.30, revShareFB: 0.30, revShareOther: 0.03, cateringBoostPercent: 0.22,
    exitCapRate: 0.08, taxRate: 0.25,
    type: "Full Equity", willRefinance: "Yes",
    refinanceLtv: 0.75, refinanceInterestRate: 0.09, refinanceTermYears: 25, refinanceClosingCostRate: 0.03,
    baseManagementFeeRate: 0.085, incentiveManagementFeeRate: 0.12,
  },
  {
    name: "Eden Summit Lodge",
    startAdr: 425, adrGrowthRate: 0.025,
    startOccupancy: 0.50, maxOccupancy: 0.80, occupancyRampMonths: 6, stabilizationMonths: 36, occupancyGrowthStep: 0.05,
    purchasePrice: 4000000, buildingImprovements: 1200000, preOpeningCosts: 200000, operatingReserve: 250000, roomCount: 20,
    costRateRooms: 0.20, costRateFB: 0.085, costRateAdmin: 0.08, costRateMarketing: 0.01,
    costRatePropertyOps: 0.04, costRateUtilities: 0.05, costRateTaxes: 0.012,
    costRateIT: 0.005, costRateFFE: 0.04, costRateOther: 0.05,
    revShareEvents: 0.30, revShareFB: 0.30, revShareOther: 0.03, cateringBoostPercent: 0.25,
    exitCapRate: 0.085, taxRate: 0.22,
    type: "Full Equity", willRefinance: "Yes",
    refinanceLtv: 0.75, refinanceInterestRate: 0.09, refinanceTermYears: 25, refinanceClosingCostRate: 0.03,
    baseManagementFeeRate: 0.085, incentiveManagementFeeRate: 0.12,
  },
  {
    name: "Austin Hillside",
    startAdr: 320, adrGrowthRate: 0.025,
    startOccupancy: 0.55, maxOccupancy: 0.82, occupancyRampMonths: 6, stabilizationMonths: 36, occupancyGrowthStep: 0.05,
    purchasePrice: 3500000, buildingImprovements: 1100000, preOpeningCosts: 200000, operatingReserve: 250000, roomCount: 20,
    costRateRooms: 0.20, costRateFB: 0.09, costRateAdmin: 0.08, costRateMarketing: 0.01,
    costRatePropertyOps: 0.04, costRateUtilities: 0.05, costRateTaxes: 0.012,
    costRateIT: 0.005, costRateFFE: 0.04, costRateOther: 0.05,
    revShareEvents: 0.28, revShareFB: 0.30, revShareOther: 0.03, cateringBoostPercent: 0.20,
    exitCapRate: 0.085, taxRate: 0.22,
    type: "Full Equity", willRefinance: "Yes",
    refinanceLtv: 0.75, refinanceInterestRate: 0.09, refinanceTermYears: 25, refinanceClosingCostRate: 0.03,
    baseManagementFeeRate: 0.085, incentiveManagementFeeRate: 0.12,
  },
  {
    name: "Casa Medellín",
    startAdr: 210, adrGrowthRate: 0.04,
    startOccupancy: 0.50, maxOccupancy: 0.78, occupancyRampMonths: 6, stabilizationMonths: 36, occupancyGrowthStep: 0.05,
    purchasePrice: 3800000, buildingImprovements: 1000000, preOpeningCosts: 200000, operatingReserve: 600000, roomCount: 30,
    costRateRooms: 0.20, costRateFB: 0.075, costRateAdmin: 0.08, costRateMarketing: 0.01,
    costRatePropertyOps: 0.04, costRateUtilities: 0.05, costRateTaxes: 0.012,
    costRateIT: 0.005, costRateFFE: 0.04, costRateOther: 0.05,
    revShareEvents: 0.25, revShareFB: 0.30, revShareOther: 0.03, cateringBoostPercent: 0.18,
    exitCapRate: 0.095, taxRate: 0.25,
    type: "Financed",
    acquisitionLtv: 0.60, acquisitionInterestRate: 0.095, acquisitionTermYears: 25, acquisitionClosingCostRate: 0.02,
    baseManagementFeeRate: 0.085, incentiveManagementFeeRate: 0.12,
  },
  {
    name: "Blue Ridge Manor",
    startAdr: 375, adrGrowthRate: 0.025,
    startOccupancy: 0.50, maxOccupancy: 0.80, occupancyRampMonths: 6, stabilizationMonths: 36, occupancyGrowthStep: 0.05,
    purchasePrice: 6000000, buildingImprovements: 1500000, preOpeningCosts: 250000, operatingReserve: 500000, roomCount: 30,
    costRateRooms: 0.20, costRateFB: 0.10, costRateAdmin: 0.08, costRateMarketing: 0.01,
    costRatePropertyOps: 0.04, costRateUtilities: 0.05, costRateTaxes: 0.012,
    costRateIT: 0.005, costRateFFE: 0.04, costRateOther: 0.05,
    revShareEvents: 0.28, revShareFB: 0.30, revShareOther: 0.03, cateringBoostPercent: 0.25,
    exitCapRate: 0.09, taxRate: 0.25,
    type: "Financed",
    acquisitionLtv: 0.60, acquisitionInterestRate: 0.09, acquisitionTermYears: 25, acquisitionClosingCostRate: 0.02,
    baseManagementFeeRate: 0.085, incentiveManagementFeeRate: 0.12,
  },
];

export async function runSyncPropertyAssumptions001(): Promise<void> {
  let updated = 0;
  let skipped = 0;

  for (const p of PROPERTY_ASSUMPTIONS) {
    try {
      const result = await db.execute(sql`
        UPDATE properties SET
          start_adr                     = ${p.startAdr},
          adr_growth_rate               = ${p.adrGrowthRate},
          start_occupancy               = ${p.startOccupancy},
          max_occupancy                 = ${p.maxOccupancy},
          occupancy_ramp_months         = ${p.occupancyRampMonths},
          stabilization_months          = ${p.stabilizationMonths},
          occupancy_growth_step         = ${p.occupancyGrowthStep},
          purchase_price                = ${p.purchasePrice},
          building_improvements         = ${p.buildingImprovements},
          pre_opening_costs             = ${p.preOpeningCosts},
          operating_reserve             = ${p.operatingReserve},
          room_count                    = ${p.roomCount},
          cost_rate_rooms               = ${p.costRateRooms},
          cost_rate_fb                  = ${p.costRateFB},
          cost_rate_admin               = ${p.costRateAdmin},
          cost_rate_marketing           = ${p.costRateMarketing},
          cost_rate_property_ops        = ${p.costRatePropertyOps},
          cost_rate_utilities           = ${p.costRateUtilities},
          cost_rate_taxes               = ${p.costRateTaxes},
          cost_rate_it                  = ${p.costRateIT},
          cost_rate_ffe                 = ${p.costRateFFE},
          cost_rate_other               = ${p.costRateOther},
          rev_share_events              = ${p.revShareEvents},
          rev_share_fb                  = ${p.revShareFB},
          rev_share_other               = ${p.revShareOther},
          catering_boost_percent        = ${p.cateringBoostPercent},
          exit_cap_rate                 = ${p.exitCapRate},
          tax_rate                      = ${p.taxRate},
          type                          = ${p.type},
          will_refinance                = ${p.willRefinance ?? null},
          refinance_ltv                 = ${p.refinanceLtv ?? null},
          refinance_interest_rate       = ${p.refinanceInterestRate ?? null},
          refinance_term_years          = ${p.refinanceTermYears ?? null},
          refinance_closing_cost_rate   = ${p.refinanceClosingCostRate ?? null},
          acquisition_ltv               = ${p.acquisitionLtv ?? null},
          acquisition_interest_rate     = ${p.acquisitionInterestRate ?? null},
          acquisition_term_years        = ${p.acquisitionTermYears ?? null},
          acquisition_closing_cost_rate = ${p.acquisitionClosingCostRate ?? null},
          base_management_fee_rate      = ${p.baseManagementFeeRate ?? null},
          incentive_management_fee_rate = ${p.incentiveManagementFeeRate ?? null},
          platform_fee_rate             = ${p.platformFeeRate ?? null},
          cost_rate_insurance           = ${p.costRateInsurance ?? null},
          business_model                = COALESCE(${p.businessModel ?? null}, business_model),
          hospitality_type              = COALESCE(${p.hospitalityType ?? null}, hospitality_type)
        WHERE name = ${p.name}
      `);

      const rows = (result as { rowCount?: number }).rowCount ?? 0;
      if (rows > 0) {
        updated += rows;
        logger.info(`${TAG} updated "${p.name}" (${rows} row)`, "migrations");
      } else {
        skipped++;
        logger.info(`${TAG} "${p.name}" not found in DB — skipped`, "migrations");
      }
    } catch (err) {
      logger.warn(`${TAG} failed for "${p.name}": ${err}`, "migrations");
    }
  }

  logger.info(`${TAG} done — ${updated} updated, ${skipped} not found`, "migrations");
}
