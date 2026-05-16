import { sql } from "drizzle-orm";
import { pgTable, text, varchar, real, integer, timestamp, jsonb, boolean, index, serial, unique, check, primaryKey, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companies, businessBrands, type ResearchValueEntry } from "./core";
import { users } from "./auth";
import { portfolios } from "./portfolios";
import type { PriceEvent as PriceEventEntry } from "../price-history";
import {
  PropertyStatus,
  DEFAULT_COST_RATE_ROOMS,
  DEFAULT_COST_RATE_FB,
  DEFAULT_COST_RATE_ADMIN,
  DEFAULT_COST_RATE_MARKETING,
  DEFAULT_COST_RATE_PROPERTY_OPS,
  DEFAULT_COST_RATE_UTILITIES,
  DEFAULT_COST_RATE_IT,
  DEFAULT_COST_RATE_FFE,
  DEFAULT_COST_RATE_OTHER,
  DEFAULT_COST_RATE_INSURANCE,
  DEFAULT_REV_SHARE_EVENTS,
  DEFAULT_REV_SHARE_FB,
  DEFAULT_REV_SHARE_OTHER,
  DEFAULT_CATERING_BOOST_PCT,
  DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  DEFAULT_AR_DAYS,
  DEFAULT_AP_DAYS,
  DEFAULT_REINVESTMENT_RATE,
  DEFAULT_COST_SEG_5YR_PCT,
  DEFAULT_COST_SEG_7YR_PCT,
  DEFAULT_COST_SEG_15YR_PCT,
  DEFAULT_STAFF_TIER1_MAX_PROPERTIES,
  DEFAULT_STAFF_TIER2_MAX_PROPERTIES,
} from "../constants";
import { getFactoryNumber } from "../model-constants-registry";

// Audit #406: schema column default sourced from the registry (single source of truth).
// Drizzle introspection runs at module load — getFactoryNumber returns a number eagerly.
const US_COST_RATE_TAXES = getFactoryNumber("costRateTaxes", "United States");

// --- PROPERTIES TABLE ---
// Each row represents a single hotel property in the portfolio. This is the most
// data-rich table — it contains everything needed to generate a complete monthly
// pro forma: acquisition costs, revenue assumptions, operating cost rates,
// financing terms, and exit/disposition parameters.
//
// Key financial concepts:
//   - ADR (Average Daily Rate): price per room per night
//   - Occupancy: percentage of available rooms sold (starts low, ramps up)
//   - RevPAR: Revenue Per Available Room = ADR × Occupancy
//   - NOI (Net Operating Income): Total Revenue − Operating Expenses
//   - Cap Rate: NOI / Property Value (used to compute exit price)
//   - LTV (Loan-to-Value): percentage of property value financed by debt
//
// The "type" field determines the capital structure:
//   - "Full Equity": purchased entirely with cash
//   - "Financed": purchased with a mortgage (acquisitionLTV, interest rate, etc.)
// The "willRefinance" field enables a refinance event where existing debt is
// replaced with new debt, potentially pulling equity out of the property.
export const properties = pgTable("properties", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  location: text("location").notNull(),
  streetAddress: text("street_address"),
  streetAddress2: text("street_address_2"),
  city: text("city"),
  stateProvince: text("state_province"),
  zipPostalCode: text("zip_postal_code"),
  country: text("country"),
  market: text("market").notNull(),
  imageUrl: text("image_url").notNull(),
  status: text("status").notNull().default(PropertyStatus.PIPELINE),
  
  acquisitionDate: text("acquisition_date").notNull(),
  operationsStartDate: text("operations_start_date").notNull(),
  
  purchasePrice: real("purchase_price").notNull(),
  buildingImprovements: real("building_improvements").notNull(),
  landValuePercent: real("land_value_percent").notNull().default(0.25),
  preOpeningCosts: real("pre_opening_costs").notNull(),
  operatingReserve: real("operating_reserve").notNull(),
  
  roomCount: integer("room_count").notNull(),
  startAdr: real("start_adr").notNull(),
  adrGrowthRate: real("adr_growth_rate").notNull(),
  startOccupancy: real("start_occupancy").notNull(),
  maxOccupancy: real("max_occupancy").notNull(),
  occupancyRampMonths: integer("occupancy_ramp_months").notNull(),
  occupancyGrowthStep: real("occupancy_growth_step").notNull(),
  stabilizationMonths: integer("stabilization_months").notNull().default(36), // months; bootstrap value, reads property.stabilizationMonths at runtime

  pricingModel: text("pricing_model").$type<"per_room" | "per_property">(),
  nightlyPropertyRate: real("nightly_property_rate"),
  maxGuests: integer("max_guests"),

  seasonalityProfile: jsonb("seasonality_profile").$type<number[]>(),
  occupancyRampCurve: jsonb("occupancy_ramp_curve").$type<number[]>(),

  type: text("type").notNull(),
  
  // Financing fields (for Financed type)
  acquisitionLTV: real("acquisition_ltv"),
  acquisitionInterestRate: real("acquisition_interest_rate"),
  acquisitionTermYears: integer("acquisition_term_years"),
  acquisitionClosingCostRate: real("acquisition_closing_cost_rate"),
  
  // Refinance fields (for Full Equity with refinance)
  willRefinance: text("will_refinance"),
  refinanceDate: text("refinance_date"),
  refinanceLTV: real("refinance_ltv"),
  refinanceInterestRate: real("refinance_interest_rate"),
  refinanceTermYears: integer("refinance_term_years"),
  refinanceClosingCostRate: real("refinance_closing_cost_rate"),
  
  // Operating Cost Rates (should sum to 100%)
  costRateRooms: real("cost_rate_rooms").notNull().default(DEFAULT_COST_RATE_ROOMS),
  costRateFB: real("cost_rate_fb").notNull().default(DEFAULT_COST_RATE_FB),
  costRateAdmin: real("cost_rate_admin").notNull().default(DEFAULT_COST_RATE_ADMIN),
  costRateMarketing: real("cost_rate_marketing").notNull().default(DEFAULT_COST_RATE_MARKETING),
  costRatePropertyOps: real("cost_rate_property_ops").notNull().default(DEFAULT_COST_RATE_PROPERTY_OPS),
  costRateUtilities: real("cost_rate_utilities").notNull().default(DEFAULT_COST_RATE_UTILITIES),
  costRateTaxes: real("cost_rate_taxes").notNull().default(US_COST_RATE_TAXES),
  costRateIT: real("cost_rate_it").notNull().default(DEFAULT_COST_RATE_IT),
  costRateFFE: real("cost_rate_ffe").notNull().default(DEFAULT_COST_RATE_FFE),
  costRateOther: real("cost_rate_other").notNull().default(DEFAULT_COST_RATE_OTHER),
  costRateInsurance: real("cost_rate_insurance").notNull().default(DEFAULT_COST_RATE_INSURANCE),

  // Revenue Streams (as % of room revenue)
  revShareEvents: real("rev_share_events").notNull().default(DEFAULT_REV_SHARE_EVENTS),
  revShareFB: real("rev_share_fb").notNull().default(DEFAULT_REV_SHARE_FB),
  revShareOther: real("rev_share_other").notNull().default(DEFAULT_REV_SHARE_OTHER),
  
  // Catering boost (percentage uplift applied to F&B revenue)
  cateringBoostPercent: real("catering_boost_percent").notNull().default(DEFAULT_CATERING_BOOST_PCT),
  
  // Exit Cap Rate (for property valuation)
  exitCapRate: real("exit_cap_rate").notNull().default(0.085),
  
  // Income Tax Rate (for calculating after-tax free cash flow)
  // NOTE: This is the corporate INCOME tax rate, NOT the property/real-estate tax rate.
  // Property taxes are computed via costRateTaxes (assessed on property value).
  taxRate: real("tax_rate").notNull().default(0.25),

  // Per-property inflation rate (nullable — NULL means use global default)
  inflationRate: real("inflation_rate"),
  
  // Country risk premium (Damodaran-based, fetched via API; nullable = auto-detect from location)
  countryRiskPremium: real("country_risk_premium"),

  // Disposition (per-property sale commission)
  dispositionCommission: real("disposition_commission").notNull().default(0.05),

  // Refinance years after acquisition (when refinancing should occur)
  refinanceYearsAfterAcquisition: integer("refinance_years_after_acquisition"),

  // Refi LTV cap: maximum loan as a multiple of purchasePrice (e.g. 1.00 = no
  // equity strip). NULL = uncapped. Prevents over-leveraging on Full Equity
  // properties where a high in-place NOI could otherwise justify a refi loan
  // that exceeds the original cost basis.
  refiMaxLtvToOriginal: real("refi_max_ltv_to_original"),

  // Refinance basis: which property value is used to size the refi loan.
  // 'purchase_price'                  — original purchase price only (default)
  // 'purchase_price_plus_improvements'— purchase price + building improvements budget
  // 'appreciated_asset'               — income-cap estimate (NOI / exit cap rate)
  refinanceBasis: text("refinance_basis"),

  // Management Company Fee Rates (per-property, charged by management company)
  baseManagementFeeRate: real("base_management_fee_rate").notNull().default(DEFAULT_BASE_MANAGEMENT_FEE_RATE),
  incentiveManagementFeeRate: real("incentive_management_fee_rate").notNull().default(DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE),

  // Brand-fee stack (per-property, % of room revenue). Nullable so the calc
  // engine can fall back to factory defaults in `shared/constants-brand.ts`
  // when no per-property override is configured. Surfaced on the
  // Reserves & Brand Costs panel for boutique hotels.
  franchiseFeeRate: real("franchise_fee_rate"),
  royaltyFeeRate: real("royalty_fee_rate"),
  brandMarketingFeeRate: real("brand_marketing_fee_rate"),
  loyaltyProgramFeeRate: real("loyalty_program_fee_rate"),
  reservationFeeRate: real("reservation_fee_rate"),
  brandTechnologyFeeRate: real("brand_technology_fee_rate"),

  // HMA (Hotel Management Agreement) terms. `hmaContractStartYear` lets
  // the panel compute `term remaining` against `current_year`;
  // `hmaTerminationFeeMonths` is the months of base mgmt fee owed to the
  // operator at termination (typical HMA buyout convention).
  hmaTermYears: integer("hma_term_years"),
  hmaTerminationNoticeMonths: integer("hma_termination_notice_months"),
  hmaContractStartYear: integer("hma_contract_start_year"),
  hmaTerminationFeeMonths: integer("hma_termination_fee_months"),

  // PIP (Property Improvement Plan) schedule. Each entry: { yearOffset, scope, estimatedCost }.
  // When null, the calc engine projects events from `lastRenovationYear` /
  // `yearBuilt` using `DEFAULT_PIP_CYCLE_YEARS`.
  pipScheduleJson: jsonb("pip_schedule_json"),

  // Mixed-use / condo association exposure. `condoPendingSpecialAssessments`
  // is the dollar amount of any pending one-time HOA/condo special
  // assessments levied against the unit (post-Surfside reserves rebuild,
  // facade work, etc.) that hit cash flow outside the normal dues line.
  condoDuesPctRevenue: real("condo_dues_pct_revenue"),
  condoExposureNotes: text("condo_exposure_notes"),
  condoPendingSpecialAssessments: real("condo_pending_special_assessments"),

  // Owner's priority return and fee subordination
  ownerPriorityReturn: real("owner_priority_return"),
  feeSubordination: text("fee_subordination"),
  performanceTestEnabled: boolean("performance_test_enabled").notNull().default(false),

  // Working capital
  arDays: integer("ar_days").notNull().default(DEFAULT_AR_DAYS),
  apDays: integer("ap_days").notNull().default(DEFAULT_AP_DAYS),

  // MIRR
  reinvestmentRate: real("reinvestment_rate").notNull().default(DEFAULT_REINVESTMENT_RATE),

  // Day-count convention
  dayCountConvention: text("day_count_convention").notNull().default('30/360'),

  // Escalation method
  escalationMethod: text("escalation_method").notNull().default('annual'),

  // Cost segregation
  costSegEnabled: boolean("cost_seg_enabled").notNull().default(false),
  costSeg5yrPct: real("cost_seg_5yr_pct").notNull().default(DEFAULT_COST_SEG_5YR_PCT),
  costSeg7yrPct: real("cost_seg_7yr_pct").notNull().default(DEFAULT_COST_SEG_7YR_PCT),
  costSeg15yrPct: real("cost_seg_15yr_pct").notNull().default(DEFAULT_COST_SEG_15YR_PCT),

  depreciationYears: real("depreciation_years"),

  starRating: integer("star_rating"),
  starRatingSource: text("star_rating_source").default("manual"),
  starRatingSuggested: integer("star_rating_suggested"),
  qualityTier: text("quality_tier").notNull().default("upscale"),
  hospitalityType: text("hospitality_type").notNull().default("hotel"),
  businessModel: text("business_model").notNull().default("hotel"),
  // Platform fee rate for STR archetypes (Airbnb/VRBO commission %).
  // Nullable — NULL falls back to BUSINESS_MODEL_DEFAULTS[businessModel].platformFeeRate.
  platformFeeRate: real("platform_fee_rate"),
  brandId: integer("brand_id").references(() => businessBrands.id, { onDelete: "restrict" }),

  description: text("description"),

  // Property descriptor fields — context for research engines and comp set selection
  serviceLevel: text("service_level"),
  locationType: text("location_type"),
  marketTier: text("market_tier"),
  guestMixBusiness: real("guest_mix_business"),
  guestMixLeisure: real("guest_mix_leisure"),
  guestMixGroup: real("guest_mix_group"),
  fbVenues: integer("fb_venues"),
  fbSeats: integer("fb_seats"),
  eventSpaceSqft: integer("event_space_sqft"),
  totalPropertyAcreage: real("total_property_acreage"),
  totalBuildingSqft: integer("total_building_sqft"),
  yearBuilt: integer("year_built"),
  lastRenovationYear: integer("last_renovation_year"),

  // As-Purchased description — explicit purchased-state narrative (Milestone A, task #1404).
  // Seeded from the legacy `description` column at migration time. `description` is kept for
  // backward compatibility with all existing consumers; the UI writes to this field going forward.
  descriptionPurchased: text("description_purchased"),

  // As-Improved counterparts — renovation hypothesis (Milestone A, task #1404).
  // Each mirrors its As-Purchased twin but represents the projected post-renovation state.
  // Null means "not yet set"; the UI renders the As-Purchased value as a faded placeholder.
  fbVenuesImproved: integer("fb_venues_improved"),
  fbSeatsImproved: integer("fb_seats_improved"),
  eventSpaceSqftImproved: integer("event_space_sqft_improved"),
  totalBuildingSqftImproved: integer("total_building_sqft_improved"),
  plannedReopeningYear: integer("planned_reopening_year"),
  descriptionImproved: text("description_improved"),

  // Descriptor JSONB blobs — Milestone B (task #1407). Mirror the catalogued
  // typed columns above. Read through `getEffectivePropertyView` (in
  // `@workspace/db/property-descriptor-accessor`); written via the dual-write
  // helper `buildDescriptorDualWritePatch`. JSONB-only writes are forbidden
  // until every reader has been migrated to the accessor.
  descriptorsPurchased: jsonb("descriptors_purchased")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  descriptorsImproved: jsonb("descriptors_improved")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),

  managementType: text("management_type"),
  onMunicipalSewer: boolean("on_municipal_sewer").default(false),

  // STR (short-term-rental) regulatory exemption — Task #810.
  // True when the subject asset is a licensed hotel with a Certificate of
  // Occupancy or otherwise outside the locality's STR ordinance scope. The
  // STR Restriction Trends panel uses this to render an "Exempt" vs.
  // "Exposed" badge and to drive the Risk Specialist (Task #801) overlay.
  strExempt: boolean("str_exempt").notNull().default(false),

  // Conversion cost fields — residential → hotel capital stack
  conversionCost: real("conversion_cost"),
  roomAdditionCost: real("room_addition_cost"),
  eventVenueCost: real("event_venue_cost"),
  commercialKitchenCost: real("commercial_kitchen_cost"),
  zoningPermitCost: real("zoning_permit_cost"),
  fireCodeAdaCost: real("fire_code_ada_cost"),
  liquorLicenseCost: real("liquor_license_cost"),
  operatingDeficitReserve: real("operating_deficit_reserve"),
  estimatedConversionMonths: integer("estimated_conversion_months"),

  latitude: real("latitude"),
  longitude: real("longitude"),

  stableKey: uuid("stable_key").notNull().defaultRandom().unique(),

  researchValues: jsonb("research_values").$type<Record<string, ResearchValueEntry>>(),

  sourceUrls: text("source_urls").array(),

  // Acquisition price-history (mirrored from prospective_properties when a
  // PropertyFinder target is converted into a real property). Lets the
  // Analyst keep reasoning about list-vs-current-price drift, days on
  // market, relist count, and motivation tier post-import. Maintained by
  // shared/price-history.ts roll-up logic on every write.
  priceEvents: jsonb("price_events").$type<PriceEventEntry[]>().notNull().default([]),
  originalListPrice: real("original_list_price"),
  originalListDate: text("original_list_date"),
  priorSalePrice: real("prior_sale_price"),
  priorSaleDate: text("prior_sale_date"),
  cumulativeDropPct: real("cumulative_drop_pct"),
  currentDom: integer("current_dom"),
  relistCount: integer("relist_count").notNull().default(0),
  motivationTier: text("motivation_tier"),

  // Waterfall / LP-GP capital structure (ADR-011)
  // Engine integration wired in computeReturnsSummary (finance route) — ADR-010 Specialist Q/R still deferred.
  // lp_equity_pct: LP share of total equity (0–1); GP share = 1 − lp_equity_pct.
  // catch_up_rate: fraction of catch-up dollars going to GP (1.0 = 100% GP during catch-up).
  // catch_up_to_gp_pct: GP's target share of all distributions after pref.
  // waterfall_tiers: WaterfallTier[] — {label, hurdle_irr, lp_split, gp_split}[]. null = use seed defaults.
  lpEquityPct: real("lp_equity_pct"),
  catchUpRate: real("catch_up_rate"),
  catchUpToGpPct: real("catch_up_to_gp_pct"),
  waterfallTiers: jsonb("waterfall_tiers").$type<Array<{ label: string; hurdle_irr: number; lp_split: number; gp_split: number }> | null>(),

  // Whether this property is active in the portfolio.
  // Inactive properties are excluded from all calculations and aggregations.
  // Default and seed value is true (ON).
  isActive: boolean("is_active").notNull().default(true),
  
  lastAssumptionChangeAt: timestamp("last_assumption_change_at"),

  // The Analyst validation + research fitness status
  // "pending_validation" = seeded/imported, Analyst hasn't reviewed yet
  // "validated" = Analyst confirmed all fields within range, research-ready
  // "stale" = Analyst data older than 30 days, refresh recommended
  // "flagged" = Analyst found fields outside expected ranges, needs review
  // "excluded_data" = Analyst excluded from research pool — data too unreliable
  // "excluded_admin" = Admin manually excluded from research pool
  validationStatus: text("validation_status").notNull().default("pending_validation"),
  lastValidatedAt: timestamp("last_validated_at"),
  flaggedFieldCount: integer("flagged_field_count").notNull().default(0),
  // When this property's full financial model (revenue + cost lines + capital
  // stack) was last successfully computed. Read by the
  // `all-properties-financials-computed` prerequisite evaluator
  // (engine/analyst/registry/prerequisite-registry.ts) to decide whether
  // every property in scope has a fresh financial statement before a gated
  // Specialist runs. Null = never computed; the gate fails loudly so the
  // operator runs the model first.
  financialsComputedAt: timestamp("financials_computed_at"),
  // Why The Analyst excluded this property (null if not excluded)
  validationReason: text("validation_reason"),

  // Portfolio grouping — null = unassigned (T2-2)
  portfolioId: integer("portfolio_id").references(() => portfolios.id, { onDelete: "set null" }),

  // Soft-delete: null = active, non-null = archived (never hard-delete properties)
  archivedAt: timestamp("archived_at"),
  archivedBy: integer("archived_by").references(() => users.id),
  // Tracks who originally created/seeded this property
  createdBy: integer("created_by").references(() => users.id),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("properties_user_id_idx").on(table.userId),
  // Covering indexes for FK columns — joined / filtered by admin pages.
  index("properties_brand_id_idx").on(table.brandId),
  index("properties_created_by_idx").on(table.createdBy),
  index("properties_archived_by_idx").on(table.archivedBy),
  check("prop_room_count_positive", sql`${table.roomCount} > 0`),
  check("prop_start_adr_positive", sql`${table.startAdr} > 0`),
  check("prop_start_occupancy_range", sql`${table.startOccupancy} >= 0 AND ${table.startOccupancy} <= 1`),
  check("prop_max_occupancy_range", sql`${table.maxOccupancy} >= 0 AND ${table.maxOccupancy} <= 1`),
  check("prop_occupancy_growth_range", sql`${table.occupancyGrowthStep} >= 0 AND ${table.occupancyGrowthStep} <= 1`),
  check("prop_tax_rate_range", sql`${table.taxRate} >= 0 AND ${table.taxRate} <= 1`),
  check("prop_exit_cap_rate_range", sql`${table.exitCapRate} > 0 AND ${table.exitCapRate} <= 1`),
  check("prop_base_mgmt_fee_range", sql`${table.baseManagementFeeRate} >= 0 AND ${table.baseManagementFeeRate} <= 1`),
  check("prop_incentive_mgmt_fee_range", sql`${table.incentiveManagementFeeRate} >= 0 AND ${table.incentiveManagementFeeRate} <= 1`),
]);

export const insertPropertySchema = createInsertSchema(properties).pick({
  userId: true,
  name: true,
  location: true,
  streetAddress: true,
  streetAddress2: true,
  city: true,
  stateProvince: true,
  zipPostalCode: true,
  country: true,
  market: true,
  imageUrl: true,
  status: true,
  acquisitionDate: true,
  operationsStartDate: true,
  purchasePrice: true,
  buildingImprovements: true,
  landValuePercent: true,
  preOpeningCosts: true,
  operatingReserve: true,
  roomCount: true,
  startAdr: true,
  adrGrowthRate: true,
  startOccupancy: true,
  maxOccupancy: true,
  occupancyRampMonths: true,
  occupancyGrowthStep: true,
  pricingModel: true,
  nightlyPropertyRate: true,
  maxGuests: true,
  seasonalityProfile: true,
  occupancyRampCurve: true,
  type: true,
  acquisitionLTV: true,
  acquisitionInterestRate: true,
  acquisitionTermYears: true,
  acquisitionClosingCostRate: true,
  willRefinance: true,
  refinanceDate: true,
  refinanceLTV: true,
  refinanceInterestRate: true,
  refinanceTermYears: true,
  refinanceClosingCostRate: true,
  costRateRooms: true,
  costRateFB: true,
  costRateAdmin: true,
  costRateMarketing: true,
  costRatePropertyOps: true,
  costRateUtilities: true,
  costRateTaxes: true,
  costRateIT: true,
  costRateFFE: true,
  costRateOther: true,
  costRateInsurance: true,
  revShareEvents: true,
  revShareFB: true,
  revShareOther: true,
  cateringBoostPercent: true,
  exitCapRate: true,
  taxRate: true,
  countryRiskPremium: true,
  dispositionCommission: true,
  refinanceYearsAfterAcquisition: true,
  refiMaxLtvToOriginal: true,
  refinanceBasis: true,
  baseManagementFeeRate: true,
  incentiveManagementFeeRate: true,
  franchiseFeeRate: true,
  royaltyFeeRate: true,
  brandMarketingFeeRate: true,
  loyaltyProgramFeeRate: true,
  reservationFeeRate: true,
  brandTechnologyFeeRate: true,
  hmaTermYears: true,
  hmaTerminationNoticeMonths: true,
  hmaContractStartYear: true,
  hmaTerminationFeeMonths: true,
  pipScheduleJson: true,
  condoDuesPctRevenue: true,
  condoExposureNotes: true,
  condoPendingSpecialAssessments: true,
  ownerPriorityReturn: true,
  feeSubordination: true,
  performanceTestEnabled: true,
  arDays: true,
  apDays: true,
  reinvestmentRate: true,
  dayCountConvention: true,
  escalationMethod: true,
  costSegEnabled: true,
  costSeg5yrPct: true,
  costSeg7yrPct: true,
  costSeg15yrPct: true,
  depreciationYears: true,
  starRating: true,
  starRatingSource: true,
  starRatingSuggested: true,
  qualityTier: true,
  hospitalityType: true,
  businessModel: true,
  platformFeeRate: true,
  brandId: true,
  description: true,
  serviceLevel: true,
  locationType: true,
  marketTier: true,
  guestMixBusiness: true,
  guestMixLeisure: true,
  guestMixGroup: true,
  fbVenues: true,
  fbSeats: true,
  eventSpaceSqft: true,
  totalPropertyAcreage: true,
  totalBuildingSqft: true,
  yearBuilt: true,
  lastRenovationYear: true,
  descriptionPurchased: true,
  fbVenuesImproved: true,
  fbSeatsImproved: true,
  eventSpaceSqftImproved: true,
  totalBuildingSqftImproved: true,
  plannedReopeningYear: true,
  descriptionImproved: true,
  // descriptorsPurchased / descriptorsImproved are intentionally NOT pickable
  // from the API. Task #1407 (Milestone B) — these JSONB blobs are only
  // written server-side via `buildDescriptorDualWritePatch` so the typed
  // columns and the JSONB mirrors stay in lock-step during the migration
  // window. Direct client writes would silently create drift.
  managementType: true,
  onMunicipalSewer: true,
  strExempt: true,
  conversionCost: true,
  roomAdditionCost: true,
  eventVenueCost: true,
  commercialKitchenCost: true,
  zoningPermitCost: true,
  fireCodeAdaCost: true,
  liquorLicenseCost: true,
  operatingDeficitReserve: true,
  estimatedConversionMonths: true,
  latitude: true,
  longitude: true,
  researchValues: true,
  sourceUrls: true,
  isActive: true,
  createdBy: true,
  validationStatus: true,
  lastValidatedAt: true,
  flaggedFieldCount: true,
  validationReason: true,
  priceEvents: true,
  portfolioId: true,
}).extend({
  imageUrl: z.string().min(1, "imageUrl is required"),
  startOccupancy: z.number().min(0).max(1),
  maxOccupancy: z.number().min(0).max(1),
  occupancyGrowthStep: z.number().min(0).max(1),
});

export const HOSPITALITY_TYPES = ["hotel", "resort", "boutique_hotel", "business_hotel", "wellness_resort", "conference_hotel", "extended_stay", "vrbo", "lodge"] as const;

export const BUSINESS_MODEL_TYPES = ["hotel", "lodge", "vrbo", "vrbo_owner_managed"] as const;
export type BusinessModel = typeof BUSINESS_MODEL_TYPES[number];
export type HospitalityType = typeof HOSPITALITY_TYPES[number];

export const QUALITY_TIERS = ["luxury", "upper_upscale", "upscale", "upper_midscale", "midscale", "economy"] as const;
export type QualityTier = typeof QUALITY_TIERS[number];

const starRatingRefinement = z.object({
  starRating: z.number().int().min(1).max(5).nullable().optional(),
  starRatingSuggested: z.number().int().min(1).max(5).nullable().optional(),
  starRatingSource: z.enum(["manual", "suggested"]).nullable().optional(),
  qualityTier: z.enum(QUALITY_TIERS).optional(),
  hospitalityType: z.enum(HOSPITALITY_TYPES).optional(),
  businessModel: z.enum(BUSINESS_MODEL_TYPES).optional(),
  platformFeeRate: z.number().min(0).max(1).nullable().optional(),
  sourceUrls: z.array(z.string().url()).max(20).nullable().optional(),
  pricingModel: z.enum(["per_room", "per_property"]).nullable().optional(),
  nightlyPropertyRate: z.number().nullable().optional(),
  maxGuests: z.number().int().nullable().optional(),
  seasonalityProfile: z.array(z.number()).length(12).nullable().optional(),
  occupancyRampCurve: z.array(z.number()).nullable().optional(),
}).partial();

export const updatePropertySchema = insertPropertySchema
  .omit({ userId: true, createdBy: true })
  .partial()
  .extend(starRatingRefinement.shape);

export const selectPropertySchema = createSelectSchema(properties);

export type Property = typeof properties.$inferSelect;
export type InsertProperty = z.infer<typeof insertPropertySchema>;
export type UpdateProperty = z.infer<typeof updatePropertySchema>;

// --- PROPERTY URLS TABLE ---
// Linked reference URLs for a property — listings, maps, review sites, etc.
// Each URL is validated (format + reachability) and scored for relevance.
// Separate from sourceUrls (text[] on properties) which are simple research inputs.
export const propertyUrls = pgTable("property_urls", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  propertyId: integer("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  label: text("label"),
  isValid: boolean("is_valid"),
  isRelevant: boolean("is_relevant"),
  relevanceScore: real("relevance_score"),
  lastCheckedAt: timestamp("last_checked_at"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_property_urls_property_id").on(t.propertyId),
]);

export const insertPropertyUrlSchema = createInsertSchema(propertyUrls).pick({
  propertyId: true,
  url: true,
  label: true,
  isValid: true,
  isRelevant: true,
  relevanceScore: true,
  metadata: true,
});

export type PropertyUrl = typeof propertyUrls.$inferSelect;
export type InsertPropertyUrl = z.infer<typeof insertPropertyUrlSchema>;

// --- USER GROUP PROPERTIES TABLE ---

