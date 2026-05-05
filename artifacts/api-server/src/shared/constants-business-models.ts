// ──────────────────────────────────────────────────────────
// HOTEL / FULL-SERVICE PROPERTY DEFAULTS
// Defined here (not constants.ts) to avoid the circular import that would
// arise if constants.ts imported getFactoryNumber() from model-constants-registry,
// which itself imports from constants.ts. Consumers can still import any of these
// names from "@shared/constants" via the wildcard re-export at the top of that file.
//
// Sources:
//   USALI (Uniform System of Accounts for the Lodging Industry) — cost-rate categories
//   HVS Fee Survey 2024 — management fee rates (specialty/wellness: 6-10% base + 12-20% incentive)
//   Global Wellness Institute 2024 — event revenue share (wellness retreats 25-35% of total)
// ──────────────────────────────────────────────────────────

// REVENUE STREAM SHARES — % of total property revenue
// Room share is derived: 1 - events - fb - other.
export const DEFAULT_REV_SHARE_EVENTS = 0.18;  // meetings, weddings, conferences
export const DEFAULT_REV_SHARE_FB     = 0.30;  // restaurant, bar, room service, catering
export const DEFAULT_REV_SHARE_OTHER  = 0.03;  // parking, spa, gift shop, activities

// DEPRECATED — catering boost absorbed into F&B share. Kept at 0 for interface
// backward-compatibility; field is not removed from engine types.
export const DEFAULT_CATERING_BOOST_PCT = 0;

// EXPENSE RATES — applied to ancillary revenue streams for direct cost computation
export const DEFAULT_EVENT_EXPENSE_RATE = 0.65;  // 65% of event revenue → direct event costs
export const DEFAULT_OTHER_EXPENSE_RATE = 0.60;  // 60% of other revenue → direct costs

// PROPERTY OPERATING COST RATES — USALI departmental categories
// Each rate is a % of total property revenue.
export const DEFAULT_COST_RATE_ROOMS        = 0.20;   // housekeeping, front desk, linens
export const DEFAULT_COST_RATE_FB           = 0.09;   // F&B cost of goods + labor
export const DEFAULT_COST_RATE_ADMIN        = 0.08;   // General & Administrative (G&A)
export const DEFAULT_COST_RATE_MARKETING    = 0.01;   // Sales & Marketing (property S&M — ≠ company marketing rate)
export const DEFAULT_COST_RATE_PROPERTY_OPS = 0.04;   // Property Operations & Maintenance (POM)
export const DEFAULT_COST_RATE_UTILITIES    = 0.05;   // Utilities (electric, water, gas, internet)
export const DEFAULT_COST_RATE_IT           = 0.005;  // Information Technology
export const DEFAULT_COST_RATE_FFE          = 0.04;   // FF&E reserve (furniture, fixtures & equipment)
export const DEFAULT_COST_RATE_OTHER        = 0.05;   // Miscellaneous / other operating expenses
export const DEFAULT_COST_RATE_INSURANCE    = 0.015;  // Property insurance (liability, property, BI)

// NOTE: DEFAULT_COST_RATE_TAXES was deleted (Audit #406). Property tax rates vary by
// country/state and must resolve through getFactoryNumber('costRateTaxes', country, state).
// The constant below is a US-baseline fallback used ONLY in BUSINESS_MODEL_DEFAULTS.hotel
// (which cannot call getFactoryNumber due to the circular import above).
// Source: CBRE US Hotel Cost Survey 2024 — US commercial property tax ≈ 1.2% of revenue.
export const DEFAULT_HOTEL_COST_RATE_TAXES = 0.012;

// MANAGEMENT COMPANY FEE DEFAULTS
// 1. Base fee: flat % of total revenue — compensation for day-to-day operations.
// 2. Incentive fee: % of Gross Operating Profit (GOP) — performance reward.
export const DEFAULT_BASE_MANAGEMENT_FEE_RATE      = 0.085;  // 8.5% of Total Revenue
export const DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE = 0.12;   // 12% of GOP

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
/** Airbnb host-only service fee (2026, standard host). Source: Airbnb Help Centre. */
export const DEFAULT_AIRBNB_PLATFORM_FEE_RATE = 0.155;
/** VRBO/Expedia host service fee (2026). Source: Vrbo Help Centre. */
export const DEFAULT_VRBO_PLATFORM_FEE_RATE = 0.08;
/** Booking.com host commission (2026, standard). Source: Booking.com partner portal. */
export const DEFAULT_BOOKING_PLATFORM_FEE_RATE = 0.15;
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

// ──────────────────────────────────────────────────────────
// STR ARCHETYPE DETECTION THRESHOLDS — used by the watchdog
// (`analyst-watchdog.ts → validateBusinessModelArchetype`) to flag
// properties whose `businessModel` field appears to mismatch their
// structural data. Three signals trigger the flag:
//   1. `pricingModel === "per_property"` — explicit STR signal
//   2. `hospitalityType` ∈ {vrbo, extended_stay} — user-declared STR type
//   3. roomCount ≤ MAX_ROOMS AND startAdr ≥ MIN_ADR — heuristic fallback
// Combined with `businessModel ∉ {vrbo, vrbo_owner_managed}`, any of these
// signals fires the tripwire. Thresholds calibrated for May 2026 luxury
// STR market — a single unit charging ≥$500/night is overwhelmingly
// likely a whole-property rental, not a hotel suite.
// ──────────────────────────────────────────────────────────

/** Heuristic: any property at or below this room count is potentially a whole-unit STR. */
export const STR_ARCHETYPE_DETECTION_MAX_ROOMS = 1;

/** Heuristic: a 1-unit property with this nightly rate or higher is almost certainly STR (not a hotel suite). */
export const STR_ARCHETYPE_DETECTION_MIN_ADR = 500;

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
    costRateRooms:        DEFAULT_COST_RATE_ROOMS,
    costRateFB:           DEFAULT_COST_RATE_FB,
    costRateAdmin:        DEFAULT_COST_RATE_ADMIN,
    costRateMarketing:    DEFAULT_COST_RATE_MARKETING,
    costRatePropertyOps:  DEFAULT_COST_RATE_PROPERTY_OPS,
    costRateUtilities:    DEFAULT_COST_RATE_UTILITIES,
    costRateTaxes:        DEFAULT_HOTEL_COST_RATE_TAXES,   // US baseline; per-property override: getFactoryNumber('costRateTaxes', country)
    costRateIT:           DEFAULT_COST_RATE_IT,
    costRateFFE:          DEFAULT_COST_RATE_FFE,
    costRateOther:        DEFAULT_COST_RATE_OTHER,
    costRateInsurance:    DEFAULT_COST_RATE_INSURANCE,
    revShareEvents:       DEFAULT_REV_SHARE_EVENTS,
    revShareFB:           DEFAULT_REV_SHARE_FB,
    revShareOther:        DEFAULT_REV_SHARE_OTHER,
    cateringBoostPct:     DEFAULT_CATERING_BOOST_PCT,
    baseMgmtFeeRate:      DEFAULT_BASE_MANAGEMENT_FEE_RATE,
    incentiveMgmtFeeRate: DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
    eventExpenseRate:     DEFAULT_EVENT_EXPENSE_RATE,
    otherExpenseRate:     DEFAULT_OTHER_EXPENSE_RATE,
    platformFeeRate:      0,   // N/A for hotels — direct bookings, no platform intermediary
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
  airbnb:  DEFAULT_AIRBNB_PLATFORM_FEE_RATE,
  vrbo:    DEFAULT_VRBO_PLATFORM_FEE_RATE,
  booking: DEFAULT_BOOKING_PLATFORM_FEE_RATE,
  direct:  0,  // 0 = no platform intermediary; structural floor
  blended: DEFAULT_VRBO_BLENDED_PLATFORM_FEE_RATE,
} as const;
