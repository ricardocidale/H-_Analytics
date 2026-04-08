import type { Property, HospitalityType } from "@shared/schema";

export interface PropertyContextPack {
  identity: {
    id: number;
    name: string;
    description: string | null;
    stableKey: string;
  };
  location: {
    display: string;
    streetAddress: string | null;
    city: string | null;
    stateProvince: string | null;
    zipPostalCode: string | null;
    country: string | null;
    market: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  classification: {
    starRating: number | null;
    starRatingSource: string | null;
    starRatingSuggested: number | null;
    hospitalityType: string;
    businessModel: string;
    compositeLabel: string;
  };
  physicalCharacter: {
    roomCount: number;
    narrative: string;
  };
  amenityProfile: {
    hasFB: boolean;
    hasEvents: boolean;
    hasWellness: boolean;
    narrative: string;
  };
  revenueProfile: {
    startAdr: number;
    adrGrowthRate: number | null;
    startOccupancy: number | null;
    maxOccupancy: number | null;
    occupancyRampMonths: number | null;
    occupancyGrowthStep: number | null;
    revShareEvents: number | null;
    revShareFB: number | null;
    revShareOther: number | null;
    cateringBoostPercent: number | null;
    narrative: string;
  };
  costProfile: {
    costRateRooms: number | null;
    costRateFB: number | null;
    costRateAdmin: number | null;
    costRateMarketing: number | null;
    costRatePropertyOps: number | null;
    costRateUtilities: number | null;
    costRateTaxes: number | null;
    costRateIT: number | null;
    costRateFFE: number | null;
    costRateOther: number | null;
    costRateInsurance: number | null;
    narrative: string;
  };
  capitalStructure: {
    purchasePrice: number | null;
    buildingImprovements: number | null;
    landValuePercent: number | null;
    type: string | null;
    acquisitionLTV: number | null;
    acquisitionInterestRate: number | null;
    acquisitionTermYears: number | null;
    exitCapRate: number | null;
    taxRate: number | null;
    dispositionCommission: number | null;
    costSegEnabled: boolean | null;
    depreciationYears: number | null;
    narrative: string;
  };
  icpAlignment: {
    matchScore: number;
    matchDetails: string[];
    narrative: string;
  };
  currentAssumptionsSummary: string;
  fullNarrative: string;
}

export interface CompanyContextPack {
  companyProfile: {
    name: string;
    description: string | null;
    propertyLabel: string;
  };
  portfolioFootprint: {
    propertyCount: number;
    totalRooms: number;
    averageRooms: number;
    averageAdr: number;
    adrRange: { min: number; max: number };
    geographicSpread: string[];
    averageStarRating: number | null;
    typeBreakdown: Record<string, number>;
    narrative: string;
  };
  serviceMenu: {
    templates: Array<{
      name: string;
      rate: number;
      serviceModel: string;
      markup: number;
    }>;
    narrative: string;
  };
  feeStructure: {
    baseManagementFeeRate: number | null;
    incentiveManagementFeeRate: number | null;
    commissionRate: number | null;
    salesCommissionRate: number | null;
    narrative: string;
  };
  staffingOverhead: {
    narrative: string;
  };
  icpPositioning: {
    narrative: string;
  };
  financialScale: {
    narrative: string;
  };
  fullNarrative: string;
}
