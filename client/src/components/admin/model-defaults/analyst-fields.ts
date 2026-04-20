/**
 * Canonical assumption-key lists per Model Defaults sub-tab.
 *
 * Each list feeds the Analyst refresh call so the button on that sub-tab
 * asks for (and visibly updates) only the fields that live in that tab.
 *
 * Keys MUST match the guidance-extractor's vocabulary
 * (`server/ai/guidance/schemas.ts` → COMPANY_ASSUMPTION_KEYS +
 * KEY_ALIASES). Non-assumption defaults (companyName, projectionYears,
 * labels, ops-start dates) are intentionally omitted — the Analyst
 * doesn't produce ranges for those.
 */

export const COMPANY_TAB_ANALYST_FIELDS = [
  "baseManagementFee",
  "incentiveManagementFee",
  "companyTaxRate",
  "costOfEquity",
  "dispositionCommission", // surfaced on CompanyTab as "Sales Commission"
] as const;

export const MARKET_MACRO_TAB_ANALYST_FIELDS = [
  "inflationRate",
  "interestRate",
  "countryRiskPremium",
] as const;

export const PROPERTY_UNDERWRITING_TAB_ANALYST_FIELDS = [
  "adr",
  "adrGrowth",
  "maxOccupancy",
  "startOccupancy",
  "occupancyRampMonths",
  "capRate",
  "exitCapRate",
  "ltv",
  "landValue",
  "depreciationYears",
  "incomeTax",
  "costRooms",
  "costFB",
  "costAdmin",
  "costMarketing",
  "costPropertyOps",
  "costUtilities",
  "costFFE",
  "costIT",
] as const;

// Placeholders — these tabs currently hold constants/LLM settings/required-field
// metadata, not admin-editable assumption values. Included for completeness so a
// later slice can attach a button without inventing new keys.
export const MODEL_CONSTANTS_TAB_ANALYST_FIELDS: readonly string[] = [];
export const LLM_DEFAULTS_TAB_ANALYST_FIELDS: readonly string[] = [];
export const REQUIRED_FIELDS_TAB_ANALYST_FIELDS: readonly string[] = [];

export type AnalystFieldList = ReadonlyArray<string>;
