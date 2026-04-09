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
import React, { useState, useRef, useMemo, useCallback, lazy, Suspense } from "react";
import { ExportDialog, type ExportVersion, type PremiumExportPayload } from "@/components/ExportDialog";
import { loadExportConfig } from "@/lib/exportConfig";
import { useQuery } from "@tanstack/react-query";
import { useExportSave } from "@/hooks/useExportSave";
import { UserRole, APP_BRAND_NAME, USE_SERVER_COMPUTE, USE_SERVER_EXPORTS } from "@shared/constants";
import Layout from "@/components/Layout";
import { useProperties, useGlobalAssumptions } from "@/lib/api";
import { generateCompanyProForma, generatePropertyProForma, formatMoney, getFiscalYearForModelYear } from "@/lib/financialEngine";
import { useServiceTemplates } from "@/lib/api/services";
import { useServerCompanyFinancials } from "@/hooks/useServerFinancials";
import { useAuth } from "@/lib/auth";
import { PROJECTION_YEARS } from "@/lib/constants";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ChevronDown, ChevronRight } from "@/components/icons/themed-icons";
import { IconAlertTriangle, IconCheckCircle } from "@/components/icons";
import { ExportMenu, pdfAction, excelAction, csvAction, pptxAction, chartAction, pngAction, docxAction } from "@/components/ui/export-toolbar";
import { CalcDetailsProvider } from "@/components/financial-table";
import { Link } from "wouter";
import { AnimatedPage } from "@/components/graphics";
import { analyzeCompanyCashPosition } from "@/lib/financial/analyzeCompanyCashPosition";
import { CompanyHeader } from "@/components/company";

const CompanyIncomeTab = lazy(() => import("@/components/company/CompanyIncomeTab").then(m => ({ default: m.default })));
const CompanyCashFlowTab = lazy(() => import("@/components/company/CompanyCashFlowTab").then(m => ({ default: m.default })));
const CompanyBalanceSheet = lazy(() => import("@/components/company/CompanyBalanceSheet").then(m => ({ default: m.default })));
const CompanyBenchmarkPanel = lazy(() => import("@/components/company/CompanyBenchmarkPanel").then(m => ({ default: m.default })));
import { 
  generateCompanyIncomeData, 
  generateCompanyCashFlowData, 
  generateCompanyBalanceData 
} from "@/lib/company-data";
import {
  exportCompanyPDF,
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
  const isAdmin = user?.role === UserRole.ADMIN;
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState("income");
  const [bsExpanded, setBsExpanded] = useState<Record<string, boolean>>({});
  const chartRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportType, setExportType] = useState<"pdf" | "xlsx" | "pptx" | "docx" | "chart">("pdf");
  const [modelInputsOpen, setModelInputsOpen] = useState(false);
  const { requestSave, SaveDialog } = useExportSave();
  const modelInputsRef = useRef<HTMLDivElement>(null);

  const handleOpenModelInputs = useCallback(() => {
    setModelInputsOpen(true);
    setTimeout(() => {
      modelInputsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }, []);

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
      return generateCompanyProForma(properties, global, projectionMonths, templates);
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
      return properties.map(p => ({
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

  const tabLabel = activeTab === "income" ? "Income Statement" : activeTab === "cashflow" ? "Cash Flow" : "Balance Sheet";

  const exportMenuNode = (
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
            onOpenModelInputs={handleOpenModelInputs}
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
          </Suspense>

          {!isAdmin && (
            <div ref={modelInputsRef} className="mt-6" data-testid="panel-model-inputs">
              <Card className="bg-card border-border shadow-sm">
                <CardHeader
                  className="cursor-pointer select-none"
                  onClick={() => setModelInputsOpen(!modelInputsOpen)}
                  data-testid="button-toggle-model-inputs"
                >
                  <CardTitle className="flex items-center gap-2 text-base font-display">
                    {modelInputsOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    Model Inputs
                    <span className="text-xs font-normal text-muted-foreground ml-1">(read-only)</span>
                  </CardTitle>
                </CardHeader>
                {modelInputsOpen && (
                  <CardContent className="space-y-5">
                    <ModelInputGroup label="Revenue">
                      <ModelInputItem label="Base Fee" value={`${((global?.baseManagementFee ?? 0) * 100).toFixed(1)}%`} testId="mi-base-fee" />
                      <ModelInputItem label="Incentive Fee" value={`${((global?.incentiveManagementFee ?? 0) * 100).toFixed(1)}%`} testId="mi-incentive-fee" />
                    </ModelInputGroup>

                    <ModelInputGroup label="Funding">
                      <ModelInputItem label="Funding Source" value={fundingLabel} testId="mi-funding-source" />
                      <ModelInputItem label="SAFE Tranche 1" value={formatMoney(global?.safeTranche1Amount ?? 0)} testId="mi-safe-t1" />
                      <ModelInputItem label="SAFE Tranche 2" value={formatMoney(global?.safeTranche2Amount ?? 0)} testId="mi-safe-t2" />
                    </ModelInputGroup>

                    <ModelInputGroup label="People">
                      <ModelInputItem label="Partners (Year 1)" value={String(global?.partnerCountYear1 ?? 3)} testId="mi-partner-count" />
                      <ModelInputItem label="Staff Salary" value={formatMoney(global?.staffSalary ?? 0)} testId="mi-staff-salary" />
                      <ModelInputItem label="Tier 1 FTE" value={`${global?.staffTier1Fte ?? 0} (≤${global?.staffTier1MaxProperties ?? 0} properties)`} testId="mi-staff-fte-t1" />
                      <ModelInputItem label="Tier 2 FTE" value={`${global?.staffTier2Fte ?? 0} (≤${global?.staffTier2MaxProperties ?? 0} properties)`} testId="mi-staff-fte-t2" />
                      <ModelInputItem label="Tier 3 FTE" value={String(global?.staffTier3Fte ?? 0)} testId="mi-staff-fte-t3" />
                    </ModelInputGroup>

                    <ModelInputGroup label="Overhead">
                      <ModelInputItem label="Office Lease" value={`${formatMoney(global?.officeLeaseStart ?? 0)}/yr`} testId="mi-office-lease" />
                      <ModelInputItem label="Professional Services" value={`${formatMoney(global?.professionalServicesStart ?? 0)}/yr`} testId="mi-prof-services" />
                      <ModelInputItem label="Tech Infrastructure" value={`${formatMoney(global?.techInfraStart ?? 0)}/yr`} testId="mi-tech-infra" />
                      <ModelInputItem label="Escalation Rate" value={`${((global?.fixedCostEscalationRate ?? 0) * 100).toFixed(1)}%`} testId="mi-escalation-rate" />
                    </ModelInputGroup>

                    <ModelInputGroup label="Tax & General">
                      <ModelInputItem label="Company Tax Rate" value={`${((global?.companyTaxRate ?? 0) * 100).toFixed(0)}%`} testId="mi-tax-rate" />
                      <ModelInputItem label="Inflation Rate" value={`${((global?.inflationRate ?? 0) * 100).toFixed(1)}%`} testId="mi-inflation" />
                      <ModelInputItem label="Projection Years" value={String(projectionYears)} testId="mi-projection-years" />
                    </ModelInputGroup>

                    <div className="pt-2 border-t border-border/60">
                      <p className="text-xs text-muted-foreground" data-testid="text-edit-assumptions-hint">
                        These values are configured by an administrator on the{" "}
                        <span className="font-medium text-foreground">Company Assumptions</span> page.
                      </p>
                    </div>
                  </CardContent>
                )}
              </Card>
            </div>
          )}

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

function ModelInputGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2" data-testid={`mi-group-${label.toLowerCase().replace(/\s+/g, '-')}`}>{label}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {children}
      </div>
    </div>
  );
}

function ModelInputItem({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="rounded-lg bg-muted/50 border border-border/60 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
      <p className="text-sm font-semibold text-foreground mt-0.5" data-testid={testId}>{value}</p>
    </div>
  );
}
