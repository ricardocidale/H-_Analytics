/**
 * constants-overhead-benchmarks.ts — Cached benchmark ranges that drive the
 * Analyst watchdog on the Overhead tab of Company Assumptions.
 *
 * Mirrors `constants-compensation-benchmarks.ts` and `constants-revenue-benchmarks.ts`:
 * a typed low/mid/high band per dimension, grounded in industry sources,
 * stable across all users until the Tier-1 LLM refresh path lands.
 *
 * Persona scope: boutique-luxury hospitality management companies operating
 *   3–25 properties, founder-led to institutional-scale.
 *
 * Six tracked dimensions, all USD:
 *   • Fixed lines (annual, escalate at CPI):
 *     - officeLeaseStart           — corporate office rent + utilities
 *     - professionalServicesStart  — legal + accounting + audit
 *     - techInfraStart             — corporate tech (cloud, security, IT support)
 *     - businessInsuranceStart     — D&O / E&O / cyber for the ManCo
 *   • Variable per-property lines (multiplied by active property count):
 *     - travelCostPerClient        — site-visit + owner-meeting travel
 *     - itLicensePerClient         — per-property PMS, RM, channel manager
 *
 * Sources:
 * - Office lease: AHLA Lodging Industry Survey + HFTP/AICPA practice
 *   benchmarks for corporate hotel-management offices ($24K–$48K typical).
 * - Professional services: AICPA practice benchmarks for early-stage
 *   hospitality companies ($18K–$36K covering legal + audit + specialized
 *   consulting).
 * - Tech infrastructure: HFTP Technology Survey for corporate-level IT
 *   spend distinct from per-property licensing ($12K–$24K).
 * - Business insurance: hospitality D&O / E&O / cyber liability premiums
 *   for small management companies ($8K–$15K typical).
 * - Travel: AHLA per-property travel benchmarks ($8K–$18K covering
 *   inspections, owner meetings, brand audits).
 * - IT licensing: HFTP per-property tech-stack survey ($2K–$5K for
 *   PMS + revenue-management + channel-manager + accounting integration).
 *
 * Marketing rate is intentionally NOT tracked here — it lives under the
 * Revenue Specialist (Bia / mgmt-co.revenue) per the existing scope.
 *
 * Used by `engine/watchdog/overheadEvaluator.ts`.
 *
 * ─── Naming convention ───
 *
 * Per `.claude/rules/no-hardcoded-values.md`, every benchmark dollar amount
 * is exposed as a named `DEFAULT_*_BENCHMARK_{LOW,MID,HIGH}` constant rather
 * than an inline TS literal. The band-object below references them by name
 * so the file carries no magic numbers and the values are discoverable as
 * exports for any future seed/migration path. The benchmark MID values
 * deliberately diverge from the corresponding `DEFAULT_*_START` user-seed
 * defaults in `shared/constants.ts` — those are conservative tenant-creation
 * defaults; benchmark mids are industry midpoints the watchdog calibrates
 * against. Two distinct concepts, two distinct sets of constants.
 */

// Office lease — corporate office rent + utilities (USD/yr).
export const DEFAULT_OFFICE_LEASE_BENCHMARK_LOW  = 24_000;
export const DEFAULT_OFFICE_LEASE_BENCHMARK_MID  = 36_000;
export const DEFAULT_OFFICE_LEASE_BENCHMARK_HIGH = 48_000;

// Professional services — legal + accounting + audit (USD/yr).
export const DEFAULT_PROFESSIONAL_SERVICES_BENCHMARK_LOW  = 18_000;
export const DEFAULT_PROFESSIONAL_SERVICES_BENCHMARK_MID  = 27_000;
export const DEFAULT_PROFESSIONAL_SERVICES_BENCHMARK_HIGH = 36_000;

// Tech infrastructure — corporate cloud + cybersecurity + IT support (USD/yr).
export const DEFAULT_TECH_INFRA_BENCHMARK_LOW  = 12_000;
export const DEFAULT_TECH_INFRA_BENCHMARK_MID  = 18_000;
export const DEFAULT_TECH_INFRA_BENCHMARK_HIGH = 24_000;

// Business insurance — D&O/E&O/cyber for the ManCo (USD/yr).
export const DEFAULT_BUSINESS_INSURANCE_BENCHMARK_LOW  =  8_000;
export const DEFAULT_BUSINESS_INSURANCE_BENCHMARK_MID  = 11_500;
export const DEFAULT_BUSINESS_INSURANCE_BENCHMARK_HIGH = 15_000;

// Travel cost per client — annual per-property travel (USD/yr/property).
export const DEFAULT_TRAVEL_COST_PER_CLIENT_BENCHMARK_LOW  =  8_000;
export const DEFAULT_TRAVEL_COST_PER_CLIENT_BENCHMARK_MID  = 13_000;
export const DEFAULT_TRAVEL_COST_PER_CLIENT_BENCHMARK_HIGH = 18_000;

// IT/licensing per client — annual per-property tech licensing (USD/yr/property).
export const DEFAULT_IT_LICENSE_PER_CLIENT_BENCHMARK_LOW  = 2_000;
export const DEFAULT_IT_LICENSE_PER_CLIENT_BENCHMARK_MID  = 3_500;
export const DEFAULT_IT_LICENSE_PER_CLIENT_BENCHMARK_HIGH = 5_000;

export interface OverheadBenchmarkBand {
  low: number;
  mid: number;
  high: number;
}

export interface OverheadBenchmarks {
  /** Annual office lease + utilities (USD). */
  officeLeaseStart: OverheadBenchmarkBand;
  /** Annual legal + accounting + audit (USD). */
  professionalServicesStart: OverheadBenchmarkBand;
  /** Annual corporate tech infrastructure (USD). */
  techInfraStart: OverheadBenchmarkBand;
  /** Annual business insurance — D&O/E&O/cyber for the ManCo (USD). */
  businessInsuranceStart: OverheadBenchmarkBand;
  /** Annual travel cost per managed property (USD). */
  travelCostPerClient: OverheadBenchmarkBand;
  /** Annual IT/licensing cost per managed property (USD). */
  itLicensePerClient: OverheadBenchmarkBand;
}

export const DEFAULT_OVERHEAD_BENCHMARKS: OverheadBenchmarks = {
  officeLeaseStart: {
    low:  DEFAULT_OFFICE_LEASE_BENCHMARK_LOW,
    mid:  DEFAULT_OFFICE_LEASE_BENCHMARK_MID,
    high: DEFAULT_OFFICE_LEASE_BENCHMARK_HIGH,
  },
  professionalServicesStart: {
    low:  DEFAULT_PROFESSIONAL_SERVICES_BENCHMARK_LOW,
    mid:  DEFAULT_PROFESSIONAL_SERVICES_BENCHMARK_MID,
    high: DEFAULT_PROFESSIONAL_SERVICES_BENCHMARK_HIGH,
  },
  techInfraStart: {
    low:  DEFAULT_TECH_INFRA_BENCHMARK_LOW,
    mid:  DEFAULT_TECH_INFRA_BENCHMARK_MID,
    high: DEFAULT_TECH_INFRA_BENCHMARK_HIGH,
  },
  businessInsuranceStart: {
    low:  DEFAULT_BUSINESS_INSURANCE_BENCHMARK_LOW,
    mid:  DEFAULT_BUSINESS_INSURANCE_BENCHMARK_MID,
    high: DEFAULT_BUSINESS_INSURANCE_BENCHMARK_HIGH,
  },
  travelCostPerClient: {
    low:  DEFAULT_TRAVEL_COST_PER_CLIENT_BENCHMARK_LOW,
    mid:  DEFAULT_TRAVEL_COST_PER_CLIENT_BENCHMARK_MID,
    high: DEFAULT_TRAVEL_COST_PER_CLIENT_BENCHMARK_HIGH,
  },
  itLicensePerClient: {
    low:  DEFAULT_IT_LICENSE_PER_CLIENT_BENCHMARK_LOW,
    mid:  DEFAULT_IT_LICENSE_PER_CLIENT_BENCHMARK_MID,
    high: DEFAULT_IT_LICENSE_PER_CLIENT_BENCHMARK_HIGH,
  },
};
