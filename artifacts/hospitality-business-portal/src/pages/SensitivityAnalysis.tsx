import { useState, useMemo, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import Layout from "@/components/Layout";
import { useProperties, useGlobalAssumptions } from "@/lib/api";
import { generatePropertyProForma } from "@/lib/financialEngine";
import { PROJECTION_YEARS, DEFAULT_EXIT_CAP_RATE, DEFAULT_COST_RATE_INSURANCE, MONTHS_PER_YEAR } from "@/lib/constants";
import { getFactoryNumber } from "@shared/model-constants-registry";
import { computeIRR } from "@analytics/returns/irr.js";
import { propertyEquityInvested } from "@/lib/financial/equityCalculations";
import { aggregateUnifiedByYear } from "@/lib/financial/yearlyAggregator";
import type { LoanParams, GlobalLoanParams } from "@/lib/financial/loanCalculations";
import type { SensitivityResponse } from "@shared/sensitivity-types";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Loader2 } from "@/components/icons/themed-icons";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { AnimatedPage, InsightPanel, type Insight } from "@/components/graphics";
import { VariableSlidersPanel, TornadoChartPanel, SensitivityComparisonTable, KPISummaryStrip, HeatMapSection, TornadoD3Section, BreakevenTargetsPanel, useSensitivityExports, type SensitivityVariable, type ScenarioResult, type TornadoItem } from "@/components/sensitivity";
import { ExportMenu, pdfAction, excelAction, csvAction, pptxAction, chartAction, pngAction } from "@/components/ui/export-toolbar";
import { ExportDialog } from "@/components/ExportDialog";
import { useExportSave } from "@/hooks/useExportSave";
import type { HeatMapCell } from "@/components/charts/SensitivityHeatMap";
import type { TornadoVariable, TornadoDiagramRef } from "@/components/charts/TornadoDiagram";
import type { SensitivityHeatMapRef } from "@/components/charts/SensitivityHeatMap";


export default function SensitivityAnalysis({ embedded }: { embedded?: boolean }) {
  const { data: properties, isLoading: propertiesLoading } = useProperties();
  const { data: global, isLoading: globalLoading } = useGlobalAssumptions();
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("all");
  const [adjustments, setAdjustments] = useState<Record<string, number>>({});
  const [tornadoMetric, setTornadoMetric] = useState<"noi" | "irr">("irr");
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportType, setExportType] = useState<"pdf" | "chart">("pdf");
  const [advancedChartView, setAdvancedChartView] = useState<"sliders" | "heatmap" | "tornado-d3">("sliders");
  const { requestSave, SaveDialog } = useExportSave();
  const [heatMapMetric, setHeatMapMetric] = useState<"irr" | "noi" | "equityMultiple">("irr");

  const chartRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const tornadoD3Ref = useRef<TornadoDiagramRef>(null);
  const heatmapRef = useRef<SensitivityHeatMapRef>(null);

  const projectionYears = global?.projectionYears ?? PROJECTION_YEARS;
  const projectionMonths = projectionYears * MONTHS_PER_YEAR;

  const variables: SensitivityVariable[] = useMemo(() => {
    if (!global) return [];
    return [
      { id: "occupancy", label: "Max Occupancy", unit: "%", step: 1, range: [-20, 20], defaultValue: 0, description: "Adjust maximum occupancy rate up or down" },
      { id: "adrGrowth", label: "ADR Growth Rate", unit: "%", step: 0.5, range: [-5, 5], defaultValue: 0, description: "Adjust annual ADR growth rate" },
      { id: "expenseGrowth", label: "Expense Escalation", unit: "%", step: 0.5, range: [-3, 5], defaultValue: 0, description: "Adjust fixed cost escalation rate", tooltip: "Impacts properties using default inflation" },
      { id: "exitCapRate", label: "Exit Cap Rate", unit: "%", step: 0.25, range: [-3, 3], defaultValue: 0, description: "Adjust exit cap rate", tooltip: "Higher value = lower property valuation" },
      { id: "inflation", label: "Inflation Rate", unit: "%", step: 0.5, range: [-3, 5], defaultValue: 0, description: "Adjust general inflation rate", tooltip: "Impacts properties using default inflation" },
      { id: "interestRate", label: "Interest Rate", unit: "%", step: 0.25, range: [-3, 5], defaultValue: 0, description: "Adjust debt financing interest rate" },
      { id: "insuranceRate", label: "Insurance Rate", unit: "%", step: 0.25, range: [-1, 3], defaultValue: 0, description: "Adjust property insurance cost rate", tooltip: "Percentage of total property value charged annually for insurance" },
    ];
  }, [global]);

  const resetAll = useCallback(() => setAdjustments({}), []);

  const runScenario = useCallback(
    (overrides: Record<string, number>): ScenarioResult | null => {
      if (!properties || !global) return null;
      const activeProps = properties.filter(p => p.isActive !== false);
      const targetProps =
        selectedPropertyId === "all"
          ? activeProps
          : activeProps.filter((p) => String(p.id) === selectedPropertyId);
      if (!targetProps.length) return null;

      let totalRevenue = 0;
      let totalNOI = 0;
      let totalCashFlow = 0;
      let totalExitValue = 0;
      let totalInitialEquity = 0;
      // N-element convention: equity is deducted in the acquisition year,
      // exit is added in the final year — matches server sensitivity.ts exactly.
      const netFlowsByYear: number[] = new Array(projectionYears).fill(0);

      for (const prop of targetProps) {
        const baseInterestRate = prop.acquisitionInterestRate ?? global.debtAssumptions?.interestRate ?? 0.065;
        const baseCapRate = prop.exitCapRate ?? global.exitCapRate ?? DEFAULT_EXIT_CAP_RATE;
        const adjCapRate = Math.max(0.01, baseCapRate + (overrides.exitCapRate ?? 0) / 100);

        const adjProp = {
          ...prop,
          maxOccupancy: Math.min(1, Math.max(0.1, prop.maxOccupancy + (overrides.occupancy ?? 0) / 100)),
          startOccupancy: Math.min(
            Math.min(1, Math.max(0.1, prop.maxOccupancy + (overrides.occupancy ?? 0) / 100)),
            prop.startOccupancy
          ),
          adrGrowthRate: Math.max(0, prop.adrGrowthRate + (overrides.adrGrowth ?? 0) / 100),
          acquisitionInterestRate: Math.max(0.005, baseInterestRate + (overrides.interestRate ?? 0) / 100),
          costRateInsurance: Math.max(0, (prop.costRateInsurance ?? DEFAULT_COST_RATE_INSURANCE) + (overrides.insuranceRate ?? 0) / 100),
          // Stamp adjusted exit cap rate so aggregateUnifiedByYear picks it up
          exitCapRate: adjCapRate,
        };

        const adjGlobal = {
          ...global,
          inflationRate: Math.max(0, global.inflationRate + (overrides.inflation ?? 0) / 100),
          fixedCostEscalationRate: Math.max(
            0,
            (global.fixedCostEscalationRate ?? getFactoryNumber('inflationRate')) + (overrides.expenseGrowth ?? 0) / 100
          ),
        };

        const financials = generatePropertyProForma(adjProp, adjGlobal, projectionMonths);

        for (const m of financials) {
          totalRevenue += m.revenueTotal;
          totalNOI += m.noi;
          totalCashFlow += m.cashFlow;
        }

        // Canonical aggregator: handles NOI annualization for exit, equity
        // placement at acquisition year, and refinancing proceeds — matching
        // the server sensitivity.ts implementation exactly.
        const unified = aggregateUnifiedByYear(
          financials,
          adjProp as unknown as LoanParams,
          adjGlobal as unknown as GlobalLoanParams,
          projectionYears,
        );
        for (let y = 0; y < projectionYears; y++) {
          netFlowsByYear[y] += unified.yearlyCF[y]?.netCashFlowToInvestors ?? 0;
        }
        totalExitValue += unified.yearlyCF[projectionYears - 1]?.exitValue ?? 0;

        totalInitialEquity += propertyEquityInvested(prop);
      }

      const irrResult = totalInitialEquity > 0 ? computeIRR(netFlowsByYear, 1) : null;
      const irr = irrResult?.irr_periodic ?? 0;
      const avgNOIMargin = totalRevenue > 0 ? (totalNOI / totalRevenue) * 100 : 0;
      // netFlowsByYear has equity deducted at acquisition; adding it back gives
      // gross distributions. Matches server sensitivity.ts equity multiple formula.
      const totalCashReturned = netFlowsByYear.reduce((s, v) => s + v, 0);
      const equityMultipleValue = totalInitialEquity > 0
        ? (totalCashReturned + totalInitialEquity) / totalInitialEquity
        : 0;
      return { totalRevenue, totalNOI, totalCashFlow, avgNOIMargin, exitValue: totalExitValue, irr, equityMultipleValue };
    },
    [properties, global, selectedPropertyId, projectionMonths, projectionYears]
  );

  // ── Interactive (2 client runs — must stay client-side for slider responsiveness) ──
  const baseResult = useMemo(() => runScenario({}), [runScenario]);
  const adjustedResult = useMemo(() => runScenario(adjustments), [runScenario, adjustments]);

  // ── Server-side static analysis (39 runs: 14 tornado + 25 heatmap) ────────────
  // Runs once on page load. Client keeps only the 2 interactive slider runs above.
  const propertyIdParam = selectedPropertyId === "all" ? "all" : Number(selectedPropertyId);
  const { data: serverData, isLoading: _serverLoading } = useQuery<SensitivityResponse>({
    queryKey: ["sensitivity", propertyIdParam],
    queryFn: async () => {
      const res = await fetch("/api/finance/sensitivity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ propertyId: propertyIdParam }),
      });
      if (!res.ok) throw new Error(`Sensitivity compute failed: ${res.status}`);
      return res.json();
    },
    enabled: !!(properties?.length) && !!global,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // ── Tornado data — server-first, client fallback ───────────────────────────────
  // Client fallback uses a shared tornadoScenarios base to avoid running each
  // variable twice (was 28 runs, now 14 for the fallback path).
  const tornadoScenarios = useMemo(() => {
    if (serverData || !baseResult || !variables.length) return [];
    return variables.map(v => {
      const swingPct = v.id === "exitCapRate" ? 2 : v.id === "occupancy" ? 10 : v.id === "interestRate" ? 2 : 3;
      return {
        v,
        swingPct,
        upResult:   runScenario({ [v.id]: swingPct }),
        downResult: runScenario({ [v.id]: -swingPct }),
      };
    }).filter(s => s.upResult && s.downResult);
  }, [serverData, baseResult, variables, runScenario]);

  const tornadoData: TornadoItem[] = useMemo(() => {
    if (serverData) {
      return serverData.tornado.map(t => ({
        name:     t.name,
        positive: tornadoMetric === "irr" ? t.irrPositive : t.noiPositive,
        negative: tornadoMetric === "irr" ? t.irrNegative : t.noiNegative,
        spread:   tornadoMetric === "irr" ? t.irrSpread   : t.noiSpread,
        upLabel:   t.upLabel,
        downLabel: t.downLabel,
      }));
    }
    if (!baseResult || !tornadoScenarios.length) return [];
    return tornadoScenarios.map(({ v, swingPct, upResult, downResult }) => {
      const up = upResult!; const dn = downResult!;
      let upDelta: number, downDelta: number;
      if (tornadoMetric === "irr") {
        upDelta   = (up.irr - baseResult.irr) * 100;
        downDelta = (dn.irr - baseResult.irr) * 100;
      } else {
        const base = Math.abs(baseResult.totalNOI) || 1;
        upDelta   = ((up.totalNOI - baseResult.totalNOI) / base) * 100;
        downDelta = ((dn.totalNOI - baseResult.totalNOI) / base) * 100;
      }
      return {
        name:     v.label,
        positive: Math.max(upDelta, downDelta),
        negative: Math.min(upDelta, downDelta),
        spread:   Math.abs(upDelta - downDelta),
        upLabel:   `+${swingPct}${v.unit === "%" ? "pp" : ""}`,
        downLabel: `-${swingPct}${v.unit === "%" ? "pp" : ""}`,
      };
    }).sort((a, b) => b.spread - a.spread);
  }, [serverData, baseResult, tornadoScenarios, tornadoMetric]);

  // ── Heatmap — server-first, client fallback ────────────────────────────────────
  const heatMapData = useMemo((): { cells: HeatMapCell[]; rowLabels: string[]; colLabels: string[] } => {
    if (serverData) {
      return {
        rowLabels: serverData.heatmap.rowLabels,
        colLabels: serverData.heatmap.colLabels,
        cells: serverData.heatmap.cells.map(c => {
          const value =
            heatMapMetric === "irr"            ? c.irrValue :
            heatMapMetric === "noi"            ? c.noiValue :
            c.equityMultipleValue;
          return {
            row: c.row, col: c.col,
            rowLabel: c.rowLabel, colLabel: c.colLabel,
            value,
            // Audit Task #967 — equity-multiple "passes" means MOIC ≥ 1.0×
            // (investor at least gets their equity back). IRR uses the
            // 15 % hurdle and NOI uses positive cash.
            passes:
              heatMapMetric === "irr"            ? value >= 0.15 :
              heatMapMetric === "equityMultiple" ? value >= 1.0  :
              value > 0,
          };
        }),
      };
    }
    if (!baseResult || !properties?.length || !global) return { cells: [], rowLabels: [], colLabels: [] };
    const occupancyShocks = [-10, -5, 0, 5, 10];
    const adrShocks       = [-10, -5, 0, 5, 10];
    const rowLabels = occupancyShocks.map(s => `${s >= 0 ? "+" : ""}${s}% Occ`);
    const colLabels = adrShocks.map(s => `${s >= 0 ? "+" : ""}${s}% ADR`);
    const cells: HeatMapCell[] = [];
    for (let ri = 0; ri < occupancyShocks.length; ri++) {
      for (let ci = 0; ci < adrShocks.length; ci++) {
        const result = runScenario({ occupancy: occupancyShocks[ri], adrGrowth: adrShocks[ci] / 2 });
        let value = 0;
        if (result) {
          if (heatMapMetric === "irr") value = result.irr;
          else if (heatMapMetric === "noi") value = result.totalNOI;
          // Audit Task #967 — read true MOIC from runScenario instead of
          // computing NOI margin (totalNOI / totalRevenue) inline. Matches
          // the server heatmap loop in `finance/sensitivity.ts`.
          else value = result.equityMultipleValue;
        }
        cells.push({
          row: ri, col: ci,
          rowLabel: rowLabels[ri], colLabel: colLabels[ci],
          value,
          // Audit Task #967 — equity-multiple "passes" means MOIC ≥ 1.0×.
          passes:
            heatMapMetric === "irr"            ? value >= 0.15 :
            heatMapMetric === "equityMultiple" ? value >= 1.0  :
            value > 0,
        });
      }
    }
    return { cells, rowLabels, colLabels };
  }, [serverData, baseResult, properties, global, runScenario, heatMapMetric]);

  // ── TornadoD3 — derived from server or shared tornadoScenarios (zero extra runs) ─
  const tornadoD3Data = useMemo((): { variables: TornadoVariable[]; baseValue: number } => {
    if (serverData) {
      return {
        baseValue: tornadoMetric === "irr" ? serverData.base.irr : serverData.base.totalNOI,
        variables: serverData.tornadoVariables.map(tv => ({
          name:          tv.name,
          upside:        tornadoMetric === "irr" ? tv.upsideIrr   : tv.upsideNoi,
          downside:      tornadoMetric === "irr" ? tv.downsideIrr : tv.downsideNoi,
          upsideLabel:   tv.upsideLabel,
          downsideLabel: tv.downsideLabel,
        })),
      };
    }
    if (!baseResult || !tornadoScenarios.length) return { variables: [], baseValue: 0 };
    return {
      baseValue: tornadoMetric === "irr" ? baseResult.irr : baseResult.totalNOI,
      variables: tornadoScenarios.map(({ v, swingPct, upResult, downResult }) => ({
        name:          v.label,
        upside:        tornadoMetric === "irr" ? upResult!.irr        : upResult!.totalNOI,
        downside:      tornadoMetric === "irr" ? downResult!.irr      : downResult!.totalNOI,
        upsideLabel:   `+${swingPct}${v.unit === "%" ? "pp" : ""}`,
        downsideLabel: `-${swingPct}${v.unit === "%" ? "pp" : ""}`,
      })),
    };
  }, [serverData, baseResult, tornadoScenarios, tornadoMetric]);

  const hasAdjustments = Object.values(adjustments).some((v) => v !== 0);

  const {
    handleExportPDF,
    handleExportExcel,
    handleExportCSV,
    handleExportPPTX,
    handleExportChart,
    handleExportPNG,
  } = useSensitivityExports({
    baseResult,
    adjustedResult,
    tornadoData,
    tornadoMetric,
    advancedChartView,
    chartRef,
    tableRef,
    heatmapRef,
    tornadoD3Ref,
  });

  const handleExport = useCallback((orientation: "landscape" | "portrait", _version?: unknown, customFilename?: string) => {
    if (exportType === "pdf") handleExportPDF(orientation, customFilename);
    else handleExportChart(orientation, customFilename);
  }, [exportType, handleExportPDF, handleExportChart]);

  const Wrapper = embedded ? ({ children }: { children: React.ReactNode }) => <>{children}</> : Layout;

  if (propertiesLoading || globalLoading) {
    return (
      <Wrapper>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-accent-pop" data-testid="loading-spinner" />
        </div>
      </Wrapper>
    );
  }

  if (!properties?.length || !global) {
    return (
      <Wrapper>
        <PageHeader title="Sensitivity Analysis" subtitle="Add properties to your portfolio first" />
      </Wrapper>
    );
  }

  const sensitivityInsights: Insight[] = (() => {
    if (!tornadoData.length || !baseResult) return [];
    const insights: Insight[] = [];
    const topVar = tornadoData[0];
    if (topVar) {
      insights.push({
        text: `${topVar.name} has the largest impact on ${tornadoMetric === "irr" ? "IRR" : "NOI"} with a spread of ${topVar.spread.toFixed(1)}${tornadoMetric === "irr" ? "pp" : "%"}`,
        type: "warning",
        metric: `±${(topVar.spread / 2).toFixed(1)}${tornadoMetric === "irr" ? "pp" : ""}`,
      });
    }
    if (baseResult.irr > 0.15) {
      insights.push({ text: `Base case IRR of ${(baseResult.irr * 100).toFixed(1)}% exceeds typical institutional hurdle rates`, type: "positive" });
    } else if (baseResult.irr > 0) {
      insights.push({ text: `Base case IRR is ${(baseResult.irr * 100).toFixed(1)}%`, type: "neutral" });
    }
    if (baseResult.avgNOIMargin > 30) {
      insights.push({ text: `Strong NOI margin at ${baseResult.avgNOIMargin.toFixed(1)}% indicates healthy operations`, type: "positive" });
    }
    return insights;
  })();

  const exportMenuNode = (
    <ExportMenu
      variant="light"
      actions={[
        pdfAction(() => { setExportType("pdf"); setExportDialogOpen(true); }),
        excelAction(() => requestSave("Sensitivity Analysis", ".xlsx", (f) => handleExportExcel(f))),
        csvAction(() => requestSave("Sensitivity Analysis", ".csv", (f) => handleExportCSV(f))),
        pptxAction(() => requestSave("Sensitivity Analysis", ".pptx", (f) => handleExportPPTX(f))),
        chartAction(() => { setExportType("chart"); setExportDialogOpen(true); }),
        pngAction(() => requestSave("Sensitivity Analysis", ".png", (f) => handleExportPNG(f))),
      ]}
    />
  );

  return (
    <Wrapper>
      <AnimatedPage>
        <div className="space-y-6">
          {!embedded && (
            <PageHeader
              title="Sensitivity Analysis"
              subtitle="Stress test your portfolio against shifting market conditions and operational variables"
              actions={
                <div className="flex items-center gap-3">
                  <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
                    <SelectTrigger className="w-[200px] bg-card border-border text-foreground rounded-lg text-sm" data-testid="select-property">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Properties</SelectItem>
                      {properties.filter(p => p.isActive !== false).map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {exportMenuNode}
                </div>
              }
            />
          )}

          {baseResult && adjustedResult && (
            <KPISummaryStrip
              baseResult={baseResult}
              adjustedResult={adjustedResult}
              hasAdjustments={hasAdjustments}
              onReset={resetAll}
            />
          )}

          <div className="flex bg-muted/50 p-1 rounded-lg border border-border w-fit mb-4">
            <Button
              variant={advancedChartView === "sliders" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setAdvancedChartView("sliders")}
              className={`px-3 py-1.5 text-xs font-semibold ${advancedChartView === "sliders" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
              data-testid="button-view-sliders"
            >
              Variable Sliders
            </Button>
            <Button
              variant={advancedChartView === "heatmap" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setAdvancedChartView("heatmap")}
              className={`px-3 py-1.5 text-xs font-semibold ${advancedChartView === "heatmap" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
              data-testid="button-view-heatmap"
            >
              Sensitivity Heat Map
            </Button>
            <Button
              variant={advancedChartView === "tornado-d3" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setAdvancedChartView("tornado-d3")}
              className={`px-3 py-1.5 text-xs font-semibold ${advancedChartView === "tornado-d3" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
              data-testid="button-view-tornado-d3"
            >
              Tornado Diagram
            </Button>
          </div>

          {advancedChartView === "sliders" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-4">
                <VariableSlidersPanel
                  variables={variables}
                  adjustments={adjustments}
                  onAdjustmentChange={(id, value) => setAdjustments(prev => ({ ...prev, [id]: value }))}
                />
              </div>

              <div className="lg:col-span-8 space-y-8">
                <div ref={chartRef}>
                  <TornadoChartPanel
                    tornadoData={tornadoData}
                    tornadoMetric={tornadoMetric}
                    onMetricChange={setTornadoMetric}
                  />
                </div>

                <div ref={tableRef}>
                  <SensitivityComparisonTable baseResult={baseResult!} adjustedResult={adjustedResult!} />
                </div>
              </div>
            </div>
          )}

          {advancedChartView === "heatmap" && (
            <HeatMapSection
              heatmapRef={heatmapRef}
              heatMapMetric={heatMapMetric}
              onMetricChange={setHeatMapMetric}
              cells={heatMapData.cells}
              rowLabels={heatMapData.rowLabels}
              colLabels={heatMapData.colLabels}
            />
          )}

          {advancedChartView === "tornado-d3" && (
            <TornadoD3Section
              tornadoD3Ref={tornadoD3Ref}
              tornadoMetric={tornadoMetric}
              onMetricChange={setTornadoMetric}
              variables={tornadoD3Data.variables}
              baseValue={tornadoD3Data.baseValue}
            />
          )}

          {serverData?.breakeven && (
            <BreakevenTargetsPanel bundle={serverData.breakeven} />
          )}

          <InsightPanel insights={sensitivityInsights} />
        </div>
      </AnimatedPage>

      {SaveDialog}
      <ExportDialog
        open={exportDialogOpen}
        onClose={() => setExportDialogOpen(false)}
        onExport={handleExport}
        title={exportType === "pdf" ? "Export Sensitivity Analysis" : "Export Tornado Chart"}
        suggestedFilename={exportType === "pdf" ? "Sensitivity Analysis" : "Sensitivity Tornado Chart"}
        fileExtension=".pdf"
      />
    </Wrapper>
  );
}
