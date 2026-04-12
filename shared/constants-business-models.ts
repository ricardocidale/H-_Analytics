export type BusinessModelType = 'hotel' | 'lodge' | 'vrbo';

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
    costRateTaxes: 0.03,           // 3% — Property taxes (= DEFAULT_COST_RATE_TAXES)
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
    costRateRooms: 0.30,        // 30% — per-turnover cleaning, guest supplies, laundry
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
    baseMgmtFeeRate: 0.25,      // 25% — all-in management fee
    incentiveMgmtFeeRate: 0,    // 0% — no incentive fee (all-in model)
    eventExpenseRate: 0,        // N/A
    otherExpenseRate: 0.50,     // 50% of other revenue
    platformFeeRate: 0.14,      // 14% — blended Airbnb/VRBO platform fee
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
