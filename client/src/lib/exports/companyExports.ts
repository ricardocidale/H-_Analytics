import { format } from "date-fns";
import { captureToPng } from "@/lib/exports/domCapture";
import { drawLineChart } from "@/lib/exports/pdfChartDrawer";
import { exportCompanyPPTX } from "@/lib/exports/pptxExport";
import { downloadCSV } from "@/lib/exports/csvExport";
import { saveFile, saveDataUrl } from "@/lib/exports/saveFile";
import { buildFinancialTableConfig, addFooters, drawTitle, drawSubtitle, drawSubtitleRow } from "@/lib/exports/pdfHelpers";
import { PAGE_DIMS, type ThemeColor, buildBrandPalette } from "@/lib/exports/exportStyles";
import {
} from "@/lib/exports/excelExport";
import { MONTHS_PER_YEAR } from "@/lib/constants";

const EXPORT_BG = '#ffffff';

export const exportCompanyPDF = async (
  type: 'income' | 'cashflow' | 'balance',
  data: { years: number[]; rows: any[] },
  global: any,
  projectionYears: number,
  yearlyChartData: any[],
  orientation: 'landscape' | 'portrait' = 'landscape',
  customFilename?: string,
  themeColors?: ThemeColor[],
  allStatements?: {
    income: { years: number[]; rows: any[] };
    cashflow: { years: number[]; rows: any[] };
    balance: { years: number[]; rows: any[] };
  }
) => {
  const jsPDF = (await import("jspdf")).default;
  const autoTable = (await import("jspdf-autotable")).default;
  const dims = orientation === "landscape"
    ? { w: PAGE_DIMS.LANDSCAPE_W, h: PAGE_DIMS.LANDSCAPE_H }
    : { w: PAGE_DIMS.PORTRAIT_W, h: PAGE_DIMS.PORTRAIT_H };
  const doc = new jsPDF({ orientation, unit: 'mm', format: [dims.w, dims.h] });
  const brand = buildBrandPalette(themeColors);
  const pageWidth = dims.w;
  const chartWidth = pageWidth - 28;
  const companyName = global?.companyName || "Management Company";
  const entityTag = `${companyName} \u2014 Management Company`;

  const statements: { key: 'income' | 'cashflow' | 'balance'; title: string; chartTitle: string; chartSubtitle: string; chartSeries: { name: string; dataKey: string; color: string }[] }[] = [
    {
      key: 'income',
      title: 'Income Statement',
      chartTitle: `${companyName} \u2014 Income Statement Performance Trend`,
      chartSubtitle: `${projectionYears}-Year Revenue, Service Fees, Incentive Fees, EBITDA, and Net Income Trend`,
      chartSeries: [
        { name: 'Revenue', dataKey: 'Revenue', color: `#${brand.LINE_HEX[0]}` },
        { name: 'Service Fees', dataKey: 'BaseFees', color: `#${brand.LINE_HEX[1] || brand.SECONDARY_HEX}` },
        { name: 'Incentive Fees', dataKey: 'IncentiveFees', color: `#${brand.LINE_HEX[2] || brand.PRIMARY_HEX}` },
        { name: 'Operating Income', dataKey: 'OperatingIncome', color: `#${brand.LINE_HEX[3] || brand.ACCENT_HEX}` },
        { name: 'Net Income', dataKey: 'NetIncome', color: `#${brand.LINE_HEX[4] || brand.MUTED_HEX}` },
      ],
    },
    {
      key: 'cashflow',
      title: 'Cash Flow Statement',
      chartTitle: `${companyName} \u2014 Cash Flow Performance Trend`,
      chartSubtitle: `${projectionYears}-Year Net Income, Funding, Cash Flow, and Ending Cash Trend`,
      chartSeries: [
        { name: 'Net Income', dataKey: 'NetIncome', color: `#${brand.LINE_HEX[0]}` },
        { name: 'Funding Received', dataKey: 'Funding', color: `#${brand.LINE_HEX[1] || brand.SECONDARY_HEX}` },
        { name: 'Cash Flow', dataKey: 'CashFlow', color: `#${brand.LINE_HEX[2] || brand.PRIMARY_HEX}` },
        { name: 'Ending Cash', dataKey: 'EndingCash', color: `#${brand.LINE_HEX[3] || brand.ACCENT_HEX}` },
      ],
    },
    {
      key: 'balance',
      title: 'Balance Sheet',
      chartTitle: `${companyName} \u2014 Balance Sheet Trend`,
      chartSubtitle: `${projectionYears}-Year Assets, Liabilities, and Equity Trend`,
      chartSeries: [
        { name: 'Total Assets', dataKey: 'Assets', color: `#${brand.LINE_HEX[0]}` },
        { name: 'Total Liabilities', dataKey: 'Liabilities', color: `#${brand.LINE_HEX[1] || brand.SECONDARY_HEX}` },
        { name: 'Total Equity', dataKey: 'Equity', color: `#${brand.LINE_HEX[2] || brand.PRIMARY_HEX}` },
      ],
    },
  ];

  const statementsToRender = allStatements
    ? statements
    : statements.filter(s => s.key === type);

  let isFirstPage = true;
  for (const stmt of statementsToRender) {
    const stmtData = allStatements ? allStatements[stmt.key] : data;
    if (!isFirstPage) doc.addPage();
    isFirstPage = false;

    drawTitle(doc, `${companyName} \u2014 ${stmt.title}`, 14, 15);
    drawSubtitleRow(doc,
      `${projectionYears}-Year Projection (${stmtData.years[0]} \u2013 ${stmtData.years[stmtData.years.length - 1]})`,
      entityTag, 14, 22, pageWidth);
    drawSubtitle(doc, `Generated: ${format(new Date(), 'MMM d, yyyy')}`, 14, 27);

    const tableConfig = buildFinancialTableConfig(stmtData.years, stmtData.rows, orientation, 32);
    autoTable(doc, tableConfig);

    if (yearlyChartData && yearlyChartData.length > 0) {
      doc.addPage();
      drawTitle(doc, stmt.chartTitle, 14, 15, { fontSize: 16 });
      drawSubtitleRow(doc, stmt.chartSubtitle, entityTag, 14, 22, pageWidth);

      drawLineChart({
        doc,
        x: 14,
        y: 30,
        width: chartWidth,
        height: 150,
        title: `Management Company Performance (${projectionYears}-Year Projection)`,
        series: stmt.chartSeries.map(s => ({
          name: s.name,
          data: yearlyChartData.map((d: any) => ({ label: String(d.year), value: d[s.dataKey] ?? 0 })),
          color: s.color,
        })),
        brand,
      });
    }
  }

  addFooters(doc, companyName);
  const pdfBlob = doc.output("blob");
  const filename = allStatements
    ? `${companyName} - Financial Statements.pdf`
    : `${companyName} - ${statements.find(s => s.key === type)?.title || 'Financial Statement'}.pdf`;
  await saveFile(pdfBlob, customFilename || filename);
};

export const exportCompanyCSV = (
  type: 'income' | 'cashflow' | 'balance',
  data: { years: number[]; rows: any[] },
  companyName?: string,
  customFilename?: string
) => {
  const headers = ['Category', ...data.years.map(String)];
  const csvRows = [
    headers.join(','),
    ...data.rows.map(row => [
      `"${(row.indent ? '  '.repeat(row.indent) : '') + row.category}"`,
      ...row.values.map((v: number) => v.toFixed(2))
    ].join(','))
  ];

  const csvContent = csvRows.join('\n');
  const name = companyName || "Management Company";
  const typeLabel = type === 'income' ? 'Income Statement' : type === 'cashflow' ? 'Cash Flow' : 'Balance Sheet';
  downloadCSV(csvContent, customFilename || `${name} - ${typeLabel}.csv`);
};

export const exportCompanyAllStatementsCSV = (
  incomeData: { years: number[]; rows: any[] },
  cashFlowData: { years: number[]; rows: any[] },
  balanceData: { years: number[]; rows: any[] },
  companyName?: string,
  customFilename?: string
) => {
  const name = companyName || "Management Company";
  const headers = ['Category', ...incomeData.years.map(String)].join(',');

  const buildRows = (data: { years: number[]; rows: any[] }) =>
    data.rows.map(row =>
      [`"${(row.indent ? '  '.repeat(row.indent) : '') + row.category}"`, ...row.values.map((v: number) => v.toFixed(2))].join(',')
    );

  const sections: Array<{ label: string; data: typeof incomeData }> = [
    { label: 'INCOME STATEMENT', data: incomeData },
    { label: 'CASH FLOW STATEMENT', data: cashFlowData },
    { label: 'BALANCE SHEET', data: balanceData },
  ];

  const lines: string[] = [headers, ''];
  for (const section of sections) {
    lines.push(`"${section.label}"`, '');
    lines.push(...buildRows(section.data));
    lines.push('');
  }

  downloadCSV(lines.join('\n'), customFilename || `${name} - Financial Statements.csv`);
};

export const handleExcelExport = async (
  activeTab: string,
  financials: any[],
  projectionYears: number,
  global: any,
  fiscalYearStartMonth: number,
  customFilename?: string
) => {
  if (!global) return;
  await exportCompanyFullWorkbook(financials, projectionYears, global, fiscalYearStartMonth, customFilename);
};

async function exportCompanyFullWorkbook(
  data: any[],
  years: number,
  global: any,
  fiscalYearStartMonth: number,
  customFilename?: string
) {
  const { getFiscalYearForModelYear } = await import("@/lib/financialEngine");
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const companyName = global?.companyName || "Management Company";
  const modelStartDate = global.modelStartDate;

  const yearLabels: string[] = [];
  for (let y = 0; y < years; y++) {
    yearLabels.push(String(getFiscalYearForModelYear(modelStartDate, fiscalYearStartMonth, y)));
  }

  const yearlyData: any[] = [];
  for (let y = 0; y < years; y++) {
    const yearSlice = data.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
    if (yearSlice.length === 0) continue;
    const vendorCostByCategory: Record<string, number> = {};
    yearSlice.forEach((m: any) => {
      if (m.costOfCentralizedServices) {
        for (const [catName, cat] of Object.entries(m.costOfCentralizedServices.byCategory) as Array<[string, { serviceModel: string; vendorCost: number }]>) {
          if (cat.serviceModel === 'centralized') {
            vendorCostByCategory[catName] = (vendorCostByCategory[catName] ?? 0) + cat.vendorCost;
          }
        }
      }
    });
    yearlyData.push({
      baseFee: yearSlice.reduce((a: number, m: any) => a + m.baseFeeRevenue, 0),
      incentiveFee: yearSlice.reduce((a: number, m: any) => a + m.incentiveFeeRevenue, 0),
      totalRevenue: yearSlice.reduce((a: number, m: any) => a + m.totalRevenue, 0),
      totalVendorCost: yearSlice.reduce((a: number, m: any) => a + m.totalVendorCost, 0),
      grossProfit: yearSlice.reduce((a: number, m: any) => a + m.grossProfit, 0),
      vendorCostByCategory,
      partnerComp: yearSlice.reduce((a: number, m: any) => a + m.partnerCompensation, 0),
      staffComp: yearSlice.reduce((a: number, m: any) => a + m.staffCompensation, 0),
      officeLease: yearSlice.reduce((a: number, m: any) => a + m.officeLease, 0),
      profServices: yearSlice.reduce((a: number, m: any) => a + m.professionalServices, 0),
      techInfra: yearSlice.reduce((a: number, m: any) => a + m.techInfrastructure, 0),
      businessInsurance: yearSlice.reduce((a: number, m: any) => a + m.businessInsurance, 0),
      
      travel: yearSlice.reduce((a: number, m: any) => a + m.travelCosts, 0),
      itLicensing: yearSlice.reduce((a: number, m: any) => a + m.itLicensing, 0),
      marketing: yearSlice.reduce((a: number, m: any) => a + m.marketing, 0),
      miscOps: yearSlice.reduce((a: number, m: any) => a + m.miscOps, 0),
      totalExpenses: yearSlice.reduce((a: number, m: any) => a + m.totalExpenses, 0),
      netIncome: yearSlice.reduce((a: number, m: any) => a + m.netIncome, 0),
      capitalRaiseFunding: yearSlice.reduce((a: number, m: any) => a + m.capitalRaiseFunding, 0),
      cashFlow: yearSlice.reduce((a: number, m: any) => a + m.cashFlow, 0),
      fundingInterestExpense: yearSlice.reduce((a: number, m: any) => a + (m.fundingInterestExpense ?? 0), 0),
      fundingInterestPayment: yearSlice.reduce((a: number, m: any) => a + (m.fundingInterestPayment ?? 0), 0),
      cumulativeAccruedInterest: yearSlice.length > 0 ? (yearSlice[yearSlice.length - 1].cumulativeAccruedInterest ?? 0) : 0,
    });
  }

  const hasVendorCosts = yearlyData.some((y: any) => y.totalVendorCost > 0);
  const centralizedCategories: string[] = [];
  if (hasVendorCosts) {
    const sample = yearlyData.find((y: any) => Object.keys(y.vendorCostByCategory).length > 0);
    if (sample) centralizedCategories.push(...Object.keys(sample.vendorCostByCategory));
  }

  const addSheet = async (sheetName: string, rows: (string | number)[][]) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [{ wch: 38 }, ...yearLabels.map(() => ({ wch: 16 }))];
    const { applyCurrencyFormat, applyHeaderStyle } = await import("@/lib/exports/excel/helpers");
    applyCurrencyFormat(ws, rows);
    applyHeaderStyle(ws, rows);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  };

  const isRows: (string | number)[][] = [
    ["Income Statement", ...yearLabels],
    [],
    ["REVENUE"],
    ["  Base Management Fees", ...yearlyData.map(y => y.baseFee)],
    ["  Incentive Management Fees", ...yearlyData.map(y => y.incentiveFee)],
    ["Total Revenue", ...yearlyData.map(y => y.totalRevenue)],
    [],
  ];
  if (hasVendorCosts) {
    isRows.push(["COST OF CENTRALIZED SERVICES"]);
    centralizedCategories.forEach(catName => {
      isRows.push([`  ${catName} (Vendor Cost)`, ...yearlyData.map(y => y.vendorCostByCategory[catName] ?? 0)]);
    });
    isRows.push(["Total Vendor Cost", ...yearlyData.map(y => y.totalVendorCost)]);
    isRows.push([]);
    isRows.push(["Gross Profit", ...yearlyData.map(y => y.grossProfit)]);
    isRows.push([]);
  }
  const hasInterest = yearlyData.some((y: any) => y.fundingInterestExpense > 0);
  isRows.push(
    ["OPERATING EXPENSES"],
    ["  Partner Compensation", ...yearlyData.map(y => y.partnerComp)],
    ["  Staff Compensation", ...yearlyData.map(y => y.staffComp)],
    ["  Office Lease", ...yearlyData.map(y => y.officeLease)],
    ["  Professional Services", ...yearlyData.map(y => y.profServices)],
    ["  Technology Infrastructure", ...yearlyData.map(y => y.techInfra)],
    ["  Business Insurance", ...yearlyData.map(y => y.businessInsurance)],
    
    ["  Travel Costs", ...yearlyData.map(y => y.travel)],
    ["  IT Licensing", ...yearlyData.map(y => y.itLicensing)],
    ["  Marketing", ...yearlyData.map(y => y.marketing)],
    ["  Miscellaneous Operations", ...yearlyData.map(y => y.miscOps)],
    ["Total Expenses", ...yearlyData.map(y => y.totalExpenses)],
    [],
    [hasInterest ? "Operating Income (EBITDA)" : "Net Income", ...yearlyData.map(y => {
      const ebitda = y.totalRevenue - y.totalVendorCost - y.totalExpenses;
      return hasInterest ? ebitda : y.netIncome;
    })],
  );
  if (hasInterest) {
    isRows.push(
      [],
      ["Interest Expense", ...yearlyData.map(y => -y.fundingInterestExpense)],
      ["Pre-Tax Income", ...yearlyData.map(y => {
        const ebitda = y.totalRevenue - y.totalVendorCost - y.totalExpenses;
        return ebitda - y.fundingInterestExpense;
      })],
      ["Tax Expense", ...yearlyData.map(y => {
        const ebitda = y.totalRevenue - y.totalVendorCost - y.totalExpenses;
        const preTax = ebitda - y.fundingInterestExpense;
        const taxRate = global?.companyTaxRate ?? 0;
        return preTax > 0 ? -(preTax * taxRate) : 0;
      })],
      ["Net Income", ...yearlyData.map(y => y.netIncome)],
    );
  }
  isRows.push(
    [],
    ["FUNDING"],
    ["  Funding Received", ...yearlyData.map(y => y.capitalRaiseFunding)],
    ["Cash Flow", ...yearlyData.map(y => y.cashFlow)],
  );
  await addSheet("Income Statement", isRows);

  let cumulative = 0;
  const openingCash = yearlyData.map((_: any, i: number) => {
    if (i === 0) return 0;
    let cum = 0;
    for (let j = 0; j < i; j++) cum += yearlyData[j].cashFlow;
    return cum;
  });
  const closingCash = yearlyData.map((y: any) => {
    cumulative += y.cashFlow;
    return cumulative;
  });
  const hasCFVendorCosts = yearlyData.some((y: any) => y.totalVendorCost > 0);

  const cfRows: (string | number)[][] = [
    ["Cash Flow Statement", ...yearLabels],
    [],
    ["CASH FLOW FROM OPERATING ACTIVITIES"],
    ["  Cash Received from Management Fees", ...yearlyData.map(y => y.totalRevenue)],
    ["    Base Management Fees", ...yearlyData.map(y => y.baseFee)],
    ["    Incentive Management Fees", ...yearlyData.map(y => y.incentiveFee)],
  ];
  if (hasCFVendorCosts) {
    cfRows.push(["  Cash Paid to Service Vendors", ...yearlyData.map(y => -y.totalVendorCost)]);
  }
  cfRows.push(
    ["  Cash Paid for Operating Expenses", ...yearlyData.map(y => -y.totalExpenses)],
    ["    Compensation", ...yearlyData.map(y => -(y.partnerComp + y.staffComp))],
    ["    Fixed Overhead", ...yearlyData.map(y => -(y.officeLease + y.profServices + y.techInfra + y.businessInsurance))],
    ["    Variable Costs", ...yearlyData.map(y => -(y.travel + y.itLicensing + y.marketing + y.miscOps))],
  );
  const cfHasInterest = yearlyData.some((y: any) => y.fundingInterestExpense > 0);
  if (cfHasInterest) {
    cfRows.push(
      ["  Add Back: Interest Expense", ...yearlyData.map(y => y.fundingInterestExpense)],
    );
  }
  cfRows.push(
    ["Net Cash from Operating Activities", ...yearlyData.map(y => {
      const opsCF = y.netIncome + y.fundingInterestExpense;
      return opsCF;
    })],
    [],
    ["CASH FLOW FROM FINANCING ACTIVITIES"],
    ["  Funding Received", ...yearlyData.map(y => y.capitalRaiseFunding)],
  );
  if (cfHasInterest) {
    cfRows.push(
      ["  Interest Paid on Notes", ...yearlyData.map(y => -y.fundingInterestPayment)],
    );
  }
  cfRows.push(
    ["Net Cash from Financing Activities", ...yearlyData.map(y => y.capitalRaiseFunding - y.fundingInterestPayment)],
    [],
    ["Net Increase (Decrease) in Cash", ...yearlyData.map(y => y.cashFlow)],
    ["Opening Cash Balance", ...openingCash],
    ["Closing Cash Balance", ...closingCash],
    [],
    ["FREE CASH FLOW"],
    ["  Net Cash from Operating Activities", ...yearlyData.map(y => y.netIncome + y.fundingInterestExpense)],
    ["  Free Cash Flow (FCF)", ...yearlyData.map(y => y.netIncome + y.fundingInterestExpense)],
    ["  Less: Funding Interest Payments", ...yearlyData.map(y => -y.fundingInterestPayment)],
    ["  Free Cash Flow to Equity (FCFE)", ...yearlyData.map(y => y.netIncome + y.fundingInterestExpense - y.fundingInterestPayment)],
  );
  await addSheet("Cash Flow", cfRows);

  const totalSafeFunding = (global.capitalRaise1Amount || 0) + (global.capitalRaise2Amount || 0);
  const cumRetainedEarnings = yearlyData.map((_: any, i: number) => {
    let cum = 0;
    for (let j = 0; j <= i; j++) cum += yearlyData[j].netIncome;
    return cum;
  });
  const bsHasAccruedInterest = yearlyData.some((y: any) => y.cumulativeAccruedInterest > 0);
  const totalLiabilitiesByYear = yearlyData.map((y: any) => totalSafeFunding + y.cumulativeAccruedInterest);
  const totalEquityByYear = cumRetainedEarnings;
  const bsRows: (string | number)[][] = [
    [`Balance Sheet`, ...yearLabels],
    [],
    ["ASSETS"],
    ["  Cash & Cash Equivalents", ...closingCash],
    ["Total Assets", ...closingCash],
    [],
    ["LIABILITIES"],
    ["  Funding Notes Payable", ...yearlyData.map(() => totalSafeFunding)],
  ];
  if (bsHasAccruedInterest) {
    bsRows.push(
      ["  Accrued Interest on Notes", ...yearlyData.map(y => y.cumulativeAccruedInterest)],
    );
  }
  bsRows.push(
    ["Total Liabilities", ...totalLiabilitiesByYear],
    [],
    ["EQUITY"],
    ["  Retained Earnings", ...cumRetainedEarnings],
    ["Total Equity", ...totalEquityByYear],
    [],
    ["Total Liabilities + Equity", ...totalLiabilitiesByYear.map((l: number, i: number) => l + totalEquityByYear[i])],
  );
  await addSheet("Balance Sheet", bsRows);

  const cumRevenue = yearlyData.map((_: any, i: number) => {
    let cum = 0;
    for (let j = 0; j <= i; j++) cum += yearlyData[j].totalRevenue;
    return cum;
  });
  const cumNetIncome = yearlyData.map((_: any, i: number) => {
    let cum = 0;
    for (let j = 0; j <= i; j++) cum += yearlyData[j].netIncome;
    return cum;
  });
  const cumCashFlow = yearlyData.map((_: any, i: number) => {
    let cum = 0;
    for (let j = 0; j <= i; j++) cum += yearlyData[j].cashFlow;
    return cum;
  });

  const iaRows: (string | number)[][] = [
    ["Investment Analysis", ...yearLabels],
    [],
    ["COMPANY METRICS"],
    ["  Total Revenue", ...yearlyData.map(y => y.totalRevenue)],
    ["  Total Expenses", ...yearlyData.map(y => y.totalExpenses)],
    ["  Net Income", ...yearlyData.map(y => y.netIncome)],
    ["  Net Income Margin (%)", ...yearlyData.map(y => y.totalRevenue > 0 ? (y.netIncome / y.totalRevenue) * 100 : 0)],
    [],
    ["CASH POSITION"],
    ["  Annual Cash Flow", ...yearlyData.map(y => y.cashFlow)],
    ["  Closing Cash Balance", ...closingCash],
    ["  Funding Received", ...yearlyData.map(y => y.capitalRaiseFunding)],
    [],
    ["CUMULATIVE METRICS"],
    ["  Cumulative Revenue", ...cumRevenue],
    ["  Cumulative Net Income", ...cumNetIncome],
    ["  Cumulative Cash Flow", ...cumCashFlow],
  ];
  await addSheet("Investment Analysis", iaRows);

  const safeName = companyName.replace(/[^a-zA-Z0-9 &\-]/g, "").substring(0, 60);
  const xlData = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const xlBlob = new Blob([xlData], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  await saveFile(xlBlob, customFilename || `${safeName} - Management Company Financial Statements.xlsx`);
}

export const exportChartPNG = async (
  chartRef: React.RefObject<HTMLDivElement | null>,
  orientation: 'landscape' | 'portrait' = 'landscape',
  companyName?: string,
  customFilename?: string
) => {
  if (!chartRef.current) return;

  try {
    const scale = 2;
    const width = orientation === 'landscape' ? 1200 : 800;
    const height = orientation === 'landscape' ? 600 : 1000;

    const dataUrl = await captureToPng(chartRef.current, {
      bgcolor: EXPORT_BG,
      quality: 1,
      width: width,
      height: height,
      scale,
      style: {
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
      }
    });

    const name = companyName || "Management Company";
    await saveDataUrl(dataUrl, customFilename || `${name} - Performance Chart.png`);
  } catch (error: unknown) {
    console.error('Error exporting chart:', error);
  }
};

export const exportTablePNG = async (
  tableRef: React.RefObject<HTMLDivElement | null>,
  activeTab: string,
  companyName?: string,
  customFilename?: string
) => {
  if (!tableRef.current) return;
  const hiddenRows: HTMLElement[] = [];
  try {
    const expandableRows = tableRef.current.querySelectorAll<HTMLElement>('[data-expandable-row="true"]');
    expandableRows.forEach(row => {
      if (row.style.display !== 'none') {
        hiddenRows.push(row);
        row.style.display = 'none';
      }
    });

    const scale = 2;
    const dataUrl = await captureToPng(tableRef.current, {
      bgcolor: EXPORT_BG,
      quality: 1,
      scale,
      width: tableRef.current.scrollWidth * scale,
      height: tableRef.current.scrollHeight * scale,
    });
    const name = companyName || "Management Company";
    const tabLabel = activeTab === 'income' ? 'Income Statement' : activeTab === 'cashflow' ? 'Cash Flow' : 'Balance Sheet';
    await saveDataUrl(dataUrl, customFilename || `${name} - ${tabLabel}.png`);
  } catch (error: unknown) {
    console.error('Error exporting table:', error);
  } finally {
    hiddenRows.forEach(row => {
      row.style.display = '';
    });
  }
};

export const handlePPTXExport = (
  global: any,
  projectionYears: number,
  getFiscalYear: (i: number) => string,
  incomeData: any,
  cashFlowData: any,
  balanceData: any,
  customFilename?: string,
  themeColors?: ThemeColor[],
  kpiMetrics?: { label: string; value: string }[]
) => {
  if (!global) return;
  const co = global?.companyName || "Management Company";
  exportCompanyPPTX({
    projectionYears,
    getFiscalYear,
    companyName: co,
    kpiMetrics,
    incomeData: { years: incomeData.years.map(String), rows: incomeData.rows },
    cashFlowData: { years: cashFlowData.years.map(String), rows: cashFlowData.rows },
    balanceSheetData: { years: balanceData.years.map(String), rows: balanceData.rows },
  }, co, customFilename, themeColors);
};
