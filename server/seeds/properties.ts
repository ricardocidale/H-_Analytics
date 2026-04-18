import { db } from "../db";
import { properties, globalAssumptions, propertyFeeCategories, propertyPhotos } from "@shared/schema";
import { eq, isNull } from "drizzle-orm";
import { logger } from "../logger";
import {
  DEFAULT_COMMISSION_RATE,
  DEFAULT_EVENT_EXPENSE_RATE,
  DEFAULT_OTHER_EXPENSE_RATE,
  DEFAULT_UTILITIES_VARIABLE_SPLIT,
  DEFAULT_CAPITAL_RAISE_VALUATION_CAP,
  DEFAULT_CAPITAL_RAISE_DISCOUNT_RATE,
  DEFAULT_FUNDING_INTEREST_RATE,
  DEFAULT_FUNDING_INTEREST_PAYMENT_FREQUENCY,
  DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  DEFAULT_COMPANY_OPS_START_DATE,
  SEED_DEBT_ASSUMPTIONS,
  DEFAULT_PROPERTY_INFLATION_RATE,
  DEFAULT_COMPANY_TAX_RATE,
  DEFAULT_BUSINESS_INSURANCE_START,
  DEFAULT_SERVICE_FEE_CATEGORIES,
  DEFAULT_EXIT_CAP_RATE,
} from "@shared/constants";
import {
  SEED_INITIAL_PROPERTIES,
  SEED_MEDELLIN_DUPLEX,
  SEED_MEDELLIN_DUPLEX_PHOTOS,
} from "./property-data";

export { SEED_PROPERTY_DEFAULTS, SEED_SYNC_PROPERTIES } from "./property-data";

export const SEED_COMPANY_IDENTITY = {
  companyName: "The Norfolk AI Group",
  companyPhone: "+1 (757) 555-0142",
  companyEmail: "info@norfolk.ai",
  companyWebsite: "https://norfolk.ai",
  companyEin: "92-1847356",
  companyFoundingYear: 2024,
  companyStreetAddress: "150 West Main Street, Suite 400",
  companyCity: "Norfolk",
  companyStateProvince: "VA",
  companyCountry: "United States",
  companyZipPostalCode: "23510",
} as const;

export const DEFAULT_FEE_CATEGORIES = DEFAULT_SERVICE_FEE_CATEGORIES.map(c => ({
  name: c.name,
  rate: c.rate,
  sortOrder: c.sortOrder,
}));

export async function seedGlobalAssumptions() {
  const [shared] = await db.select().from(globalAssumptions)
    .where(isNull(globalAssumptions.userId))
    .limit(1);
  if (shared) return;

  const [legacy] = await db.select().from(globalAssumptions).limit(1);
  if (legacy && legacy.userId !== null) {
    await db.update(globalAssumptions)
      .set({ userId: null, updatedAt: new Date() })
      .where(eq(globalAssumptions.id, legacy.id));
    logger.info("Converted legacy global assumptions to shared (userId=NULL)", "seed");
    return;
  }
  if (legacy) return;

  await db.insert(globalAssumptions).values({
    userId: null,
    modelStartDate: "2026-04-01",
    companyOpsStartDate: DEFAULT_COMPANY_OPS_START_DATE,
    fiscalYearStartMonth: 1,
    inflationRate: DEFAULT_PROPERTY_INFLATION_RATE,
    fixedCostEscalationRate: DEFAULT_PROPERTY_INFLATION_RATE,
    baseManagementFee: DEFAULT_BASE_MANAGEMENT_FEE_RATE,
    incentiveManagementFee: DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
    capitalRaise1Amount: 1000000,
    capitalRaise1Date: "2026-06-01",
    capitalRaise2Amount: 1000000,
    capitalRaise2Date: "2027-04-01",
    capitalRaiseValuationCap: DEFAULT_CAPITAL_RAISE_VALUATION_CAP,
    capitalRaiseDiscountRate: DEFAULT_CAPITAL_RAISE_DISCOUNT_RATE,
    fundingInterestRate: DEFAULT_FUNDING_INTEREST_RATE,
    fundingInterestPaymentFrequency: DEFAULT_FUNDING_INTEREST_PAYMENT_FREQUENCY,
    partnerCompYear1: 540000,
    partnerCompYear2: 540000,
    partnerCompYear3: 540000,
    partnerCompYear4: 600000,
    partnerCompYear5: 600000,
    partnerCompYear6: 700000,
    partnerCompYear7: 700000,
    partnerCompYear8: 800000,
    partnerCompYear9: 800000,
    partnerCompYear10: 900000,
    partnerCountYear1: 3,
    partnerCountYear2: 3,
    partnerCountYear3: 3,
    partnerCountYear4: 3,
    partnerCountYear5: 3,
    partnerCountYear6: 3,
    partnerCountYear7: 3,
    partnerCountYear8: 3,
    partnerCountYear9: 3,
    partnerCountYear10: 3,
    staffSalary: 75000,
    officeLeaseStart: 36000,
    professionalServicesStart: 24000,
    techInfraStart: 18000,
    businessInsuranceStart: DEFAULT_BUSINESS_INSURANCE_START,
    travelCostPerClient: 12000,
    itLicensePerClient: 3000,
    marketingRate: 0.05,
    miscOpsRate: 0.03,
    commissionRate: DEFAULT_COMMISSION_RATE,
    standardAcqPackage: {
      monthsToOps: 6,
      purchasePrice: 3800000,
      preOpeningCosts: 200000,
      operatingReserve: 250000,
      buildingImprovements: 1200000,
    },
    debtAssumptions: SEED_DEBT_ASSUMPTIONS,
    companyTaxRate: DEFAULT_COMPANY_TAX_RATE,
    ...SEED_COMPANY_IDENTITY,
    exitCapRate: DEFAULT_EXIT_CAP_RATE,
    salesCommissionRate: DEFAULT_COMMISSION_RATE,
    eventExpenseRate: DEFAULT_EVENT_EXPENSE_RATE,
    otherExpenseRate: DEFAULT_OTHER_EXPENSE_RATE,
    utilitiesVariableSplit: DEFAULT_UTILITIES_VARIABLE_SPLIT,
    assetDefinition: {
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
      description: "Luxury boutique hotels on private estates of 10+ acres, catering to 100+ person exotic, unique, and corporate events in exclusive, secluded settings with full-service F&B, wellness programming, and curated guest experiences.",
    },
    icpConfig: {
      guestSegments: [
        { name: "Corporate Retreats", weight: 0.30, avgGroupSize: 25, avgStayNights: 3, seasonality: "year-round" },
        { name: "Luxury Leisure", weight: 0.25, avgGroupSize: 2, avgStayNights: 4, seasonality: "peak" },
        { name: "Weddings & Social Events", weight: 0.20, avgGroupSize: 80, avgStayNights: 2, seasonality: "spring-fall" },
        { name: "Wellness Retreats", weight: 0.15, avgGroupSize: 12, avgStayNights: 5, seasonality: "year-round" },
        { name: "Adventure & Experiential", weight: 0.10, avgGroupSize: 6, avgStayNights: 3, seasonality: "seasonal" },
      ],
      demographics: {
        ageRange: "35-65",
        incomeLevel: "HHI $250K+",
        geography: "US East Coast, Latin America, International",
        travelStyle: "Experiential luxury, privacy-focused",
      },
      bookingBehavior: {
        leadTimeDays: 90,
        directBookingPct: 0.60,
        repeatGuestPct: 0.35,
        avgRevenuePerGuest: 1200,
      },
    },
    researchConfig: {
      property: {
        enabled: true,
        focusAreas: ["boutique hospitality", "luxury lodging", "event venues", "F&B operations", "wellness tourism"],
        regions: ["US Northeast", "US Mountain West", "Colombia", "Latin America"],
        timeHorizon: "10-year",
        customInstructions: "Focus on boutique hotels with 10-80 rooms, event-driven revenue models, and properties on 10+ acre estates. Emphasize AI-driven operations and technology integration.",
        customQuestions: "",
        enabledTools: [],
      },
      company: {
        enabled: true,
        focusAreas: ["hospitality management companies", "hotel investment", "PropTech", "AI in hospitality"],
        regions: ["United States", "Latin America"],
        timeHorizon: "5-year",
        customInstructions: "Research AI-powered hospitality management trends, boutique hotel acquisition strategies, and technology-driven operational efficiencies.",
        customQuestions: "",
        enabledTools: [],
      },
    },
  });
  logger.info("Seeded global assumptions (The Norfolk AI Group)", "seed");
}

export async function seedProperties() {
  await db.insert(properties).values(SEED_INITIAL_PROPERTIES);
  
  const seededProperties = await db.select().from(properties);
  logger.info(`Seeded ${seededProperties.length} properties (Norfolk AI portfolio)`, "seed");
}

export async function seedMedellinDuplex() {
  const existing = await db.select({ id: properties.id, name: properties.name })
    .from(properties)
    .where(eq(properties.name, "Medellin Duplex"))
    .limit(1);

  if (existing.length > 0) return;

  await db.insert(properties).values(SEED_MEDELLIN_DUPLEX);
  logger.info("Seeded Medellin Duplex property", "seed");
}

export async function seedMedellinDuplexPhotos() {
  const [prop] = await db.select({ id: properties.id })
    .from(properties)
    .where(eq(properties.name, "Medellin Duplex"))
    .limit(1);

  if (!prop) return;

  const existing = await db.select({ id: propertyPhotos.id })
    .from(propertyPhotos)
    .where(eq(propertyPhotos.propertyId, prop.id))
    .limit(1);

  if (existing.length > 0) return;

  for (const photo of SEED_MEDELLIN_DUPLEX_PHOTOS) {
    await db.insert(propertyPhotos).values({
      propertyId: prop.id,
      imageUrl: photo.imageUrl,
      caption: photo.caption,
      sortOrder: photo.sortOrder,
      isHero: photo.isHero,
    });
  }

  logger.info("Seeded 3 photos for Medellin Duplex", "seed");
}

export async function seedFeeCategories() {
  const allProps = await db.select({ id: properties.id }).from(properties);

  let inserted = 0;
  for (const prop of allProps) {
    const existingCats = await db.select({ name: propertyFeeCategories.name })
      .from(propertyFeeCategories)
      .where(eq(propertyFeeCategories.propertyId, prop.id));
    const existingNames = new Set(existingCats.map(c => c.name));

    for (const cat of DEFAULT_FEE_CATEGORIES) {
      if (!existingNames.has(cat.name)) {
        await db.insert(propertyFeeCategories).values({
          propertyId: prop.id,
          name: cat.name,
          rate: cat.rate,
          isActive: true,
          sortOrder: cat.sortOrder,
        });
        inserted++;
      }
    }
  }
  if (inserted > 0) {
    logger.info(`Seeded ${inserted} fee categories across ${allProps.length} properties`, "seed");
  }
}
