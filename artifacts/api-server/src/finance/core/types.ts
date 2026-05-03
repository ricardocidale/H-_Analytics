export type { PropertyInput, GlobalInput, MonthlyFinancials } from "@engine/types";
export type { YearlyPropertyFinancials } from "@engine/aggregation/yearlyAggregator";
export type { PropertyEngineContext } from "@engine/property/resolve-assumptions";
export type { YearlyCashFlowResult } from "@engine/debt/loanCalculations";

type YearlyPropertyFinancialsImport = import("@engine/aggregation/yearlyAggregator").YearlyPropertyFinancials;
type MonthlyFinancialsImport = import("@engine/types").MonthlyFinancials;

type CompanyMonthlyFinancialsImport = import("@engine/types").CompanyMonthlyFinancials;
type CompanyYearlyFinancialsImport = import("@engine/types").CompanyYearlyFinancials;

export interface PortfolioComputeResult {
  engineVersion: string;
  computedAt: string;
  perPropertyYearly: Record<string, YearlyPropertyFinancialsImport[]>;
  perPropertyMonthly: Record<string, MonthlyFinancialsImport[]>;
  consolidatedYearly: YearlyPropertyFinancialsImport[];
  companyMonthly?: CompanyMonthlyFinancialsImport[];
  companyYearly?: CompanyYearlyFinancialsImport[];
  outputHash: string;
  propertyCount: number;
  projectionYears: number;
  cached?: boolean;
  validationSummary: {
    opinion: "UNQUALIFIED" | "QUALIFIED" | "ADVERSE";
    identityChecks: number;
    passed: number;
    failed: number;
  };
}

export interface SinglePropertyComputeResult {
  engineVersion: string;
  computedAt: string;
  monthly: MonthlyFinancialsImport[];
  yearly: YearlyPropertyFinancialsImport[];
  outputHash: string;
  projectionYears: number;
  cached?: boolean;
  validationSummary: {
    opinion: "UNQUALIFIED" | "QUALIFIED" | "ADVERSE";
    identityChecks: number;
    passed: number;
    failed: number;
  };
}
