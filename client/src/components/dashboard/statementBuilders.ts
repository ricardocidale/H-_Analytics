import type { DashboardFinancials } from "./types";
import type { Property } from "@shared/schema";
import type { YearlyPropertyFinancials } from "@/lib/financial/yearlyAggregator";
import type { } from "@/lib/financial/loanCalculations";
import type { MonthlyFinancials } from "@/lib/financialEngine";
import { propertyEquityInvested, acquisitionYearIndex } from "@/lib/financial/equityCalculations";
import { yearEndSlice, sumMonthlyField, propertyPPE } from "@/lib/financial/portfolio-helpers";

import { generatePortfolioCashFlowData } from "./statement-builders/cash-flow";
import { generatePortfolioInvestmentData } from "./statement-builders/investment";

export { generatePortfolioCashFlowData, generatePortfolioInvestmentData };

export interface ExportRow {
  category: string;
  values: number[];
  isHeader?: boolean;
  indent?: number;
  isBold?: boolean;
  isItalic?: boolean;
  format?: "currency" | "percentage" | "number" | "ratio" | "multiplier";
}

export interface ExportData {
  years: number[];
  rows: ExportRow[];
}

export function toExportData(data: ExportData): { years: string[]; rows: { category: string; values: number[]; indent?: number; isBold?: boolean; isHeader?: boolean }[] } {
  return {
    years: data.years.map(String),
    rows: data.rows.map(r => ({ category: r.category, values: r.values, indent: r.indent, isBold: r.isBold ?? r.isHeader, isHeader: r.isHeader })),
  };
}

export const BS_TOTAL_ASSETS = "TOTAL ASSETS";
export const BS_MORTGAGE_NOTES = "Mortgage Notes Payable";
export const BS_PAID_IN_CAPITAL = "Paid-In Capital";
export const BS_RETAINED_EARNINGS = "Retained Earnings";
export const BS_TOTAL_LIABILITIES_EQUITY = "TOTAL LIABILITIES & EQUITY";

export function generatePortfolioBalanceSheetData(
  allPropertyFinancials: { property: Property; financials: MonthlyFinancials[] }[],
  projectionYears: number,
  getFiscalYear: (i: number) => number,
  modelStartDate?: Date,
  summaryOnly?: boolean
): ExportData {
  const years = Array.from({ length: projectionYears }, (_, i) => getFiscalYear(i));
  const rows: ExportRow[] = [];

  const getYearEndData = (yearIdx: number) => {
    let totalCash = 0;
    let totalPPE = 0;
    let totalAccDep = 0;
    let totalDeferredFinancing = 0;
    let totalDebt = 0;
    let totalEquity = 0;
    let totalRetainedEarnings = 0;

    allPropertyFinancials.forEach(({ property, financials }) => {
      const acqYear = acquisitionYearIndex(property.acquisitionDate, property.operationsStartDate, modelStartDate ? modelStartDate.toISOString().slice(0, 10) : "");
      if (yearIdx < acqYear) return;

      const relevantMonths = yearEndSlice(financials, yearIdx);
      const lastMonth = relevantMonths[relevantMonths.length - 1];

      if (!lastMonth) return;

      const ppe = propertyPPE(property.purchasePrice, property.buildingImprovements);
      const accDep = sumMonthlyField(relevantMonths, "depreciationExpense");
      
      const operatingReserve = property.operatingReserve || 0;
      const cumulativeANOI = relevantMonths.reduce((sum, m) => sum + m.anoi, 0);
      const cumulativeDebtService = relevantMonths.reduce((sum, m) => sum + m.interestExpense + m.principalPayment, 0);
      const cumulativeTax = relevantMonths.reduce((sum, m) => sum + m.incomeTax, 0);
      const cumulativeRefi = relevantMonths.reduce((sum, m) => sum + m.refinancingProceeds, 0);
      
      const cash = operatingReserve + (cumulativeANOI - cumulativeDebtService - cumulativeTax) + cumulativeRefi;
      
      let deferredFinancing = 0;
      for (let m = 0; m < relevantMonths.length; m++) {
        if (financials[m].refinancingProceeds > 0) {
          const debtBefore = m > 0 ? financials[m - 1].debtOutstanding : 0;
          const debtAfter = financials[m].debtOutstanding;
          const principalInRefiMonth = financials[m].principalPayment;
          const newLoanAmount = debtAfter + principalInRefiMonth;
          const refiClosingCosts = newLoanAmount - debtBefore - financials[m].refinancingProceeds;
          if (refiClosingCosts > 0) deferredFinancing += refiClosingCosts;
        }
      }

      totalPPE += ppe;
      totalAccDep += accDep;
      totalCash += cash;
      totalDeferredFinancing += deferredFinancing;
      totalDebt += lastMonth.debtOutstanding;
      totalEquity += propertyEquityInvested(property);
      
      const netIncome = relevantMonths.reduce((sum, m) => sum + m.netIncome, 0);
      const preOpening = property.preOpeningCosts || 0;
      totalRetainedEarnings += (netIncome - preOpening);
    });

    return {
      cash: totalCash,
      ppe: totalPPE,
      accDep: totalAccDep,
      deferredFinancing: totalDeferredFinancing,
      debt: totalDebt,
      equity: totalEquity,
      retainedEarnings: totalRetainedEarnings,
      totalAssets: totalPPE - totalAccDep + totalCash + totalDeferredFinancing,
      totalLiabilitiesEquity: totalDebt + totalEquity + totalRetainedEarnings
    };
  };

  const yearlyData = years.map((_, i) => getYearEndData(i));

  const netFixed = yearlyData.map(d => d.ppe - d.accDep);

  rows.push({ category: "ASSETS", values: years.map(() => 0), isHeader: true });

  if (!summaryOnly) {
    rows.push({ category: "Current Assets", values: years.map(() => 0), isHeader: true, indent: 1 });
    rows.push({ category: "Cash & Cash Equivalents", values: yearlyData.map(d => d.cash), indent: 2 });
  }
  rows.push({ category: "Total Current Assets", values: yearlyData.map(d => d.cash), isBold: true, indent: 1 });

  if (!summaryOnly) {
    rows.push({ category: "Fixed Assets", values: years.map(() => 0), isHeader: true, indent: 1 });
    rows.push({ category: "Property, Plant & Equipment", values: yearlyData.map(d => d.ppe), indent: 2 });
    rows.push({ category: "Less: Accumulated Depreciation", values: yearlyData.map(d => -d.accDep), indent: 2 });
  }
  rows.push({ category: "Net Fixed Assets", values: netFixed, isBold: true, indent: 1 });

  if (!summaryOnly && yearlyData.some(d => d.deferredFinancing > 0)) {
    rows.push({ category: "Other Assets", values: years.map(() => 0), isHeader: true, indent: 1 });
    rows.push({ category: "Deferred Financing Costs", values: yearlyData.map(d => d.deferredFinancing), indent: 2 });
  }

  rows.push({ category: BS_TOTAL_ASSETS, values: yearlyData.map(d => d.totalAssets), isHeader: true, isBold: true });

  rows.push({ category: "LIABILITIES", values: years.map(() => 0), isHeader: true });
  if (!summaryOnly) {
    rows.push({ category: "Long-Term Liabilities", values: years.map(() => 0), isHeader: true, indent: 1 });
    rows.push({ category: BS_MORTGAGE_NOTES, values: yearlyData.map(d => d.debt), indent: 2 });
  }
  rows.push({ category: "Total Liabilities", values: yearlyData.map(d => d.debt), isBold: true, indent: 1 });

  rows.push({ category: "EQUITY", values: years.map(() => 0), isHeader: true });
  if (!summaryOnly) {
    rows.push({ category: BS_PAID_IN_CAPITAL, values: yearlyData.map(d => d.equity), indent: 1 });
    rows.push({ category: BS_RETAINED_EARNINGS, values: yearlyData.map(d => d.retainedEarnings), indent: 1 });
  }
  rows.push({ category: "Total Equity", values: yearlyData.map(d => d.equity + d.retainedEarnings), isBold: true, indent: 1 });

  rows.push({ category: BS_TOTAL_LIABILITIES_EQUITY, values: yearlyData.map(d => d.totalLiabilitiesEquity), isHeader: true, isBold: true });

  if (!summaryOnly) {
    rows.push({ category: "Balance Check (Assets − L&E)", values: yearlyData.map(d => d.totalAssets - d.totalLiabilitiesEquity), indent: 1 });
  }

  return { years, rows };
}

export function generatePortfolioIncomeData(
  yearlyConsolidatedCache: YearlyPropertyFinancials[],
  projectionYears: number,
  getFiscalYear: (i: number) => number,
  summaryOnly?: boolean,
  allPropertyYearlyIS?: YearlyPropertyFinancials[][],
  propertyNames?: string[]
): ExportData {
  const years = Array.from({ length: projectionYears }, (_, i) => getFiscalYear(i));
  const c = (i: number) => yearlyConsolidatedCache[i];
  const p = (idx: number, i: number) => allPropertyYearlyIS?.[idx]?.[i];
  const rows: ExportRow[] = [];
  const hasProps = allPropertyYearlyIS && propertyNames && propertyNames.length > 0;

  rows.push({ category: "Operational Metrics", values: years.map(() => 0), isHeader: true });
  if (!summaryOnly) {
    rows.push({ category: "Total Rooms Available", values: years.map((_, i) => c(i)?.availableRooms ?? 0), indent: 1, format: "number" });
    const adrVals = years.map((_, i) => {
      const sold = c(i)?.soldRooms ?? 0;
      return sold > 0 ? (c(i)?.revenueRooms ?? 0) / sold : 0;
    });
    rows.push({ category: "ADR (Effective)", values: adrVals, indent: 1, format: "currency" });
    const occVals = years.map((_, i) => {
      const sold = c(i)?.soldRooms ?? 0;
      const avail = c(i)?.availableRooms ?? 0;
      return avail > 0 ? sold / avail : 0;
    });
    rows.push({ category: "Occupancy", values: occVals, indent: 1, format: "percentage" });
    const revparVals = years.map((_, i) => {
      const rev = c(i)?.revenueRooms ?? 0;
      const avail = c(i)?.availableRooms ?? 0;
      return avail > 0 ? rev / avail : 0;
    });
    rows.push({ category: "RevPAR", values: revparVals, indent: 1, format: "currency" });
  }

  rows.push({ category: "Total Revenue", values: years.map((_, i) => c(i)?.revenueTotal ?? 0), isHeader: true });
  if (!summaryOnly) {
    rows.push({ category: "Room Revenue", values: years.map((_, i) => c(i)?.revenueRooms ?? 0), indent: 1 });
    rows.push({ category: "Event Revenue", values: years.map((_, i) => c(i)?.revenueEvents ?? 0), indent: 1 });
    rows.push({ category: "F&B Revenue", values: years.map((_, i) => c(i)?.revenueFB ?? 0), indent: 1 });
    rows.push({ category: "Other Revenue", values: years.map((_, i) => c(i)?.revenueOther ?? 0), indent: 1 });
    if (hasProps) {
      propertyNames!.forEach((name, idx) => {
        rows.push({ category: name, values: years.map((_, i) => p(idx, i)?.revenueTotal ?? 0), indent: 2 });
      });
    }
  }

  const deptExpTotal = (i: number) => {
    const data = c(i);
    if (!data) return 0;
    return data.expenseRooms + data.expenseFB + data.expenseEvents + data.expenseOther;
  };

  const undistExpTotal = (i: number) => {
    const data = c(i);
    if (!data) return 0;
    return data.expenseMarketing + data.expensePropertyOps + data.expenseAdmin +
      data.expenseIT + data.expenseInsurance +
      data.expenseUtilitiesVar + data.expenseUtilitiesFixed + data.expenseOtherCosts;
  };

  rows.push({ category: "Departmental Expenses", values: years.map((_, i) => deptExpTotal(i)), isHeader: true });
  if (!summaryOnly) {
    rows.push({ category: "Room Expense", values: years.map((_, i) => c(i)?.expenseRooms ?? 0), indent: 1 });
    rows.push({ category: "F&B Expense", values: years.map((_, i) => c(i)?.expenseFB ?? 0), indent: 1 });
    rows.push({ category: "Event Expense", values: years.map((_, i) => c(i)?.expenseEvents ?? 0), indent: 1 });
    rows.push({ category: "Other Departmental", values: years.map((_, i) => c(i)?.expenseOther ?? 0), indent: 1 });
  }

  rows.push({ category: "Undistributed Operating Expenses", values: years.map((_, i) => undistExpTotal(i)), isHeader: true });
  if (!summaryOnly) {
    rows.push({ category: "Marketing & Sales", values: years.map((_, i) => c(i)?.expenseMarketing ?? 0), indent: 1 });
    rows.push({ category: "Property Ops & Maintenance", values: years.map((_, i) => c(i)?.expensePropertyOps ?? 0), indent: 1 });
    rows.push({ category: "Admin & General", values: years.map((_, i) => c(i)?.expenseAdmin ?? 0), indent: 1 });
    rows.push({ category: "IT & Technology", values: years.map((_, i) => c(i)?.expenseIT ?? 0), indent: 1 });
    rows.push({ category: "Insurance", values: years.map((_, i) => c(i)?.expenseInsurance ?? 0), indent: 1 });
    rows.push({ category: "Utilities", values: years.map((_, i) => (c(i)?.expenseUtilitiesVar ?? 0) + (c(i)?.expenseUtilitiesFixed ?? 0)), indent: 1 });
    rows.push({ category: "Other Undistributed", values: years.map((_, i) => c(i)?.expenseOtherCosts ?? 0), indent: 1 });
  }

  rows.push({ category: "Gross Operating Profit (GOP)", values: years.map((_, i) => c(i)?.gop ?? 0), isHeader: true, isBold: true });
  if (!summaryOnly && hasProps) {
    propertyNames!.forEach((name, idx) => {
      rows.push({ category: name, values: years.map((_, i) => p(idx, i)?.gop ?? 0), indent: 1 });
    });
  }

  rows.push({ category: "Management Fees", values: years.map((_, i) => (c(i)?.feeBase ?? 0) + (c(i)?.feeIncentive ?? 0)), isHeader: true });
  if (!summaryOnly) {
    rows.push({ category: "Base Fee", values: years.map((_, i) => c(i)?.feeBase ?? 0), indent: 1 });
    const catSet = new Set<string>();
    for (const yc of yearlyConsolidatedCache) for (const k of Object.keys(yc?.serviceFeesByCategory ?? {})) catSet.add(k);
    catSet.forEach(cat => {
      rows.push({ category: cat, values: years.map((_, i) => c(i)?.serviceFeesByCategory?.[cat] ?? 0), indent: 2 });
    });
    rows.push({ category: "Incentive Fee", values: years.map((_, i) => c(i)?.feeIncentive ?? 0), indent: 1 });
  }

  rows.push({ category: "Adjusted Gross Operating Profit (AGOP)", values: years.map((_, i) => c(i)?.agop ?? 0), isHeader: true, isBold: true });
  if (!summaryOnly && hasProps) {
    propertyNames!.forEach((name, idx) => {
      rows.push({ category: name, values: years.map((_, i) => p(idx, i)?.agop ?? 0), indent: 1 });
    });
  }

  rows.push({ category: "Fixed Charges", values: years.map((_, i) => (c(i)?.expenseTaxes ?? 0)), isHeader: true });
  if (!summaryOnly) {
    rows.push({ category: "Property Taxes", values: years.map((_, i) => c(i)?.expenseTaxes ?? 0), indent: 1 });
  }

  rows.push({ category: "Net Operating Income (NOI)", values: years.map((_, i) => c(i)?.noi ?? 0), isHeader: true, isBold: true });
  if (!summaryOnly && hasProps) {
    propertyNames!.forEach((name, idx) => {
      rows.push({ category: name, values: years.map((_, i) => p(idx, i)?.noi ?? 0), indent: 1 });
    });
  }

  rows.push({ category: "FF&E Reserve", values: years.map((_, i) => c(i)?.expenseFFE ?? 0), isHeader: true });
  rows.push({ category: "Adjusted NOI (ANOI)", values: years.map((_, i) => c(i)?.anoi ?? 0), isHeader: true, isBold: true });
  if (!summaryOnly && hasProps) {
    propertyNames!.forEach((name, idx) => {
      rows.push({ category: name, values: years.map((_, i) => p(idx, i)?.anoi ?? 0), indent: 1 });
    });
  }

  rows.push({ category: "Debt Service", values: years.map((_, i) => c(i)?.debtPayment ?? 0), isHeader: true });
  if (!summaryOnly) {
    rows.push({ category: "Interest Expense", values: years.map((_, i) => c(i)?.interestExpense ?? 0), indent: 1 });
    rows.push({ category: "Principal Payment", values: years.map((_, i) => c(i)?.principalPayment ?? 0), indent: 1 });
  }

  rows.push({ category: "Net Income", values: years.map((_, i) => c(i)?.netIncome ?? 0), isHeader: true, isBold: true });
  if (!summaryOnly) {
    rows.push({ category: "Depreciation", values: years.map((_, i) => c(i)?.depreciationExpense ?? 0), indent: 1 });
    rows.push({ category: "Income Tax", values: years.map((_, i) => c(i)?.incomeTax ?? 0), indent: 1 });
    rows.push({ category: "Cash Flow", values: years.map((_, i) => c(i)?.cashFlow ?? 0), indent: 1, isBold: true });
  }

  return { years, rows };
}

export function buildAllPortfolioStatements(
  financials: DashboardFinancials,
  properties: Property[],
  projectionYears: number,
  getFiscalYear: (i: number) => number,
  modelStartDate?: Date
): {
  incomeData: ExportData;
  cashFlowData: ExportData;
  balanceSheetData: ExportData;
  investmentData: ExportData;
} {
  const allExpandedCF = new Set(["cfo", "cfi", "cff"]);
  const propertyNames = properties.map(p => p.name);

  return {
    incomeData: generatePortfolioIncomeData(financials.yearlyConsolidatedCache, projectionYears, getFiscalYear, false, financials.allPropertyYearlyIS, propertyNames),
    cashFlowData: generatePortfolioCashFlowData(financials.allPropertyYearlyCF, projectionYears, getFiscalYear, allExpandedCF, false, propertyNames, financials.yearlyConsolidatedCache),
    balanceSheetData: generatePortfolioBalanceSheetData(financials.allPropertyFinancials, projectionYears, getFiscalYear, modelStartDate),
    investmentData: generatePortfolioInvestmentData(financials, properties, projectionYears, getFiscalYear),
  };
}
