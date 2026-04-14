import { APP_BRAND_NAME } from "@shared/constants";
import { downloadCSV } from "@/lib/exports/csvExport";
import { exportPropertyPPTX } from "@/lib/exports/pptxExport";
import { exportFullPropertyWorkbook } from "@/lib/exports/excelExport";
import { type ExportRowMeta } from "@/lib/exports/exportStyles";
import { type LoanParams, type GlobalLoanParams } from "@/lib/financial/loanCalculations";
import { formatMoney } from "@/lib/financialEngine";
import type { ExportVersion, PremiumExportPayload } from "@/components/ExportDialog";
import { loadExportConfig } from "@/lib/exportConfig";
import { type PropertyExportContext, getLoanCalcs, buildIncomeRows, buildCashFlowRows, computeCashFlowVectors, resolveExportDepreciationYears } from "./propertyExportShared";
import { exportIncomeStatementPDF, exportCashFlowPDF, exportUnifiedPDF } from "./propertyPdfExports";
export { type PropertyExportContext } from "./propertyExportShared";
export { exportIncomeStatementPDF, exportCashFlowPDF, exportUnifiedPDF };

export function exportAllStatementsCSV(ctx: PropertyExportContext, customFilename?: string) {
  const { yearlyDetails, years, startYear, property } = ctx;
  const { loan, acqYear, totalPropertyCost } = getLoanCalcs(ctx);
  const cashFlowData = ctx.cashFlowData;
  const headers = ["Line Item", ...Array.from({ length: years }, (_, i) => `FY ${startYear + i}`)];
  const line = (label: string, vals: number[]) => [`"${label}"`, ...vals.map(v => v.toFixed(0))].join(",");

  const csvCfo = yearlyDetails.map((yd, i) =>
    yd.revenueTotal - (yd.totalExpenses - yd.expenseFFE) - cashFlowData[i].interestExpense - cashFlowData[i].taxLiability
  );
  const csvNetChange = csvCfo.map((cfo, i) => {
    const cfi = -totalPropertyCost * (i === acqYear ? 1 : 0) - yearlyDetails[i].expenseFFE + cashFlowData[i].exitValue;
    const cff = (i === acqYear ? loan.equityInvested : 0) +
      (i === acqYear && loan.loanAmount > 0 ? loan.loanAmount : 0) -
      cashFlowData[i].principalPayment + cashFlowData[i].refinancingProceeds;
    return cfo + cfi + cff;
  });
  const csvCloseCash: number[] = [];
  let csvRunCash = 0;
  for (const nc of csvNetChange) { csvRunCash += nc; csvCloseCash.push(csvRunCash); }

  const rows: string[] = [headers.join(","), ""];
  rows.push('"INCOME STATEMENT"', "");
  rows.push(line("Total Revenue", yearlyDetails.map(y => y.revenueTotal)));
  rows.push(line("  Room Revenue", yearlyDetails.map(y => y.revenueRooms)));
  rows.push(line("  Event Revenue", yearlyDetails.map(y => y.revenueEvents)));
  rows.push(line("  F&B Revenue", yearlyDetails.map(y => y.revenueFB)));
  rows.push(line("  Other Revenue", yearlyDetails.map(y => y.revenueOther)));
  rows.push(line("Total Operating Expenses", yearlyDetails.map(y => y.totalExpenses - y.expenseFFE - y.expenseTaxes)));
  rows.push(line("Gross Operating Profit (GOP)", yearlyDetails.map(y => y.gop)));
  rows.push(line("Total Management Fees", yearlyDetails.map(y => y.feeBase + y.feeIncentive)));
  rows.push(line("Adjusted GOP (AGOP)", yearlyDetails.map(y => y.agop)));
  rows.push(line("Total Fixed Charges", yearlyDetails.map(y => y.expenseTaxes)));
  rows.push(line("Net Operating Income (NOI)", yearlyDetails.map(y => y.noi)));
  rows.push(line("FF&E Reserve", yearlyDetails.map(y => y.expenseFFE)));
  rows.push(line("Adjusted NOI (ANOI)", yearlyDetails.map(y => y.anoi)));
  rows.push("");

  rows.push('"CASH FLOW STATEMENT"', "");
  rows.push(line("Net Cash from Operating Activities", csvCfo));
  rows.push(line("  FF&E Reserve / Capital Improvements", yearlyDetails.map(yd => -yd.expenseFFE)));
  rows.push(line("Free Cash Flow (FCF)", yearlyDetails.map((yd, i) => csvCfo[i] - yd.expenseFFE)));
  rows.push(line("  Less: Principal Payments", cashFlowData.map(cf => -cf.principalPayment)));
  rows.push(line("Free Cash Flow to Equity (FCFE)", yearlyDetails.map((yd, i) => csvCfo[i] - yd.expenseFFE - cashFlowData[i].principalPayment)));
  rows.push("");

  rows.push('"BALANCE SHEET"', "");
  rows.push(line("Cash & Equivalents", csvCloseCash));
  rows.push(line("Property (Net of Depreciation)", cashFlowData.map(cf => totalPropertyCost - cf.depreciation)));
  rows.push(line("Total Assets", csvCloseCash.map((cash, i) => cash + totalPropertyCost - cashFlowData[i].depreciation)));
  rows.push(line("Outstanding Debt", cashFlowData.map(cf => loan.loanAmount + cf.refinancingProceeds - cf.principalPayment)));
  rows.push(line("Total Liabilities", cashFlowData.map(cf => loan.loanAmount + cf.refinancingProceeds - cf.principalPayment)));
  rows.push(line("Equity Invested", yearlyDetails.map(() => loan.equityInvested)));
  rows.push(line("Total Equity", cashFlowData.map((cf, i) => {
    const ta = csvCloseCash[i] + totalPropertyCost - cf.depreciation;
    const tl = loan.loanAmount + cf.refinancingProceeds - cf.principalPayment;
    return ta - tl;
  })));
  rows.push("");

  rows.push('"INVESTMENT ANALYSIS"', "");
  rows.push(line("Equity Invested", yearlyDetails.map(() => loan.equityInvested)));
  rows.push(line("Total Property Cost", yearlyDetails.map(() => totalPropertyCost)));
  rows.push(line("Annual Revenue", yearlyDetails.map(y => y.revenueTotal)));
  rows.push(line("Annual ANOI", yearlyDetails.map(y => y.anoi)));
  rows.push(line("Debt Service", cashFlowData.map(cf => cf.debtService)));
  rows.push(line("Closing Cash Balance", csvCloseCash));

  downloadCSV(rows.join("\n"), customFilename || `${property.name.replace(/\s+/g, "_")}_Financial_Statements.csv`);
}

export function handleExcelExport(ctx: PropertyExportContext, customFilename?: string) {
  const { financials, property, global, projectionYears, fiscalYearStartMonth } = ctx;
  exportFullPropertyWorkbook(
    financials,
    property as unknown as LoanParams,
    [property] as unknown as LoanParams[],
    global as unknown as GlobalLoanParams,
    global,
    [{ property: property as unknown as LoanParams, data: financials }],
    property.name,
    projectionYears,
    global.modelStartDate,
    fiscalYearStartMonth,
    0,
    global?.companyName || "Portfolio",
    customFilename
  );
}

export async function exportChartPNG(ctx: PropertyExportContext, orientation: 'landscape' | 'portrait' = 'landscape', customFilename?: string) {
  const chartContainer = ctx.activeTab === "cashflow" ? ctx.cashFlowChartRef.current : ctx.incomeChartRef.current;
  if (!chartContainer) return;
  try {
    const width = orientation === 'landscape' ? 1200 : 800;
    const height = orientation === 'landscape' ? 600 : 1000;
    const domtoimage = (await import("dom-to-image-more")).default;
    const dataUrl = await domtoimage.toPng(chartContainer, {
      bgcolor: '#ffffff', quality: 1, width, height,
      style: { transform: 'scale(2)', transformOrigin: 'top left' }
    });
    const { saveDataUrl } = await import("@/lib/exports/saveFile");
    await saveDataUrl(dataUrl, customFilename || `${ctx.property.name.replace(/\s+/g, '_')}_chart_${orientation}.png`);
  } catch (error: unknown) {
    console.error('Error exporting chart:', error);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function exportTablePNG(ctx: PropertyExportContext, orientation: 'landscape' | 'portrait' = 'landscape', customFilename?: string) {
  const tableContainer = ctx.activeTab === "cashflow" ? ctx.cashFlowTableRef.current : ctx.incomeTableRef.current;
  if (!tableContainer) return;
  try {
    const scale = 2;
    const domtoimage = (await import("dom-to-image-more")).default;
    const dataUrl = await domtoimage.toPng(tableContainer, {
      bgcolor: '#ffffff', quality: 1,
      style: { transform: `scale(${scale})`, transformOrigin: 'top left' },
      width: tableContainer.scrollWidth * scale,
      height: tableContainer.scrollHeight * scale,
    });
    const { saveDataUrl } = await import("@/lib/exports/saveFile");
    await saveDataUrl(dataUrl, customFilename || `${ctx.property.name.replace(/\s+/g, '_')}_${ctx.activeTab}_table.png`);
  } catch (error: unknown) {
    console.error('Error exporting table:', error);
  }
}

export function handlePPTXExport(ctx: PropertyExportContext, customFilename?: string) {
  const { yearlyDetails, cashFlowData, yearlyChartData, years, startYear, projectionYears, property, global } = ctx;
  const { loan, acqYear, totalPropertyCost } = getLoanCalcs(ctx);
  const yearLabels = Array.from({ length: years }, (_, i) => `FY ${startYear + i}`);

  const pptxCfo = yearlyDetails.map((yd, i) =>
    yd.revenueTotal - (yd.totalExpenses - yd.expenseFFE) - cashFlowData[i].interestExpense - cashFlowData[i].taxLiability
  );
  const pptxNetChange = pptxCfo.map((cfo, i) => {
    const cfi = -totalPropertyCost * (i === acqYear ? 1 : 0) - yearlyDetails[i].expenseFFE + cashFlowData[i].exitValue;
    const cff = (i === acqYear ? loan.equityInvested : 0) +
      (i === acqYear && loan.loanAmount > 0 ? loan.loanAmount : 0) -
      cashFlowData[i].principalPayment + cashFlowData[i].refinancingProceeds;
    return cfo + cfi + cff;
  });
  const pptxCloseCash: number[] = [];
  let pptxRunCash = 0;
  for (const nc of pptxNetChange) { pptxRunCash += nc; pptxCloseCash.push(pptxRunCash); }

  const incomeRows = [
    { category: "REVENUE", values: yearlyDetails.map(() => 0), isHeader: true },
    { category: "Room Revenue", values: yearlyDetails.map(y => y.revenueRooms), indent: 1 },
    { category: "Event Revenue", values: yearlyDetails.map(y => y.revenueEvents), indent: 1 },
    { category: "F&B Revenue", values: yearlyDetails.map(y => y.revenueFB), indent: 1 },
    { category: "Other Revenue", values: yearlyDetails.map(y => y.revenueOther), indent: 1 },
    { category: "Total Revenue", values: yearlyDetails.map(y => y.revenueTotal), isBold: true },
    { category: "Total Operating Expenses", values: yearlyDetails.map(y => y.totalExpenses - y.expenseFFE - y.expenseTaxes), isBold: true },
    { category: "Gross Operating Profit (GOP)", values: yearlyDetails.map(y => y.gop), isBold: true },
    { category: "Total Management Fees", values: yearlyDetails.map(y => y.feeBase + y.feeIncentive) },
    { category: "Adjusted GOP (AGOP)", values: yearlyDetails.map(y => y.agop), isBold: true },
    { category: "Total Fixed Charges", values: yearlyDetails.map(y => y.expenseTaxes) },
    { category: "Net Operating Income (NOI)", values: yearlyDetails.map(y => y.noi), isBold: true },
    { category: "FF&E Reserve", values: yearlyDetails.map(y => y.expenseFFE), indent: 1 },
    { category: "Adjusted NOI (ANOI)", values: yearlyDetails.map(y => y.anoi), isBold: true },
  ];

  const cfRows = [
    { category: "Net Cash from Operating Activities", values: pptxCfo, isBold: true },
    { category: "FF&E Reserve / Capital Improvements", values: yearlyDetails.map(yd => -yd.expenseFFE), indent: 1 },
    { category: "Free Cash Flow (FCF)", values: yearlyDetails.map((yd, i) => pptxCfo[i] - yd.expenseFFE), isBold: true },
    { category: "Less: Principal Payments", values: cashFlowData.map(cf => -cf.principalPayment), indent: 1 },
    { category: "Free Cash Flow to Equity (FCFE)", values: yearlyDetails.map((yd, i) => pptxCfo[i] - yd.expenseFFE - cashFlowData[i].principalPayment), isBold: true },
  ];

  const bsRows = [
    { category: "ASSETS", values: yearlyDetails.map(() => 0), isHeader: true },
    { category: "Cash & Equivalents", values: pptxCloseCash, indent: 1 },
    { category: "Property (Net of Depreciation)", values: cashFlowData.map(cf => totalPropertyCost - cf.depreciation), indent: 1 },
    { category: "Total Assets", values: pptxCloseCash.map((cash, i) => cash + totalPropertyCost - cashFlowData[i].depreciation), isBold: true },
    { category: "LIABILITIES", values: yearlyDetails.map(() => 0), isHeader: true },
    { category: "Outstanding Debt", values: cashFlowData.map(cf => loan.loanAmount + cf.refinancingProceeds - cf.principalPayment), indent: 1 },
    { category: "Total Liabilities", values: cashFlowData.map(cf => loan.loanAmount + cf.refinancingProceeds - cf.principalPayment), isBold: true },
    { category: "EQUITY", values: yearlyDetails.map(() => 0), isHeader: true },
    { category: "Equity Invested", values: yearlyDetails.map(() => loan.equityInvested), indent: 1 },
    { category: "Retained Earnings", values: cashFlowData.map((cf, i) => {
      const ta = pptxCloseCash[i] + totalPropertyCost - cf.depreciation;
      const tl = loan.loanAmount + cf.refinancingProceeds - cf.principalPayment;
      return ta - tl - loan.equityInvested;
    }), indent: 1 },
    { category: "Total Equity", values: cashFlowData.map((cf, i) => {
      const ta = pptxCloseCash[i] + totalPropertyCost - cf.depreciation;
      const tl = loan.loanAmount + cf.refinancingProceeds - cf.principalPayment;
      return ta - tl;
    }), isBold: true },
  ];

  const investRows = [
    { category: "INVESTMENT SUMMARY", values: yearlyDetails.map(() => 0), isHeader: true },
    { category: "Equity Invested", values: yearlyDetails.map(() => loan.equityInvested), indent: 1 },
    { category: "Total Property Cost", values: yearlyDetails.map(() => totalPropertyCost), indent: 1 },
    { category: "Loan Amount", values: yearlyDetails.map(() => loan.loanAmount), indent: 1 },
    { category: "Annual Revenue", values: yearlyDetails.map(y => y.revenueTotal), indent: 1 },
    { category: "Annual ANOI", values: yearlyDetails.map(y => y.anoi), indent: 1 },
    { category: "Debt Service", values: cashFlowData.map(cf => cf.debtService), indent: 1 },
    { category: "Closing Cash Balance", values: pptxCloseCash, isBold: true },
  ];

  const fmt = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(v);
  const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const firstY = yearlyChartData[0];
  const kpiMetrics = firstY ? [
    { label: "Year 1 Total Revenue", value: fmt(firstY.Revenue) },
    { label: "Year 1 GOP", value: fmt(firstY.GOP) },
    { label: "Year 1 ANOI", value: fmt(firstY.ANOI) },
    { label: "Total Equity Invested", value: fmt(loan.equityInvested) },
    { label: "Total Property Cost", value: fmt(totalPropertyCost) },
    { label: "Loan Amount", value: fmt(loan.loanAmount) },
    { label: "LTV", value: fmtPct(loan.loanAmount / totalPropertyCost) },
    { label: "ANOI Margin (Year 1)", value: firstY.Revenue > 0 ? fmtPct(firstY.ANOI / firstY.Revenue) : "—" },
  ] : [];

  exportPropertyPPTX({
    propertyName: property.name,
    projectionYears,
    getFiscalYear: (i: number) => `FY ${startYear + i}`,
    incomeData: { years: yearLabels, rows: incomeRows },
    cashFlowData: { years: yearLabels, rows: cfRows },
    balanceSheetData: { years: yearLabels, rows: bsRows },
    investmentData: { years: yearLabels, rows: investRows },
    kpiMetrics,
  }, global?.companyName || APP_BRAND_NAME, customFilename, ctx.brandingData?.themeColors ?? undefined);
}

export function handleExport(ctx: PropertyExportContext, exportType: string, orientation: 'landscape' | 'portrait', version: ExportVersion, customFilename?: string) {
  if (exportType === 'pdf') {
    return exportUnifiedPDF(ctx, orientation, version, customFilename);
  } else if (exportType === 'chart') {
    return exportChartPNG(ctx, orientation, customFilename);
  } else if (exportType === 'xlsx') {
    handleExcelExport(ctx, customFilename);
  } else if (exportType === 'pptx') {
    handlePPTXExport(ctx, customFilename);
  }
}

export function buildPremiumExportPayload(ctx: PropertyExportContext, version: ExportVersion): PremiumExportPayload {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { property, global, yearlyDetails, cashFlowData, yearlyChartData, years, projectionYears } = ctx;
  const { loan, acqYear, totalPropertyCost } = getLoanCalcs(ctx);
  const depYears = resolveExportDepreciationYears(ctx);
  const yrLabels = yearlyChartData.map((d) => d.year);
  const isShort = version === "short";

  const incomeRows = buildIncomeRows(ctx, isShort);
  const { cfo, cfi, cff, netChange, openCash, closeCash } = computeCashFlowVectors(ctx, loan, acqYear, totalPropertyCost);
  const cfRows = buildCashFlowRows(ctx, cfo, cfi, cff, netChange, openCash, closeCash, acqYear, totalPropertyCost, loan, isShort);

  const bsRows: ExportRowMeta[] = [];
  let cumLoanBalance = loan.loanAmount;
  bsRows.push({ category: "ASSETS", values: yearlyDetails.map(() => 0), isHeader: true });
  bsRows.push({ category: "Cash & Equivalents", values: closeCash, indent: 1 });
  bsRows.push({ category: "Property (Net Book Value)", values: yearlyDetails.map((_, i) => {
    const depPerYear = totalPropertyCost / depYears;
    return Math.max(totalPropertyCost - depPerYear * (i + 1), 0);
  }), indent: 1 });
  bsRows.push({ category: "Total Assets", values: yearlyDetails.map((_, i) => {
    const depPerYear = totalPropertyCost / depYears;
    return closeCash[i] + Math.max(totalPropertyCost - depPerYear * (i + 1), 0);
  }), isBold: true });
  bsRows.push({ category: "LIABILITIES", values: yearlyDetails.map(() => 0), isHeader: true });
  const loanBalances = yearlyDetails.map((_: any, i: number) => {
    if (i === 0) cumLoanBalance = loan.loanAmount;
    if (i > 0) cumLoanBalance -= cashFlowData[i - 1].principalPayment;
    return Math.max(cumLoanBalance - cashFlowData[i].principalPayment, 0);
  });
  bsRows.push({ category: "Loan Balance", values: loanBalances, indent: 1 });
  bsRows.push({ category: "Total Liabilities", values: loanBalances, isBold: true });
  bsRows.push({ category: "EQUITY", values: yearlyDetails.map(() => 0), isHeader: true });
  bsRows.push({ category: "Total Equity", values: yearlyDetails.map((_: any, i: number) => {
    const depPerYear = totalPropertyCost / depYears;
    const totalAssets = closeCash[i] + Math.max(totalPropertyCost - depPerYear * (i + 1), 0);
    return totalAssets - loanBalances[i];
  }), isBold: true });

  const investRows: ExportRowMeta[] = [];
  investRows.push({ category: "INVESTMENT SUMMARY", values: yearlyDetails.map(() => 0), isHeader: true });
  investRows.push({ category: "Equity Invested", values: yearlyDetails.map(() => loan.equityInvested), indent: 1 });
  investRows.push({ category: "Total Property Cost", values: yearlyDetails.map(() => totalPropertyCost), indent: 1 });
  investRows.push({ category: "Loan Amount", values: yearlyDetails.map(() => loan.loanAmount), indent: 1 });
  if (yearlyDetails.length > 0) {
    investRows.push({ category: "Annual Revenue", values: yearlyDetails.map(y => y.revenueTotal), indent: 1 });
    investRows.push({ category: "Annual NOI", values: yearlyDetails.map(y => y.noi), indent: 1 });
    investRows.push({ category: "Annual ANOI", values: yearlyDetails.map(y => y.anoi), indent: 1 });
    investRows.push({ category: "Annual Cash Flow", values: yearlyChartData.map(d => d.CashFlow), indent: 1 });
    investRows.push({ category: "Debt Service", values: cashFlowData.map(cf => cf.debtService), indent: 1 });
  }
  investRows.push({ category: "Closing Cash Balance", values: closeCash, isBold: true });

  const mapRows = (rows: Array<{ category: string; values: (string | number)[]; indent?: number; isBold?: boolean; isHeader?: boolean; isItalic?: boolean; format?: string }>) => rows.map(r => ({
    category: r.category, values: r.values, indent: r.indent, isBold: r.isBold,
    isHeader: r.isHeader, isItalic: r.isItalic, format: r.format,
  }));

  const stmtCfg = loadExportConfig().statements;

  return {
    entityName: property.name,
    companyName: global?.companyName || APP_BRAND_NAME,
    statementType: ctx.activeTab === "income" ? "Income Statement" : ctx.activeTab === "cashflow" ? "Cash Flow Statement" : "Balance Sheet",
    years: yrLabels,
    statements: [
      { title: `${property.name} — Income Statement`, years: yrLabels, rows: mapRows(incomeRows) },
      { title: `${property.name} — Cash Flow Statement`, years: yrLabels, rows: mapRows(cfRows) },
      { title: `${property.name} — Balance Sheet`, years: yrLabels, rows: mapRows(bsRows) },
      { title: `${property.name} — Investment Analysis`, years: yrLabels, rows: mapRows(investRows) },
    ],
    metrics: [
      { label: "Total Revenue (Year 1)", value: yearlyChartData[0] ? formatMoney(yearlyChartData[0].Revenue) : "—" },
      { label: "GOP (Year 1)", value: yearlyChartData[0] ? formatMoney(yearlyChartData[0].GOP) : "—" },
      { label: "NOI (Year 1)", value: yearlyChartData[0] ? formatMoney(yearlyChartData[0].NOI) : "—" },
      { label: "Total Property Cost", value: formatMoney(totalPropertyCost) },
      { label: "Equity Invested", value: formatMoney(loan.equityInvested) },
    ],
    densePagination: stmtCfg.densePagination,
  };
}
