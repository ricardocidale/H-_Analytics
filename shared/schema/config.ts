import { sql } from "drizzle-orm";
import { pgTable, text, real, integer, timestamp, jsonb, boolean, index, unique, check } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { logos } from "./core";
import { users } from "./auth";
import type { IcpConfig, ExportConfig, StandardAcqPackage, DebtAssumptions, AssetDefinition, RequiredFieldsConfig } from "./types/jsonb-shapes";
import {
  DEFAULT_CAPITAL_RAISE_VALUATION_CAP,
  DEFAULT_CAPITAL_RAISE_DISCOUNT_RATE,
  DEFAULT_FUNDING_INTEREST_RATE,
  DEFAULT_FUNDING_INTEREST_PAYMENT_FREQUENCY,
  DEFAULT_REV_SHARE_EVENTS,
  DEFAULT_REV_SHARE_FB,
  DEFAULT_REV_SHARE_OTHER,
  DEFAULT_CATERING_BOOST_PCT,
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
  DEFAULT_BUSINESS_INSURANCE_START,
  DEFAULT_EXIT_CAP_RATE,
  DEFAULT_COST_OF_EQUITY,
  DEFAULT_PROPERTY_TAX_RATE,
  DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  DEFAULT_LAND_VALUE_PERCENT,
  DEFAULT_COMMISSION_RATE,
  DEFAULT_EVENT_EXPENSE_RATE,
  DEFAULT_OTHER_EXPENSE_RATE,
  DEFAULT_SERVICE_MARKUP,
  DEFAULT_UTILITIES_VARIABLE_SPLIT,
  DEFAULT_FIXED_COST_ESCALATION_RATE,
  DEFAULT_COMPANY_TAX_RATE,
  DEFAULT_PROJECTION_YEARS,
  DEFAULT_MAX_STALENESS_HOURS,
  DEFAULT_PROPERTY_INFLATION_RATE,
  DEFAULT_AR_DAYS,
  DEFAULT_AP_DAYS,
  DEFAULT_REINVESTMENT_RATE,
  DEFAULT_COST_SEG_5YR_PCT,
  DEFAULT_COST_SEG_7YR_PCT,
  DEFAULT_COST_SEG_15YR_PCT,
  DEFAULT_ALERT_COOLDOWN_MINUTES,
  DEFAULT_STAFF_TIER1_MAX_PROPERTIES,
  DEFAULT_STAFF_TIER2_MAX_PROPERTIES,
  DEFAULT_STAFF_SALARY,
  DEFAULT_OFFICE_LEASE_START,
  DEFAULT_PROFESSIONAL_SERVICES_START,
  DEFAULT_TECH_INFRA_START,
  DEFAULT_TRAVEL_COST_PER_CLIENT,
  DEFAULT_IT_LICENSE_PER_CLIENT,
  DEFAULT_MARKETING_RATE,
  DEFAULT_MISC_OPS_RATE,
} from "../constants";

// --- GLOBAL ASSUMPTIONS TABLE ---
// The "Settings" page in the UI. Contains every system-wide financial assumption
// that drives the pro forma model — from management company compensation and
// overhead to funding instrument terms and debt assumptions.
//
// Key sections:
//   - Company identity (name, logo, property label)
//   - Model timeline (start date, projection years, fiscal year)
//   - Management fees (base % of revenue + incentive % of GOP)
//   - Funding instrument (tranche amounts, optional valuation cap, optional discount rate)
//   - Partner compensation (yearly salary schedule for up to 10 years)
//   - Staffing tiers (FTE headcount scales with portfolio size)
//   - Fixed overhead (office lease, professional services, tech)
//   - Variable costs (travel, IT licenses, marketing, misc ops)
//   - Debt assumptions (acquisition and refinance LTV, interest rate, etc.)
//   - Exit assumptions (cap rate, commission, tax rate)
//   - Feature toggles (which sidebar items and features are visible)
//
// Per-user: each user can have their own assumptions (for scenario isolation).
// If a user has no specific assumptions, the system falls back to the shared row.


import type { ResearchConfig } from "./research-types";
export type { ResearchSourceEntry, ResearchSourceFile, ResearchEventConfig, AiModelEntry, LlmMode, LlmVendor, ResearchConfig } from "./research-types";

export const globalAssumptions = pgTable("global_assumptions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  appName: text("app_name"),
  companyName: text("company_name").notNull().default("Hospitality Business"),
  companyLogo: text("company_logo"), // Legacy URL fallback — branding chain: companyLogoId FK → companyLogo URL → default asset
  companyLogoId: integer("company_logo_id").references(() => logos.id, { onDelete: "set null" }), // Preferred: normalized FK to logos table
  propertyLabel: text("property_label").notNull().default("Boutique Hotel"),
  assetDescription: text("asset_description"),
  assetLogoId: integer("asset_logo_id").references(() => logos.id, { onDelete: "set null" }),
  modelStartDate: text("model_start_date").notNull(),
  projectionYears: integer("projection_years").notNull().default(DEFAULT_PROJECTION_YEARS),
  companyOpsStartDate: text("company_ops_start_date").notNull().default("2026-06-01"),
  fiscalYearStartMonth: integer("fiscal_year_start_month").notNull().default(1), // 1 = January, 4 = April, etc.
  inflationRate: real("inflation_rate").notNull().default(DEFAULT_PROPERTY_INFLATION_RATE),
  fixedCostEscalationRate: real("fixed_cost_escalation_rate").notNull().default(DEFAULT_FIXED_COST_ESCALATION_RATE),

  // Company-specific inflation rate (nullable — NULL means use global inflationRate)
  companyInflationRate: real("company_inflation_rate"),
  
  // Revenue variables
  baseManagementFee: real("base_management_fee").notNull().default(DEFAULT_BASE_MANAGEMENT_FEE_RATE),
  incentiveManagementFee: real("incentive_management_fee").notNull().default(DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE),
  
  // Owner's priority return and fee subordination defaults
  defaultOwnerPriorityReturn: real("default_owner_priority_return"),
  defaultFeeSubordination: text("default_fee_subordination").notNull().default("partial"),

  // Funding Instrument (generic capital raise — may be SAFE, convertible note, seed round, etc.)
  fundingSourceLabel: text("funding_source_label").notNull().default("Funding Vehicle"),
  capitalRaise1Amount: real("capital_raise_1_amount").notNull().default(800000),
  capitalRaise1Date: text("capital_raise_1_date").notNull().default("2026-06-01"),
  capitalRaise2Amount: real("capital_raise_2_amount").notNull().default(800000),
  capitalRaise2Date: text("capital_raise_2_date").notNull().default("2027-04-01"),
  capitalRaiseValuationCap: real("capital_raise_valuation_cap").notNull().default(DEFAULT_CAPITAL_RAISE_VALUATION_CAP),
  capitalRaiseDiscountRate: real("capital_raise_discount_rate").notNull().default(DEFAULT_CAPITAL_RAISE_DISCOUNT_RATE),
  fundingInterestRate: real("funding_interest_rate").notNull().default(DEFAULT_FUNDING_INTEREST_RATE),
  fundingInterestPaymentFrequency: text("funding_interest_payment_frequency").notNull().default(DEFAULT_FUNDING_INTEREST_PAYMENT_FREQUENCY),
  
  // Cost variables - Compensation (yearly partner compensation and count)
  partnerCompYear1: real("partner_comp_year1").notNull().default(540000),
  partnerCompYear2: real("partner_comp_year2").notNull().default(540000),
  partnerCompYear3: real("partner_comp_year3").notNull().default(540000),
  partnerCompYear4: real("partner_comp_year4").notNull().default(600000),
  partnerCompYear5: real("partner_comp_year5").notNull().default(600000),
  partnerCompYear6: real("partner_comp_year6").notNull().default(700000),
  partnerCompYear7: real("partner_comp_year7").notNull().default(700000),
  partnerCompYear8: real("partner_comp_year8").notNull().default(800000),
  partnerCompYear9: real("partner_comp_year9").notNull().default(800000),
  partnerCompYear10: real("partner_comp_year10").notNull().default(900000),
  
  partnerCountYear1: integer("partner_count_year1").notNull().default(3),
  partnerCountYear2: integer("partner_count_year2").notNull().default(3),
  partnerCountYear3: integer("partner_count_year3").notNull().default(3),
  partnerCountYear4: integer("partner_count_year4").notNull().default(3),
  partnerCountYear5: integer("partner_count_year5").notNull().default(3),
  partnerCountYear6: integer("partner_count_year6").notNull().default(3),
  partnerCountYear7: integer("partner_count_year7").notNull().default(3),
  partnerCountYear8: integer("partner_count_year8").notNull().default(3),
  partnerCountYear9: integer("partner_count_year9").notNull().default(3),
  partnerCountYear10: integer("partner_count_year10").notNull().default(3),
  
  staffSalary: real("staff_salary").notNull().default(DEFAULT_STAFF_SALARY),
  
  // Staffing tiers - FTE headcount based on portfolio size
  staffTier1MaxProperties: integer("staff_tier1_max_properties").notNull().default(DEFAULT_STAFF_TIER1_MAX_PROPERTIES),
  staffTier1Fte: real("staff_tier1_fte").notNull().default(2.5),
  staffTier2MaxProperties: integer("staff_tier2_max_properties").notNull().default(DEFAULT_STAFF_TIER2_MAX_PROPERTIES),
  staffTier2Fte: real("staff_tier2_fte").notNull().default(4.5),
  staffTier3Fte: real("staff_tier3_fte").notNull().default(7.0),
  
  // Cost variables - Fixed overhead
  officeLeaseStart: real("office_lease_start").notNull().default(DEFAULT_OFFICE_LEASE_START),
  professionalServicesStart: real("professional_services_start").notNull().default(DEFAULT_PROFESSIONAL_SERVICES_START),
  techInfraStart: real("tech_infra_start").notNull().default(DEFAULT_TECH_INFRA_START),
  businessInsuranceStart: real("business_insurance_start").notNull().default(DEFAULT_BUSINESS_INSURANCE_START),
  
  // Cost variables - Variable costs
  travelCostPerClient: real("travel_cost_per_client").notNull().default(DEFAULT_TRAVEL_COST_PER_CLIENT),
  itLicensePerClient: real("it_license_per_client").notNull().default(DEFAULT_IT_LICENSE_PER_CLIENT),
  marketingRate: real("marketing_rate").notNull().default(DEFAULT_MARKETING_RATE),
  miscOpsRate: real("misc_ops_rate").notNull().default(DEFAULT_MISC_OPS_RATE),
  
  // Portfolio — acquisition-side broker commission (applied during portfolio modeling)
  commissionRate: real("commission_rate").notNull().default(DEFAULT_COMMISSION_RATE),
  
  standardAcqPackage: jsonb("standard_acq_package").notNull().$type<StandardAcqPackage>(),
  debtAssumptions: jsonb("debt_assumptions").notNull().$type<DebtAssumptions>(),
  
  
  // Tax Rate (for calculating after-tax company cash flow)
  companyTaxRate: real("company_tax_rate").notNull().default(DEFAULT_COMPANY_TAX_RATE),
  
  // WACC — Cost of Equity (user-provided, not CAPM-derived; default 18% for private hospitality)
  costOfEquity: real("cost_of_equity").notNull().default(DEFAULT_COST_OF_EQUITY),

  // Exit & Sale Assumptions (global defaults) — disposition-side broker commission (applied at property sale/exit)
  exitCapRate: real("exit_cap_rate").notNull().default(DEFAULT_EXIT_CAP_RATE),
  salesCommissionRate: real("sales_commission_rate").notNull().default(DEFAULT_COMMISSION_RATE), // Distinct from commissionRate: this is exit/sale, that is acquisition
  
  // Expense Rates (applied to specific revenue streams)
  eventExpenseRate: real("event_expense_rate").notNull().default(DEFAULT_EVENT_EXPENSE_RATE),
  otherExpenseRate: real("other_expense_rate").notNull().default(DEFAULT_OTHER_EXPENSE_RATE),
  utilitiesVariableSplit: real("utilities_variable_split").notNull().default(DEFAULT_UTILITIES_VARIABLE_SPLIT),
  
  // ICP Configuration — structured numeric/toggle parameters for Ideal Customer Profile
  icpConfig: jsonb("icp_config").$type<IcpConfig>(),

  exportConfig: jsonb("export_config").$type<ExportConfig>(),

  requiredFieldsConfig: jsonb("required_fields_config").$type<RequiredFieldsConfig>().default({
    name: true,
    location: true,
    roomCount: true,
    startAdr: true,
    purchasePrice: true,
    country: false,
    startOccupancy: false,
    qualityTier: false,
    businessModel: false,
    serviceLevel: false,
    locationType: false,
  }),

  // Asset Definition
  assetDefinition: jsonb("asset_definition").notNull().$type<AssetDefinition>().default({
    minRooms: 10,
    maxRooms: 80,
    hasFB: true,
    hasEvents: true,
    hasWellness: true,
    minAdr: 150,
    maxAdr: 600,
    level: "luxury",
    eventLocations: 2,
    maxEventCapacity: 150,
    acreage: 10,
    privacyLevel: "high",
    parkingSpaces: 50,
    description: "Luxury boutique hotels on private estates of 10+ acres, catering to 100+ person exotic, unique, and corporate events in exclusive, secluded settings with full-service F&B, wellness programming, and curated guest experiences."
  }),
  
  // AI Research Settings
  preferredLlm: text("preferred_llm").notNull().default("claude-sonnet-4-5"),

  // Management Company Contact & Identity
  companyPhone: text("company_phone"),
  companyEmail: text("company_email"),
  companyWebsite: text("company_website"),
  companyEin: text("company_ein"),
  companyFoundingYear: integer("company_founding_year"),

  // Management Company Location
  companyStreetAddress: text("company_street_address"),
  companyCity: text("company_city"),
  companyStateProvince: text("company_state_province"),
  companyCountry: text("company_country"),
  companyZipPostalCode: text("company_zip_postal_code"),

  // Display Settings
  showCompanyCalculationDetails: boolean("show_company_calculation_details").notNull().default(true),
  showPropertyCalculationDetails: boolean("show_property_calculation_details").notNull().default(true),

  // Sidebar Visibility (admin-controlled, applies to non-admin users)
  sidebarPropertyFinder: boolean("sidebar_property_finder").notNull().default(true),
  sidebarSensitivity: boolean("sidebar_sensitivity").notNull().default(true),
  sidebarFinancing: boolean("sidebar_financing").notNull().default(true),
  sidebarCompare: boolean("sidebar_compare").notNull().default(true),
  sidebarTimeline: boolean("sidebar_timeline").notNull().default(true),
  sidebarMapView: boolean("sidebar_map_view").notNull().default(false),
  sidebarExecutiveSummary: boolean("sidebar_executive_summary").notNull().default(true),
  sidebarScenarios: boolean("sidebar_scenarios").notNull().default(true),
  sidebarUserManual: boolean("sidebar_user_manual").notNull().default(true),
  sidebarResearch: boolean("sidebar_research").notNull().default(true),

  // Feature Toggles
  showAiAssistant: boolean("show_ai_assistant").notNull().default(false),
  
  // Rebecca — AI text chatbot (Gemini or Perplexity engine)
  rebeccaEnabled: boolean("rebecca_enabled").notNull().default(true),
  rebeccaDisplayName: text("rebecca_display_name").notNull().default("Rebecca"),
  rebeccaSystemPrompt: text("rebecca_system_prompt"),
  rebeccaChatEngine: text("rebecca_chat_engine").notNull().default("gemini"),

  // Research Configuration — per-event admin control over AI research behavior
  researchConfig: jsonb("research_config").$type<ResearchConfig>().default({}),

  lastFullResearchRefresh: timestamp("last_full_research_refresh"),

  autoResearchRefreshEnabled: boolean("auto_research_refresh_enabled").notNull().default(false),

  depreciationYears: real("depreciation_years").notNull().default(39),
  daysPerMonth: real("days_per_month").notNull().default(30.5),

  // Property Revenue Defaults (nullable — NULL = use constant fallback from shared/constants.ts)
  defaultStartAdr: real("default_start_adr"),
  defaultAdrGrowthRate: real("default_adr_growth_rate"),
  defaultStartOccupancy: real("default_start_occupancy"),
  defaultMaxOccupancy: real("default_max_occupancy"),
  defaultOccupancyRampMonths: integer("default_occupancy_ramp_months"),
  defaultRoomCount: integer("default_room_count"),
  defaultRevShareFb: real("default_rev_share_fb"),
  defaultRevShareEvents: real("default_rev_share_events"),
  defaultRevShareOther: real("default_rev_share_other"),
  defaultCateringBoostPct: real("default_catering_boost_pct"),

  // Property USALI Cost Rate Defaults (nullable — NULL = use constant fallback)
  defaultCostRateRooms: real("default_cost_rate_rooms"),
  defaultCostRateFb: real("default_cost_rate_fb"),
  defaultCostRateAdmin: real("default_cost_rate_admin"),
  defaultCostRateMarketing: real("default_cost_rate_marketing"),
  defaultCostRatePropertyOps: real("default_cost_rate_property_ops"),
  defaultCostRateUtilities: real("default_cost_rate_utilities"),
  defaultCostRateTaxes: real("default_cost_rate_taxes"),
  defaultCostRateIt: real("default_cost_rate_it"),
  defaultCostRateFfe: real("default_cost_rate_ffe"),
  defaultCostRateOther: real("default_cost_rate_other"),
  defaultCostRateInsurance: real("default_cost_rate_insurance"),

  // Property Tax & Depreciation Defaults (nullable — NULL = use constant fallback)
  defaultPropertyTaxRate: real("default_property_tax_rate"),
  defaultLandValuePercent: real("default_land_value_percent"),

  // Appearance Defaults (org-wide defaults; users inherit unless they override)
  defaultColorMode: text("default_color_mode"),
  defaultBgAnimation: text("default_bg_animation"),
  defaultFontPreference: text("default_font_preference"),

  lastAssumptionChangeAt: timestamp("last_assumption_change_at"),

  // Per-tab Save tracking for the Analyst watchdog. Once all 6 Company
  // Assumptions tabs have been saved at least once, downstream pages
  // (Simulation/Compare/Sensitivity/Executive Summary/Dashboard) unlock.
  // Stored as a jsonb array of TabKey strings.
  savedTabs: jsonb("saved_tabs").$type<string[]>().notNull().default([]),

  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("global_assumptions_user_id_idx").on(table.userId),
  check("ga_projection_years_range", sql`${table.projectionYears} >= 1 AND ${table.projectionYears} <= 30`),
  check("ga_inflation_rate_range", sql`${table.inflationRate} >= 0 AND ${table.inflationRate} <= 1`),
  check("ga_base_mgmt_fee_range", sql`${table.baseManagementFee} >= 0 AND ${table.baseManagementFee} <= 1`),
  check("ga_incentive_mgmt_fee_range", sql`${table.incentiveManagementFee} >= 0 AND ${table.incentiveManagementFee} <= 1`),
  check("ga_commission_rate_range", sql`${table.commissionRate} >= 0 AND ${table.commissionRate} <= 1`),
  check("ga_company_tax_rate_range", sql`${table.companyTaxRate} >= 0 AND ${table.companyTaxRate} <= 1`),
  check("ga_exit_cap_rate_range", sql`${table.exitCapRate} > 0 AND ${table.exitCapRate} <= 1`),
]);

export const insertGlobalAssumptionsSchema = createInsertSchema(globalAssumptions, {
  fiscalYearStartMonth: z.number().int().min(1).max(12).default(1),
  standardAcqPackage: z.object({
    purchasePrice: z.number(),
    buildingImprovements: z.number(),
    preOpeningCosts: z.number(),
    operatingReserve: z.number(),
    monthsToOps: z.number()
  }),
  debtAssumptions: z.object({
    interestRate: z.number(),
    amortizationYears: z.number(),
    refiLTV: z.number(),
    refiClosingCostRate: z.number(),
    refiInterestRate: z.number().optional(),
    refiAmortizationYears: z.number().optional(),
    refiPeriodYears: z.number().optional(),
    acqLTV: z.number(),
    acqClosingCostRate: z.number()
  }),
  assetDefinition: z.object({
    minRooms: z.number(),
    maxRooms: z.number(),
    hasFB: z.boolean(),
    hasEvents: z.boolean(),
    hasWellness: z.boolean(),
    minAdr: z.number(),
    maxAdr: z.number(),
    level: z.enum(["budget", "average", "luxury"]).optional().default("luxury"),
    eventLocations: z.number().optional().default(2),
    maxEventCapacity: z.number().optional().default(150),
    acreage: z.number().optional().default(10),
    privacyLevel: z.enum(["low", "moderate", "high"]).optional().default("high"),
    parkingSpaces: z.number().optional().default(50),
    description: z.string()
  }).optional()
}).omit({ updatedAt: true });

export const selectGlobalAssumptionsSchema = createSelectSchema(globalAssumptions);

export type GlobalAssumptions = typeof globalAssumptions.$inferSelect;
export type InsertGlobalAssumptions = z.infer<typeof insertGlobalAssumptionsSchema>;

// ── Seed Defaults (shadow ledger for smart sync) ──────────────────────
export const seedDefaults = pgTable("seed_defaults", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  entityType: text("entity_type").notNull(),
  entityKey: text("entity_key").notNull(),
  fieldName: text("field_name").notNull(),
  seedValue: jsonb("seed_value").notNull().$type<unknown>(),
  appliedAt: timestamp("applied_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique("uq_seed_defaults_entity_field").on(table.entityType, table.entityKey, table.fieldName),
  index("idx_seed_defaults_lookup").on(table.entityType, table.entityKey),
]);

export type SeedDefault = typeof seedDefaults.$inferSelect;

