import { computePortfolioProjection, computeSingleProperty, computeCompanyProjection } from "../finance/service";
import { withModelConstants } from "../finance/apply-model-constants";
import { storage } from "../storage";
import type { PropertyInput, GlobalInput, CompanyYearlyFinancials } from "@engine/types";
import type { YearlyPropertyFinancials } from "@engine/aggregation/yearlyAggregator";
import { verifyExport } from "@calc/validation/export-verification";
import { logger } from "../logger";

interface ExportRow {
  category: string;
  values: (string | number)[];
  indent?: number;
  isBold?: boolean;
  isHeader?: boolean;
  isItalic?: boolean;
  format?: "currency" | "percentage" | "number" | "ratio" | "multiplier";
}

interface StatementSection {
  title: string;
  years: string[];
  rows: ExportRow[];
  includeTable?: boolean;
  includeChart?: boolean;
}

interface MetricEntry {
  label: string;
  value: string;
}

export interface ServerExportData {
  statements: StatementSection[];
  metrics: MetricEntry[];
  rows: ExportRow[];
  years: string[];
  outputHash: string;
  engineVersion: string;
  projectionYears: number;
  seasonalityProfile?: number[];
}

function yearLabels(projectionYears: number): string[] {
  return Array.from({ length: projectionYears }, (_, i) => `Year ${i + 1}`);
}

function row(category: string, values: (string | number)[], opts?: { indent?: number; isBold?: boolean; isHeader?: boolean; format?: ExportRow["format"] }): ExportRow {
  return { category, values, ...opts };
}

function yearlyValues(data: YearlyPropertyFinancials[], key: keyof YearlyPropertyFinancials): number[] {
  return data.map(y => {
    const v = y[key];
    return typeof v === "number" ? v : 0;
  });
}

function buildIncomeStatement(yearly: YearlyPropertyFinancials[], years: string[], summaryOnly = false): StatementSection {
  const rows: ExportRow[] = summaryOnly ? [
    row("Total Revenue", yearlyValues(yearly, "revenueTotal"), { isBold: true }),
    row("Gross Operating Profit (GOP)", yearlyValues(yearly, "gop"), { isBold: true }),
    row("Adjusted GOP (AGOP)", yearlyValues(yearly, "agop"), { isBold: true }),
    row("NOI", yearlyValues(yearly, "noi"), { isBold: true }),
    row("ANOI", yearlyValues(yearly, "anoi"), { isBold: true }),
    row("Net Income", yearlyValues(yearly, "netIncome"), { isBold: true }),
  ] : [
    row("Revenue", [], { isHeader: true }),
    row("Rooms Revenue", yearlyValues(yearly, "revenueRooms"), { indent: 1 }),
    row("Events Revenue", yearlyValues(yearly, "revenueEvents"), { indent: 1 }),
    row("F&B Revenue", yearlyValues(yearly, "revenueFB"), { indent: 1 }),
    row("Other Revenue", yearlyValues(yearly, "revenueOther"), { indent: 1 }),
    row("Total Revenue", yearlyValues(yearly, "revenueTotal"), { isBold: true }),

    row("Departmental Expenses", [], { isHeader: true }),
    row("Rooms Expense", yearlyValues(yearly, "expenseRooms"), { indent: 1 }),
    row("F&B Expense", yearlyValues(yearly, "expenseFB"), { indent: 1 }),
    row("Events Expense", yearlyValues(yearly, "expenseEvents"), { indent: 1 }),
    row("Other Expense", yearlyValues(yearly, "expenseOther"), { indent: 1 }),

    row("Undistributed Expenses", [], { isHeader: true }),
    row("Admin & General", yearlyValues(yearly, "expenseAdmin"), { indent: 1 }),
    row("Marketing", yearlyValues(yearly, "expenseMarketing"), { indent: 1 }),
    row("Property Operations", yearlyValues(yearly, "expensePropertyOps"), { indent: 1 }),
    row("Utilities", yearlyValues(yearly, "expenseUtilities"), { indent: 1 }),
    row("IT & Systems", yearlyValues(yearly, "expenseIT"), { indent: 1 }),
    row("Insurance", yearlyValues(yearly, "expenseInsurance"), { indent: 1 }),
    row("Other Costs", yearlyValues(yearly, "expenseOtherCosts"), { indent: 1 }),

    row("Gross Operating Profit (GOP)", yearlyValues(yearly, "gop"), { isBold: true }),
    row("Base Management Fee", yearlyValues(yearly, "feeBase"), { indent: 1 }),
    row("Incentive Management Fee", yearlyValues(yearly, "feeIncentive"), { indent: 1 }),
    row("Adjusted GOP (AGOP)", yearlyValues(yearly, "agop"), { isBold: true }),

    row("Property Taxes", yearlyValues(yearly, "expenseTaxes"), { indent: 1 }),
    row("NOI", yearlyValues(yearly, "noi"), { isBold: true }),

    row("FF&E Reserve", yearlyValues(yearly, "expenseFFE"), { indent: 1 }),
    row("ANOI", yearlyValues(yearly, "anoi"), { isBold: true }),

    row("Below the Line", [], { isHeader: true }),
    row("Interest Expense", yearlyValues(yearly, "interestExpense"), { indent: 1 }),
    row("Depreciation", yearlyValues(yearly, "depreciationExpense"), { indent: 1 }),
    row("Income Tax", yearlyValues(yearly, "incomeTax"), { indent: 1 }),
    row("Net Income", yearlyValues(yearly, "netIncome"), { isBold: true }),

    ...(yearly.some(y => (y as unknown as Record<string, number>).deferredFees > 0) ? [
      row("Fee Subordination", [], { isHeader: true }),
      row("Deferred Fees (this period)", yearly.map(y => (y as unknown as Record<string, number>).deferredFees ?? 0), { indent: 1 }),
      row("Cumulative Deferred Fees", yearly.map(y => (y as unknown as Record<string, number>).cumulativeDeferredFees ?? 0), { indent: 1 }),
    ] : []),
  ];

  return { title: "Income Statement", years, rows, includeTable: true, includeChart: true };
}

function buildCashFlowStatement(yearly: YearlyPropertyFinancials[], years: string[], summaryOnly = false): StatementSection {
  const rows: ExportRow[] = summaryOnly ? [
    row("Operating Cash Flow", yearlyValues(yearly, "operatingCashFlow"), { isBold: true }),
    row("Financing Cash Flow", yearlyValues(yearly, "financingCashFlow"), { isBold: true }),
    row("Cash Flow", yearlyValues(yearly, "cashFlow"), { isBold: true }),
    row("Ending Cash", yearlyValues(yearly, "endingCash"), { isBold: true }),
  ] : [
    row("Operating Activities", [], { isHeader: true }),
    row("Net Income", yearlyValues(yearly, "netIncome"), { indent: 1 }),
    row("Depreciation (add-back)", yearlyValues(yearly, "depreciationExpense"), { indent: 1 }),
    row("Operating Cash Flow", yearlyValues(yearly, "operatingCashFlow"), { isBold: true }),

    row("Financing Activities", [], { isHeader: true }),
    row("Principal Payment", yearlyValues(yearly, "principalPayment"), { indent: 1 }),
    row("Refinancing Proceeds", yearlyValues(yearly, "refinancingProceeds"), { indent: 1 }),
    row("Financing Cash Flow", yearlyValues(yearly, "financingCashFlow"), { isBold: true }),

    row("Cash Position", [], { isHeader: true }),
    row("Cash Flow", yearlyValues(yearly, "cashFlow"), { indent: 1 }),
    row("Ending Cash", yearlyValues(yearly, "endingCash"), { isBold: true }),
  ];

  return { title: "Cash Flow Statement", years, rows, includeTable: true, includeChart: true };
}

function buildMetrics(consolidated: YearlyPropertyFinancials[], propertyCount: number): MetricEntry[] {
  const y1 = consolidated[0];
  const yLast = consolidated[consolidated.length - 1];
  if (!y1 || !yLast) return [];

  const fmt = (v: number) => {
    const abs = Math.abs(v);
    if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `$${Math.round(v / 1e3).toLocaleString()}K`;
    return `$${v.toFixed(0)}`;
  };

  return [
    { label: "Total Properties", value: String(propertyCount) },
    { label: "Year 1 Revenue", value: fmt(y1.revenueTotal) },
    { label: `Year ${consolidated.length} Revenue`, value: fmt(yLast.revenueTotal) },
    { label: "Year 1 NOI", value: fmt(y1.noi) },
    { label: `Year ${consolidated.length} NOI`, value: fmt(yLast.noi) },
    { label: `Year ${consolidated.length} Net Income`, value: fmt(yLast.netIncome) },
    { label: `Year ${consolidated.length} Ending Cash`, value: fmt(yLast.endingCash) },
  ];
}

function buildCompanyStatement(yearly: CompanyYearlyFinancials[], years: string[], summaryOnly = false): StatementSection {
  const vals = (key: keyof CompanyYearlyFinancials) => yearly.map(y => {
    const v = y[key];
    return typeof v === "number" ? v : 0;
  });

  const rows: ExportRow[] = summaryOnly ? [
    row("Total Revenue", vals("totalRevenue"), { isBold: true }),
    row("Gross Profit", vals("grossProfit"), { isBold: true }),
    row("Total Operating Expenses", vals("totalExpenses"), { isBold: true }),
    row("Pre-Tax Income", vals("preTaxIncome"), { isBold: true }),
    row("Net Income", vals("netIncome"), { isBold: true }),
    row("Ending Cash", vals("endingCash"), { isBold: true }),
  ] : [
    row("Revenue", [], { isHeader: true }),
    row("Base Fee Revenue", vals("baseFeeRevenue"), { indent: 1 }),
    row("Incentive Fee Revenue", vals("incentiveFeeRevenue"), { indent: 1 }),
    row("Total Revenue", vals("totalRevenue"), { isBold: true }),

    row("Cost of Revenue", [], { isHeader: true }),
    row("Total Vendor Cost", vals("totalVendorCost"), { indent: 1 }),
    row("Gross Profit", vals("grossProfit"), { isBold: true }),

    row("Operating Expenses", [], { isHeader: true }),
    row("Partner Compensation", vals("partnerCompensation"), { indent: 1 }),
    row("Staff Compensation", vals("staffCompensation"), { indent: 1 }),
    row("Office Lease", vals("officeLease"), { indent: 1 }),
    row("Professional Services", vals("professionalServices"), { indent: 1 }),
    row("Tech Infrastructure", vals("techInfrastructure"), { indent: 1 }),
    row("Business Insurance", vals("businessInsurance"), { indent: 1 }),
    row("Travel Costs", vals("travelCosts"), { indent: 1 }),
    row("IT Licensing", vals("itLicensing"), { indent: 1 }),
    row("Marketing", vals("marketing"), { indent: 1 }),
    row("Miscellaneous Ops", vals("miscOps"), { indent: 1 }),
    row("Total Operating Expenses", vals("totalExpenses"), { isBold: true }),

    row("Below the Line", [], { isHeader: true }),
    row("Interest Expense", vals("fundingInterestExpense"), { indent: 1 }),
    row("Pre-Tax Income", vals("preTaxIncome"), { isBold: true }),
    row("Income Tax", vals("companyIncomeTax"), { indent: 1 }),
    row("Net Income", vals("netIncome"), { isBold: true }),

    row("Cash Position", [], { isHeader: true }),
    row("Capital Raise", vals("capitalRaiseFunding"), { indent: 1 }),
    row("Cash Flow", vals("cashFlow"), { indent: 1 }),
    row("Ending Cash", vals("endingCash"), { isBold: true }),
  ];

  return { title: "Management Company Income Statement", years, rows, includeTable: true, includeChart: true };
}

function buildCompanyCashFlowStatement(yearly: CompanyYearlyFinancials[], years: string[], summaryOnly = false): StatementSection {
  const vals = (key: keyof CompanyYearlyFinancials) => yearly.map(y => {
    const v = y[key];
    return typeof v === "number" ? v : 0;
  });

  const rows: ExportRow[] = summaryOnly ? [
    row("Net Income", vals("netIncome"), { isBold: true }),
    row("Cash Flow", vals("cashFlow"), { isBold: true }),
    row("Ending Cash", vals("endingCash"), { isBold: true }),
  ] : [
    row("Operating Activities", [], { isHeader: true }),
    row("Net Income", vals("netIncome"), { indent: 1 }),
    row("Capital Raise", vals("capitalRaiseFunding"), { indent: 1 }),
    row("Cash Flow", vals("cashFlow"), { isBold: true }),

    row("Cash Position", [], { isHeader: true }),
    row("Ending Cash", vals("endingCash"), { isBold: true }),
  ];

  return { title: "Management Company Cash Flow", years, rows, includeTable: true, includeChart: true };
}

function buildCompanyBalanceSheet(yearly: CompanyYearlyFinancials[], years: string[], summaryOnly = false): StatementSection {
  const vals = (key: keyof CompanyYearlyFinancials) => yearly.map(y => {
    const v = y[key];
    return typeof v === "number" ? v : 0;
  });

  const rows: ExportRow[] = summaryOnly ? [
    row("Ending Cash (Assets)", vals("endingCash"), { isBold: true }),
    row("Net Income (Equity)", vals("netIncome"), { isBold: true }),
  ] : [
    row("Assets", [], { isHeader: true }),
    row("Cash & Equivalents", vals("endingCash"), { indent: 1 }),
    row("Total Assets", vals("endingCash"), { isBold: true }),

    row("Equity", [], { isHeader: true }),
    row("Capital Raise (Cumulative)", vals("capitalRaiseFunding"), { indent: 1 }),
    row("Retained Earnings (Net Income)", vals("netIncome"), { indent: 1 }),
  ];

  return { title: "Management Company Balance Sheet", years, rows, includeTable: true };
}

function buildCompanyMetrics(yearly: CompanyYearlyFinancials[]): MetricEntry[] {
  const y1 = yearly[0];
  const yLast = yearly[yearly.length - 1];
  if (!y1 || !yLast) return [];

  const fmt = (v: number) => {
    const abs = Math.abs(v);
    if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `$${Math.round(v / 1e3).toLocaleString()}K`;
    return `$${v.toFixed(0)}`;
  };

  return [
    { label: "Year 1 Revenue", value: fmt(y1.totalRevenue) },
    { label: `Year ${yearly.length} Revenue`, value: fmt(yLast.totalRevenue) },
    { label: "Year 1 Net Income", value: fmt(y1.netIncome) },
    { label: `Year ${yearly.length} Net Income`, value: fmt(yLast.netIncome) },
    { label: `Year ${yearly.length} Ending Cash`, value: fmt(yLast.endingCash) },
  ];
}

function toPropertyInput(p: Record<string, unknown>): PropertyInput {
  return {
    ...p,
    operationsStartDate: p.operationsStartDate,
    roomCount: p.roomCount,
    startAdr: p.startAdr,
    adrGrowthRate: p.adrGrowthRate,
    startOccupancy: p.startOccupancy,
    maxOccupancy: p.maxOccupancy,
    occupancyRampMonths: p.occupancyRampMonths,
    occupancyGrowthStep: p.occupancyGrowthStep,
    purchasePrice: p.purchasePrice,
    type: p.type,
    costRateRooms: p.costRateRooms,
    costRateFB: p.costRateFB,
    costRateAdmin: p.costRateAdmin,
    costRateMarketing: p.costRateMarketing,
    costRatePropertyOps: p.costRatePropertyOps,
    costRateUtilities: p.costRateUtilities,
    costRateTaxes: p.costRateTaxes,
    costRateIT: p.costRateIT,
    costRateFFE: p.costRateFFE,
    costRateOther: p.costRateOther,
    costRateInsurance: p.costRateInsurance,
    revShareEvents: p.revShareEvents,
    revShareFB: p.revShareFB,
    revShareOther: p.revShareOther,
    id: p.id,
    name: p.name,
  } as PropertyInput;
}

function buildGlobalInput(globalAssumptions: Record<string, unknown>, projYears: number): GlobalInput {
  const dbDebt = globalAssumptions.debtAssumptions as Record<string, unknown> | null;
  return {
    modelStartDate: globalAssumptions.modelStartDate as string,
    inflationRate: Number(globalAssumptions.inflationRate),
    marketingRate: Number(globalAssumptions.marketingRate ?? 0.01),
    debtAssumptions: {
      interestRate: Number(dbDebt?.interestRate ?? 0.065),
      amortizationYears: Number(dbDebt?.amortizationYears ?? 25),
    },
    projectionYears: projYears,
  };
}

export type ExportVersion = "short" | "extended";
export type ReportScope = "all" | "income" | "cashflow" | "balance" | "overview" | "investment";

export interface BuildExportDataInput {
  userId: number;
  propertyIds?: number[];
  projectionYears?: number;
  version?: ExportVersion;
  reportScope?: ReportScope;
}

async function loadUserContext(userId: number, propertyIds?: number[]) {
  const allProperties = await storage.getAllProperties(userId);
  const globalAssumptions = await storage.getGlobalAssumptions(userId);

  if (!globalAssumptions) {
    throw new Error("No global assumptions found for user");
  }

  let propertiesToCompute = allProperties;
  if (propertyIds?.length) {
    const idSet = new Set(propertyIds);
    propertiesToCompute = allProperties.filter(p => idSet.has(p.id));
    if (propertiesToCompute.length === 0) {
      throw new Error("No matching properties found for the given IDs");
    }
  }

  const propertyInputs = propertiesToCompute.map(p => toPropertyInput(p as unknown as Record<string, unknown>));
  return { propertyInputs, globalAssumptions, allProperties };
}

function selectStatements(
  all: StatementSection[],
  scope: ReportScope,
): StatementSection[] {
  if (scope === "all" || scope === "overview" || scope === "investment") return all;
  const titleMap: Record<string, string> = {
    income: "Income Statement",
    cashflow: "Cash Flow",
    balance: "Balance Sheet",
  };
  const target = titleMap[scope];
  if (!target) return all;
  const filtered = all.filter(s => s.title.includes(target));
  return filtered.length > 0 ? filtered : all;
}

export async function buildExportData(
  input: BuildExportDataInput,
): Promise<ServerExportData> {
  const { propertyInputs, globalAssumptions } = await loadUserContext(input.userId, input.propertyIds);
  const summaryOnly = input.version === "short";
  const scope = input.reportScope ?? "all";

  const projYears = input.projectionYears ?? Number(globalAssumptions.projectionYears ?? 10);
  const globalInput = await withModelConstants(
    buildGlobalInput(globalAssumptions as unknown as Record<string, unknown>, projYears),
  );

  const result = computePortfolioProjection({
    properties: propertyInputs,
    globalAssumptions: globalInput,
    projectionYears: projYears,
  });

  const years = yearLabels(projYears);

  const incomeStatement = buildIncomeStatement(result.consolidatedYearly, years, summaryOnly);
  const cashFlowStatement = buildCashFlowStatement(result.consolidatedYearly, years, summaryOnly);

  const allStatements: StatementSection[] = [incomeStatement, cashFlowStatement];
  const statements = selectStatements(allStatements, scope);
  const metrics = buildMetrics(result.consolidatedYearly, result.propertyCount);

  const allRows = [...incomeStatement.rows, ...cashFlowStatement.rows];

  const y1 = result.consolidatedYearly[0];
  if (y1) {
    const verification = verifyExport({
      export_format: "pdf",
      export_source: "consolidated",
      expected_sections: ["Income Statement", "Cash Flow Statement"],
      actual_sections: statements.map(s => s.title),
      expected_year_count: projYears,
      actual_year_count: years.length,
      expected_property_count: propertyInputs.length,
      actual_property_count: result.propertyCount,
      sample_values: [
        { label: "Y1 Revenue", expected_value: y1.revenueTotal, exported_value: y1.revenueTotal },
        { label: "Y1 NOI", expected_value: y1.noi, exported_value: y1.noi },
        { label: "Y1 Net Income", expected_value: y1.netIncome, exported_value: y1.netIncome },
      ],
    });

    if (!verification.all_passed) {
      logger.warn(`Export verification warnings: ${verification.checks.filter(c => !c.passed).map(c => c.details).join("; ")}`, "server-export");
    }
  }

  return {
    statements,
    metrics,
    rows: allRows,
    years,
    outputHash: result.outputHash,
    engineVersion: result.engineVersion,
    projectionYears: projYears,
  };
}

export interface BuildPropertyExportDataInput {
  userId: number;
  propertyId: number;
  projectionYears?: number;
  version?: ExportVersion;
  reportScope?: ReportScope;
}

export async function buildPropertyExportData(
  input: BuildPropertyExportDataInput,
): Promise<ServerExportData> {
  const { propertyInputs, globalAssumptions, allProperties } = await loadUserContext(input.userId, [input.propertyId]);
  const summaryOnly = input.version === "short";
  const scope = input.reportScope ?? "all";

  if (propertyInputs.length === 0) {
    throw new Error(`Property ${input.propertyId} not found`);
  }

  const property = propertyInputs[0];
  const rawProperty = allProperties.find(p => p.id === input.propertyId);
  const projYears = input.projectionYears ?? Number(globalAssumptions.projectionYears ?? 10);
  const globalInput = await withModelConstants(
    buildGlobalInput(globalAssumptions as unknown as Record<string, unknown>, projYears),
  );

  const result = computeSingleProperty({
    property,
    globalAssumptions: globalInput,
    projectionYears: projYears,
  });

  const years = yearLabels(projYears);
  const incomeStatement = buildIncomeStatement(result.yearly, years, summaryOnly);
  const cashFlowStatement = buildCashFlowStatement(result.yearly, years, summaryOnly);

  incomeStatement.title = `${property.name} — Income Statement`;
  cashFlowStatement.title = `${property.name} — Cash Flow Statement`;

  const p = rawProperty as unknown as Record<string, unknown>;
  const profileRows: ExportRow[] = [
    row("Property Profile", [], { isHeader: true }),
    row("Name", [property.name ?? ""], { indent: 1 }),
    row("Business Model", [String(p.businessModel ?? "hotel")], { indent: 1 }),
    ...(p.pricingModel === "per_property" ? [
      row("Pricing", [`Per-property at $${p.nightlyPropertyRate ?? 0}/night`], { indent: 1 }),
      row("Max Guests", [String(p.maxGuests ?? "N/A")], { indent: 1 }),
    ] : []),
    ...(p.qualityTier ? [row("Quality Tier", [String(p.qualityTier)], { indent: 1 })] : []),
    ...(p.serviceLevel ? [row("Service Level", [String(p.serviceLevel)], { indent: 1 })] : []),
    ...(p.locationType ? [row("Location Type", [String(p.locationType)], { indent: 1 })] : []),
    ...(p.marketTier ? [row("Market Tier", [String(p.marketTier)], { indent: 1 })] : []),
    row("Rooms", [String(property.roomCount)], { indent: 1 }),
    ...(p.fbVenues ? [row("F&B Venues", [String(p.fbVenues)], { indent: 1 })] : []),
    ...(p.eventSpaceSqft ? [row("Event Space", [`${Number(p.eventSpaceSqft).toLocaleString()} sq ft`], { indent: 1 })] : []),
    ...(p.totalPropertyAcreage ? [row("Acreage", [String(p.totalPropertyAcreage)], { indent: 1 })] : []),
    ...(p.ownerPriorityReturn && Number(p.ownerPriorityReturn) > 0 ? [
      row("Owner Priority Return", [`${(Number(p.ownerPriorityReturn) * 100).toFixed(0)}%`], { indent: 1 }),
    ] : []),
    ...(p.feeSubordination && p.feeSubordination !== "none" ? [
      row("Fee Subordination", [String(p.feeSubordination)], { indent: 1 }),
    ] : []),
  ];
  const profileSection: StatementSection = { title: `${property.name} — Property Profile`, years: ["Value"], rows: profileRows };

  const allStatements: StatementSection[] = [profileSection, incomeStatement, cashFlowStatement];
  const statements = selectStatements(allStatements, scope);
  const metrics = buildMetrics(result.yearly, 1);
  const allRows = statements.flatMap(s => s.rows);

  const seasonality = rawProperty ? (rawProperty as Record<string, unknown>).seasonalityProfile : undefined;
  const seasonalityProfile = Array.isArray(seasonality) && seasonality.length === 12
    && seasonality.every((v: unknown) => typeof v === "number" && Number.isFinite(v))
    ? seasonality as number[]
    : undefined;

  return {
    statements,
    metrics,
    rows: allRows,
    years,
    outputHash: result.outputHash,
    engineVersion: result.engineVersion,
    projectionYears: projYears,
    seasonalityProfile,
  };
}

export interface BuildCompanyExportDataInput {
  userId: number;
  projectionYears?: number;
  version?: ExportVersion;
  reportScope?: ReportScope;
}

export async function buildCompanyExportData(
  input: BuildCompanyExportDataInput,
): Promise<ServerExportData> {
  const { propertyInputs, globalAssumptions } = await loadUserContext(input.userId);
  const summaryOnly = input.version === "short";
  const scope = input.reportScope ?? "all";

  const projYears = input.projectionYears ?? Number(globalAssumptions.projectionYears ?? 10);
  const globalInput = await withModelConstants(
    buildGlobalInput(globalAssumptions as unknown as Record<string, unknown>, projYears),
  );

  const result = computeCompanyProjection({
    properties: propertyInputs,
    globalAssumptions: globalInput,
    projectionYears: projYears,
  });

  const years = yearLabels(projYears);
  const companyIncomeStatement = buildCompanyStatement(result.companyYearly, years, summaryOnly);
  const companyCashFlow = buildCompanyCashFlowStatement(result.companyYearly, years, summaryOnly);
  const companyBalance = buildCompanyBalanceSheet(result.companyYearly, years, summaryOnly);

  const allStatements: StatementSection[] = [companyIncomeStatement, companyCashFlow, companyBalance];
  const statements = selectStatements(allStatements, scope);
  const companyMetrics = buildCompanyMetrics(result.companyYearly);
  const allRows = statements.flatMap(s => s.rows);

  return {
    statements,
    metrics: companyMetrics,
    rows: allRows,
    years,
    outputHash: result.outputHash,
    engineVersion: result.engineVersion,
    projectionYears: projYears,
  };
}
