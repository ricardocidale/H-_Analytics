/**
 * shared/constants.ts — Single Source of Truth for Financial Defaults
 *
 * Every default value that the financial engine, seed data, verification checker,
 * and UI all rely on lives here. Changing a value here automatically propagates
 * across the entire stack (client + server). These constants represent industry-
 * standard benchmarks from USALI (Uniform System of Accounts for the Lodging
 * Industry), IRS publications, and HVS fee surveys.
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

// ──────────────────────────────────────────────────────────
// REVENUE STREAM SHARES
// Each property generates revenue from multiple sources. These percentages
// express how much revenue each ancillary stream contributes relative to
// room revenue. For example, 0.30 means event revenue = 30% of room revenue.
// ──────────────────────────────────────────────────────────

// Events share is higher than standard hotels (10-15%) because these are
// boutique wellness/retreat properties with dedicated event programming.
// Source: Global Wellness Institute 2024 — wellness retreats generate 25-35% of total revenue.
export const DEFAULT_REV_SHARE_EVENTS = 0.30;
// Food & Beverage revenue as a share of room revenue
export const DEFAULT_REV_SHARE_FB = 0.18;
// Other revenue (parking, spa, gift shop, etc.) as a share of room revenue
export const DEFAULT_REV_SHARE_OTHER = 0.05;

// Catering boost: percentage uplift applied on top of base F&B revenue to
// account for event catering (weddings, corporate retreats, etc.).
// This is a blended rate across catered and non-catered events.
export const DEFAULT_CATERING_BOOST_PCT = 0.22;

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
  { name: "Marketing", rate: 0.02, sortOrder: 1 },                    // 2.0% — brand, digital, campaigns
  { name: "Technology & Reservations", rate: 0.025, sortOrder: 2 },   // 2.5% — PMS, booking engine, channel manager, CRS
  { name: "Accounting", rate: 0.015, sortOrder: 3 },                  // 1.5% — bookkeeping, reporting, audit prep
  { name: "Revenue Management", rate: 0.01, sortOrder: 4 },           // 1.0% — dynamic pricing, demand forecasting
  { name: "General Management", rate: 0.015, sortOrder: 5 },          // 1.5% — executive oversight, HR
] as const;

// ──────────────────────────────────────────────────────────
// CENTRALIZED SERVICES DEFAULTS
// The management company can provide services to properties either as
// "centralized" (company procures externally, passes through with markup)
// or "direct" (property handles, company still earns fee for oversight).
// Terminology follows USALI Schedule 16 and standard HMA conventions.
// ──────────────────────────────────────────────────────────

// Default cost-plus markup on centralized services. If the company buys
// a service for $1.00, it charges the property $1.00 × (1 + 0.20) = $1.20.
export const DEFAULT_SERVICE_MARKUP = 0.20;

// Default service model for new service templates.
// 'centralized' = company procures, passes through with markup
// 'direct'      = property handles directly, company earns fee for oversight (no cost-of-service)
export type ServiceModel = 'centralized' | 'direct';
export const DEFAULT_SERVICE_MODEL: ServiceModel = 'centralized';

// Default service template categories. These seed the company_service_templates
// table on first run. The first 5 match DEFAULT_SERVICE_FEE_CATEGORIES (property fee categories).
// The 6th (Procurement) is an additional centralized service category.
export const DEFAULT_SERVICE_TEMPLATES = [
  { name: "Marketing",                defaultRate: 0.02,  serviceModel: 'centralized' as ServiceModel, serviceMarkup: 0.20, sortOrder: 1 },
  { name: "Technology & Reservations", defaultRate: 0.025, serviceModel: 'centralized' as ServiceModel, serviceMarkup: 0.20, sortOrder: 2 },
  { name: "Accounting",               defaultRate: 0.015, serviceModel: 'centralized' as ServiceModel, serviceMarkup: 0.20, sortOrder: 3 },
  { name: "Revenue Management",       defaultRate: 0.01,  serviceModel: 'centralized' as ServiceModel, serviceMarkup: 0.20, sortOrder: 4 },
  { name: "General Management",       defaultRate: 0.015, serviceModel: 'direct'      as ServiceModel, serviceMarkup: 0.20, sortOrder: 5 },
  { name: "Procurement",              defaultRate: 0.01,  serviceModel: 'centralized' as ServiceModel, serviceMarkup: 0.20, sortOrder: 6 },
] as const;

// ──────────────────────────────────────────────────────────
// EXIT & SALE DEFAULTS
// Used when modeling the sale/disposition of a property at the end of the
// projection horizon or at a refinance event.
// ──────────────────────────────────────────────────────────

// Cap rate applied to trailing NOI to compute exit (sale) price.
// Exit price = NOI / Cap Rate. A lower cap rate = higher valuation.
export const DEFAULT_EXIT_CAP_RATE = 0.085;
// Income tax rate applied to each property SPV's taxable income.
// This is the per-entity default for property-level income tax.
// The management company has its own rate: DEFAULT_COMPANY_TAX_RATE.
export const DEFAULT_PROPERTY_TAX_RATE = 0.25;
// Broker commission on property sale (% of sale price)
export const DEFAULT_COMMISSION_RATE = 0.05;

// ──────────────────────────────────────────────────────────
// DEPRECIATION & LAND VALUE
// ──────────────────────────────────────────────────────────

// Land is not depreciable under IRS rules. This percentage of total purchase
// price is allocated to land, and the remainder to the depreciable building.
// Source: IRS Publication 946
export const DEFAULT_LAND_VALUE_PERCENT = 0.25;

// Default depreciation period — US nonresidential real property (hotels) per
// IRS Publication 946, IRC §168(e)(2)(A), straight-line MACRS over 39 years.
// This is the FALLBACK default when no country or property override is set.
// The calculation METHOD always follows US GAAP (ASC 360, straight-line).
// Only the useful life period varies by jurisdiction — see countryDefaults.ts.
// Cascade: property.depreciationYears → global.depreciationYears → this constant.
export const DEPRECIATION_YEARS = 39;

// ──────────────────────────────────────────────────────────
// TIME CONSTANTS
// ──────────────────────────────────────────────────────────

// Months per year — used for annual-to-monthly conversion (interest rates,
// depreciation, salary, etc.). Prefer this over bare `/ 12` for readability.
export const MONTHS_PER_YEAR = 12;

// Average days per month (365/12 ≈ 30.42, rounded to 30.5). Used to convert
// monthly ADR × occupancy into available-room-night revenue.
export const DAYS_PER_MONTH = 30.5;

// ──────────────────────────────────────────────────────────
// GOVERNED FIELD REGISTRY
// Fields whose values are governed by external authorities and
// should not be casually edited. Used by GovernedFieldWrapper
// in the UI to display amber-styled read-only indicators.
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

// How many months between each occupancy growth step during the ramp-up phase
// after a property opens. New hotels don't fill instantly — occupancy grows
// in steps until reaching a stabilized level.
export const DEFAULT_OCCUPANCY_RAMP_MONTHS = 6;

// ──────────────────────────────────────────────────────────
// PROPERTY-LEVEL DEFAULTS
// Fallbacks for property-specific fields when not set by the user.
// ──────────────────────────────────────────────────────────

// Default room count for a boutique hotel (used as creation default)
export const DEFAULT_ROOM_COUNT = 10;
// Default starting ADR (Average Daily Rate) in dollars
export const DEFAULT_START_ADR = 250;
// Default stabilized max occupancy (85%)
export const DEFAULT_MAX_OCCUPANCY = 0.85;
export const DEFAULT_ADR_GROWTH_RATE = 0.03;
export const DEFAULT_START_OCCUPANCY = 0.55;
// Default months to reach stabilized occupancy after property opening.
// Industry standard for boutique hotels in secondary/tertiary markets.
export const DEFAULT_STABILIZATION_MONTHS = 36;

// ──────────────────────────────────────────────────────────
// INFLATION & COST ESCALATION
// ──────────────────────────────────────────────────────────

// Default inflation rate for property SPV cost escalation.
// Each property can override with its own rate on the Property Edit screen.
// Cascade: property.inflationRate → global.inflationRate → this value
export const DEFAULT_PROPERTY_INFLATION_RATE = 0.03;

// Default inflation rate for management company overhead escalation.
// Set by the user on the Company Assumptions screen.
// Cascade: global.companyInflationRate → global.inflationRate → this value
export const DEFAULT_COMPANY_INFLATION_RATE = 0.03;

// Annual escalation rate for fixed operating expenses (office lease,
// professional services). Applied as compound growth each year.
// Defaults to the system inflation rate when not explicitly overridden.
export const DEFAULT_FIXED_COST_ESCALATION_RATE = DEFAULT_PROPERTY_INFLATION_RATE;

// Corporate income tax rate applied to the management company's net income.
// Used to compute after-tax free cash flow at the company level.
export const DEFAULT_COMPANY_TAX_RATE = 0.30;

// ──────────────────────────────────────────────────────────
// PROJECTION HORIZON
// ──────────────────────────────────────────────────────────

// Default number of years for the financial model (10-year pro forma is
// standard for hospitality private equity underwriting).
export const DEFAULT_PROJECTION_YEARS = 10;

// ──────────────────────────────────────────────────────────
// FUNDING INSTRUMENT DEFAULTS
// These defaults configure the initial funding instrument assumptions.
// The user can rename the instrument via fundingSourceLabel (e.g. SAFE,
// Convertible Note, Seed Round). Valuation cap and discount rate are
// optional — set to 0 to disable them for instruments that don't use them.
// ──────────────────────────────────────────────────────────

// Valuation cap: maximum company valuation at which the instrument converts to equity (0 = not applicable)
export const DEFAULT_SAFE_VALUATION_CAP = 2500000;
// Discount rate: investors get this % discount to the next round's price (0 = not applicable)
export const DEFAULT_SAFE_DISCOUNT_RATE = 0.20;
// ─── Funding Predictor Algorithm Defaults ───
// Used by the funding-predictor engine to compute raise amounts, tranche splits,
// and SAFE/convertible-note terms. These are algorithm tuning parameters, not
// user-facing assumptions.
export const DEFAULT_EARLY_STAGE_DISCOUNT_PREMIUM = 0.05;
export const DEFAULT_EARLY_STAGE_CAP_DISCOUNT = 0.20;
export const DEFAULT_TRANCHE_BUFFER_MULTIPLIER = 1.15;
export const DEFAULT_FUNDING_ROUNDING_INCREMENT = 50_000;
export const DEFAULT_TRANCHE1_PERIOD_RATIO = 0.45;
export const DEFAULT_TRANCHE1_MAX_ALLOCATION = 0.65;
export const DEFAULT_TRANCHE_BIFURCATION_MONTHS = 48;
export const DEFAULT_TRANCHE2_PERIOD_RATIO = 0.75;
export const DEFAULT_TRANCHE2_ALLOCATION_PCT = 0.55;
export const DEFAULT_VALUATION_CAP_UPLIFT = 1.20;
export const DEFAULT_MIN_DISCOUNT_RATE = 0.10;
export const DEFAULT_RISK_FREE_RATE_FALLBACK = 0.04;
export const DEFAULT_SINGLE_TRANCHE_MAX_MONTHS = 18;
export const DEFAULT_SINGLE_TRANCHE_MAX_RAISE = 400_000;
export const DEFAULT_THREE_TRANCHE_MIN_T2 = 500_000;
export const DEFAULT_TREASURY_HIGH_RATE_THRESHOLD = 4.5;
export const DEFAULT_TREASURY_LOW_RATE_THRESHOLD = 3.0;

// Funding interest rate: annual simple interest on outstanding principal (0 = no interest)
export const DEFAULT_FUNDING_INTEREST_RATE = 0.08;
// Funding interest payment frequency: "accrues_only" | "quarterly" | "annually"
export const DEFAULT_FUNDING_INTEREST_PAYMENT_FREQUENCY = "accrues_only";

// ──────────────────────────────────────────────────────────
// SEED DEBT ASSUMPTIONS
// Default loan terms used when seeding production data (initial portfolio).
// These are the starting-point leverage assumptions for both acquisition
// and refinance scenarios.
// ──────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────
// AI AGENT DEFAULTS
// ──────────────────────────────────────────────────────────

export const DEFAULT_AI_AGENT_NAME = "Rebecca";

export const DEFAULT_MAX_STALENESS_HOURS = 24;

// ──────────────────────────────────────────────────────────
// SCENARIO LOAD STRATEGY
// When true (default), loadScenario uses stableKey-based upsert:
//   - Matches snapshot properties to live properties by stableKey
//   - Updates matched properties in place (preserving property IDs and photos)
//   - Inserts new snapshot properties that don't exist in live data
//   - Soft-archives orphaned live properties (isActive=false) instead of deleting
//     to prevent cascading photo deletions via property_photos ON DELETE CASCADE
// When false, falls back to destructive delete-all-and-recreate behavior.
// ──────────────────────────────────────────────────────────
export const USE_STABLE_SCENARIO_LOAD = true;

export const DEFAULT_ALERT_COOLDOWN_MINUTES = 1440;

// ──────────────────────────────────────────────────────────
// STAFFING TIER THRESHOLDS
// Management company staffing scales in tiers based on active property count.
// These are the portfolio-size breakpoints stored in global_assumptions.
// ──────────────────────────────────────────────────────────

export const DEFAULT_STAFF_TIER1_MAX_PROPERTIES = 3;
export const DEFAULT_STAFF_TIER2_MAX_PROPERTIES = 6;

export const STAFFING_TIERS = [
  { maxProperties: 3, fte: 2.5 },
  { maxProperties: 6, fte: 4.5 },
  { maxProperties: Infinity, fte: 7.0 },
];

export const DEFAULT_SAFE_TRANCHE = 800_000;

// ──────────────────────────────────────────────────────────
// MANAGEMENT COMPANY OVERHEAD DEFAULTS
// Annual fixed/variable costs for the management company. These
// seed the company pro-forma when no user-specified values exist.
// ──────────────────────────────────────────────────────────

export const DEFAULT_STAFF_SALARY = 75_000;
export const DEFAULT_OFFICE_LEASE = 36_000;
export const DEFAULT_PROFESSIONAL_SERVICES = 24_000;
export const DEFAULT_TECH_INFRA = 18_000;
export const DEFAULT_BUSINESS_INSURANCE_COMPANY = 12_000;
export const DEFAULT_TRAVEL_PER_CLIENT = 12_000;
export const DEFAULT_IT_LICENSE_PER_CLIENT = 3_000;
export const DEFAULT_PARTNER_COMP = [540_000, 540_000, 540_000, 600_000, 600_000, 700_000, 700_000, 800_000, 800_000, 900_000];

// ──────────────────────────────────────────────────────────
// RESEARCH CONFIGURATION DEFAULTS
// Per-event admin configuration for the AI research system.
// enabledTools: empty array = all 9 tools enabled (no filtering).
// ──────────────────────────────────────────────────────────

export const DEFAULT_RESEARCH_TIME_HORIZON = "10-year";

export const RESEARCH_SOURCES = [
  { name: "STR", category: "Hospitality", url: "https://str.com" },
  { name: "CBRE Hotels", category: "Hospitality", url: "https://www.cbre.com/industries/hotels" },
  { name: "HVS", category: "Hospitality", url: "https://hvs.com" },
  { name: "PKF Trends", category: "Hospitality", url: "https://www.pkfhotels.com" },
  { name: "HotStats", category: "Hospitality", url: "https://www.hotstats.com" },
  { name: "Xotels", category: "Hospitality", url: "https://www.xotels.com" },
  { name: "FRED", category: "Economics", url: "https://fred.stlouisfed.org" },
  { name: "BLS", category: "Economics", url: "https://www.bls.gov" },
  { name: "USALI 12th Ed (HFTP)", category: "Accounting", url: "https://usali.hftp.org" },
  { name: "Withum USALI Guide", category: "Accounting", url: "https://www.withum.com/resources/usali-12th-edition-aligning-hotel-accounting-with-modern-hospitality/" },
  { name: "Chatlyn Glossary", category: "Definitions", url: "https://chatlyn.com/en/glossary/adjusted-gross-operating-profit-agop/" },
  { name: "Canary Technologies", category: "Definitions", url: "https://www.canarytechnologies.com/hotel-terminology/adjusted-gross-operating-profit" },
] as const;

export const DEFAULT_RESEARCH_REFRESH_INTERVAL_DAYS = 30;

export const DEFAULT_RESEARCH_EVENT_CONFIG = {
  enabled: true,
  focusAreas: [] as string[],
  regions: [] as string[],
  timeHorizon: DEFAULT_RESEARCH_TIME_HORIZON,
  customInstructions: "",
  customQuestions: "",
  enabledTools: [] as string[],
  refreshIntervalDays: DEFAULT_RESEARCH_REFRESH_INTERVAL_DAYS,
};

// ── Working Capital Defaults ──────────────────────────────────────────────
// Divisor for daily revenue/cost approximation in AR/AP calculations.
// Uses calendar month (30 days) rather than DAYS_PER_MONTH (30.5) because
// AR/AP DSO/DPO conventions assume a 30-day month per industry practice.
export const WORKING_CAPITAL_DAYS_PER_MONTH = 30;
export const DEFAULT_AR_DAYS = 30;
export const DEFAULT_AP_DAYS = 45;

// ── MIRR Defaults ────────────────────────────────────────────────────────
export const DEFAULT_REINVESTMENT_RATE = 0.05;

// ── Day-Count Convention ─────────────────────────────────────────────────
export type DayCountConvention = '30/360' | 'ACT/360' | 'ACT/365';
export const DEFAULT_DAY_COUNT_CONVENTION: DayCountConvention = '30/360';

// ── Escalation Method ────────────────────────────────────────────────────
export type EscalationMethod = 'annual' | 'monthly';
export const DEFAULT_ESCALATION_METHOD: EscalationMethod = 'annual';

// ── NOL (Net Operating Loss) Defaults ────────────────────────────────────
export const NOL_UTILIZATION_CAP = 0.8;

// ── Cost Segregation Defaults ────────────────────────────────────────────
export const DEFAULT_COST_SEG_5YR_PCT = 0.15;
export const DEFAULT_COST_SEG_7YR_PCT = 0.10;
export const DEFAULT_COST_SEG_15YR_PCT = 0.05;
export const COST_SEG_5YR_LIFE_MONTHS = 60;
export const COST_SEG_7YR_LIFE_MONTHS = 84;
export const COST_SEG_15YR_LIFE_MONTHS = 180;
export const COST_SEG_5YR_LIFE_YEARS = 5;
export const COST_SEG_7YR_LIFE_YEARS = 7;
export const COST_SEG_15YR_LIFE_YEARS = 15;

// ── CapEx Reserve Benchmarks (ISHC / HVS Reserve Study Standards) ────────────
// Default replacement costs for full-service hotel FF&E components.
// Fixed costs are property-level (independent of room count).
// Per-key costs scale with room count.
// Source: ISHC Lodging Maintenance Standards 2024, HVS Reserve Studies

// Fixed replacement costs (full-service hotel average)
export const CAPEX_ELEVATOR_MECHANICAL_COST = 150_000;     // Elevator/mechanical systems
export const CAPEX_ROOF_EXTERIOR_COST = 200_000;           // Roof & building exterior
export const CAPEX_FB_EQUIPMENT_COST = 100_000;            // Restaurant/bar kitchen equipment
export const CAPEX_SPA_EQUIPMENT_COST = 75_000;            // Spa/wellness facility equipment

// Per-key replacement costs (per occupied room unit)
export const CAPEX_SOFT_GOODS_PER_KEY = 8_000;             // Bedding, drapes, carpet
export const CAPEX_CASE_GOODS_PER_KEY = 12_000;            // Furniture, fixtures
export const CAPEX_HVAC_PER_KEY = 5_000;                   // HVAC systems per room
export const CAPEX_TECH_PER_KEY = 2_000;                   // Technology/PMS per room

// Useful life in years (replacement cycle)
export const CAPEX_SOFT_GOODS_LIFE_YEARS = 5;
export const CAPEX_CASE_GOODS_LIFE_YEARS = 10;
export const CAPEX_HVAC_LIFE_YEARS = 15;
export const CAPEX_STRUCTURAL_LIFE_YEARS = 20;             // Elevator, roof, exterior
export const CAPEX_TECH_LIFE_YEARS = 5;
export const CAPEX_FB_EQUIPMENT_LIFE_YEARS = 8;
export const CAPEX_SPA_EQUIPMENT_LIFE_YEARS = 7;

// Industry benchmark: $5,000 per key per year for full-service hotel FF&E reserves
export const CAPEX_INDUSTRY_BENCHMARK_PER_KEY = 5_000;

// ── Loan / Financing Defaults ──────────────────────────────────────────────
export const DEFAULT_LTV = 0.75;
export const DEFAULT_INTEREST_RATE = 0.09;
export const DEFAULT_TERM_YEARS = 25;
export const DEFAULT_REFI_LTV = 0.65;
export const DEFAULT_REFI_CLOSING_COST_RATE = 0.03;
export const DEFAULT_ACQ_CLOSING_COST_RATE = 0.02;
export const DEFAULT_REFI_PERIOD_YEARS = 3;

// ── Management Company Cost Rates ────────────────────────────────────────
// Percentage of total fee revenue allocated to marketing and miscellaneous ops
export const DEFAULT_MARKETING_RATE = 0.05;
export const DEFAULT_MISC_OPS_RATE = 0.03;

// ── Operating Reserve / Funding Buffers ──────────────────────────────────
// Minimum cash cushions to prevent negative balances
export const OPERATING_RESERVE_BUFFER = 50_000;
export const COMPANY_FUNDING_BUFFER = 100_000;
export const RESERVE_ROUNDING_INCREMENT = 10_000;

// ── Property Defaults ────────────────────────────────────────────────────
export const DEFAULT_OCCUPANCY_GROWTH_STEP = 0.05;
export const DEFAULT_PARTNER_COUNT = 3;

// WACC: default cost of equity for private hospitality (no CAPM; user-provided)
export const DEFAULT_COST_OF_EQUITY = 0.18;


// Cap rate sensitivity analysis: each step = 50 basis points
export const CAP_RATE_SENSITIVITY_STEP = 0.005;

// Research example: 30% corporate tax bracket for tax shield comparison
export const RESEARCH_TAX_RATE_30_PCT = 0.30;

// Make-vs-buy: savings must exceed this threshold to recommend outsource/in-house
export const RESEARCH_MAKE_VS_BUY_MARGINAL_THRESHOLD = 0.10;
export const RESEARCH_MAKE_VS_BUY_DEFAULT_DISCOUNT_RATE = 0.08;
export const RESEARCH_MAKE_VS_BUY_DEFAULT_ESCALATION_RATE = 0.03;

// ── Hold-vs-Sell Analysis Defaults ──────────────────────────────────────────
// Default tax rates for disposition analysis (IRC §1 / §1250)
export const DEFAULT_CAPITAL_GAINS_RATE = 0.20;
export const DEFAULT_DEP_RECAPTURE_RATE = 0.25;
// Recommendation dead zone: ±2% of market value = "indifferent"
export const HOLD_VS_SELL_INDIFFERENCE_PCT = 0.02;

// ── Waterfall Defaults ──────────────────────────────────────────────────────
// GP catch-up target percentage of total distributions
export const DEFAULT_GP_CATCH_UP_TARGET_PCT = 0.20;

// ── Stress Test Thresholds ──────────────────────────────────────────────────
// Minimum DSCR for debt serviceability under stress
export const STRESS_TEST_MIN_DSCR = 1.25;
// NOI impact thresholds for severity classification (percentage points)
export const STRESS_SEVERITY_MODERATE_PCT = -5;
export const STRESS_SEVERITY_SEVERE_PCT = -15;
export const STRESS_SEVERITY_CRITICAL_PCT = -30;

// ── RevPAR Index Thresholds ─────────────────────────────────────────────────
// RGI thresholds for competitive performance assessment
export const RGI_OUTPERFORMING_THRESHOLD = 1.05;
export const RGI_UNDERPERFORMING_THRESHOLD = 0.95;

// ── Validation Range Constants ──────────────────────────────────────────────
// Reasonable bounds for assumption validation (assumption-consistency)
export const VALIDATION_EXIT_CAP_RATE_MIN = 0.03;
export const VALIDATION_EXIT_CAP_RATE_MAX = 0.15;
export const VALIDATION_INFLATION_RATE_MAX = 0.15;
export const VALIDATION_BASE_MGMT_FEE_MAX = 0.10;
export const VALIDATION_INTEREST_RATE_MAX = 0.25;
export const VALIDATION_ACQ_LTV_MAX = 0.95;
export const VALIDATION_LAND_VALUE_PCT_MAX = 0.80;

// ── Calculation Checker Thresholds ──────────────────────────────────────────
// Revenue growth variance: flag if actual CAGR differs from expected by more than this
export const CHECKER_REVENUE_GROWTH_VARIANCE = 0.2;
// NOI margin reasonable range (%)
export const CHECKER_NOI_MARGIN_MIN_PCT = 5;
export const CHECKER_NOI_MARGIN_MAX_PCT = 70;
// Balance sheet tolerance (dollars)
export const CHECKER_BALANCE_SHEET_TOLERANCE = 1.0;
// Minimum DSCR for debt coverage check
export const CHECKER_MIN_DSCR = 1.0;

// ── Funding Predictor Algorithm Limits ──────────────────────────────────────
// Maximum discount rate cap for SAFE terms
export const DEFAULT_MAX_SAFE_DISCOUNT_RATE = 0.30;
// Risk-free rate sensitivity multiplier for discount adjustment
export const DEFAULT_RISK_FREE_RATE_SENSITIVITY = 0.1;
// Rolling year lookback (months - 1, since we include the current month)
export const TRAILING_YEAR_MONTHS_OFFSET = 11;

// Cap rate valuation bounds: implied value must be within these multipliers of purchase price
export const RESEARCH_CAP_RATE_VALUATION_MAX_MULTIPLIER = 3.0;
export const RESEARCH_CAP_RATE_VALUATION_MIN_MULTIPLIER = 0.3;

export const SEED_DEBT_ASSUMPTIONS = {
  acqLTV: 0.75,             // Acquisition loan-to-value (75% LTV means 25% equity down)
  refiLTV: 0.75,            // Refinance loan-to-value
  interestRate: 0.09,       // Annual interest rate (9%)
  amortizationYears: 25,    // Loan fully amortizes over 25 years
  acqClosingCostRate: 0.02, // Acquisition closing costs as % of loan amount
  refiClosingCostRate: 0.03,// Refinance closing costs as % of new loan amount
} as const;

// ──────────────────────────────────────────────────────────
// PROPERTY STATUS ENUM
// Lifecycle stages a property can be in. Used throughout the UI,
// seed data, and schema defaults to ensure consistency.
// ──────────────────────────────────────────────────────────

export const PropertyStatus = {
  PIPELINE: "Pipeline",
  OPERATING: "Operating",
  IMPROVEMENTS: "Improvements",
  ACQUIRED: "Acquired",
  IN_NEGOTIATION: "In Negotiation",
  PLANNED: "Planned",
} as const;

export type PropertyStatusValue = (typeof PropertyStatus)[keyof typeof PropertyStatus];

export const PROPERTY_STATUS_VALUES = Object.values(PropertyStatus);

// ──────────────────────────────────────────────────────────
// USER ROLE ENUM
// Platform-level user roles for access control.
// NOT to be confused with LLM/OpenAI message roles ("user"/"assistant").
// ──────────────────────────────────────────────────────────

export const UserRole = {
  ADMIN: "admin",
  USER: "user",
  CHECKER: "checker",
  PARTNER: "partner",
  INVESTOR: "investor",
} as const;

export type UserRoleValue = (typeof UserRole)[keyof typeof UserRole];

export const USER_ROLE_VALUES = Object.values(UserRole);

// ──────────────────────────────────────────────────────────
// BRAND CONSTANTS
// ──────────────────────────────────────────────────────────
// DEFAULT LLM MODELS
// Fallback model identifiers used when no admin override is set.
// Server-side resolve-llm.ts re-exports these for domain routing.
// ──────────────────────────────────────────────────────────

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-5";

// ──────────────────────────────────────────────────────────
// APPLICATION BRAND IDENTITY
// Change these to rebrand the entire portal in one place.
// ──────────────────────────────────────────────────────────

export const APP_BRAND_NAME = "H+ Analytics";
export const BRAND_ACCENT_PREFIX = "H+";
export const BRAND_ACCENT_HEX = "#00A9B8";

// ──────────────────────────────────────────────────────────
// SERVER-SIDE COMPUTE FEATURE FLAG
// When true, the dashboard and property detail pages fetch
// pre-computed financials from /api/finance/* instead of
// running the engine in the browser.  Set to false to fall
// back to the legacy client-side computation path.
// ──────────────────────────────────────────────────────────
export const USE_SERVER_COMPUTE = true;

// ──────────────────────────────────────────────────────────
// FEATURE FLAG: Server-Side Export Generation (Phase 4)
// When true, export buttons call POST /api/exports/generate
// which computes data server-side from cache and streams the
// file. When false, exports are generated client-side.
// ──────────────────────────────────────────────────────────
export const USE_SERVER_EXPORTS = true;
