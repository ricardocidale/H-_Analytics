import { Property } from "@shared/schema";
import { YearlyPropertyFinancials } from "@/lib/financial/yearlyAggregator";
import { YearlyCashFlowResult } from "@/lib/financial/loanCalculations";
import { MonthlyFinancials } from "@/lib/financialEngine";
import type { GlobalResponse } from "@/lib/api";
import type { WeightedMetrics } from "@engine/types";
export type { WeightedMetrics };

export interface DashboardFinancials {
  allPropertyFinancials: { property: Property; financials: MonthlyFinancials[] }[];
  allPropertyYearlyCF: YearlyCashFlowResult[][];
  allPropertyYearlyIS: YearlyPropertyFinancials[][];
  yearlyConsolidatedCache: YearlyPropertyFinancials[];
  weightedMetricsByYear: WeightedMetrics[];
  totalProjectionRevenue: number;
  totalProjectionNOI: number;
  totalProjectionANOI: number;
  totalProjectionCashFlow: number;
  portfolioIRR: number;
  equityMultiple: number;
  cashOnCash: number;
  totalInitialEquity: number;
  totalExitValue: number;
  totalRooms: number;
}

export interface DashboardTabProps {
  financials: DashboardFinancials;
  properties: Property[];
  projectionYears: number;
  getFiscalYear: (yearIndex: number) => number;
  showCalcDetails: boolean;
  global: GlobalResponse;
}
