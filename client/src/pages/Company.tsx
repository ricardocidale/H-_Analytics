/**
 * Company — Management company financial statements page
 *
 * Displays three tabs of the management company P&L and supporting analysis:
 *   Income        — Revenue (base + incentive fees), Cost of Services, G&A,
 *                   partner comp, staff costs, net income over the projection.
 *   Cash Flow     — GAAP indirect-method statement: OCF, investing, financing.
 *   Balance Sheet — Assets, liabilities, equity for the management entity.
 *
 * Capital Raise (formerly the "Tools" tab) now lives under the Simulation
 * section in the Analysis page alongside Sensitivity, Compare, Timeline,
 * and Financing tabs.
 *
 * Funding gate: generateCompanyProForma() returns zero revenue and zero
 * expenses for months before both companyOpsStartDate and safeTranche1Date.
 * analyzeCompanyCashPosition() surfaces any funding shortfall as a warning.
 *
 * Service templates: if centralized-services templates are configured in the
 * Company Assumptions > Service Categories section, they are passed to the engine
 * to compute vendor cost-of-services and gross profit before G&A.
 *
 * IRR / equity calculations use shared helpers from equityCalculations.ts.
 * All statement data is pre-generated in lib/company-data.ts to keep this
 * page free of inline financial logic.
 */
import React, { useState, useRef, useMemo, lazy, Suspense } from "react";
import { ExportDialog, type ExportVersion, type PremiumExportPayload } from "@/components/ExportDialog";
import { loadExportConfig } from "@/lib/exportConfig";
import { useQuery } from "@tanstack/react-query";
import { useExportSave } from "@/hooks/useExportSave";
import { isAdminRole, APP_BRAND_NAME, USE_SERVER_COMPUTE, USE_SERVER_EXPORTS } from "@shared/constants";
import Layout from "@/components/Layout";
import { useProperties, useGlobalAssumptions } from "@/lib/api";
import { generateCompanyProForma, generatePropertyProForma, formatMoney, getFiscalYearForModelYear } from "@/lib/financialEngine";
import { useServiceTemplates } from "@/lib/api/services";
import { useServerCompanyFinancials } from "@/hooks/useServerFinancials";
import { useAuth } from "@/lib/auth";
import { PROJECTION_YEARS } from "@/lib/constants";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconAlertTriangle, IconCheckCircle } from "@/components/icons";
import { ExportMenu, pdfAction, excelAction, csvAction, pptxAction, chartAction, pngAction, docxAction } from "@/components/ui/export-toolbar";
import { AnalystButton } from "@/components/intelligence/AnalystButton";
import { useLocation } from "wouter";
import { CalcDetailsProvider } from "@/components/financial-table";
import { Link } from "wouter";
import { AnimatedPage } from "@/components/graphics";
import { analyzeCompanyCashPosition } from "@/lib/financial/analyzeCompanyCashPosition";
import { CompanyHeader } from "@/components/company";

const CompanyIncomeTab = lazy(() => import("@/components/company/CompanyIncomeTab").then(m => ({ default: m.default })));
const CompanyCashFlowTab = lazy(() => import("@/components/company/CompanyCashFlowTab").then(m => ({ default: m.default })));
const CompanyBalanceSheet = lazy(() => import("@/components/company/CompanyBalanceSheet").then(m => ({ default: m.default })));
const CompanyBenchmarkPanel = lazy(() => import("@/components/company/CompanyBenchmarkPanel").then(m => ({ default: m.default })));
const CompanyInvestmentTab = lazy(() => import("@/components/company/CompanyInvestmentTab").then(m => ({ default: m.default })));
import { 
  generateCompanyIncomeData, 
  generateCompanyCashFlowData, 
  generateCompanyBalanceData 
} from "@/lib/company-data";
import {
  exportCompanyPDF,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  exportCompanyCSV,
  exportCompanyAllStatementsCSV,
  handleExcelExport,
  exportChartPNG,
  exportTablePNG,
  handlePPTXExport
} from "@/lib/exports/companyExports";

export default function Company() {
  const { data: properties, isLoading: propertiesLoading, isError: propertiesError } = useProperties();
  const { data: global, isLoading: globalLoading, isError: globalError } = useGlobalAssumptions();
  const { data: brandingData } = useQuery<{ themeColors: Array<{ rank: number; name: string; hexCode: string; description?: string }> | null }>({
    queryKey: ["my-branding"],
    queryFn: async () => { const res = await fetch("/api/my-branding", { credentials: "include" }); return res.json(); },
    staleTime: 5 * 60_000,
  });
  const { data: serviceTemplates } = useServiceTemplates();
  const { user } = useAuth();
  const isAdmin = user ? isAdminRole(user.role) : false;
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState("income");
  const [bsExpanded, setBsExpanded] = useState<Record<string, boolean>>({});
  const chartRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportType, setExportType] = useState<"pdf" | "xlsx" | "pptx" | "docx" | "chart">("pdf");
  const { requestSave, SaveDialog } = useExportSave();
  const [, navigate] = useLocation();

  const fundingLabel = global?.fundingSourceLabel ?? "Funding Vehicle";

  const toggleRow = (rowId: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  };

  const projectionYears = global?.projectionYears ?? PROJECTION_YEARS;
  const projectionMonths = projectionYears * 12;

  const serverCompany = useServerCompanyFinancials(
    USE_SERVER_COMPUTE ? properties : undefined,
    USE_SERVER_COMPUTE ? global : undefined,
  );

  const clientFinancials = useMemo(
    () => {
      if (USE_SERVER_COMPUTE) return [];
      if (!properties?.length || !global) return [];
      const templates = serviceTemplates?.map(t => ({
        ...t,
        serviceModel: t.serviceModel as 'centralized' | 'direct',
      }));
      const activeProps = properties.filter(p => p.isActive !== false);
      return generateCompanyProForma(activeProps, global, projectionMonths, templates);
    },
    [properties, global, projectionMonths, serviceTemplates]
  );

  const financials = USE_SERVER_COMPUTE ? serverCompany.companyMonthly : clientFinancials;

  const cashAnalysis = useMemo(
    () => analyzeCompanyCashPosition(financials),
    [financials]
  );

  const clientPropertyFinancials = useMemo(
    () => {
      if (USE_SERVER_COMPUTE) return [];
      if (!properties?.length || !global) return [];
      return properties.filter(p => p.isActive !== false).map(p => ({
        property: p,
        financials: generatePropertyProForma(p, global, projectionMonths)
      }));
    },
    [properties, global, projectionMonths]
  );

  const propertyFinancials = USE_SERVER_COMPUTE ? serverCompany.perPropertyFinancials : clientPropertyFinancials;
  
  const fiscalYearStartMonth = global?.fiscalYearStartMonth ?? 1;
  const getFiscalYear = (yearIndex: number) => global ? getFiscalYearForModelYear(global.modelStartDate, fiscalYearStartMonth, yearIndex) : yearIndex + 1;

  const yearlyChartData = useMemo(() => {
    if (!financials.length || !global) return [];
    const safeTranche1 = global.safeTranche1Amount || 0;
    const safeTranche2 = global.safeTranche2Amount || 0;
    const totalSafeFunding = safeTranche1 + safeTranche2;
    const data = [];
    for (let y = 0; y < projectionYears; y++) {
      const yearData = financials.slice(y * 12, (y + 1) * 12);
      if (yearData.length === 0) continue;
      const allMonthsToDate = financials.slice(0, (y + 1) * 12);
      const lastMonth = allMonthsToDate[allMonthsToDate.length - 1];
      const cumulativeNetIncome = allMonthsToDate.reduce((a, m) => a + m.netIncome, 0);
      const cashBalance = lastMonth?.endingCash ?? 0;
      const accruedInterest = lastMonth?.cumulativeAccruedInterest ?? 0;
      data.push({
        year: String(getFiscalYear(y)),
        Revenue: yearData.reduce((a, m) => a + m.totalRevenue, 0),
        BaseFees: yearData.reduce((a, m) => a + m.baseFeeRevenue, 0),
        IncentiveFees: yearData.reduce((a, m) => a + m.incentiveFeeRevenue, 0),
        Expenses: yearData.reduce((a, m) => a + m.totalExpenses, 0),
        OperatingIncome: yearData.reduce((a, m) => a + (m.totalRevenue - m.totalExpenses), 0),
        NetIncome: yearData.reduce((a, m) => a + m.netIncome, 0),
        Funding: yearData.reduce((a, m) => a + m.safeFunding, 0),
        CashFlow: yearData.reduce((a, m) => a + m.cashFlow, 0),
        EndingCash: cashBalance,
        Assets: cashBalance,
        Liabilities: totalSafeFunding + accruedInterest,
        Equity: cumulativeNetIncome,
      });
    }
    return data;
  }, [financials, projectionYears, global]);

  if (propertiesLoading || globalLoading || serverCompany.isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (propertiesError || globalError || serverCompany.isError) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
          <IconAlertTriangle className="w-8 h-8 text-destructive" />
          <p className="text-muted-foreground">
            {serverCompany.error?.message || "Failed to load company data. Please try refreshing the page."}
          </p>
        </div>
      </Layout>
    );
  }

  if (!properties || !global) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
          <h2 className="text-2xl font-display">Data Not Available</h2>
        </div>
      </Layout>
    );
  }

  const years = Array.from({ length: projectionYears }, (_, i) => getFiscalYear(i));

  const getStatementData = (type: string, summaryOnly?: boolean) => {
    switch (type) {
      case 'income':
        return generateCompanyIncomeData(financials, years, properties, propertyFinancials, summaryOnly);
      case 'cashflow':
        return generateCompanyCashFlowData(financials, years, properties, propertyFinancials, fundingLabel, summaryOnly);
      case 'balance':
        return generateCompanyBalanceData(financials, years, fundingLabel, summaryOnly);
      default:
        return { years: [], rows: [] };
    }
  };

  const companyName = global?.companyName || "Management Company";

  const handleExport = (orientation: 'landscape' | 'portrait', version?: 'short' | 'extended', customFilename?: string) => {
    if (exportType === 'pdf') {
      const summaryOnly = version === 'short';
      const incomeData = getStatementData('income', summaryOnly);
      const cashFlowData = getStatementData('cashflow', summaryOnly);
      const balanceData = getStatementData('balance', summaryOnly);
      exportCompanyPDF(activeTab as any, incomeData, global, projectionYears, yearlyChartData, orientation, customFilename, brandingData?.themeColors ?? undefined, {
        income: incomeData,
        cashflow: cashFlowData,
        balance: balanceData,
      });
    } else if (exportType === 'chart') {
      exportChartPNG(chartRef, orientation, companyName, customFilename);
    } else if (exportType === 'xlsx') {
      handleExcelExport(activeTab, financials, projectionYears, global, fiscalYearStartMonth, customFilename);
    } else if (exportType === 'pptx') {
      const incomeData = getStatementData('income');
      const cashFlowData = getStatementData('cashflow');
      const balanceData = getStatementData('balance');
      const fmt = (v: number) =>
        new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(v);
      const lastY = yearlyChartData[yearlyChartData.length - 1];
      const firstY = yearlyChartData[0];
      const kpiMetrics = yearlyChartData.length > 0 ? [
        { label: "Year 1 Total Revenue", value: firstY ? fmt(firstY.Revenue) : "—" },
        { label: "Year 1 Net Income", value: firstY ? fmt(firstY.NetIncome) : "—" },
        { label: "Year 1 Operating Cash Flow", value: firstY ? fmt(firstY.CashFlow) : "—" },
        { label: `Year ${projectionYears} Ending Cash`, value: lastY ? fmt(lastY.EndingCash) : "—" },
        { label: `${projectionYears}-Year Cumul. Revenue`, value: fmt(yearlyChartData.reduce((a, d) => a + (d.Revenue ?? 0), 0)) },
        { label: `${projectionYears}-Year Cumul. Net Income`, value: fmt(yearlyChartData.reduce((a, d) => a + (d.NetIncome ?? 0), 0)) },
      ] : undefined;
      handlePPTXExport(global, projectionYears, (i: number) => String(getFiscalYear(i)), incomeData, cashFlowData, balanceData, customFilename, brandingData?.themeColors ?? undefined, kpiMetrics);
    }
  };

  const tabLabel = activeTab === "income" ? "Income Statement" : activeTab === "cashflow" ? "Cash Flow" : activeTab === "investment" ? "Investment" : "Balance Sheet";

  const exportMenuNode = (
    <>
      <AnalystButton
        onClick={() => navigate(isAdmin ? "/company/assumptions?analyst=1" : "/company/guidance")}
        size="sm"
        variant="outline"
        tooltip={isAdmin
          ? "Open Company Assumptions and consult The Analyst for AI-backed market ranges across every field."
          : "Open AI Guidance to see The Analyst's recommended ranges for your company assumptions."}
        dataTestId="button-analyst-company"
      />
      <ExportMenu
      variant="light"
      actions={[
        pdfAction(() => { setExportType('pdf'); setExportDialogOpen(true); }),
        excelAction(() => { setExportType('xlsx'); setExportDialogOpen(true); }),
        csvAction(() => {
          if (USE_SERVER_EXPORTS) {
            requestSave(`${companyName} Financial Statements`, ".csv", async (customFilename) => {
              const res = await fetch("/api/exports/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ entityType: "company", format: "csv", reportScope: "all", version: "extended" }),
              });
              if (!res.ok) throw new Error("CSV export failed");
              const blob = await res.blob();
              const { saveFile } = await import("@/lib/exports/saveFile");
              await saveFile(blob, customFilename || `${companyName}_Financial_Statements.csv`);
            });
          } else {
            requestSave(`${companyName} Financial Statements`, ".csv", (f) =>
              exportCompanyAllStatementsCSV(
                getStatementData('income'),
                getStatementData('cashflow'),
                getStatementData('balance'),
                companyName, f
              )
            );
          }
        }),
        pptxAction(() => { setExportType('pptx'); setExportDialogOpen(true); }),
        docxAction(() => { setExportType('docx'); setExportDialogOpen(true); }),
        chartAction(() => { setExportType('chart'); setExportDialogOpen(true); }),
        pngAction(() => requestSave(`${companyName} ${tabLabel}`, ".png", (f) => exportTablePNG(tableRef, activeTab, companyName, f))),
      ]}
    />
    </>
  );

  return (
    <Layout>
      <AnimatedPage>
      {SaveDialog}
      <ExportDialog
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
        onExport={handleExport}
        title={exportType === "chart" ? "Export Chart" : `Export ${exportType.toUpperCase()}`}
        showVersionOption={exportType !== "chart"}
        allowShort={loadExportConfig().statements.allowShort}
        allowExtended={loadExportConfig().statements.allowExtended}
        premiumFormat={exportType === "chart" ? "pdf" : exportType as any}
        suggestedFilename={
          exportType === 'chart' ? `${companyName} Chart` : `${companyName} ${tabLabel}`
        }
        fileExtension={exportType === "chart" ? ".pdf" : `.${exportType}`}
        getPremiumExportData={exportType !== 'chart' ? (version: ExportVersion) => {
          const summaryOnly = version === "short";
          const incomeData = generateCompanyIncomeData(financials, years, properties, propertyFinancials, summaryOnly);
          const cashFlowData = generateCompanyCashFlowData(financials, years, properties, propertyFinancials, fundingLabel, summaryOnly);
          const balanceData = generateCompanyBalanceData(financials, years, fundingLabel, summaryOnly);
          const mapRows = (rows: any[]) => rows.map((r: any) => ({
            category: r.category,
            values: r.values,
            indent: r.indent,
            isBold: r.isBold ?? r.isHeader,
            isHeader: r.isHeader,
            isItalic: r.isItalic,
            format: r.format,
          }));
          return {
            entityName: companyName,
            companyName: global?.companyName || APP_BRAND_NAME,
            statementType: activeTab === "income" ? "Income Statement" : activeTab === "cashflow" ? "Cash Flow" : "Balance Sheet",
            statements: [
              { title: "Management Company Income Statement", years: incomeData.years.map(String), rows: mapRows(incomeData.rows) },
              { title: "Management Company Cash Flow", years: cashFlowData.years.map(String), rows: mapRows(cashFlowData.rows) },
              { title: "Management Company Balance Sheet", years: balanceData.years.map(String), rows: mapRows(balanceData.rows) },
            ],
            projectionYears,
            densePagination: loadExportConfig().statements.densePagination,
            themeColors: brandingData?.themeColors?.map((c: any) => ({ name: c.name, hexCode: c.hexCode, rank: c.rank })),
          } as PremiumExportPayload;
        } : undefined}
        serverExportConfig={exportType !== 'chart' ? { entityType: "company", reportScope: (activeTab === "income" || activeTab === "cashflow" || activeTab === "balance") ? activeTab : "all" } : undefined}
      />
      <div className="space-y-6">
        <CalcDetailsProvider show={global?.showCompanyCalculationDetails ?? true}>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <CompanyHeader
            global={global}
            properties={properties}
            yearlyChartData={yearlyChartData}
            cashAnalysis={cashAnalysis}
            projectionYears={projectionYears}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            chartRef={chartRef}
            exportMenuNode={exportMenuNode}
            isAdmin={isAdmin}
          />
          
          <Suspense fallback={<div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
          <div className="mt-4 mb-2">
            <CompanyBenchmarkPanel global={global} yearlyChartData={yearlyChartData} financials={financials} />
          </div>

          <TabsContent value="income" className="mt-6">
            <CompanyIncomeTab
              financials={financials}
              properties={properties}
              global={global}
              projectionYears={projectionYears}
              expandedRows={expandedRows}
              toggleRow={toggleRow}
              getFiscalYear={getFiscalYear}
              fundingLabel={fundingLabel}
              tableRef={tableRef}
              activeTab={activeTab}
              propertyFinancials={propertyFinancials}
              yearlyChartData={yearlyChartData}
            />
          </TabsContent>
          
          <TabsContent value="cashflow" className="mt-6">
            <CompanyCashFlowTab
              financials={financials}
              properties={properties}
              global={global}
              projectionYears={projectionYears}
              expandedRows={expandedRows}
              toggleRow={toggleRow}
              getFiscalYear={getFiscalYear}
              fundingLabel={fundingLabel}
              tableRef={tableRef}
              activeTab={activeTab}
              propertyFinancials={propertyFinancials}
              yearlyChartData={yearlyChartData}
            />
          </TabsContent>

          <TabsContent value="balance" className="mt-6">
            <CompanyBalanceSheet
              financials={financials}
              global={global}
              projectionYears={projectionYears}
              getFiscalYear={getFiscalYear}
              fundingLabel={fundingLabel}
              bsExpanded={bsExpanded}
              setBsExpanded={setBsExpanded}
              tableRef={tableRef}
              activeTab={activeTab}
              yearlyChartData={yearlyChartData}
            />
          </TabsContent>

          <TabsContent value="investment" className="mt-6">
            <CompanyInvestmentTab
              financials={financials}
              projectionYears={projectionYears}
              getFiscalYear={getFiscalYear}
              yearlyChartData={yearlyChartData}
              propertyFinancials={propertyFinancials}
              global={global}
              fundingLabel={fundingLabel}
              tableRef={tableRef}
              activeTab={activeTab}
            />
          </TabsContent>
          </Suspense>

          {!cashAnalysis.isAdequate ? (
            <div className="flex items-start gap-2 text-sm text-muted-foreground mt-4" data-testid="banner-company-cash-warning">
              <IconAlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
              <p>
                <span data-testid="text-company-cash-warning-title" className="font-medium text-destructive">Additional Funding Required:</span>{' '}
                The current {fundingLabel} funding of <span className="font-medium text-foreground">{formatMoney(cashAnalysis.totalFunding)}</span> is insufficient to cover operating expenses.
                Monthly cash position drops to <span className="font-medium text-destructive">{formatMoney(cashAnalysis.minCashPosition)}</span>
                {cashAnalysis.minCashMonth !== null && <> in month {cashAnalysis.minCashMonth}</>}.
                {' '}Suggested: Increase {fundingLabel} funding by at least{' '}
                <span className="font-medium text-foreground">{formatMoney(cashAnalysis.suggestedAdditionalFunding)}</span> in{' '}
                <Link href="/company/assumptions" className="font-medium text-secondary hover:underline">Company Assumptions</Link>.
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-2 text-sm text-muted-foreground mt-4" data-testid="banner-company-cash-adequate">
              <IconCheckCircle className="w-4 h-4 text-secondary flex-shrink-0 mt-0.5" />
              <p>
                <span data-testid="text-company-cash-adequate-title" className="font-medium text-secondary">Cash Position Adequate:</span>{' '}
                The {fundingLabel} funding of <span className="font-medium text-foreground">{formatMoney(cashAnalysis.totalFunding)}</span> covers all operating costs.
                {cashAnalysis.minCashMonth !== null && (
                  <> Minimum cash position: <span className="font-medium text-foreground">{formatMoney(cashAnalysis.minCashPosition)}</span> (month {cashAnalysis.minCashMonth}).</>
                )}
              </p>
            </div>
          )}
        </Tabs>
        </CalcDetailsProvider>
      </div>
      </AnimatedPage>
    </Layout>
  );
}

/* ModelInputGroup and ModelInputItem removed — non-admin users now navigate to /company/guidance */
