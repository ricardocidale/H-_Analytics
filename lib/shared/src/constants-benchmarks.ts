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
 * Long-term home: Neon model_canonicals (written by Intelligence specialists).
 * These constants are the fallback until that migration lands.
 *
 * @deprecated Values are now seeded into the `model_constants` DB table and
 * are admin-editable without a deploy. Use `resolveXxxBenchmarks()` from
 * `artifacts/api-server/src/finance/benchmark-resolver.ts` for DB-backed
 * values, or `getFactoryNumber(key)` from `@shared/model-constants-registry`
 * for TS-only fallbacks. Direct imports here will be removed in a future
 * cleanup pass.
 *
 * NEVER inline these values in engine/, calc/, or client/ files.
 * All numeric definitions live here; consumers import by name.
 */

// ── Quality tier occupancy brackets (STR Global Chain Scale) ─────────────────
// Source: STR Chain Scale Benchmarks — annual survey, US lodging industry.
// Each tier defines the typical occupancy range for stabilized properties.

// Keys match DB canonical format (QUALITY_TIERS in lib/db/src/schema/properties.ts)
export const QUALITY_TIER_OCCUPANCY_BRACKETS: Record<
  string,
  { min: number; max: number; default: number }
> = {
  luxury:          { min: 0.65, max: 0.75, default: 0.70 },
  upper_upscale:   { min: 0.65, max: 0.75, default: 0.70 },
  upscale:         { min: 0.70, max: 0.80, default: 0.75 },
  upper_midscale:  { min: 0.70, max: 0.80, default: 0.75 },
  midscale:        { min: 0.60, max: 0.70, default: 0.65 },
  economy:         { min: 0.60, max: 0.70, default: 0.65 },
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

// ── ICP Management Company Models ────────────────────────────────────────────
// Named models based on real market research. Eden, UT (Wasatch Mountains) is
// the management company base. Seed portfolio draws from:
//   - Medellín, Colombia: $145/night ADR, 72% occ (AirROI 2025 — luxury tier)
//   - Eden / Powder Mountain, Utah: $338/night ADR, 40–54% occ (AirROI 2026)
//   - US boutique hotel average: $280/night ADR, 65% occ (STR / CBRE 2024)
//
// Management fee ranges sourced from HVS Management Fee Survey 2023–2024:
//   - Base management: 3–5% of total revenue (boutique; larger brands get 2–4%)
//   - Central services (IT + mktg + accounting + rev mgmt): 4–8% of revenue
//   - Incentive: 10–15% of GOP above a performance threshold
//
// Long-term home: Neon model_canonicals, refreshed by Intelligence specialists.
// These constants are the cold-start seed; Admin can press Analyst to refresh.

export type IcpModelTier = "A" | "B" | "C";

export interface IcpModelProfile {
  tier: IcpModelTier;
  /** Creative name used in UI and prompts. */
  label: string;
  /** One-line description shown in model selection cards. */
  tagline: string;
  /** Longer narrative for the Analyst prompt context. */
  story: string;
  propertyCount: { min: number; typical: number; max: number };
  /** Months from first property signing to first meaningful management fee revenue. */
  rampMonths: number;
  /** Monthly ManCo operating burn (excl. partner comp). */
  monthlyBurnUsd: number;
  partnerCount: number;
  partnerCompMonthlyUsd: number;
  /** Estimated annual portfolio (property-level) gross revenue. */
  portfolioRevenueUsd: { min: number; typical: number; max: number };
  /** Estimated annual ManCo revenue from fees (base + services + incentive). */
  managementCoRevenueUsd: { min: number; typical: number; max: number };
  targetRaiseUsd: { min: number; typical: number; max: number };
  typicalTrancheCount: number;
  trancheGapMonths: number;
  runwayBufferMonths: number;
  sizingOvershootPct: number;
  revenueRampDelayMonths: number;
  burnFlexDownPct: number;
  /** Sample property mix used in Admin ICP Simulations view. */
  simulatedProperties: Array<{
    type: "STR" | "boutique_hotel" | "micro_resort";
    location: string;
    units: number;
    adrUsd: number;
    occupancyRate: number;
    annualRevenueUsd: number;
  }>;
}

export const ICP_MODEL_PROFILES: Record<IcpModelTier, IcpModelProfile> = {
  // ── Model A — Alma ────────────────────────────────────────────────────────
  // "Alma" = Spanish for soul. The founder's first act: two handpicked
  // Medellín apartments and one Eden, Utah mountain retreat — each a community
  // hub, each deeply personal. Management is lean, decisions are fast,
  // and every guest knows the owner's name.
  A: {
    tier:    "A",
    label:   "Alma",
    tagline: "3–5 boutique properties · Founder-led · Medellín & Utah origins",
    story:
      "Alma operators run 3–5 handpicked properties — typically 2–3 luxury STR " +
      "units in Medellín (Laureles / El Poblado) and 1–2 boutique retreats near " +
      "Eden, Utah. Management is founder-direct. The ManCo earns ~$120–160K/yr " +
      "from base fees, services, and incentives on a ~$1.2M portfolio. Monthly " +
      "burn runs $22–28K. Capital raise of $1.2–2M covers 18+ months of net " +
      "operating gap while the portfolio stabilises.",
    propertyCount:          { min: 3,        typical: 4,         max: 5 },
    rampMonths:             18,
    monthlyBurnUsd:         22_000,
    partnerCount:           2,
    partnerCompMonthlyUsd:  3_750,
    portfolioRevenueUsd:    { min: 800_000,  typical: 1_200_000, max: 1_800_000 },
    managementCoRevenueUsd: { min: 80_000,   typical: 130_000,   max: 180_000 },
    targetRaiseUsd:         { min: 1_000_000, typical: 1_500_000, max: 2_200_000 },
    typicalTrancheCount:    1,
    trancheGapMonths:       0,
    runwayBufferMonths:     14,
    sizingOvershootPct:     0.20,
    revenueRampDelayMonths: 9,
    burnFlexDownPct:        0.22,
    simulatedProperties: [
      { type: "STR",           location: "Medellín, Colombia (El Poblado)",    units: 4,  adrUsd: 145, occupancyRate: 0.72, annualRevenueUsd: 152_012 },
      { type: "STR",           location: "Medellín, Colombia (Laureles)",      units: 4,  adrUsd: 130, occupancyRate: 0.70, annualRevenueUsd: 132_860 },
      { type: "boutique_hotel",location: "Eden, Utah (Powder Mountain area)",  units: 8,  adrUsd: 320, occupancyRate: 0.52, annualRevenueUsd: 485_734 },
    ],
  },

  // ── Model B — Highline ────────────────────────────────────────────────────
  // Named for the high-altitude traverse route linking Wasatch peak to peak.
  // A Highline operator has built real infrastructure: a COO, a revenue
  // manager, and a small corporate team. Properties span two or three markets.
  // Management fees now cover most of the burn; the raise buys growth runway
  // and tech stack.
  B: {
    tier:    "B",
    label:   "Highline",
    tagline: "6–12 boutique properties · Regional platform · Wasatch-to-Andes reach",
    story:
      "Highline operators run 6–12 properties across 2–3 markets — a mix of " +
      "Medellín STR clusters, 15-room US boutique hotels, and an Eden, Utah " +
      "flagship. A professional team of 8–12 handles ops, revenue, and finance. " +
      "Portfolio generates ~$5–7M/yr; the ManCo earns ~$500–650K/yr. Monthly " +
      "burn is $60–75K. A $3–4M raise (2 tranches, 14-month gap) covers the " +
      "ramp period and portfolio expansion.",
    propertyCount:          { min: 6,        typical: 9,         max: 12 },
    rampMonths:             12,
    monthlyBurnUsd:         65_000,
    partnerCount:           3,
    partnerCompMonthlyUsd:  5_000,
    portfolioRevenueUsd:    { min: 4_000_000, typical: 6_000_000, max: 8_500_000 },
    managementCoRevenueUsd: { min: 400_000,  typical: 575_000,   max: 750_000 },
    targetRaiseUsd:         { min: 2_500_000, typical: 3_500_000, max: 5_500_000 },
    typicalTrancheCount:    2,
    trancheGapMonths:       14,
    runwayBufferMonths:     16,
    sizingOvershootPct:     0.22,
    revenueRampDelayMonths: 7,
    burnFlexDownPct:        0.22,
    simulatedProperties: [
      { type: "STR",           location: "Medellín, Colombia (El Poblado)",    units: 6,  adrUsd: 145, occupancyRate: 0.74, annualRevenueUsd: 234_819 },
      { type: "STR",           location: "Medellín, Colombia (Laureles)",      units: 5,  adrUsd: 128, occupancyRate: 0.71, annualRevenueUsd: 165_714 },
      { type: "boutique_hotel",location: "Ogden / Eden, Utah",                 units: 15, adrUsd: 290, occupancyRate: 0.63, annualRevenueUsd: 1_000_778 },
      { type: "boutique_hotel",location: "Park City, Utah",                    units: 12, adrUsd: 345, occupancyRate: 0.60, annualRevenueUsd: 906_120 },
      { type: "boutique_hotel",location: "Nashville, TN (boutique lifestyle)", units: 14, adrUsd: 265, occupancyRate: 0.68, annualRevenueUsd: 921_670 },
      { type: "boutique_hotel",location: "Sedona, AZ (wellness retreat)",      units: 10, adrUsd: 385, occupancyRate: 0.58, annualRevenueUsd: 814_430 },
    ],
  },

  // ── Model C — Summit Collective ───────────────────────────────────────────
  // The summit is where boutique soul meets institutional capital. A Summit
  // operator runs 13–25 properties across the US and Latin America, has a
  // full corporate stack (CFO, CLO, CMO), and works with institutional LPs.
  // Management fees generate $1.5–2M/yr; a $9M raise (2 tranches) funds
  // the corporate build-out and market expansion.
  C: {
    tier:    "C",
    label:   "Summit Collective",
    tagline: "13–25 boutique properties · Institutional scale · Multi-market platform",
    story:
      "Summit Collective operators run 13–25 properties across US gateway " +
      "cities, mountain resort markets, and Latin America. Corporate team of " +
      "20–30 includes full C-suite. Portfolio generates $15–22M/yr in property " +
      "revenue; the ManCo earns $1.5–2M/yr from fees. Monthly burn is $280–320K. " +
      "A $9M raise (2 tranches, 18-month gap) builds the platform and funds " +
      "market expansion. Institutional LP relationships are standard.",
    propertyCount:          { min: 13,       typical: 18,        max: 25 },
    rampMonths:             8,
    monthlyBurnUsd:         295_000,
    partnerCount:           5,
    partnerCompMonthlyUsd:  6_250,
    portfolioRevenueUsd:    { min: 14_000_000, typical: 18_000_000, max: 24_000_000 },
    managementCoRevenueUsd: { min: 1_400_000,  typical: 1_750_000,  max: 2_400_000 },
    targetRaiseUsd:         { min: 6_000_000, typical: 9_000_000,  max: 14_000_000 },
    typicalTrancheCount:    2,
    trancheGapMonths:       18,
    runwayBufferMonths:     20,
    sizingOvershootPct:     0.25,
    revenueRampDelayMonths: 5,
    burnFlexDownPct:        0.25,
    simulatedProperties: [
      { type: "STR",           location: "Medellín, Colombia (El Poblado)",     units: 8,  adrUsd: 155, occupancyRate: 0.76, annualRevenueUsd: 343_538 },
      { type: "boutique_hotel",location: "Eden / Powder Mountain, Utah",        units: 18, adrUsd: 338, occupancyRate: 0.54, annualRevenueUsd: 1_198_810 },
      { type: "boutique_hotel",location: "Park City, Utah",                     units: 14, adrUsd: 365, occupancyRate: 0.62, annualRevenueUsd: 1_157_270 },
      { type: "boutique_hotel",location: "Aspen, CO (lifestyle boutique)",      units: 16, adrUsd: 520, occupancyRate: 0.55, annualRevenueUsd: 1_672_960 },
      { type: "boutique_hotel",location: "Nashville, TN",                       units: 20, adrUsd: 285, occupancyRate: 0.70, annualRevenueUsd: 1_455_300 },
      { type: "boutique_hotel",location: "Miami Beach, FL (lifestyle)",         units: 22, adrUsd: 380, occupancyRate: 0.72, annualRevenueUsd: 2_182_464 },
      { type: "boutique_hotel",location: "Sedona, AZ (wellness retreat)",       units: 12, adrUsd: 420, occupancyRate: 0.60, annualRevenueUsd: 1_105_200 },
      { type: "micro_resort",  location: "Cartagena, Colombia (Caribbean)",     units: 24, adrUsd: 185, occupancyRate: 0.68, annualRevenueUsd: 1_102_584 },
    ],
  },
};

// ── L+B Slide Vision — LLM generation constants ───────────────────────────

/** Max tokens for the whole-deck property vision LLM call (20+ fields). */
export const VISION_DRAFT_MAX_TOKENS = 1200;

/**
 * Character budget hints injected into the LLM prompt so the model
 * self-constrains each field type. These are soft limits for the prompt;
 * the hard schema limits live in deck-payload-v2.ts (SLIDE*_*_MAX constants).
 */
export const VISION_BADGE_MAX_CHARS = 35;
export const VISION_BULLET_MAX_CHARS = 80;
export const VISION_PARAGRAPH_MAX_CHARS = 180;

/**
 * Guest-count multipliers used in the deterministic vision headline templates.
 * Retreat tier: roomCount × MIN–MAX gives the typical group capacity range.
 */
export const RETREAT_GUESTS_PER_KEY_MIN = 3;
export const RETREAT_GUESTS_PER_KEY_MAX = 4;

/** VRBO tier: whole-property capacity estimate (guests per key). */
export const VRBO_GUESTS_PER_KEY = 10;

// ── Analyst prompt fallbacks ──────────────────────────────────────────────────
// Used only when the user has no active properties yet. These give the Revenue
// Specialist rough mid-market anchors so it can still generate guidance without
// fabricating assumptions from zero.
//
// Category: DEFAULT VARIABLE (admin starting point). These are NOT financial
// calculations — they are prompt-context placeholders.

/** Fallback average start-occupancy for the portfolio-level revenue prompt context. */
export const DEFAULT_PORTFOLIO_ANALYST_START_OCCUPANCY = 0.65;

/** Fallback average ADR for the portfolio-level revenue prompt context. */
export const DEFAULT_PORTFOLIO_ANALYST_ADR = 350;

// ── Cost-of-equity display fallbacks ─────────────────────────────────────────
// The primary values come from market_rates rows ("treasury_10y" and
// "erp_boutique_hospitality"). These constants are the DISPLAY FALLBACK shown
// before the Analyst button has run and populated those rows.
//
// Format: percentage points (e.g., 4.35 means 4.35%) — matches rfRate.value
// and erpRate.value returned by the market-rates API.

/** Display fallback for the US 10-year Treasury yield (percentage points). */
export const DEFAULT_RF_RATE_PCT_DISPLAY = 4.35;

/** Display fallback for the hospitality sector equity risk premium (percentage points). */
export const DEFAULT_ERP_HOSPITALITY_PCT_DISPLAY = 12;

// ── Range-indicator chart ─────────────────────────────────────────────────────
// Visual padding added around the analyst range so the dots don't sit flush
// against the boundary. 20% of the span on each side.

/** Fractional padding applied to each side of a range band in the indicator chart. */
export const RANGE_INDICATOR_CHART_PADDING = 0.2;

// ── Executive-summary narrative thresholds ───────────────────────────────────
// DB_CANDIDATE: market-driven thresholds the executive-summary fallback
// templates use to flip narrative tone (aggressive vs. conservative
// occupancy, diversified vs. concentrated revenue mix, strong vs. thin
// debt coverage). Currently TS constants; eventual home is `model_constants`
// so admins can tune narrative voice without a deploy.
//
// Used by `artifacts/api-server/src/ai/executive-summary/templates.ts`.

/** Above this stabilized occupancy, narrative calls assumptions "aggressive". */
export const NARRATIVE_HIGH_OCCUPANCY_THRESHOLD = 0.80;

/** Above this F&B revenue share, narrative emphasizes the 50/50 rooms-to-F&B story. */
export const NARRATIVE_HIGH_FB_SHARE_THRESHOLD = 0.15;

/** Above this F&B share, the mitigants section credits "diversified revenue streams". */
export const NARRATIVE_DIVERSIFIED_FB_SHARE_THRESHOLD = 0.10;

/** Above this DSCR, the mitigants section credits "debt cushion". */
export const NARRATIVE_STRONG_DSCR_THRESHOLD = 1.25;

