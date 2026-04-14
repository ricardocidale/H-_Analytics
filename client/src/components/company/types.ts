/**
 * company/types.ts
 *
 * TypeScript interfaces for the Management Company financial views.
 *
 * Key types:
 *   • CompanyTabProps         – base props for Income and Cash Flow tabs;
 *                               receives the engine-computed CompanyMonthlyFinancials,
 *                               the projection year range, and the global assumptions
 *   • CompanyBalanceSheetProps – extends the base with company metadata
 *   • CompanyHeaderProps      – props for the summary header bar (company name,
 *                               total revenue, EBITDA, total cash, and chart data)
 *   • CompanyChartDataPoint   – {year, revenue, ebitda} tuple for the sparkline
 *   • CompanyCashAnalysis     – detailed cash metrics (opening cash, operating cash,
 *                               funding inflows, partner draws, closing cash) used
 *                               by the Cash Flow tab's summary cards
 */
import type { CompanyMonthlyFinancials } from "@/lib/financialEngine";

export interface CompanyChartDataPoint {
  [key: string]: string | number;
  year: string;
  Revenue: number;
  BaseFees: number;
  IncentiveFees: number;
  Expenses: number;
  OperatingIncome: number;
  NetIncome: number;
  Funding: number;
  CashFlow: number;
  EndingCash: number;
  Assets: number;
  Liabilities: number;
  Equity: number;
}

export interface CompanyCashAnalysis {
  totalFunding: number;
  minCashPosition: number;
  minCashMonth: number | null;
  shortfall: number;
  isAdequate: boolean;
  suggestedAdditionalFunding: number;
}

export interface CompanyTabProps {
  financials: CompanyMonthlyFinancials[];
  properties: any[];
  global: any;
  projectionYears: number;
  expandedRows: Set<string>;
  toggleRow: (rowId: string) => void;
  getFiscalYear: (yearIndex: number) => number;
  fundingLabel: string;
  tableRef?: React.RefObject<HTMLDivElement | null>;
  activeTab?: string;
  propertyFinancials: { property: any; financials: any[] }[];
  yearlyChartData?: CompanyChartDataPoint[];
}

export interface CompanyBalanceSheetProps {
  financials: CompanyMonthlyFinancials[];
  global: any;
  projectionYears: number;
  getFiscalYear: (yearIndex: number) => number;
  fundingLabel: string;
  bsExpanded: Record<string, boolean>;
  setBsExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  tableRef?: React.RefObject<HTMLDivElement | null>;
  activeTab?: string;
  yearlyChartData?: CompanyChartDataPoint[];
}

export interface CompanyHeaderProps {
  global: any;
  properties: any[];
  yearlyChartData: CompanyChartDataPoint[];
  cashAnalysis: CompanyCashAnalysis;
  projectionYears: number;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  chartRef: React.RefObject<HTMLDivElement | null>;
  exportMenuNode: React.ReactNode;
  isAdmin?: boolean;
}
