/**
 * Seed `model_defaults` from the TypeScript canonical sources.
 *
 * Counterpart to `seed-model-constants.ts`. This script lands day-zero
 * Defaults rows for the Management Company tab of Steady State → Defaults,
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

import { sql } from "drizzle-orm";
import { db } from "../server/db";
import { modelDefaults } from "../shared/schema";
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
  DEFAULT_OFFICE_LEASE_START,
  DEFAULT_PROFESSIONAL_SERVICES_START,
  DEFAULT_TECH_INFRA_START,
  DEFAULT_TRAVEL_COST_PER_CLIENT,
  DEFAULT_IT_LICENSE_PER_CLIENT,
  DEFAULT_MARKETING_RATE,
  DEFAULT_MISC_OPS_RATE,
  DEFAULT_BUSINESS_INSURANCE_START,
  DEFAULT_EXIT_CAP_RATE,
  DEFAULT_PROPERTY_INCOME_TAX_RATE,
  DEFAULT_COMMISSION_RATE,
  DEFAULT_LAND_VALUE_PERCENT,
  SEED_EXIT_CAP_RATE_LUXURY,
  DEFAULT_ROOM_COUNT,
  DEFAULT_START_ADR,
  DEFAULT_MAX_OCCUPANCY,
  DEFAULT_ADR_GROWTH_RATE,
  DEFAULT_START_OCCUPANCY,
  DEFAULT_STABILIZATION_MONTHS,
  DEFAULT_OCCUPANCY_RAMP_MONTHS,
  DEFAULT_OCCUPANCY_GROWTH_STEP,
  DEFAULT_PROPERTY_INFLATION_RATE,
  DEFAULT_COMPANY_INFLATION_RATE,
} from "../shared/constants";
import { getFactoryNumber } from "../shared/model-constants-registry";

// Audit #406: registry-backed US baseline for company income tax (federal corporate = 0.21).
const DEFAULT_COMPANY_TAX_RATE = getFactoryNumber("taxRate", "United States");

export interface SeedSpec {
  key: string;           // short key, prefix added below
  card: CardKey;
  value: unknown;
  unit: string | null;
  label: string;
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
  { key: "companyInflationRate",  card: "setup", value: DEFAULT_COMPANY_INFLATION_RATE, unit: "%",      label: "Company-level cost inflation (annual)" },

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
  { key: "officeLeaseStart",            card: "overhead", value: DEFAULT_OFFICE_LEASE_START,                 unit: "$/yr",  label: "Office lease (year 1, annual)" },
  { key: "professionalServicesStart",   card: "overhead", value: DEFAULT_PROFESSIONAL_SERVICES_START,        unit: "$/yr",  label: "Professional services (year 1)" },
  { key: "techInfraStart",              card: "overhead", value: DEFAULT_TECH_INFRA_START,                   unit: "$/yr",  label: "Technology infrastructure (year 1)" },
  { key: "travelCostPerClient",         card: "overhead", value: DEFAULT_TRAVEL_COST_PER_CLIENT,             unit: "$/yr",  label: "Travel cost per managed client" },
  { key: "itLicensePerClient",          card: "overhead", value: DEFAULT_IT_LICENSE_PER_CLIENT,              unit: "$/yr",  label: "IT license cost per managed client" },
  { key: "marketingRate",               card: "overhead", value: DEFAULT_MARKETING_RATE,                     unit: "%",     label: "Company-level marketing rate" },
  { key: "miscOpsRate",                 card: "overhead", value: DEFAULT_MISC_OPS_RATE,                      unit: "%",     label: "Company-level miscellaneous ops rate" },
  { key: "businessInsuranceStart",      card: "overhead", value: DEFAULT_BUSINESS_INSURANCE_START,           unit: "$/yr",  label: "Company business insurance (year 1)" },

  // ── Tax & Exit ───────────────────────────────────────────────────────
  { key: "companyTaxRate",              card: "tax_exit", value: DEFAULT_COMPANY_TAX_RATE,                   unit: "%",     label: "Company blended tax rate" },
  { key: "exitCapRate",                 card: "tax_exit", value: DEFAULT_EXIT_CAP_RATE,                      unit: "%",     label: "Default exit cap rate" },
  { key: "exitCapRateLuxury",           card: "tax_exit", value: SEED_EXIT_CAP_RATE_LUXURY,                  unit: "%",     label: "Exit cap rate — luxury tier seed (L+B)" },
  { key: "propertyIncomeTaxRate",       card: "tax_exit", value: DEFAULT_PROPERTY_INCOME_TAX_RATE,           unit: "%",     label: "Property income tax rate" },
  { key: "commissionRate",              card: "tax_exit", value: DEFAULT_COMMISSION_RATE,                    unit: "%",     label: "Exit sale commission rate" },
  { key: "landValuePercent",            card: "tax_exit", value: DEFAULT_LAND_VALUE_PERCENT,                 unit: "%",     label: "Land value as % of property cost" },

  // ── Property Defaults (MC-managed template for new properties) ───────
  { key: "roomCount",                   card: "property_defaults", value: DEFAULT_ROOM_COUNT,                unit: "rooms",  label: "Default room count for new property" },
  { key: "startAdr",                    card: "property_defaults", value: DEFAULT_START_ADR,                 unit: "$",      label: "Starting ADR for new property" },
  { key: "maxOccupancy",                card: "property_defaults", value: DEFAULT_MAX_OCCUPANCY,             unit: "%",      label: "Stabilized maximum occupancy" },
  { key: "startOccupancy",              card: "property_defaults", value: DEFAULT_START_OCCUPANCY,           unit: "%",      label: "Starting occupancy (month 1)" },
  { key: "adrGrowthRate",               card: "property_defaults", value: DEFAULT_ADR_GROWTH_RATE,           unit: "%",      label: "Annual ADR growth rate" },
  { key: "stabilizationMonths",         card: "property_defaults", value: DEFAULT_STABILIZATION_MONTHS,      unit: "months", label: "Months to stabilize" },
  { key: "occupancyRampMonths",         card: "property_defaults", value: DEFAULT_OCCUPANCY_RAMP_MONTHS,     unit: "months", label: "Occupancy ramp duration" },
  { key: "occupancyGrowthStep",         card: "property_defaults", value: DEFAULT_OCCUPANCY_GROWTH_STEP,     unit: "%",      label: "Occupancy growth step per period" },
  { key: "propertyInflationRate",       card: "property_defaults", value: DEFAULT_PROPERTY_INFLATION_RATE,   unit: "%",      label: "Property-level cost inflation (annual)" },
];

export function toDefaultKey(card: CardKey, key: string): string {
  return `mc.${card}.${key}`;
}

async function main(): Promise<void> {
  const insertedAt = new Date();
  const byCard = new Map<CardKey, number>();

  for (const spec of SPECS) {
    const defaultKey = toDefaultKey(spec.card, spec.key);

    await db
      .insert(modelDefaults)
      .values({
        defaultKey,
        category: "management_company",
        subTab: "management_company",
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
      .onConflictDoUpdate({
        target: [
          modelDefaults.defaultKey,
          modelDefaults.country,
          modelDefaults.countrySubdivision,
          modelDefaults.businessType,
          modelDefaults.sizeBand,
        ],
        set: {
          value: sql`EXCLUDED.value`,
          unit: sql`EXCLUDED.unit`,
          label: sql`EXCLUDED.label`,
          lastSetSource: sql`EXCLUDED.last_set_source`,
          lastSetReason: sql`EXCLUDED.last_set_reason`,
          lastSetAt: sql`EXCLUDED.last_set_at`,
        },
      });

    byCard.set(spec.card, (byCard.get(spec.card) ?? 0) + 1);
  }

  console.log(`\nSeeded ${SPECS.length} model_defaults rows (all universal scope):`);
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
    console.log(`  ${card.padEnd(22)} ${n}`);
  }
  console.log("");
}

// Only auto-run when invoked directly (`tsx script/seed-model-defaults.ts`).
// Tests import `SPECS` and `toDefaultKey` from this module
// (see tests/proof/defaults-drift.test.ts) and must not trigger the seed
// — doing so kicks off a DB write inside vitest and surfaces as an
// unhandled `process.exit(1)` rejection that pollutes the run.
const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === `file://${process.argv[1]}`;

if (isDirectRun) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exit(1);
    });
}
