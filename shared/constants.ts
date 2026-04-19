/**
 * shared/constants.ts — Single Source of Truth for Financial Defaults
 *
 * Every default value that the financial engine, seed data, verification checker,
 * and UI all rely on lives here (or in the sub-files re-exported below).
 * Changing a value here automatically propagates across the entire stack
 * (client + server). These constants represent industry-standard benchmarks
 * from USALI (Uniform System of Accounts for the Lodging Industry),
 * IRS publications, and HVS fee surveys.
 *
 * How these are used:
 *   - The database schema (shared/schema.ts) references them as column defaults
 *   - The financial engine uses them as fallbacks when a property hasn't
 *     overridden a particular rate
 *   - The verification checker compares calculated values against these defaults
 *     to detect anomalies
 *
 * Two categories:
 *   IMMUTABLE — Fixed by IRS/GAAP, never change:
 *     DEPRECIATION_YEARS (39), DAYS_PER_MONTH (30.5)
 *   CONFIGURABLE — User-overridable defaults (DEFAULT_* prefix):
 *     All other constants. Database value takes precedence; these are fallbacks.
 */

// ── Re-exports from sub-files ───────────────────────────────────────────
export * from './constants-business-models';
export * from './constants-funding';
export * from './constants-research';
export * from './constants-capex';
export * from './constants-staffing';
export * from './constants-enums';

// ──────────────────────────────────────────────────────────
// REVENUE STREAM SHARES (% of TOTAL revenue)
// Each property generates revenue from multiple sources. These percentages
// express what fraction of TOTAL revenue each ancillary stream represents.
// Room revenue share is derived: 1 - events - fb - other.
// For example, events=0.18 + fb=0.30 + other=0.03 = 0.51 ancillary,
// so rooms = 49% of total, and totalRevenue = roomRevenue / 0.49.
// ──────────────────────────────────────────────────────────

// Events share — 18% of total revenue (meetings, weddings, conferences).
// Boutique wellness/retreat properties with dedicated event programming.
// Source: Global Wellness Institute 2024 — wellness retreats generate 25-35% of total revenue.
export const DEFAULT_REV_SHARE_EVENTS = 0.18;
// Food & Beverage — 30% of total revenue (restaurant, bar, room service, catering).
export const DEFAULT_REV_SHARE_FB = 0.30;
// Other revenue (parking, spa, gift shop, etc.) — 3% of total revenue.
export const DEFAULT_REV_SHARE_OTHER = 0.03;

// Catering boost: DEPRECATED for revenue calculation. F&B share now directly
// represents the target F&B % of total revenue (catering boost absorbed).
// Kept at 0 for backward compatibility; field not removed from interfaces.
export const DEFAULT_CATERING_BOOST_PCT = 0;

// ──────────────────────────────────────────────────────────
// EXPENSE RATES (GLOBAL-CONFIGURABLE)
// Applied to specific revenue streams to compute their direct costs.
// ──────────────────────────────────────────────────────────

// Event expense rate: 65% of event revenue goes to direct event costs
export const DEFAULT_EVENT_EXPENSE_RATE = 0.65;
// Other revenue expense rate: 60% of other revenue goes to direct costs
export const DEFAULT_OTHER_EXPENSE_RATE = 0.60;
// What fraction of total utility cost is variable (scales with occupancy)
// vs. fixed (base load regardless of guests). 60% variable / 40% fixed.
export const DEFAULT_UTILITIES_VARIABLE_SPLIT = 0.60;

// ──────────────────────────────────────────────────────────
// PROPERTY OPERATING COST RATES (USALI CATEGORIES)
// Each rate is a percentage of total property revenue allocated to that
// department. These follow USALI (Uniform System of Accounts for the
// Lodging Industry) standard departmental expense categories.
// ──────────────────────────────────────────────────────────

export const DEFAULT_COST_RATE_ROOMS = 0.20;       // Rooms department (housekeeping, front desk, linens)
export const DEFAULT_COST_RATE_FB = 0.09;           // Food & Beverage cost of goods + labor
export const DEFAULT_COST_RATE_ADMIN = 0.08;        // General & Administrative (G&A)
export const DEFAULT_COST_RATE_MARKETING = 0.01;    // Sales & Marketing
export const DEFAULT_COST_RATE_PROPERTY_OPS = 0.04; // Property Operations & Maintenance (POM)
export const DEFAULT_COST_RATE_UTILITIES = 0.05;    // Utilities (electric, water, gas, internet)
export const DEFAULT_COST_RATE_TAXES = 0.03;        // Property/real estate taxes
export const DEFAULT_COST_RATE_IT = 0.005;          // Information Technology
export const DEFAULT_COST_RATE_FFE = 0.04;          // Furniture, Fixtures & Equipment reserve (FF&E)
export const DEFAULT_COST_RATE_OTHER = 0.05;        // Miscellaneous / other operating expenses
export const DEFAULT_COST_RATE_INSURANCE = 0.015;   // Property insurance (liability, property, business interruption)
export const DEFAULT_BUSINESS_INSURANCE_START = 12000; // Company-level annual business insurance ($)

// ──────────────────────────────────────────────────────────
// MANAGEMENT COMPANY FEE DEFAULTS
// The management company charges each property two types of fees:
//   1. Base fee: a flat percentage of total revenue (compensation for day-to-day operations)
//   2. Incentive fee: a percentage of Gross Operating Profit (GOP) that rewards performance
// Source: HVS Fee Survey 2024 — Specialty/wellness operators command 6-10% base + 12-20% incentive
// ──────────────────────────────────────────────────────────

export const DEFAULT_BASE_MANAGEMENT_FEE_RATE = 0.085;      // 8.5% of Total Revenue
export const DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE = 0.12;   // 12% of Gross Operating Profit

// ──────────────────────────────────────────────────────────
// SERVICE FEE CATEGORIES (GRANULAR BREAKDOWN)
// Instead of a single base management fee, each property can break down fees
// into specific service categories. The sum of these default rates (8.5%)
// intentionally matches DEFAULT_BASE_MANAGEMENT_FEE_RATE above.
// ──────────────────────────────────────────────────────────

export const DEFAULT_SERVICE_FEE_CATEGORIES = [
  { name: "Marketing & Brand", rate: 0.02, sortOrder: 1 },              // 2.0% — brand, digital, campaigns, franchise
  { name: "Technology & Reservations", rate: 0.025, sortOrder: 2 },   // 2.5% — PMS, booking engine, channel manager, CRS
  { name: "Accounting", rate: 0.015, sortOrder: 3 },                  // 1.5% — bookkeeping, reporting, audit prep
  { name: "Revenue Management", rate: 0.01, sortOrder: 4 },           // 1.0% — dynamic pricing, demand forecasting
  { name: "General Management", rate: 0.015, sortOrder: 5 },          // 1.5% — executive oversight, HR
] as const;

// ──────────────────────────────────────────────────────────
// CENTRALIZED SERVICES DEFAULTS
// ──────────────────────────────────────────────────────────

export const DEFAULT_SERVICE_MARKUP = 0.20;

export type ServiceModel = 'centralized' | 'direct';
export const DEFAULT_SERVICE_MODEL: ServiceModel = 'centralized';

export const DEFAULT_SERVICE_TEMPLATES = [
  { name: "Marketing & Brand",        defaultRate: 0.02,  serviceModel: 'centralized' as ServiceModel, serviceMarkup: 0.20, sortOrder: 1 },
  { name: "Technology & Reservations", defaultRate: 0.025, serviceModel: 'centralized' as ServiceModel, serviceMarkup: 0.20, sortOrder: 2 },
  { name: "Accounting",               defaultRate: 0.015, serviceModel: 'centralized' as ServiceModel, serviceMarkup: 0.20, sortOrder: 3 },
  { name: "Revenue Management",       defaultRate: 0.01,  serviceModel: 'centralized' as ServiceModel, serviceMarkup: 0.20, sortOrder: 4 },
  { name: "General Management",       defaultRate: 0.015, serviceModel: 'direct'      as ServiceModel, serviceMarkup: 0.20, sortOrder: 5 },
  { name: "Procurement",              defaultRate: 0.01,  serviceModel: 'centralized' as ServiceModel, serviceMarkup: 0.20, sortOrder: 6 },
] as const;

// ──────────────────────────────────────────────────────────
// EXIT & SALE DEFAULTS
// ──────────────────────────────────────────────────────────

export const DEFAULT_EXIT_CAP_RATE = 0.085;
export const DEFAULT_PROPERTY_INCOME_TAX_RATE = 0.25;
export const DEFAULT_COMMISSION_RATE = 0.05;

/**
 * SEED_EXIT_CAP_RATE_LUXURY — L+B Hospitality persona override.
 *
 * Used in the seeded global_assumptions baseline row instead of the
 * system-wide DEFAULT_EXIT_CAP_RATE (8.5%) because the L+B portfolio is
 * boutique-luxury (10–80 rooms, $250–600 ADR), and luxury hotel cap rates
 * compress materially below the broader US hotel average.
 *
 * Grounded in cached benchmark `us_luxury_cap_rate = 6.2%` from
 * CBRE Hotel Cap Rate Survey 2024 (benchmark_snapshots row id=32).
 *
 * The system-wide DEFAULT_EXIT_CAP_RATE is intentionally left at 8.5%
 * as the cascade fallback for any new property/company that has not
 * declared a luxury qualityTier.
 */
export const SEED_EXIT_CAP_RATE_LUXURY = 0.062;

// ──────────────────────────────────────────────────────────
// DEPRECIATION & LAND VALUE
// ──────────────────────────────────────────────────────────

export const DEFAULT_LAND_VALUE_PERCENT = 0.25;

// Default depreciation period — US nonresidential real property (hotels) per
// IRS Publication 946, IRC §168(e)(2)(A), straight-line MACRS over 39 years.
export const DEPRECIATION_YEARS = 39;

// ──────────────────────────────────────────────────────────
// TIME CONSTANTS
// ──────────────────────────────────────────────────────────

export const MONTHS_PER_YEAR = 12;
export const DAYS_PER_MONTH = 30.5;

// ──────────────────────────────────────────────────────────
// GOVERNED FIELD REGISTRY
// ──────────────────────────────────────────────────────────
export interface GovernedFieldMeta {
  fieldName: string;
  authority: string;
  value: string;
  helperText: string;
  referenceUrl?: string;
}

export const GOVERNED_FIELDS: Record<string, GovernedFieldMeta> = {
  depreciationYears: {
    fieldName: "Depreciation Years",
    authority: "Local tax authority (US default: IRS Publication 946)",
    value: "Varies by country (US: 39 years)",
    helperText:
      "Straight-line depreciation period set by the property's local tax authority. US default: 39 years for nonresidential real property (hotels per IRC §168(e)(2)(A)). Other jurisdictions vary — see country defaults table. The calculation method always follows US GAAP (ASC 360, straight-line); only the useful life period changes. Consult your tax advisor before overriding.",
    referenceUrl: "https://www.irs.gov/publications/p946",
  },
  daysPerMonth: {
    fieldName: "Days Per Month",
    authority: "Industry convention (365/12)",
    value: "30.5 days",
    helperText:
      "The hospitality industry standard of 30.5 days per month (365 ÷ 12 = 30.4167, rounded to 30.5) is used for monthly revenue and expense calculations. This ensures consistent monthly periods across all properties and avoids calendar-month variability in financial projections.",
    referenceUrl: "https://www.ahla.com/resources",
  },
};

export const DEFAULT_OCCUPANCY_RAMP_MONTHS = 6;

// ──────────────────────────────────────────────────────────
// PROPERTY-LEVEL DEFAULTS
// ──────────────────────────────────────────────────────────

export const DEFAULT_ROOM_COUNT = 10;
export const DEFAULT_START_ADR = 250;
export const DEFAULT_MAX_OCCUPANCY = 0.85;
export const DEFAULT_ADR_GROWTH_RATE = 0.03;
export const DEFAULT_START_OCCUPANCY = 0.55;
export const DEFAULT_STABILIZATION_MONTHS = 36;

// ──────────────────────────────────────────────────────────
// INFLATION & COST ESCALATION
// ──────────────────────────────────────────────────────────

export const DEFAULT_PROPERTY_INFLATION_RATE = 0.03;
export const DEFAULT_COMPANY_INFLATION_RATE = 0.03;
export const DEFAULT_FIXED_COST_ESCALATION_RATE = DEFAULT_PROPERTY_INFLATION_RATE;
export const DEFAULT_COMPANY_TAX_RATE = 0.30;

// ──────────────────────────────────────────────────────────
// PROJECTION HORIZON
// ──────────────────────────────────────────────────────────

export const DEFAULT_PROJECTION_YEARS = 10;

// ──────────────────────────────────────────────────────────
// MODEL TIMELINE DEFAULTS
// ──────────────────────────────────────────────────────────
// Date the management company begins operations by default. Drives seed
// data, DB column defaults, sync helpers, and UI fallbacks. Keeping this
// in one place prevents the literal from drifting across call sites.
export const DEFAULT_COMPANY_OPS_START_DATE = "2026-06-01";

// First funding tranche disbursement date. Drives schema column default,
// dev + production seed fallbacks, and the user-manual documentation row.
export const DEFAULT_CAPITAL_RAISE_1_DATE = "2026-06-01";

// Second funding tranche disbursement date. Same pattern as raise 1.
export const DEFAULT_CAPITAL_RAISE_2_DATE = "2027-04-01";

// ──────────────────────────────────────────────────────────
// AI AGENT & SCENARIO DEFAULTS
// ──────────────────────────────────────────────────────────

export const DEFAULT_AI_AGENT_NAME = "Rebecca";
export const DEFAULT_MAX_STALENESS_HOURS = 24;
export const USE_STABLE_SCENARIO_LOAD = true;
export const DEFAULT_ALERT_COOLDOWN_MINUTES = 1440;

// ── Working Capital Defaults ────────────────────────────────────────────
export const WORKING_CAPITAL_DAYS_PER_MONTH = 30;
export const DEFAULT_AR_DAYS = 30;
export const DEFAULT_AP_DAYS = 45;

// ── MIRR Defaults ───────────────────────────────────────────────────────
export const DEFAULT_REINVESTMENT_RATE = 0.05;

// ── Day-Count Convention ────────────────────────────────────────────────
export type DayCountConvention = '30/360' | 'ACT/360' | 'ACT/365';
export const DEFAULT_DAY_COUNT_CONVENTION: DayCountConvention = '30/360';

// ── Escalation Method ───────────────────────────────────────────────────
export type EscalationMethod = 'annual' | 'monthly';
export const DEFAULT_ESCALATION_METHOD: EscalationMethod = 'annual';

// ── NOL (Net Operating Loss) Defaults ───────────────────────────────────
export const NOL_UTILIZATION_CAP = 0.8;

// ── Cost Segregation Defaults ───────────────────────────────────────────
export const DEFAULT_COST_SEG_5YR_PCT = 0.15;
export const DEFAULT_COST_SEG_7YR_PCT = 0.10;
export const DEFAULT_COST_SEG_15YR_PCT = 0.05;
export const COST_SEG_5YR_LIFE_MONTHS = 60;
export const COST_SEG_7YR_LIFE_MONTHS = 84;
export const COST_SEG_15YR_LIFE_MONTHS = 180;
export const COST_SEG_5YR_LIFE_YEARS = 5;
export const COST_SEG_7YR_LIFE_YEARS = 7;
export const COST_SEG_15YR_LIFE_YEARS = 15;

// ── Loan / Financing Defaults ───────────────────────────────────────────
export const DEFAULT_LTV = 0.75;
export const DEFAULT_INTEREST_RATE = 0.09;
export const DEFAULT_TERM_YEARS = 25;
export const DEFAULT_REFI_LTV = 0.65;
export const DEFAULT_REFI_CLOSING_COST_RATE = 0.03;
export const DEFAULT_ACQ_CLOSING_COST_RATE = 0.02;
export const DEFAULT_REFI_PERIOD_YEARS = 3;

// ── Management Company Cost Rates ───────────────────────────────────────
export const DEFAULT_STAFF_SALARY = 65000;
export const DEFAULT_OFFICE_LEASE_START = 36000;
export const DEFAULT_PROFESSIONAL_SERVICES_START = 24000;
export const DEFAULT_TECH_INFRA_START = 18000;
export const DEFAULT_TRAVEL_COST_PER_CLIENT = 5000;
export const DEFAULT_IT_LICENSE_PER_CLIENT = 3600;
export const DEFAULT_MARKETING_RATE = 0.05;
export const DEFAULT_MISC_OPS_RATE = 0.03;

// ── Operating Reserve / Funding Buffers ─────────────────────────────────
export const OPERATING_RESERVE_BUFFER = 50_000;
export const COMPANY_FUNDING_BUFFER = 100_000;
export const RESERVE_ROUNDING_INCREMENT = 10_000;

// ── Property Defaults ───────────────────────────────────────────────────
export const DEFAULT_OCCUPANCY_GROWTH_STEP = 0.05;
export const DEFAULT_PARTNER_COUNT = 3;

export const DEFAULT_COST_OF_EQUITY = 0.18;

export const CAP_RATE_SENSITIVITY_STEP = 0.005;

// ── Validation Range Constants ──────────────────────────────────────────
export const VALIDATION_EXIT_CAP_RATE_MIN = 0.03;
export const VALIDATION_EXIT_CAP_RATE_MAX = 0.15;
export const VALIDATION_INFLATION_RATE_MAX = 0.15;
export const VALIDATION_BASE_MGMT_FEE_MAX = 0.10;
export const VALIDATION_INTEREST_RATE_MAX = 0.25;
export const VALIDATION_ACQ_LTV_MAX = 0.95;
export const VALIDATION_LAND_VALUE_PCT_MAX = 0.80;

// ── Calculation Checker Thresholds ──────────────────────────────────────
export const CHECKER_REVENUE_GROWTH_VARIANCE = 0.2;
export const CHECKER_NOI_MARGIN_MIN_PCT = 5;
export const CHECKER_NOI_MARGIN_MAX_PCT = 70;
export const CHECKER_BALANCE_SHEET_TOLERANCE = 1.0;
export const CHECKER_MIN_DSCR = 1.0;
