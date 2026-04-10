/**
 * property-detail/types.ts
 *
 * Prop contracts for the property detail view components.
 *
 * Key types:
 *   • PropertyHeaderProps      – props for the hero header (property object,
 *                                property ID, and photo upload callback)
 *   • IncomeStatementTabProps  – income statement data, projection years,
 *                                chart data, and global assumptions reference
 *   • CashFlowTabProps         – cash flow data with loan parameters (LTV,
 *                                interest rate, amortization) needed for
 *                                debt service and DSCR calculations
 *   • PPECostBasisScheduleProps – cost basis, land value, FF&E, useful lives,
 *                                and projection years for the depreciation table
 *
 * LoanParams and GlobalLoanParams are imported from the loan calculation
 * library and provide the debt-structure inputs (LTV, interest rate, term)
 * needed by CashFlowTab.
 */
import type { RefObject } from "react";
import type { LoanParams, GlobalLoanParams } from "@/lib/financial/loanCalculations";
import type { Property } from "@shared/schema";
import type { MonthlyFinancials } from "@/lib/financialEngine";
import type { GlobalResponse } from "@/lib/api/types";

export interface YearlyChartDataPoint {
  year: string;
  Revenue: number;
  GOP: number;
  AGOP: number;
  NOI: number;
  ANOI: number;
  CashFlow: number;
}

export interface YearlyDetail {
  revenueTotal: number;
  revenueRooms: number;
  revenueEvents: number;
  revenueFB: number;
  revenueOther: number;
  totalExpenses: number;
  expenseRooms: number;
  expenseFB: number;
  expenseEvents: number;
  expenseMarketing: number;
  expensePropertyOps: number;
  expenseUtilitiesVar: number;
  expenseUtilitiesFixed: number;
  expenseTaxes: number;
  expenseAdmin: number;
  expenseIT: number;
  expenseOtherCosts: number;
  expensePlatformFees: number;
  expensePreOpening: number;
  expenseInsurance: number;
  expenseFFE: number;
  feeBase: number;
  feeIncentive: number;
  expenseOther: number;
  gop: number;
  agop: number;
  noi: number;
  anoi: number;
  cashFlow: number;
}

export interface CashFlowDataPoint {
  interestExpense: number;
  taxLiability: number;
  principalPayment: number;
  exitValue: number;
  refinancingProceeds: number;
  freeCashFlow: number;
  freeCashFlowToEquity: number;
  netCashFlowToInvestors: number;
}

export interface PPECostBasisScheduleProps {
  property: Property;
  global: GlobalResponse;
}

export interface IncomeStatementTabProps {
  yearlyChartData: YearlyChartDataPoint[];
  yearlyDetails: YearlyDetail[];
  financials: MonthlyFinancials[];
  property: Property;
  global: GlobalResponse;
  projectionYears: number;
  startYear: number;
  incomeChartRef: RefObject<HTMLDivElement | null>;
  incomeTableRef: RefObject<HTMLDivElement | null>;
  incomeAllExpanded: boolean;
}

export interface CashFlowTabProps {
  yearlyChartData: YearlyChartDataPoint[];
  cashFlowData: CashFlowDataPoint[];
  yearlyDetails: YearlyDetail[];
  financials: MonthlyFinancials[];
  property: Property;
  global: GlobalResponse;
  projectionYears: number;
  startYear: number;
  cashFlowChartRef: RefObject<HTMLDivElement | null>;
  cashFlowTableRef: RefObject<HTMLDivElement | null>;
}

export interface PropertyHeaderProps {
  property: Property;
  propertyId: number;
  heroCaption?: string;
  onPhotoUploadComplete: () => void;
}

