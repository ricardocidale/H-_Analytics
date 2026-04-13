import { sql } from "drizzle-orm";
import { pgTable, text, varchar, real, integer, timestamp, jsonb, boolean, index, serial, unique, check, primaryKey, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { companies, businessBrands, type ResearchValueEntry } from "./core";
import { users } from "./auth";
import {
  PropertyStatus,
  DEFAULT_LAND_VALUE_PERCENT,
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
  DEFAULT_REV_SHARE_EVENTS,
  DEFAULT_REV_SHARE_FB,
  DEFAULT_REV_SHARE_OTHER,
  DEFAULT_CATERING_BOOST_PCT,
  DEFAULT_EXIT_CAP_RATE,
  DEFAULT_PROPERTY_TAX_RATE,
  DEFAULT_COMMISSION_RATE,
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
  DEFAULT_STABILIZATION_MONTHS,
} from "../constants";

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
  landValuePercent: real("land_value_percent").notNull().default(DEFAULT_LAND_VALUE_PERCENT),
  preOpeningCosts: real("pre_opening_costs").notNull(),
  operatingReserve: real("operating_reserve").notNull(),
  
  roomCount: integer("room_count").notNull(),
  startAdr: real("start_adr").notNull(),
  adrGrowthRate: real("adr_growth_rate").notNull(),
  startOccupancy: real("start_occupancy").notNull(),
  maxOccupancy: real("max_occupancy").notNull(),
  occupancyRampMonths: integer("occupancy_ramp_months").notNull(),
  occupancyGrowthStep: real("occupancy_growth_step").notNull(),
  stabilizationMonths: integer("stabilization_months").notNull().default(DEFAULT_STABILIZATION_MONTHS),

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
  costRateTaxes: real("cost_rate_taxes").notNull().default(DEFAULT_COST_RATE_TAXES),
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
  exitCapRate: real("exit_cap_rate").notNull().default(DEFAULT_EXIT_CAP_RATE),
  
  // Income Tax Rate (for calculating after-tax free cash flow)
  // NOTE: This is the corporate INCOME tax rate, NOT the property/real-estate tax rate.
  // Property taxes are computed via costRateTaxes (assessed on property value).
  taxRate: real("tax_rate").notNull().default(DEFAULT_PROPERTY_TAX_RATE),

  // Per-property inflation rate (nullable — NULL means use global default)
  inflationRate: real("inflation_rate"),
  
  // Country risk premium (Damodaran-based, fetched via API; nullable = auto-detect from location)
  countryRiskPremium: real("country_risk_premium"),

  // Disposition (per-property sale commission)
  dispositionCommission: real("disposition_commission").notNull().default(DEFAULT_COMMISSION_RATE),

  // Refinance years after acquisition (when refinancing should occur)
  refinanceYearsAfterAcquisition: integer("refinance_years_after_acquisition"),

  // Management Company Fee Rates (per-property, charged by management company)
  baseManagementFeeRate: real("base_management_fee_rate").notNull().default(DEFAULT_BASE_MANAGEMENT_FEE_RATE),
  incentiveManagementFeeRate: real("incentive_management_fee_rate").notNull().default(DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE),

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
  brandId: integer("brand_id").references(() => businessBrands.id, { onDelete: "set null" }),

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
  managementType: text("management_type"),
  onMunicipalSewer: boolean("on_municipal_sewer").default(false),

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

  // Whether this property is active in the portfolio.
  // Inactive properties are excluded from all calculations and aggregations.
  // Default and seed value is true (ON).
  isActive: boolean("is_active").notNull().default(true),
  
  lastAssumptionChangeAt: timestamp("last_assumption_change_at"),

  // Soft-delete: null = active, non-null = archived (never hard-delete properties)
  archivedAt: timestamp("archived_at"),
  archivedBy: integer("archived_by").references(() => users.id),
  // Tracks who originally created/seeded this property
  createdBy: integer("created_by").references(() => users.id),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("properties_user_id_idx").on(table.userId),
  index("properties_created_at_idx").on(table.createdAt),
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
  baseManagementFeeRate: true,
  incentiveManagementFeeRate: true,
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
  managementType: true,
  onMunicipalSewer: true,
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
});

export const HOSPITALITY_TYPES = ["hotel", "resort", "boutique_hotel", "business_hotel", "wellness_resort", "conference_hotel", "extended_stay", "vrbo", "lodge"] as const;

export const BUSINESS_MODEL_TYPES = ["hotel", "lodge", "vrbo"] as const;
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
  sourceUrls: z.array(z.string().url()).max(20).nullable().optional(),
  pricingModel: z.enum(["per_room", "per_property"]).nullable().optional(),
  nightlyPropertyRate: z.number().nullable().optional(),
  maxGuests: z.number().int().nullable().optional(),
  seasonalityProfile: z.array(z.number()).length(12).nullable().optional(),
  occupancyRampCurve: z.array(z.number()).nullable().optional(),
}).partial();

export const updatePropertySchema = insertPropertySchema.partial().merge(starRatingRefinement);

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

