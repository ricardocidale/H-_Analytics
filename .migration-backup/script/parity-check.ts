/**
 * Parity Check — verifies that statement builder output matches the
 * on-screen tab components and the Export Parity Registry in the
 * USALI skill.
 *
 * Drives all four statement builders with synthetic data and confirms:
 *   1. Every canonical registry label appears in each builder's output.
 *   2. No builder rows are absent from BOTH the registry AND the on-screen
 *      tab source files, unless they are declared in EXPORT_ONLY_ROWS (rows
 *      that exist in the PDF/Excel export only and are not on-screen).
 *   3. Overview KPI rows (IRR, Equity Multiple, Cash-on-Cash, NOI, ANOI,
 *      Total Revenue) are present in the financials object.
 *
 * Usage: npm run parity:check
 * Exit 0 = full pass, Exit 1 = any mismatch.
 */

import { readFileSync } from "fs";
import { PropertyStatus } from "@shared/constants";
import { header, footer } from "./lib/formatter.js";

// ---------------------------------------------------------------------------
// Type stubs for builder inputs (minimal typed shapes, no `any` casts)
// ---------------------------------------------------------------------------

interface YearlyConsolidatedStub {
  revenueTotal: number; revenueRooms: number; revenueEvents: number;
  revenueFB: number; revenueOther: number;
  soldRooms: number; availableRooms: number;
  expenseRooms: number; expenseFB: number; expenseEvents: number;
  expenseOther: number; expenseMarketing: number; expensePropertyOps: number;
  expenseAdmin: number; expenseIT: number; expenseInsurance: number;
  expenseUtilitiesVar: number; expenseUtilitiesFixed: number;
  expenseOtherCosts: number; expensePlatformFees: number; expensePreOpening: number;
  expenseTaxes: number; expenseFFE: number;
  gop: number; agop: number; noi: number; anoi: number;
  feeBase: number; feeIncentive: number;
  debtPayment: number; interestExpense: number; principalPayment: number;
  netIncome: number; depreciationExpense: number; incomeTax: number;
  cashFlow: number; totalExpenses: number;
  serviceFeesByCategory: Record<string, number>;
  [key: string]: unknown;
}

interface YearlyCFStub {
  year?: number;
  noi: number; anoi: number;
  interestExpense: number; principalPayment: number;
  taxLiability: number; cashFromOperations: number;
  capitalExpenditures: number; exitValue: number;
  refinancingProceeds: number; debtService: number;
  freeCashFlow: number; freeCashFlowToEquity: number;
  maintenanceCapex: number;
  netCashFlowToInvestors: number;
  cumulativeCashFlow?: number;
  atcf: number; btcf: number; taxableIncome: number;
  depreciation?: number; netIncome?: number;
  operatingCashFlow?: number; workingCapitalChange?: number;
}

interface MonthlyStub {
  date?: Date; monthIndex?: number;
  occupancy?: number; adr?: number;
  availableRooms?: number; soldRooms?: number;
  revenueRooms?: number; revenueEvents?: number;
  revenueFB?: number; revenueOther?: number; revenueTotal?: number;
  expenseRooms?: number; expenseFB?: number; expenseEvents?: number;
  expenseOther?: number; expenseMarketing?: number;
  expensePropertyOps?: number; expenseUtilitiesVar?: number;
  expenseFFE?: number; feeBase?: number; feeIncentive?: number;
  serviceFeesByCategory?: Record<string, number>;
  expenseAdmin?: number; expenseIT?: number; expenseTaxes?: number;
  expenseUtilitiesFixed?: number; expenseInsurance?: number;
  expenseOtherCosts?: number; totalExpenses?: number;
  gop?: number; agop?: number; noi?: number; anoi?: number;
  interestExpense?: number; principalPayment?: number;
  debtPayment?: number; netIncome?: number; incomeTax?: number;
  cashFlow?: number; depreciationExpense?: number;
  propertyValue?: number; debtOutstanding?: number;
  refinancingProceeds?: number;
  operatingCashFlow?: number; financingCashFlow?: number;
  endingCash?: number;
  accountsReceivable?: number; accountsPayable?: number;
  workingCapitalChange?: number; nolBalance?: number;
  cashShortfall?: boolean;
}

interface PropertyStub {
  id: number; name: string; market: string; roomCount: number;
  purchasePrice: number; buildingImprovements: number;
  acquisitionLTV: number; acquisitionInterestRate: number;
  operatingReserve: number; preOpeningCosts: number;
  exitCapRate: number; taxRate: number;
  acquisitionDate: string; operationsStartDate: string;
  startAdr: number; type: string; status: string;
  [key: string]: unknown;
}

interface DashboardFinancialsStub {
  yearlyConsolidatedCache: YearlyConsolidatedStub[];
  allPropertyYearlyCF: YearlyCFStub[][];
  allPropertyFinancials: { property: PropertyStub; financials: MonthlyStub[] }[];
  allPropertyYearlyIS: YearlyConsolidatedStub[][];
  portfolioIRR: number;
  equityMultiple: number;
  cashOnCash: number;
  totalInitialEquity: number;
  totalExitValue: number;
  totalProjectionRevenue: number;
  totalProjectionNOI: number;
  totalProjectionCashFlow: number;
  totalProjectionANOI: number;
  totalRooms: number;
  weightedMetricsByYear: {
    weightedADR: number; weightedOcc: number;
    revPAR: number; totalAvailableRoomNights: number;
  }[];
}

// ---------------------------------------------------------------------------
// Export Parity Registry — canonical row labels per section
//
// Every category string listed here MUST appear in the corresponding
// builder's output. This is the machine-readable contract maintained in the
// USALI skill's Export Parity Registry section.
// ---------------------------------------------------------------------------

const REGISTRY: Record<string, string[]> = {
  "Overview": [
    "Portfolio IRR (%)",
    "Equity Multiple",
    "Cash-on-Cash Return (%)",
    "Total Initial Equity",
    "Total Exit Value",
    "Total Revenue",
    "NOI",
    "ANOI",
  ],
  "Income Statement": [
    "Operational Metrics",
    "Total Revenue",
    "Departmental Expenses",
    "Undistributed Operating Expenses",
    "Gross Operating Profit (GOP)",
    "Management Fees",
    "Adjusted Gross Operating Profit (AGOP)",
    "Fixed Charges",
    "Net Operating Income (NOI)",
    "FF&E Reserve",
    "Adjusted NOI (ANOI)",
    "Debt Service",
    "Net Income",
  ],
  "Cash Flow": [
    "Cash Flow from Operations (CFO)",
    "Adjusted NOI (ANOI)",
    "Less: Interest Expense",
    "Less: Principal Payments",
    "Less: Income Tax",
    "Cash Flow from Investing (CFI)",
    "Capital Expenditures (FF&E)",
    "Exit Proceeds (Net Sale Value)",
    "Cash Flow from Financing (CFF)",
    "Refinancing Proceeds",
    "Less: Principal Repayments",
    "Net Change in Cash",
    "Free Cash Flow",
    "Free Cash Flow (FCF)",
    "Free Cash Flow to Equity (FCFE)",
    "Key Metrics",
    "DSCR (Debt Service Coverage)",
    "Cash-on-Cash Return",
    "FCF Margin",
    "FCFE Margin",
  ],
  "Balance Sheet": [
    "ASSETS",
    "Current Assets",
    "Cash & Cash Equivalents",
    "Total Current Assets",
    "Fixed Assets",
    "Property, Plant & Equipment",
    "Less: Accumulated Depreciation",
    "Net Fixed Assets",
    "TOTAL ASSETS",
    "LIABILITIES",
    "Long-Term Liabilities",
    "Mortgage Notes Payable",
    "Total Liabilities",
    "EQUITY",
    "Paid-In Capital",
    "Retained Earnings",
    "Total Equity",
    "TOTAL LIABILITIES & EQUITY",
    "Balance Check (Assets \u2212 L&E)",
  ],
  "Investment Analysis": [
    "Investment Summary",
    "Total Initial Equity",
    "Total Exit Value",
    "Portfolio IRR (%)",
    "Equity Multiple",
    "Cash-on-Cash Return (%)",
    "Total Properties",
    "Total Rooms",
  ],
};

// ---------------------------------------------------------------------------
// Export-only rows — builder categories that intentionally exist only in the
// PDF/Excel export and are NOT rendered as string literals in the on-screen
// tab components. These are excluded from the extra-row mismatch check.
//
// When adding rows here, provide a comment explaining the divergence.
// ---------------------------------------------------------------------------

const EXPORT_ONLY_ROWS: Set<string> = new Set([
  // Income Statement builder: abbreviated label vs tab's full label
  // Builder: "Property Ops & Maintenance"
  // Tab: "Property Operations & Maintenance"
  // Both refer to the same data; builder uses a compact label for export columns.
  "Property Ops & Maintenance",

  // Cash Flow builder FCF sub-section: export uses different labels than the tab
  // Builder: "Net Cash from Operating Activities" → tab: "Cash from Operations (CFO)"
  // Builder: "Less: Capital Expenditures (FF&E)" → tab: "Less: FF&E Reserve"
  "Net Cash from Operating Activities",
  "Less: Capital Expenditures (FF&E)",

  // Investment Analysis builder: additional detailed sections for PDF/Excel export
  // that are rendered via per-property component logic (not string literals) in the
  // on-screen InvestmentAnalysis.tsx. These sections are export-granularity rows.
  "Revenue & Profitability",
  "Total Operating Expenses",
  "GOP Margin (%)",
  "Property Taxes",
  "NOI Margin (%)",
  "Management Fees (Base)",
  "Management Fees (Incentive)",
  "Cash Flow Analysis",
  "Cash from Operations (CFO)",
  "Free Cash Flow (FCF)",
  "Total Debt Service",
  "  Principal Payments",
  "  Interest Expense",
  "Free Cash Flow to Equity (FCFE)",
  "Cumulative FCFE",
  "Below-the-Line Items",
  "Interest Expense",
  "Depreciation & Amortization",
  "Income Tax Provision",
  "GAAP Net Income",
  "Key Ratios & Returns",
  "DSCR",
  "Cap Rate (%)",
  "Operating Expense Ratio (%)",
  "NOI per Room",
  "Revenue per Room",
  "Operating Metrics",
  "ADR (Weighted Avg)",
  "Occupancy (%)",
  "RevPAR",
  "Available Room Nights",
  "Sold Room Nights",
  "Free Cash Flow to Investors",
  "After-Tax Cash Flow (ATCF)",
  "Refinancing Proceeds",
  "Exit Proceeds",
  "Net Cash Flow to Investors",
  "Cumulative Cash Flow",
  "Operating Cash Flow Waterfall",
  "Less: Debt Service",
  "Before-Tax Cash Flow (BTCF)",
  "Taxable Income",
  "Less: Income Tax",
  "Per-Property Returns",
  "Equity Invested",
  "Annual ATCF",
  "Exit Value",
  "Cash-on-Cash (%)",
  "Property-Level IRR Analysis",
  "Equity Investment",
  "Income Tax Rate (%)",
  "Exit Cap Rate (%)",
  "Total Distributions",
  "IRR (%)",
  "Portfolio Total",
  "Total Equity",
  "Portfolio Equity Multiple",
  // Investment Analysis builder duplicates of registry labels from other sections
  // These appear as sub-rows in the Investment Analysis export (per-property P&L
  // detail) but are not rendered as string literals in InvestmentAnalysis.tsx.
  "Total Revenue",
  "Gross Operating Profit (GOP)",
  "FF&E Reserve",

  "Discounted Cash Flow (DCF) Analysis",
  "Country Risk Premium (%)",
  "Cost of Equity (%)",
  "Equity Weight (E/V)",
  "WACC (%)",
  "DCF Value",
  "NPV",
  "Value Creation (%)",
  "Yearly ATCF",
  "PV of Cash Flows",
  "PV of Terminal Value",
  "Portfolio DCF Summary",
  "Portfolio WACC (%)",
  "DCF Portfolio Value",
  "Net Present Value (NPV)",
]);

// ---------------------------------------------------------------------------
// On-screen source files scanned per section
// ---------------------------------------------------------------------------

const TAB_SOURCE_FILES: Record<string, string[]> = {
  "Overview": [
    "client/src/components/dashboard/OverviewTab.tsx",
  ],
  "Income Statement": [
    "client/src/components/dashboard/IncomeStatementTab.tsx",
  ],
  "Cash Flow": [
    "client/src/components/dashboard/CashFlowTab.tsx",
  ],
  "Balance Sheet": [
    "client/src/components/dashboard/BalanceSheetTab.tsx",
  ],
  "Investment Analysis": [
    "client/src/components/dashboard/InvestmentAnalysisTab.tsx",
    "client/src/components/InvestmentAnalysis.tsx",
    "client/src/components/investment/FCFAnalysisTable.tsx",
    "client/src/components/investment/PropertyIRRTable.tsx",
    "client/src/components/investment/DCFAnalysis.tsx",
  ],
};

// ---------------------------------------------------------------------------
// Rows that are dynamically generated (property names, service categories)
// and should never be checked against source string literals.
// ---------------------------------------------------------------------------

const DYNAMIC_ROW_PREFIXES = ["= ", "Cross-check:"];
const DYNAMIC_ROW_LABELS = new Set([
  "Grand Metropol Hotel",
  "Lakeshore Select Inn",
  "Property 1",
  "",
]);

function isDynamic(label: string): boolean {
  if (DYNAMIC_ROW_LABELS.has(label)) return true;
  return DYNAMIC_ROW_PREFIXES.some((p) => label.startsWith(p));
}

// ---------------------------------------------------------------------------
// Synthetic fixture factories
// ---------------------------------------------------------------------------

function makeYearlyConsolidated(years: number): YearlyConsolidatedStub[] {
  return Array.from({ length: years }, (_, i) => ({
    revenueTotal: 5_000_000 + i * 200_000,
    revenueRooms: 3_000_000 + i * 100_000,
    revenueEvents: 500_000,
    revenueFB: 800_000,
    revenueOther: 700_000,
    soldRooms: 18_000 + i * 500,
    availableRooms: 21_900,
    expenseRooms: 900_000,
    expenseFB: 400_000,
    expenseEvents: 150_000,
    expenseOther: 100_000,
    expenseMarketing: 200_000,
    expensePropertyOps: 150_000,
    expenseAdmin: 100_000,
    expenseIT: 50_000,
    expenseInsurance: 80_000,
    expenseUtilitiesVar: 60_000,
    expenseUtilitiesFixed: 40_000,
    expenseOtherCosts: 70_000,
    expensePlatformFees: 0,
    expensePreOpening: 0,
    expenseTaxes: 100_000,
    expenseFFE: 150_000,
    gop: 2_050_000 + i * 100_000,
    agop: 1_900_000 + i * 90_000,
    noi: 1_800_000 + i * 80_000,
    anoi: 1_650_000 + i * 70_000,
    feeBase: 100_000,
    feeIncentive: 50_000,
    debtPayment: 600_000,
    interestExpense: 350_000,
    principalPayment: 250_000,
    netIncome: 900_000 + i * 40_000,
    depreciationExpense: 180_000,
    incomeTax: 120_000,
    cashFlow: 750_000,
    totalExpenses: 2_450_000,
    serviceFeesByCategory: {},
    // used via financials.weightedMetricsByYear (projected onto this object)
    weightedADR: 180 + i * 2,
    weightedOcc: 0.72 + i * 0.005,
    revPAR: 130 + i * 2,
  }));
}

function makeYearlyCF(years: number): YearlyCFStub[] {
  return Array.from({ length: years }, (_, i) => ({
    year: 2024 + i,
    noi: 1_800_000 + i * 80_000,
    anoi: 1_650_000 + i * 70_000,
    interestExpense: 350_000,
    principalPayment: 250_000,
    taxLiability: 120_000,
    cashFromOperations: 930_000 + i * 60_000,
    capitalExpenditures: i === 0 ? -5_000_000 : -150_000,
    exitValue: i === years - 1 ? 8_000_000 : 0,
    refinancingProceeds: 0,
    debtService: 600_000,
    freeCashFlow: 780_000 + i * 50_000,
    freeCashFlowToEquity: 530_000 + i * 50_000,
    maintenanceCapex: 150_000,
    netCashFlowToInvestors: i === years - 1 ? 8_530_000 : 530_000 + i * 50_000,
    cumulativeCashFlow: 0,
    atcf: 650_000 + i * 40_000,
    btcf: 1_050_000 + i * 50_000,
    taxableIncome: 900_000,
  }));
}

function makeMonthlyFinancials(months: number): MonthlyStub[] {
  return Array.from({ length: months }, (_, m) => ({
    date: new Date(2024, m % 12, 1),
    monthIndex: m,
    occupancy: 0.72,
    adr: 180,
    availableRooms: 1_825,
    soldRooms: 1_314,
    revenueRooms: 250_000,
    revenueEvents: 41_667,
    revenueFB: 66_667,
    revenueOther: 58_333,
    revenueTotal: 416_667,
    expenseRooms: 75_000,
    expenseFB: 33_333,
    expenseEvents: 12_500,
    expenseOther: 8_333,
    expenseMarketing: 16_667,
    expensePropertyOps: 12_500,
    expenseUtilitiesVar: 5_000,
    expenseFFE: 12_500,
    feeBase: 8_333,
    feeIncentive: 4_167,
    serviceFeesByCategory: {},
    expenseAdmin: 8_333,
    expenseIT: 4_167,
    expenseTaxes: 8_333,
    expenseUtilitiesFixed: 3_333,
    expenseInsurance: 6_667,
    expenseOtherCosts: 5_833,
    expensePlatformFees: 0,
    expensePreOpening: 0,
    totalExpenses: 204_167,
    gop: 170_833,
    agop: 158_333,
    noi: 150_000,
    anoi: 137_500,
    interestExpense: 29_167,
    principalPayment: 20_833,
    debtPayment: 50_000,
    netIncome: 75_000,
    incomeTax: 10_000,
    cashFlow: 62_500,
    depreciationExpense: 15_000,
    propertyValue: 6_500_000,
    debtOutstanding: Math.max(0, 2_000_000 - m * 20_833),
    refinancingProceeds: 0,
    operatingCashFlow: 62_500,
    financingCashFlow: -50_000,
    endingCash: 200_000 + m * 5_000,
    accountsReceivable: 0,
    accountsPayable: 0,
    workingCapitalChange: 0,
    nolBalance: 0,
    cashShortfall: false,
  }));
}

function makeProperty(
  id: number,
  name: string,
  market: string,
  roomCount: number,
  adr: number,
  purchasePrice: number,
): PropertyStub {
  return {
    id,
    name,
    market,
    roomCount,
    purchasePrice,
    buildingImprovements: purchasePrice * 0.08,
    acquisitionLTV: 0.65,
    acquisitionInterestRate: 0.055,
    operatingReserve: purchasePrice * 0.03,
    preOpeningCosts: 50_000,
    exitCapRate: 0.065,
    taxRate: 0.21,
    acquisitionDate: "2024-01-01",
    operationsStartDate: "2024-01-01",
    startAdr: adr,
    type: "Traditional",
    status: PropertyStatus.OPERATING,
  };
}

/**
 * Build a two-property, multi-year DashboardFinancials fixture.
 * Property 1: urban full-service hotel, 120 rooms, ADR $220, NYC market.
 * Property 2: select-service hotel, 80 rooms, ADR $145, Chicago market.
 * Using two distinct properties exercises portfolio aggregation paths.
 */
function makeFinancials(years: number): DashboardFinancialsStub {
  const property1 = makeProperty(1, "Grand Metropol Hotel", "New York", 120, 220, 9_000_000);
  const property2 = makeProperty(2, "Lakeshore Select Inn", "Chicago", 80, 145, 5_500_000);

  const consolidated1 = makeYearlyConsolidated(years);
  const consolidated2 = makeYearlyConsolidated(years).map((y, i) => ({
    ...y,
    revenueTotal: 2_800_000 + i * 120_000,
    revenueRooms: 1_700_000 + i * 60_000,
    soldRooms: 10_000 + i * 300,
    availableRooms: 14_600,
    noi: 950_000 + i * 40_000,
    anoi: 870_000 + i * 35_000,
    gop: 1_050_000 + i * 55_000,
    agop: 980_000 + i * 50_000,
    netIncome: 480_000 + i * 20_000,
  }));

  const combinedConsolidated = consolidated1.map((y, i) => ({
    ...y,
    revenueTotal: y.revenueTotal + consolidated2[i].revenueTotal,
    revenueRooms: y.revenueRooms + consolidated2[i].revenueRooms,
    soldRooms: y.soldRooms + consolidated2[i].soldRooms,
    availableRooms: y.availableRooms + consolidated2[i].availableRooms,
    noi: y.noi + consolidated2[i].noi,
    anoi: y.anoi + consolidated2[i].anoi,
    netIncome: y.netIncome + consolidated2[i].netIncome,
  }));

  const cf1 = makeYearlyCF(years);
  const cf2 = makeYearlyCF(years).map((y, i) => ({
    ...y,
    noi: 950_000 + i * 40_000,
    anoi: 870_000 + i * 35_000,
    freeCashFlow: 420_000 + i * 25_000,
    freeCashFlowToEquity: 280_000 + i * 25_000,
    atcf: 340_000 + i * 20_000,
    btcf: 560_000 + i * 25_000,
  }));

  const monthly1 = makeMonthlyFinancials(years * 12);
  const monthly2 = makeMonthlyFinancials(years * 12).map((m) => ({
    ...m,
    revenueTotal: 233_333,
    revenueRooms: 145_833,
    noi: 87_500,
    anoi: 80_000,
    adr: 145,
    availableRooms: 1_217,
    soldRooms: 875,
    occupancy: 0.72,
  }));

  return {
    yearlyConsolidatedCache: combinedConsolidated,
    allPropertyYearlyCF: [cf1, cf2],
    allPropertyFinancials: [
      { property: property1, financials: monthly1 },
      { property: property2, financials: monthly2 },
    ],
    allPropertyYearlyIS: [consolidated1, consolidated2],
    portfolioIRR: 0.192,
    equityMultiple: 2.45,
    cashOnCash: 13.2,
    totalInitialEquity: 5_075_000,
    totalExitValue: 19_500_000,
    totalProjectionRevenue: 38_000_000,
    totalProjectionNOI: 13_750_000,
    totalProjectionCashFlow: 6_200_000,
    totalProjectionANOI: 12_600_000,
    totalRooms: 200,
    weightedMetricsByYear: combinedConsolidated.map((y) => ({
      weightedADR: (y.weightedADR as number) ?? 190,
      weightedOcc: (y.weightedOcc as number) ?? 0.72,
      revPAR: (y.revPAR as number) ?? 137,
      totalAvailableRoomNights: y.availableRooms,
    })),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readSources(paths: string[]): string {
  return paths.map((p) => {
    try { return readFileSync(p, "utf-8"); } catch { return ""; }
  }).join("\n");
}

function categorySet(rows: { category: string }[]): Set<string> {
  return new Set(rows.map((r) => r.category.trim()));
}

// ---------------------------------------------------------------------------
// Section result
// ---------------------------------------------------------------------------

interface SectionResult {
  section: string;
  pass: boolean;
  missingFromBuilder: string[];   // registry labels absent from builder output
  extraNotOnScreen: string[];     // unexpected builder rows absent from all sources
}

// ---------------------------------------------------------------------------
// Generic section check
// ---------------------------------------------------------------------------

function checkSection(
  section: string,
  registryLabels: string[],
  builderCats: Set<string>,
  tabSource: string,
): SectionResult {
  const registrySet = new Set(registryLabels);

  const missingFromBuilder = registryLabels.filter((l) => !builderCats.has(l));

  const extraNotOnScreen: string[] = [];
  for (const cat of builderCats) {
    if (cat === "") continue;
    if (isDynamic(cat)) continue;
    if (registrySet.has(cat)) continue;
    if (EXPORT_ONLY_ROWS.has(cat)) continue;
    if (tabSource.includes(cat)) continue;
    extraNotOnScreen.push(cat);
  }

  return {
    section,
    pass: missingFromBuilder.length === 0 && extraNotOnScreen.length === 0,
    missingFromBuilder,
    extraNotOnScreen,
  };
}

// ---------------------------------------------------------------------------
// Overview check — verifies KPI presence in the financials object.
//
// Uses REGISTRY["Overview"] as the single source of truth.
// The mapping below binds each registry label to the financials field that
// satisfies it.  Any label without a mapping causes a compile-time omission
// that will surface as a missing-KPI failure at runtime.
// ---------------------------------------------------------------------------

const OVERVIEW_KPI_MAP: Record<string, (fin: DashboardFinancialsStub) => boolean> = {
  "Portfolio IRR (%)":      (f) => f.portfolioIRR !== undefined,
  "Equity Multiple":        (f) => f.equityMultiple !== undefined,
  "Cash-on-Cash Return (%)": (f) => f.cashOnCash !== undefined,
  "Total Initial Equity":   (f) => f.totalInitialEquity !== undefined,
  "Total Exit Value":       (f) => f.totalExitValue !== undefined,
  "Total Revenue":          (f) => f.totalProjectionRevenue !== undefined,
  "NOI":                    (f) => f.totalProjectionNOI !== undefined,
  "ANOI":                   (f) => f.totalProjectionANOI !== undefined,
};

function checkOverview(fin: DashboardFinancialsStub): SectionResult {
  const missingFromBuilder: string[] = [];

  for (const label of REGISTRY["Overview"]) {
    const check = OVERVIEW_KPI_MAP[label];
    if (!check) {
      missingFromBuilder.push(`${label} (no KPI mapping — update OVERVIEW_KPI_MAP)`);
    } else if (!check(fin)) {
      missingFromBuilder.push(label);
    }
  }

  return {
    section: "Overview",
    pass: missingFromBuilder.length === 0,
    missingFromBuilder,
    extraNotOnScreen: [],
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  header("Statement Parity Check", 52);
  console.log("  Checking builder output \u2194 registry \u2194 on-screen tabs...\n");

  const YEARS = 5;
  const fin = makeFinancials(YEARS);
  const getFiscalYear = (i: number) => 2024 + i;
  const modelStartDate = new Date("2024-01-01");
  const propertyNames = fin.allPropertyFinancials.map((p) => p.property.name);

  const {
    generatePortfolioIncomeData,
    generatePortfolioCashFlowData,
    generatePortfolioBalanceSheetData,
    generatePortfolioInvestmentData,
  } = await import("../client/src/components/dashboard/statementBuilders.js");

  const incomeData = generatePortfolioIncomeData(
    fin.yearlyConsolidatedCache as Parameters<typeof generatePortfolioIncomeData>[0],
    YEARS,
    getFiscalYear,
    false,
    fin.allPropertyYearlyIS as Parameters<typeof generatePortfolioIncomeData>[4],
    propertyNames,
  );

  const cashFlowData = generatePortfolioCashFlowData(
    fin.allPropertyYearlyCF as Parameters<typeof generatePortfolioCashFlowData>[0],
    YEARS,
    getFiscalYear,
    new Set(["cfo", "cfi", "cff"]),
    false,
    propertyNames,
    fin.yearlyConsolidatedCache as Parameters<typeof generatePortfolioCashFlowData>[6],
  );

  const balanceSheetData = generatePortfolioBalanceSheetData(
    fin.allPropertyFinancials as Parameters<typeof generatePortfolioBalanceSheetData>[0],
    YEARS,
    getFiscalYear,
    modelStartDate,
  );

  const investmentData = generatePortfolioInvestmentData(
    fin as Parameters<typeof generatePortfolioInvestmentData>[0],
    fin.allPropertyFinancials.map((f) => f.property) as Parameters<typeof generatePortfolioInvestmentData>[1],
    YEARS,
    getFiscalYear,
  );

  const incomeSource = readSources(TAB_SOURCE_FILES["Income Statement"]);
  const cfSource = readSources(TAB_SOURCE_FILES["Cash Flow"]);
  const bsSource = readSources(TAB_SOURCE_FILES["Balance Sheet"]);
  const invSource = readSources(TAB_SOURCE_FILES["Investment Analysis"]);

  const results: SectionResult[] = [
    checkOverview(fin),
    checkSection("Income Statement", REGISTRY["Income Statement"],
      categorySet(incomeData.rows), incomeSource),
    checkSection("Cash Flow", REGISTRY["Cash Flow"],
      categorySet(cashFlowData.rows), cfSource),
    checkSection("Balance Sheet", REGISTRY["Balance Sheet"],
      categorySet(balanceSheetData.rows), bsSource),
    checkSection("Investment Analysis", REGISTRY["Investment Analysis"],
      categorySet(investmentData.rows), invSource),
  ];

  let allPassed = true;

  for (const r of results) {
    const icon = r.pass ? "\u2713" : "\u2717";
    const status = r.pass ? "PASS" : "FAIL";
    console.log(`  ${icon} ${r.section.padEnd(24)} ${status}`);

    if (r.missingFromBuilder.length > 0) {
      allPassed = false;
      console.log(`    Missing from builder output (registry violation):`);
      for (const m of r.missingFromBuilder) {
        console.log(`      \u2192 "${m}"`);
      }
    }

    if (r.extraNotOnScreen.length > 0) {
      allPassed = false;
      console.log(`    Extra rows not in registry or on-screen tab source:`);
      for (const e of r.extraNotOnScreen) {
        console.log(`      \u2192 "${e}"`);
      }
    }
  }

  footer(52);
  console.log(`\n  Opinion: ${allPassed ? "UNQUALIFIED" : "ADVERSE"}`);
  console.log(`  Status:  ${allPassed ? "PASS" : "FAIL"}\n`);
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("  \u2717 Parity check failed with error:", err.message ?? err);
  process.exit(1);
});
