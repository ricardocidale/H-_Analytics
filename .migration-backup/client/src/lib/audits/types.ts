export interface AuditFinding {
  category: string;
  rule: string;
  gaapReference: string;
  severity: "critical" | "material" | "minor" | "info";
  passed: boolean;
  expected: string | number;
  actual: string | number;
  variance: string | number;
  recommendation: string;
  workpaperRef: string;
}

export interface AuditSection {
  name: string;
  description: string;
  findings: AuditFinding[];
  passed: number;
  failed: number;
  materialIssues: number;
}

export interface AuditReport {
  timestamp: Date;
  auditorName: string;
  propertyName: string;
  sections: AuditSection[];
  totalChecks: number;
  totalPassed: number;
  totalFailed: number;
  criticalIssues: number;
  materialIssues: number;
  opinion: "UNQUALIFIED" | "QUALIFIED" | "ADVERSE" | "DISCLAIMER";
  opinionText: string;
}

export interface PropertyAuditInput {
  name: string;
  operationsStartDate: string;
  acquisitionDate?: string;
  roomCount: number;
  startAdr: number;
  adrGrowthRate: number;
  startOccupancy: number;
  maxOccupancy: number;
  occupancyRampMonths: number;
  occupancyGrowthStep: number;
  purchasePrice: number;
  buildingImprovements: number;
  landValuePercent?: number;
  taxRate?: number;
  type: string;
  acquisitionLTV?: number;
  acquisitionInterestRate?: number;
  acquisitionTermYears?: number;
  operatingReserve?: number;
  debtAssumptions?: {
    interestRate: number;
    amortizationYears: number;
  };
  willRefinance?: string;
  refinanceDate?: string;
  refinanceLTV?: number;
  refinanceInterestRate?: number;
  refinanceTermYears?: number;
  refinanceClosingCostRate?: number;
  costRateRooms: number;
  costRateFB: number;
  costRateAdmin: number;
  costRateMarketing: number;
  costRatePropertyOps: number;
  costRateUtilities: number;
  costRateTaxes: number;
  costRateIT: number;
  costRateFFE: number;
  costRateOther: number;
  costRateInsurance?: number;
  revShareEvents: number;
  revShareFB: number;
  revShareOther: number;
  baseManagementFeeRate?: number;
  incentiveManagementFeeRate?: number;
  depreciationYears?: number;
}

export interface GlobalAuditInput {
  modelStartDate: string;
  inflationRate: number;
  depreciationYears?: number;
  daysPerMonth?: number;
  debtAssumptions: {
    interestRate: number;
    amortizationYears: number;
    acqLTV?: number;
  };
}
