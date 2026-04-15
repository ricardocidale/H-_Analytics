/**
 * Dashboard.tsx — Main portfolio dashboard and the default landing page after login.
 *
 * This is the most data-dense page in the application. It consolidates financial
 * data from ALL properties in the portfolio and presents:
 *
 * Overview tab:
 *   • KPI cards — total revenue, GOP, active properties, management fees,
 *     portfolio IRR, equity multiple, cash-on-cash return, projected exit value
 *   • Revenue breakdown donut chart (rooms, events, F&B, other)
 *   • Market distribution donut chart (geographic spread of properties)
 *   • Revenue vs NOI trend line chart
 *   • Investment overview panel (total investment, avg price, rooms, ADR, horizon)
 *
 * Income Statement tab:
 *   • Consolidated multi-year income statement across all properties
 *   • Expandable rows drilling into per-property revenue and GOP
 *   • Exports to PDF (with chart page), CSV, Excel, PowerPoint, PNG
 *
 * Cash Flow tab:
 *   • Three-section cash flow (operating, investing, financing)
 *   • Per-property drill-down and equity/debt contribution timeline
 *
 * Balance Sheet tab:
 *   • Consolidated balance sheet using the ConsolidatedBalanceSheet component
 *
 * Investment Analysis tab:
 *   • IRR, equity multiple, cash-on-cash, and sensitivity analysis
 *
 * All six export formats (PDF, Excel, CSV, PPTX, Chart PNG, Table PNG) are
 * available from the tab bar. Data generators live in dashboardExports.ts.
 */
import { APP_BRAND_NAME, USE_SERVER_EXPORTS } from "@shared/constants";
import React, { useState, useRef, useCallback, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useExportSave } from "@/hooks/useExportSave";
import Layout from "@/components/Layout";
import { useProperties, useGlobalAssumptions } from "@/lib/api";
import { getFiscalYearForModelYear } from "@/lib/financialEngine";
import { Tabs, TabsContent, CurrentThemeTab } from "@/components/ui/tabs";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconAlertTriangle, IconDashboard, IconIncomeStatement, IconCashFlow, IconBalanceSheet, IconInvestment } from "@/components/icons";
import { PageHeader } from "@/components/ui/page-header";
import { PROJECTION_YEARS } from "@/lib/constants";
import { AnimatedPage, ScrollReveal } from "@/components/graphics";
import { ExportDialog, type ExportVersion, type PremiumExportPayload } from "@/components/ExportDialog";
import { loadExportConfig } from "@/lib/exportConfig";
import { ExportMenu, pdfAction, excelAction, csvAction, pptxAction, chartAction, pngAction, docxAction } from "@/components/ui/export-toolbar";
import { exportTablePNG } from "@/lib/exports/pngExport";
import { captureOverviewCharts } from "@/lib/exports/captureOverviewCharts";
import { format } from "date-fns";
import {
  usePortfolioFinancials,
  generatePortfolioIncomeData,
  generatePortfolioCashFlowData,
  generatePortfolioInvestmentData,
  generatePortfolioBalanceSheetData,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  exportPortfolioCSV,
  exportAllPortfolioStatementsCSV,
  exportPortfolioPDF,
  buildAllPortfolioStatements,
  exportPortfolioExcel,
  toExportData,
  buildOverviewExportData,
  exportOverviewCSV,
} from "@/components/dashboard";

const OverviewTab = lazy(() => import("@/components/dashboard/OverviewTab").then(m => ({ default: m.OverviewTab })));
const IncomeStatementTab = lazy(() => import("@/components/dashboard/IncomeStatementTab").then(m => ({ default: m.IncomeStatementTab })));
const CashFlowTab = lazy(() => import("@/components/dashboard/CashFlowTab").then(m => ({ default: m.CashFlowTab })));
const BalanceSheetTab = lazy(() => import("@/components/dashboard/BalanceSheetTab").then(m => ({ default: m.BalanceSheetTab })));
const InvestmentAnalysisTab = lazy(() => import("@/components/dashboard/InvestmentAnalysisTab").then(m => ({ default: m.InvestmentAnalysisTab })));


const TAB_LABELS: Record<string, string> = {
  overview: "Portfolio Overview",
  income: "Consolidated Income Statement",
  cashflow: "Consolidated Cash Flow",
  balance: "Consolidated Balance Sheet",
  investment: "Investment Analysis",
};

export default function Dashboard() {
  const { data: properties, isLoading: propertiesLoading, isError: propertiesError } = useProperties();
  const { data: global, isLoading: globalLoading, isError: globalError } = useGlobalAssumptions();
  const [activeTab, setActiveTab] = useState("overview");
  const tabContentRef = useRef<HTMLDivElement>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportType, setExportType] = useState<"pdf" | "xlsx" | "pptx" | "docx" | "chart">("pdf");
  const { requestSave, SaveDialog } = useExportSave();

  const { financials, isLoading: financialsLoading, isError: financialsError } = usePortfolioFinancials(properties, global);
  const { data: branding } = useQuery<{ themeColors: Array<{ rank: number; name: string; hexCode: string; description?: string }> | null }>({
    queryKey: ["/api/my-branding"],
    staleTime: 5 * 60_000,
  });

  const activeProperties = properties?.filter(p => p.isActive !== false) ?? [];
  const hasActiveProperties = activeProperties.length > 0;
  const propertiesLoadingState = propertiesLoading || globalLoading || financialsLoading;
  const propertiesErrorState = propertiesError || globalError || financialsError || !properties || !global || (hasActiveProperties && !financials);

  const getExportData = useCallback((version?: ExportVersion) => {
    if (!financials || !properties || !global) return null;
    const projectionYears = global.projectionYears ?? PROJECTION_YEARS;
    const fiscalYearStartMonth = global.fiscalYearStartMonth ?? 1;
    const getFiscalYear = (i: number) => getFiscalYearForModelYear(global.modelStartDate, fiscalYearStartMonth, i);
    const isShort = version === "short";

    if (activeTab === "income") {
      return generatePortfolioIncomeData(financials.yearlyConsolidatedCache, projectionYears, getFiscalYear, isShort);
    } else if (activeTab === "cashflow") {
      const override = isShort ? new Set<string>() : new Set(["cfo", "cfi", "cff"]);
      return generatePortfolioCashFlowData(financials.allPropertyYearlyCF, projectionYears, getFiscalYear, override, isShort, properties.map(p => p.name), financials.yearlyConsolidatedCache);
    } else if (activeTab === "balance") {
      const msd = global.modelStartDate ? new Date(global.modelStartDate) : undefined;
      return generatePortfolioBalanceSheetData(financials.allPropertyFinancials, projectionYears, getFiscalYear, msd, isShort);
    } else if (activeTab === "investment") {
      return generatePortfolioInvestmentData(financials, properties, projectionYears, getFiscalYear);
    }
    return generatePortfolioIncomeData(financials.yearlyConsolidatedCache, projectionYears, getFiscalYear, isShort);
  }, [activeTab, financials, properties, global]);

  const handleExportPNG = useCallback(() => {
    if (tabContentRef.current) {
      const label = TAB_LABELS[activeTab] || "Portfolio Dashboard";
      requestSave(label, ".png", (f) => exportTablePNG({ element: tabContentRef.current!, filename: f || `${label.toLowerCase().replace(/\s+/g, "-")}.png` }));
    }
  }, [activeTab, requestSave]);

  const _handleExportChartPNG = useCallback(async (customFilename?: string) => {
    if (!tabContentRef.current) return;
    try {
      const label = TAB_LABELS[activeTab] || "Portfolio Dashboard";
      const { captureToPng } = await import("@/lib/exports/domCapture");
      const dataUrl = await captureToPng(tabContentRef.current, { quality: 1, bgcolor: '#ffffff' });
      const { saveDataUrl } = await import("@/lib/exports/saveFile");
      await saveDataUrl(dataUrl, customFilename || `${label.toLowerCase().replace(/\s+/g, "-")}-chart.png`);
    } catch (error: unknown) {
      console.error("Chart PNG export failed:", error);
    }
  }, [activeTab]);

  const handleExportPDF = useCallback(() => {
    setExportType("pdf");
    setExportDialogOpen(true);
  }, []);

  const handleExportChart = useCallback(() => {
    setExportType("chart");
    setExportDialogOpen(true);
  }, []);

  const handleExportConfirm = useCallback(async (orientation: "landscape" | "portrait", version: ExportVersion, customFilename?: string) => {
    if (!financials || !global) return;
    const projectionYears = global.projectionYears ?? PROJECTION_YEARS;
    const fiscalYearStartMonth = global.fiscalYearStartMonth ?? 1;
    const getFiscalYear = (i: number) => getFiscalYearForModelYear(global.modelStartDate, fiscalYearStartMonth, i);
    const overviewData = buildOverviewExportData(financials, properties!, projectionYears, getFiscalYear);

    if (exportType === "pdf") {
      if (activeTab === "overview") {
        const { exportDashboardComprehensivePDF } = await import("@/components/dashboard/exportRenderers");
        const isShort = version === "short";
        const incomeRows = generatePortfolioIncomeData(financials.yearlyConsolidatedCache, projectionYears, getFiscalYear, isShort).rows;
        await exportDashboardComprehensivePDF({
          financials, properties: properties!, projectionYears, getFiscalYear,
          companyName: global.companyName || APP_BRAND_NAME,
          incomeRows,
          modelStartDate: global.modelStartDate ? new Date(global.modelStartDate) : undefined,
          themeColors: branding?.themeColors ?? undefined,
          overviewOnly: true,
          overviewData,
          version,
        }, customFilename);
      } else if (activeTab === "investment") {
        const data = generatePortfolioInvestmentData(financials, properties!, projectionYears, getFiscalYear);
        exportPortfolioPDF(orientation, projectionYears, data.years, data.rows, (i) => financials.yearlyConsolidatedCache[i], "Investment Analysis", undefined, customFilename, branding?.themeColors ?? undefined);
      } else {
        const { exportDashboardComprehensivePDF } = await import("@/components/dashboard/exportRenderers");
        const isShort = version === "short";
        const incomeRows = generatePortfolioIncomeData(financials.yearlyConsolidatedCache, projectionYears, getFiscalYear, isShort).rows;
        await exportDashboardComprehensivePDF({
          financials, properties: properties!, projectionYears, getFiscalYear,
          companyName: global.companyName || APP_BRAND_NAME,
          incomeRows,
          modelStartDate: global.modelStartDate ? new Date(global.modelStartDate) : undefined,
          themeColors: branding?.themeColors ?? undefined,
          statementsOnly: true,
          version,
        }, customFilename);
      }
    } else if (exportType === "chart") {
      if (!tabContentRef.current) return;
      const label = TAB_LABELS[activeTab] || "Portfolio Dashboard";
      const { captureToPng } = await import("@/lib/exports/domCapture");
      const { default: jsPDF } = await import("jspdf");
      const dataUrl = await captureToPng(tabContentRef.current, { quality: 1, bgcolor: '#ffffff' });
      const img = new Image();
      img.src = dataUrl;
      await new Promise<void>((resolve) => { img.onload = () => resolve(); });
      const aspectRatio = img.width / img.height;
      const { PAGE_DIMS } = await import("@/lib/exports/exportStyles");
      const dims = orientation === "landscape"
        ? { w: PAGE_DIMS.LANDSCAPE_W, h: PAGE_DIMS.LANDSCAPE_H }
        : { w: PAGE_DIMS.PORTRAIT_W, h: PAGE_DIMS.PORTRAIT_H };
      const doc = new jsPDF({ orientation, unit: "mm", format: [dims.w, dims.h] });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 14;
      doc.setFontSize(16);
      doc.text(label, margin, 15);
      doc.setFontSize(9);
      doc.text(`Generated: ${format(new Date(), "MMM d, yyyy")}`, margin, 21);
      const availW = pageW - margin * 2;
      const availH = pageH - 30;
      let imgW = availW;
      let imgH = imgW / aspectRatio;
      if (imgH > availH) { imgH = availH; imgW = imgH * aspectRatio; }
      doc.addImage(dataUrl, "PNG", margin, 25, imgW, imgH);
      const { saveFile } = await import("@/lib/exports/saveFile");
      await saveFile(doc.output("blob"), customFilename || `${label.toLowerCase().replace(/\s+/g, "-")}-chart.pdf`);
    } else if (exportType === "xlsx") {
      const companyName = global?.companyName || "Portfolio";
      const modelStartDate = global.modelStartDate ? new Date(global.modelStartDate) : undefined;
      const datasets = await buildAllPortfolioStatements(financials, properties!, projectionYears, getFiscalYear, modelStartDate);
      await exportPortfolioExcel(datasets, companyName, customFilename, overviewData);
    } else if (exportType === "pptx") {
      const companyName = global?.companyName || "Portfolio";
      const modelStartDate = global.modelStartDate ? new Date(global.modelStartDate) : undefined;
      const datasets = await buildAllPortfolioStatements(financials, properties!, projectionYears, getFiscalYear, modelStartDate);
      const { exportPortfolioPPTX } = await import("@/lib/exports/pptxExport");
      await exportPortfolioPPTX({
        projectionYears,
        getFiscalYear,
        totalInitialEquity: financials.totalInitialEquity,
        totalExitValue: financials.totalExitValue,
        equityMultiple: financials.equityMultiple,
        portfolioIRR: financials.portfolioIRR,
        cashOnCash: financials.cashOnCash,
        totalProperties: properties!.filter(p => p.isActive !== false).length,
        totalRooms: financials.totalRooms,
        totalProjectionRevenue: financials.totalProjectionRevenue,
        totalProjectionNOI: financials.totalProjectionNOI,
        totalProjectionCashFlow: financials.totalProjectionCashFlow,
        incomeData: toExportData(datasets.incomeData),
        cashFlowData: toExportData(datasets.cashFlowData),
        balanceSheetData: toExportData(datasets.balanceSheetData),
        investmentData: toExportData(datasets.investmentData),
        overviewData,
      }, companyName, customFilename, branding?.themeColors ?? undefined);
    }
  }, [exportType, activeTab, financials, global, properties, getExportData, branding]);

  const handleExportExcel = useCallback(() => {
    setExportType("xlsx");
    setExportDialogOpen(true);
  }, []);

  const handleExportCSV = useCallback(() => {
    if (!financials || !global || !properties) return;

    if (USE_SERVER_EXPORTS) {
      requestSave("Portfolio Financial Statements", ".csv", async (customFilename) => {
        const res = await fetch("/api/exports/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ entityType: "portfolio", format: "csv", reportScope: "all", version: "extended" }),
        });
        if (!res.ok) throw new Error("CSV export failed");
        const blob = await res.blob();
        const { saveFile } = await import("@/lib/exports/saveFile");
        await saveFile(blob, customFilename || "Portfolio-Financial-Statements.csv");
      });
      return;
    }

    const projectionYears = global.projectionYears ?? PROJECTION_YEARS;
    const fiscalYearStartMonth = global.fiscalYearStartMonth ?? 1;
    const getFiscalYear = (i: number) => getFiscalYearForModelYear(global.modelStartDate, fiscalYearStartMonth, i);
    const modelStartDate = global.modelStartDate ? new Date(global.modelStartDate) : undefined;

    if (activeTab === "overview") {
      const ovData = buildOverviewExportData(financials, properties, projectionYears, getFiscalYear);
      const incomeResult = generatePortfolioIncomeData(financials.yearlyConsolidatedCache, projectionYears, getFiscalYear, false);
      requestSave("Portfolio Overview", ".csv", (f) =>
        exportOverviewCSV(ovData, incomeResult.rows, incomeResult.years, f || "Portfolio-Overview.csv")
      );
      return;
    }

    const incomeData = generatePortfolioIncomeData(financials.yearlyConsolidatedCache, projectionYears, getFiscalYear, false);
    const cashFlowData = generatePortfolioCashFlowData(financials.allPropertyYearlyCF, projectionYears, getFiscalYear, new Set(["cfo", "cfi", "cff"]), false, properties.map(p => p.name), financials.yearlyConsolidatedCache);
    const balanceSheetData = generatePortfolioBalanceSheetData(financials.allPropertyFinancials, projectionYears, getFiscalYear, modelStartDate, false);
    const investmentData = generatePortfolioInvestmentData(financials, properties, projectionYears, getFiscalYear);

    requestSave("Portfolio All Statements", ".csv", (f) =>
      exportAllPortfolioStatementsCSV(
        { years: incomeData.years, rows: incomeData.rows },
        { years: cashFlowData.years, rows: cashFlowData.rows },
        { years: balanceSheetData.years, rows: balanceSheetData.rows },
        { years: investmentData.years, rows: investmentData.rows },
        f || "Portfolio-All-Statements.csv"
      )
    );
  }, [activeTab, financials, global, properties, requestSave]);

  const handleExportPPTX = useCallback(() => {
    setExportType("pptx");
    setExportDialogOpen(true);
  }, []);

  const handleExportDOCX = useCallback(() => {
    setExportType("docx");
    setExportDialogOpen(true);
  }, []);

  if (propertiesLoadingState) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (propertiesErrorState) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
          <IconAlertTriangle className="w-8 h-8 text-destructive" />
          <p className="text-muted-foreground">
            {!properties || !global
              ? "No data available. Please check the database."
              : "Failed to load dashboard data. Please try refreshing the page."}
          </p>
        </div>
      </Layout>
    );
  }

  if (!financials) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
          <p className="text-muted-foreground" data-testid="text-no-active-properties">No active properties in the portfolio. Activate at least one property to see financial data.</p>
        </div>
      </Layout>
    );
  }

  const projectionYears = global.projectionYears ?? PROJECTION_YEARS;
  const fiscalYearStartMonth = global.fiscalYearStartMonth ?? 1;
  const getFiscalYear = (yearIndex: number) => getFiscalYearForModelYear(global.modelStartDate, fiscalYearStartMonth, yearIndex);
  const showCalcDetails = global.showCompanyCalculationDetails ?? true;

  const tabProps = {
    financials,
    properties,
    projectionYears,
    getFiscalYear,
    showCalcDetails,
    global
  };

  return (
    <Layout>
      <AnimatedPage>
        <div className="relative z-10 space-y-8">
          <PageHeader
            title="Portfolio Performance"
            subtitle="Consolidated financial oversight across all active assets"
          />

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="mb-6 sticky top-12 z-10">
              <CurrentThemeTab
                activeTab={activeTab}
                onTabChange={setActiveTab}
                tabs={[
                  { value: "overview", label: "Overview", icon: IconDashboard },
                  { value: "income", label: "Income Statement", icon: IconIncomeStatement },
                  { value: "cashflow", label: "Cash Flow", icon: IconCashFlow },
                  { value: "balance", label: "Balance Sheet", icon: IconBalanceSheet },
                  { value: "investment", label: "Investment Analysis", icon: IconInvestment },
                ]}
                rightContent={
                  <>
                    <ExportMenu
                      variant="light"
                      actions={[
                        pdfAction(handleExportPDF),
                        excelAction(handleExportExcel),
                        csvAction(handleExportCSV),
                        pptxAction(handleExportPPTX),
                        docxAction(handleExportDOCX),
                        chartAction(handleExportChart),
                        pngAction(handleExportPNG, "button-export-dashboard-png"),
                      ]}
                    />
                    {SaveDialog}
                  </>
                }
              />
            </div>

            <Suspense fallback={<div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
            <ScrollReveal>
              <div ref={tabContentRef}>
                <TabsContent value="overview" className="mt-0 focus-visible:outline-none">
                  <OverviewTab {...tabProps} />
                </TabsContent>

                <TabsContent value="income" className="mt-0 focus-visible:outline-none">
                  <IncomeStatementTab {...tabProps} />
                </TabsContent>

                <TabsContent value="cashflow" className="mt-0 focus-visible:outline-none">
                  <CashFlowTab {...tabProps} />
                </TabsContent>

                <TabsContent value="balance" className="mt-0 focus-visible:outline-none">
                  <BalanceSheetTab {...tabProps} />
                </TabsContent>

                <TabsContent value="investment" className="mt-0 focus-visible:outline-none">
                  <InvestmentAnalysisTab {...tabProps} />
                </TabsContent>
              </div>
            </ScrollReveal>
            </Suspense>
          </Tabs>
        </div>
      </AnimatedPage>

      <ExportDialog
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
        onExport={handleExportConfirm}
        title={exportType === "chart" ? "Export Chart as Image" : `Export ${exportType.toUpperCase()}`}
        showVersionOption={exportType !== "chart"}
        allowShort={(() => { const cfg = loadExportConfig(); return activeTab === "overview" ? cfg.overview.allowShort : activeTab === "investment" ? cfg.analysis.allowShort : cfg.statements.allowShort; })()}
        allowExtended={(() => { const cfg = loadExportConfig(); return activeTab === "overview" ? cfg.overview.allowExtended : activeTab === "investment" ? cfg.analysis.allowExtended : cfg.statements.allowExtended; })()}
        premiumFormat={exportType === "chart" ? "pdf" : exportType as any}
        suggestedFilename={TAB_LABELS[activeTab] || "Portfolio"}
        fileExtension={exportType === "chart" ? ".pdf" : `.${exportType}`}
        getPremiumExportData={exportType !== "chart" ? async (version: ExportVersion) => {
          if (!financials || !properties || !global) return null;
          const py = global.projectionYears ?? PROJECTION_YEARS;
          const fsm = global.fiscalYearStartMonth ?? 1;
          const gfy = (i: number) => getFiscalYearForModelYear(global.modelStartDate, fsm, i);
          const summaryOnly = version === "short";
          const totalRooms = properties.reduce((sum, p) => sum + p.roomCount, 0);
          const mapRows = (d: { years: number[]; rows: any[] }) => ({
            years: d.years.map(String),
            rows: d.rows.map((r: any) => ({ category: r.category, values: r.values, indent: r.indent, isBold: r.isBold ?? r.isHeader, isHeader: r.isHeader, isItalic: r.isItalic, format: r.format })),
          });
          const baseMetrics = [
            { label: "Portfolio IRR", value: `${(financials.portfolioIRR * 100).toFixed(1)}%` },
            { label: "Equity Multiple", value: `${financials.equityMultiple.toFixed(2)}x` },
            { label: "Cash-on-Cash Return", value: `${financials.cashOnCash.toFixed(1)}%` },
            { label: "Total Properties", value: `${properties.filter(p => p.isActive !== false).length}` },
            { label: "Total Rooms", value: `${totalRooms}` },
          ];

          const incomeData = generatePortfolioIncomeData(financials.yearlyConsolidatedCache, py, gfy, summaryOnly);

          let statements: Array<{ title: string; years: string[]; rows: any[]; includeTable?: boolean; includeChart?: boolean }>;
          let statementType: string;

          if (activeTab === "overview") {
            statementType = "Portfolio Overview";
            const cfg = loadExportConfig().overview;
            const ovd = buildOverviewExportData(financials, properties, py, gfy);
            const yearStrs = ovd.yearLabels.map(String);
            statements = [];

            if (cfg.projectionTable || cfg.revenueChart) {
              statements.push({
                title: "Revenue & ANOI Projections",
                years: yearStrs,
                rows: [
                  { category: "Total Revenue", values: ovd.revenueNOIData.map(d => d.revenue), format: "currency" },
                  { category: "Net Operating Income", values: ovd.revenueNOIData.map(d => d.noi), format: "currency" },
                  { category: "Adjusted NOI", values: ovd.revenueNOIData.map(d => d.anoi), isBold: true, format: "currency" },
                  { category: "Cash Flow", values: ovd.revenueNOIData.map(d => d.cashFlow), format: "currency" },
                ],
                includeTable: cfg.projectionTable,
                includeChart: cfg.revenueChart,
              });
            }

            if (cfg.compositionTables) {
              const cs = ovd.capitalStructure;
              statements.push({
                title: "Portfolio & Capital Structure",
                years: ["Value"],
                rows: [
                  { category: "PORTFOLIO COMPOSITION", values: [0], isHeader: true },
                  { category: "Total Properties", values: [cs.totalProperties], indent: 1 },
                  { category: "Total Rooms", values: [cs.totalRooms], indent: 1 },
                  { category: "Avg Rooms / Property", values: [Math.round(cs.avgRoomsPerProperty)], indent: 1 },
                  { category: "Total Markets", values: [cs.totalMarkets], indent: 1 },
                  { category: "Avg ADR", values: [Math.round(cs.avgADR)], indent: 1, format: "currency" },
                  { category: "CAPITAL STRUCTURE", values: [0], isHeader: true },
                  { category: "Total Purchase Price", values: [cs.totalPurchasePrice], indent: 1, format: "currency" },
                  { category: "Avg Purchase Price", values: [cs.avgPurchasePrice], indent: 1, format: "currency" },
                  { category: "Avg Exit Cap Rate", values: [cs.avgExitCapRate * 100], indent: 1, format: "percentage" },
                  { category: "Hold Period", values: [cs.holdPeriod], indent: 1 },
                  { category: "ANOI Margin", values: [cs.anoiMargin], indent: 1, format: "percentage" },
                ],
              });
            }

            if (cfg.propertyInsights) {
              statements.push({
                title: "Property Insights",
                years: ["Market", "Rooms", "Status", "Acq. Cost", "ADR", "IRR"],
                rows: ovd.propertyItems.map(p => ({
                  category: p.name,
                  values: [p.market, p.rooms, p.status, p.acquisitionCost, p.adr, p.irr],
                })),
              });
            }

            if (cfg.compositionCharts) {
              const marketEntries = Object.entries(ovd.marketCounts);
              const statusEntries = Object.entries(ovd.statusCounts);
              if (marketEntries.length > 0) {
                statements.push({
                  title: "Market Distribution",
                  years: ["Count"],
                  rows: marketEntries.map(([mkt, cnt]) => ({ category: mkt, values: [cnt] })),
                });
              }
              if (statusEntries.length > 0) {
                statements.push({
                  title: "Status Distribution",
                  years: ["Count"],
                  rows: statusEntries.map(([st, cnt]) => ({ category: st, values: [cnt] })),
                });
              }
            }

            if (cfg.waterfallTable) {
              statements.push({
                title: "USALI Profit Waterfall",
                years: yearStrs,
                rows: ovd.waterfallRows.map(r => ({
                  category: r.label,
                  values: r.values,
                  isBold: r.isSubtotal,
                  format: "currency",
                })),
              });
            }

            if (cfg.aiInsights) {
              const ki = ovd.portfolioKPIs;
              const bestProp = ovd.propertyItems.reduce((a, b) => (a.irr > b.irr ? a : b), ovd.propertyItems[0]);
              const worstProp = ovd.propertyItems.reduce((a, b) => (a.irr < b.irr ? a : b), ovd.propertyItems[0]);
              statements.push({
                title: "Portfolio Analysis Insights",
                years: ["Value"],
                rows: [
                  { category: "Portfolio IRR", values: [ki.portfolioIRR], format: "percentage" },
                  { category: "Equity Multiple", values: [ki.equityMultiple] },
                  { category: "Cash-on-Cash Return", values: [ki.cashOnCash], format: "percentage" },
                  { category: "Total Initial Equity", values: [ki.totalInitialEquity], format: "currency" },
                  { category: "Total Exit Value", values: [ki.totalExitValue], format: "currency" },
                  ...(bestProp ? [{ category: "Top Performer", values: [`${bestProp.name} (${bestProp.irr.toFixed(1)}% IRR)`] }] : []),
                  ...(worstProp ? [{ category: "Lowest Performer", values: [`${worstProp.name} (${worstProp.irr.toFixed(1)}% IRR)`] }] : []),
                ],
              });
            }

            const kpis = ovd.portfolioKPIs;
            baseMetrics.push(
              { label: "Total Equity Invested", value: `$${(kpis.totalInitialEquity / 1e6).toFixed(1)}M` },
              { label: "Projected Exit Value", value: `$${(kpis.totalExitValue / 1e6).toFixed(1)}M` },
            );

            let chartScreenshots: PremiumExportPayload["chartScreenshots"];
            if (cfg.compositionCharts && tabContentRef.current) {
              try {
                chartScreenshots = await captureOverviewCharts(tabContentRef.current);
              } catch (err: unknown) {
                console.warn("[overview-export] Chart capture failed:", err);
              }
            }

            return {
              entityName: "Consolidated Portfolio",
              companyName: global.companyName || APP_BRAND_NAME,
              statementType,
              years: incomeData.years.map(String),
              statements,
              metrics: cfg.kpiMetrics ? baseMetrics : [],
              chartScreenshots,
              projectionYears: py,
              densePagination: cfg.densePagination,
              themeColors: branding?.themeColors?.map(c => ({ name: c.name, hexCode: c.hexCode, rank: c.rank, description: c.description })),
            } as PremiumExportPayload;
          } else if (activeTab === "investment") {
            statementType = "Investment Analysis";
            const investmentData = generatePortfolioInvestmentData(financials, properties, py, gfy, summaryOnly);
            statements = [
              { title: "Investment Analysis", ...mapRows(investmentData) },
            ];
          } else {
            statementType = "Financial Statements";
            const cashFlowData = generatePortfolioCashFlowData(financials.allPropertyYearlyCF, py, gfy, undefined, summaryOnly, undefined, financials.yearlyConsolidatedCache);
            const msd = global.modelStartDate ? new Date(global.modelStartDate) : undefined;
            const balanceSheetData = generatePortfolioBalanceSheetData(financials.allPropertyFinancials, py, gfy, msd, summaryOnly);
            statements = [
              { title: "Consolidated Income Statement", ...mapRows(incomeData) },
              { title: "Consolidated Cash Flow", ...mapRows(cashFlowData) },
              { title: "Consolidated Balance Sheet", ...mapRows(balanceSheetData) },
            ];
          }

          const shouldIncludeMetrics = activeTab === "overview" && loadExportConfig().overview.kpiMetrics;

          const exportCfg = loadExportConfig();
          const tabCfg = activeTab === "overview" ? exportCfg.overview : activeTab === "investment" ? exportCfg.analysis : exportCfg.statements;

          return {
            entityName: "Consolidated Portfolio",
            companyName: global.companyName || APP_BRAND_NAME,
            statementType,
            years: incomeData.years.map(String),
            statements,
            metrics: shouldIncludeMetrics ? baseMetrics : [],
            projectionYears: py,
            densePagination: tabCfg.densePagination,
            themeColors: branding?.themeColors?.map(c => ({ name: c.name, hexCode: c.hexCode, rank: c.rank, description: c.description })),
          } as PremiumExportPayload;
        } : undefined}
        serverExportConfig={exportType !== "chart" && (activeTab === "income" || activeTab === "cashflow") ? { entityType: "portfolio", reportScope: activeTab } : undefined}
      />
    </Layout>
  );
}
