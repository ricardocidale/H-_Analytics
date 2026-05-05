import type { } from "@workspace/db";

/**
 * Workspace / session context injected into AI context packs at call time.
 *
 * These fields cover the three previously-missing injection points from the
 * agent-native context audit (recent activity, session history, workspace state):
 *   - recentGuidance   — assumption keys the AI has already analysed for this
 *                        entity, so it can avoid redundant proposals.
 *   - lastResearchRun  — most recent research run metadata, giving the model
 *                        a sense of how fresh the data is.
 */
export interface RecentContextPack {
  recentGuidance?: Array<{
    assumptionKey: string;
    valueMid: number | null;
    confidence: string | null;
  }>;
  lastResearchRun?: {
    tier: number | null;
    completedAt: Date | string | null;
    status: string;
  } | null;
}

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
    streetAddress2: string | null;
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
  recentContext?: RecentContextPack;
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
  recentContext?: RecentContextPack;
}
