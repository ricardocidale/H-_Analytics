/**
 * @deprecated Staffing scalar constants are now seeded into the `model_constants`
 * DB table and are admin-editable without a deploy. Use `getFactoryNumber(key)`
 * from `@shared/model-constants-registry` for TS-only fallbacks, or
 * `resolveXxxBenchmarks()` from `benchmark-resolver.ts` for DB-backed values.
 * Non-migrated exports (STAFFING_TIERS, ICP_MODEL_PROFILES, QUALITY_TIER_*)
 * remain authoritative here.
 */
export const DEFAULT_STAFF_TIER1_MAX_PROPERTIES = 3;
export const DEFAULT_STAFF_TIER2_MAX_PROPERTIES = 6;

export const STAFFING_TIERS = [
  { maxProperties: 3, fte: 2.5 },
  { maxProperties: 6, fte: 4.5 },
  { maxProperties: Infinity, fte: 7.0 },
];

export const DEFAULT_STAFF_SALARY = 75_000;
export const DEFAULT_OFFICE_LEASE = 36_000;
export const DEFAULT_PROFESSIONAL_SERVICES = 24_000;
export const DEFAULT_TECH_INFRA = 18_000;
export const DEFAULT_BUSINESS_INSURANCE_COMPANY = 12_000;
export const DEFAULT_TRAVEL_PER_CLIENT = 12_000;
export const DEFAULT_IT_LICENSE_PER_CLIENT = 3_000;
export const DEFAULT_PARTNER_COMP = [540_000, 540_000, 540_000, 600_000, 600_000, 700_000, 700_000, 800_000, 800_000, 900_000];
