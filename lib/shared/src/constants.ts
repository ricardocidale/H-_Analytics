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
export * from './constants-benchmarks';
export * from './constants-brand';
export * from './constants-business-models';
export * from './constants-funding';
export * from './constants-research';
export * from './constants-capex';
export * from './constants-staffing';
export * from './constants-enums';
export * from './document-types';

// Hotel/full-service defaults (revenue shares, USALI cost rates, management fees) are
// defined in constants-business-models.ts — where they are consumed by
// BUSINESS_MODEL_DEFAULTS — to avoid the circular import that would arise from
// constants.ts importing getFactoryNumber() from model-constants-registry (which
// imports from constants.ts). All names remain available from "@shared/constants"
// via the wildcard re-export above: `export * from './constants-business-models'`.

// ──────────────────────────────────────────────────────────
// EXPENSE RATES (partial — only those NOT consumed by BUSINESS_MODEL_DEFAULTS)
// ──────────────────────────────────────────────────────────

// What fraction of total utility cost is variable (scales with occupancy)
// vs. fixed (base load regardless of guests). 60% variable / 40% fixed.
// Used in resolve-assumptions.ts, NOT in BUSINESS_MODEL_DEFAULTS (stays here).
export const DEFAULT_UTILITIES_VARIABLE_SPLIT = 0.60;

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
/** @deprecated Use getFactoryNumber('taxRate', country) for country-aware rates. */
export const DEFAULT_PROPERTY_INCOME_TAX_RATE = 0.25;
export const DEFAULT_COMMISSION_RATE = 0.05;

/**
 * SEED_EXIT_CAP_RATE_LUXURY — L+B Hospitality persona override.
 *
 * Calibrated to CBRE / JLL US luxury boutique hotel cap rate consensus
 * (2025): 7.5–9.5%; 8.5% is the market midpoint and matches
 * DEFAULT_EXIT_CAP_RATE, keeping a single coherent reference point.
 * Prior value of 6.2% (CBRE 2024 cached benchmark) was overly aggressive —
 * inflated stabilised values by 20–30%, producing IRR outliers > 50%.
 */
export const SEED_EXIT_CAP_RATE_LUXURY = 0.085;

/**
 * SEED_MEDELLIN_DUPLEX_START_ADR — single-key El Poblado luxury STR starting ADR.
 *
 * Calibrated to AirDNA Q1-2026 El Poblado top-decile whole-home listings
 * (>300sqm, ≥4BR luxury finishes), which cluster in the $1,300–$1,900/night
 * band. $1,500 sits mid-band and is consistent with vrbo/Airbnb luxury comps
 * for Calle 10 / Provenza-corridor units of similar size and finish.
 *
 * Used by SEED_MEDELLIN_DUPLEX (src/seeds/property-data.ts) and the
 * sync-property-assumptions-001 migration.
 */
export const SEED_MEDELLIN_DUPLEX_START_ADR = 1500;

// ──────────────────────────────────────────────────────────
// DEPRECIATION & LAND VALUE
// ──────────────────────────────────────────────────────────

export const DEFAULT_LAND_VALUE_PERCENT = 0.25;

/**
 * @deprecated Audit #319 R4. The model-constants registry is now the canonical
 * source for the depreciation life. Use
 * `getFactoryNumber('depreciationYears', country, state)` from
 * `@shared/model-constants-registry` instead. Retained for back-compat re-exports
 * (e.g. `engine/debt/loanCalculations`), schema column defaults, and tests.
 *
 * Default depreciation period — US nonresidential real property (hotels) per
 * IRS Publication 946, IRC §168(e)(2)(A), straight-line MACRS over 39 years.
 */
// FEEDS_DEFAULT: depreciationYears
export const DEPRECIATION_YEARS = 39;

/**
 * US nonresidential real property — IRS Publication 946 / IRC §168(e)(2)(A).
 * Hotels, lodges, and other commercial buildings depreciate straight-line
 * over 39 years. Same value as `DEPRECIATION_YEARS`; named explicitly so
 * the (country, property-type) lookup in
 * `lib/calc/src/research/depreciation-basis.ts` reads as IRS-sourced.
 */
// FEEDS_DEFAULT: depreciationYears
export const DEPRECIATION_YEARS_US_NON_RESIDENTIAL = 39;

/**
 * US residential rental property — IRS Publication 946 / IRC §168(e)(2)(A).
 * Single-family rentals, multi-family, and other "dwelling units" used
 * for residential rental depreciate straight-line over 27.5 years.
 */
export const DEPRECIATION_YEARS_US_RESIDENTIAL = 27.5;

// ──────────────────────────────────────────────────────────
// TIME CONSTANTS
// ──────────────────────────────────────────────────────────

export const MONTHS_PER_YEAR = 12;
/**
 * @deprecated Audit #319 R4. Use `getFactoryNumber('daysPerMonth')` from
 * `@shared/model-constants-registry` (universal locality, identical numeric
 * value). Retained for schema column defaults and tests.
 */
// FEEDS_DEFAULT: daysPerMonth
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

// ──────────────────────────────────────────────────────────
// PROPERTY-LEVEL DEFAULTS
// ──────────────────────────────────────────────────────────

export const DEFAULT_ADR_GROWTH_RATE = 0.03;

// ──────────────────────────────────────────────────────────
// INFLATION & COST ESCALATION
// ──────────────────────────────────────────────────────────

// Inflation rates are resolved via `getFactoryNumber('inflationRate', country, state)`
// from `@shared/model-constants-registry` (US baseline = 0.03, locality-aware).
// Schema column globalAssumptions.inflationRate carries the bootstrap value;
// model_defaults rows (mc.setup.companyInflationRate, mc.property_defaults.propertyInflationRate)
// hold the admin-editable per-scope overrides.
// ──────────────────────────────────────────────────────────────────────────────
// COMPANY-LEVEL INCOME TAX — DECISION RECORDED (Task #403, follow-up to #406)
// ──────────────────────────────────────────────────────────────────────────────
// The legacy `DEFAULT_COMPANY_TAX_RATE` (blended 30% estimate) was deleted in
// Audit #406. The reconciliation question raised by Task #403 — should we add
// a separate `companyTaxRate` registry key for the management-company blended
// rate, or route through the existing `taxRate` key? — is now permanently
// answered: ROUTE THROUGH THE EXISTING `taxRate` KEY.
//
// Rationale:
//   1. A management company in a country pays the same statutory corporate
//      income tax that a property SPV in that country pays. The "blended" 30%
//      was an over-approximation that bundled federal + an assumed state
//      add-on; the registry already models federal + state-subdivision overlay
//      explicitly (e.g. US federal 0.21 + Virginia state add-on via
//      `taxRate('United States', 'VA')`), so the blend is unnecessary.
//   2. Locality-awareness is free: a non-US management company picks up its
//      own country's `taxRate` automatically through
//      `getFactoryNumber('taxRate', companyCountry)` rather than carrying a
//      US-only blended hard-code.
//   3. Per-company override is preserved by the
//      `globalAssumptions.companyTaxRate` column, which simply takes
//      precedence over the registry baseline at runtime
//      (`global.companyTaxRate ?? getFactoryNumber('taxRate', …)`).
//
// Invariant: there is NO `companyTaxRate` entry in MODEL_CONSTANTS_REGISTRY,
// and there must not be one. The regression test
// `tests/server/model-constants-registry-flow.test.ts` locks this.

// ──────────────────────────────────────────────────────────
// PROJECTION HORIZON
// ──────────────────────────────────────────────────────────

export const DEFAULT_PROJECTION_YEARS = 10;
export const PROJECTION_MONTHS = DEFAULT_PROJECTION_YEARS * 12; // 120
export const DEFAULT_BUSINESS_INSURANCE = 12000; // Annual business insurance ($)

// ──────────────────────────────────────────────────────────
// MODEL TIMELINE DEFAULTS
// ──────────────────────────────────────────────────────────
// Financial model start date — the t=0 month for all projections. Drives
// Zustand initial state, checker manual, seed data, sync helpers. Previously
// drifted across 4 files as the literal "2026-04-01" before being centralized.
export const DEFAULT_MODEL_START_DATE = "2026-04-01";

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

export const USE_STABLE_SCENARIO_LOAD = true;
// ── Working Capital Defaults ────────────────────────────────────────────
export const WORKING_CAPITAL_DAYS_PER_MONTH = 30;

// ── Day-Count Convention ────────────────────────────────────────────────
export type DayCountConvention = '30/360' | 'ACT/360' | 'ACT/365';

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
// DEFAULT_INTEREST_RATE lives in constants-funding.ts (re-exported from constants.ts via export *)
export const DEFAULT_TERM_YEARS = 25;
export const DEFAULT_REFI_LTV = 0.65;
export const DEFAULT_REFI_CLOSING_COST_RATE = 0.03;
export const DEFAULT_ACQ_CLOSING_COST_RATE = 0.02;
export const DEFAULT_REFI_PERIOD_YEARS = 3;

// ── Management Company Cost Rates ───────────────────────────────────────
// DEFAULT_STAFF_SALARY re-exported from constants-staffing (75_000)
// Year-1 overhead bootstrap values (office lease 36k, professional services 24k,
// tech infra 18k, business insurance 12k) live on globalAssumptions columns
// with NOT NULL DEFAULTs in lib/db/src/schema/config.ts. Admin-editable via
// model_defaults rows under card="overhead".
export const DEFAULT_TRAVEL_COST_PER_CLIENT = 5000;
export const DEFAULT_IT_LICENSE_PER_CLIENT = 3600;
// ── Operating Reserve / Funding Buffers ─────────────────────────────────
export const OPERATING_RESERVE_BUFFER = 50_000;
export const COMPANY_FUNDING_BUFFER = 100_000;
export const RESERVE_ROUNDING_INCREMENT = 10_000;

// ── Property Defaults ───────────────────────────────────────────────────
export const DEFAULT_PARTNER_COUNT = 3;

export const DEFAULT_COST_OF_EQUITY = 0.22;

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

// ── Breakeven Targets (reverse-solve panel) ─────────────────────────────
// Minimum DSCR floor used by the breakeven targets panel for cap-rate and
// debt-rate reverse solves. Authority: standard hospitality lending baseline.
export const BREAKEVEN_TARGET_DSCR_FLOOR = 1.0;
// Relative gap (|current − breakeven| / |current|) below which the badge
// switches from green/red to amber "Close to breakeven".
export const BREAKEVEN_PROXIMITY_RATIO = 0.10;

// Specialist model IDs are NOT defined here. Per CLAUDE.md §1, integration
// identifiers (LLM model names, API slugs, MCP slugs, endpoint URLs) live in
// admin_resources rows and are fetched at runtime via GET /api/llm-providers.

// ──────────────────────────────────────────────────────────
// RENOVATION BUDGET CONSTANTS
// Used by renovation-budget calculations across the platform.
// Source: hplus-renovation-benchmarks skill.
// Tier per-key cost values stay local to the consumer (renderer-internal table);
// these are the cross-cutting percentage / floor constants.
// ──────────────────────────────────────────────────────────

export const RENOV_HISTORIC_PREMIUM = 0.20;   // +20% per-key uplift for historic preservation work
export const RENOV_CONTINGENCY      = 0.18;   // 18% contingency on subtotal
export const RENOV_MAX_PCT_OF_PRICE = 0.80;   // Guardrail: budget ≤ 80% of purchase price
export const RENOV_MIN_PER_KEY      = 25_000; // Guardrail: minimum $25k per key

// ──────────────────────────────────────────────────────────
// COSTANTINO — DATA CUSTODIAN CONSTANTS (Step 0)
// Cadence values must mirror the SQL seed in
// artifacts/api-server/migrations/0048_costantino_findings.sql.
// All cadence values are admin-overridable at runtime via the
// admin_resources parameter row 'costantino-health-cycle-interval-ms'
// (see COSTANTINO_CADENCE_PARAM_SLUG below). These constants are the
// fallback when the row is missing or malformed, and the clamp bounds
// the scheduler enforces on every read.
// ──────────────────────────────────────────────────────────

/** LLM slot slug for the Costantino orchestration loop. */
export const COSTANTINO_LLM_SLOT = "costantino-orchestration";

/** admin_resources parameter row holding the runtime-editable cadence. */
export const COSTANTINO_CADENCE_PARAM_SLUG = "costantino-health-cycle-interval-ms";

/** Default cycle interval — 5 days. Used when the parameter row is absent or malformed. */
// DB: costantino-health-cycle-interval-ms — admin_resources parameter row holds the live value
export const DEFAULT_COSTANTINO_HEALTH_CYCLE_INTERVAL_MS = 5 * 24 * 60 * 60 * 1000;

/** Lower clamp on the cadence — 60 s. Protects against runaway scheduling. */
// DB: fixed lower bound — architectural safety clamp, not admin-configurable
export const DEFAULT_COSTANTINO_MIN_CYCLE_INTERVAL_MS = 60 * 1000;

/** Upper clamp on the cadence — 30 days. */
// DB: fixed upper bound — architectural safety clamp, not admin-configurable
export const DEFAULT_COSTANTINO_MAX_CYCLE_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

/** Per-tool-call HTTP timeout for Costantino's probe_integration_endpoint tool — 15 s. */
// DB: costantino-probe-timeout-ms — move to admin_resources when tuning is needed
export const DEFAULT_COSTANTINO_PROBE_TIMEOUT_MS = 15 * 1000;

/** Max LLM tool-call rounds per cycle — defensive cap against runaway agentic loops. */
export const DEFAULT_COSTANTINO_MAX_TOOL_ROUNDS = 25;

/** Sampling temperature for Costantino's orchestration LLM. */
export const DEFAULT_COSTANTINO_TEMPERATURE = 0.2;

/** Max output tokens per LLM call in Costantino's loop. */
// DB: costantino-max-output-tokens — register in model-constants-registry when LLM tuning is needed
export const DEFAULT_COSTANTINO_MAX_OUTPUT_TOKENS = 4096;

/** Default HTTP status considered a successful probe outcome (= 200 OK). */
export const COSTANTINO_DEFAULT_EXPECTED_HTTP_STATUS = 200;

/** Lower bound for the "non-error 2xx/3xx but-not-expected" → degraded band. */
export const COSTANTINO_DEGRADED_HTTP_STATUS_MIN = 200;

/** Upper bound (exclusive) of the degraded band — 4xx/5xx are hard fail. */
export const COSTANTINO_DEGRADED_HTTP_STATUS_MAX_EXCLUSIVE = 400;

/** Row cap for list_findings scope='recent'. */
// DB: costantino-recent-findings-limit — move to model-constants-registry when admin tuning is needed
export const COSTANTINO_RECENT_FINDINGS_LIMIT = 30;

/** Row cap for list_findings scope='open' / 'all'. */
// DB: costantino-findings-page-limit — move to model-constants-registry when admin tuning is needed
export const COSTANTINO_FINDINGS_PAGE_LIMIT = 200;

/** Valid HTTP status code range for expectStatus validation (RFC 9110 §15). */
export const HTTP_STATUS_CODE_MIN = 100;
export const HTTP_STATUS_CODE_MAX = 599;

/** Standard HTTP response status codes used in route handlers. */
export const HTTP_STATUS_BAD_REQUEST = 400;
export const HTTP_STATUS_NOT_FOUND = 404;
export const HTTP_STATUS_FORBIDDEN = 403;
export const HTTP_STATUS_INTERNAL_SERVER_ERROR = 500;

// DB: rebecca-admin-scenario-display-limit — move to model-constants-registry when admin tuning is needed
/** Maximum number of scenarios shown in Rebecca's admin context block. */
export const REBECCA_ADMIN_SCENARIO_DISPLAY_LIMIT = 20;

// DB: rebecca-context-top-k — move to model-constants-registry when RAG tuning is needed
/** Top-K document chunks retrieved per RAG lookup in Rebecca context. */
export const REBECCA_CONTEXT_TOP_K = 3;

// ── ICP Bracket service-consumption constants (Task #1409) ──────────────────
//
// R8/R9/R10 — Service-consumption rules for the bracket catalog.
//
// 'hotel' customer-type → service_consumption_profile = 'full':
//   All ManCo service-template categories are consumed (scalar = 1.0).
//
// 'str' customer-type → service_consumption_profile = 'str_only':
//   Only ICP_STR_ELIGIBLE_SERVICE_CATEGORIES are consumed (scalar = 1.0 for
//   those categories, 0.0 for the rest). The performance bonus (incentive
//   management fee) is computed separately in the engine and applies to ALL
//   bracket types regardless — it is NOT a service-template category.
//
// These names MUST match the `name` column in service_templates rows (seeded
// from DEFAULT_SERVICE_TEMPLATES in lib/db/src/constants.ts).

/**
 * Service-template category names that STR-profile brackets consume from the
 * Management Company's centralized service offering.
 *
 * Source: requirements.md R9 + HVS Fee Survey 2024 STR addendum.
 * Never inline these strings — always reference this constant.
 */
export const ICP_STR_ELIGIBLE_SERVICE_CATEGORIES: readonly string[] = [
  "Marketing & Brand",
] as const;

/**
 * Tolerance for bracket-mix weight validation.
 * Weights must sum to within this delta of 1.0.
 * Also used in the engine to skip scaling when no STR component is present.
 */
export const ICP_BRACKET_MIX_WEIGHT_TOLERANCE = 0.01;

/**
 * Maximum number of bracket entries allowed in a single bracket-mix.
 * Matches the catalog size — currently 4 starter brackets, room for one more.
 */
export const ICP_BRACKET_MIX_MAX_ENTRIES = 5;

/**
 * Maximum character length for the property description rewrite endpoint and
 * Rebecca's rewrite_property_description tool. Mirrors the Zod validation
 * in routes/properties.ts rewriteDescriptionSchema.
 */
export const MAX_REWRITE_DESCRIPTION_CHARS = 5000;

/**
 * Max output token budget for property description rewrite LLM calls.
 * Generous enough for 2–3 paragraphs of polished copy.
 */
export const REWRITE_DESCRIPTION_MAX_TOKENS = 1024;
