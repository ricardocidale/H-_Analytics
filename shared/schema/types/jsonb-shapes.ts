export interface IcpResearchReport {
  targetProfile?: string;
  marketSize?: string;
  segments?: Array<{ name: string; description: string; priority?: string }>;
  channels?: string[];
  [key: string]: unknown;
}

export interface IcpConfig {
  _research?: IcpResearchReport;
  _researchMarkdown?: string;
  [key: string]: unknown;
}

export interface ExportCategoryFormat {
  allowLandscape?: boolean;
  allowPortrait?: boolean;
  allowShort?: boolean;
  allowExtended?: boolean;
  allowPremium?: boolean;
  densePagination?: boolean;
}

export interface ExportConfigOverview extends ExportCategoryFormat {
  kpiMetrics?: boolean;
  revenueChart?: boolean;
  projectionTable?: boolean;
  compositionTables?: boolean;
  compositionCharts?: boolean;
  waterfallTable?: boolean;
  propertyInsights?: boolean;
  aiInsights?: boolean;
}

export interface ExportConfigStatements extends ExportCategoryFormat {
  incomeStatement?: boolean;
  incomeChart?: boolean;
  cashFlow?: boolean;
  cashFlowChart?: boolean;
  balanceSheet?: boolean;
  balanceSheetChart?: boolean;
}

export interface ExportConfigAnalysis extends ExportCategoryFormat {
  kpiSummaryCards?: boolean;
  returnChart?: boolean;
  freeCashFlowTable?: boolean;
  propertyIrrTable?: boolean;
  dcfAnalysis?: boolean;
  performanceTrend?: boolean;
}

export interface ExportConfig {
  overview?: ExportConfigOverview;
  statements?: ExportConfigStatements;
  analysis?: ExportConfigAnalysis;
}

export interface MarketResearchContent {
  sections?: Array<{ title: string; body: string }>;
  summary?: string;
  [key: string]: unknown;
}

export interface PromptConditions {
  [key: string]: unknown;
}

export interface ActivityLogMetadata {
  previousValue?: unknown;
  newValue?: unknown;
  changedFields?: string[];
  [key: string]: unknown;
}

export interface ScenarioGlobalAssumptionsSnapshot {
  modelStartDate?: string;
  baseManagementFeePercent?: number;
  projectionYears?: number;
  [key: string]: unknown;
}

export interface ScenarioPropertySnapshot {
  id?: number;
  name: string;
  stableKey?: string;
  startAdr?: number;
  adrGrowthRate?: number;
  occupancyRate?: number;
  roomCount?: number;
  isActive?: boolean;
  [key: string]: unknown;
}

export interface ScenarioFeeCategorySnapshot {
  id?: number;
  name?: string;
  amount?: number;
  [key: string]: unknown;
}

export interface ScenarioPhotoSnapshot {
  id?: number;
  url?: string;
  caption?: string;
  [key: string]: unknown;
}

export interface ScenarioServiceTemplateSnapshot {
  id?: number;
  name: string;
  defaultRate: number;
  serviceModel: string;
  serviceMarkup: number;
  isActive: boolean;
  sortOrder: number;
  [key: string]: unknown;
}

export interface ScenarioImagesSnapshot {
  [key: string]: unknown;
}

export interface ScenarioPropertyOverrideData {
  isActive?: boolean;
  [key: string]: unknown;
}

export interface VerificationRunResults {
  propertyResults?: Array<{
    propertyName: string;
    checks: Array<{
      name: string;
      passed: boolean;
      expected?: unknown;
      actual?: unknown;
    }>;
  }>;
  companyChecks?: Array<{
    name: string;
    passed: boolean;
  }>;
  consolidatedChecks?: Array<{
    name: string;
    passed: boolean;
  }>;
  [key: string]: unknown;
}

export interface StandardAcqPackage {
  purchasePrice: number;
  buildingImprovements: number;
  preOpeningCosts: number;
  operatingReserve: number;
  monthsToOps: number;
}

export interface DebtAssumptions {
  interestRate: number;
  amortizationYears: number;
  refiLTV: number;
  refiClosingCostRate: number;
  refiInterestRate?: number;
  refiAmortizationYears?: number;
  refiPeriodYears?: number;
  acqLTV: number;
  acqClosingCostRate: number;
}

export interface AssetDefinition {
  minRooms: number;
  maxRooms: number;
  hasFB: boolean;
  hasEvents: boolean;
  hasWellness: boolean;
  minAdr: number;
  maxAdr: number;
  level?: "budget" | "average" | "luxury";
  eventLocations?: number;
  maxEventCapacity?: number;
  acreage?: number;
  privacyLevel?: "low" | "moderate" | "high";
  parkingSpaces?: number;
  description: string;
}

export type ConsolidatedYearlyJson = unknown[];

export interface NotificationLogMetadata {
  alertRuleName?: string;
  propertyName?: string;
  metricValue?: number;
  threshold?: number;
  [key: string]: unknown;
}

export interface RawExtractionData {
  pages?: Array<{ pageNumber: number; text?: string; fields?: Record<string, unknown> }>;
  rawText?: string;
  confidence?: number;
  [key: string]: unknown;
}
