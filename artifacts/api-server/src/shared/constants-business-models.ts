// ──────────────────────────────────────────────────────────
// SHORT-TERM RENTAL (STR) BENCHMARKS — defined here (not constants.ts)
// to avoid circular imports. constants.ts re-exports this file via wildcard,
// so consumers can still import these names from "@shared/constants".
//
// Sources (May 2026 industry benchmarks):
//   - Vacasa: 25–35% (avg ~30%) https://www.vacasa.com/homeowner-guides/vacation-rental-management-fees
//   - AvantStay: 20–25% base + add-ons up to 35% (luxury full-service)
//   - OneFineStay: ~50% revenue share (Accor luxury, premium curated)
//   - Evolve Core: 10% (listing-only, owner does ops) https://evolve.com/owner/vacation-rental-management
//   - Airbnb host fee: 15.5% / VRBO: 8% / Booking: 15% (2026 host fee data)
//   - Blended channel commission for luxury STR (60/30/10 mix): ~14%
//   - AirROI 2026 cleaning fee economics: 2BR turnover $60-100 US benchmark
//     https://www.airroi.com/blog/airbnb-cleaning-fee-economics
// ──────────────────────────────────────────────────────────

/** STR full-service mgmt fee — Vacasa / AvantStay tier (passive owner). */
export const DEFAULT_VRBO_FULL_SERVICE_MGMT_FEE_RATE = 0.25;
/** STR listing-only mgmt fee — Evolve Core tier (owner arranges cleaning + maintenance). */
export const DEFAULT_VRBO_OWNER_MANAGED_MGMT_FEE_RATE = 0.10;
/** Blended STR channel commission (Airbnb 15.5% / VRBO 8% / Booking 15% at 60/30/10 mix). */
export const DEFAULT_VRBO_BLENDED_PLATFORM_FEE_RATE = 0.14;

/** Owner-direct cleaning + linens + supplies. Lower than vrbo full-service (0.30) — owner sources locally. */
export const DEFAULT_VRBO_OWNER_MANAGED_COST_RATE_ROOMS = 0.06;
/** Owner light F&B (welcome amenities, coffee, snacks). */
export const DEFAULT_VRBO_OWNER_MANAGED_COST_RATE_FB = 0.03;
/** Owner light admin; ManCo absorbs majority into 10% mgmt fee. */
export const DEFAULT_VRBO_OWNER_MANAGED_COST_RATE_ADMIN = 0.02;
/** Owner-direct handyman/landscaping/repairs. */
export const DEFAULT_VRBO_OWNER_MANAGED_COST_RATE_PROPERTY_OPS = 0.04;
/** Owner-paid utilities; per-market override expected (Latin America materially cheaper). */
export const DEFAULT_VRBO_OWNER_MANAGED_COST_RATE_UTILITIES = 0.05;
/** Residential property tax baseline; per-market override expected via getFactoryNumber(). */
export const DEFAULT_VRBO_OWNER_MANAGED_COST_RATE_TAXES = 0.025;
/** STR insurance — short-term coverage typically higher than long-term residential. */
export const DEFAULT_VRBO_OWNER_MANAGED_COST_RATE_INSURANCE = 0.025;
/** Real FF&E replacement reserve. */
export const DEFAULT_VRBO_OWNER_MANAGED_COST_RATE_FFE = 0.03;
/** Consumables, toiletries, supplies. */
export const DEFAULT_VRBO_OWNER_MANAGED_COST_RATE_OTHER = 0.02;
/** Light F&B revenue share — chef nights, welcome baskets. */
export const DEFAULT_VRBO_OWNER_MANAGED_REV_SHARE_FB = 0.04;
/** Other revenue share — cleaning fees passed to guest, experiences. */
export const DEFAULT_VRBO_OWNER_MANAGED_REV_SHARE_OTHER = 0.04;
/** Other-revenue expense rate — lower than hotel (fewer overhead components). */
export const DEFAULT_VRBO_OWNER_MANAGED_OTHER_EXPENSE_RATE = 0.40;

/**
 * BusinessModelType — pricing + cost-stack archetype the engine routes a
 * property through.
 *
 *   • `hotel`              — multi-room hospitality property; F&B + events;
 *                             cost-plus services billed by ManCo per category;
 *                             base management fee + incentive (GOP-based).
 *   • `lodge`              — whole-property retreat; rural; bundled F&B; higher
 *                             cleaning + utilities; no events.
 *   • `vrbo`               — STR full-service ManCo (Vacasa / AvantStay tier).
 *                             ManCo runs everything: marketing, listing, ops,
 *                             admin, IT. Property pays consolidated 25%
 *                             all-in fee + platform commission. Owner is
 *                             passive — does NOT arrange cleaning/maintenance.
 *   • `vrbo_owner_managed` — STR listing-only ManCo (Evolve Core tier).
 *                             ManCo provides listing optimization + channel
 *                             distribution + booking + guest support;
 *                             property OWNER arranges cleaning, maintenance,
 *                             handyman, landscaping directly with local
 *                             vendors (much cheaper in markets with low labor
 *                             costs). ManCo charges ~10% mgmt fee + platform
 *                             commission. Owner is active.
 *
 * Sources for STR fee structures (May 2026):
 *   - Vacasa: 25–35% (avg ~30%) full-service. https://www.vacasa.com/homeowner-guides/vacation-rental-management-fees
 *   - AvantStay: 20–25% base, up to 35% with add-ons (luxury full-service).
 *   - OneFineStay: ~50% revenue share (premium luxury, Accor brand).
 *   - Evolve Core: 10% (listing + bookings only; owner ops). https://evolve.com/owner/vacation-rental-management
 *   - Airbnb host fee: 15.5%. VRBO: 8%. Booking: 15%. Blended: ~14%.
 */
export type BusinessModelType = 'hotel' | 'lodge' | 'vrbo' | 'vrbo_owner_managed';

export interface BusinessModelDefaults {
  costRateRooms: number;
  costRateFB: number;
  costRateAdmin: number;
  costRateMarketing: number;
  costRatePropertyOps: number;
  costRateUtilities: number;
  costRateTaxes: number;
  costRateIT: number;
  costRateFFE: number;
  costRateOther: number;
  costRateInsurance: number;
  revShareEvents: number;
  revShareFB: number;
  revShareOther: number;
  cateringBoostPct: number;
  baseMgmtFeeRate: number;
  incentiveMgmtFeeRate: number;
  eventExpenseRate: number;
  otherExpenseRate: number;
  platformFeeRate: number;
  preOpeningMonthlyBurn: number;
}

export const BUSINESS_MODEL_DEFAULTS: Record<BusinessModelType, BusinessModelDefaults> = {
  hotel: {
    costRateRooms: 0.20,           // 20% — housekeeping, front desk, linens (= DEFAULT_COST_RATE_ROOMS)
    costRateFB: 0.09,              // 9% — F&B COGS + labor (= DEFAULT_COST_RATE_FB)
    costRateAdmin: 0.08,           // 8% — G&A (= DEFAULT_COST_RATE_ADMIN)
    costRateMarketing: 0.01,       // 1% — Sales & Marketing (= DEFAULT_COST_RATE_MARKETING)
    costRatePropertyOps: 0.04,     // 4% — POM (= DEFAULT_COST_RATE_PROPERTY_OPS)
    costRateUtilities: 0.05,       // 5% — Utilities (= DEFAULT_COST_RATE_UTILITIES)
    costRateTaxes: 0.012,          // 1.2% — Property taxes (US baseline; matches getFactoryNumber('costRateTaxes','United States'))
    costRateIT: 0.005,             // 0.5% — IT (= DEFAULT_COST_RATE_IT)
    costRateFFE: 0.04,             // 4% — FF&E reserve (= DEFAULT_COST_RATE_FFE)
    costRateOther: 0.05,           // 5% — Other (= DEFAULT_COST_RATE_OTHER)
    costRateInsurance: 0.015,      // 1.5% — Insurance (= DEFAULT_COST_RATE_INSURANCE)
    revShareEvents: 0.18,          // 18% of total revenue — meetings, weddings, conferences
    revShareFB: 0.30,              // 30% of total revenue — restaurant, bar, room service, catering
    revShareOther: 0.03,           // 3% of total revenue — spa, parking, activities
    cateringBoostPct: 0,           // 0% — catering boost absorbed into F&B share (deprecated)
    baseMgmtFeeRate: 0.085,        // 8.5% of total revenue (= DEFAULT_BASE_MANAGEMENT_FEE_RATE)
    incentiveMgmtFeeRate: 0.12,    // 12% of GOP (= DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE)
    eventExpenseRate: 0.65,         // 65% of event revenue (= DEFAULT_EVENT_EXPENSE_RATE)
    otherExpenseRate: 0.60,         // 60% of other revenue (= DEFAULT_OTHER_EXPENSE_RATE)
    platformFeeRate: 0,             // N/A for hotels
    preOpeningMonthlyBurn: 0,
  },

  lodge: {
    costRateRooms: 0.25,        // 25% — higher cleaning, premium linens, guest supplies
    costRateFB: 0.15,           // 15% — guest meals included (breakfast/dinner typical)
    costRateAdmin: 0.06,        // 6% — lighter admin (fewer departments)
    costRateMarketing: 0.02,    // 2% — niche marketing (nature/wellness positioning)
    costRatePropertyOps: 0.05,  // 5% — higher maintenance (grounds, trails, docks)
    costRateUtilities: 0.06,    // 6% — higher utilities (heating, well water, remote)
    costRateTaxes: 0.025,       // 2.5% — rural areas often lower assessments
    costRateIT: 0.003,          // 0.3% — simpler tech stack
    costRateFFE: 0.03,          // 3% — less FF&E turnover vs hotel
    costRateOther: 0.04,        // 4% — activities, equipment rental
    costRateInsurance: 0.02,    // 2% — higher insurance (remote, outdoor risk)
    revShareEvents: 0,             // 0% — no events department
    revShareFB: 0.20,              // 20% of total revenue — guest meals
    revShareOther: 0.06,           // 6% of total revenue — activities, equipment, experiences
    cateringBoostPct: 0,           // 0% — deprecated
    baseMgmtFeeRate: 0.18,      // 18% — higher mgmt fees (whole-property complexity)
    incentiveMgmtFeeRate: 0.10, // 10% — lower incentive (fewer profit levers)
    eventExpenseRate: 0,        // N/A
    otherExpenseRate: 0.55,     // 55% of other revenue
    platformFeeRate: 0,         // Direct bookings, no platform fees
    preOpeningMonthlyBurn: 0,
  },

  vrbo: {
    // STR full-service ManCo (Vacasa / AvantStay tier). Owner is passive —
    // ManCo handles ALL operations including cleaning, maintenance, supplies.
    // Cost rates here represent owner-side overhead even after the 25% fee
    // (handyman scheduling fees, listing-photo refresh, supplies above ManCo
    // pass-through, etc.) — the active-owner case.
    costRateRooms: 0.30,        // 30% — per-turnover cleaning, guest supplies, laundry (US labor)
    costRateFB: 0.05,           // 5% — welcome baskets, catering, event F&B, cooking experiences
    costRateAdmin: 0.05,        // 5% — lighter admin
    costRateMarketing: 0.02,    // 2% — listing optimization, photography
    costRatePropertyOps: 0.06,  // 6% — handyman, landscaping, pool
    costRateUtilities: 0.07,    // 7% — guest-paid utilities on full home
    costRateTaxes: 0.03,        // 3% — residential assessments
    costRateIT: 0.01,           // 1% — smart locks, WiFi, channel manager
    costRateFFE: 0.03,          // 3% — furniture refresh, appliances
    costRateOther: 0.03,        // 3% — supplies, consumables
    costRateInsurance: 0.025,   // 2.5% — higher STR insurance
    revShareEvents: 0.04,          // 4% of total revenue — receptions, parties, experiences
    revShareFB: 0.08,              // 8% of total revenue — welcome baskets, catering, cooking
    revShareOther: 0.02,           // 2% of total revenue — cleaning fees charged to guests
    cateringBoostPct: 0,           // 0% — deprecated
    baseMgmtFeeRate: DEFAULT_VRBO_FULL_SERVICE_MGMT_FEE_RATE,  // Vacasa/AvantStay tier full-service all-in fee
    incentiveMgmtFeeRate: 0,    // 0% — no incentive fee (all-in model)
    eventExpenseRate: 0,        // N/A
    otherExpenseRate: 0.50,     // 50% of other revenue
    platformFeeRate: DEFAULT_VRBO_BLENDED_PLATFORM_FEE_RATE,  // blended Airbnb 15.5% / VRBO 8% / Booking 15%
    preOpeningMonthlyBurn: 0,
  },

  vrbo_owner_managed: {
    // STR listing-only ManCo (Evolve Core tier). Owner arranges cleaning,
    // maintenance, handyman, landscaping DIRECTLY with local vendors. ManCo
    // provides listing optimization + channel distribution + booking handling
    // + guest support for a flat 10% of bookings. Cost rates reflect
    // owner-direct sourcing of services (materially cheaper than ManCo-routed
    // overhead in markets with low labor costs — e.g., Latin America cleaning
    // labor is ~25-35% of US rates).
    //
    // Where these numbers come from (May 2026 industry benchmarks):
    //   - 10% mgmt fee: Evolve Core. https://evolve.com/owner/vacation-rental-management
    //   - 14% platform fee: blended Airbnb 15.5% / VRBO 8% / Booking 15%
    //     weighted at typical 60/30/10 channel mix.
    //   - Cleaning rates: AirROI 2026 cleaning fee economics for 2BR units.
    //     US benchmark $60-100/turnover; Medellín / Latin America rates run
    //     30-50% of US benchmark; the 6% costRateRooms anchors to a global
    //     midpoint, properties in low-labor markets should override down.
    costRateRooms: DEFAULT_VRBO_OWNER_MANAGED_COST_RATE_ROOMS,        // owner-direct cleaning + linens + supplies (vs vrbo full-service 0.30)
    costRateFB: DEFAULT_VRBO_OWNER_MANAGED_COST_RATE_FB,               // light welcome amenities (coffee, snacks, water)
    costRateAdmin: DEFAULT_VRBO_OWNER_MANAGED_COST_RATE_ADMIN,         // owner light admin; ManCo absorbs majority into 10%
    costRateMarketing: 0,                                               // ManCo provides listing/pricing tools (bundled in 10%)
    costRatePropertyOps: DEFAULT_VRBO_OWNER_MANAGED_COST_RATE_PROPERTY_OPS, // owner-direct handyman/landscaping/repairs
    costRateUtilities: DEFAULT_VRBO_OWNER_MANAGED_COST_RATE_UTILITIES, // owner pays utilities; per-market override expected
    costRateTaxes: DEFAULT_VRBO_OWNER_MANAGED_COST_RATE_TAXES,         // residential property tax baseline; per-market override via getFactoryNumber()
    costRateIT: 0,                                                      // ManCo provides booking/channel systems (bundled in 10%)
    costRateFFE: DEFAULT_VRBO_OWNER_MANAGED_COST_RATE_FFE,              // real FF&E reserve (replacement cost)
    costRateOther: DEFAULT_VRBO_OWNER_MANAGED_COST_RATE_OTHER,          // consumables, toiletries, supplies
    costRateInsurance: DEFAULT_VRBO_OWNER_MANAGED_COST_RATE_INSURANCE,  // STR insurance (matches vrbo)
    revShareEvents: 0,                                                  // single-unit, no events
    revShareFB: DEFAULT_VRBO_OWNER_MANAGED_REV_SHARE_FB,                // light F&B (chef nights, welcome baskets)
    revShareOther: DEFAULT_VRBO_OWNER_MANAGED_REV_SHARE_OTHER,          // cleaning fees passed to guest, experiences
    cateringBoostPct: 0,
    baseMgmtFeeRate: DEFAULT_VRBO_OWNER_MANAGED_MGMT_FEE_RATE,         // Evolve Core tier (listing + bookings; owner does ops)
    incentiveMgmtFeeRate: 0,                                            // no incentive (consolidated)
    eventExpenseRate: 0,
    otherExpenseRate: DEFAULT_VRBO_OWNER_MANAGED_OTHER_EXPENSE_RATE,    // lower than hotel; fewer overhead components
    platformFeeRate: DEFAULT_VRBO_BLENDED_PLATFORM_FEE_RATE,            // blended Airbnb/VRBO/Booking commission
    preOpeningMonthlyBurn: 0,
  },
};

export const PLATFORM_FEE_RATES = {
  airbnb: 0.155,  // 15.5% host-only fee (Airbnb)
  vrbo: 0.08,     // 8% host fee (VRBO/Expedia)
  booking: 0.15,  // 15% commission (Booking.com)
  direct: 0,      // 0% for direct bookings
  blended: 0.14,  // 14% blended average across platforms
} as const;
