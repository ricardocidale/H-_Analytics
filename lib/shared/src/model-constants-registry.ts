/**
 * Model Constants Registry — classifies every governed value with metadata.
 *
 * Single source of truth for:
 *   - Which constants exist (the canonical key list)
 *   - Whether a constant is universal, country-keyed, or country+state
 *   - How to look up the TS factory baseline (last-resort fallback only —
 *     the runtime resolver consults the DB canonical layer first)
 *   - The cited authority + helper text for documentation
 *
 * Phase 2 scope (canonical-DB-first): seven keys registered.
 *   universal:         daysPerMonth
 *   country-keyed:     depreciationYears, countryRiskPremium, inflationRate, capitalGainsRate
 *   country+state:     taxRate, costRateTaxes
 *
 * The TS values reached via `factoryValue` here serve only as a fallback
 * when the DB canonical row for a locality is missing (e.g. an unseeded
 * country). Authoritative values live in `model_constants` table; admins
 * can update them without a deploy.
 */

import { DAYS_PER_MONTH, GOVERNED_FIELDS, type GovernedFieldMeta } from "./constants";
import { USALI_FFE_RESERVE_BENCHMARK } from "./constants-brand";
import { COUNTRY_DEFAULTS, US_STATE_DEFAULTS, type CountryDefaults, type UsStateDefaults } from "./countryDefaults";
import {
  STRUCTURE_OVERLAY_BASELINES,
  STRUCTURE_OVERLAY_COUNTRY_DELTAS,
  type StructureOverlayKey,
} from "./constants-operating-structures-data";
import {
  DEFAULT_PARTNER_COMP_YEAR1_BENCHMARK_LOW, DEFAULT_PARTNER_COMP_YEAR1_BENCHMARK_MID, DEFAULT_PARTNER_COMP_YEAR1_BENCHMARK_HIGH,
  DEFAULT_PARTNER_COMP_YEAR10_BENCHMARK_LOW, DEFAULT_PARTNER_COMP_YEAR10_BENCHMARK_MID, DEFAULT_PARTNER_COMP_YEAR10_BENCHMARK_HIGH,
  DEFAULT_PARTNER_COUNT_YEAR1_BENCHMARK_LOW, DEFAULT_PARTNER_COUNT_YEAR1_BENCHMARK_MID, DEFAULT_PARTNER_COUNT_YEAR1_BENCHMARK_HIGH,
  DEFAULT_STAFF_SALARY_BENCHMARK_LOW, DEFAULT_STAFF_SALARY_BENCHMARK_MID, DEFAULT_STAFF_SALARY_BENCHMARK_HIGH,
  DEFAULT_STAFF_TIER3_FTE_BENCHMARK_LOW, DEFAULT_STAFF_TIER3_FTE_BENCHMARK_MID, DEFAULT_STAFF_TIER3_FTE_BENCHMARK_HIGH,
} from "./constants-compensation-benchmarks";
import {
  DEFAULT_MARKETING_RATE_BENCHMARK_LOW, DEFAULT_MARKETING_RATE_BENCHMARK_MID, DEFAULT_MARKETING_RATE_BENCHMARK_HIGH,
  DEFAULT_FB_REVENUE_SHARE_BENCHMARK_LOW, DEFAULT_FB_REVENUE_SHARE_BENCHMARK_MID, DEFAULT_FB_REVENUE_SHARE_BENCHMARK_HIGH,
  DEFAULT_EVENTS_REVENUE_SHARE_BENCHMARK_LOW, DEFAULT_EVENTS_REVENUE_SHARE_BENCHMARK_MID, DEFAULT_EVENTS_REVENUE_SHARE_BENCHMARK_HIGH,
  DEFAULT_OTHER_REVENUE_SHARE_BENCHMARK_LOW, DEFAULT_OTHER_REVENUE_SHARE_BENCHMARK_MID, DEFAULT_OTHER_REVENUE_SHARE_BENCHMARK_HIGH,
  DEFAULT_CATERING_BOOST_PCT_BENCHMARK_LOW, DEFAULT_CATERING_BOOST_PCT_BENCHMARK_MID, DEFAULT_CATERING_BOOST_PCT_BENCHMARK_HIGH,
} from "./constants-revenue-benchmarks";
import {
  DEFAULT_OFFICE_LEASE_BENCHMARK_LOW, DEFAULT_OFFICE_LEASE_BENCHMARK_MID, DEFAULT_OFFICE_LEASE_BENCHMARK_HIGH,
  DEFAULT_PROFESSIONAL_SERVICES_BENCHMARK_LOW, DEFAULT_PROFESSIONAL_SERVICES_BENCHMARK_MID, DEFAULT_PROFESSIONAL_SERVICES_BENCHMARK_HIGH,
  DEFAULT_TECH_INFRA_BENCHMARK_LOW, DEFAULT_TECH_INFRA_BENCHMARK_MID, DEFAULT_TECH_INFRA_BENCHMARK_HIGH,
  DEFAULT_BUSINESS_INSURANCE_BENCHMARK_LOW, DEFAULT_BUSINESS_INSURANCE_BENCHMARK_MID, DEFAULT_BUSINESS_INSURANCE_BENCHMARK_HIGH,
  DEFAULT_TRAVEL_COST_PER_CLIENT_BENCHMARK_LOW, DEFAULT_TRAVEL_COST_PER_CLIENT_BENCHMARK_MID, DEFAULT_TRAVEL_COST_PER_CLIENT_BENCHMARK_HIGH,
  DEFAULT_IT_LICENSE_PER_CLIENT_BENCHMARK_LOW, DEFAULT_IT_LICENSE_PER_CLIENT_BENCHMARK_MID, DEFAULT_IT_LICENSE_PER_CLIENT_BENCHMARK_HIGH,
} from "./constants-overhead-benchmarks";
import {
  DEFAULT_EVENT_EXPENSE_RATE_BENCHMARK_LOW, DEFAULT_EVENT_EXPENSE_RATE_BENCHMARK_MID, DEFAULT_EVENT_EXPENSE_RATE_BENCHMARK_HIGH,
  DEFAULT_OTHER_EXPENSE_RATE_BENCHMARK_LOW, DEFAULT_OTHER_EXPENSE_RATE_BENCHMARK_MID, DEFAULT_OTHER_EXPENSE_RATE_BENCHMARK_HIGH,
  DEFAULT_UTILITIES_VARIABLE_SPLIT_BENCHMARK_LOW, DEFAULT_UTILITIES_VARIABLE_SPLIT_BENCHMARK_MID, DEFAULT_UTILITIES_VARIABLE_SPLIT_BENCHMARK_HIGH,
  DEFAULT_SALES_COMMISSION_RATE_BENCHMARK_LOW, DEFAULT_SALES_COMMISSION_RATE_BENCHMARK_MID, DEFAULT_SALES_COMMISSION_RATE_BENCHMARK_HIGH,
} from "./constants-property-defaults-benchmarks";
import {
  DEFAULT_BASE_MGMT_FEE_BENCHMARK_LOW, DEFAULT_BASE_MGMT_FEE_BENCHMARK_MID, DEFAULT_BASE_MGMT_FEE_BENCHMARK_HIGH,
  DEFAULT_INCENTIVE_MGMT_FEE_BENCHMARK_LOW, DEFAULT_INCENTIVE_MGMT_FEE_BENCHMARK_MID, DEFAULT_INCENTIVE_MGMT_FEE_BENCHMARK_HIGH,
  DEFAULT_COMPANY_TAX_RATE_BENCHMARK_LOW, DEFAULT_COMPANY_TAX_RATE_BENCHMARK_MID, DEFAULT_COMPANY_TAX_RATE_BENCHMARK_HIGH,
  DEFAULT_COST_OF_EQUITY_BENCHMARK_LOW, DEFAULT_COST_OF_EQUITY_BENCHMARK_MID, DEFAULT_COST_OF_EQUITY_BENCHMARK_HIGH,
} from "./constants-company-benchmarks";
import {
  DSCR_COVENANT_STANDARD, DSCR_COVENANT_CRITICAL,
  STRESS_OCCUPANCY_SHOCK, STRESS_ADR_SHOCK, STRESS_RATE_SHOCK_DECIMAL,
  STRESS_COST_SHOCK, STRESS_COMBINED_OCCUPANCY_SHOCK, STRESS_COMBINED_COST_SHOCK,
  STRESS_SEVERITY_NOI_THRESHOLD,
  SCALE_ADJUSTMENT_SMALL_PROPERTY, SCALE_ADJUSTMENT_MEDIUM_PROPERTY,
  DEFAULT_FALLBACK_OCCUPANCY,
} from "./constants-benchmarks";
import {
  DEFAULT_STAFF_SALARY, DEFAULT_OFFICE_LEASE, DEFAULT_PROFESSIONAL_SERVICES,
  DEFAULT_TECH_INFRA, DEFAULT_BUSINESS_INSURANCE_COMPANY,
  DEFAULT_TRAVEL_PER_CLIENT, DEFAULT_IT_LICENSE_PER_CLIENT,
} from "./constants-staffing";

export type ConstantLocality = "universal" | "country" | "country+state";

export interface ConstantRegistryEntry {
  key: string;
  label: string;
  locality: ConstantLocality;
  meta: GovernedFieldMeta;
  /**
   * Phase 3 (Constants doctrine): when true, this constant is authority-
   * sourced and is owned by an Intelligence Specialist (declared via
   * `constantsOwned[]` in `engine/analyst/registry/specialist-catalog.ts`).
   * The server-side guard in `PUT /api/admin/model-constants/:key` rejects
   * any `source = 'manual'` write for these keys with HTTP 422 — the only
   * supported writer is the analyst-apply path. Defaults to `true` for
   * every entry below; flip to `false` only for non-authority keys that
   * still want to allow manual overrides (none today).
   */
  specialistOwned: boolean;
  /**
   * Factory-value resolver (TS fallback). For country/country+state keys,
   * falls back to the United States baseline if the requested country has
   * no entry. Returns undefined only when no US baseline is registered.
   */
  factoryValue(country?: string | null, subdivision?: string | null): unknown;
}

const depreciationYearsMeta = GOVERNED_FIELDS.depreciationYears!;
const daysPerMonthMeta = GOVERNED_FIELDS.daysPerMonth!;

/** Build a meta block for keys not yet present in GOVERNED_FIELDS. */
function buildMeta(fieldName: string, authority: string, helperText: string, referenceUrl?: string): GovernedFieldMeta {
  return {
    fieldName,
    authority,
    helperText,
    referenceUrl,
  } as GovernedFieldMeta;
}

const taxRateMeta = buildMeta(
  "Income tax rate",
  "Country corporate income tax statute (federal + state where applicable)",
  "Effective corporate income tax rate. For US, federal 21% plus state corporate tax.",
);
const costRateTaxesMeta = buildMeta(
  "Property tax (% of revenue)",
  "Local property/real-estate tax authority (municipal, state, or national)",
  "Property/real-estate taxes as % of revenue, mapped to the USALI Property Taxes line.",
);
const countryRiskPremiumMeta = buildMeta(
  "Country Risk Premium",
  "Damodaran NYU Stern Country Risk Premium table (Jan 2026)",
  "Equity risk premium add-on for the country, applied to the discount rate.",
  "https://pages.stern.nyu.edu/~adamodar/",
);
const inflationRateMeta = buildMeta(
  "Inflation rate",
  "Country central bank long-run inflation target / IMF WEO outlook",
  "Annual cost escalation rate. For dollarized economies (Argentina, El Salvador, Panama), reflects USD escalation, not local currency.",
);
const capitalGainsRateMeta = buildMeta(
  "Capital gains tax rate",
  "Country tax statute governing capital gains on real property",
  "Tax rate applied to gains on disposal of the property.",
);
const ffeReserveBenchmarkUsaliMeta = buildMeta(
  "FF&E Reserve Benchmark (USALI)",
  "USALI 11th Edition (Uniform System of Accounts for the Lodging Industry)",
  "Long-run FF&E reserve floor recommended for full-service / boutique hotels, expressed as % of gross revenue. Drives the adequacy badge on the Reserves & Brand Costs panel.",
  "https://www.ahla.com/usali",
);

export const MODEL_CONSTANTS_REGISTRY: Record<string, ConstantRegistryEntry> = {
  depreciationYears: {
    key: "depreciationYears",
    label: depreciationYearsMeta.fieldName,
    locality: "country",
    meta: depreciationYearsMeta,
    specialistOwned: true,
    factoryValue: (country) => {
      if (!country) return COUNTRY_DEFAULTS["United States"]!.depreciationYears;
      const def: CountryDefaults | undefined = COUNTRY_DEFAULTS[country];
      return def?.depreciationYears ?? COUNTRY_DEFAULTS["United States"]!.depreciationYears;
    },
  },
  daysPerMonth: {
    key: "daysPerMonth",
    label: daysPerMonthMeta.fieldName,
    locality: "universal",
    meta: daysPerMonthMeta,
    specialistOwned: true,
    factoryValue: () => DAYS_PER_MONTH,
  },
  taxRate: {
    key: "taxRate",
    label: taxRateMeta.fieldName,
    locality: "country+state",
    meta: taxRateMeta,
    specialistOwned: true,
    factoryValue: (country, subdivision) => {
      if (country === "United States" && subdivision) {
        const st: UsStateDefaults | undefined = US_STATE_DEFAULTS[subdivision];
        if (st) return st.taxRate;
      }
      if (!country) return COUNTRY_DEFAULTS["United States"]!.taxRate;
      const def: CountryDefaults | undefined = COUNTRY_DEFAULTS[country];
      return def?.taxRate ?? COUNTRY_DEFAULTS["United States"]!.taxRate;
    },
  },
  costRateTaxes: {
    key: "costRateTaxes",
    label: costRateTaxesMeta.fieldName,
    locality: "country+state",
    meta: costRateTaxesMeta,
    specialistOwned: true,
    factoryValue: (country, subdivision) => {
      if (country === "United States" && subdivision) {
        const st: UsStateDefaults | undefined = US_STATE_DEFAULTS[subdivision];
        if (st) return st.costRateTaxes;
      }
      if (!country) return COUNTRY_DEFAULTS["United States"]!.costRateTaxes;
      const def: CountryDefaults | undefined = COUNTRY_DEFAULTS[country];
      return def?.costRateTaxes ?? COUNTRY_DEFAULTS["United States"]!.costRateTaxes;
    },
  },
  countryRiskPremium: {
    key: "countryRiskPremium",
    label: countryRiskPremiumMeta.fieldName,
    locality: "country",
    meta: countryRiskPremiumMeta,
    specialistOwned: true,
    factoryValue: (country) => {
      if (!country) return COUNTRY_DEFAULTS["United States"]!.countryRiskPremium;
      const def: CountryDefaults | undefined = COUNTRY_DEFAULTS[country];
      return def?.countryRiskPremium ?? COUNTRY_DEFAULTS["United States"]!.countryRiskPremium;
    },
  },
  inflationRate: {
    key: "inflationRate",
    label: inflationRateMeta.fieldName,
    locality: "country",
    meta: inflationRateMeta,
    specialistOwned: true,
    factoryValue: (country) => {
      if (!country) return COUNTRY_DEFAULTS["United States"]!.inflationRate;
      const def: CountryDefaults | undefined = COUNTRY_DEFAULTS[country];
      return def?.inflationRate ?? COUNTRY_DEFAULTS["United States"]!.inflationRate;
    },
  },
  capitalGainsRate: {
    key: "capitalGainsRate",
    label: capitalGainsRateMeta.fieldName,
    locality: "country",
    meta: capitalGainsRateMeta,
    specialistOwned: true,
    factoryValue: (country) => {
      if (!country) return COUNTRY_DEFAULTS["United States"]!.capitalGainsRate;
      const def: CountryDefaults | undefined = COUNTRY_DEFAULTS[country];
      return def?.capitalGainsRate ?? COUNTRY_DEFAULTS["United States"]!.capitalGainsRate;
    },
  },
  ffeReserveBenchmarkUsali: {
    key: "ffeReserveBenchmarkUsali",
    label: ffeReserveBenchmarkUsaliMeta.fieldName,
    locality: "universal",
    meta: ffeReserveBenchmarkUsaliMeta,
    specialistOwned: true,
    factoryValue: () => USALI_FFE_RESERVE_BENCHMARK,
  },
  ...buildStructureOverlayRegistryEntries(),
  ...buildBenchmarkRegistryEntries(),
};

/**
 * Build registry entries for every operating-structure overlay scalar
 * defined in `STRUCTURE_OVERLAY_BASELINES`. Each entry resolves through the
 * country-delta table; admins can override per country via the standard
 * model-constants overlay path. Marked `specialistOwned: false` because
 * these are calibration estimates from industry surveys (HVS, JLL, CBRE) —
 * not authority-published values — and admins are permitted to edit them.
 */
function buildStructureOverlayRegistryEntries(): Record<string, ConstantRegistryEntry> {
  const STRUCTURE_OVERLAY_LABELS: Record<StructureOverlayKey, string> = {
    franchiseBrandRoyaltyOnRooms: "Franchise — brand royalty (% of room revenue)",
    franchiseBrandMarketingOnRooms: "Franchise — marketing fund (% of room revenue)",
    franchiseBrandReservationOnRooms: "Franchise — reservation fee (% of room revenue)",
    franchiseCapexFactor: "Franchise — capex factor (× FF&E reserve)",
    hmaBaseFeeOnRevenue: "HMA — base fee (% of total revenue)",
    hmaIncentiveFeeOnGop: "HMA — incentive fee (% of GOP)",
    softBrandRoyaltyOnRooms: "Hybrid — soft-brand royalty (% of room revenue)",
    softBrandMarketingOnRooms: "Hybrid — soft-brand marketing (% of room revenue)",
    softBrandReservationOnRooms: "Hybrid — soft-brand reservation (% of room revenue)",
    hybridHmaBaseFeeOnRevenue: "Hybrid — HMA base fee (% of total revenue)",
    hybridHmaIncentiveFeeOnGop: "Hybrid — HMA incentive (% of GOP)",
    hybridCapexFactor: "Hybrid — capex factor (× FF&E reserve)",
    masterLeaseBaseRentRevenueShare: "Master lease — base rent (% of stabilized revenue)",
    masterLeasePercentageRentOnRevenue: "Master lease — percentage rent (% of incremental revenue)",
    masterLeaseRentEscalator: "Master lease — annual rent escalator",
    masterLeaseTenantCapexFactor: "Master lease (tenant) — capex factor (× FF&E reserve)",
    masterLeaseLandlordCapexFactor: "Master lease (landlord) — capex factor (× FF&E reserve)",
    masterLeaseOperatorTakeCapOfGop: "Master lease (landlord) — operator take cap (% of GOP)",
  };
  const STRUCTURE_OVERLAY_AUTHORITY: Record<StructureOverlayKey, string> = {
    franchiseBrandRoyaltyOnRooms: "JLL 2024 Hotel Brand Fee Guide",
    franchiseBrandMarketingOnRooms: "JLL 2024 Hotel Brand Fee Guide",
    franchiseBrandReservationOnRooms: "JLL 2024 Hotel Brand Fee Guide",
    franchiseCapexFactor: "PIP Trends — JLL 2024",
    hmaBaseFeeOnRevenue: "HVS 2024 USA Hotel Management Survey",
    hmaIncentiveFeeOnGop: "HVS 2024 USA Hotel Management Survey",
    softBrandRoyaltyOnRooms: "JLL 2024 Soft-Brand Fee Guide",
    softBrandMarketingOnRooms: "JLL 2024 Soft-Brand Fee Guide",
    softBrandReservationOnRooms: "JLL 2024 Soft-Brand Fee Guide",
    hybridHmaBaseFeeOnRevenue: "HVS 2024 USA Hotel Management Survey",
    hybridHmaIncentiveFeeOnGop: "HVS 2024 USA Hotel Management Survey",
    hybridCapexFactor: "PIP Trends — JLL 2024",
    masterLeaseBaseRentRevenueShare: "CBRE 2024 Hotel Lease Comps",
    masterLeasePercentageRentOnRevenue: "CBRE 2024 Hotel Lease Comps",
    masterLeaseRentEscalator: "CBRE 2024 Hotel Lease Comps",
    masterLeaseTenantCapexFactor: "ISHC 2024 — capex allocation",
    masterLeaseLandlordCapexFactor: "ISHC 2024 — capex allocation",
    masterLeaseOperatorTakeCapOfGop: "CBRE 2024 Hotel Lease Comps",
  };
  const entries: Record<string, ConstantRegistryEntry> = {};
  for (const key of Object.keys(STRUCTURE_OVERLAY_BASELINES) as StructureOverlayKey[]) {
    entries[key] = {
      key,
      label: STRUCTURE_OVERLAY_LABELS[key],
      locality: "country",
      meta: buildMeta(STRUCTURE_OVERLAY_LABELS[key], STRUCTURE_OVERLAY_AUTHORITY[key], STRUCTURE_OVERLAY_LABELS[key]),
      specialistOwned: false,
      factoryValue: (country) => {
        const baseline = STRUCTURE_OVERLAY_BASELINES[key];
        if (!country) return baseline;
        const delta = STRUCTURE_OVERLAY_COUNTRY_DELTAS[country];
        if (!delta) return baseline;
        return delta[key] ?? baseline;
      },
    };
  }
  return entries;
}

/**
 * Build registry entries for every market benchmark band scalar.
 *
 * Each band dimension (low / mid / high) becomes an independent constant key
 * so admins can tune individual percentiles without touching the others.
 * Marked `specialistOwned: false` — these are market calibration estimates,
 * not authority-published values, and admins are permitted to edit them.
 * `locality: "universal"` — benchmarks are global (no country or state row).
 *
 * Sources: HVS, CBRE, AHLA, STR, BLLA, Damodaran, Duff & Phelps (see
 * the individual constants-*-benchmarks.ts files for per-key citations).
 */
function buildBenchmarkRegistryEntries(): Record<string, ConstantRegistryEntry> {
  type BandSpec = {
    keyBase: string;
    label: string;
    authority: string;
    unit: ConstantUnit;
    factoryLow: () => number;
    factoryMid: () => number;
    factoryHigh: () => number;
  };
  type ScalarSpec = {
    key: string;
    label: string;
    authority: string;
    unit: ConstantUnit;
    factory: () => number;
  };

  const BANDS: BandSpec[] = [
    // ── Compensation benchmarks ──────────────────────────────────────────────
    {
      keyBase: "benchmarkCompPartnerCompYear1",
      label: "Compensation — partner total comp Year 1 (USD/yr)",
      authority: "Hospitality ManCo compensation benchmarks (H+ Analytics 2024)",
      unit: "usd",
      factoryLow: () => DEFAULT_PARTNER_COMP_YEAR1_BENCHMARK_LOW,
      factoryMid: () => DEFAULT_PARTNER_COMP_YEAR1_BENCHMARK_MID,
      factoryHigh: () => DEFAULT_PARTNER_COMP_YEAR1_BENCHMARK_HIGH,
    },
    {
      keyBase: "benchmarkCompPartnerCompYear10",
      label: "Compensation — partner total comp Year 10 (USD/yr)",
      authority: "Hospitality ManCo compensation benchmarks (H+ Analytics 2024)",
      unit: "usd",
      factoryLow: () => DEFAULT_PARTNER_COMP_YEAR10_BENCHMARK_LOW,
      factoryMid: () => DEFAULT_PARTNER_COMP_YEAR10_BENCHMARK_MID,
      factoryHigh: () => DEFAULT_PARTNER_COMP_YEAR10_BENCHMARK_HIGH,
    },
    {
      keyBase: "benchmarkCompPartnerCountYear1",
      label: "Compensation — founding partner headcount Year 1",
      authority: "Hospitality ManCo compensation benchmarks (H+ Analytics 2024)",
      unit: "count",
      factoryLow: () => DEFAULT_PARTNER_COUNT_YEAR1_BENCHMARK_LOW,
      factoryMid: () => DEFAULT_PARTNER_COUNT_YEAR1_BENCHMARK_MID,
      factoryHigh: () => DEFAULT_PARTNER_COUNT_YEAR1_BENCHMARK_HIGH,
    },
    {
      keyBase: "benchmarkCompStaffSalary",
      label: "Compensation — average staff salary (USD/yr)",
      authority: "AHLA Lodging Industry Survey + hospitality market benchmarks",
      unit: "usd",
      factoryLow: () => DEFAULT_STAFF_SALARY_BENCHMARK_LOW,
      factoryMid: () => DEFAULT_STAFF_SALARY_BENCHMARK_MID,
      factoryHigh: () => DEFAULT_STAFF_SALARY_BENCHMARK_HIGH,
    },
    {
      keyBase: "benchmarkCompStaffTier3Fte",
      label: "Compensation — Tier-3 FTE count (max-scale staffing)",
      authority: "Hospitality ManCo compensation benchmarks (H+ Analytics 2024)",
      unit: "count",
      factoryLow: () => DEFAULT_STAFF_TIER3_FTE_BENCHMARK_LOW,
      factoryMid: () => DEFAULT_STAFF_TIER3_FTE_BENCHMARK_MID,
      factoryHigh: () => DEFAULT_STAFF_TIER3_FTE_BENCHMARK_HIGH,
    },
    // ── Revenue benchmarks ───────────────────────────────────────────────────
    {
      keyBase: "benchmarkRevMarketingRate",
      label: "Revenue — sales & marketing as % of total revenue (USALI Schedule 4)",
      authority: "HVS 2024 Hotel Cost Survey (boutique luxury)",
      unit: "percent",
      factoryLow: () => DEFAULT_MARKETING_RATE_BENCHMARK_LOW,
      factoryMid: () => DEFAULT_MARKETING_RATE_BENCHMARK_MID,
      factoryHigh: () => DEFAULT_MARKETING_RATE_BENCHMARK_HIGH,
    },
    {
      keyBase: "benchmarkRevFbRevenueShare",
      label: "Revenue — F&B as % of total revenue",
      authority: "STR/CoStar 2024 + BLLA 2024 boutique luxury operating mix",
      unit: "percent",
      factoryLow: () => DEFAULT_FB_REVENUE_SHARE_BENCHMARK_LOW,
      factoryMid: () => DEFAULT_FB_REVENUE_SHARE_BENCHMARK_MID,
      factoryHigh: () => DEFAULT_FB_REVENUE_SHARE_BENCHMARK_HIGH,
    },
    {
      keyBase: "benchmarkRevEventsRevenueShare",
      label: "Revenue — events as % of total revenue",
      authority: "STR/CoStar 2024 + BLLA 2024 boutique luxury operating mix",
      unit: "percent",
      factoryLow: () => DEFAULT_EVENTS_REVENUE_SHARE_BENCHMARK_LOW,
      factoryMid: () => DEFAULT_EVENTS_REVENUE_SHARE_BENCHMARK_MID,
      factoryHigh: () => DEFAULT_EVENTS_REVENUE_SHARE_BENCHMARK_HIGH,
    },
    {
      keyBase: "benchmarkRevOtherRevenueShare",
      label: "Revenue — other operated departments as % of total revenue",
      authority: "STR/CoStar 2024 + BLLA 2024 boutique luxury operating mix",
      unit: "percent",
      factoryLow: () => DEFAULT_OTHER_REVENUE_SHARE_BENCHMARK_LOW,
      factoryMid: () => DEFAULT_OTHER_REVENUE_SHARE_BENCHMARK_MID,
      factoryHigh: () => DEFAULT_OTHER_REVENUE_SHARE_BENCHMARK_HIGH,
    },
    {
      keyBase: "benchmarkRevCateringBoostPct",
      label: "Revenue — catering boost additive uplift on F&B",
      authority: "Industry rule-of-thumb — off-property catering / private events",
      unit: "percent",
      factoryLow: () => DEFAULT_CATERING_BOOST_PCT_BENCHMARK_LOW,
      factoryMid: () => DEFAULT_CATERING_BOOST_PCT_BENCHMARK_MID,
      factoryHigh: () => DEFAULT_CATERING_BOOST_PCT_BENCHMARK_HIGH,
    },
    // ── Overhead benchmarks ──────────────────────────────────────────────────
    {
      keyBase: "benchmarkOverheadOfficeLease",
      label: "Overhead — corporate office lease + utilities (USD/yr)",
      authority: "AHLA Lodging Industry Survey + HFTP/AICPA practice benchmarks",
      unit: "usd",
      factoryLow: () => DEFAULT_OFFICE_LEASE_BENCHMARK_LOW,
      factoryMid: () => DEFAULT_OFFICE_LEASE_BENCHMARK_MID,
      factoryHigh: () => DEFAULT_OFFICE_LEASE_BENCHMARK_HIGH,
    },
    {
      keyBase: "benchmarkOverheadProfServices",
      label: "Overhead — professional services: legal + accounting + audit (USD/yr)",
      authority: "AICPA practice benchmarks for early-stage hospitality companies",
      unit: "usd",
      factoryLow: () => DEFAULT_PROFESSIONAL_SERVICES_BENCHMARK_LOW,
      factoryMid: () => DEFAULT_PROFESSIONAL_SERVICES_BENCHMARK_MID,
      factoryHigh: () => DEFAULT_PROFESSIONAL_SERVICES_BENCHMARK_HIGH,
    },
    {
      keyBase: "benchmarkOverheadTechInfra",
      label: "Overhead — corporate tech infrastructure (USD/yr)",
      authority: "HFTP Technology Survey for corporate-level IT spend",
      unit: "usd",
      factoryLow: () => DEFAULT_TECH_INFRA_BENCHMARK_LOW,
      factoryMid: () => DEFAULT_TECH_INFRA_BENCHMARK_MID,
      factoryHigh: () => DEFAULT_TECH_INFRA_BENCHMARK_HIGH,
    },
    {
      keyBase: "benchmarkOverheadBizInsurance",
      label: "Overhead — business insurance D&O/E&O/cyber (USD/yr)",
      authority: "Hospitality D&O / E&O / cyber liability premium benchmarks",
      unit: "usd",
      factoryLow: () => DEFAULT_BUSINESS_INSURANCE_BENCHMARK_LOW,
      factoryMid: () => DEFAULT_BUSINESS_INSURANCE_BENCHMARK_MID,
      factoryHigh: () => DEFAULT_BUSINESS_INSURANCE_BENCHMARK_HIGH,
    },
    {
      keyBase: "benchmarkOverheadTravelPerClient",
      label: "Overhead — travel cost per managed property (USD/yr)",
      authority: "AHLA per-property travel benchmarks",
      unit: "usd",
      factoryLow: () => DEFAULT_TRAVEL_COST_PER_CLIENT_BENCHMARK_LOW,
      factoryMid: () => DEFAULT_TRAVEL_COST_PER_CLIENT_BENCHMARK_MID,
      factoryHigh: () => DEFAULT_TRAVEL_COST_PER_CLIENT_BENCHMARK_HIGH,
    },
    {
      keyBase: "benchmarkOverheadItLicensePerClient",
      label: "Overhead — IT/licensing cost per managed property (USD/yr)",
      authority: "HFTP per-property tech-stack survey",
      unit: "usd",
      factoryLow: () => DEFAULT_IT_LICENSE_PER_CLIENT_BENCHMARK_LOW,
      factoryMid: () => DEFAULT_IT_LICENSE_PER_CLIENT_BENCHMARK_MID,
      factoryHigh: () => DEFAULT_IT_LICENSE_PER_CLIENT_BENCHMARK_HIGH,
    },
    // ── Property-defaults benchmarks ─────────────────────────────────────────
    {
      keyBase: "benchmarkPropDefaultsEventExpenseRate",
      label: "Property defaults — event/banquet cost as fraction of event revenue",
      authority: "AHLA/USALI F&B and Event Cost Benchmarks (11th ed.) + CBRE Hotel Operations Report",
      unit: "percent",
      factoryLow: () => DEFAULT_EVENT_EXPENSE_RATE_BENCHMARK_LOW,
      factoryMid: () => DEFAULT_EVENT_EXPENSE_RATE_BENCHMARK_MID,
      factoryHigh: () => DEFAULT_EVENT_EXPENSE_RATE_BENCHMARK_HIGH,
    },
    {
      keyBase: "benchmarkPropDefaultsOtherExpenseRate",
      label: "Property defaults — other/ancillary cost as fraction of other revenue",
      authority: "CBRE Trends in the Hotel Industry + USALI undistributed-department benchmarks",
      unit: "percent",
      factoryLow: () => DEFAULT_OTHER_EXPENSE_RATE_BENCHMARK_LOW,
      factoryMid: () => DEFAULT_OTHER_EXPENSE_RATE_BENCHMARK_MID,
      factoryHigh: () => DEFAULT_OTHER_EXPENSE_RATE_BENCHMARK_HIGH,
    },
    {
      keyBase: "benchmarkPropDefaultsUtilitiesVarSplit",
      label: "Property defaults — fraction of utilities treated as variable (vs. fixed)",
      authority: "ENERGY STAR Hotel Energy Intensity benchmarks + Cornell Hotel Sustainability Handbook",
      unit: "percent",
      factoryLow: () => DEFAULT_UTILITIES_VARIABLE_SPLIT_BENCHMARK_LOW,
      factoryMid: () => DEFAULT_UTILITIES_VARIABLE_SPLIT_BENCHMARK_MID,
      factoryHigh: () => DEFAULT_UTILITIES_VARIABLE_SPLIT_BENCHMARK_HIGH,
    },
    {
      keyBase: "benchmarkPropDefaultsSalesCommissionRate",
      label: "Property defaults — blended distribution/OTA commission rate",
      authority: "Kalibri Labs Direct Booking Study + AHLA Distribution Cost Study",
      unit: "percent",
      factoryLow: () => DEFAULT_SALES_COMMISSION_RATE_BENCHMARK_LOW,
      factoryMid: () => DEFAULT_SALES_COMMISSION_RATE_BENCHMARK_MID,
      factoryHigh: () => DEFAULT_SALES_COMMISSION_RATE_BENCHMARK_HIGH,
    },
    // ── Company benchmarks ────────────────────────────────────────────────────
    {
      keyBase: "benchmarkCompanyBaseMgmtFee",
      label: "Company — base management fee as % of total property revenue",
      authority: "AHLA/HLA operator survey + CBRE Hotel Management Fee Study",
      unit: "percent",
      factoryLow: () => DEFAULT_BASE_MGMT_FEE_BENCHMARK_LOW,
      factoryMid: () => DEFAULT_BASE_MGMT_FEE_BENCHMARK_MID,
      factoryHigh: () => DEFAULT_BASE_MGMT_FEE_BENCHMARK_HIGH,
    },
    {
      keyBase: "benchmarkCompanyIncentiveMgmtFee",
      label: "Company — incentive management fee as % of GOP",
      authority: "HVS Management Contract Study + STR/AHLA operator terms",
      unit: "percent",
      factoryLow: () => DEFAULT_INCENTIVE_MGMT_FEE_BENCHMARK_LOW,
      factoryMid: () => DEFAULT_INCENTIVE_MGMT_FEE_BENCHMARK_MID,
      factoryHigh: () => DEFAULT_INCENTIVE_MGMT_FEE_BENCHMARK_HIGH,
    },
    {
      keyBase: "benchmarkCompanyTaxRate",
      label: "Company — effective combined federal + state income tax rate",
      authority: "IRS corporate rates + AICPA combined federal + state benchmarks",
      unit: "percent",
      factoryLow: () => DEFAULT_COMPANY_TAX_RATE_BENCHMARK_LOW,
      factoryMid: () => DEFAULT_COMPANY_TAX_RATE_BENCHMARK_MID,
      factoryHigh: () => DEFAULT_COMPANY_TAX_RATE_BENCHMARK_HIGH,
    },
    {
      keyBase: "benchmarkCompanyCostOfEquity",
      label: "Company — cost of equity (WACC Re / DCF discount rate)",
      authority: "Damodaran (Lodging) + Duff & Phelps Kroll Cost of Capital Navigator 2024 + KPMG WACC Monitor + CBRE 2024 Hotel Investor Survey",
      unit: "percent",
      factoryLow: () => DEFAULT_COST_OF_EQUITY_BENCHMARK_LOW,
      factoryMid: () => DEFAULT_COST_OF_EQUITY_BENCHMARK_MID,
      factoryHigh: () => DEFAULT_COST_OF_EQUITY_BENCHMARK_HIGH,
    },
  ];

  const SCALARS: ScalarSpec[] = [
    // ── DSCR covenant thresholds ─────────────────────────────────────────────
    { key: "benchmarkDscrCovenantStandard", label: "DSCR — standard lender covenant (1.25×)", authority: "Standard lender covenant for hospitality real estate debt", unit: "ratio", factory: () => DSCR_COVENANT_STANDARD },
    { key: "benchmarkDscrCovenantCritical", label: "DSCR — critical below-1.0× threshold", authority: "Standard lender covenant for hospitality real estate debt", unit: "ratio", factory: () => DSCR_COVENANT_CRITICAL },
    // ── Stress scenario shock magnitudes ─────────────────────────────────────
    { key: "benchmarkStressOccupancyShock", label: "Stress — occupancy shock multiplier (−15%)", authority: "CBRE Hotels Research — standard recession/stress scenario calibration", unit: "ratio", factory: () => STRESS_OCCUPANCY_SHOCK },
    { key: "benchmarkStressAdrShock", label: "Stress — ADR shock multiplier (−10%)", authority: "CBRE Hotels Research — standard recession/stress scenario calibration", unit: "ratio", factory: () => STRESS_ADR_SHOCK },
    { key: "benchmarkStressRateShockDecimal", label: "Stress — interest rate shock (decimal, +200 bps)", authority: "CBRE Hotels Research — standard recession/stress scenario calibration", unit: "percent", factory: () => STRESS_RATE_SHOCK_DECIMAL },
    { key: "benchmarkStressCostShock", label: "Stress — operating cost shock multiplier (+20%)", authority: "CBRE Hotels Research — standard recession/stress scenario calibration", unit: "ratio", factory: () => STRESS_COST_SHOCK },
    { key: "benchmarkStressCombinedOccupancyShock", label: "Stress — combined scenario occupancy shock (−10%)", authority: "CBRE Hotels Research — combined stress scenario calibration", unit: "ratio", factory: () => STRESS_COMBINED_OCCUPANCY_SHOCK },
    { key: "benchmarkStressCombinedCostShock", label: "Stress — combined scenario cost shock (+10%)", authority: "CBRE Hotels Research — combined stress scenario calibration", unit: "ratio", factory: () => STRESS_COMBINED_COST_SHOCK },
    { key: "benchmarkStressSeverityNoiThreshold", label: "Stress — NOI decline threshold for moderate severity", authority: "CBRE Hotels Research — stress severity classification", unit: "ratio", factory: () => STRESS_SEVERITY_NOI_THRESHOLD },
    // ── Scale adjustment ─────────────────────────────────────────────────────
    { key: "benchmarkScaleAdjSmallProperty", label: "Scale — small-property cost premium (<10 rooms)", authority: "HVS Hotel Cost Benchmarks", unit: "ratio", factory: () => SCALE_ADJUSTMENT_SMALL_PROPERTY },
    { key: "benchmarkScaleAdjMediumProperty", label: "Scale — medium-property cost premium (10–19 rooms)", authority: "HVS Hotel Cost Benchmarks", unit: "ratio", factory: () => SCALE_ADJUSTMENT_MEDIUM_PROPERTY },
    // ── Occupancy fallback ───────────────────────────────────────────────────
    { key: "benchmarkDefaultFallbackOccupancy", label: "Occupancy — fallback when quality tier unknown (Upscale default)", authority: "STR Global Chain Scale Benchmarks", unit: "percent", factory: () => DEFAULT_FALLBACK_OCCUPANCY },
    // ── Staffing default scalars ─────────────────────────────────────────────
    { key: "benchmarkStaffDefaultSalary", label: "Staffing — default average staff salary (USD/yr)", authority: "AHLA Lodging Industry Survey + hospitality market benchmarks", unit: "usd", factory: () => DEFAULT_STAFF_SALARY },
    { key: "benchmarkStaffDefaultOfficeLease", label: "Staffing — default corporate office lease (USD/yr)", authority: "AHLA Lodging Industry Survey + HFTP/AICPA practice benchmarks", unit: "usd", factory: () => DEFAULT_OFFICE_LEASE },
    { key: "benchmarkStaffDefaultProfServices", label: "Staffing — default professional services (USD/yr)", authority: "AICPA practice benchmarks for early-stage hospitality companies", unit: "usd", factory: () => DEFAULT_PROFESSIONAL_SERVICES },
    { key: "benchmarkStaffDefaultTechInfra", label: "Staffing — default tech infrastructure (USD/yr)", authority: "HFTP Technology Survey for corporate-level IT spend", unit: "usd", factory: () => DEFAULT_TECH_INFRA },
    { key: "benchmarkStaffDefaultBizInsurance", label: "Staffing — default business insurance (USD/yr)", authority: "Hospitality D&O / E&O / cyber liability premium benchmarks", unit: "usd", factory: () => DEFAULT_BUSINESS_INSURANCE_COMPANY },
    { key: "benchmarkStaffDefaultTravelPerClient", label: "Staffing — default travel cost per property (USD/yr)", authority: "AHLA per-property travel benchmarks", unit: "usd", factory: () => DEFAULT_TRAVEL_PER_CLIENT },
    { key: "benchmarkStaffDefaultItLicensePerClient", label: "Staffing — default IT/licensing cost per property (USD/yr)", authority: "HFTP per-property tech-stack survey", unit: "usd", factory: () => DEFAULT_IT_LICENSE_PER_CLIENT },
  ];

  const entries: Record<string, ConstantRegistryEntry> = {};

  for (const b of BANDS) {
    const triples: Array<[string, () => number]> = [
      [`${b.keyBase}Low`,  b.factoryLow],
      [`${b.keyBase}Mid`,  b.factoryMid],
      [`${b.keyBase}High`, b.factoryHigh],
    ];
    for (const [key, factory] of triples) {
      const bandSuffix = key.slice(b.keyBase.length).toLowerCase();
      entries[key] = {
        key,
        label: `${b.label} — ${bandSuffix}`,
        locality: "universal",
        meta: buildMeta(b.label, b.authority, b.label),
        specialistOwned: false,
        factoryValue: factory,
      };
    }
  }

  for (const s of SCALARS) {
    entries[s.key] = {
      key: s.key,
      label: s.label,
      locality: "universal",
      meta: buildMeta(s.label, s.authority, s.label),
      specialistOwned: false,
      factoryValue: s.factory,
    };
  }

  return entries;
}

export const REGISTERED_CONSTANT_KEYS = Object.keys(MODEL_CONSTANTS_REGISTRY);

/**
 * Display unit for a constant. Constants are rendered to admins as
 * read-only cards; the unit suffix (`%`, `years`, `days`) clarifies
 * what the bare numeric value means without surfacing a free-form
 * "unit" column in the registry. Centralised here so the admin tab
 * and any future renderers stay consistent.
 */
export type ConstantUnit = "percent" | "years" | "days" | "ratio" | "usd" | "count";

const CONSTANT_UNIT_BY_KEY: Record<string, ConstantUnit> = {
  taxRate: "percent",
  capitalGainsRate: "percent",
  costRateTaxes: "percent",
  inflationRate: "percent",
  countryRiskPremium: "percent",
  depreciationYears: "years",
  daysPerMonth: "days",
  ffeReserveBenchmarkUsali: "percent",
  // Operating-structure overlays — fees / lease shares / escalators are
  // percent; capex factors are unitless ratios (× FF&E reserve).
  franchiseBrandRoyaltyOnRooms: "percent",
  franchiseBrandMarketingOnRooms: "percent",
  franchiseBrandReservationOnRooms: "percent",
  franchiseCapexFactor: "ratio",
  hmaBaseFeeOnRevenue: "percent",
  hmaIncentiveFeeOnGop: "percent",
  softBrandRoyaltyOnRooms: "percent",
  softBrandMarketingOnRooms: "percent",
  softBrandReservationOnRooms: "percent",
  hybridHmaBaseFeeOnRevenue: "percent",
  hybridHmaIncentiveFeeOnGop: "percent",
  hybridCapexFactor: "ratio",
  masterLeaseBaseRentRevenueShare: "percent",
  masterLeasePercentageRentOnRevenue: "percent",
  masterLeaseRentEscalator: "percent",
  masterLeaseTenantCapexFactor: "ratio",
  masterLeaseLandlordCapexFactor: "ratio",
  masterLeaseOperatorTakeCapOfGop: "percent",
  // ── Compensation benchmarks ────────────────────────────────────────────────
  benchmarkCompPartnerCompYear1Low: "usd",
  benchmarkCompPartnerCompYear1Mid: "usd",
  benchmarkCompPartnerCompYear1High: "usd",
  benchmarkCompPartnerCompYear10Low: "usd",
  benchmarkCompPartnerCompYear10Mid: "usd",
  benchmarkCompPartnerCompYear10High: "usd",
  benchmarkCompPartnerCountYear1Low: "count",
  benchmarkCompPartnerCountYear1Mid: "count",
  benchmarkCompPartnerCountYear1High: "count",
  benchmarkCompStaffSalaryLow: "usd",
  benchmarkCompStaffSalaryMid: "usd",
  benchmarkCompStaffSalaryHigh: "usd",
  benchmarkCompStaffTier3FteLow: "count",
  benchmarkCompStaffTier3FteMid: "count",
  benchmarkCompStaffTier3FteHigh: "count",
  // ── Revenue benchmarks ────────────────────────────────────────────────────
  benchmarkRevMarketingRateLow: "percent",
  benchmarkRevMarketingRateMid: "percent",
  benchmarkRevMarketingRateHigh: "percent",
  benchmarkRevFbRevenueShareLow: "percent",
  benchmarkRevFbRevenueShareMid: "percent",
  benchmarkRevFbRevenueShareHigh: "percent",
  benchmarkRevEventsRevenueShareLow: "percent",
  benchmarkRevEventsRevenueShareMid: "percent",
  benchmarkRevEventsRevenueShareHigh: "percent",
  benchmarkRevOtherRevenueShareLow: "percent",
  benchmarkRevOtherRevenueShareMid: "percent",
  benchmarkRevOtherRevenueShareHigh: "percent",
  benchmarkRevCateringBoostPctLow: "percent",
  benchmarkRevCateringBoostPctMid: "percent",
  benchmarkRevCateringBoostPctHigh: "percent",
  // ── Overhead benchmarks ───────────────────────────────────────────────────
  benchmarkOverheadOfficeLeaseLow: "usd",
  benchmarkOverheadOfficeLeaseMid: "usd",
  benchmarkOverheadOfficeLeaseHigh: "usd",
  benchmarkOverheadProfServicesLow: "usd",
  benchmarkOverheadProfServicesMid: "usd",
  benchmarkOverheadProfServicesHigh: "usd",
  benchmarkOverheadTechInfraLow: "usd",
  benchmarkOverheadTechInfraMid: "usd",
  benchmarkOverheadTechInfraHigh: "usd",
  benchmarkOverheadBizInsuranceLow: "usd",
  benchmarkOverheadBizInsuranceMid: "usd",
  benchmarkOverheadBizInsuranceHigh: "usd",
  benchmarkOverheadTravelPerClientLow: "usd",
  benchmarkOverheadTravelPerClientMid: "usd",
  benchmarkOverheadTravelPerClientHigh: "usd",
  benchmarkOverheadItLicensePerClientLow: "usd",
  benchmarkOverheadItLicensePerClientMid: "usd",
  benchmarkOverheadItLicensePerClientHigh: "usd",
  // ── Property-defaults benchmarks ─────────────────────────────────────────
  benchmarkPropDefaultsEventExpenseRateLow: "percent",
  benchmarkPropDefaultsEventExpenseRateMid: "percent",
  benchmarkPropDefaultsEventExpenseRateHigh: "percent",
  benchmarkPropDefaultsOtherExpenseRateLow: "percent",
  benchmarkPropDefaultsOtherExpenseRateMid: "percent",
  benchmarkPropDefaultsOtherExpenseRateHigh: "percent",
  benchmarkPropDefaultsUtilitiesVarSplitLow: "percent",
  benchmarkPropDefaultsUtilitiesVarSplitMid: "percent",
  benchmarkPropDefaultsUtilitiesVarSplitHigh: "percent",
  benchmarkPropDefaultsSalesCommissionRateLow: "percent",
  benchmarkPropDefaultsSalesCommissionRateMid: "percent",
  benchmarkPropDefaultsSalesCommissionRateHigh: "percent",
  // ── Company benchmarks ────────────────────────────────────────────────────
  benchmarkCompanyBaseMgmtFeeLow: "percent",
  benchmarkCompanyBaseMgmtFeeMid: "percent",
  benchmarkCompanyBaseMgmtFeeHigh: "percent",
  benchmarkCompanyIncentiveMgmtFeeLow: "percent",
  benchmarkCompanyIncentiveMgmtFeeMid: "percent",
  benchmarkCompanyIncentiveMgmtFeeHigh: "percent",
  benchmarkCompanyTaxRateLow: "percent",
  benchmarkCompanyTaxRateMid: "percent",
  benchmarkCompanyTaxRateHigh: "percent",
  benchmarkCompanyCostOfEquityLow: "percent",
  benchmarkCompanyCostOfEquityMid: "percent",
  benchmarkCompanyCostOfEquityHigh: "percent",
  // ── Stress / DSCR / scale scalars ─────────────────────────────────────────
  benchmarkDscrCovenantStandard: "ratio",
  benchmarkDscrCovenantCritical: "ratio",
  benchmarkStressOccupancyShock: "ratio",
  benchmarkStressAdrShock: "ratio",
  benchmarkStressRateShockDecimal: "percent",
  benchmarkStressCostShock: "ratio",
  benchmarkStressCombinedOccupancyShock: "ratio",
  benchmarkStressCombinedCostShock: "ratio",
  benchmarkStressSeverityNoiThreshold: "ratio",
  benchmarkScaleAdjSmallProperty: "ratio",
  benchmarkScaleAdjMediumProperty: "ratio",
  benchmarkDefaultFallbackOccupancy: "percent",
  // ── Staffing default scalars ──────────────────────────────────────────────
  benchmarkStaffDefaultSalary: "usd",
  benchmarkStaffDefaultOfficeLease: "usd",
  benchmarkStaffDefaultProfServices: "usd",
  benchmarkStaffDefaultTechInfra: "usd",
  benchmarkStaffDefaultBizInsurance: "usd",
  benchmarkStaffDefaultTravelPerClient: "usd",
  benchmarkStaffDefaultItLicensePerClient: "usd",
};

export function getConstantUnit(key: string): ConstantUnit {
  return CONSTANT_UNIT_BY_KEY[key] ?? "ratio";
}

export function hasStateOverlay(key: string, country: string | null | undefined): boolean {
  const entry = MODEL_CONSTANTS_REGISTRY[key];
  return !!entry && entry.locality === "country+state" && country === "United States";
}

/**
 * Compile-time-checked union of every key currently registered in
 * `MODEL_CONSTANTS_REGISTRY`. New keys added to the registry literal are
 * picked up automatically. Audit #319 R4 — typed accessors.
 */
export type RegisteredConstantKey = keyof typeof MODEL_CONSTANTS_REGISTRY;

export function getFactoryValue(
  key: RegisteredConstantKey,
  country?: string | null,
  subdivision?: string | null,
): unknown {
  const entry = MODEL_CONSTANTS_REGISTRY[key];
  if (!entry) return undefined;
  return entry.factoryValue(country, subdivision);
}

/**
 * Typed factory accessor. All seven registered keys today resolve to numbers
 * (`taxRate`, `depreciationYears`, `inflationRate`, `costRateTaxes`,
 * `countryRiskPremium`, `capitalGainsRate`, `daysPerMonth`). This wrapper
 * removes the `unknown`-cast noise from call sites and throws fast if a
 * future non-numeric key is added without updating consumers.
 *
 * Audit Task #319 R4 — preferred read path. Direct imports of the legacy
 * `DEFAULT_*` exports are now `@deprecated`.
 */
export function getFactoryNumber(
  key: RegisteredConstantKey,
  country?: string | null,
  subdivision?: string | null,
): number {
  const value = getFactoryValue(key, country, subdivision);
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `getFactoryNumber: registry key "${key}" returned non-numeric value (got ${typeof value})`,
    );
  }
  return value;
}

/**
 * Provenance of a registry-resolved value. Renderers (badges, tooltips,
 * explainers) use this to tell users *why* a property's tax / inflation /
 * depreciation number is what it is, without forcing every surface to
 * re-implement the country / state / override cascade.
 *
 * Cascade order (highest priority first):
 *   1. `propertyOverride` — value stored on the property row itself.
 *   2. `stateOverlay`     — US state row in `US_STATE_DEFAULTS` (only for
 *                            `country+state` keys with country = "United States").
 *   3. `countryDefault`   — country row in `COUNTRY_DEFAULTS` (any country
 *                            other than the United States itself).
 *   4. `baseline`         — universal fallback. For country/country+state
 *                            keys this is the United States row in
 *                            `COUNTRY_DEFAULTS`; for `universal` keys it is
 *                            the single global value.
 */
export type FactorySourceKind =
  | "propertyOverride"
  | "stateOverlay"
  | "countryDefault"
  | "baseline";

export interface FactorySource {
  /** Numeric value resolved from the cascade (decimal for percent keys). */
  value: number;
  /** Where the value came from. */
  kind: FactorySourceKind;
  /** Short user-facing label, e.g. `"1.8% — Texas overlay"`. */
  label: string;
  /** Country used for the resolution (or "United States" if none was given). */
  country: string;
  /** Subdivision used for the resolution (only meaningful for state overlays). */
  subdivision: string | null;
}

function formatFactoryValue(value: number, unit: ConstantUnit): string {
  switch (unit) {
    case "percent": {
      // 0.0125 → "1.25%", 0.012 → "1.2%", 0.018 → "1.8%".
      // toFixed(2) then parseFloat strips trailing zeros while keeping
      // the meaningful decimal for sub-1% rates like Costa Rica's 0.25%.
      const pct = value * 100;
      return `${parseFloat(pct.toFixed(2))}%`;
    }
    case "years":
      return `${value} years`;
    case "days":
      return `${value} days`;
    case "usd":
      return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
    case "count":
      return `${value}`;
    case "ratio":
    default:
      return `${value}`;
  }
}

/**
 * Describe where a registry-resolved value came from. See `FactorySource`
 * for the cascade order. The label is meant to be shown verbatim in a small
 * badge or tooltip ("1.2% — United States baseline" / "1.8% — Texas overlay" /
 * "0.25% — Costa Rica country default" / "1.5% — property override") so
 * Property Edit, the Yearly Income Statement explainer, and the PP&E /
 * Cost-Basis Schedule all describe the same value the same way.
 *
 * Pass `propertyOverride` whenever the property row stores its own copy of
 * the value — for `costRateTaxes` that is `property.costRateTaxes`. When it
 * is `null` / `undefined`, the cascade falls through to country / state /
 * baseline as appropriate.
 */
export function describeFactorySource(
  key: RegisteredConstantKey,
  country?: string | null,
  subdivision?: string | null,
  propertyOverride?: number | null,
): FactorySource {
  const entry = MODEL_CONSTANTS_REGISTRY[key];
  if (!entry) {
    throw new Error(`describeFactorySource: unknown registry key "${key}"`);
  }

  const unit = getConstantUnit(key);
  const fmt = (v: number) => formatFactoryValue(v, unit);
  const resolvedCountry = country ?? "United States";
  const resolvedSubdivision = subdivision ?? null;

  // 1. Property override wins over every locality default.
  if (propertyOverride != null && Number.isFinite(propertyOverride)) {
    return {
      value: propertyOverride,
      kind: "propertyOverride",
      label: `${fmt(propertyOverride)} — property override`,
      country: resolvedCountry,
      subdivision: resolvedSubdivision,
    };
  }

  // 2. US state overlay (only relevant for country+state keys).
  if (
    entry.locality === "country+state" &&
    country === "United States" &&
    subdivision
  ) {
    const stateRow = US_STATE_DEFAULTS[subdivision] as
      | (UsStateDefaults & Record<string, unknown>)
      | undefined;
    const stateValue = stateRow?.[key];
    if (typeof stateValue === "number" && Number.isFinite(stateValue)) {
      return {
        value: stateValue,
        kind: "stateOverlay",
        label: `${fmt(stateValue)} — ${subdivision} overlay`,
        country: "United States",
        subdivision,
      };
    }
  }

  // 3. Country default (skip when the country is the United States — that
  //    is the baseline, not an overlay).
  if (entry.locality !== "universal" && country && country !== "United States") {
    const countryRow = COUNTRY_DEFAULTS[country] as
      | (CountryDefaults & Record<string, unknown>)
      | undefined;
    const countryValue = countryRow?.[key];
    if (typeof countryValue === "number" && Number.isFinite(countryValue)) {
      return {
        value: countryValue,
        kind: "countryDefault",
        label: `${fmt(countryValue)} — ${country} country default`,
        country,
        subdivision: resolvedSubdivision,
      };
    }
  }

  // 4. Baseline — let the registry's own factoryValue do the final fallback
  //    (US row for country / country+state keys, the global constant for
  //    universal keys). This is the source of truth so we never drift from
  //    `getFactoryNumber`.
  const fallbackValue = entry.factoryValue(country, subdivision);
  if (typeof fallbackValue !== "number" || !Number.isFinite(fallbackValue)) {
    throw new Error(
      `describeFactorySource: registry key "${key}" returned non-numeric fallback (got ${typeof fallbackValue})`,
    );
  }

  if (entry.locality === "universal") {
    return {
      value: fallbackValue,
      kind: "baseline",
      label: `${fmt(fallbackValue)} — global baseline`,
      country: resolvedCountry,
      subdivision: resolvedSubdivision,
    };
  }

  return {
    value: fallbackValue,
    kind: "baseline",
    label: `${fmt(fallbackValue)} — United States baseline`,
    country: resolvedCountry,
    subdivision: resolvedSubdivision,
  };
}

export type { CountryDefaults, UsStateDefaults };
