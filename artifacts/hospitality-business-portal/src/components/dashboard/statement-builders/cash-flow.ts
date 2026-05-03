import type { ExportRow, ExportData } from "../statementBuilders";
import type { YearlyCashFlowResult } from "@/lib/financial/loanCalculations";
import type { YearlyPropertyFinancials } from "@/lib/financial/yearlyAggregator";

export function generatePortfolioCashFlowData(
  allPropertyYearlyCF: YearlyCashFlowResult[][],
  projectionYears: number,
  getFiscalYear: (i: number) => number,
  overrideExpanded?: Set<string>,
  excludeFormulas?: boolean,
  propertyNames?: string[],
  yearlyConsolidatedCache?: YearlyPropertyFinancials[]
): ExportData {
  const years = Array.from({ length: projectionYears }, (_, i) => getFiscalYear(i));
  const rows: ExportRow[] = [];
  const expanded = overrideExpanded;

  const consolidatedCFO = years.map((_, y) =>
    allPropertyYearlyCF.reduce((sum, prop) => sum + (prop[y]?.cashFromOperations ?? 0), 0)
  );
  const consolidatedCFI = years.map((_, y) =>
    allPropertyYearlyCF.reduce((sum, prop) => sum + (prop[y]?.capitalExpenditures ?? 0) + (prop[y]?.exitValue ?? 0), 0)
  );
  const consolidatedCFF = years.map((_, y) =>
    allPropertyYearlyCF.reduce((sum, prop) => sum + (prop[y]?.refinancingProceeds ?? 0) - (prop[y]?.principalPayment ?? 0), 0)
  );
  const netChange = years.map((_, y) => consolidatedCFO[y] + consolidatedCFI[y] + consolidatedCFF[y]);

  const consolidatedANOI = years.map((_, y) =>
    allPropertyYearlyCF.reduce((sum, prop) => sum + (prop[y]?.anoi ?? 0), 0)
  );
  const consolidatedInterest = years.map((_, y) =>
    allPropertyYearlyCF.reduce((sum, prop) => sum + (prop[y]?.interestExpense ?? 0), 0)
  );
  const consolidatedPrincipalCF = years.map((_, y) =>
    allPropertyYearlyCF.reduce((sum, prop) => sum + (prop[y]?.principalPayment ?? 0), 0)
  );
  const consolidatedTaxCF = years.map((_, y) =>
    allPropertyYearlyCF.reduce((sum, prop) => sum + (prop[y]?.taxLiability ?? 0), 0)
  );
  const consolidatedCapex = years.map((_, y) =>
    allPropertyYearlyCF.reduce((sum, prop) => sum + (prop[y]?.capitalExpenditures ?? 0), 0)
  );
  const consolidatedExitValue = years.map((_, y) =>
    allPropertyYearlyCF.reduce((sum, prop) => sum + (prop[y]?.exitValue ?? 0), 0)
  );
  const consolidatedRefi = years.map((_, y) =>
    allPropertyYearlyCF.reduce((sum, prop) => sum + (prop[y]?.refinancingProceeds ?? 0), 0)
  );

  rows.push({ category: "Cash Flow from Operations (CFO)", values: consolidatedCFO, isHeader: true });
  if (!excludeFormulas) {
    rows.push({ category: "Adjusted NOI (ANOI)", values: consolidatedANOI, indent: 1 });
    rows.push({ category: "Less: Interest Expense", values: consolidatedInterest.map(v => -v), indent: 1 });
    rows.push({ category: "Less: Principal Payments", values: consolidatedPrincipalCF.map(v => -v), indent: 1 });
    rows.push({ category: "Less: Income Tax", values: consolidatedTaxCF.map(v => -v), indent: 1 });
    if (expanded?.has("cfo")) {
      allPropertyYearlyCF.forEach((propCF, idx) => {
        const name = propertyNames?.[idx] ?? `Property ${idx + 1}`;
        rows.push({ category: name, values: years.map((_, y) => propCF[y]?.cashFromOperations ?? 0), indent: 2 });
      });
    }
  }

  rows.push({ category: "Cash Flow from Investing (CFI)", values: consolidatedCFI, isHeader: true });
  if (!excludeFormulas) {
    rows.push({ category: "Capital Expenditures (FF&E)", values: consolidatedCapex, indent: 1 });
    rows.push({ category: "Exit Proceeds (Net Sale Value)", values: consolidatedExitValue, indent: 1 });
    if (expanded?.has("cfi")) {
      allPropertyYearlyCF.forEach((propCF, idx) => {
        const name = propertyNames?.[idx] ?? `Property ${idx + 1}`;
        rows.push({ category: name, values: years.map((_, y) => (propCF[y]?.capitalExpenditures ?? 0) + (propCF[y]?.exitValue ?? 0)), indent: 2 });
      });
    }
  }

  rows.push({ category: "Cash Flow from Financing (CFF)", values: consolidatedCFF, isHeader: true });
  if (!excludeFormulas) {
    rows.push({ category: "Refinancing Proceeds", values: consolidatedRefi, indent: 1 });
    rows.push({ category: "Less: Principal Repayments", values: consolidatedPrincipalCF.map(v => -v), indent: 1 });
    if (expanded?.has("cff")) {
      allPropertyYearlyCF.forEach((propCF, idx) => {
        const name = propertyNames?.[idx] ?? `Property ${idx + 1}`;
        rows.push({ category: name, values: years.map((_, y) => (propCF[y]?.refinancingProceeds ?? 0) - (propCF[y]?.principalPayment ?? 0)), indent: 2 });
      });
    }
  }

  rows.push({ category: "Net Change in Cash", values: netChange, isHeader: true, isBold: true });

  const consolidatedMaintenanceCapex = years.map((_, y) =>
    allPropertyYearlyCF.reduce((sum, prop) => sum + (prop[y]?.maintenanceCapex ?? 0), 0)
  );
  const consolidatedFCF = years.map((_, y) =>
    allPropertyYearlyCF.reduce((sum, prop) => sum + (prop[y]?.freeCashFlow ?? 0), 0)
  );
  const consolidatedPrincipal = years.map((_, y) =>
    allPropertyYearlyCF.reduce((sum, prop) => sum + (prop[y]?.principalPayment ?? 0), 0)
  );
  const consolidatedFCFE = years.map((_, y) =>
    allPropertyYearlyCF.reduce((sum, prop) => sum + (prop[y]?.freeCashFlowToEquity ?? 0), 0)
  );

  if (!excludeFormulas) {
    rows.push({ category: "", values: years.map(() => 0) });
    rows.push({ category: "Free Cash Flow", values: years.map(() => 0), isHeader: true });
    rows.push({ category: "Net Cash from Operating Activities", values: consolidatedCFO, indent: 1 });
    rows.push({ category: "Less: Capital Expenditures (FF&E)", values: consolidatedMaintenanceCapex.map(v => -v), indent: 1 });
    rows.push({ category: "Free Cash Flow (FCF)", values: consolidatedFCF, isBold: true, indent: 1 });
    rows.push({ category: "Less: Principal Payments", values: consolidatedPrincipal.map(v => -v), indent: 1 });
    rows.push({ category: "Free Cash Flow to Equity (FCFE)", values: consolidatedFCFE, isBold: true, indent: 1 });

    const consolidatedDebtService = years.map((_, y) =>
      allPropertyYearlyCF.reduce((sum, prop) => sum + (prop[y]?.debtService ?? 0), 0)
    );
    const consolidatedRevenue = years.map((_, y) =>
      yearlyConsolidatedCache?.[y]?.revenueTotal ??
      allPropertyYearlyCF.reduce((sum, prop) => sum + (prop[y]?.anoi ?? 0) + (prop[y]?.maintenanceCapex ?? 0) + (prop[y]?.debtService ?? 0) + (prop[y]?.taxLiability ?? 0), 0)
    );
    const totalEquityForMetrics = allPropertyYearlyCF.reduce((sum, prop) => {
      const acqYear = prop.findIndex(y => y.capitalExpenditures !== 0);
      return sum + Math.abs(prop[acqYear]?.capitalExpenditures ?? 0);
    }, 0);

    rows.push({ category: "", values: years.map(() => 0) });
    rows.push({ category: "Key Metrics", values: years.map(() => 0), isHeader: true });
    rows.push({
      category: "DSCR (Debt Service Coverage)",
      values: years.map((_, y) => consolidatedDebtService[y] > 0 ? consolidatedANOI[y] / consolidatedDebtService[y] : 0),
      indent: 1, format: "ratio",
    });
    rows.push({
      category: "Cash-on-Cash Return",
      values: years.map((_, y) => totalEquityForMetrics > 0 ? consolidatedFCFE[y] / totalEquityForMetrics : 0),
      indent: 1, format: "percentage",
    });
    rows.push({
      category: "FCF Margin",
      values: years.map((_, y) => consolidatedRevenue[y] > 0 ? consolidatedFCF[y] / consolidatedRevenue[y] : 0),
      indent: 1, format: "percentage",
    });
    rows.push({
      category: "FCFE Margin",
      values: years.map((_, y) => consolidatedRevenue[y] > 0 ? consolidatedFCFE[y] / consolidatedRevenue[y] : 0),
      indent: 1, format: "percentage",
    });
  }

  return { years, rows };
}
