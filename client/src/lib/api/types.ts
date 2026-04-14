import { Property } from "@shared/schema";

export type PropertyResponse = Property & {
  id: number;
  feeCategories?: { name: string; rate: number; isActive: boolean }[];
};

export interface GlobalResponse {
  id: number;
  companyName: string;
  companyLogo: string | null;
  companyLogoId: number | null;
  companyLogoUrl: string | null;
  propertyLabel: string;
  modelStartDate: string;
  projectionYears: number;
  companyOpsStartDate: string;
  fiscalYearStartMonth: number;
  inflationRate: number;
  fixedCostEscalationRate: number;
  // Funding Instrument
  fundingSourceLabel: string;
  safeTranche1Amount: number;
  safeTranche1Date: string;
  safeTranche2Amount: number;
  safeTranche2Date: string;
  safeValuationCap: number;
  safeDiscountRate: number;
  fundingInterestRate: number;
  fundingInterestPaymentFrequency: string;
  // Compensation - partner comp by year
  partnerCompYear1: number;
  partnerCompYear2: number;
  partnerCompYear3: number;
  partnerCompYear4: number;
  partnerCompYear5: number;
  partnerCompYear6: number;
  partnerCompYear7: number;
  partnerCompYear8: number;
  partnerCompYear9: number;
  partnerCompYear10: number;
  partnerCountYear1: number;
  partnerCountYear2: number;
  partnerCountYear3: number;
  partnerCountYear4: number;
  partnerCountYear5: number;
  partnerCountYear6: number;
  partnerCountYear7: number;
  partnerCountYear8: number;
  partnerCountYear9: number;
  partnerCountYear10: number;
  staffSalary: number;
  // Staffing tiers
  staffTier1MaxProperties: number;
  staffTier1Fte: number;
  staffTier2MaxProperties: number;
  staffTier2Fte: number;
  staffTier3Fte: number;
  // Fixed overhead
  officeLeaseStart: number;
  professionalServicesStart: number;
  techInfraStart: number;
  businessInsuranceStart: number;
  // Variable costs
  travelCostPerClient: number;
  itLicensePerClient: number;
  marketingRate: number;
  miscOpsRate: number;
  // Portfolio
  commissionRate: number;
  // Tax
  companyTaxRate: number;
  // Exit & Sale Assumptions
  costOfEquity: number;
  exitCapRate: number;
  salesCommissionRate: number;
  // Property Expense Rates
  eventExpenseRate: number;
  otherExpenseRate: number;
  utilitiesVariableSplit: number;
  // AI Research
  preferredLlm: string;
  // Rebecca AI
  rebeccaEnabled: boolean;
  rebeccaV2: boolean;
  rebeccaDisplayName: string;
  rebeccaSystemPrompt: string | null;
  // Display Settings
  showCompanyCalculationDetails: boolean;
  showPropertyCalculationDetails: boolean;
  standardAcqPackage: {
    monthsToOps: number;
    purchasePrice: number;
    preOpeningCosts: number;
    operatingReserve: number;
    buildingImprovements: number;
  };
  debtAssumptions: {
    acqLTV: number;
    refiLTV: number;
    interestRate: number;
    amortizationYears: number;
    acqClosingCostRate: number;
    refiClosingCostRate: number;
    refiInterestRate?: number;
    refiAmortizationYears?: number;
    refiPeriodYears?: number;
  };
  assetDefinition: {
    minRooms: number;
    maxRooms: number;
    hasFB: boolean;
    hasEvents: boolean;
    hasWellness: boolean;
    minAdr: number;
    maxAdr: number;
    level?: string;
    eventLocations?: number;
    maxEventCapacity?: number;
    acreage?: number;
    privacyLevel?: string;
    parkingSpaces?: number;
    description: string;
  };
  // Company Details
  companyPhone: string | null;
  companyEmail: string | null;
  companyWebsite: string | null;
  companyEin: string | null;
  companyFoundingYear: number | null;
  companyStreetAddress: string | null;
  companyCity: string | null;
  companyStateProvince: string | null;
  companyCountry: string | null;
  companyZipPostalCode: string | null;
  // Additional Financial
  companyInflationRate?: number;
  baseManagementFee: number;
  incentiveManagementFee: number;
  assetDescription: string | null;
  // ICP Config
  icpConfig: Record<string, any> | null;
  // Research Automation
  autoResearchRefreshEnabled: boolean;
  // Governed model constants (DB-backed)
  depreciationYears: number;
  daysPerMonth: number;
  lastAssumptionChangeAt: string | null;
  updatedAt: string;
}

export interface FeeCategoryResponse {
  id: number;
  propertyId: number;
  name: string;
  rate: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface ScenarioResponse {
  id: number;
  userId: number;
  name: string;
  description: string | null;
  kind?: "default" | "manual" | "autosave";
  globalAssumptions: GlobalResponse;
  properties: PropertyResponse[];
  createdAt: string;
  updatedAt: string;
  accessType?: "owned" | "shared_user" | "shared_group" | "shared_company";
  sharedByUserId?: number | null;
  sharedByName?: string | null;
}

export interface MarketResearchResponse {
  id: number;
  userId: number | null;
  type: string;
  propertyId: number | null;
  title: string;
  content: any;
  llmModel: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResearchQuestion {
  id: number;
  question: string;
  sortOrder: number;
  createdAt: string;
}

export interface PropertyFinderResult {
  externalId: string;
  address: string;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  lotSizeAcres: number | null;
  propertyType: string | null;
  imageUrl: string | null;
  listingUrl: string | null;
}

export interface PropertyFinderSearchResponse {
  results: PropertyFinderResult[];
  total: number;
  offset: number;
}

export interface SavedProspectiveProperty extends PropertyFinderResult {
  id: number;
  userId: number;
  source: string;
  notes: string | null;
  savedAt: string;
}

export interface PropertyFinderSearchParams {
  location: string;
  priceMin?: string;
  priceMax?: string;
  bedsMin?: string;
  lotSizeMin?: string;
  propertyType?: string;
  offset?: string;
}

export interface SavedSearch {
  id: number;
  userId: number;
  name: string;
  filters: PropertyFinderSearchParams;
  createdAt: string;
}

export type SavedSearchData = SavedSearch;

interface HotelSnapshotData {
  location: string;
  sampleSize: number;
  avgPriceMin: number | null;
  avgPriceMax: number | null;
  topHotels: Array<{
    name: string;
    type: string;
    rating: number | null;
    reviewCount: number | null;
    priceMin: number | null;
    priceMax: number | null;
  }>;
}

interface HotelRateData {
  name: string;
  key: string;
  rates: Array<{ name: string; rate: number }>;
  avgRate: number | null;
}

interface CityMedianData {
  city: string;
  stateCode: string;
  medianListingPrice: number;
  medianByType: Record<string, number>;
}

export interface MarketContextResponse {
  hotelSnapshot: HotelSnapshotData | null;
  topHotelRates: HotelRateData[];
  regionalMedians: {
    searchCity: string;
    searchState: string;
    medians: CityMedianData[];
    avgMedian: number | null;
    fetchedAt: string;
  } | null;
  fetchedAt: string;
}

interface PropertyValueEstimate {
  date: string;
  estimate: number;
  source: string;
}

export interface PropertyValueHistory {
  propertyId: string;
  currentEstimate: number | null;
  estimates: PropertyValueEstimate[];
  appreciation12mo: number | null;
  appreciation24mo: number | null;
  fetchedAt: string;
}
