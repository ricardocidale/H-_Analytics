import { describe, it, expect } from "vitest";
import { buildPropertyContextPack } from "../../server/ai/context-pack/property-pack";
import { buildCompanyContextPack } from "../../server/ai/context-pack/company-pack";

const baseProperty = {
  id: 1,
  userId: 1,
  name: "Test Boutique Hotel",
  stableKey: "test-boutique-hotel",
  description: "A luxury boutique hotel with spa and fine dining in downtown Miami",
  location: "Miami, Florida, US",
  streetAddress: "123 Ocean Drive",
  city: "Miami",
  stateProvince: "Florida",
  zipPostalCode: "33139",
  country: "US",
  market: "South Florida",
  latitude: 25.77,
  longitude: -80.13,
  roomCount: 25,
  startAdr: 450,
  adrGrowthRate: 0.03,
  startOccupancy: 0.60,
  maxOccupancy: 0.85,
  occupancyRampMonths: 6,
  occupancyGrowthStep: 0.05,
  costRateRooms: 0.25,
  costRateFB: 0.35,
  costRateAdmin: 0.08,
  costRateMarketing: 0.04,
  costRatePropertyOps: 0.05,
  costRateUtilities: 0.03,
  costRateTaxes: 0.02,
  costRateIT: 0.01,
  costRateFFE: 0.04,
  costRateOther: 0.02,
  costRateInsurance: 0.015,
  purchasePrice: 8000000,
  buildingImprovements: null,
  landValuePercent: 0.20,
  type: "acquisition",
  acquisitionLTV: 0.65,
  acquisitionInterestRate: 0.055,
  acquisitionTermYears: 25,
  acquisitionClosingCostRate: 0.02,
  exitCapRate: 0.075,
  taxRate: 0.25,
  dispositionCommission: 0.02,
  costSegEnabled: false,
  depreciationYears: 27.5,
  willRefinance: "no",
  refinanceLTV: null,
  refinanceInterestRate: null,
  refinanceTermYears: null,
  refinanceClosingCostRate: null,
  refinanceYearsAfterAcquisition: null,
  starRating: 4,
  starRatingSource: "manual",
  starRatingSuggested: null,
  hospitalityType: "boutique_hotel",
  revShareFB: 0.30,
  revShareEvents: 0.10,
  revShareOther: 0.05,
  cateringBoostPercent: 0,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
} as any;

const baseGa = {
  id: 1,
  userId: 1,
  companyName: "Hospitality Business Group",
  assetDescription: "Boutique hotel portfolio in Americas",
  propertyLabel: "Hotel",
  baseManagementFee: 0.03,
  incentiveManagementFee: 0.10,
  commissionRate: 0.02,
  salesCommissionRate: 0.015,
  partnerCompYear1: 180000,
  partnerCompYear2: 200000,
  partnerCompYear3: 220000,
  staffSalary: 85000,
  staffTier1MaxProperties: 3,
  staffTier1Fte: 1,
  staffTier2MaxProperties: 7,
  staffTier2Fte: 2,
  staffTier3Fte: 3,
  officeLeaseStart: 60000,
  professionalServicesStart: 45000,
  techInfraStart: 30000,
  businessInsuranceStart: 25000,
  travelCostPerClient: 5000,
  itLicensePerClient: 2000,
  marketingRate: 0.02,
  miscOpsRate: 0.01,
  inflationRate: 0.03,
  companyTaxRate: 0.21,
  costOfEquity: 0.12,
  projectionYears: 10,
  icpConfig: null,
} as any;

describe("PropertyContextPack builder", () => {
  it("returns all 10 categories + currentAssumptionsSummary", () => {
    const pack = buildPropertyContextPack(baseProperty, baseGa, null);
    expect(pack).toHaveProperty("identity");
    expect(pack).toHaveProperty("location");
    expect(pack).toHaveProperty("classification");
    expect(pack).toHaveProperty("physicalCharacter");
    expect(pack).toHaveProperty("amenityProfile");
    expect(pack).toHaveProperty("revenueProfile");
    expect(pack).toHaveProperty("costProfile");
    expect(pack).toHaveProperty("capitalStructure");
    expect(pack).toHaveProperty("icpAlignment");
    expect(pack).toHaveProperty("fullNarrative");
    expect(pack).toHaveProperty("currentAssumptionsSummary");
  });

  it("identity carries through id, name, stableKey", () => {
    const pack = buildPropertyContextPack(baseProperty, baseGa, null);
    expect(pack.identity.id).toBe(1);
    expect(pack.identity.name).toBe("Test Boutique Hotel");
    expect(pack.identity.stableKey).toBe("test-boutique-hotel");
  });

  it("location is populated from property fields", () => {
    const pack = buildPropertyContextPack(baseProperty, baseGa, null);
    expect(pack.location.city).toBe("Miami");
    expect(pack.location.stateProvince).toBe("Florida");
    expect(pack.location.country).toBe("US");
    expect(pack.location.display).toBeTruthy();
    expect(pack.location.latitude).toBe(25.77);
  });

  it("classification includes star rating and hospitality type", () => {
    const pack = buildPropertyContextPack(baseProperty, baseGa, null);
    expect(pack.classification.starRating).toBe(4);
    expect(pack.classification.hospitalityType).toBe("boutique_hotel");
    expect(pack.classification.compositeLabel).toBeTruthy();
  });

  it("amenityProfile detects F&B and wellness from description", () => {
    const pack = buildPropertyContextPack(baseProperty, baseGa, null);
    expect(pack.amenityProfile.hasFB).toBe(true);
    expect(pack.amenityProfile.hasWellness).toBe(true);
    expect(pack.amenityProfile.narrative).toBeTruthy();
  });

  it("revenueProfile includes ADR and revenue shares", () => {
    const pack = buildPropertyContextPack(baseProperty, baseGa, null);
    expect(pack.revenueProfile.startAdr).toBe(450);
    expect(pack.revenueProfile.maxOccupancy).toBe(0.85);
    expect(pack.revenueProfile.revShareFB).toBe(0.30);
    expect(pack.revenueProfile.narrative).toContain("450");
  });

  it("costProfile includes all cost rate fields", () => {
    const pack = buildPropertyContextPack(baseProperty, baseGa, null);
    expect(pack.costProfile.costRateRooms).toBe(0.25);
    expect(pack.costProfile.costRateFB).toBe(0.35);
    expect(pack.costProfile.costRateAdmin).toBe(0.08);
    expect(pack.costProfile.narrative).toContain("rooms");
  });

  it("capitalStructure includes purchase price and rates", () => {
    const pack = buildPropertyContextPack(baseProperty, baseGa, null);
    expect(pack.capitalStructure.purchasePrice).toBe(8000000);
    expect(pack.capitalStructure.acquisitionLTV).toBe(0.65);
    expect(pack.capitalStructure.acquisitionInterestRate).toBe(0.055);
    expect(pack.capitalStructure.narrative).toContain("8,000,000");
  });

  it("icpAlignment defaults to 0 score when no ICP configured", () => {
    const pack = buildPropertyContextPack(baseProperty, baseGa, null);
    expect(pack.icpAlignment.matchScore).toBe(0);
    expect(pack.icpAlignment.narrative).toContain("No ICP");
  });

  it("fullNarrative is a coherent non-empty string", () => {
    const pack = buildPropertyContextPack(baseProperty, baseGa, null);
    expect(typeof pack.fullNarrative).toBe("string");
    expect(pack.fullNarrative.length).toBeGreaterThan(50);
    expect(pack.fullNarrative).toContain("Test Boutique Hotel");
  });

  it("handles null star rating gracefully", () => {
    const pack = buildPropertyContextPack({ ...baseProperty, starRating: null }, baseGa, null);
    expect(pack.classification.starRating).toBeNull();
    expect(pack.classification.compositeLabel).toBeTruthy();
  });

  it("handles null global assumptions gracefully", () => {
    const pack = buildPropertyContextPack(baseProperty, null, null);
    expect(pack).toBeTruthy();
    expect(pack.identity.name).toBe("Test Boutique Hotel");
  });

  it("handles minimal property with many nulls", () => {
    const minimal = {
      ...baseProperty,
      city: null,
      stateProvince: null,
      country: null,
      starRating: null,
      revShareFB: null,
      revShareEvents: null,
      purchasePrice: null,
      landValuePercent: null,
    };
    const pack = buildPropertyContextPack(minimal, null, null);
    expect(pack.location.city).toBeNull();
    expect(pack.classification.starRating).toBeNull();
    expect(pack.fullNarrative).toBeTruthy();
  });

  it("physicalCharacter includes room count and narrative", () => {
    const pack = buildPropertyContextPack(baseProperty, baseGa, null);
    expect(pack.physicalCharacter.roomCount).toBe(25);
    expect(pack.physicalCharacter.narrative).toContain("25");
  });
});

describe("CompanyContextPack builder", () => {
  const properties = [
    baseProperty,
    { ...baseProperty, id: 2, name: "Property 2", city: "Bogota", country: "CO", roomCount: 30, startAdr: 200 },
  ];
  const serviceTemplates = [
    { name: "Marketing", defaultRate: 0.02, serviceModel: "percentage", serviceMarkup: 0, isActive: true },
    { name: "Accounting", defaultRate: 0.015, serviceModel: "percentage", serviceMarkup: 0, isActive: true },
  ];

  it("returns all 8 categories", () => {
    const pack = buildCompanyContextPack(baseGa, properties as any, serviceTemplates);
    expect(pack).toHaveProperty("companyProfile");
    expect(pack).toHaveProperty("portfolioFootprint");
    expect(pack).toHaveProperty("serviceMenu");
    expect(pack).toHaveProperty("feeStructure");
    expect(pack).toHaveProperty("staffingOverhead");
    expect(pack).toHaveProperty("icpPositioning");
    expect(pack).toHaveProperty("financialScale");
    expect(pack).toHaveProperty("fullNarrative");
  });

  it("companyProfile carries company name", () => {
    const pack = buildCompanyContextPack(baseGa, properties as any, serviceTemplates);
    expect(pack.companyProfile.name).toBe("Hospitality Business Group");
    expect(pack.companyProfile.propertyLabel).toBe("Hotel");
  });

  it("portfolioFootprint counts properties and rooms correctly", () => {
    const pack = buildCompanyContextPack(baseGa, properties as any, serviceTemplates);
    expect(pack.portfolioFootprint.propertyCount).toBe(2);
    expect(pack.portfolioFootprint.totalRooms).toBe(55);
    expect(pack.portfolioFootprint.averageRooms).toBe(28);
  });

  it("portfolioFootprint detects geographic spread", () => {
    const pack = buildCompanyContextPack(baseGa, properties as any, serviceTemplates);
    expect(pack.portfolioFootprint.geographicSpread).toContain("US");
    expect(pack.portfolioFootprint.geographicSpread).toContain("CO");
  });

  it("portfolioFootprint calculates ADR range", () => {
    const pack = buildCompanyContextPack(baseGa, properties as any, serviceTemplates);
    expect(pack.portfolioFootprint.adrRange.min).toBe(200);
    expect(pack.portfolioFootprint.adrRange.max).toBe(450);
    expect(pack.portfolioFootprint.averageAdr).toBe(325);
  });

  it("feeStructure includes management fees", () => {
    const pack = buildCompanyContextPack(baseGa, properties as any, serviceTemplates);
    expect(pack.feeStructure.baseManagementFeeRate).toBe(0.03);
    expect(pack.feeStructure.incentiveManagementFeeRate).toBe(0.10);
    expect(pack.feeStructure.commissionRate).toBe(0.02);
    expect(pack.feeStructure.narrative).toContain("management");
  });

  it("serviceMenu lists active templates", () => {
    const pack = buildCompanyContextPack(baseGa, properties as any, serviceTemplates);
    expect(pack.serviceMenu.templates.length).toBe(2);
    expect(pack.serviceMenu.templates[0].name).toBe("Marketing");
    expect(pack.serviceMenu.narrative).toContain("Marketing");
  });

  it("fullNarrative is a non-empty string mentioning company", () => {
    const pack = buildCompanyContextPack(baseGa, properties as any, serviceTemplates);
    expect(typeof pack.fullNarrative).toBe("string");
    expect(pack.fullNarrative.length).toBeGreaterThan(50);
    expect(pack.fullNarrative).toContain("Hospitality Business Group");
  });

  it("handles empty property list", () => {
    const pack = buildCompanyContextPack(baseGa, [], serviceTemplates);
    expect(pack.portfolioFootprint.propertyCount).toBe(0);
    expect(pack.portfolioFootprint.totalRooms).toBe(0);
  });

  it("handles empty service templates", () => {
    const pack = buildCompanyContextPack(baseGa, properties as any, []);
    expect(pack.serviceMenu.templates).toEqual([]);
    expect(pack.serviceMenu.narrative).toContain("No service");
  });

  it("typeBreakdown counts property types correctly", () => {
    const pack = buildCompanyContextPack(baseGa, properties as any, serviceTemplates);
    expect(pack.portfolioFootprint.typeBreakdown["boutique_hotel"]).toBe(2);
  });
});
