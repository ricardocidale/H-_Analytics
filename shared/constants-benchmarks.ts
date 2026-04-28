/**
 * constants-benchmarks.ts — Authority-sourced benchmark tables and operational
 * constants that would otherwise appear as hardcoded literals in engine/calc files.
 *
 * Sources:
 *   - STR Global Chain Scale Benchmarks (occupancy/ADR tiers)
 *   - HVS Management Fee Survey (service fee ranges, markup ranges)
 *   - Standard LP/lender covenant conventions (DSCR thresholds)
 *   - Industry stress-test conventions (shock magnitudes)
 *
 * Long-term home: Neon model_canonicals (written by AI Intelligence specialists).
 * These constants are the fallback until that migration lands.
 *
 * NEVER inline these values in engine/, calc/, or client/ files.
 * All numeric definitions live here; consumers import by name.
 */

// ── Quality tier occupancy brackets (STR Global Chain Scale) ─────────────────
// Source: STR Chain Scale Benchmarks — annual survey, US lodging industry.
// Each tier defines the typical occupancy range for stabilized properties.

export const QUALITY_TIER_OCCUPANCY_BRACKETS: Record<
  string,
  { min: number; max: number; default: number }
> = {
  Luxury:         { min: 0.65, max: 0.75, default: 0.70 },
  "Upper Upscale": { min: 0.65, max: 0.75, default: 0.70 },
  Upscale:        { min: 0.70, max: 0.80, default: 0.75 },
  "Upper Midscale": { min: 0.70, max: 0.80, default: 0.75 },
  Midscale:       { min: 0.60, max: 0.70, default: 0.65 },
  Economy:        { min: 0.60, max: 0.70, default: 0.65 },
};

// Fallback occupancy when quality tier is unknown (Upscale default)
export const DEFAULT_FALLBACK_OCCUPANCY = 0.70;

// ── Scale adjustment: small-property cost premium ─────────────────────────────
// Source: HVS Hotel Cost Benchmarks — properties <20 rooms carry higher unit costs
// due to reduced purchasing leverage and fixed cost spread.
export const SCALE_THRESHOLD_SMALL_ROOMS  = 10;   // rooms < 10 → small premium
export const SCALE_THRESHOLD_MEDIUM_ROOMS = 20;   // rooms 10–19 → medium premium
export const SCALE_ADJUSTMENT_SMALL_PROPERTY  = 0.05; // +5% on cost rates
export const SCALE_ADJUSTMENT_MEDIUM_PROPERTY = 0.02; // +2% on cost rates

// ── DSCR covenant thresholds (LP/lender convention) ──────────────────────────
// Source: Standard lender covenant for hospitality real estate debt.
// 1.25x is the typical minimum; below 1.0x means the property cannot cover debt.
export const DSCR_COVENANT_STANDARD = 1.25;
export const DSCR_COVENANT_CRITICAL = 1.0;

// ── Stress scenario shock magnitudes ─────────────────────────────────────────
// Source: CBRE Hotels Research — standard recession/stress scenario calibration.
// These are multipliers applied to base-case assumptions.
export const STRESS_OCCUPANCY_SHOCK          = 0.85; // −15% occupancy (recession)
export const STRESS_ADR_SHOCK                = 0.90; // −10% ADR (rate compression)
export const STRESS_RATE_SHOCK_DECIMAL       = 0.02; // +200 bps interest rate
export const STRESS_RATE_SHOCK_BPS           = 200;  // human-readable label for narratives
export const STRESS_COST_SHOCK               = 1.20; // +20% operating costs (inflation)
export const STRESS_COMBINED_OCCUPANCY_SHOCK = 0.90; // −10% occupancy (combined stress)
export const STRESS_COMBINED_COST_SHOCK      = 1.10; // +10% costs (combined stress)

// NOI decline threshold that triggers "moderate" severity in stress classification
export const STRESS_SEVERITY_NOI_THRESHOLD = 0.20; // −20% NOI → moderate

// Revenue share clamp: ancillary cannot crowd out rooms entirely
export const REVENUE_ANCILLARY_SHARE_MAX = 0.95;
export const REVENUE_ROOM_SHARE_MIN      = 0.05;

// ── Industry markup ranges (HVS Central Services Survey) ─────────────────────
// Source: HVS Management Fee + Central Services Survey 2023.
// These are the typical % markup a management company charges above vendor cost
// for each centralized service category.
export const INDUSTRY_MARKUP_RANGES: Record<
  string,
  { low: number; mid: number; high: number }
> = {
  marketing:               { low: 0.15, mid: 0.25, high: 0.35 },
  technology_reservations: { low: 0.10, mid: 0.20, high: 0.30 },
  accounting:              { low: 0.20, mid: 0.30, high: 0.40 },
  revenue_management:      { low: 0.15, mid: 0.20, high: 0.30 },
  procurement:             { low: 0.08, mid: 0.15, high: 0.25 },
  hr:                      { low: 0.10, mid: 0.20, high: 0.30 },
  design:                  { low: 0.15, mid: 0.25, high: 0.40 },
  general_management:      { low: 0.10, mid: 0.15, high: 0.25 },
};

// ── Service fee benchmark rates (HVS Fee Survey) ─────────────────────────────
// Source: HVS Management Fee Survey 2023 — service fees as % of property revenue.
// Notes embedded per category describe market context for LP review.
export const SERVICE_FEE_BENCHMARK_RATES: Record<
  string,
  { low: number; mid: number; high: number; notes: string }
> = {
  marketing: {
    low: 0.015, mid: 0.025, high: 0.04,
    notes: "Digital marketing, OTA management, brand campaigns. Boutique hotels typically 2-4% of revenue.",
  },
  technology_reservations: {
    low: 0.02, mid: 0.03, high: 0.04,
    notes: "PMS, booking engine, channel manager, CRS, cybersecurity. Combined technology and central reservation systems.",
  },
  accounting: {
    low: 0.01, mid: 0.02, high: 0.03,
    notes: "Monthly close, reporting, tax prep, audit support. Scale economies at 5+ properties.",
  },
  revenue_management: {
    low: 0.015, mid: 0.02, high: 0.03,
    notes: "Dynamic pricing, demand forecasting, competitive analysis.",
  },
  procurement: {
    low: 0.005, mid: 0.01, high: 0.02,
    notes: "Group purchasing, vendor negotiation, FF&E sourcing.",
  },
  hr: {
    low: 0.005, mid: 0.01, high: 0.015,
    notes: "Recruitment, training programs, compliance, payroll processing.",
  },
  design: {
    low: 0.005, mid: 0.01, high: 0.02,
    notes: "Interior design, brand standards, renovation management.",
  },
  general_management: {
    low: 0.03, mid: 0.05, high: 0.08,
    notes: "Base management fee covering day-to-day operations oversight.",
  },
};

// Fallback service fee range when serviceType is unrecognized
export const SERVICE_FEE_FALLBACK_RATE = {
  low: 0.01, mid: 0.02, high: 0.03,
} as const;

// ── ICP Management Company Models (A / B / C) ────────────────────────────────
// Three reference models representing small, mid, and large hospitality
// management companies. Used as context anchors when the Analyst cannot
// derive ranges from actual user inputs alone.
//
// Source: HVS Fee Survey 2023, CBRE Hotels Research, Norfolk AI underwriting
// experience across Latin American boutique-luxury operators.
//
// Long-term: stored in Neon model_canonicals, written by AI Intelligence
// specialists. These constants are the cold-start fallback.

export type IcpModelTier = "A" | "B" | "C";

export interface IcpModelProfile {
  tier: IcpModelTier;
  label: string;
  tagline: string;
  propertyCount: { min: number; typical: number; max: number };
  rampMonths: number;
  monthlyBurnUsd: number;
  partnerCount: number;
  partnerCompMonthlyUsd: number;
  targetRaiseUsd: { min: number; typical: number; max: number };
  typicalTrancheCount: number;
  trancheGapMonths: number;
  runwayBufferMonths: number;
  sizingOvershootPct: number;
  revenueRampDelayMonths: number;
  burnFlexDownPct: number;
}

export const ICP_MODEL_PROFILES: Record<IcpModelTier, IcpModelProfile> = {
  A: {
    tier: "A",
    label: "Boutique",
    tagline: "3–5 properties · Founder-led · Lean overhead",
    propertyCount:          { min: 3,         typical: 4,          max: 5 },
    rampMonths:             18,
    monthlyBurnUsd:         100_000,
    partnerCount:           2,
    partnerCompMonthlyUsd:  45_000,
    targetRaiseUsd:         { min: 1_000_000, typical: 1_500_000,  max: 2_500_000 },
    typicalTrancheCount:    1,
    trancheGapMonths:       0,
    runwayBufferMonths:     12,
    sizingOvershootPct:     0.20,
    revenueRampDelayMonths: 9,
    burnFlexDownPct:        0.20,
  },
  B: {
    tier: "B",
    label: "Growth",
    tagline: "6–12 properties · Regional team · Structured ops",
    propertyCount:          { min: 6,         typical: 9,          max: 12 },
    rampMonths:             12,
    monthlyBurnUsd:         200_000,
    partnerCount:           3,
    partnerCompMonthlyUsd:  60_000,
    targetRaiseUsd:         { min: 2_000_000, typical: 3_500_000,  max: 6_000_000 },
    typicalTrancheCount:    2,
    trancheGapMonths:       14,
    runwayBufferMonths:     15,
    sizingOvershootPct:     0.22,
    revenueRampDelayMonths: 7,
    burnFlexDownPct:        0.22,
  },
  C: {
    tier: "C",
    label: "Platform",
    tagline: "13–25 properties · Full corporate stack · Institutional scale",
    propertyCount:          { min: 13,        typical: 18,         max: 25 },
    rampMonths:             8,
    monthlyBurnUsd:         400_000,
    partnerCount:           5,
    partnerCompMonthlyUsd:  75_000,
    targetRaiseUsd:         { min: 5_000_000, typical: 9_000_000,  max: 15_000_000 },
    typicalTrancheCount:    2,
    trancheGapMonths:       18,
    runwayBufferMonths:     18,
    sizingOvershootPct:     0.25,
    revenueRampDelayMonths: 5,
    burnFlexDownPct:        0.25,
  },
};
