/**
 * shared/constants-brand.ts — Boutique-hotel brand-fee, HMA, and capital-event
 * named constants. These are the *factory baselines* used when the per-property
 * column is null. Per `.agents/skills/no-magic-numbers`, every numeric literal
 * lives here as a named export with its source documented.
 *
 * Sources:
 *   - HVS Hotel Franchise Fee Guide 2024 (boutique/upscale benchmark band)
 *   - HVS Hotel Management Contract Survey 2023
 *   - USALI 11th Edition (Uniform System of Accounts for the Lodging Industry)
 *   - Florida Senate Bill 4-D (post-Surfside) — milestone structural inspections
 *     mandated for coastal multistory buildings at 25 yr (within 3 mi of coast)
 *     and at 30 yr (≥ 3 mi inland).
 */

// ── USALI 4% FF&E reserve benchmark ──────────────────────────────────────
// USALI 11th Ed. recommends 4% of gross revenue as the long-run FF&E reserve
// floor for full-service / boutique hotels. Used as the badge benchmark on
// the Reserves & Brand Costs panel.
export const USALI_FFE_RESERVE_BENCHMARK = 0.04;

// ── Boutique brand-fee stack defaults (% of room revenue) ────────────────
// HVS 2024 boutique band — used as factory fallback when the property has
// no per-property override. Each category appears as its own line on the
// brand-fee stack.
export const DEFAULT_FRANCHISE_FEE_RATE = 0.05;          // 5.0%
export const DEFAULT_ROYALTY_FEE_RATE = 0.05;            // 5.0% — Marriott/Hilton boutique soft-brand band
export const DEFAULT_BRAND_MARKETING_FEE_RATE = 0.02;    // 2.0%
export const DEFAULT_LOYALTY_PROGRAM_FEE_RATE = 0.005;   // 0.5%
export const DEFAULT_RESERVATION_FEE_RATE = 0.0125;      // 1.25%
export const DEFAULT_BRAND_TECHNOLOGY_FEE_RATE = 0.005;  // 0.5%

// ── HMA (Hotel Management Agreement) defaults ────────────────────────────
// HVS Management Contract Survey 2023 — boutique HMA term & termination
// notice band. Base/incentive percentages reuse `baseManagementFeeRate` and
// `incentiveManagementFeeRate` already on the property row, so we only need
// term + termination notice here.
export const DEFAULT_HMA_TERM_YEARS = 10;
export const DEFAULT_HMA_TERMINATION_NOTICE_MONTHS = 12;
// Months of base management fee owed to the operator on early
// termination — typical HMA buyout convention is 18 months when
// termination is "without cause".
export const DEFAULT_HMA_TERMINATION_FEE_MONTHS = 18;

// ── PIP (Property Improvement Plan) cycle ────────────────────────────────
// Brand-mandated PIPs typically fire on a 7-year cycle for franchise/soft-
// brand boutiques. Used to project the next two PIP events from yearBuilt
// or lastRenovationYear when no explicit PIP schedule is on file.
export const DEFAULT_PIP_CYCLE_YEARS = 7;
// Industry rule-of-thumb PIP scope cost per key for a mid-cycle refresh.
export const DEFAULT_PIP_COST_PER_KEY = 18_000;

// ── Florida Surfside coastal-FL milestone recertification ────────────────
// FL SB 4-D (2022) — the 25-year coastal milestone applies to multistory
// buildings within 3 mi of the coastline; the 30-year threshold applies to
// inland buildings. We surface both for boutique hotels in coastal Florida.
export const SURFSIDE_COASTAL_FL_MILESTONE_YR_25 = 25;
export const SURFSIDE_INLAND_FL_MILESTONE_YR_30 = 30;
// Estimated milestone inspection + initial structural-engineer report cost.
export const SURFSIDE_MILESTONE_INSPECTION_COST = 75_000;

// ── IRR-impact heuristics (basis-point sensitivities) ────────────────────
// Used to render the "IRR-impact sentence" inside each tooltip on the
// Reserves & Brand panel. These are first-order deltas — the panel shows
// them as directional guidance, not a full DCF re-run.
//
// Rule of thumb (Cornell School of Hotel Admin sensitivity studies, 2022):
//   • Each 1% of revenue diverted into FF&E reserve trims unlevered IRR
//     by ~25 bps for a 10-yr hold at 8% exit cap.
//   • Each 1% of revenue paid in brand fees trims unlevered IRR by ~20 bps
//     (because some brand fees are partly recapturable through ADR/occupancy
//     uplift).
//   • Each $1M of milestone capital event in year N trims IRR by ~15 bps
//     when N ≤ hold period.
export const IRR_BPS_PER_PCT_FFE_RESERVE = 25;
export const IRR_BPS_PER_PCT_BRAND_FEE = 20;
export const IRR_BPS_PER_MILLION_CAPITAL_EVENT = 15;

// ── Canonical brand asset R2 keys ─────────────────────────────────────────
// These are the R2 object keys for the three canonical H+ / L+B brand files
// that live in attached_assets/canonical/brand/ and are uploaded to R2 by
// `scripts/src/upload-brand-assets.ts`. They are served via
// GET /api/brand-assets/:filename (public proxy route).
export const R2_BRAND_KEY_H_PLUS_ENHANCED =
  "canonical/brand/logos/h_logo_enhanced_1775405767509.png";
export const R2_BRAND_KEY_H_PLUS_GLASS =
  "canonical/brand/logos/H_Logo_Glass_No_Backgrond_Enhanced_Square_1775582100563.png";
export const R2_BRAND_KEY_OG_BANNER =
  "canonical/brand/og/og-banner.png";
