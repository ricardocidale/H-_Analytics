import { useMemo, useState, useRef, lazy, Suspense } from "react";
import { DEPRECIATION_YEARS, USE_SERVER_COMPUTE, USE_SERVER_EXPORTS } from "@shared/constants";
import Layout from "@/components/Layout";
import { useProperty, useGlobalAssumptions } from "@/lib/api";
import { usePropertyPhotos } from "@/lib/api/property-photos";
import type { PropertyUrl } from "@shared/schema";
import { generatePropertyProForma, getFiscalYearForModelYear } from "@/lib/financialEngine";
import { ConsolidatedBalanceSheet } from "@/components/statements/ConsolidatedBalanceSheet";
import { CalcDetailsProvider } from "@/components/financial-table";
import { Tabs, TabsContent, CurrentThemeTab } from "@/components/ui/tabs";
import { Loader2 } from "@/components/icons/themed-icons";
import { IconAlertTriangle, IconIncomeStatement, IconCashFlow, IconBalanceSheet, IconPPE, IconBanknote, IconFileStack } from "@/components/icons";
import { ExportMenu, pdfAction, excelAction, csvAction, pptxAction, chartAction, pngAction, docxAction } from "@/components/ui/export-toolbar";
import { MONTHS_PER_YEAR } from "@/lib/constants";
import { calculateLoanParams, LoanParams, GlobalLoanParams, PROJECTION_YEARS } from "@/lib/financial/loanCalculations";
import { aggregateCashFlowByYear } from "@/lib/financial/cashFlowAggregator";
import { aggregatePropertyByYear } from "@/lib/financial/yearlyAggregator";
import { FinancialChart } from "@/components/ui/financial-chart";
import { Link, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExportDialog, type ExportVersion } from "@/components/ExportDialog";
import { loadExportConfig } from "@/lib/exportConfig";
import { useExportSave } from "@/hooks/useExportSave";
import { AnimatedPage, ScrollReveal } from "@/components/graphics";
import {
  PPECostBasisSchedule,
  IncomeStatementTab,
  CashFlowTab,
  PropertyHeader,
  BenchmarkPanel,
  ReconciliationTab,
} from "@/components/property-detail";
const PropertyMap = lazy(() => import("@/components/PropertyMap"));
import DocumentExtractionPanel from "@/components/DocumentExtractionPanel";
import {
  type PropertyExportContext,
  exportAllStatementsCSV,
  exportTablePNG,
  handleExport,
  buildPremiumExportPayload,
} from "@/lib/exports/propertyDetailExports";
import { fetchSinglePropertyCompute, buildPropertyQueryKey } from "@/hooks/useServerFinancials";

export default function PropertyDetail() {
  const [, params] = useRoute("/property/:id");
  const propertyId = params?.id ? parseInt(params.id) : 0;
  const [activeTab, setActiveTab] = useState("income");
  const queryClient = useQueryClient();
  const incomeChartRef = useRef<HTMLDivElement>(null);
  const cashFlowChartRef = useRef<HTMLDivElement>(null);
  const incomeTableRef = useRef<HTMLDivElement>(null);
  const cashFlowTableRef = useRef<HTMLDivElement>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportType, setExportType] = useState<"pdf" | "xlsx" | "pptx" | "docx" | "chart">("pdf");
  const [incomeAllExpanded, setIncomeAllExpanded] = useState(false);
  const { requestSave, SaveDialog } = useExportSave();
  
  const { data: property, isLoading: propertyLoading, isError: propertyError } = useProperty(propertyId);
  const { data: global, isLoading: globalLoading, isError: globalError } = useGlobalAssumptions();
  const { data: brandingData } = useQuery<{ themeColors: Array<{ rank: number; name: string; hexCode: string; description?: string }> | null }>({
    queryKey: ["my-branding"],
    queryFn: async () => { const res = await fetch("/api/my-branding", { credentials: "include" }); return res.json(); },
    staleTime: 5 * 60_000,
  });
  const { data: photos } = usePropertyPhotos(propertyId);
  const { data: propertyLinks = [] } = useQuery<PropertyUrl[]>({
    queryKey: ["propertyUrls", propertyId],
    queryFn: async () => {
      const res = await fetch(`/api/properties/${propertyId}/urls`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: propertyId > 0,
  });
  const heroCaption = useMemo(() => photos?.find(p => p.isHero)?.caption ?? undefined, [photos]);
  
  const handlePhotoUploadComplete = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/properties", propertyId] });
    queryClient.invalidateQueries({ queryKey: ["propertyPhotos", propertyId] });
  };

  const projectionYears = global?.projectionYears ?? PROJECTION_YEARS;
  const projectionMonths = projectionYears * MONTHS_PER_YEAR;
  const fiscalYearStartMonth = global?.fiscalYearStartMonth ?? 1;
  const getFiscalYear = (yearIndex: number) => global ? getFiscalYearForModelYear(global.modelStartDate, fiscalYearStartMonth, yearIndex) : 2026 + yearIndex;

  const { data: serverFinancials, isLoading: serverFinancialsLoading, isError: serverFinancialsError } = useQuery({
    queryKey: buildPropertyQueryKey(propertyId, property, global),
    queryFn: () => fetchSinglePropertyCompute(property!, global!),
    enabled: USE_SERVER_COMPUTE && !!property && !!global,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const clientFinancials = useMemo(
    () => (!USE_SERVER_COMPUTE && property && global) ? generatePropertyProForma(property, global, projectionMonths) : [],
    [property, global, projectionMonths]
  );

  const financials = USE_SERVER_COMPUTE ? (serverFinancials?.monthly ?? []) : clientFinancials;

  const years = projectionYears;
  const startYear = getFiscalYear(0);

  const cashFlowDataMemo = useMemo(() => {
    if (!property || !global || financials.length === 0) return [];
    return aggregateCashFlowByYear(financials, property as LoanParams, global as GlobalLoanParams, years);
  }, [financials, property, global, years]);

  // aggregatePropertyByYear is the single source of truth for yearly totals.
  // yearlyChartData derives from it — no re-reducing of monthly arrays.
  const yearlyDetails = useMemo(
    () => aggregatePropertyByYear(financials, years),
    [financials, years]
  );

  const yearlyChartData = useMemo(() =>
    yearlyDetails.map((d, y) => ({
      year:     String(getFiscalYear(y)),
      Revenue:  d.revenueTotal,
      GOP:      d.gop,
      AGOP:     d.agop,
      NOI:      d.noi,
      ANOI:     d.anoi,
      CashFlow: d.cashFlow,
    })),
  [yearlyDetails]);

  const balanceChartData = useMemo(() => {
    if (!property || !global || !yearlyChartData.length || !cashFlowDataMemo.length) return [];
    const loanProps = property as LoanParams;
    const loan = calculateLoanParams(loanProps, global as GlobalLoanParams);
    const totalCost = loanProps.purchasePrice + (loanProps.buildingImprovements ?? 0) + (loanProps.preOpeningCosts ?? 0);
    const depPerYear = totalCost > 0 ? totalCost / DEPRECIATION_YEARS : 0;
    let runCash = 0;
    let cumPrincipal = 0;
    return yearlyChartData.map((d, i) => {
      runCash += d.CashFlow;
      const nbv = Math.max(totalCost - depPerYear * (i + 1), 0);
      cumPrincipal += cashFlowDataMemo[i]?.principalPayment ?? 0;
      const loanBalance = Math.max(loan.loanAmount - cumPrincipal + (cashFlowDataMemo[i]?.refinancingProceeds ?? 0), 0);
      const totalAssets = runCash + nbv;
      const totalEquity = totalAssets - loanBalance;
      return { year: d.year, Assets: totalAssets, Liabilities: loanBalance, Equity: totalEquity };
    });
  }, [property, global, yearlyChartData, cashFlowDataMemo]);

  if (propertyLoading || globalLoading || (USE_SERVER_COMPUTE && serverFinancialsLoading)) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (propertyError || globalError || (USE_SERVER_COMPUTE && serverFinancialsError)) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
          <IconAlertTriangle className="w-8 h-8 text-destructive" />
          <p className="text-muted-foreground">Failed to load property data. Please try refreshing the page.</p>
        </div>
      </Layout>
    );
  }

  if (!property || !global) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
          <h2 className="text-2xl font-display">Property Not Found</h2>
          <Link href="/portfolio">
            <Button>Return to Portfolio</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  const exportCtx: PropertyExportContext = {
    property, global, yearlyDetails, cashFlowData: cashFlowDataMemo,
    yearlyChartData, years, startYear, projectionYears, projectionMonths,
    fiscalYearStartMonth, financials, activeTab, brandingData,
    incomeChartRef, cashFlowChartRef, incomeTableRef, cashFlowTableRef,
  };

  return (
    <Layout>
      <AnimatedPage>
      {SaveDialog}
      <ExportDialog
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
        onExport={(orientation, version, customFilename) => handleExport(exportCtx, exportType, orientation, version, customFilename)}
        title={exportType === "chart" ? "Export Chart" : `Export ${exportType.toUpperCase()}`}
        showVersionOption={exportType !== "chart"}
        allowShort={loadExportConfig().statements.allowShort}
        allowExtended={loadExportConfig().statements.allowExtended}
        premiumFormat={exportType === "chart" ? "pdf" : exportType as any}
        suggestedFilename={
          exportType === 'chart'
            ? `${property.name} Chart`
            : `${property.name} ${activeTab === "income" ? "Income Statement" : activeTab === "cashflow" ? "Cash Flow" : "Balance Sheet"}`
        }
        fileExtension={exportType === "chart" ? ".pdf" : `.${exportType}`}
        getPremiumExportData={exportType !== 'chart' && property && yearlyDetails.length > 0
          ? (version: ExportVersion) => buildPremiumExportPayload(exportCtx, version)
          : undefined}
        serverExportConfig={exportType !== 'chart' && (activeTab === "income" || activeTab === "cashflow") ? { entityType: "property", entityId: propertyId, reportScope: activeTab } : undefined}
      />
      <div className="space-y-6">
        <PropertyHeader
          property={property}
          propertyId={propertyId}
          heroCaption={heroCaption}
          onPhotoUploadComplete={handlePhotoUploadComplete}
        />

        {property.description && (
          <div className="rounded-lg border border-border bg-card shadow-sm p-5" data-testid="card-property-description">
            <p className="text-xs font-medium text-muted-foreground mb-2 label-text">Property Description</p>
            <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap" data-testid="text-full-description">
              {property.description}
            </p>
          </div>
        )}

        {propertyLinks.length > 0 && (
          <div className="flex flex-wrap gap-2" data-testid="property-links-chips">
            {propertyLinks.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors hover:shadow-sm ${
                  link.isValid === false
                    ? "border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10"
                    : link.isRelevant
                      ? "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
                      : "border-border bg-card text-foreground/70 hover:bg-muted"
                }`}
                data-testid={`link-chip-${link.id}`}
                title={link.url}
              >
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{
                  backgroundColor: link.isValid === false ? "var(--destructive)" : link.isRelevant ? "var(--primary)" : "var(--muted-foreground)",
                }} />
                {link.label || (() => { try { return new URL(link.url).hostname.replace("www.", ""); } catch { return "Link"; } })()}
              </a>
            ))}
          </div>
        )}

        <ScrollReveal>
          <Suspense fallback={<div className="flex items-center justify-center p-8 text-muted-foreground text-sm">Loading map…</div>}>
            <PropertyMap
              latitude={property.latitude}
              longitude={property.longitude}
              propertyName={property.name}
              propertyId={propertyId}
            />
          </Suspense>
        </ScrollReveal>

        <BenchmarkPanel
          property={property}
          yearlyChartData={yearlyChartData}
        />

        <ScrollReveal>
        <CalcDetailsProvider show={global?.showPropertyCalculationDetails ?? true}>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="mb-4">
            <CurrentThemeTab
              tabs={[
                { value: 'income', label: 'Income Statement', icon: IconIncomeStatement },
                { value: 'cashflow', label: 'Cash Flows', icon: IconCashFlow },
                { value: 'balance', label: 'Balance Sheet', icon: IconBalanceSheet },
                { value: 'ppe', label: 'PP&E / Cost Basis', icon: IconPPE },
                { value: 'reconciliation', label: 'Reconciliation', icon: IconBanknote },
                { value: 'documents', label: 'Documents', icon: IconFileStack }
              ]}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              rightContent={
                <ExportMenu
                  variant="light"
                  actions={[
                    pdfAction(() => { setExportType('pdf'); setExportDialogOpen(true); }),
                    excelAction(() => { setExportType('xlsx'); setExportDialogOpen(true); }),
                    csvAction(() => {
                      if (USE_SERVER_EXPORTS) {
                        requestSave(`${property.name} Financial Statements`, ".csv", async (customFilename) => {
                          const res = await fetch("/api/exports/generate", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            credentials: "include",
                            body: JSON.stringify({ entityType: "property", entityId: propertyId, format: "csv", version: "extended" }),
                          });
                          if (!res.ok) throw new Error("CSV export failed");
                          const blob = await res.blob();
                          const { saveFile } = await import("@/lib/exports/saveFile");
                          await saveFile(blob, customFilename || `${property.name}_Financial_Statements.csv`);
                        });
                      } else {
                        requestSave(`${property.name} Financial Statements`, ".csv", (f) => exportAllStatementsCSV(exportCtx, f));
                      }
                    }),
                    pptxAction(() => { setExportType('pptx'); setExportDialogOpen(true); }),
                    docxAction(() => { setExportType('docx'); setExportDialogOpen(true); }),
                    chartAction(() => { setExportType('chart'); setExportDialogOpen(true); }),
                    pngAction(() => requestSave(`${property.name} ${activeTab} Table`, ".png", (f) => exportTablePNG(exportCtx, 'landscape', f))),
                  ]}
                />
              }
            />
          </div>
          
          <TabsContent value="income" className="mt-6">
            <IncomeStatementTab
              yearlyChartData={yearlyChartData}
              yearlyDetails={yearlyDetails}
              financials={financials}
              property={property}
              global={global}
              projectionYears={projectionYears}
              startYear={startYear}
              incomeChartRef={incomeChartRef}
              incomeTableRef={incomeTableRef}
              incomeAllExpanded={incomeAllExpanded}
            />
          </TabsContent>
          
          <TabsContent value="cashflow" className="mt-6">
            <CashFlowTab
              yearlyChartData={yearlyChartData}
              cashFlowData={cashFlowDataMemo}
              yearlyDetails={yearlyDetails}
              financials={financials}
              property={property}
              global={global}
              projectionYears={projectionYears}
              startYear={startYear}
              cashFlowChartRef={cashFlowChartRef}
              cashFlowTableRef={cashFlowTableRef}
            />
          </TabsContent>

          <TabsContent value="balance" className="mt-6">
            <div className="space-y-6">
              {balanceChartData.length > 0 && (
                <FinancialChart
                  data={balanceChartData}
                  series={[
                    { dataKey: "Assets", name: "Total Assets", color: "hsl(var(--line-1))" },
                    { dataKey: "Liabilities", name: "Total Liabilities", color: "hsl(var(--line-2))" },
                    { dataKey: "Equity", name: "Total Equity", color: "hsl(var(--line-3))" },
                  ]}
                  title={`${property.name} Balance Sheet Trends (${projectionYears}-Year Projection)`}
                  id="property-balance-chart"
                />
              )}
              <ConsolidatedBalanceSheet
                properties={[property]}
                global={global}
                allProFormas={[{ property, data: financials }]}
                year={projectionYears}
                propertyIndex={0}
              />
            </div>
          </TabsContent>

          <TabsContent value="ppe" className="mt-6">
            <PPECostBasisSchedule property={property} global={global} />
          </TabsContent>

          <TabsContent value="reconciliation" className="mt-6">
            <ReconciliationTab
              propertyId={propertyId}
              financials={financials}
              startYear={startYear}
              projectionYears={projectionYears}
            />
          </TabsContent>

          <TabsContent value="documents" className="mt-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <DocumentExtractionPanel propertyId={propertyId} />
            </div>
          </TabsContent>
        </Tabs>
        </CalcDetailsProvider>
        </ScrollReveal>
      </div>
      </AnimatedPage>
    </Layout>
  );
}
