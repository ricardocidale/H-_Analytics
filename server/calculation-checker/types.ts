import type { Property, GlobalAssumptions } from "@shared/schema";

import type { CheckResult, PropertyCheckResults } from "@shared/verification-types";
export type { CheckResult, PropertyCheckResults };

export interface VerificationReport {
  timestamp: string;
  propertiesChecked: number;
  propertyResults: PropertyCheckResults[];
  companyChecks: CheckResult[];
  consolidatedChecks: CheckResult[];
  summary: {
    totalChecks: number;
    totalPassed: number;
    totalFailed: number;
    criticalIssues: number;
    materialIssues: number;
    auditOpinion: "UNQUALIFIED" | "QUALIFIED" | "ADVERSE";
    overallStatus: "PASS" | "FAIL" | "WARNING";
  };
}

export interface YearMonth {
  year: number;
  month: number;
}

export interface EngineMonthlyResult {
  [key: string]: number | boolean;
  monthIndex: number;
  occupancy: number;
  adr: number;
  availableRooms: number;
  soldRooms: number;
  revenueRooms: number;
  revenueEvents: number;
  revenueFB: number;
  revenueOther: number;
  revenueTotal: number;
  expenseRooms: number;
  expenseFB: number;
  expenseEvents: number;
  expenseOther: number;
  expenseMarketing: number;
  expensePropertyOps: number;
  expenseUtilitiesVar: number;
  expenseAdmin: number;
  expenseIT: number;
  expenseUtilitiesFixed: number;
  expenseInsurance: number;
  expenseOtherCosts: number;
  expensePlatformFees: number;
  expensePreOpening: number;
  totalExpenses: number;
  gop: number;
  agop: number;
  feeBase: number;
  feeIncentive: number;
  expenseTaxes: number;
  expenseFFE: number;
  noi: number;
  anoi: number;
  interestExpense: number;
  principalPayment: number;
  debtPayment: number;
  netIncome: number;
  incomeTax: number;
  cashFlow: number;
  depreciationExpense: number;
  propertyValue: number;
  debtOutstanding: number;
  operatingCashFlow: number;
  financingCashFlow: number;
  endingCash: number;
  cashShortfall: boolean;
  accountsReceivable: number;
  accountsPayable: number;
  workingCapitalChange: number;
  nolBalance: number;
}

export type IndependentMonthlyResult = EngineMonthlyResult;

export type CheckerProperty = Property;
export type CheckerGlobalAssumptions = GlobalAssumptions;
