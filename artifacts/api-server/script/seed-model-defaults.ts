/**
 * Seed `model_defaults` from the TypeScript canonical sources.
 *
 * Counterpart to `seed-model-constants.ts`. This script lands day-zero
 * Defaults rows for the Management Company tab of Model Defaults → Defaults,
 * following the card taxonomy in `docs/architecture/STEADY-STATE.md` §2.1
 * and the Q1/Q2/Q5 answers locked in §7.3 (pure DB-backed, universal at
 * MVP via nullable scope, analyst-proposes/admin-disposes).
 *
 * Idempotent: each row upserts on the uq_model_defaults_key_scope unique
 * constraint (defaultKey + four scope columns). Safe to re-run after
 * editing `shared/constants.ts`.
 *
 * Scope:
 *   - 7 cards on the Management Company tab
 *   - ~50 rows, all universal (country/subdivision/businessType/sizeBand NULL)
 *   - Property tab + engine wiring are handled in follow-on tasks
 *
 * Run:
 *   tsx script/seed-model-defaults.ts
 */

import { pathToFileURL } from "url";
import { resolve } from "path";
import { db } from "../src/db";
import { modelDefaults } from "@workspace/db";
import { DEFAULT_VRBO_BLENDED_PLATFORM_FEE_RATE, BUSINESS_MODEL_DEFAULTS } from "@shared/constants-business-models";
import {
  DEFAULT_MODEL_START_DATE,
  DEFAULT_COMPANY_OPS_START_DATE,
  DEFAULT_PROJECTION_YEARS,
  DEFAULT_CAPITAL_RAISE_1_DATE,
  DEFAULT_CAPITAL_RAISE_2_DATE,
  DEFAULT_LTV,
  DEFAULT_INTEREST_RATE,
  DEFAULT_TERM_YEARS,
  DEFAULT_REFI_LTV,
  DEFAULT_REFI_CLOSING_COST_RATE,
  DEFAULT_ACQ_CLOSING_COST_RATE,
  DEFAULT_REFI_PERIOD_YEARS,
  OPERATING_RESERVE_BUFFER,
  COMPANY_FUNDING_BUFFER,
  RESERVE_ROUNDING_INCREMENT,
  DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  DEFAULT_SERVICE_MARKUP,
  DEFAULT_SERVICE_MODEL,
  DEFAULT_SERVICE_FEE_CATEGORIES,
  DEFAULT_SERVICE_TEMPLATES,
  DEFAULT_STAFF_SALARY,
  DEFAULT_TRAVEL_COST_PER_CLIENT,
  DEFAULT_IT_LICENSE_PER_CLIENT,
  DEFAULT_EXIT_CAP_RATE,
  DEFAULT_PROPERTY_INCOME_TAX_RATE,
  DEFAULT_COMMISSION_RATE,
  DEFAULT_LAND_VALUE_PERCENT,
  SEED_EXIT_CAP_RATE_LUXURY,
} from "@shared/constants";
// SEED value — calibrated from HVS 2024 mid-market survey; see docs/runbooks/seed-calibration-2026-05-13.md
const SEED_ADR_GROWTH_RATE = 0.03;
import {
  DEFAULT_RUNWAY_BUFFER_MONTHS,
  DEFAULT_SIZING_OVERSHOOT_PCT,
  DEFAULT_REVENUE_RAMP_DELAY_MONTHS,
  DEFAULT_BURN_FLEX_DOWN_PCT,
  DEFAULT_REFI_MAX_LTV_TO_ORIGINAL,
} from "@shared/constants-funding";
import { getFactoryNumber } from "@shared/model-constants-registry";

// Audit #406: registry-backed US baseline for company income tax (federal corporate = 0.21).
const DEFAULT_COMPANY_TAX_RATE = getFactoryNumber("taxRate", "United States");

/**
 * SEED_ADR_BY_TIER — Calibrated per-tier ADR brackets for the starter portfolio seed.
 * Source: STR Global Supply & Demand Report Q4 2024 + HVS Hotel Development Cost Survey 2024.
 * Keys match DB canonical format (QUALITY_TIERS in lib/db/src/schema/properties.ts).
 * These are programmer-estimated starting points; Valentina will propose research-backed
 * replacements once the model_defaults Analyst pipeline is live.
 * Runbook: docs/runbooks/schema-migrations.md
 */
const SEED_ADR_BY_TIER = {
  luxury:         { min: 350, max: 500, default: 400 },
  upper_upscale:  { min: 250, max: 400, default: 300 },
  upscale:        { min: 180, max: 300, default: 220 },
  upper_midscale: { min: 130, max: 200, default: 160 },
  midscale:       { min: 90,  max: 150, default: 120 },
  economy:        { min: 60,  max: 100, default: 80  },
};

export interface SeedSpec {
  key: string;           // short key, prefix added below
  card: CardKey;
  value: unknown;
  unit: string | null;
  label: string;
  /**
   * Optional override for the `sub_tab` column. Defaults to "management_company"
   * when omitted. Used by the Funding Specialist cascade rows so they group under
   * sub_tab="funding" (per packet g1.5b-funding-cascade-a) while leaving the rest
   * of the management_company defaults under their existing sub_tab.
   */
  subTab?: string;
}

export type CardKey =
  | "setup"
  | "funding"
  | "revenue_model"
  | "compensation"
  | "overhead"
  | "tax_exit"
  | "property_defaults";

export const SPECS: SeedSpec[] = [
  // ── Setup ────────────────────────────────────────────────────────────
  { key: "modelStartDate",        card: "setup", value: DEFAULT_MODEL_START_DATE,       unit: "date",   label: "Model start date (t=0)" },
  { key: "companyOpsStartDate",   card: "setup", value: DEFAULT_COMPANY_OPS_START_DATE, unit: "date",   label: "Company operations start date" },
  { key: "projectionYears",       card: "setup", value: DEFAULT_PROJECTION_YEARS,       unit: "years",  label: "Projection horizon (years)" },
  { key: "companyInflationRate",  card: "setup", value: 0.03,                            unit: "%",      label: "Company-level cost inflation (annual)" },

  // ── Funding ──────────────────────────────────────────────────────────
  { key: "capitalRaise1Date",     card: "funding", value: DEFAULT_CAPITAL_RAISE_1_DATE,     unit: "date",   label: "First capital raise disbursement" },
  { key: "capitalRaise2Date",     card: "funding", value: DEFAULT_CAPITAL_RAISE_2_DATE,     unit: "date",   label: "Second capital raise disbursement" },
  { key: "ltv",                   card: "funding", value: DEFAULT_LTV,                      unit: "%",      label: "Acquisition loan LTV" },
  { key: "interestRate",          card: "funding", value: DEFAULT_INTEREST_RATE,            unit: "%",      label: "Acquisition loan interest rate" },
  { key: "termYears",             card: "funding", value: DEFAULT_TERM_YEARS,               unit: "years",  label: "Acquisition loan term" },
  { key: "acqClosingCostRate",    card: "funding", value: DEFAULT_ACQ_CLOSING_COST_RATE,    unit: "%",      label: "Acquisition closing cost rate" },
  { key: "refiLtv",               card: "funding", value: DEFAULT_REFI_LTV,                 unit: "%",      label: "Refinance LTV" },
  { key: "refiClosingCostRate",   card: "funding", value: DEFAULT_REFI_CLOSING_COST_RATE,   unit: "%",      label: "Refinance closing cost rate" },
  { key: "refiPeriodYears",       card: "funding", value: DEFAULT_REFI_PERIOD_YEARS,        unit: "years",  label: "Years until refinance" },
  { key: "operatingReserveBuffer",card: "funding", value: OPERATING_RESERVE_BUFFER,         unit: "$",      label: "Operating reserve buffer (per property)" },
  { key: "companyFundingBuffer",  card: "funding", value: COMPANY_FUNDING_BUFFER,           unit: "$",      label: "Company funding buffer" },
  { key: "reserveRoundingIncrement", card: "funding", value: RESERVE_ROUNDING_INCREMENT,    unit: "$",      label: "Reserve rounding increment" },

  // Funding Specialist required-field Defaults (per .claude/rules/inflation-cascade.md
  // and packet g1.5b-funding-cascade-a). Values sourced from named DEFAULT_* constants
  // in shared/constants-funding.ts — never literals. These rows live under
  // subTab="funding" so the Funding-tab admin query (`WHERE sub_tab='funding'`) and
  // the parity test can find them as a coherent group, distinct from the broader
  // management_company defaults.
  { key: "runwayBufferMonths",     card: "funding", subTab: "funding", value: DEFAULT_RUNWAY_BUFFER_MONTHS,     unit: "months", label: "Runway buffer" },
  { key: "sizingOvershootPct",     card: "funding", subTab: "funding", value: DEFAULT_SIZING_OVERSHOOT_PCT,     unit: "%",      label: "Sizing overshoot" },
  { key: "revenueRampDelayMonths", card: "funding", subTab: "funding", value: DEFAULT_REVENUE_RAMP_DELAY_MONTHS, unit: "months", label: "Revenue ramp delay" },
  { key: "burnFlexDownPct",        card: "funding", subTab: "funding", value: DEFAULT_BURN_FLEX_DOWN_PCT,        unit: "%",      label: "Burn flex-down %" },

  // Layer-1 universal default for the per-property refi-LTV-to-original cap.
  // Engine reads the per-property column (Layer 3); this row is the fallback
  // applied at POST /api/properties when no bracket overlay (Layer 2) supplies
  // a value. Plan 2026-05-13-001 R5/R7. Lives under the funding card alongside
  // the other refi knobs (refiLtv, refiClosingCostRate, refiPeriodYears).
  // subTab="funding" — joins the funding-cascade group above so the Funding-tab
  // admin query (`WHERE sub_tab='funding'`) and the parity test surface this
  // row as part of the cascade, not as a generic management_company default.
  { key: "refiMaxLtvToOriginal",   card: "funding", subTab: "funding", value: DEFAULT_REFI_MAX_LTV_TO_ORIGINAL, unit: "%", label: "Refinance LTV cap (% of original loan amount)" },

  // ── Revenue Model ────────────────────────────────────────────────────
  { key: "baseManagementFeeRate",       card: "revenue_model", value: DEFAULT_BASE_MANAGEMENT_FEE_RATE,      unit: "%",     label: "Base management fee (% of total revenue)" },
  { key: "incentiveManagementFeeRate",  card: "revenue_model", value: DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE, unit: "%",     label: "Incentive management fee (% of GOP)" },
  { key: "serviceMarkup",               card: "revenue_model", value: DEFAULT_SERVICE_MARKUP,                unit: "%",     label: "Default service markup on centralized costs" },
  { key: "serviceModel",                card: "revenue_model", value: DEFAULT_SERVICE_MODEL,                 unit: "enum",  label: "Default service model (centralized | direct)" },
  { key: "serviceFeeCategories",        card: "revenue_model", value: DEFAULT_SERVICE_FEE_CATEGORIES,        unit: "array", label: "Granular service fee category breakdown" },
  { key: "serviceTemplates",            card: "revenue_model", value: DEFAULT_SERVICE_TEMPLATES,             unit: "array", label: "Centralized service templates" },

  // ── Compensation ─────────────────────────────────────────────────────
  { key: "staffSalary",                 card: "compensation", value: DEFAULT_STAFF_SALARY,                   unit: "$",     label: "Default annual staff salary" },

  // ── Overhead ─────────────────────────────────────────────────────────
  { key: "officeLeaseStart",            card: "overhead", value: 36000,                                      unit: "$/yr",  label: "Office lease (year 1, annual)" },
  { key: "professionalServicesStart",   card: "overhead", value: 24000,                                      unit: "$/yr",  label: "Professional services (year 1)" },
  { key: "techInfraStart",              card: "overhead", value: 18000,                                      unit: "$/yr",  label: "Technology infrastructure (year 1)" },
  // SEED: AHLA per-property travel benchmarks 2024 — $12k/yr boutique mid-point.
  { key: "travelCostPerClient",         card: "overhead", value: 12_000,                                     unit: "$/yr",  label: "Travel cost per managed client" },
  // SEED: HFTP per-property tech-stack survey 2024 — $3k/yr PMS+channel+BI boutique.
  { key: "itLicensePerClient",          card: "overhead", value: 3_000,                                      unit: "$/yr",  label: "IT license cost per managed client" },
  { key: "marketingRate",               card: "overhead", value: 0.05,                                        unit: "%",     label: "Company-level marketing rate" },
  { key: "miscOpsRate",                 card: "overhead", value: 0.03,                                        unit: "%",     label: "Company-level miscellaneous ops rate" },
  { key: "businessInsuranceStart",      card: "overhead", value: 12000,                                      unit: "$/yr",  label: "Company business insurance (year 1)" },

  // ── Tax & Exit ───────────────────────────────────────────────────────
  { key: "companyTaxRate",              card: "tax_exit", value: DEFAULT_COMPANY_TAX_RATE,                   unit: "%",     label: "Company blended tax rate" },
  { key: "exitCapRate",                 card: "tax_exit", value: DEFAULT_EXIT_CAP_RATE,                      unit: "%",     label: "Default exit cap rate" },
  { key: "exitCapRateLuxury",           card: "tax_exit", value: SEED_EXIT_CAP_RATE_LUXURY,                  unit: "%",     label: "Exit cap rate — luxury tier seed (L+B)" },
  { key: "propertyIncomeTaxRate",       card: "tax_exit", value: DEFAULT_PROPERTY_INCOME_TAX_RATE,           unit: "%",     label: "Property income tax rate" },
  { key: "commissionRate",              card: "tax_exit", value: DEFAULT_COMMISSION_RATE,                    unit: "%",     label: "Exit sale commission rate" },
  { key: "landValuePercent",            card: "tax_exit", value: DEFAULT_LAND_VALUE_PERCENT,                 unit: "%",     label: "Land value as % of property cost" },

  // ── Property Defaults (MC-managed template for new properties) ───────
  { key: "roomCount",                   card: "property_defaults", value: BUSINESS_MODEL_DEFAULTS.hotel.roomCount, unit: "rooms",  label: "Default room count for new property" },
  { key: "startAdr",                    card: "property_defaults", value: 250,                               unit: "$",      label: "Starting ADR for new property" },
  { key: "adrByTier",                   card: "property_defaults", value: SEED_ADR_BY_TIER,                  unit: "json",   label: "ADR brackets by quality tier (min/max/default per tier)" },
  { key: "maxOccupancy",                card: "property_defaults", value: 0.85,                              unit: "%",      label: "Stabilized maximum occupancy" },
  { key: "startOccupancy",              card: "property_defaults", value: 0.55,                              unit: "%",      label: "Starting occupancy (month 1)" },
  { key: "adrGrowthRate",               card: "property_defaults", value: SEED_ADR_GROWTH_RATE,             unit: "%",      label: "Annual ADR growth rate" },
  { key: "stabilizationMonths",         card: "property_defaults", value: 36,                               unit: "months", label: "Months to stabilize" },
  { key: "occupancyRampMonths",         card: "property_defaults", value: 6,                                unit: "months", label: "Occupancy ramp duration" },
  { key: "occupancyGrowthStep",         card: "property_defaults", value: 0.05,                              unit: "%",      label: "Occupancy growth step per period" },
  { key: "propertyInflationRate",       card: "property_defaults", value: 0.03,                              unit: "%",      label: "Property-level cost inflation (annual)" },
  // STR platform fee — blended Airbnb 15.5% / VRBO 8% / Booking 15%.
  // Admin-visible reference value. The engine resolves this via
  // property.platformFeeRate ?? BUSINESS_MODEL_DEFAULTS[bm].platformFeeRate
  // (TS constant) — this DB row is dormant until a scoped overlay is wired.
  { key: "platformFeeRate",             card: "property_defaults", value: DEFAULT_VRBO_BLENDED_PLATFORM_FEE_RATE, unit: "%", label: "STR platform fee rate (Airbnb/VRBO/Booking blended)" },
];

export function toDefaultKey(card: CardKey, key: string): string {
  return `mc.${card}.${key}`;
}

export async function seedModelDefaults(opts: { silent?: boolean } = {}): Promise<{ upserted: number }> {
  const log = opts.silent ? () => {} : (msg: string) => console.log(msg);
  const insertedAt = new Date();
  const byCard = new Map<CardKey, number>();

  for (const spec of SPECS) {
    const defaultKey = toDefaultKey(spec.card, spec.key);

    await db
      .insert(modelDefaults)
      .values({
        defaultKey,
        category: "management_company",
        subTab: spec.subTab ?? "management_company",
        cardKey: spec.card,
        country: null,
        countrySubdivision: null,
        businessType: null,
        sizeBand: null,
        value: spec.value as never,
        unit: spec.unit,
        label: spec.label,
        lastSetSource: "seed",
        lastSetReason: "Initial migration from shared/constants.ts",
        lastSetAt: insertedAt,
      })
      .onConflictDoNothing();

    byCard.set(spec.card, (byCard.get(spec.card) ?? 0) + 1);
  }

  log(`\nSeeded ${SPECS.length} model_defaults rows (all universal scope):`);
  const order: CardKey[] = [
    "setup",
    "funding",
    "revenue_model",
    "compensation",
    "overhead",
    "tax_exit",
    "property_defaults",
  ];
  for (const card of order) {
    const n = byCard.get(card) ?? 0;
    log(`  ${card.padEnd(22)} ${n}`);
  }
  log("");

  return { upserted: SPECS.length };
}

// Only auto-run when invoked directly (`tsx script/seed-model-defaults.ts`).
// Tests import `SPECS` and `toDefaultKey` from this module
// (see tests/proof/defaults-drift.test.ts) and must not trigger the seed
// — doing so kicks off a DB write inside vitest and surfaces as an
// unhandled `process.exit(1)` rejection that pollutes the run.
//
// IMPORTANT: Do NOT use `import.meta.url === pathToFileURL(resolve(process.argv[1])).href`
// here. When esbuild bundles all modules into dist/index.mjs, every inlined
// module shares the same import.meta.url (the bundle entry point). That means
// the check evaluates to `true` when the server boots via `node dist/index.mjs`,
// firing seedModelDefaults().then(() => process.exit(0)) and killing the server.
// Checking process.argv[1] for the script's own filename is bundle-safe because
// argv[1] always reflects the actual file Node was told to execute.
const isDirectRun =
  Boolean(process.argv[1]) &&
  /seed-model-defaults\.[jt]s(x?)$/.test(process.argv[1]);

if (isDirectRun) {
  seedModelDefaults()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error("Seed failed:", err);
      process.exit(1);
    });
}
