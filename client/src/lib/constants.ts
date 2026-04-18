/**
 * constants.ts — Client-side financial constants and default values
 *
 * This file serves two purposes:
 *   1. Re-exports all shared constants from @shared/constants.ts so the client
 *      has a single import path for common values (tax rates, cost rates, etc.)
 *   2. Defines client-only constants that the server doesn't need — loan
 *      defaults, property defaults, company cost defaults, staffing tiers,
 *      presentation thresholds, and auditor tolerances.
 *
 * Constants are used as fallback values throughout the financial engine when
 * the user hasn't specified a custom value for a given assumption.
 */

// Re-export all shared constants (used by both client and server)
export {
  DEFAULT_REV_SHARE_EVENTS,
  DEFAULT_REV_SHARE_FB,
  DEFAULT_REV_SHARE_OTHER,
  DEFAULT_CATERING_BOOST_PCT,
  DEFAULT_EVENT_EXPENSE_RATE,
  DEFAULT_OTHER_EXPENSE_RATE,
  DEFAULT_UTILITIES_VARIABLE_SPLIT,
  DEFAULT_COST_RATE_ROOMS,
  DEFAULT_COST_RATE_FB,
  DEFAULT_COST_RATE_ADMIN,
  DEFAULT_COST_RATE_MARKETING,
  DEFAULT_COST_RATE_PROPERTY_OPS,
  DEFAULT_COST_RATE_UTILITIES,
  DEFAULT_COST_RATE_TAXES,
  DEFAULT_COST_RATE_IT,
  DEFAULT_COST_RATE_FFE,
  DEFAULT_COST_RATE_OTHER,
  DEFAULT_COST_RATE_INSURANCE,
  DEFAULT_EXIT_CAP_RATE,
  DEFAULT_PROPERTY_TAX_RATE,
  DEFAULT_COMMISSION_RATE,
  DEPRECIATION_YEARS,
  DAYS_PER_MONTH,
  DEFAULT_LAND_VALUE_PERCENT,
  DEFAULT_OCCUPANCY_RAMP_MONTHS,
  DEFAULT_CAPITAL_RAISE_VALUATION_CAP,
  DEFAULT_CAPITAL_RAISE_DISCOUNT_RATE,
  DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  DEFAULT_SERVICE_FEE_CATEGORIES,
  DEFAULT_FIXED_COST_ESCALATION_RATE,
  DEFAULT_COMPANY_TAX_RATE,
  DEFAULT_PROJECTION_YEARS,
  DEFAULT_COMPANY_OPS_START_DATE,
  DEFAULT_PROPERTY_INFLATION_RATE,
  DEFAULT_COMPANY_INFLATION_RATE,
  DEFAULT_LTV,
  DEFAULT_INTEREST_RATE,
  DEFAULT_TERM_YEARS,
  DEFAULT_ROOM_COUNT,
  DEFAULT_START_ADR,
  DEFAULT_MAX_OCCUPANCY,
  STAFFING_TIERS,
  DEFAULT_CAPITAL_RAISE_TRANCHE,
  MONTHS_PER_YEAR,
  DEFAULT_STABILIZATION_MONTHS,
  DEFAULT_STAFF_SALARY,
  DEFAULT_OFFICE_LEASE,
  DEFAULT_PROFESSIONAL_SERVICES,
  DEFAULT_TECH_INFRA,
  DEFAULT_BUSINESS_INSURANCE_COMPANY,
  DEFAULT_TRAVEL_PER_CLIENT,
  DEFAULT_IT_LICENSE_PER_CLIENT,
  DEFAULT_PARTNER_COMP,
  DEFAULT_REFI_LTV,
  DEFAULT_REFI_CLOSING_COST_RATE,
  DEFAULT_ACQ_CLOSING_COST_RATE,
  DEFAULT_REFI_PERIOD_YEARS,
  DEFAULT_MARKETING_RATE,
  DEFAULT_MISC_OPS_RATE,
  OPERATING_RESERVE_BUFFER,
  COMPANY_FUNDING_BUFFER,
  RESERVE_ROUNDING_INCREMENT,
  DEFAULT_OCCUPANCY_GROWTH_STEP,
  DEFAULT_PARTNER_COUNT,
  BUSINESS_MODEL_DEFAULTS,
  PLATFORM_FEE_RATES,
} from "@shared/constants";

// Property defaults — re-exported from shared/constants.ts (canonical source)
export { DEFAULT_ADR_GROWTH_RATE, DEFAULT_START_OCCUPANCY } from "@shared/constants";

// Company cost defaults — re-exported from shared/constants.ts (canonical source)
import { DEFAULT_BUSINESS_INSURANCE_COMPANY as _BIC, MONTHS_PER_YEAR as _MPY } from "@shared/constants";
export const DEFAULT_BUSINESS_INSURANCE = _BIC;
export const PROJECTION_YEARS = 10;
export const PROJECTION_MONTHS = PROJECTION_YEARS * _MPY;

// Default model start date fallback
export const DEFAULT_MODEL_START_DATE = '2026-04-01';

// All operating reserve, funding buffer, partner count, and refinance defaults
// are now in shared/constants.ts and re-exported above.

// Presentation thresholds — highlight IRRs above this as strong performers
export const IRR_HIGHLIGHT_THRESHOLD = 0.15;

// Auditor verification thresholds — tolerance for rounding differences in automated checks
export const AUDIT_VARIANCE_TOLERANCE = 0.001;
export const AUDIT_DOLLAR_TOLERANCE = 1;
export const AUDIT_VERIFICATION_WINDOW_MONTHS = 24;
export const AUDIT_CRITICAL_ISSUE_THRESHOLD = 3;
