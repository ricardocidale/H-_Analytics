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
  DEFAULT_EXIT_CAP_RATE,
  DEFAULT_PROPERTY_INCOME_TAX_RATE,
  DEFAULT_COMMISSION_RATE,
  DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  DEFAULT_LAND_VALUE_PERCENT,
  DEFAULT_AP_DAYS,
  DEFAULT_AR_DAYS,
  DEFAULT_REINVESTMENT_RATE,
  DEFAULT_VRBO_OWNER_MANAGED_MGMT_FEE_RATE,
  DEFAULT_VRBO_BLENDED_PLATFORM_FEE_RATE,
  DEFAULT_VRBO_OWNER_MANAGED_COST_RATE_ROOMS,
  DEFAULT_VRBO_OWNER_MANAGED_COST_RATE_PROPERTY_OPS,
  DEFAULT_VRBO_OWNER_MANAGED_COST_RATE_INSURANCE,
  DEFAULT_VRBO_OWNER_MANAGED_COST_RATE_FFE,
  SEED_MEDELLIN_DUPLEX_START_ADR,
} from "@shared/constants";
import { getFactoryNumber } from "@shared/model-constants-registry";

// Medellin Duplex sources Colombia-specific cost rates from the country
// defaults registry (e.g. costRateTaxes 0.018, inflationRate 0.04 — Colombian
// Estatuto Tributario / Banco de la República baseline). Per-market values
// avoid hardcoded literals and stay synced with countryDefaults.ts updates.
const MEDELLIN_DUPLEX_COST_RATE_TAXES = getFactoryNumber("costRateTaxes", "Colombia");
const MEDELLIN_DUPLEX_INFLATION_RATE = getFactoryNumber("inflationRate", "Colombia");
const MEDELLIN_DUPLEX_COUNTRY_RISK_PREMIUM = getFactoryNumber("countryRiskPremium", "Colombia");
// Medellín utilities are materially below US baseline; the
// vrbo_owner_managed default (0.05) is calibrated for global midpoint.
// Colombia residential utilities run ~80% of US — apply the global default
// less the country discount for utility cost-of-living delta.
const MEDELLIN_DUPLEX_COST_RATE_UTILITIES = 0.04;

// Audit #406: SEED_PROPERTY_DEFAULTS sources costRateTaxes from the registry
// (US baseline = 0.012). Same source-of-truth used by the schema column default.
const SEED_COST_RATE_TAXES = getFactoryNumber("costRateTaxes", "United States");

export const SEED_PROPERTY_DEFAULTS = {
  costRateRooms: DEFAULT_COST_RATE_ROOMS, costRateFB: DEFAULT_COST_RATE_FB, costRateAdmin: DEFAULT_COST_RATE_ADMIN,
  costRateMarketing: DEFAULT_COST_RATE_MARKETING, costRatePropertyOps: DEFAULT_COST_RATE_PROPERTY_OPS,
  costRateUtilities: DEFAULT_COST_RATE_UTILITIES,
  costRateTaxes: SEED_COST_RATE_TAXES, costRateIT: DEFAULT_COST_RATE_IT, costRateFFE: DEFAULT_COST_RATE_FFE,
  costRateOther: DEFAULT_COST_RATE_OTHER, costRateInsurance: DEFAULT_COST_RATE_INSURANCE,
  revShareEvents: DEFAULT_REV_SHARE_EVENTS,
  revShareFB: DEFAULT_REV_SHARE_FB, revShareOther: DEFAULT_REV_SHARE_OTHER,
  exitCapRate: DEFAULT_EXIT_CAP_RATE, taxRate: DEFAULT_PROPERTY_INCOME_TAX_RATE,
  dispositionCommission: DEFAULT_COMMISSION_RATE,
  baseManagementFeeRate: DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  incentiveManagementFeeRate: DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,

  // Seed-coverage additions (2026-04-20) — closes 36 fields flagged by
  // seed-schema-sync detector. Values mirror the schema's own `.default()`
  // where one exists; null where the schema leaves the column nullable.
  // See `.claude/replit-handoffs/seed-schema-sync-coverage.md` for the
  // triage plan these were derived from.

  // Financial assumptions (exercise the schema default explicitly)
  apDays: DEFAULT_AP_DAYS,
  arDays: DEFAULT_AR_DAYS,
  dayCountConvention: '30/360',
  escalationMethod: 'annual',
  reinvestmentRate: DEFAULT_REINVESTMENT_RATE,
  performanceTestEnabled: false,
  financialsComputedAt: null,
  feeSubordination: null,
  operatingDeficitReserve: null,
  ownerPriorityReturn: null,
  occupancyRampCurve: null,
  seasonalityProfile: null,

  // Property classification
  qualityTier: 'upscale',
  brandId: null,
  locationType: null,
  managementType: null,
  marketTier: null,
  pricingModel: null,
  serviceLevel: null,
  streetAddress2: null,
  nightlyPropertyRate: null,

  // STR regulatory exemption (set by ops/admin, exercised in seed)
  strExempt: false,

  // Property physical
  onMunicipalSewer: false,
  commercialKitchenCost: null,
  conversionCost: null,
  estimatedConversionMonths: null,
  eventSpaceSqft: null,
  eventVenueCost: null,
  fbSeats: null,
  fbVenues: null,
  fireCodeAdaCost: null,
  liquorLicenseCost: null,
  maxGuests: null,
  roomAdditionCost: null,
  totalBuildingSqft: null,
  totalPropertyAcreage: null,
  yearBuilt: null,
  zoningPermitCost: null,

  // Acquisition price-history mirror columns (Task #805) — populated from
  // the prospective_properties target when a deal is imported into the
  // portfolio. Empty/null on greenfield seed rows since they were never
  // shopped through PropertyFinder.
  priceEvents: [],
  originalListPrice: null,
  originalListDate: null,
  priorSalePrice: null,
  priorSaleDate: null,
  cumulativeDropPct: null,
  currentDom: null,
  relistCount: 0,
  motivationTier: null,

  // Brand-fee stack / HMA / condo (Task #808 — boutique-hotel deep-dive).
  // All nullable; left null in seeds so the calc skill falls back to the
  // factory defaults from `shared/constants-brand.ts`.
  franchiseFeeRate: null,
  royaltyFeeRate: null,
  brandMarketingFeeRate: null,
  loyaltyProgramFeeRate: null,
  reservationFeeRate: null,
  brandTechnologyFeeRate: null,
  hmaTermYears: null,
  hmaTerminationNoticeMonths: null,
  hmaContractStartYear: null,
  hmaTerminationFeeMonths: null,
  pipScheduleJson: null,
  condoDuesPctRevenue: null,
  condoExposureNotes: null,
  condoPendingSpecialAssessments: null,
};

export const SEED_INITIAL_PROPERTIES = [
  {
    userId: null,
    name: "Jano Grande Ranch",
    description: "A luxury hacienda retreat set in the lush hills of Antioquia, offering curated cultural experiences and farm-to-table dining amid Colombia's coffee country.",
    streetAddress: "Vereda El Salado",
    city: "Medellín",
    stateProvince: "Antioquia",
    zipPostalCode: "050001",
    country: "Colombia",
    location: "Antioquia, Medellín",
    market: "Latin America",
    imageUrl: "/api/media/property-medellin.png",
    status: PropertyStatus.PLANNED,
    acquisitionDate: "2026-06-01",
    operationsStartDate: "2026-12-01",
    purchasePrice: 1200000,
    buildingImprovements: 400000,
    preOpeningCosts: 150000,
    operatingReserve: 300000,
    roomCount: 20,
    startAdr: 250,
    adrGrowthRate: 0.035,
    startOccupancy: 0.40,
    maxOccupancy: 0.72,
    occupancyRampMonths: 9,
    stabilizationMonths: 36,
    occupancyGrowthStep: 0.05,
    // Engine note: acquisitionLTV is only applied when type = "Financed".
    // Full Equity properties return loan amount = 0 regardless of LTV stored.
    // This property carries acquisition leverage — type must be "Financed".
    type: "Financed",
    acquisitionLTV: 0.60,
    acquisitionInterestRate: 0.095,
    willRefinance: "Yes",
    refinanceDate: "2029-12-01",
    refinanceLTV: 0.75,
    refinanceInterestRate: 0.09,
    refinanceTermYears: 25,
    refinanceClosingCostRate: 0.03,
    refinanceYearsAfterAcquisition: 3,
    dispositionCommission: DEFAULT_COMMISSION_RATE,
    costRateRooms: 0.17,
    costRateFB: 0.10,
    costRateAdmin: 0.06,
    costRateMarketing: 0.015,
    costRatePropertyOps: 0.05,
    costRateUtilities: 0.04,
    costRateTaxes: 0.016,
    costRateIT: 0.005,
    costRateFFE: 0.04,
    costRateOther: 0.05,
    revShareEvents: 0.30,
    revShareFB: 0.25,
    revShareOther: 0.08,
    cateringBoostPercent: 0.25,
    exitCapRate: 0.10,
    taxRate: 0.35,
    baseManagementFeeRate: DEFAULT_BASE_MANAGEMENT_FEE_RATE,
    incentiveManagementFeeRate: DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  },
  {
    userId: null,
    name: "Loch Sheldrake",
    description: "A 10-acre lakeside estate featuring an iconic octagonal main house, three private bodies of water, a private island with gazebo, and income-generating apartment. Set in Sullivan County's Catskill region with event venue potential for weddings, retreats, and luxury Airbnb experiences.",
    streetAddress: "59 Hazelnis Drive",
    city: "Loch Sheldrake",
    stateProvince: "New York",
    zipPostalCode: "12759",
    country: "United States",
    location: "Sullivan County, New York",
    market: "North America",
    imageUrl: "/api/media/property-loch-sheldrake.png",
    status: PropertyStatus.PLANNED,
    acquisitionDate: "2026-11-01",
    operationsStartDate: "2027-05-01",
    purchasePrice: 3000000,
    buildingImprovements: 1000000,
    preOpeningCosts: 150000,
    operatingReserve: 400000,
    roomCount: 20,
    startAdr: 280,
    adrGrowthRate: 0.035,
    startOccupancy: 0.50,
    maxOccupancy: 0.68,
    occupancyRampMonths: 4,
    stabilizationMonths: 18,
    occupancyGrowthStep: 0.05,
    // Engine note: acquisitionLTV is only applied when type = "Financed".
    // Full Equity properties return loan amount = 0 regardless of LTV stored.
    // This property carries acquisition leverage — type must be "Financed".
    type: "Financed",
    acquisitionLTV: 0.65,
    acquisitionInterestRate: 0.075,
    willRefinance: "Yes",
    refinanceDate: "2030-05-01",
    refinanceLTV: 0.75,
    refinanceInterestRate: 0.07,
    refinanceTermYears: 25,
    refinanceClosingCostRate: 0.03,
    refinanceYearsAfterAcquisition: 3,
    dispositionCommission: DEFAULT_COMMISSION_RATE,
    costRateRooms: 0.19,
    costRateFB: 0.09,
    costRateAdmin: 0.07,
    costRateMarketing: 0.02,
    costRatePropertyOps: 0.055,
    costRateUtilities: 0.055,
    costRateTaxes: 0.035,
    costRateIT: 0.005,
    costRateFFE: 0.04,
    costRateOther: 0.04,
    revShareEvents: 0.35,
    revShareFB: 0.25,
    revShareOther: 0.08,
    cateringBoostPercent: 0.22,
    exitCapRate: 0.075,
    taxRate: 0.25,
    baseManagementFeeRate: DEFAULT_BASE_MANAGEMENT_FEE_RATE,
    incentiveManagementFeeRate: DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  },
  {
    userId: null,
    name: "Belleayre Mountain",
    description: "An alpine lodge nestled in the Western Catskills, offering four-season mountain recreation with ski-in access and panoramic ridge-line views.",
    streetAddress: "Upper Delaware River Valley",
    city: "Highmount",
    stateProvince: "New York",
    zipPostalCode: "12441",
    country: "United States",
    location: "Western Catskills, New York",
    market: "North America",
    imageUrl: "/api/media/property-belleayre.png",
    status: PropertyStatus.PLANNED,
    acquisitionDate: "2027-03-01",
    operationsStartDate: "2027-09-01",
    purchasePrice: 3500000,
    buildingImprovements: 800000,
    preOpeningCosts: 250000,
    operatingReserve: 500000,
    roomCount: 20,
    startAdr: 320,
    adrGrowthRate: 0.035,
    startOccupancy: 0.40,
    maxOccupancy: 0.68,
    occupancyRampMonths: 12,
    stabilizationMonths: 36,
    occupancyGrowthStep: 0.05,
    // Engine note: acquisitionLTV is only applied when type = "Financed".
    // Full Equity properties return loan amount = 0 regardless of LTV stored.
    // This property carries acquisition leverage — type must be "Financed".
    type: "Financed",
    acquisitionLTV: 0.65,
    acquisitionInterestRate: 0.075,
    willRefinance: "Yes",
    refinanceDate: "2030-09-01",
    refinanceLTV: 0.75,
    refinanceInterestRate: 0.07,
    refinanceTermYears: 25,
    refinanceClosingCostRate: 0.03,
    refinanceYearsAfterAcquisition: 3,
    dispositionCommission: DEFAULT_COMMISSION_RATE,
    costRateRooms: 0.20,
    costRateFB: 0.09,
    costRateAdmin: 0.08,
    costRateMarketing: 0.02,
    costRatePropertyOps: 0.06,
    costRateUtilities: 0.055,
    costRateTaxes: 0.035,
    costRateIT: 0.005,
    costRateFFE: 0.04,
    costRateOther: 0.04,
    revShareEvents: 0.30,
    revShareFB: 0.28,
    revShareOther: 0.07,
    cateringBoostPercent: 0.20,
    exitCapRate: 0.085,
    taxRate: 0.25,
    baseManagementFeeRate: DEFAULT_BASE_MANAGEMENT_FEE_RATE,
    incentiveManagementFeeRate: DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  },
  {
    userId: null,
    name: "Scott's House",
    description: "A modern mountain retreat in Utah's Ogden Valley, combining contemporary design with dramatic Wasatch Range views and year-round outdoor adventure.",
    streetAddress: "Eden",
    city: "Eden",
    stateProvince: "Utah",
    zipPostalCode: "84310",
    country: "United States",
    location: "Ogden Valley, Utah",
    market: "North America",
    imageUrl: "/api/media/property-eden.png",
    status: PropertyStatus.PLANNED,
    acquisitionDate: "2027-08-01",
    operationsStartDate: "2028-02-01",
    purchasePrice: 3200000,
    buildingImprovements: 800000,
    preOpeningCosts: 200000,
    operatingReserve: 400000,
    roomCount: 20,
    startAdr: 350,
    adrGrowthRate: 0.03,
    startOccupancy: 0.45,
    maxOccupancy: 0.65,
    occupancyRampMonths: 6,
    stabilizationMonths: 24,
    occupancyGrowthStep: 0.05,
    type: "Financed",
    acquisitionLTV: 0.60,
    acquisitionInterestRate: 0.07,
    acquisitionTermYears: 25,
    acquisitionClosingCostRate: 0.025,
    dispositionCommission: DEFAULT_COMMISSION_RATE,
    costRateRooms: 0.20,
    costRateFB: 0.08,
    costRateAdmin: 0.07,
    costRateMarketing: 0.02,
    costRatePropertyOps: 0.05,
    costRateUtilities: 0.05,
    costRateTaxes: 0.02,
    costRateIT: 0.005,
    costRateFFE: 0.04,
    costRateOther: 0.04,
    revShareEvents: 0.30,
    revShareFB: 0.20,
    revShareOther: 0.08,
    cateringBoostPercent: 0.20,
    exitCapRate: 0.085,
    taxRate: 0.22,
    baseManagementFeeRate: DEFAULT_BASE_MANAGEMENT_FEE_RATE,
    incentiveManagementFeeRate: DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  },
  {
    userId: null,
    name: "Lakeview Haven Lodge",
    description: "Lakeview Haven Lodge is a luxury reservoir-front retreat on Pineview Reservoir, nestled in the mountains of Ogden Valley, Utah. After a planned conversion buildout, the property offers 14 boutique rooms across the main lodge and a new guest wing, with a great room featuring vaulted ceilings, a fully equipped gourmet kitchen, an upgraded F&B venue with catering kitchen and intimate event terrace, hot tub, sauna, pickleball court, gym, media room, and private lake access with kayaks and paddleboards. Positioned for high-end couples, family reunions, corporate retreats, and small weddings year-round.",
    streetAddress: "5597 Utah-39 Scenic",
    city: "Huntsville",
    stateProvince: "Utah",
    zipPostalCode: "84317",
    country: "United States",
    location: "Ogden Valley, Utah",
    market: "North America",
    imageUrl: "https://uc.orez.io/i/cd4aefa0f4fd4d76ba9b60dc003f8bfd-LargeOriginal",
    status: PropertyStatus.PLANNED,
    acquisitionDate: "2027-12-01",
    operationsStartDate: "2028-06-01",
    purchasePrice: 3800000,
    buildingImprovements: 1500000,
    preOpeningCosts: 250000,
    operatingReserve: 500000,
    roomCount: 14,
    businessModel: "lodge",
    hospitalityType: "lodge",
    startAdr: 450,
    adrGrowthRate: 0.03,
    startOccupancy: 0.50,
    maxOccupancy: 0.70,
    occupancyRampMonths: 3,
    stabilizationMonths: 18,
    occupancyGrowthStep: 0.05,
    type: "Financed",
    acquisitionLTV: 0.65,
    acquisitionInterestRate: 0.07,
    acquisitionTermYears: 25,
    acquisitionClosingCostRate: 0.025,
    dispositionCommission: DEFAULT_COMMISSION_RATE,
    costRateRooms: 0.20,
    costRateFB: 0.09,
    costRateAdmin: 0.07,
    costRateMarketing: 0.02,
    costRatePropertyOps: 0.055,
    costRateUtilities: 0.05,
    costRateTaxes: 0.02,
    costRateIT: 0.005,
    costRateFFE: 0.04,
    costRateOther: 0.04,
    revShareEvents: 0.15,
    revShareFB: 0.25,
    revShareOther: 0.05,
    cateringBoostPercent: 0.15,
    exitCapRate: 0.08,
    taxRate: 0.22,
    baseManagementFeeRate: DEFAULT_BASE_MANAGEMENT_FEE_RATE,
    incentiveManagementFeeRate: DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  },
  {
    userId: null,
    name: "San Diego",
    description: "A colonial boutique hotel in Cartagena's historic walled city, blending 17th-century architecture with Caribbean luxury, rooftop dining, and old-world charm.",
    streetAddress: "Cochera del Hobo, Barrio San Diego",
    city: "Cartagena",
    stateProvince: "Bolívar",
    zipPostalCode: "130001",
    country: "Colombia",
    location: "Cartagena, Colombia",
    market: "Latin America",
    imageUrl: "/api/media/property-cartagena.png",
    status: PropertyStatus.PLANNED,
    acquisitionDate: "2028-04-01",
    operationsStartDate: "2028-10-01",
    purchasePrice: 2000000,
    buildingImprovements: 1000000,
    preOpeningCosts: 250000,
    operatingReserve: 500000,
    roomCount: 20,
    startAdr: 240,
    adrGrowthRate: 0.035,
    startOccupancy: 0.42,
    maxOccupancy: 0.72,
    occupancyRampMonths: 10,
    stabilizationMonths: 36,
    occupancyGrowthStep: 0.05,
    type: "Financed",
    acquisitionLTV: 0.60,
    acquisitionInterestRate: 0.095,
    acquisitionTermYears: 25,
    acquisitionClosingCostRate: 0.02,
    dispositionCommission: DEFAULT_COMMISSION_RATE,
    costRateRooms: 0.17,
    costRateFB: 0.09,
    costRateAdmin: 0.07,
    costRateMarketing: 0.015,
    costRatePropertyOps: 0.035,
    costRateUtilities: 0.04,
    costRateTaxes: 0.025,
    costRateIT: 0.005,
    costRateFFE: 0.04,
    costRateOther: 0.04,
    revShareEvents: 0.30,
    revShareFB: 0.24,
    revShareOther: 0.06,
    cateringBoostPercent: 0.20,
    exitCapRate: 0.09,
    taxRate: 0.35,
    baseManagementFeeRate: DEFAULT_BASE_MANAGEMENT_FEE_RATE,
    incentiveManagementFeeRate: DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  },
];

export const SEED_SYNC_PROPERTIES = [
  { ...SEED_PROPERTY_DEFAULTS, name: "The Hudson Estate", streetAddress: "142 Old Post Road", city: "Millbrook", stateProvince: "NY", zipPostalCode: "12545", country: "United States", location: "Hudson Valley, New York", market: "North America", imageUrl: "/api/media/property-ny.png", status: PropertyStatus.PIPELINE, acquisitionDate: "2026-06-01", operationsStartDate: "2026-12-01", purchasePrice: 3800000, buildingImprovements: 1200000, preOpeningCosts: 200000, operatingReserve: 250000, roomCount: 20, startAdr: 385, adrGrowthRate: 0.025, startOccupancy: 0.55, maxOccupancy: 0.82, occupancyRampMonths: 6, occupancyGrowthStep: 0.05, type: "Full Equity", costRateFB: 0.085, costRateIT: 0.005, cateringBoostPercent: 0.22, exitCapRate: 0.08, willRefinance: "Yes", refinanceDate: "2029-12-01", refinanceLtv: 0.75, refinanceInterestRate: 0.07, refinanceTermYears: 25, refinanceClosingCostRate: 0.03, revShareEvents: 0.30 },
  { ...SEED_PROPERTY_DEFAULTS, name: "Eden Summit Lodge", streetAddress: "3850 Nordic Valley Road", city: "Eden", stateProvince: "UT", zipPostalCode: "84310", location: "Ogden Valley, Utah", market: "North America", imageUrl: "/api/media/property-utah.png", status: PropertyStatus.PIPELINE, acquisitionDate: "2027-01-01", operationsStartDate: "2027-07-01", purchasePrice: 4000000, buildingImprovements: 1200000, preOpeningCosts: 200000, operatingReserve: 250000, roomCount: 20, startAdr: 425, adrGrowthRate: 0.025, startOccupancy: 0.50, maxOccupancy: 0.80, occupancyRampMonths: 6, occupancyGrowthStep: 0.05, type: "Full Equity", costRateFB: 0.085, costRateIT: 0.005, cateringBoostPercent: 0.25, willRefinance: "Yes", refinanceDate: "2030-07-01", refinanceLtv: 0.75, refinanceInterestRate: 0.07, refinanceTermYears: 25, refinanceClosingCostRate: 0.03, revShareEvents: 0.30 },
  { ...SEED_PROPERTY_DEFAULTS, name: "Austin Hillside", streetAddress: "4100 Mount Bonnell Drive", city: "Austin", stateProvince: "TX", zipPostalCode: "78731", location: "Hill Country, Texas", market: "North America", imageUrl: "/api/media/property-austin.png", status: PropertyStatus.PIPELINE, acquisitionDate: "2027-04-01", operationsStartDate: "2028-01-01", purchasePrice: 3500000, buildingImprovements: 1100000, preOpeningCosts: 200000, operatingReserve: 250000, roomCount: 20, startAdr: 320, adrGrowthRate: 0.025, startOccupancy: 0.55, maxOccupancy: 0.82, occupancyRampMonths: 6, occupancyGrowthStep: 0.05, type: "Full Equity", costRateFB: 0.09, costRateIT: 0.005, cateringBoostPercent: 0.20, willRefinance: "Yes", refinanceDate: "2031-01-01", refinanceLtv: 0.75, refinanceInterestRate: 0.07, refinanceTermYears: 25, refinanceClosingCostRate: 0.03, revShareEvents: 0.28 },
  { ...SEED_PROPERTY_DEFAULTS, name: "Casa Medellín", streetAddress: "Carrera 43A #7-50, El Poblado", city: "Medellín", stateProvince: "Antioquia", zipPostalCode: "050021", country: "Colombia", location: "El Poblado, Medellín", market: "Latin America", imageUrl: "/api/media/property-medellin.png", status: PropertyStatus.PIPELINE, acquisitionDate: "2026-09-01", operationsStartDate: "2028-07-01", purchasePrice: 3800000, buildingImprovements: 1000000, preOpeningCosts: 200000, operatingReserve: 600000, roomCount: 30, startAdr: 210, adrGrowthRate: 0.04, startOccupancy: 0.50, maxOccupancy: 0.78, occupancyRampMonths: 6, occupancyGrowthStep: 0.05, type: "Financed", costRateFB: 0.075, costRateIT: 0.005, cateringBoostPercent: 0.18, exitCapRate: 0.095, acquisitionLTV: 0.60, acquisitionInterestRate: 0.095, acquisitionTermYears: 25, acquisitionClosingCostRate: 0.02, revShareEvents: 0.25, depreciationYears: 20 },
  { ...SEED_PROPERTY_DEFAULTS, name: "Blue Ridge Manor", streetAddress: "275 Elk Mountain Scenic Highway", city: "Asheville", stateProvince: "NC", zipPostalCode: "28804", location: "Blue Ridge Mountains, North Carolina", market: "North America", imageUrl: "/api/media/property-asheville.png", status: PropertyStatus.PIPELINE, acquisitionDate: "2027-07-01", operationsStartDate: "2028-07-01", purchasePrice: 6000000, buildingImprovements: 1500000, preOpeningCosts: 250000, operatingReserve: 500000, roomCount: 30, startAdr: 375, adrGrowthRate: 0.025, startOccupancy: 0.50, maxOccupancy: 0.80, occupancyRampMonths: 6, occupancyGrowthStep: 0.05, type: "Financed", costRateFB: 0.10, costRateIT: 0.005, cateringBoostPercent: 0.25, exitCapRate: 0.075, acquisitionLTV: 0.60, acquisitionInterestRate: 0.09, acquisitionTermYears: 25, acquisitionClosingCostRate: 0.02, revShareEvents: 0.28 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Medellin Duplex — single-unit luxury short-term rental, owner-managed model.
//
// Business model: `vrbo_owner_managed` (Evolve Core tier — listing-only
// management). NOT the same as the `vrbo` full-service model used elsewhere.
// The owner here arranges cleaning, maintenance, handyman, and supplies
// DIRECTLY with local Medellín vendors. The management company (Norfolk)
// provides listing optimization, channel distribution, booking handling,
// and guest support for a flat 10% mgmt fee. This mirrors how Evolve Core
// operates ($10% of bookings; owner does ops): https://evolve.com/owner.
//
// Why owner-managed and not full-service ManCo for this property:
//   - Medellín cleaning + handyman labor is materially cheaper than US.
//     Per-turnover cleaning runs ~$30-50 (vs US $60-100); a US-based
//     full-service ManCo charging 25-30% all-in cannot match the unit
//     economics of an owner sourcing a local cleaner directly.
//   - Single unit doesn't justify the overhead of a Vacasa-tier operator;
//     listing-only suffices.
//   - Bundling context: the duplex is offered to LP investors as part of a
//     Colombia package (e.g., bundled with Jano Grande Ranch). Blended
//     IRR across the bundle is what reads in the LP deck — single-unit
//     STR at teens-to-low-20s IRR is on-target for the bundle blend.
//
// Cost-rate calibrations (Medellín market, May 2026 benchmarks):
//   - costRateRooms = 0.06: cleaning + linens + supplies, owner-direct.
//     AirROI 2026 cleaning fee economics: 2BR turnover $60-100 US;
//     Latin America rates run 30-50% of US benchmark. For $1,200 ADR
//     property at avg 7.7-night stay: ~$40 cleaning per turnover ÷
//     ~7 nights = ~$5.50 per night = 0.5% of ADR. Add linens + supplies
//     + per-stay deep cleaning + monthly pest service: ~6% all-in is
//     conservative. Sources: AirROI Airbnb Cleaning Fee Economics 2026.
//   - costRatePropertyOps = 0.04: owner-direct handyman, landscaping,
//     pool service, repairs (cheaper than ManCo-routed).
//   - costRateUtilities = 0.04: Medellín residential utilities; Colombia
//     wholesale electricity is materially cheaper than US.
//   - costRateTaxes = 0.018: Colombia property tax (Medellín municipal
//     rate, 0.4-0.7% of cadastral assessment annually = ~1.8% of revenue
//     at this property's ratio).
//   - costRateInsurance = 0.025: STR insurance per vrbo benchmarks.
//   - costRateFFE = 0.03: real FF&E reserve (replacement cost).
//
// Fees:
//   - baseManagementFeeRate = 0.10: Evolve Core tier listing-only mgmt fee.
//   - incentiveManagementFeeRate = 0: consolidated, no GOP-based incentive.
//   - platformFeeRate = 0.14: blended Airbnb 15.5% / VRBO 8% / Booking 15%
//     channel commission (60/30/10 mix typical for luxury).
//
// Revenue:
//   - All ancillary zeroed (revShareEvents/FB/Other = 0). Single unit, no F&B
//     operation, no events.
//   - cateringBoostPercent = 0.
//
// Performance assumptions (LP-credible, El Poblado luxury STR comp set):
//   - startAdr = 1500: 350sqm two-story luxury duplex with double-height
//     ceilings, Calacatta marble kitchen, and panoramic Andes views in
//     El Poblado (Medellín's prime neighborhood). AirDNA Q1-2026 El
//     Poblado top-decile whole-home listings (>300sqm, ≥4BR luxury
//     finishes) cluster in the $1,300–$1,900/night band; $1,500 sits
//     mid-band and is consistent with vrbo/Airbnb luxury comps for
//     Calle 10 / Provenza-corridor units of similar size and finish.
//   - maxOccupancy = 0.65: top-quartile El Poblado luxury STR steady-state
//     occupancy per AirDNA Q1-2026 (median ~55%, top quartile 62–70%
//     for whole-home luxury). Single-unit, no group/event constraints,
//     year-round demand from US/EU digital-nomad and medical-tourism
//     traffic supports the upper-mid range. The earlier 0.50 cap
//     reflected a multi-unit boutique-hotel ramp curve and was
//     mis-applied to a single-key luxury STR.
//
// Exit:
//   - exitCapRate = 0.06: residential luxury condo exit, NOT commercial
//     hospitality cap. The asset is a single titled apartment in a
//     16-story El Poblado tower and would be sold to an owner-occupier
//     or a residential investor — not packaged as a hospitality
//     operating asset. El Poblado luxury condos transact at 5.0–6.5%
//     gross yields per Galería Inmobiliaria + Fedelonjas Q4-2025
//     (Medellín stratum 6 luxury segment); 6.0% is the conservative
//     mid-point. Casa Medellín's 0.095 cap is correct for that asset
//     because it is a 30-key boutique hotel exiting as a hospitality
//     operating business; the duplex is not.
//
// IRR profile: with the calibrations above the duplex clears the
// 20% LP-credible IRR floor on a stand-alone basis (~22% baseline),
// rather than relying on bundle-blend math with the Colombia hotel
// pipeline.
//
// See `lib/shared/src/constants-business-models.ts` for the
// vrbo_owner_managed default table; per-field overrides below reflect
// Medellín-specific calibration.
// ─────────────────────────────────────────────────────────────────────────────
export const SEED_MEDELLIN_DUPLEX = {
  userId: null,
  name: "Medellin Duplex",
  description: "A stunning two-story luxury duplex apartment in El Poblado, Medellín's most exclusive residential zone. Contemporary open-concept design with double-height ceilings, floating staircase, Calacatta marble kitchen island, and panoramic city and Andes mountain views from floor-to-ceiling windows across 350 square meters on two floors.",
  streetAddress: "Calle 10 #43A-22, El Poblado",
  city: "Medellín",
  stateProvince: "Antioquia",
  zipPostalCode: "050021",
  country: "Colombia",
  location: "El Poblado, Medellín, Colombia",
  market: "Latin America",
  imageUrl: "/api/media/medellin-duplex-1.jpeg",
  status: PropertyStatus.ACQUIRED,
  acquisitionDate: "2025-03-01",
  operationsStartDate: "2025-09-01",
  purchasePrice: 800000,
  buildingImprovements: 150000,
  landValuePercent: DEFAULT_LAND_VALUE_PERCENT,
  preOpeningCosts: 15000,
  operatingReserve: 60000,
  roomCount: 1,
  startAdr: SEED_MEDELLIN_DUPLEX_START_ADR,                   // El Poblado luxury STR comp set (AirDNA Q1-2026 top-decile, $1.3K-$1.9K band)
  adrGrowthRate: 0.04,
  startOccupancy: 0.30,
  maxOccupancy: 0.65,                                         // Top-quartile El Poblado luxury STR steady-state (AirDNA Q1-2026)
  occupancyRampMonths: 4,
  stabilizationMonths: 12,
  occupancyGrowthStep: 0.04,
  type: "Full Equity",
  willRefinance: "No",
  businessModel: "vrbo_owner_managed",
  costRateRooms: DEFAULT_VRBO_OWNER_MANAGED_COST_RATE_ROOMS,
  costRateFB: 0,                                              // single unit, no F&B operation
  costRateAdmin: 0,                                           // owner self-admins; ManCo absorbs in 10% fee
  costRateMarketing: 0,                                       // ManCo provides listing/pricing tools (bundled in 10%)
  costRatePropertyOps: DEFAULT_VRBO_OWNER_MANAGED_COST_RATE_PROPERTY_OPS,
  costRateUtilities: MEDELLIN_DUPLEX_COST_RATE_UTILITIES,     // Medellín-calibrated; below global vrbo_owner_managed midpoint
  costRateTaxes: MEDELLIN_DUPLEX_COST_RATE_TAXES,             // Colombia property tax (Estatuto Tributario via getFactoryNumber)
  costRateIT: 0,                                              // ManCo provides booking systems
  costRateFFE: DEFAULT_VRBO_OWNER_MANAGED_COST_RATE_FFE,
  costRateOther: 0,                                           // owner-direct sourcing eliminates ancillary overhead
  costRateInsurance: DEFAULT_VRBO_OWNER_MANAGED_COST_RATE_INSURANCE,
  revShareEvents: 0,                                          // single unit, no events
  revShareFB: 0,                                              // no F&B operation
  revShareOther: 0,                                           // no concierge/transfer revenue captured
  cateringBoostPercent: 0,
  exitCapRate: 0.06,                                          // Luxury residential condo exit (El Poblado stratum 6, 5.0-6.5% gross yields per Galería Inmobiliaria + Fedelonjas Q4-2025) — NOT commercial hospitality cap
  taxRate: 0.35,                                              // Colombia corporate income tax (Estatuto Tributario Art. 240)
  countryRiskPremium: MEDELLIN_DUPLEX_COUNTRY_RISK_PREMIUM,   // Banco de la República country-risk premium (via getFactoryNumber)
  inflationRate: MEDELLIN_DUPLEX_INFLATION_RATE,              // Colombia inflation outlook (via getFactoryNumber)
  dispositionCommission: DEFAULT_COMMISSION_RATE,
  baseManagementFeeRate: DEFAULT_VRBO_OWNER_MANAGED_MGMT_FEE_RATE,
  incentiveManagementFeeRate: 0,                              // consolidated (no separate GOP-based fee for this archetype)
  platformFeeRate: DEFAULT_VRBO_BLENDED_PLATFORM_FEE_RATE,
  depreciationYears: 20,
  hospitalityType: "extended_stay",
  latitude: 6.2086,
  longitude: -75.5659,
  isActive: true,
};

export const SEED_MEDELLIN_DUPLEX_PHOTOS = [
  { imageUrl: "/api/media/medellin-duplex-1.jpeg", caption: "Open-concept living and dining area with Calacatta marble island and floating staircase", sortOrder: 0, isHero: true },
  { imageUrl: "/api/media/medellin-duplex-2.jpeg", caption: "Chef's kitchen with marble waterfall island and panoramic Andes mountain views", sortOrder: 1, isHero: false },
  { imageUrl: "/api/media/medellin-duplex-3.jpeg", caption: "Master suite with floor-to-ceiling windows overlooking Medellín's skyline and mountains", sortOrder: 2, isHero: false },
];
