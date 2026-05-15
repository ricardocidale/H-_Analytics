/**
 * Seed `model_constants` from the TypeScript canonical sources.
 *
 * Idempotent: every row is upserted by (constantKey, country, countrySubdivision).
 * Safe to re-run after editing COUNTRY_DEFAULTS or US_STATE_DEFAULTS.
 *
 * What gets seeded:
 *   - 1 universal row:    daysPerMonth
 *   - country-keyed:      taxRate, costRateTaxes, countryRiskPremium,
 *                         inflationRate, depreciationYears, capitalGainsRate
 *                         (one row per country × key = 18 × 6)
 *   - state overlays:     taxRate, costRateTaxes for the 10 US states
 *                         (one row per state × key = 10 × 2)
 *
 * Authority field: depreciationYears uses the per-country `depreciationAuthority`
 * field; the rest use a per-key authority string with a country qualifier.
 *
 * Run:
 *   tsx script/seed-model-constants.ts
 */

import { pathToFileURL } from "url";
import { resolve } from "path";
import { sql } from "drizzle-orm";
import { COUNTRY_DEFAULTS, US_STATE_DEFAULTS } from "@shared/countryDefaults";
import { DAYS_PER_MONTH } from "@shared/constants";
import {
  DEFAULT_PARTNER_COMP_YEAR1_BENCHMARK_LOW, DEFAULT_PARTNER_COMP_YEAR1_BENCHMARK_MID, DEFAULT_PARTNER_COMP_YEAR1_BENCHMARK_HIGH,
  DEFAULT_PARTNER_COMP_YEAR10_BENCHMARK_LOW, DEFAULT_PARTNER_COMP_YEAR10_BENCHMARK_MID, DEFAULT_PARTNER_COMP_YEAR10_BENCHMARK_HIGH,
  DEFAULT_PARTNER_COUNT_YEAR1_BENCHMARK_LOW, DEFAULT_PARTNER_COUNT_YEAR1_BENCHMARK_MID, DEFAULT_PARTNER_COUNT_YEAR1_BENCHMARK_HIGH,
  DEFAULT_STAFF_SALARY_BENCHMARK_LOW, DEFAULT_STAFF_SALARY_BENCHMARK_MID, DEFAULT_STAFF_SALARY_BENCHMARK_HIGH,
  DEFAULT_STAFF_TIER3_FTE_BENCHMARK_LOW, DEFAULT_STAFF_TIER3_FTE_BENCHMARK_MID, DEFAULT_STAFF_TIER3_FTE_BENCHMARK_HIGH,
} from "@shared/constants-compensation-benchmarks";
import {
  DEFAULT_MARKETING_RATE_BENCHMARK_LOW, DEFAULT_MARKETING_RATE_BENCHMARK_MID, DEFAULT_MARKETING_RATE_BENCHMARK_HIGH,
  DEFAULT_FB_REVENUE_SHARE_BENCHMARK_LOW, DEFAULT_FB_REVENUE_SHARE_BENCHMARK_MID, DEFAULT_FB_REVENUE_SHARE_BENCHMARK_HIGH,
  DEFAULT_EVENTS_REVENUE_SHARE_BENCHMARK_LOW, DEFAULT_EVENTS_REVENUE_SHARE_BENCHMARK_MID, DEFAULT_EVENTS_REVENUE_SHARE_BENCHMARK_HIGH,
  DEFAULT_OTHER_REVENUE_SHARE_BENCHMARK_LOW, DEFAULT_OTHER_REVENUE_SHARE_BENCHMARK_MID, DEFAULT_OTHER_REVENUE_SHARE_BENCHMARK_HIGH,
  DEFAULT_CATERING_BOOST_PCT_BENCHMARK_LOW, DEFAULT_CATERING_BOOST_PCT_BENCHMARK_MID, DEFAULT_CATERING_BOOST_PCT_BENCHMARK_HIGH,
} from "@shared/constants-revenue-benchmarks";
import {
  DEFAULT_OFFICE_LEASE_BENCHMARK_LOW, DEFAULT_OFFICE_LEASE_BENCHMARK_MID, DEFAULT_OFFICE_LEASE_BENCHMARK_HIGH,
  DEFAULT_PROFESSIONAL_SERVICES_BENCHMARK_LOW, DEFAULT_PROFESSIONAL_SERVICES_BENCHMARK_MID, DEFAULT_PROFESSIONAL_SERVICES_BENCHMARK_HIGH,
  DEFAULT_TECH_INFRA_BENCHMARK_LOW, DEFAULT_TECH_INFRA_BENCHMARK_MID, DEFAULT_TECH_INFRA_BENCHMARK_HIGH,
  DEFAULT_BUSINESS_INSURANCE_BENCHMARK_LOW, DEFAULT_BUSINESS_INSURANCE_BENCHMARK_MID, DEFAULT_BUSINESS_INSURANCE_BENCHMARK_HIGH,
  DEFAULT_TRAVEL_COST_PER_CLIENT_BENCHMARK_LOW, DEFAULT_TRAVEL_COST_PER_CLIENT_BENCHMARK_MID, DEFAULT_TRAVEL_COST_PER_CLIENT_BENCHMARK_HIGH,
  DEFAULT_IT_LICENSE_PER_CLIENT_BENCHMARK_LOW, DEFAULT_IT_LICENSE_PER_CLIENT_BENCHMARK_MID, DEFAULT_IT_LICENSE_PER_CLIENT_BENCHMARK_HIGH,
} from "@shared/constants-overhead-benchmarks";
import {
  DEFAULT_EVENT_EXPENSE_RATE_BENCHMARK_LOW, DEFAULT_EVENT_EXPENSE_RATE_BENCHMARK_MID, DEFAULT_EVENT_EXPENSE_RATE_BENCHMARK_HIGH,
  DEFAULT_OTHER_EXPENSE_RATE_BENCHMARK_LOW, DEFAULT_OTHER_EXPENSE_RATE_BENCHMARK_MID, DEFAULT_OTHER_EXPENSE_RATE_BENCHMARK_HIGH,
  DEFAULT_UTILITIES_VARIABLE_SPLIT_BENCHMARK_LOW, DEFAULT_UTILITIES_VARIABLE_SPLIT_BENCHMARK_MID, DEFAULT_UTILITIES_VARIABLE_SPLIT_BENCHMARK_HIGH,
  DEFAULT_SALES_COMMISSION_RATE_BENCHMARK_LOW, DEFAULT_SALES_COMMISSION_RATE_BENCHMARK_MID, DEFAULT_SALES_COMMISSION_RATE_BENCHMARK_HIGH,
} from "@shared/constants-property-defaults-benchmarks";
import {
  DEFAULT_BASE_MGMT_FEE_BENCHMARK_LOW, DEFAULT_BASE_MGMT_FEE_BENCHMARK_MID, DEFAULT_BASE_MGMT_FEE_BENCHMARK_HIGH,
  DEFAULT_INCENTIVE_MGMT_FEE_BENCHMARK_LOW, DEFAULT_INCENTIVE_MGMT_FEE_BENCHMARK_MID, DEFAULT_INCENTIVE_MGMT_FEE_BENCHMARK_HIGH,
  DEFAULT_COMPANY_TAX_RATE_BENCHMARK_LOW, DEFAULT_COMPANY_TAX_RATE_BENCHMARK_MID, DEFAULT_COMPANY_TAX_RATE_BENCHMARK_HIGH,
  DEFAULT_COST_OF_EQUITY_BENCHMARK_LOW, DEFAULT_COST_OF_EQUITY_BENCHMARK_MID, DEFAULT_COST_OF_EQUITY_BENCHMARK_HIGH,
} from "@shared/constants-company-benchmarks";
import {
  DSCR_COVENANT_STANDARD, DSCR_COVENANT_CRITICAL,
  STRESS_OCCUPANCY_SHOCK, STRESS_ADR_SHOCK, STRESS_RATE_SHOCK_DECIMAL,
  STRESS_COST_SHOCK, STRESS_COMBINED_OCCUPANCY_SHOCK, STRESS_COMBINED_COST_SHOCK,
  STRESS_SEVERITY_NOI_THRESHOLD,
  SCALE_ADJUSTMENT_SMALL_PROPERTY, SCALE_ADJUSTMENT_MEDIUM_PROPERTY,
  DEFAULT_FALLBACK_OCCUPANCY,
} from "@shared/constants-benchmarks";
import {
  DEFAULT_STAFF_SALARY, DEFAULT_OFFICE_LEASE, DEFAULT_PROFESSIONAL_SERVICES,
  DEFAULT_TECH_INFRA, DEFAULT_BUSINESS_INSURANCE_COMPANY,
  DEFAULT_TRAVEL_PER_CLIENT, DEFAULT_IT_LICENSE_PER_CLIENT,
} from "@shared/constants-staffing";
import { storage } from "../src/storage";
import { db } from "../src/db";

interface SeedRow {
  constantKey: string;
  country: string | null;
  countrySubdivision: string | null;
  value: unknown;
  unit: string;
  authoritySource: string;
  notes?: string;
}

const COUNTRY_KEYS = ["taxRate", "costRateTaxes", "countryRiskPremium", "inflationRate", "depreciationYears", "capitalGainsRate"] as const;
const STATE_KEYS = ["taxRate", "costRateTaxes"] as const;

function unitFor(key: string): string {
  if (key === "depreciationYears") return "years";
  if (key === "daysPerMonth") return "days";
  return "%";
}

function authorityForCountryKey(key: string, country: string): string {
  const def = COUNTRY_DEFAULTS[country]!;
  switch (key) {
    case "depreciationYears":
      return def.depreciationAuthority;
    case "taxRate":
      return `${country} corporate income tax statute`;
    case "costRateTaxes":
      return `${country} property/real-estate tax authority`;
    case "countryRiskPremium":
      return "Damodaran NYU Stern Country Risk Premium (Jan 2026)";
    case "inflationRate":
      return `${country} central bank long-run inflation target`;
    case "capitalGainsRate":
      return `${country} capital gains tax statute`;
    default:
      return `${country} regulatory authority`;
  }
}

function authorityForStateKey(key: string, state: string): string {
  switch (key) {
    case "taxRate":
      return `IRS § 11 federal corporate tax + ${state} state corporate income tax`;
    case "costRateTaxes":
      return `${state} county/municipal property tax assessor`;
    default:
      return `${state} regulatory authority`;
  }
}

function notesFor(key: string, country: string): string | undefined {
  if (key === "inflationRate" && (country === "Argentina" || country === "El Salvador" || country === "Panama")) {
    return "USD-indexed/dollarized economy — reflects USD escalation, not local currency";
  }
  return undefined;
}

/**
 * Ensure the unique index that backs `upsertCanonical`'s `onConflictDoUpdate`
 * exists before any upsert runs. The schema declares this constraint as
 * `uq_mc_key_country_subdivision` in `shared/schema/model-canonicals.ts`
 * (the source of truth), and `script/seed-production.sql`'s prologue
 * mirrors the same `CREATE UNIQUE INDEX IF NOT EXISTS` for production
 * recovery. This in-seed safety net handles dev DBs that pre-date the
 * schema entry — without it, the seeder logs
 * `[seed:model-constants] skipped (will retry next boot)` on every dev
 * boot because the production-sql seed is gated to NODE_ENV=production.
 *
 * `IF NOT EXISTS` makes this a no-op when the schema-managed constraint
 * is already present, so the schema remains the source of truth.
 */
async function ensureCanonicalUniqueIndex(): Promise<void> {
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_mc_key_country_subdivision
      ON model_constants (constant_key, country, country_subdivision)
  `);
}

export async function seedModelConstants(opts: { silent?: boolean } = {}): Promise<{ upserted: number }> {
  const log = opts.silent ? () => {} : (msg: string) => console.log(msg);

  // Self-heal: guarantee the unique index exists before any upsert. Drizzle's
  // `onConflictDoUpdate` requires a real arbiter index, and without it the
  // first row throws and the whole seed gets skipped.
  await ensureCanonicalUniqueIndex();

  const rows: SeedRow[] = [];

  // Universal: daysPerMonth
  rows.push({
    constantKey: "daysPerMonth",
    country: null,
    countrySubdivision: null,
    value: DAYS_PER_MONTH,
    unit: "days",
    authoritySource: "Norfolk AI hospitality modelling convention (USALI annualisation)",
  });

  // Country-keyed
  for (const country of Object.keys(COUNTRY_DEFAULTS)) {
    const def = COUNTRY_DEFAULTS[country]!;
    const valueByKey: Record<typeof COUNTRY_KEYS[number], unknown> = {
      taxRate: def.taxRate,
      costRateTaxes: def.costRateTaxes,
      countryRiskPremium: def.countryRiskPremium,
      inflationRate: def.inflationRate,
      depreciationYears: def.depreciationYears,
      capitalGainsRate: def.capitalGainsRate,
    };
    for (const key of COUNTRY_KEYS) {
      rows.push({
        constantKey: key,
        country,
        countrySubdivision: null,
        value: valueByKey[key],
        unit: unitFor(key),
        authoritySource: authorityForCountryKey(key, country),
        notes: notesFor(key, country),
      });
    }
  }

  // US state overlays
  for (const state of Object.keys(US_STATE_DEFAULTS)) {
    const def = US_STATE_DEFAULTS[state]!;
    const valueByKey: Record<typeof STATE_KEYS[number], unknown> = {
      taxRate: def.taxRate,
      costRateTaxes: def.costRateTaxes,
    };
    for (const key of STATE_KEYS) {
      rows.push({
        constantKey: key,
        country: "United States",
        countrySubdivision: state,
        value: valueByKey[key],
        unit: unitFor(key),
        authoritySource: authorityForStateKey(key, state),
      });
    }
  }

  // ── Universal benchmark rows ────────────────────────────────────────────────
  type BenchRow = { key: string; value: number; unit: string; authority: string };
  const BENCHMARK_ROWS: BenchRow[] = [
    // Compensation bands
    { key: "benchmarkCompPartnerCompYear1Low",  value: DEFAULT_PARTNER_COMP_YEAR1_BENCHMARK_LOW,  unit: "usd",   authority: "Hospitality ManCo compensation benchmarks (H+ Analytics 2024)" },
    { key: "benchmarkCompPartnerCompYear1Mid",  value: DEFAULT_PARTNER_COMP_YEAR1_BENCHMARK_MID,  unit: "usd",   authority: "Hospitality ManCo compensation benchmarks (H+ Analytics 2024)" },
    { key: "benchmarkCompPartnerCompYear1High", value: DEFAULT_PARTNER_COMP_YEAR1_BENCHMARK_HIGH, unit: "usd",   authority: "Hospitality ManCo compensation benchmarks (H+ Analytics 2024)" },
    { key: "benchmarkCompPartnerCompYear10Low",  value: DEFAULT_PARTNER_COMP_YEAR10_BENCHMARK_LOW,  unit: "usd", authority: "Hospitality ManCo compensation benchmarks (H+ Analytics 2024)" },
    { key: "benchmarkCompPartnerCompYear10Mid",  value: DEFAULT_PARTNER_COMP_YEAR10_BENCHMARK_MID,  unit: "usd", authority: "Hospitality ManCo compensation benchmarks (H+ Analytics 2024)" },
    { key: "benchmarkCompPartnerCompYear10High", value: DEFAULT_PARTNER_COMP_YEAR10_BENCHMARK_HIGH, unit: "usd", authority: "Hospitality ManCo compensation benchmarks (H+ Analytics 2024)" },
    { key: "benchmarkCompPartnerCountYear1Low",  value: DEFAULT_PARTNER_COUNT_YEAR1_BENCHMARK_LOW,  unit: "count", authority: "Hospitality ManCo compensation benchmarks (H+ Analytics 2024)" },
    { key: "benchmarkCompPartnerCountYear1Mid",  value: DEFAULT_PARTNER_COUNT_YEAR1_BENCHMARK_MID,  unit: "count", authority: "Hospitality ManCo compensation benchmarks (H+ Analytics 2024)" },
    { key: "benchmarkCompPartnerCountYear1High", value: DEFAULT_PARTNER_COUNT_YEAR1_BENCHMARK_HIGH, unit: "count", authority: "Hospitality ManCo compensation benchmarks (H+ Analytics 2024)" },
    { key: "benchmarkCompStaffSalaryLow",  value: DEFAULT_STAFF_SALARY_BENCHMARK_LOW,  unit: "usd", authority: "AHLA Lodging Industry Survey + hospitality market benchmarks" },
    { key: "benchmarkCompStaffSalaryMid",  value: DEFAULT_STAFF_SALARY_BENCHMARK_MID,  unit: "usd", authority: "AHLA Lodging Industry Survey + hospitality market benchmarks" },
    { key: "benchmarkCompStaffSalaryHigh", value: DEFAULT_STAFF_SALARY_BENCHMARK_HIGH, unit: "usd", authority: "AHLA Lodging Industry Survey + hospitality market benchmarks" },
    { key: "benchmarkCompStaffTier3FteLow",  value: DEFAULT_STAFF_TIER3_FTE_BENCHMARK_LOW,  unit: "count", authority: "Hospitality ManCo compensation benchmarks (H+ Analytics 2024)" },
    { key: "benchmarkCompStaffTier3FteMid",  value: DEFAULT_STAFF_TIER3_FTE_BENCHMARK_MID,  unit: "count", authority: "Hospitality ManCo compensation benchmarks (H+ Analytics 2024)" },
    { key: "benchmarkCompStaffTier3FteHigh", value: DEFAULT_STAFF_TIER3_FTE_BENCHMARK_HIGH, unit: "count", authority: "Hospitality ManCo compensation benchmarks (H+ Analytics 2024)" },
    // Revenue bands
    { key: "benchmarkRevMarketingRateLow",  value: DEFAULT_MARKETING_RATE_BENCHMARK_LOW,  unit: "%", authority: "HVS 2024 Hotel Cost Survey (boutique luxury)" },
    { key: "benchmarkRevMarketingRateMid",  value: DEFAULT_MARKETING_RATE_BENCHMARK_MID,  unit: "%", authority: "HVS 2024 Hotel Cost Survey (boutique luxury)" },
    { key: "benchmarkRevMarketingRateHigh", value: DEFAULT_MARKETING_RATE_BENCHMARK_HIGH, unit: "%", authority: "HVS 2024 Hotel Cost Survey (boutique luxury)" },
    { key: "benchmarkRevFbRevenueShareLow",  value: DEFAULT_FB_REVENUE_SHARE_BENCHMARK_LOW,  unit: "%", authority: "STR/CoStar 2024 + BLLA 2024 boutique luxury operating mix" },
    { key: "benchmarkRevFbRevenueShareMid",  value: DEFAULT_FB_REVENUE_SHARE_BENCHMARK_MID,  unit: "%", authority: "STR/CoStar 2024 + BLLA 2024 boutique luxury operating mix" },
    { key: "benchmarkRevFbRevenueShareHigh", value: DEFAULT_FB_REVENUE_SHARE_BENCHMARK_HIGH, unit: "%", authority: "STR/CoStar 2024 + BLLA 2024 boutique luxury operating mix" },
    { key: "benchmarkRevEventsRevenueShareLow",  value: DEFAULT_EVENTS_REVENUE_SHARE_BENCHMARK_LOW,  unit: "%", authority: "STR/CoStar 2024 + BLLA 2024 boutique luxury operating mix" },
    { key: "benchmarkRevEventsRevenueShareMid",  value: DEFAULT_EVENTS_REVENUE_SHARE_BENCHMARK_MID,  unit: "%", authority: "STR/CoStar 2024 + BLLA 2024 boutique luxury operating mix" },
    { key: "benchmarkRevEventsRevenueShareHigh", value: DEFAULT_EVENTS_REVENUE_SHARE_BENCHMARK_HIGH, unit: "%", authority: "STR/CoStar 2024 + BLLA 2024 boutique luxury operating mix" },
    { key: "benchmarkRevOtherRevenueShareLow",  value: DEFAULT_OTHER_REVENUE_SHARE_BENCHMARK_LOW,  unit: "%", authority: "STR/CoStar 2024 + BLLA 2024 boutique luxury operating mix" },
    { key: "benchmarkRevOtherRevenueShareMid",  value: DEFAULT_OTHER_REVENUE_SHARE_BENCHMARK_MID,  unit: "%", authority: "STR/CoStar 2024 + BLLA 2024 boutique luxury operating mix" },
    { key: "benchmarkRevOtherRevenueShareHigh", value: DEFAULT_OTHER_REVENUE_SHARE_BENCHMARK_HIGH, unit: "%", authority: "STR/CoStar 2024 + BLLA 2024 boutique luxury operating mix" },
    { key: "benchmarkRevCateringBoostPctLow",  value: DEFAULT_CATERING_BOOST_PCT_BENCHMARK_LOW,  unit: "%", authority: "Industry rule-of-thumb — off-property catering / private events" },
    { key: "benchmarkRevCateringBoostPctMid",  value: DEFAULT_CATERING_BOOST_PCT_BENCHMARK_MID,  unit: "%", authority: "Industry rule-of-thumb — off-property catering / private events" },
    { key: "benchmarkRevCateringBoostPctHigh", value: DEFAULT_CATERING_BOOST_PCT_BENCHMARK_HIGH, unit: "%", authority: "Industry rule-of-thumb — off-property catering / private events" },
    // Overhead bands
    { key: "benchmarkOverheadOfficeLeaseLow",  value: DEFAULT_OFFICE_LEASE_BENCHMARK_LOW,  unit: "usd", authority: "AHLA Lodging Industry Survey + HFTP/AICPA practice benchmarks" },
    { key: "benchmarkOverheadOfficeLeaseMid",  value: DEFAULT_OFFICE_LEASE_BENCHMARK_MID,  unit: "usd", authority: "AHLA Lodging Industry Survey + HFTP/AICPA practice benchmarks" },
    { key: "benchmarkOverheadOfficeLeaseHigh", value: DEFAULT_OFFICE_LEASE_BENCHMARK_HIGH, unit: "usd", authority: "AHLA Lodging Industry Survey + HFTP/AICPA practice benchmarks" },
    { key: "benchmarkOverheadProfServicesLow",  value: DEFAULT_PROFESSIONAL_SERVICES_BENCHMARK_LOW,  unit: "usd", authority: "AICPA practice benchmarks for early-stage hospitality companies" },
    { key: "benchmarkOverheadProfServicesMid",  value: DEFAULT_PROFESSIONAL_SERVICES_BENCHMARK_MID,  unit: "usd", authority: "AICPA practice benchmarks for early-stage hospitality companies" },
    { key: "benchmarkOverheadProfServicesHigh", value: DEFAULT_PROFESSIONAL_SERVICES_BENCHMARK_HIGH, unit: "usd", authority: "AICPA practice benchmarks for early-stage hospitality companies" },
    { key: "benchmarkOverheadTechInfraLow",  value: DEFAULT_TECH_INFRA_BENCHMARK_LOW,  unit: "usd", authority: "HFTP Technology Survey for corporate-level IT spend" },
    { key: "benchmarkOverheadTechInfraMid",  value: DEFAULT_TECH_INFRA_BENCHMARK_MID,  unit: "usd", authority: "HFTP Technology Survey for corporate-level IT spend" },
    { key: "benchmarkOverheadTechInfraHigh", value: DEFAULT_TECH_INFRA_BENCHMARK_HIGH, unit: "usd", authority: "HFTP Technology Survey for corporate-level IT spend" },
    { key: "benchmarkOverheadBizInsuranceLow",  value: DEFAULT_BUSINESS_INSURANCE_BENCHMARK_LOW,  unit: "usd", authority: "Hospitality D&O / E&O / cyber liability premium benchmarks" },
    { key: "benchmarkOverheadBizInsuranceMid",  value: DEFAULT_BUSINESS_INSURANCE_BENCHMARK_MID,  unit: "usd", authority: "Hospitality D&O / E&O / cyber liability premium benchmarks" },
    { key: "benchmarkOverheadBizInsuranceHigh", value: DEFAULT_BUSINESS_INSURANCE_BENCHMARK_HIGH, unit: "usd", authority: "Hospitality D&O / E&O / cyber liability premium benchmarks" },
    { key: "benchmarkOverheadTravelPerClientLow",  value: DEFAULT_TRAVEL_COST_PER_CLIENT_BENCHMARK_LOW,  unit: "usd", authority: "AHLA per-property travel benchmarks" },
    { key: "benchmarkOverheadTravelPerClientMid",  value: DEFAULT_TRAVEL_COST_PER_CLIENT_BENCHMARK_MID,  unit: "usd", authority: "AHLA per-property travel benchmarks" },
    { key: "benchmarkOverheadTravelPerClientHigh", value: DEFAULT_TRAVEL_COST_PER_CLIENT_BENCHMARK_HIGH, unit: "usd", authority: "AHLA per-property travel benchmarks" },
    { key: "benchmarkOverheadItLicensePerClientLow",  value: DEFAULT_IT_LICENSE_PER_CLIENT_BENCHMARK_LOW,  unit: "usd", authority: "HFTP per-property tech-stack survey" },
    { key: "benchmarkOverheadItLicensePerClientMid",  value: DEFAULT_IT_LICENSE_PER_CLIENT_BENCHMARK_MID,  unit: "usd", authority: "HFTP per-property tech-stack survey" },
    { key: "benchmarkOverheadItLicensePerClientHigh", value: DEFAULT_IT_LICENSE_PER_CLIENT_BENCHMARK_HIGH, unit: "usd", authority: "HFTP per-property tech-stack survey" },
    // Property-defaults bands
    { key: "benchmarkPropDefaultsEventExpenseRateLow",  value: DEFAULT_EVENT_EXPENSE_RATE_BENCHMARK_LOW,  unit: "%", authority: "AHLA/USALI F&B and Event Cost Benchmarks (11th ed.) + CBRE Hotel Operations Report" },
    { key: "benchmarkPropDefaultsEventExpenseRateMid",  value: DEFAULT_EVENT_EXPENSE_RATE_BENCHMARK_MID,  unit: "%", authority: "AHLA/USALI F&B and Event Cost Benchmarks (11th ed.) + CBRE Hotel Operations Report" },
    { key: "benchmarkPropDefaultsEventExpenseRateHigh", value: DEFAULT_EVENT_EXPENSE_RATE_BENCHMARK_HIGH, unit: "%", authority: "AHLA/USALI F&B and Event Cost Benchmarks (11th ed.) + CBRE Hotel Operations Report" },
    { key: "benchmarkPropDefaultsOtherExpenseRateLow",  value: DEFAULT_OTHER_EXPENSE_RATE_BENCHMARK_LOW,  unit: "%", authority: "CBRE Trends in the Hotel Industry + USALI undistributed-department benchmarks" },
    { key: "benchmarkPropDefaultsOtherExpenseRateMid",  value: DEFAULT_OTHER_EXPENSE_RATE_BENCHMARK_MID,  unit: "%", authority: "CBRE Trends in the Hotel Industry + USALI undistributed-department benchmarks" },
    { key: "benchmarkPropDefaultsOtherExpenseRateHigh", value: DEFAULT_OTHER_EXPENSE_RATE_BENCHMARK_HIGH, unit: "%", authority: "CBRE Trends in the Hotel Industry + USALI undistributed-department benchmarks" },
    { key: "benchmarkPropDefaultsUtilitiesVarSplitLow",  value: DEFAULT_UTILITIES_VARIABLE_SPLIT_BENCHMARK_LOW,  unit: "%", authority: "ENERGY STAR Hotel Energy Intensity benchmarks + Cornell Hotel Sustainability Handbook" },
    { key: "benchmarkPropDefaultsUtilitiesVarSplitMid",  value: DEFAULT_UTILITIES_VARIABLE_SPLIT_BENCHMARK_MID,  unit: "%", authority: "ENERGY STAR Hotel Energy Intensity benchmarks + Cornell Hotel Sustainability Handbook" },
    { key: "benchmarkPropDefaultsUtilitiesVarSplitHigh", value: DEFAULT_UTILITIES_VARIABLE_SPLIT_BENCHMARK_HIGH, unit: "%", authority: "ENERGY STAR Hotel Energy Intensity benchmarks + Cornell Hotel Sustainability Handbook" },
    { key: "benchmarkPropDefaultsSalesCommissionRateLow",  value: DEFAULT_SALES_COMMISSION_RATE_BENCHMARK_LOW,  unit: "%", authority: "Kalibri Labs Direct Booking Study + AHLA Distribution Cost Study" },
    { key: "benchmarkPropDefaultsSalesCommissionRateMid",  value: DEFAULT_SALES_COMMISSION_RATE_BENCHMARK_MID,  unit: "%", authority: "Kalibri Labs Direct Booking Study + AHLA Distribution Cost Study" },
    { key: "benchmarkPropDefaultsSalesCommissionRateHigh", value: DEFAULT_SALES_COMMISSION_RATE_BENCHMARK_HIGH, unit: "%", authority: "Kalibri Labs Direct Booking Study + AHLA Distribution Cost Study" },
    // Company bands
    { key: "benchmarkCompanyBaseMgmtFeeLow",  value: DEFAULT_BASE_MGMT_FEE_BENCHMARK_LOW,  unit: "%", authority: "AHLA/HLA operator survey + CBRE Hotel Management Fee Study" },
    { key: "benchmarkCompanyBaseMgmtFeeMid",  value: DEFAULT_BASE_MGMT_FEE_BENCHMARK_MID,  unit: "%", authority: "AHLA/HLA operator survey + CBRE Hotel Management Fee Study" },
    { key: "benchmarkCompanyBaseMgmtFeeHigh", value: DEFAULT_BASE_MGMT_FEE_BENCHMARK_HIGH, unit: "%", authority: "AHLA/HLA operator survey + CBRE Hotel Management Fee Study" },
    { key: "benchmarkCompanyIncentiveMgmtFeeLow",  value: DEFAULT_INCENTIVE_MGMT_FEE_BENCHMARK_LOW,  unit: "%", authority: "HVS Management Contract Study + STR/AHLA operator terms" },
    { key: "benchmarkCompanyIncentiveMgmtFeeMid",  value: DEFAULT_INCENTIVE_MGMT_FEE_BENCHMARK_MID,  unit: "%", authority: "HVS Management Contract Study + STR/AHLA operator terms" },
    { key: "benchmarkCompanyIncentiveMgmtFeeHigh", value: DEFAULT_INCENTIVE_MGMT_FEE_BENCHMARK_HIGH, unit: "%", authority: "HVS Management Contract Study + STR/AHLA operator terms" },
    { key: "benchmarkCompanyTaxRateLow",  value: DEFAULT_COMPANY_TAX_RATE_BENCHMARK_LOW,  unit: "%", authority: "IRS corporate rates + AICPA combined federal + state benchmarks" },
    { key: "benchmarkCompanyTaxRateMid",  value: DEFAULT_COMPANY_TAX_RATE_BENCHMARK_MID,  unit: "%", authority: "IRS corporate rates + AICPA combined federal + state benchmarks" },
    { key: "benchmarkCompanyTaxRateHigh", value: DEFAULT_COMPANY_TAX_RATE_BENCHMARK_HIGH, unit: "%", authority: "IRS corporate rates + AICPA combined federal + state benchmarks" },
    { key: "benchmarkCompanyCostOfEquityLow",  value: DEFAULT_COST_OF_EQUITY_BENCHMARK_LOW,  unit: "%", authority: "Damodaran + Duff & Phelps Kroll Cost of Capital Navigator 2024 + KPMG WACC Monitor + CBRE 2024 Hotel Investor Survey" },
    { key: "benchmarkCompanyCostOfEquityMid",  value: DEFAULT_COST_OF_EQUITY_BENCHMARK_MID,  unit: "%", authority: "Damodaran + Duff & Phelps Kroll Cost of Capital Navigator 2024 + KPMG WACC Monitor + CBRE 2024 Hotel Investor Survey" },
    { key: "benchmarkCompanyCostOfEquityHigh", value: DEFAULT_COST_OF_EQUITY_BENCHMARK_HIGH, unit: "%", authority: "Damodaran + Duff & Phelps Kroll Cost of Capital Navigator 2024 + KPMG WACC Monitor + CBRE 2024 Hotel Investor Survey" },
    // DSCR / stress / scale scalars
    { key: "benchmarkDscrCovenantStandard",      value: DSCR_COVENANT_STANDARD,         unit: "ratio", authority: "Standard lender covenant for hospitality real estate debt" },
    { key: "benchmarkDscrCovenantCritical",      value: DSCR_COVENANT_CRITICAL,         unit: "ratio", authority: "Standard lender covenant for hospitality real estate debt" },
    { key: "benchmarkStressOccupancyShock",      value: STRESS_OCCUPANCY_SHOCK,         unit: "ratio", authority: "CBRE Hotels Research — standard recession/stress scenario calibration" },
    { key: "benchmarkStressAdrShock",            value: STRESS_ADR_SHOCK,               unit: "ratio", authority: "CBRE Hotels Research — standard recession/stress scenario calibration" },
    { key: "benchmarkStressRateShockDecimal",    value: STRESS_RATE_SHOCK_DECIMAL,      unit: "%",     authority: "CBRE Hotels Research — standard recession/stress scenario calibration" },
    { key: "benchmarkStressCostShock",           value: STRESS_COST_SHOCK,              unit: "ratio", authority: "CBRE Hotels Research — standard recession/stress scenario calibration" },
    { key: "benchmarkStressCombinedOccupancyShock", value: STRESS_COMBINED_OCCUPANCY_SHOCK, unit: "ratio", authority: "CBRE Hotels Research — combined stress scenario calibration" },
    { key: "benchmarkStressCombinedCostShock",   value: STRESS_COMBINED_COST_SHOCK,     unit: "ratio", authority: "CBRE Hotels Research — combined stress scenario calibration" },
    { key: "benchmarkStressSeverityNoiThreshold",value: STRESS_SEVERITY_NOI_THRESHOLD,  unit: "ratio", authority: "CBRE Hotels Research — stress severity classification" },
    { key: "benchmarkScaleAdjSmallProperty",     value: SCALE_ADJUSTMENT_SMALL_PROPERTY,  unit: "ratio", authority: "HVS Hotel Cost Benchmarks" },
    { key: "benchmarkScaleAdjMediumProperty",    value: SCALE_ADJUSTMENT_MEDIUM_PROPERTY, unit: "ratio", authority: "HVS Hotel Cost Benchmarks" },
    { key: "benchmarkDefaultFallbackOccupancy",  value: DEFAULT_FALLBACK_OCCUPANCY,     unit: "%",     authority: "STR Global Chain Scale Benchmarks" },
    // Staffing default scalars
    { key: "benchmarkStaffDefaultSalary",              value: DEFAULT_STAFF_SALARY,              unit: "usd", authority: "AHLA Lodging Industry Survey + hospitality market benchmarks" },
    { key: "benchmarkStaffDefaultOfficeLease",         value: DEFAULT_OFFICE_LEASE,              unit: "usd", authority: "AHLA Lodging Industry Survey + HFTP/AICPA practice benchmarks" },
    { key: "benchmarkStaffDefaultProfServices",        value: DEFAULT_PROFESSIONAL_SERVICES,     unit: "usd", authority: "AICPA practice benchmarks for early-stage hospitality companies" },
    { key: "benchmarkStaffDefaultTechInfra",           value: DEFAULT_TECH_INFRA,                unit: "usd", authority: "HFTP Technology Survey for corporate-level IT spend" },
    { key: "benchmarkStaffDefaultBizInsurance",        value: DEFAULT_BUSINESS_INSURANCE_COMPANY, unit: "usd", authority: "Hospitality D&O / E&O / cyber liability premium benchmarks" },
    { key: "benchmarkStaffDefaultTravelPerClient",     value: DEFAULT_TRAVEL_PER_CLIENT,         unit: "usd", authority: "AHLA per-property travel benchmarks" },
    { key: "benchmarkStaffDefaultItLicensePerClient",  value: DEFAULT_IT_LICENSE_PER_CLIENT,     unit: "usd", authority: "HFTP per-property tech-stack survey" },
  ];

  for (const b of BENCHMARK_ROWS) {
    rows.push({
      constantKey: b.key,
      country: null,
      countrySubdivision: null,
      value: b.value,
      unit: b.unit,
      authoritySource: b.authority,
    });
  }

  // Upsert all rows
  let upserted = 0;
  for (const row of rows) {
    await storage.upsertCanonical({
      constantKey: row.constantKey,
      country: row.country,
      countrySubdivision: row.countrySubdivision,
      value: row.value,
      unit: row.unit,
      authoritySource: row.authoritySource,
      notes: row.notes ?? null,
    });
    upserted += 1;
  }

  // Summary by key
  const byKey = new Map<string, number>();
  for (const r of rows) byKey.set(r.constantKey, (byKey.get(r.constantKey) ?? 0) + 1);
  log(`\nSeeded ${upserted} canonical rows:`);
  for (const [k, n] of Array.from(byKey.entries()).sort()) {
    log(`  ${k.padEnd(22)} ${n}`);
  }
  log("");

  return { upserted };
}

// Only auto-run when invoked directly (`tsx script/seed-model-constants.ts`).
//
// IMPORTANT: Do NOT use `import.meta.url === pathToFileURL(resolve(process.argv[1])).href`
// here. When esbuild bundles all modules into dist/index.mjs, every inlined
// module shares the same import.meta.url (the bundle entry point). That means
// the check evaluates to `true` when the server boots via `node dist/index.mjs`,
// firing seedModelConstants().then(() => process.exit(0)) and killing the server.
// Checking process.argv[1] for the script's own filename is bundle-safe because
// argv[1] always reflects the actual file Node was told to execute.
const isDirectRun =
  Boolean(process.argv[1]) &&
  /seed-model-constants\.[jt]s(x?)$/.test(process.argv[1]);

if (isDirectRun) {
  seedModelConstants()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exit(1);
    });
}
