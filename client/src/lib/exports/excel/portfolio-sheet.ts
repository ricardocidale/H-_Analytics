import {
  MonthlyFinancials,
  CompanyMonthlyFinancials,
  getFiscalYearForModelYear
} from "@/lib/financialEngine";
import { LoanParams } from "@/lib/financial/loanCalculations";
import { propertyEquityInvested, acquisitionYearIndex } from "@/lib/financial/equityCalculations";
import { propertyPPE } from "@/lib/financial/portfolio-helpers";
import { MONTHS_PER_YEAR } from "@/lib/constants";

type PortfolioLoanParams = LoanParams & { operationsStartDate?: string | null };
import {
  applyCurrencyFormat,
  applyHeaderStyle,
  setColumnWidths,
  downloadWorkbook,
} from "./helpers";

/**
 * Download a Balance Sheet as Excel — either for a single property or the
 * consolidated portfolio.
 */
export async function exportPropertyBalanceSheet(
  properties: PortfolioLoanParams[],
  globalAssumptions: Record<string, unknown>,
  allProFormas: { property: PortfolioLoanParams; data: MonthlyFinancials[] }[],
  years: number,
  modelStartDate: string,
  fiscalYearStartMonth: number,
  title: string,
  propertyIndex?: number
) {
  const XLSX = await import("xlsx");
  const yearLabels: string[] = [];
  for (let y = 0; y < years; y++) {
    yearLabels.push(String(getFiscalYearForModelYear(modelStartDate, fiscalYearStartMonth, y)));
  }

  const headers = ["Balance Sheet", ...yearLabels];

  const propertiesToShow =
    propertyIndex !== undefined
      ? [{ prop: properties[propertyIndex], idx: propertyIndex }]
      : properties.map((prop, idx) => ({ prop, idx }));

  const yearlyAssets: number[][] = [];

  for (let yearIdx = 0; yearIdx < years; yearIdx++) {
    let totalPropertyValue = 0;
    let totalAccDepreciation = 0;
    let totalCashReserves = 0;
    let totalDebt = 0;
    let totalEquity = 0;
    let totalRetainedEarnings = 0;
    let totalRefiProceeds = 0;

    const monthsToInclude = (yearIdx + 1) * MONTHS_PER_YEAR;

    propertiesToShow.forEach(({ prop, idx }) => {
      const proForma = allProFormas[idx]?.data || [];
      const relevantMonths = proForma.slice(0, monthsToInclude);

      const acqYear = acquisitionYearIndex(
        prop.acquisitionDate ?? null,
        prop.operationsStartDate ?? null,
        modelStartDate,
      );
      if (yearIdx < acqYear) return;

      const totalPropValue = propertyPPE(prop.purchasePrice, prop.buildingImprovements);
      totalPropertyValue += totalPropValue;

      const accDep = relevantMonths.reduce((sum, m) => sum + m.depreciationExpense, 0);
      totalAccDepreciation += accDep;

      const operatingReserve = prop.operatingReserve ?? 0;
      totalCashReserves += operatingReserve;

      const equityInvested = propertyEquityInvested(prop);
      totalEquity += equityInvested;

      const lastMonthIdx = monthsToInclude - 1;
      const debtOutstanding =
        lastMonthIdx >= 0 && lastMonthIdx < proForma.length
          ? proForma[lastMonthIdx].debtOutstanding
          : 0;
      totalDebt += debtOutstanding;

      let refiProceeds = 0;
      for (let m = 0; m < relevantMonths.length; m++) {
        refiProceeds += relevantMonths[m].refinancingProceeds;
      }
      totalRefiProceeds += refiProceeds;

      const cumulativeCashFlow = relevantMonths.reduce((sum, m) => sum + m.cashFlow, 0);
      totalRetainedEarnings += cumulativeCashFlow;
    });

    const netPropValue = totalPropertyValue - totalAccDepreciation;
    const totalAssets = netPropValue + totalCashReserves;
    const totalLiabilities = totalDebt;
    const totalEquityValue = totalEquity + totalRefiProceeds + totalRetainedEarnings;

    yearlyAssets.push([
      totalPropertyValue,
      -totalAccDepreciation,
      netPropValue,
      totalCashReserves,
      totalAssets,
      totalDebt,
      totalLiabilities,
      totalEquity,
      totalRefiProceeds,
      totalRetainedEarnings,
      totalEquityValue,
      totalLiabilities + totalEquityValue,
    ]);
  }

  const rowLabels = [
    "ASSETS",
    "  Property Value (at cost)",
    "  Less: Accumulated Depreciation",
    "  Net Property Value",
    "  Cash & Reserves",
    "Total Assets",
    "",
    "LIABILITIES",
    "  Outstanding Debt",
    "Total Liabilities",
    "",
    "EQUITY",
    "  Initial Equity Invested",
    "  Refinancing Proceeds",
    "  Retained Earnings",
    "Total Equity",
    "",
    "Total Liabilities + Equity",
  ];

  const dataMapping = [
    -1,
    0, 1, 2, 3, 4,
    -1,
    -1,
    5, 6,
    -1,
    -1,
    7, 8, 9, 10,
    -1,
    11,
  ];

  const dataRows: (string | number)[][] = [headers, []];
  for (let r = 0; r < rowLabels.length; r++) {
    const row: (string | number)[] = [rowLabels[r]];
    const idx = dataMapping[r];
    if (idx >= 0) {
      for (let y = 0; y < years; y++) {
        row.push(yearlyAssets[y][idx]);
      }
    }
    dataRows.push(row);
  }

  const ws = XLSX.utils.aoa_to_sheet(dataRows);
  setColumnWidths(ws, [30, ...yearLabels.map(() => 16)]);
  applyCurrencyFormat(ws, dataRows);
  applyHeaderStyle(ws, dataRows);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Balance Sheet");

  const safeName = title.replace(/[^a-zA-Z0-9 ]/g, "").substring(0, 30);
  await downloadWorkbook(wb, `${safeName} - Balance Sheet.xlsx`);
}

/**
 * Download the Management Company Income Statement as Excel.
 */
export async function exportCompanyIncomeStatement(
  data: CompanyMonthlyFinancials[],
  years: number,
  modelStartDate: string,
  fiscalYearStartMonth: number
) {
  const XLSX = await import("xlsx");
  const yearLabels: string[] = [];
  const yearlyData: {
    label: string;
    baseFee: number;
    incentiveFee: number;
    totalRevenue: number;
    totalVendorCost: number;
    grossProfit: number;
    vendorCostByCategory: Record<string, number>;
    partnerComp: number;
    staffComp: number;
    officeLease: number;
    profServices: number;
    techInfra: number;
    businessInsurance: number;
    travel: number;
    itLicensing: number;
    marketing: number;
    miscOps: number;
    totalExpenses: number;
    interestExpense: number;
    preTaxIncome: number;
    tax: number;
    netIncome: number;
    safeFunding: number;
    cashFlow: number;
  }[] = [];

  for (let y = 0; y < years; y++) {
    const yearSlice = data.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
    if (yearSlice.length === 0) continue;
    const fyLabel = String(getFiscalYearForModelYear(modelStartDate, fiscalYearStartMonth, y));
    yearLabels.push(fyLabel);
    const vendorCostByCategory: Record<string, number> = {};
    yearSlice.forEach(m => {
      if (m.costOfCentralizedServices) {
        for (const [catName, cat] of Object.entries(m.costOfCentralizedServices.byCategory)) {
          if (cat.serviceModel === 'centralized') {
            vendorCostByCategory[catName] = (vendorCostByCategory[catName] ?? 0) + cat.vendorCost;
          }
        }
      }
    });

    yearlyData.push({
      label: fyLabel,
      baseFee: yearSlice.reduce((a, m) => a + m.baseFeeRevenue, 0),
      incentiveFee: yearSlice.reduce((a, m) => a + m.incentiveFeeRevenue, 0),
      totalRevenue: yearSlice.reduce((a, m) => a + m.totalRevenue, 0),
      totalVendorCost: yearSlice.reduce((a, m) => a + m.totalVendorCost, 0),
      grossProfit: yearSlice.reduce((a, m) => a + m.grossProfit, 0),
      vendorCostByCategory,
      partnerComp: yearSlice.reduce((a, m) => a + m.partnerCompensation, 0),
      staffComp: yearSlice.reduce((a, m) => a + m.staffCompensation, 0),
      officeLease: yearSlice.reduce((a, m) => a + m.officeLease, 0),
      profServices: yearSlice.reduce((a, m) => a + m.professionalServices, 0),
      techInfra: yearSlice.reduce((a, m) => a + m.techInfrastructure, 0),
      businessInsurance: yearSlice.reduce((a, m) => a + m.businessInsurance, 0),
      travel: yearSlice.reduce((a, m) => a + m.travelCosts, 0),
      itLicensing: yearSlice.reduce((a, m) => a + m.itLicensing, 0),
      marketing: yearSlice.reduce((a, m) => a + m.marketing, 0),
      miscOps: yearSlice.reduce((a, m) => a + m.miscOps, 0),
      totalExpenses: yearSlice.reduce((a, m) => a + m.totalExpenses, 0),
      interestExpense: yearSlice.reduce((a, m) => a + m.fundingInterestExpense, 0),
      preTaxIncome: yearSlice.reduce((a, m) => a + m.preTaxIncome, 0),
      tax: yearSlice.reduce((a, m) => a + m.companyIncomeTax, 0),
      netIncome: yearSlice.reduce((a, m) => a + m.netIncome, 0),
      safeFunding: yearSlice.reduce((a, m) => a + m.safeFunding, 0),
      cashFlow: yearSlice.reduce((a, m) => a + m.cashFlow, 0),
    });
  }

  const hasVendorCosts = yearlyData.some(y => y.totalVendorCost > 0);

  // Collect centralized category names from first year with data
  const centralizedCategories: string[] = [];
  if (hasVendorCosts) {
    const sample = yearlyData.find(y => Object.keys(y.vendorCostByCategory).length > 0);
    if (sample) centralizedCategories.push(...Object.keys(sample.vendorCostByCategory));
  }

  const headers = ["Management Company - Income Statement", ...yearLabels];
  const rows: (string | number)[][] = [
    headers,
    [],
    ["REVENUE"],
    ["  Base Management Fees", ...yearlyData.map((y) => y.baseFee)],
    ["  Incentive Management Fees", ...yearlyData.map((y) => y.incentiveFee)],
    ["Total Revenue", ...yearlyData.map((y) => y.totalRevenue)],
    [],
  ];

  if (hasVendorCosts) {
    rows.push(["COST OF CENTRALIZED SERVICES"]);
    centralizedCategories.forEach(catName => {
      rows.push([`  ${catName} (Vendor Cost)`, ...yearlyData.map(y => y.vendorCostByCategory[catName] ?? 0)]);
    });
    rows.push(["Total Vendor Cost", ...yearlyData.map(y => y.totalVendorCost)]);
    rows.push([]);
    rows.push(["Gross Profit", ...yearlyData.map(y => y.grossProfit)]);
    rows.push([]);
  }

  rows.push(
    ["OPERATING EXPENSES"],
    ["  Partner Compensation", ...yearlyData.map((y) => y.partnerComp)],
    ["  Staff Compensation", ...yearlyData.map((y) => y.staffComp)],
    ["  Office Lease", ...yearlyData.map((y) => y.officeLease)],
    ["  Professional Services", ...yearlyData.map((y) => y.profServices)],
    ["  Technology Infrastructure", ...yearlyData.map((y) => y.techInfra)],
    ["  Business Insurance", ...yearlyData.map((y) => y.businessInsurance)],
    ["  Travel Costs", ...yearlyData.map((y) => y.travel)],
    ["  IT Licensing", ...yearlyData.map((y) => y.itLicensing)],
    ["  Marketing", ...yearlyData.map((y) => y.marketing)],
    ["  Miscellaneous Operations", ...yearlyData.map((y) => y.miscOps)],
    ["Total Expenses", ...yearlyData.map((y) => y.totalExpenses)],
    [],
    ["Operating Income (EBITDA)", ...yearlyData.map((y) => y.preTaxIncome + y.interestExpense)],
  );

  const hasInterest = yearlyData.some(y => y.interestExpense > 0);
  if (hasInterest) {
    rows.push(["  Interest Expense", ...yearlyData.map((y) => -y.interestExpense)]);
    rows.push(["Pre-Tax Income", ...yearlyData.map((y) => y.preTaxIncome)]);
  }

  rows.push(
    ["  Tax", ...yearlyData.map((y) => -y.tax)],
    ["Net Income", ...yearlyData.map((y) => y.netIncome)],
    [],
    ["FUNDING"],
    ["  Funding Received", ...yearlyData.map((y) => y.safeFunding)],
    ["Cash Flow", ...yearlyData.map((y) => y.cashFlow)],
  );

  const ws = XLSX.utils.aoa_to_sheet(rows);
  setColumnWidths(ws, [35, ...yearLabels.map(() => 16)]);
  applyCurrencyFormat(ws, rows);
  applyHeaderStyle(ws, rows);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Company Income Statement");

  await downloadWorkbook(wb, "Management Company - Income Statement.xlsx");
}

/**
 * Download the Management Company Cash Flow Statement as Excel.
 */
export async function exportCompanyCashFlow(
  data: CompanyMonthlyFinancials[],
  years: number,
  modelStartDate: string,
  fiscalYearStartMonth: number
) {
  const XLSX = await import("xlsx");
  const yearLabels: string[] = [];
  const yearlyData: {
    label: string;
    totalRevenue: number;
    baseFee: number;
    incentiveFee: number;
    totalVendorCost: number;
    safeFunding: number;
    totalExpenses: number;
    interestPayment: number;
    partnerComp: number;
    staffComp: number;
    officeLease: number;
    profServices: number;
    techInfra: number;
    businessInsurance: number;
    travel: number;
    itLicensing: number;
    marketing: number;
    miscOps: number;
    cashFlow: number;
  }[] = [];

  for (let y = 0; y < years; y++) {
    const yearSlice = data.slice(y * MONTHS_PER_YEAR, (y + 1) * MONTHS_PER_YEAR);
    if (yearSlice.length === 0) continue;
    const fyLabel = String(getFiscalYearForModelYear(modelStartDate, fiscalYearStartMonth, y));
    yearLabels.push(fyLabel);
    yearlyData.push({
      label: fyLabel,
      totalRevenue: yearSlice.reduce((a, m) => a + m.totalRevenue, 0),
      baseFee: yearSlice.reduce((a, m) => a + m.baseFeeRevenue, 0),
      incentiveFee: yearSlice.reduce((a, m) => a + m.incentiveFeeRevenue, 0),
      totalVendorCost: yearSlice.reduce((a, m) => a + m.totalVendorCost, 0),
      safeFunding: yearSlice.reduce((a, m) => a + m.safeFunding, 0),
      totalExpenses: yearSlice.reduce((a, m) => a + m.totalExpenses, 0),
      interestPayment: yearSlice.reduce((a, m) => a + m.fundingInterestPayment, 0),
      partnerComp: yearSlice.reduce((a, m) => a + m.partnerCompensation, 0),
      staffComp: yearSlice.reduce((a, m) => a + m.staffCompensation, 0),
      officeLease: yearSlice.reduce((a, m) => a + m.officeLease, 0),
      profServices: yearSlice.reduce((a, m) => a + m.professionalServices, 0),
      techInfra: yearSlice.reduce((a, m) => a + m.techInfrastructure, 0),
      businessInsurance: yearSlice.reduce((a, m) => a + m.businessInsurance, 0),
      travel: yearSlice.reduce((a, m) => a + m.travelCosts, 0),
      itLicensing: yearSlice.reduce((a, m) => a + m.itLicensing, 0),
      marketing: yearSlice.reduce((a, m) => a + m.marketing, 0),
      miscOps: yearSlice.reduce((a, m) => a + m.miscOps, 0),
      cashFlow: yearSlice.reduce((a, m) => a + m.cashFlow, 0),
    });
  }

  let cumulative = 0;
  const openingCash = yearlyData.map((_, i) => {
    if (i === 0) return 0;
    let cum = 0;
    for (let j = 0; j < i; j++) cum += yearlyData[j].cashFlow;
    return cum;
  });
  const closingCash = yearlyData.map((y) => {
    cumulative += y.cashFlow;
    return cumulative;
  });

  const hasCFVendorCosts = yearlyData.some(y => y.totalVendorCost > 0);

  const headers = ["Statement of Cash Flows - Management Company", ...yearLabels];
  const rows: (string | number)[][] = [
    headers,
    [],
    ["CASH FLOW FROM OPERATING ACTIVITIES"],
    ["  Cash Received from Management Fees", ...yearlyData.map((y) => y.totalRevenue)],
    ["    Base Management Fees", ...yearlyData.map((y) => y.baseFee)],
    ["    Incentive Management Fees", ...yearlyData.map((y) => y.incentiveFee)],
  ];

  if (hasCFVendorCosts) {
    rows.push(["  Cash Paid to Service Vendors", ...yearlyData.map(y => -y.totalVendorCost)]);
  }

  rows.push(
    ["  Cash Paid for Operating Expenses", ...yearlyData.map((y) => -y.totalExpenses)],
    ["    Compensation", ...yearlyData.map((y) => -(y.partnerComp + y.staffComp))],
    ["      Partner Compensation", ...yearlyData.map((y) => -y.partnerComp)],
    ["      Staff Compensation", ...yearlyData.map((y) => -y.staffComp)],
    ["    Fixed Overhead", ...yearlyData.map((y) => -(y.officeLease + y.profServices + y.techInfra + y.businessInsurance))],
    ["      Office Lease", ...yearlyData.map((y) => -y.officeLease)],
    ["      Professional Services", ...yearlyData.map((y) => -y.profServices)],
    ["      Technology Infrastructure", ...yearlyData.map((y) => -y.techInfra)],
    ["      Business Insurance", ...yearlyData.map((y) => -y.businessInsurance)],
    ["    Variable Costs", ...yearlyData.map((y) => -(y.travel + y.itLicensing + y.marketing + y.miscOps))],
    ["      Travel Costs", ...yearlyData.map((y) => -y.travel)],
    ["      IT Licensing", ...yearlyData.map((y) => -y.itLicensing)],
    ["      Marketing", ...yearlyData.map((y) => -y.marketing)],
    ["      Miscellaneous Operations", ...yearlyData.map((y) => -y.miscOps)],
    ["Net Cash from Operating Activities", ...yearlyData.map((y) => y.totalRevenue - y.totalVendorCost - y.totalExpenses)],
    [],
    ["CASH FLOW FROM FINANCING ACTIVITIES"],
    ["  Funding Received", ...yearlyData.map((y) => y.safeFunding)],
  );

  const hasCFInterest = yearlyData.some(y => y.interestPayment > 0);
  if (hasCFInterest) {
    rows.push(["  Interest Paid on Notes", ...yearlyData.map((y) => -y.interestPayment)]);
  }

  rows.push(
    ["Net Cash from Financing Activities", ...yearlyData.map((y) => y.safeFunding - y.interestPayment)],
    [],
    ["Net Increase (Decrease) in Cash", ...yearlyData.map((y) => y.cashFlow)],
    ["Opening Cash Balance", ...openingCash],
    ["Closing Cash Balance", ...closingCash],
  );

  const ws = XLSX.utils.aoa_to_sheet(rows);
  setColumnWidths(ws, [45, ...yearLabels.map(() => 16)]);
  applyCurrencyFormat(ws, rows);
  applyHeaderStyle(ws, rows);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Company Cash Flow");

  await downloadWorkbook(wb, "Management Company - Cash Flow.xlsx");
}

/**
 * Download the Management Company Balance Sheet as Excel.
 */
export async function exportCompanyBalanceSheet(
  data: CompanyMonthlyFinancials[],
  safeTranche1Amount: number,
  safeTranche2Amount: number,
  modelStartDate: string,
  fiscalYearStartMonth: number,
  years: number
) {
  const XLSX = await import("xlsx");
  const cumulativeNetIncome = data.reduce((a, m) => a + m.netIncome, 0);
  const totalSafeFunding = safeTranche1Amount + safeTranche2Amount;
  const lastMonth = data[data.length - 1];
  const cashBalance = lastMonth?.endingCash ?? 0;
  const accruedInterestBalance = lastMonth?.cumulativeAccruedInterest ?? 0;
  const totalAssets = cashBalance;
  const safeNotesPayable = totalSafeFunding;
  const totalLiabilities = safeNotesPayable + accruedInterestBalance;
  const retainedEarnings = cumulativeNetIncome;
  const totalEquity = retainedEarnings;

  const lastYearLabel = String(getFiscalYearForModelYear(modelStartDate, fiscalYearStartMonth, years - 1));

  const rows: (string | number)[][] = [
    [`Balance Sheet - Management Company (As of ${lastYearLabel})`],
    [],
    ["ASSETS"],
    ["  Current Assets"],
    ["    Cash & Cash Equivalents", cashBalance],
    ["  Total Current Assets", cashBalance],
    ["TOTAL ASSETS", totalAssets],
    [],
    ["LIABILITIES"],
    ["  Long-Term Liabilities"],
    ["    Funding Notes Payable", safeNotesPayable],
  ];

  if (accruedInterestBalance > 0) {
    rows.push(["    Accrued Interest on Notes", accruedInterestBalance]);
  }

  rows.push(
    ["  Total Long-Term Liabilities", totalLiabilities],
    ["TOTAL LIABILITIES", totalLiabilities],
    [],
    ["EQUITY"],
    ["  Retained Earnings", retainedEarnings],
    ["TOTAL EQUITY", totalEquity],
    [],
    ["TOTAL LIABILITIES + EQUITY", totalLiabilities + totalEquity],
  );

  const ws = XLSX.utils.aoa_to_sheet(rows);
  setColumnWidths(ws, [35, 18]);
  applyCurrencyFormat(ws, rows);
  applyHeaderStyle(ws, rows);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Company Balance Sheet");

  await downloadWorkbook(wb, "Management Company - Balance Sheet.xlsx");
}
